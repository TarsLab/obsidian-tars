/**
 * Tests for OllamaProviderAdapter
 * Verifies Ollama-specific tool calling implementation
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolExecutor } from '../../src/mcp/executor'
import type { MCPServerManager } from '../../src/mcp/managerMCPUse'
import { OllamaProviderAdapter } from '../../src/mcp/providerAdapters'

// Mock Ollama client
const createMockOllamaClient = () => ({
	chat: vi.fn(),
	abort: vi.fn()
})

const createToolSnapshot = () => ({
	mapping: new Map([
		[
			'get_weather',
			{
				id: 'test-server',
				name: 'Test Server'
			}
		]
	]),
	servers: [
		{
			serverId: 'test-server',
			serverName: 'Test Server',
			tools: [
				{
					name: 'get_weather',
					description: 'Get current weather',
					inputSchema: {
						type: 'object',
						properties: {
							location: { type: 'string' }
						}
					}
				}
			]
		}
	]
})

const createMockToolCache = () => {
	const snapshot = createToolSnapshot()
	const cache = {
		getSnapshot: vi.fn().mockResolvedValue(snapshot),
		getToolMapping: vi.fn().mockResolvedValue(snapshot.mapping),
		getCachedMapping: vi.fn().mockReturnValue(snapshot.mapping),
		preload: vi.fn(),
		invalidate: vi.fn(),
		getMetrics: vi.fn().mockReturnValue({
			requests: 0,
			hits: 0,
			misses: 0,
			batched: 0,
			invalidations: 0,
			inFlight: false,
			lastUpdatedAt: null,
			lastBuildDurationMs: null,
			lastServerCount: 0,
			lastToolCount: 0,
			lastError: null,
			lastInvalidationAt: null,
			lastInvalidationReason: null
		})
	}

	return { snapshot, cache }
}

// Mock MCP manager
const createMockMCPManager = (toolCache: ReturnType<typeof createMockToolCache>['cache']): MCPServerManager =>
	({
		listServers: vi.fn().mockReturnValue([{ id: 'test-server', name: 'Test Server', enabled: true }]),
		getClient: vi.fn().mockReturnValue({
			listTools: vi.fn().mockResolvedValue([])
		}),
		getToolDiscoveryCache: vi.fn().mockReturnValue(toolCache),
		on: vi.fn().mockReturnThis(),
		emit: vi.fn()
		// biome-ignore lint/suspicious/noExplicitAny: mock
	}) as any

// Mock executor
const createMockExecutor = (): ToolExecutor =>
	({
		executeTool: vi.fn(),
		canExecute: vi.fn().mockReturnValue(true)
		// biome-ignore lint/suspicious/noExplicitAny: mock
	}) as any

describe('OllamaProviderAdapter', () => {
	let adapter: OllamaProviderAdapter
	let mockOllamaClient: ReturnType<typeof createMockOllamaClient>
	let mockMCPManager: MCPServerManager
	let mockExecutor: ToolExecutor
	let controller: AbortController
	let mockToolCache: ReturnType<typeof createMockToolCache>['cache']

	beforeEach(() => {
		vi.clearAllMocks()
		mockOllamaClient = createMockOllamaClient()
		const toolCacheData = createMockToolCache()
		mockToolCache = toolCacheData.cache
		mockMCPManager = createMockMCPManager(mockToolCache)
		mockExecutor = createMockExecutor()
		controller = new AbortController()

		adapter = new OllamaProviderAdapter({
			mcpManager: mockMCPManager,
			mcpExecutor: mockExecutor,
			// biome-ignore lint/suspicious/noExplicitAny: mock
			ollamaClient: mockOllamaClient as any,
			controller,
			model: 'llama3.1'
		})
	})

	describe('Initialization', () => {
		it('should build tool-to-server mapping', async () => {
			// When: Initializing adapter
			await adapter.initialize()

			// Then: Should load tools from discovery cache
			expect(mockToolCache.getSnapshot).toHaveBeenCalledTimes(1)
		})

		it('should find server info for tool after initialization', async () => {
			// Given: Initialized adapter
			await adapter.initialize()

			// When: Finding server info
			const serverInfo = adapter.findServer('get_weather')

			// Then: Should return correct server ID
			expect(serverInfo).toEqual({ id: 'test-server', name: 'Test Server' })
		})

		it('should throw if findServer called before initialization', () => {
			// Given: No cached mapping available
			mockToolCache.getCachedMapping.mockReturnValueOnce(null)

			// When/Then: Calling findServer before initialize
			expect(() => adapter.findServer('get_weather')).toThrow('tool mapping not initialized')
		})

		it('supports lazy initialization by deferring tool discovery', async () => {
			// When: Initializing with lazy option
			await adapter.initialize({ preloadTools: false })

			// Then: Snapshot should not be fetched yet (only cached mapping read)
			expect(mockToolCache.getSnapshot).not.toHaveBeenCalled()
			expect(mockToolCache.getCachedMapping).toHaveBeenCalled()

			// When: Tools required later
			await (adapter as any).buildTools()

			// Then: Snapshot fetched on demand
			expect(mockToolCache.getSnapshot).toHaveBeenCalledTimes(1)
		})
	})

	describe('Tool Discovery', () => {
		it('should build Ollama tools format from MCP servers', async () => {
			// GIVEN: Adapter with MCP servers
			await adapter.initialize()

			// WHEN: Sending request (which builds tools internally)
			const mockStream = (async function* () {
				yield { message: { content: 'test' }, done: false }
			})()

			// biome-ignore lint/suspicious/noExplicitAny: mock
			vi.mocked(mockOllamaClient.chat as any).mockResolvedValue(mockStream)

			const messages = [{ role: 'user' as const, content: 'test' }]
			const gen = adapter.sendRequest(messages)
			await gen.next() // Start the generator

			// THEN: Should call Ollama chat with tools
			expect(mockOllamaClient.chat).toHaveBeenCalledWith(
				expect.objectContaining({
					model: 'llama3.1',
					stream: true,
					tools: expect.arrayContaining([
						expect.objectContaining({
							type: 'function',
							function: expect.objectContaining({
								name: 'get_weather',
								description: 'Get current weather'
							})
						})
					])
				})
			)
		})
	})

	describe('Message Formatting', () => {
		it('should format tool results as tool messages', async () => {
			// GIVEN: Tool execution result
			const result = {
				content: { temperature: 72, condition: 'sunny' },
				contentType: 'json' as const,
				executionDuration: 100
			}

			// WHEN: Formatting tool result
			const formattedMessage = adapter.formatToolResult('call_123', result)

			// THEN: Should produce tool role with tool_call_id
			expect(formattedMessage.role).toBe('tool')
			expect(formattedMessage.tool_call_id).toBe('call_123')
			expect(formattedMessage.content).toBe('{"temperature":72,"condition":"sunny"}')
		})

		it('should handle string content in tool results', async () => {
			// GIVEN: Tool result with string content
			const result = {
				content: 'The weather is sunny',
				contentType: 'text' as const,
				executionDuration: 50
			}

			// WHEN: Formatting
			const formattedMessage = adapter.formatToolResult('call_456', result)

			// THEN: Should preserve string content
			expect(formattedMessage.role).toBe('tool')
			expect(formattedMessage.tool_call_id).toBe('call_456')
			expect(formattedMessage.content).toBe('The weather is sunny')
		})
	})

	describe('Streaming', () => {
		it('should stream Ollama responses', async () => {
			// GIVEN: Initialized adapter
			await adapter.initialize()

			const mockStream = (async function* () {
				yield { message: { content: 'Hello' }, done: false }
				yield { message: { content: ' world' }, done: false }
				yield { message: { content: '' }, done: true }
			})()

			// biome-ignore lint/suspicious/noExplicitAny: mock
			vi.mocked(mockOllamaClient.chat as any).mockResolvedValue(mockStream)

			// WHEN: Sending request
			const messages = [{ role: 'user' as const, content: 'Hi' }]
			const chunks: Array<{ message?: { content?: string } }> = []

			for await (const chunk of adapter.sendRequest(messages)) {
				chunks.push(chunk)
			}

			// THEN: Should yield all chunks
			expect(chunks).toHaveLength(3)
			expect(chunks[0].message?.content).toBe('Hello')
			expect(chunks[1].message?.content).toBe(' world')
		})

		it('should abort streaming on controller signal', async () => {
			// GIVEN: Initialized adapter
			await adapter.initialize()

			const mockStream = (async function* () {
				yield { message: { content: 'Start' }, done: false }
				// Signal abort after first chunk
				controller.abort()
				yield { message: { content: 'Should not see this' }, done: false }
			})()

			// biome-ignore lint/suspicious/noExplicitAny: mock
			vi.mocked(mockOllamaClient.chat as any).mockResolvedValue(mockStream)

			// WHEN: Sending request and aborting
			const messages = [{ role: 'user' as const, content: 'test' }]
			const chunks: Array<{ message?: { content?: string } }> = []

			for await (const chunk of adapter.sendRequest(messages)) {
				chunks.push(chunk)
			}

			// THEN: Should call abort on Ollama client
			expect(mockOllamaClient.abort).toHaveBeenCalled()
		})
	})

	describe('Parser Integration', () => {
		it('should return OllamaToolResponseParser', () => {
			// WHEN: Getting parser
			const parser = adapter.getParser()

			// THEN: Should be OllamaToolResponseParser
			expect(parser).toBeDefined()
			expect(parser.parseChunk).toBeDefined()
			expect(parser.hasCompleteToolCalls).toBeDefined()
			expect(parser.getToolCalls).toBeDefined()
			expect(parser.reset).toBeDefined()
		})

		it('should parse Ollama tool calls correctly', () => {
			// GIVEN: Parser from adapter
			const parser = adapter.getParser()

			const chunk = {
				message: {
					tool_calls: [
						{
							function: {
								name: 'get_weather',
								arguments: { location: 'London' }
							}
						}
					]
				}
			}

			// WHEN: Parsing chunk
			parser.parseChunk(chunk)

			// THEN: Should extract tool call
			expect(parser.hasCompleteToolCalls()).toBe(true)
			const toolCalls = parser.getToolCalls()
			expect(toolCalls).toHaveLength(1)
			expect(toolCalls[0].name).toBe('get_weather')
			expect(toolCalls[0].arguments).toEqual({ location: 'London' })
		})

		it('should coerce numeric string arguments to numbers', () => {
			const parser = adapter.getParser()

			const chunk = {
				message: {
					tool_calls: [
						{
							function: {
								name: 'get_code_context_exa',
								arguments: { query: 'test', tokensNum: '1000' }
							}
						}
					]
				}
			}

			parser.parseChunk(chunk)

			expect(parser.hasCompleteToolCalls()).toBe(true)
			const [toolCall] = parser.getToolCalls()
			expect(toolCall.arguments.tokensNum).toBe(1000)
		})
	})
})
