/**
 * Tests for OllamaProviderAdapter
 * Verifies Ollama-specific tool calling implementation
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OllamaProviderAdapter } from '../../src/mcp/providerAdapters'
import type { MCPServerManager } from '../../src/mcp/managerMCPUse'
import type { ToolExecutor } from '../../src/mcp/executor'

// Mock Ollama client
const createMockOllamaClient = () => ({
	chat: vi.fn(),
	abort: vi.fn()
})

// Mock MCP manager
const createMockMCPManager = (): MCPServerManager => ({
	listServers: vi.fn().mockReturnValue([
		{ id: 'test-server', name: 'Test Server', enabled: true }
	]),
	getClient: vi.fn().mockReturnValue({
		listTools: vi.fn().mockResolvedValue([
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
		])
	})
	// biome-ignore lint/suspicious/noExplicitAny: mock
} as any)

// Mock executor
const createMockExecutor = (): ToolExecutor => ({
	executeTool: vi.fn(),
	canExecute: vi.fn().mockReturnValue(true)
	// biome-ignore lint/suspicious/noExplicitAny: mock
} as any)

describe('OllamaProviderAdapter', () => {
	let adapter: OllamaProviderAdapter
	let mockOllamaClient: ReturnType<typeof createMockOllamaClient>
	let mockMCPManager: MCPServerManager
	let mockExecutor: ToolExecutor
	let controller: AbortController

	beforeEach(() => {
		vi.clearAllMocks()
		mockOllamaClient = createMockOllamaClient()
		mockMCPManager = createMockMCPManager()
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
			// WHEN: Initializing adapter
			await adapter.initialize()

			// THEN: Should query MCP servers for tools
			expect(mockMCPManager.listServers).toHaveBeenCalled()
			expect(mockMCPManager.getClient).toHaveBeenCalledWith('test-server')
		})

		it('should find server ID for tool after initialization', async () => {
			// GIVEN: Initialized adapter
			await adapter.initialize()

			// WHEN: Finding server ID
			const serverId = adapter.findServerId('get_weather')

			// THEN: Should return correct server ID
			expect(serverId).toBe('test-server')
		})

		it('should throw if findServerId called before initialization', () => {
			// WHEN/THEN: Calling findServerId before initialize
			expect(() => adapter.findServerId('get_weather')).toThrow('not initialized')
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
		it('should format tool results as assistant role', async () => {
			// GIVEN: Tool execution result
			const result = {
				content: { temperature: 72, condition: 'sunny' },
				contentType: 'json' as const,
				executionDuration: 100
			}

			// WHEN: Formatting tool result
			const formattedMessage = adapter.formatToolResult('call_123', result)

			// THEN: Should use assistant role (Ollama convention)
			expect(formattedMessage.role).toBe('assistant')
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
					tool_calls: [{
						function: {
							name: 'get_weather',
							arguments: { location: 'London' }
						}
					}]
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
	})
})
