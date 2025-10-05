import Anthropic from '@anthropic-ai/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ClaudeProviderAdapter } from '../../src/mcp/adapters/ClaudeProviderAdapter'
import type { MCPServerManager } from '../../src/mcp/managerMCPUse'
import type { MCPServerConfig } from '../../src/mcp/types'

const createToolSnapshot = () => ({
	mapping: new Map([
		[
			'test_tool',
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
					name: 'test_tool',
					description: 'A test tool',
					inputSchema: { type: 'object', properties: {} }
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
 	let mockToolCache: ReturnType<typeof createMockToolCache>['cache']

	beforeEach(() => {
		mockAnthropicClient = new Anthropic({ apiKey: 'test-key' })
		const toolCacheData = createMockToolCache()
		mockToolCache = toolCacheData.cache
		mockMcpManager = {
			listServers: vi.fn().mockReturnValue([]),
			getClient: vi.fn(),
			getToolDiscoveryCache: vi.fn().mockReturnValue(mockToolCache),
			on: vi.fn().mockReturnThis(),
			emit: vi.fn()
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
			// When: Initializing adapter
			await adapter.initialize()

			// Then: Tool discovery cache used to build mapping
			expect(mockToolCache.getSnapshot).toHaveBeenCalledTimes(1)
		})

		it('supports lazy initialization by deferring tool discovery', async () => {
			// When: Initializing lazily
			await adapter.initialize({ preloadTools: false })

			// Then: Snapshot not requested yet
			expect(mockToolCache.getSnapshot).not.toHaveBeenCalled()
			expect(mockToolCache.getCachedMapping).toHaveBeenCalled()

			// When: Tools needed later
			await (adapter as any).buildTools()

			// Then: Snapshot fetched on demand
			expect(mockToolCache.getSnapshot).toHaveBeenCalledTimes(1)
		})
	})

	describe('findServer', () => {
		it('should return server ID for known tool', async () => {
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
			mockToolCache.getCachedMapping.mockReturnValueOnce(null)
			expect(() => adapter.findServer('test_tool')).toThrow('tool mapping not initialized')
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
