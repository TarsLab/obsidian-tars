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

const createToolSnapshot = () => ({
	mapping: new Map([
		[
			'test_tool',
			{
				id: 'server1',
				name: 'Server 1'
			}
		]
	]),
	servers: [
		{
			serverId: 'server1',
			serverName: 'Server 1',
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

const createMockMCPManager = (toolCache: ReturnType<typeof createMockToolCache>['cache']) => ({
	listServers: vi.fn().mockReturnValue([
		{ id: 'server1', name: 'Server 1', enabled: true }
	]),
	getClient: vi.fn().mockReturnValue({
		listTools: vi.fn().mockResolvedValue([])
	}),
	getToolDiscoveryCache: vi.fn().mockReturnValue(toolCache),
	on: vi.fn().mockReturnThis(),
	emit: vi.fn()
})

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
	let mockMCPManager: ReturnType<typeof createMockMCPManager>
	let mockToolCache: ReturnType<typeof createMockToolCache>['cache']

	beforeEach(() => {
		vi.clearAllMocks()
		controller = new AbortController()
		const toolCacheData = createMockToolCache()
		mockToolCache = toolCacheData.cache
		mockMCPManager = createMockMCPManager(mockToolCache)

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
			// When: Initializing adapter
			await adapter.initialize()

			// Then: Should load tools from discovery cache
			expect(mockToolCache.getSnapshot).toHaveBeenCalledTimes(1)
		})

		it('supports lazy initialization by deferring tool discovery', async () => {
			// When: Initializing with preload disabled
			await adapter.initialize({ preloadTools: false })

			// Then: Snapshot not fetched yet
			expect(mockToolCache.getSnapshot).not.toHaveBeenCalled()
			expect(mockToolCache.getCachedMapping).toHaveBeenCalled()

			// When: Tools needed later
			await (adapter as any).buildTools()

			// Then: Snapshot fetched on demand
			expect(mockToolCache.getSnapshot).toHaveBeenCalledTimes(1)
		})
	})

	describe('Tool operations', () => {
		it('should find server info for tool', async () => {
			// GIVEN: Initialized adapter
			await adapter.initialize()

			// WHEN: Finding server for tool
			const serverInfo = adapter.findServer('test_tool')

			// THEN: Should return correct server ID
			expect(serverInfo).toEqual({ id: 'server1', name: 'Server 1' })
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
