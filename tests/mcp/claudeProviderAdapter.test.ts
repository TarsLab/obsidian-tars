import Anthropic from '@anthropic-ai/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ClaudeProviderAdapter } from '../../src/mcp/adapters/ClaudeProviderAdapter'
import type { MCPServerManager } from '../../src/mcp/managerMCPUse'
import type { MCPServerConfig } from '../../src/mcp/types'

// Mock Anthropic client
vi.mock('@anthropic-ai/sdk', () => ({
	default: vi.fn().mockImplementation(() => ({
		messages: {
			create: vi.fn()
		}
	}))
}))

describe('ClaudeProviderAdapter', () => {
	let mockAnthropicClient: Anthropic
	let mockMcpManager: MCPServerManager
	let adapter: ClaudeProviderAdapter
	let controller: AbortController

	beforeEach(() => {
		mockAnthropicClient = new Anthropic({ apiKey: 'test-key' })
		mockMcpManager = {
			listServers: vi.fn().mockReturnValue([]),
			getClient: vi.fn(),
			on: vi.fn()
		} as unknown as MCPServerManager
		controller = new AbortController()

		adapter = new ClaudeProviderAdapter({
			mcpManager: mockMcpManager,
			anthropicClient: mockAnthropicClient,
			controller,
			model: 'claude-3-5-sonnet-latest',
			maxTokens: 4096
		})
	})

	describe('initialize', () => {
		it('should initialize tool mapping and cache tools', async () => {
			const mockServer: MCPServerConfig = {
				id: 'test-server',
				name: 'Test Server',
				enabled: true,
				configInput: 'npx @modelcontextprotocol/server-memory',
				failureCount: 0,
				autoDisabled: false
			}
			const mockClient = {
				listTools: vi.fn().mockResolvedValue([
					{
						name: 'test_tool',
						description: 'A test tool',
						inputSchema: { type: 'object', properties: {} }
					}
				])
			}

			vi.mocked(mockMcpManager.listServers).mockReturnValue([mockServer])
			vi.mocked(mockMcpManager.getClient).mockReturnValue(mockClient as any)

			await adapter.initialize()

			expect(mockMcpManager.listServers).toHaveBeenCalled()
			expect(mockMcpManager.getClient).toHaveBeenCalledWith('test-server')
			expect(mockClient.listTools).toHaveBeenCalled()
		})
	})

	describe('findServer', () => {
		it('should return server ID for known tool', async () => {
			const mockServer: MCPServerConfig = {
				id: 'test-server',
				name: 'Test Server',
				enabled: true,
				configInput: 'npx @modelcontextprotocol/server-memory',
				failureCount: 0,
				autoDisabled: false
			}
			const mockClient = {
				listTools: vi.fn().mockResolvedValue([
					{
						name: 'test_tool',
						description: 'A test tool',
						inputSchema: { type: 'object', properties: {} }
					}
				])
			}

			vi.mocked(mockMcpManager.listServers).mockReturnValue([mockServer])
			vi.mocked(mockMcpManager.getClient).mockReturnValue(mockClient as any)

			await adapter.initialize()

			const serverInfo = adapter.findServer('test_tool')
			expect(serverInfo).toEqual({ id: 'test-server', name: 'Test Server' })
		})

		it('should return null for unknown tool', async () => {
			await adapter.initialize()

			const serverInfo = adapter.findServer('unknown_tool')
			expect(serverInfo).toBeNull()
		})

		it('should throw error if not initialized', () => {
			expect(() => adapter.findServer('test_tool')).toThrow('ClaudeProviderAdapter not initialized')
		})
	})

	describe('formatToolResult', () => {
		it('should format tool result as message', () => {
			const result = {
				content: { result: 'success' },
				contentType: 'json' as const,
				executionDuration: 1234
			}

			const message = adapter.formatToolResult('call_123', result)

			expect(message).toEqual({
				role: 'tool',
				tool_call_id: 'call_123',
				content: JSON.stringify({ result: 'success' })
			})
		})
	})

	describe('sendRequest', () => {
		it('should send request with tools when available', async () => {
			const mockServer: MCPServerConfig = {
				id: 'test-server',
				name: 'Test Server',
				enabled: true,
				configInput: 'npx @modelcontextprotocol/server-memory',
				failureCount: 0,
				autoDisabled: false
			}
			const mockClient = {
				listTools: vi.fn().mockResolvedValue([
					{
						name: 'test_tool',
						description: 'A test tool',
						inputSchema: { type: 'object', properties: {} }
					}
				])
			}

			vi.mocked(mockMcpManager.listServers).mockReturnValue([mockServer])
			vi.mocked(mockMcpManager.getClient).mockReturnValue(mockClient as any)

			const mockStream = {
				[Symbol.asyncIterator]: vi.fn().mockReturnValue({
					next: vi.fn().mockResolvedValue({ done: true, value: undefined })
				})
			}
			vi.mocked(mockAnthropicClient.messages.create).mockResolvedValue(mockStream as any)

			await adapter.initialize()

			const messages = [{ role: 'user' as const, content: 'Hello' }]
			const generator = adapter.sendRequest(messages)

			// Consume the generator
			for await (const _ of generator) {
				// consume
			}

			expect(mockAnthropicClient.messages.create).toHaveBeenCalledWith(
				expect.objectContaining({
					model: 'claude-3-5-sonnet-latest',
					max_tokens: 4096,
					messages: expect.any(Array),
					stream: true,
					tools: expect.any(Array)
				}),
				expect.any(Object)
			)
		})
	})
})
