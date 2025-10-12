/**
 * Comprehensive MCP Integration Test
 *
 * Based on mcp-use example: tests all MCP capabilities
 * - Resources (data access)
 * - Prompts (template access)
 * - Tools (function execution)
 *
 * Validates complete MCP protocol support in Obsidian context
 */

import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
	buildAIToolContext,
	type CodeBlockProcessor,
	createCodeBlockProcessor,
	createMCPManager,
	createToolExecutor,
	// DeploymentType, // Removed in simplification
	type MCPServerManager,
	ToolExecutor,
	TransportProtocol
} from '../../src/mcp'

// Mock mcp-use with "everything" server capabilities
vi.mock('mcp-use', () => {
	// Simulate @modelcontextprotocol/server-everything
	const everythingTools = [
		{
			name: 'echo',
			description: 'Echoes back the input',
			inputSchema: {
				type: 'object',
				properties: {
					message: { type: 'string' }
				},
				required: ['message']
			}
		},
		{
			name: 'add',
			description: 'Add two numbers',
			inputSchema: {
				type: 'object',
				properties: {
					a: { type: 'number' },
					b: { type: 'number' }
				},
				required: ['a', 'b']
			}
		},
		{
			name: 'longRunningOperation',
			description: 'A long running operation',
			inputSchema: {
				type: 'object',
				properties: {
					duration: { type: 'number' },
					steps: { type: 'number' }
				}
			}
		},
		{
			name: 'sampleLLM',
			description: 'Sample from an LLM',
			inputSchema: {
				type: 'object',
				properties: {
					prompt: { type: 'string' },
					maxTokens: { type: 'number' }
				},
				required: ['prompt']
			}
		}
	]

	const mockSession = {
		isConnected: true,
		connector: {
			tools: everythingTools,
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			callTool: vi.fn((toolName: string, args: any) => {
				switch (toolName) {
					case 'echo':
						return Promise.resolve({
							content: [
								{
									type: 'text',
									text: args.message
								}
							]
						})
					case 'add':
						return Promise.resolve({
							content: [
								{
									type: 'text',
									text: String(args.a + args.b)
								}
							]
						})
					case 'longRunningOperation':
						return Promise.resolve({
							content: [
								{
									type: 'text',
									text: `Operation completed with ${args.steps} steps in ${args.duration}ms`
								}
							]
						})
					case 'sampleLLM':
						return Promise.resolve({
							content: [
								{
									type: 'text',
									text: `LLM Response: Mock answer to "${args.prompt}"`
								}
							]
						})
					default:
						return Promise.reject(new Error(`Unknown tool: ${toolName}`))
				}
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

describe('E2E: Comprehensive MCP Capabilities', () => {
	let manager: MCPServerManager
	let executor: ToolExecutor
	let processor: CodeBlockProcessor

	beforeAll(async () => {
		// Initialize with "everything" server (like @modelcontextprotocol/server-everything)
		manager = createMCPManager()
		executor = createToolExecutor(manager)
		processor = createCodeBlockProcessor()

		const serverConfig = {
			id: 'everything-server',
			name: 'Everything Server',
			configInput: 'docker run -i --rm --name tars-everything mcp/everything:latest',
			enabled: true,
			failureCount: 0,
			autoDisabled: false
		}

		await manager.initialize([serverConfig])
		processor.updateServerConfigs([serverConfig])
	})

	describe('Tool Discovery and Execution', () => {
		it('should discover all available tools from everything server', async () => {
			// GIVEN: Everything server with multiple tools
			const toolContext = await buildAIToolContext(manager, executor)

			// THEN: All tools are discovered
			const toolNames = toolContext.tools.map((t) => t.toolName)
			expect(toolNames).toContain('echo')
			expect(toolNames).toContain('add')
			expect(toolNames).toContain('longRunningOperation')
			expect(toolNames).toContain('sampleLLM')
		})

		it('should execute echo tool from code block', async () => {
			// GIVEN: User writes echo tool invocation
			const codeBlock = `tool: echo
message: Hello from Obsidian!`

			// WHEN: Parse and execute
			const invocation = processor.parseToolInvocation(codeBlock, 'Everything Server')
			expect(invocation).toBeDefined()
			const { serverId, toolName, parameters } = invocation!
			const result = await executor.executeTool({
				serverId,
				toolName,
				parameters,
				source: 'user-codeblock',
				documentPath: 'test.md'
			})

			// THEN: Message is echoed back
			expect(result.content).toBeDefined()
			// biome-ignore lint/suspicious/noExplicitAny: test assertion
			const content = (result.content as any)[0].text
			expect(content).toBe('Hello from Obsidian!')
		})

		it('should execute math operations', async () => {
			// GIVEN: Add operation
			const codeBlock = `tool: add
a: 42
b: 18`

			// WHEN: Execute
			const invocation = processor.parseToolInvocation(codeBlock, 'Everything Server')
			expect(invocation).toBeDefined()
			const { serverId, toolName, parameters } = invocation!
			const result = await executor.executeTool({
				serverId,
				toolName,
				parameters,
				source: 'user-codeblock',
				documentPath: 'calculations.md'
			})

			// THEN: Correct sum returned
			// biome-ignore lint/suspicious/noExplicitAny: test assertion
			const sum = (result.content as any)[0].text
			expect(sum).toBe('60')
		})

		it('should handle long-running operations', async () => {
			// GIVEN: Long running operation
			const codeBlock = `tool: longRunningOperation
duration: 5000
steps: 10`

			// WHEN: Execute
			const invocation = processor.parseToolInvocation(codeBlock, 'Everything Server')
			expect(invocation).toBeDefined()
			const { serverId, toolName, parameters } = invocation!
			const result = await executor.executeTool({
				serverId,
				toolName,
				parameters,
				source: 'user-codeblock',
				documentPath: 'async-tasks.md'
			})

			// THEN: Operation completes
			// biome-ignore lint/suspicious/noExplicitAny: test assertion
			const response = (result.content as any)[0].text
			expect(response).toContain('Operation completed')
			expect(response).toContain('10 steps')
			expect(response).toContain('5000ms')
		})

		it('should interact with LLM via tool', async () => {
			// GIVEN: LLM sampling tool
			const codeBlock = `tool: sampleLLM
prompt: What is the capital of France?
maxTokens: 100`

			// WHEN: Execute
			const invocation = processor.parseToolInvocation(codeBlock, 'Everything Server')
			expect(invocation).toBeDefined()
			const { serverId, toolName, parameters } = invocation!
			const result = await executor.executeTool({
				serverId,
				toolName,
				parameters,
				source: 'user-codeblock',
				documentPath: 'ai-queries.md'
			})

			// THEN: LLM response received
			// biome-ignore lint/suspicious/noExplicitAny: test assertion
			const response = (result.content as any)[0].text
			expect(response).toContain('LLM Response')
			expect(response).toContain('What is the capital of France?')
		})
	})

	describe('LLM Integration Testing (Agent-like behavior)', () => {
		it('should answer: Which tools do you have access to?', async () => {
			// GIVEN: LLM asking about available tools
			const toolContext = await buildAIToolContext(manager, executor)

			// WHEN: Query for tools
			const availableTools = toolContext.tools.map((t) => ({
				name: t.toolName,
				description: t.description
			}))

			// THEN: Should list all tools
			expect(availableTools).toHaveLength(4)
			expect(availableTools.find((t) => t.name === 'echo')).toBeDefined()
			expect(availableTools.find((t) => t.name === 'add')).toBeDefined()
			expect(availableTools.find((t) => t.name === 'longRunningOperation')).toBeDefined()
			expect(availableTools.find((t) => t.name === 'sampleLLM')).toBeDefined()
		})

		it('should execute tools based on LLM decision', async () => {
			// GIVEN: LLM decides to use echo tool
			const llmDecision = {
				tool: 'echo',
				reasoning: 'User asked to echo a message',
				parameters: {
					message: 'Testing LLM-initiated tool call'
				}
			}

			// WHEN: Execute based on LLM decision
			const result = await executor.executeTool({
				serverId: 'everything-server',
				toolName: llmDecision.tool,
				parameters: llmDecision.parameters,
				source: 'ai-autonomous',
				documentPath: 'ai-session.md'
			})

			// THEN: Tool executes successfully
			// biome-ignore lint/suspicious/noExplicitAny: test assertion
			const response = (result.content as any)[0].text
			expect(response).toBe('Testing LLM-initiated tool call')
		})

		it('should chain multiple tool calls', async () => {
			// GIVEN: LLM decides to chain tools (echo → add → echo)
			const toolChain = [
				{ tool: 'echo', params: { message: 'Starting calculation' } },
				{ tool: 'add', params: { a: 10, b: 20 } },
				{ tool: 'echo', params: { message: 'Calculation complete' } }
			]

			const results = []

			// WHEN: Execute chain
			for (const step of toolChain) {
				const result = await executor.executeTool({
					serverId: 'everything-server',
					toolName: step.tool,
					parameters: step.params,
					source: 'ai-autonomous',
					documentPath: 'chain.md'
				})
				// biome-ignore lint/suspicious/noExplicitAny: test assertion
				results.push((result.content as any)[0].text)
			}

			// THEN: All steps execute
			expect(results).toHaveLength(3)
			expect(results[0]).toBe('Starting calculation')
			expect(results[1]).toBe('30')
			expect(results[2]).toBe('Calculation complete')
		})
	})

	describe('Real-world Obsidian Scenarios', () => {
		it('should process daily note with multiple tool invocations', async () => {
			// GIVEN: Daily note with multiple embedded tool calls
			const dailyNoteTools = [
				{ block: 'tool: echo\nmessage: Good morning!', server: 'Everything Server' },
				{ block: 'tool: add\na: 5\nb: 3', server: 'Everything Server' },
				{ block: "tool: sampleLLM\nprompt: Summarize today's tasks", server: 'Everything Server' }
			]

			const results = []

			// WHEN: Process all tools in the note
			for (const { block, server } of dailyNoteTools) {
				const invocation = processor.parseToolInvocation(block, server)
				if (invocation) {
					const result = await executor.executeTool({
						serverId: invocation.serverId,
						toolName: invocation.toolName,
						parameters: invocation.parameters,
						source: 'user-codeblock',
						documentPath: 'Daily Notes/2025-10-01.md'
					})
					results.push(result)
				}
			}

			// THEN: All tools execute successfully
			expect(results).toHaveLength(3)
			// biome-ignore lint/suspicious/noExplicitAny: test assertion
			expect((results[0].content as any)[0].text).toBe('Good morning!')
			// biome-ignore lint/suspicious/noExplicitAny: test assertion
			expect((results[1].content as any)[0].text).toBe('8')
			// biome-ignore lint/suspicious/noExplicitAny: test assertion
			expect((results[2].content as any)[0].text).toContain('LLM Response')
		})

		it('should maintain execution statistics across document', async () => {
			// GIVEN: Fresh executor for stats tracking
			const freshExecutor = createToolExecutor(manager)

			// WHEN: Execute multiple tools
			await freshExecutor.executeTool({
				serverId: 'everything-server',
				toolName: 'echo',
				parameters: { message: 'Test 1' },
				source: 'user-codeblock',
				documentPath: 'test.md'
			})

			await freshExecutor.executeTool({
				serverId: 'everything-server',
				toolName: 'add',
				parameters: { a: 1, b: 2 },
				source: 'user-codeblock',
				documentPath: 'test.md'
			})

			// THEN: Stats are accurate
			const stats = freshExecutor.getStats()
			expect(stats.totalExecuted).toBe(2)
			expect(stats.activeExecutions).toBe(0)
			expect(stats.sessionLimit).toBe(25)
		})
	})

	describe('Error Handling and Edge Cases', () => {
		it('should handle missing required parameters gracefully', async () => {
			// GIVEN: Tool call missing required parameter
			const invalidBlock = `tool: add
a: 5` // Missing 'b' parameter

			// WHEN: Parse and execute
			const invocation = processor.parseToolInvocation(invalidBlock, 'Everything Server')

			// THEN: Still parses (validation happens at MCP server level)
			expect(invocation).toBeDefined()
			expect(invocation?.toolName).toBe('add')
			expect(invocation?.parameters).toEqual({ a: 5 })
		})

		it('should enforce execution limits', async () => {
			// GIVEN: Executor with strict limits
			const limitedExecutor = new ToolExecutor(manager, {
				concurrentLimit: 1,
				sessionLimit: 2,
				activeExecutions: new Set(),
				totalExecuted: 0,
				stopped: false,
				executionHistory: []
			})

			// WHEN: Execute up to limit
			await limitedExecutor.executeTool({
				serverId: 'everything-server',
				toolName: 'echo',
				parameters: { message: 'First' },
				source: 'ai-autonomous',
				documentPath: 'test.md'
			})

			await limitedExecutor.executeTool({
				serverId: 'everything-server',
				toolName: 'echo',
				parameters: { message: 'Second' },
				source: 'ai-autonomous',
				documentPath: 'test.md'
			})

			// THEN: Third execution blocked
			await expect(
				limitedExecutor.executeTool({
					serverId: 'everything-server',
					toolName: 'echo',
					parameters: { message: 'Third' },
					source: 'ai-autonomous',
					documentPath: 'test.md'
				})
			).rejects.toThrow(/session.*limit/i)
		})
	})
})
