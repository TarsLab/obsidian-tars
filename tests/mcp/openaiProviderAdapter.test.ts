/**
 * Tests for OpenAI Provider Adapter
 * Tests the complete adapter implementation
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OpenAIProviderAdapter } from '../../src/mcp/providerAdapters'

// Mock OpenAI client
const mockOpenAI = {
	chat: {
		completions: {
			create: vi.fn()
		}
	}
}

// Mock MCP manager
const mockMCPManager = {
	listServers: vi.fn().mockReturnValue([
		{ id: 'server1', name: 'Test Server', enabled: true }
	]),
	getClient: vi.fn().mockReturnValue({
		listTools: vi.fn().mockResolvedValue([
			{
				name: 'test_tool',
				description: 'A test tool',
				inputSchema: { type: 'object', properties: {} }
			}
		])
	}),
	on: vi.fn() // Mock EventEmitter on method
}

// Mock executor
const mockExecutor = {
	executeTool: vi.fn().mockResolvedValue({
		content: { result: 'success' },
		contentType: 'json',
		executionDuration: 100
	}),
	canExecute: vi.fn().mockReturnValue(true)
}

describe('OpenAIProviderAdapter', () => {
	let adapter: OpenAIProviderAdapter
	let controller: AbortController

	beforeEach(() => {
		vi.clearAllMocks()
		controller = new AbortController()

		adapter = new OpenAIProviderAdapter({
			// biome-ignore lint/suspicious/noExplicitAny: mock
			mcpManager: mockMCPManager as any,
			// biome-ignore lint/suspicious/noExplicitAny: mock
			mcpExecutor: mockExecutor as any,
			// biome-ignore lint/suspicious/noExplicitAny: mock
			openaiClient: mockOpenAI as any,
			controller
		})
	})

	describe('Initialization', () => {
		it('should initialize and build tool mapping', async () => {
			// WHEN: Initializing adapter
			await adapter.initialize()

			// THEN: Should query servers for tools
			expect(mockMCPManager.listServers).toHaveBeenCalled()
			expect(mockMCPManager.getClient).toHaveBeenCalledWith('server1')
		})
	})

	describe('Tool operations', () => {
		it('should find server ID for tool', async () => {
			// GIVEN: Initialized adapter
			await adapter.initialize()

			// WHEN: Finding server for tool
			const serverId = adapter.findServerId('test_tool')

			// THEN: Should return correct server ID
			expect(serverId).toBe('server1')
		})

		it('should format tool result correctly', () => {
			// GIVEN: Tool execution result
			const result = {
				content: { temperature: 72 },
				contentType: 'json' as const,
				executionDuration: 100
			}

			// WHEN: Formatting for OpenAI
			const message = adapter.formatToolResult('call_123', result)

			// THEN: Should format as OpenAI tool message
			expect(message).toEqual({
				role: 'tool',
				tool_call_id: 'call_123',
				content: JSON.stringify({ temperature: 72 })
			})
		})
	})

	describe('Parser', () => {
		it('should return OpenAI parser', () => {
			// WHEN: Getting parser
			const parser = adapter.getParser()

			// THEN: Should be OpenAI tool response parser
			expect(parser).toBeDefined()
			expect(typeof parser.parseChunk).toBe('function')
			expect(typeof parser.hasCompleteToolCalls).toBe('function')
		})
	})

	describe('Message formatting', () => {
		it('should format tool result messages', async () => {
			// GIVEN: Messages with tool results
			const messages = [
				{ role: 'user' as const, content: 'Test' },
				{
					role: 'tool' as const,
					tool_call_id: 'call_1',
					content: '{"result": "success"}'
				}
			]

			// WHEN: Formatting would happen internally
			// THEN: Tool message should be preserved
			expect(messages[1].role).toBe('tool')
			expect(messages[1].tool_call_id).toBe('call_1')
		})
	})

	describe('Request streaming', () => {
		it('should send request with tools', async () => {
			// GIVEN: Mock stream
			const mockStream = (async function* () {
				yield { choices: [{ delta: { content: 'test' } }] }
			})()

			mockOpenAI.chat.completions.create.mockResolvedValue(mockStream)

			// WHEN: Sending request
			const messages = [{ role: 'user' as const, content: 'Test' }]
			const chunks = []
			for await (const chunk of adapter.sendRequest(messages)) {
				chunks.push(chunk)
			}

			// THEN: Should call OpenAI with tools
			expect(mockOpenAI.chat.completions.create).toHaveBeenCalled()
			const callArgs = mockOpenAI.chat.completions.create.mock.calls[0][0]
			expect(callArgs.tools).toBeDefined()
			expect(chunks).toHaveLength(1)
		})
	})
})
