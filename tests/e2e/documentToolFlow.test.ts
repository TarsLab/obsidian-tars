/**
 * E2E Tests: Document → Tool Flow
 *
 * Tests the complete flow:
 * 1. User writes code block in Obsidian document
 * 2. Parser extracts tool invocation
 * 3. Tool executes via MCP server
 * 4. Result is returned
 * 5. Tools available to LLM providers
 */

import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
	buildAIToolContext,
	type CodeBlockProcessor,
	createCodeBlockProcessor,
	createMCPManager,
	createToolExecutor,
	// DeploymentType, // Removed in simplification
	formatToolsForSystemMessage,
	type MCPServerManager,
	ToolExecutor,
	TransportProtocol
} from '../../src/mcp'

// Mock mcp-use with realistic tools
vi.mock('mcp-use', () => {
	const weatherTool = {
		name: 'get_weather',
		description: 'Get current weather for a location',
		inputSchema: {
			type: 'object',
			properties: {
				location: { type: 'string', description: 'City name' },
				units: { type: 'string', enum: ['celsius', 'fahrenheit'] }
			},
			required: ['location']
		}
	}

	const searchTool = {
		name: 'search_web',
		description: 'Search the web for information',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Search query' },
				num_results: { type: 'number', description: 'Number of results' }
			},
			required: ['query']
		}
	}

	const mockSession = {
		isConnected: true,
		connector: {
			tools: [weatherTool, searchTool],
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			callTool: vi.fn((toolName: string, args: any) => {
				if (toolName === 'get_weather') {
					return Promise.resolve({
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									location: args.location,
									temperature: 22,
									conditions: 'Sunny',
									units: args.units || 'celsius'
								})
							}
						]
					})
				}
				if (toolName === 'search_web') {
					return Promise.resolve({
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									query: args.query,
									results: [
										{ title: 'Result 1', url: 'https://example.com/1' },
										{ title: 'Result 2', url: 'https://example.com/2' }
									]
								})
							}
						]
					})
				}
				return Promise.reject(new Error('Unknown tool'))
			})
		},
		connect: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn().mockResolvedValue(undefined),
		initialize: vi.fn().mockResolvedValue(undefined)
	}

	return {
		MCPClient: {
			fromDict: vi.fn(() => ({
				createSession: vi.fn().mockResolvedValue(mockSession),
				getSession: vi.fn().mockReturnValue(mockSession),
				closeSession: vi.fn().mockResolvedValue(undefined),
				closeAllSessions: vi.fn().mockResolvedValue(undefined)
			}))
		},
		MCPSession: vi.fn(() => mockSession)
	}
})

describe('E2E: Document → Tool Execution Flow', () => {
	let manager: MCPServerManager
	let executor: ToolExecutor
	let processor: CodeBlockProcessor

	beforeAll(async () => {
		// Initialize components
		manager = createMCPManager()
		executor = createToolExecutor(manager)
		processor = createCodeBlockProcessor()

		// Configure MCP servers
		const serverConfigs = [
			{
				id: 'weather-service',
				name: 'Weather Service',
				configInput: 'docker run -i --rm --name tars-weather mcp/weather:latest',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			},
			{
				id: 'search-service',
				name: 'Search Service',
				configInput: 'docker run -i --rm --name tars-search mcp/search:latest',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			}
		]

		await manager.initialize(serverConfigs)
		processor.updateServerConfigs(serverConfigs)
	})

	describe('User writes code block → Tool executes', () => {
		it('should parse and execute weather tool from markdown code block', async () => {
			// GIVEN: User writes this in Obsidian document
			const markdownCodeBlock = `tool: get_weather
location: Tokyo
units: celsius`

			// WHEN: Parse the code block (language parameter is the server NAME, not ID)
			const invocation = processor.parseToolInvocation(markdownCodeBlock, 'Weather Service')

			// THEN: Tool invocation is correctly parsed
			expect(invocation).toEqual({
				serverId: 'weather-service',
				toolName: 'get_weather',
				parameters: {
					location: 'Tokyo',
					units: 'celsius'
				}
			})

			// WHEN: Execute the tool
			const result = await executor.executeTool({
				serverId: invocation?.serverId,
				toolName: invocation?.toolName,
				parameters: invocation?.parameters,
				source: 'user-codeblock',
				documentPath: 'daily-notes/2025-10-01.md'
			})

			// THEN: Result contains weather data
			expect(result.content).toBeDefined()
			expect(result.executionDuration).toBeGreaterThanOrEqual(0)

			// biome-ignore lint/suspicious/noExplicitAny: test assertion
			const weatherData = JSON.parse((result.content as any)[0].text)
			expect(weatherData.location).toBe('Tokyo')
			expect(weatherData.temperature).toBe(22)
			expect(weatherData.conditions).toBe('Sunny')
		})

		it('should handle search tool with multiple parameters', async () => {
			// GIVEN: User wants to search
			const codeBlock = `tool: search_web
query: best restaurants in Tokyo
num_results: 5`

			// WHEN: Parse and execute
			const invocation = processor.parseToolInvocation(codeBlock, 'Search Service')
			const result = await executor.executeTool({
				serverId: invocation?.serverId,
				toolName: invocation?.toolName,
				parameters: invocation?.parameters,
				source: 'user-codeblock',
				documentPath: 'research/tokyo-travel.md'
			})

			// THEN: Search results returned
			// biome-ignore lint/suspicious/noExplicitAny: test assertion
			const searchData = JSON.parse((result.content as any)[0].text)
			expect(searchData.query).toBe('best restaurants in Tokyo')
			expect(searchData.results).toHaveLength(2)
		})

		it('should track execution statistics', async () => {
			// GIVEN: Existing executions across various documents
			const initialCount = executor.getTotalSessionCount('test.md')

			// WHEN: Execute a tool for the target document
			const invocation = processor.parseToolInvocation('tool: get_weather\nlocation: Paris', 'Weather Service')

			await executor.executeTool({
				serverId: invocation?.serverId,
				toolName: invocation?.toolName,
				parameters: invocation?.parameters,
				source: 'user-codeblock',
				documentPath: 'test.md'
			})

			// THEN: Document-specific stats are updated without affecting other files
			const newCount = executor.getTotalSessionCount('test.md')
			expect(newCount).toBe(initialCount + 1)
			const newStats = executor.getStats()
			expect(newStats.totalExecuted).toBe(newCount)
			expect(newStats.activeExecutions).toBe(0)
			expect(newStats.currentDocumentPath).toBe('test.md')
		})
	})

	describe('Tools available to LLM Providers', () => {
		it('should format tools for AI context', async () => {
			// GIVEN: MCP servers with tools

			// WHEN: Build AI tool context
			const toolContext = await buildAIToolContext(manager, executor)

			// THEN: Tools are formatted correctly (2 servers × 2 tools each = 4)
			expect(toolContext.tools).toHaveLength(4)

			const weatherTool = toolContext.tools.find((t) => t.toolName === 'get_weather')
			expect(weatherTool).toEqual({
				serverId: 'weather-service',
				serverName: 'Weather Service',
				toolName: 'get_weather',
				description: 'Get current weather for a location',
				inputSchema: {
					type: 'object',
					properties: {
						location: { type: 'string', description: 'City name' },
						units: { type: 'string', enum: ['celsius', 'fahrenheit'] }
					},
					required: ['location']
				}
			})
		})

		it('should create system message with tool descriptions', async () => {
			// GIVEN: Available tools
			const toolContext = await buildAIToolContext(manager, executor)

			// WHEN: Format for system message
			const systemMessage = formatToolsForSystemMessage(toolContext)

			// THEN: System message includes all tools
			expect(systemMessage).toContain('get_weather')
			expect(systemMessage).toContain('Get current weather')
			expect(systemMessage).toContain('search_web')
			expect(systemMessage).toContain('Search the web')
			expect(systemMessage).toContain('location')
			expect(systemMessage).toContain('query')
		})

		it('should provide tool metadata for LLM to use', async () => {
			// GIVEN: LLM needs to know what tools are available
			const toolContext = await buildAIToolContext(manager, executor)

			// THEN: Each tool has complete metadata
			toolContext.tools.forEach((tool) => {
				expect(tool.toolName).toBeDefined()
				expect(tool.description).toBeDefined()
				expect(tool.inputSchema).toBeDefined()
				expect(tool.serverId).toBeDefined()

				// Verify schema structure for LLM
				expect(tool.inputSchema.type).toBe('object')
				expect(tool.inputSchema.properties).toBeDefined()
			})
		})
	})

	describe('AI-initiated tool execution', () => {
		it('should execute tool when AI decides to use it', async () => {
			// GIVEN: AI wants to get weather (autonomous execution)
			const aiToolCall = {
				serverId: 'weather-service',
				toolName: 'get_weather',
				parameters: {
					location: 'London',
					units: 'fahrenheit'
				}
			}

			// WHEN: Execute tool on behalf of AI
			const result = await executor.executeTool({
				serverId: aiToolCall.serverId,
				toolName: aiToolCall.toolName,
				parameters: aiToolCall.parameters,
				source: 'ai-autonomous',
				documentPath: 'ai-conversation.md',
				sectionLine: 42
			})

			// THEN: Tool executes successfully
			expect(result.content).toBeDefined()
			// biome-ignore lint/suspicious/noExplicitAny: test assertion
			const data = JSON.parse((result.content as any)[0].text)
			expect(data.location).toBe('London')
			expect(data.units).toBe('fahrenheit')
		})

		it('should enforce execution limits for AI tools', async () => {
			// GIVEN: Executor with low session limit
			const limitedExecutor = new ToolExecutor(manager, {
				concurrentLimit: 3,
				sessionLimit: 2,
				activeExecutions: new Set(),
				totalExecuted: 0,
				stopped: false,
				executionHistory: []
			})

			// WHEN: Execute up to limit
			await limitedExecutor.executeTool({
				serverId: 'weather-service',
				toolName: 'get_weather',
				parameters: { location: 'NYC' },
				source: 'ai-autonomous',
				documentPath: 'test.md'
			})

			await limitedExecutor.executeTool({
				serverId: 'weather-service',
				toolName: 'get_weather',
				parameters: { location: 'LA' },
				source: 'ai-autonomous',
				documentPath: 'test.md'
			})

			// THEN: Third execution should be blocked
			await expect(
				limitedExecutor.executeTool({
					serverId: 'weather-service',
					toolName: 'get_weather',
					parameters: { location: 'Chicago' },
					source: 'ai-autonomous',
					documentPath: 'test.md'
				})
			).rejects.toThrow(/session.*limit/i)
		})
	})

	describe('Complete Document Processing Flow', () => {
		it('should process Obsidian document with multiple tool calls', async () => {
			// GIVEN: Document with multiple code blocks
			const documentSections = [
				{
					codeBlock: 'tool: get_weather\nlocation: Tokyo',
					serverName: 'Weather Service'
				},
				{
					codeBlock: 'tool: search_web\nquery: Tokyo attractions',
					serverName: 'Search Service'
				},
				{
					codeBlock: 'tool: get_weather\nlocation: Kyoto',
					serverName: 'Weather Service'
				}
			]

			// biome-ignore lint/suspicious/noExplicitAny: test array
			const results: any[] = []

			// WHEN: Process each section
			for (const section of documentSections) {
				const invocation = processor.parseToolInvocation(section.codeBlock, section.serverName)

				if (invocation) {
					const result = await executor.executeTool({
						serverId: invocation.serverId,
						toolName: invocation.toolName,
						parameters: invocation.parameters,
						source: 'user-codeblock',
						documentPath: 'japan-trip.md'
					})
					results.push(result)
				}
			}

			// THEN: All tools executed successfully
			expect(results).toHaveLength(3)
			results.forEach((result) => {
				expect(result.content).toBeDefined()
				expect(result.executionDuration).toBeGreaterThanOrEqual(0)
			})

			// AND: Stats reflect all executions
			const stats = executor.getStats()
			expect(stats.totalExecuted).toBeGreaterThanOrEqual(3)
		})

		it('should handle invalid code blocks gracefully', async () => {
			// GIVEN: Invalid code block (missing tool: line)
			const invalidBlock = 'location: Tokyo\nunits: celsius'

			// WHEN: Try to parse
			const invocation = processor.parseToolInvocation(invalidBlock, 'Weather Service')

			// THEN: Returns null (graceful failure)
			expect(invocation).toBeNull()
		})

		it('should integrate with LLM for tool discovery and execution', async () => {
			// GIVEN: LLM needs to discover available tools
			const toolContext = await buildAIToolContext(manager, executor)

			// WHEN: LLM sees available tools
			const availableTools = toolContext.tools.map((t) => t.toolName)
			expect(availableTools).toContain('get_weather')
			expect(availableTools).toContain('search_web')

			// AND: LLM decides to use a tool
			const llmDecision = {
				tool: 'get_weather',
				args: { location: 'Berlin', units: 'celsius' }
			}

			// THEN: Tool can be executed
			const result = await executor.executeTool({
				serverId: 'weather-service',
				toolName: llmDecision.tool,
				parameters: llmDecision.args,
				source: 'ai-autonomous',
				documentPath: 'ai-chat.md'
			})

			expect(result.content).toBeDefined()
		})
	})
})
