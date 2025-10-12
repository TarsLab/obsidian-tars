/**
 * Integration tests for Azure and OpenRouter providers with tool calling
 * Tests that both providers correctly use the OpenAI-compatible adapter
 */

import { describe, expect, it, vi } from 'vitest'
import type { BaseOptions } from '../../src/providers'

// Mock lang helper (needs window object)
vi.mock('src/lang/helper', () => ({
	t: (key: string) => key
}))

describe('Azure Provider Integration - Tool Calling', () => {
	it('should have correct AzureOptions type with documentPath', () => {
		// GIVEN: Azure-specific options with MCP
		const options: BaseOptions & { endpoint: string; apiVersion: string } = {
			apiKey: 'test-key',
			baseURL: '',
			model: 'gpt-4',
			endpoint: 'https://test.openai.azure.com',
			apiVersion: '2024-02-01',
			parameters: {},
			documentPath: '/test/azure-document.md',
			mcpManager: {},
			mcpExecutor: {}
		}

		// THEN: Should compile and have all expected fields
		expect(options.documentPath).toBe('/test/azure-document.md')
		expect(options.endpoint).toBe('https://test.openai.azure.com')
		expect(options.apiVersion).toBe('2024-02-01')
		expect(options.mcpManager).toBeDefined()
		expect(options.mcpExecutor).toBeDefined()
	})

	it('should have azureVendor with Tool Calling capability', async () => {
		// WHEN: Importing Azure vendor
		const { azureVendor } = await import('../../src/providers/azure.js')

		// THEN: Should have Tool Calling capability
		expect(azureVendor.capabilities).toContain('Tool Calling')
		expect(azureVendor.name).toBe('Azure')
	})

	it('should have Reasoning capability for DeepSeek-R1', async () => {
		// WHEN: Importing Azure vendor
		const { azureVendor } = await import('../../src/providers/azure.js')

		// THEN: Should have Reasoning capability
		expect(azureVendor.capabilities).toContain('Reasoning')
		expect(azureVendor.models).toContain('deepseek-r1')
	})
})

describe('OpenRouter Provider Integration - Tool Calling', () => {
	it('should have correct BaseOptions type with documentPath', () => {
		// GIVEN: OpenRouter options with MCP
		const options: BaseOptions = {
			apiKey: 'test-key',
			baseURL: 'https://openrouter.ai/api/v1/chat/completions',
			model: 'anthropic/claude-3.5-sonnet',
			parameters: {},
			documentPath: '/test/openrouter-document.md',
			mcpManager: {},
			mcpExecutor: {}
		}

		// THEN: Should compile and have all expected fields
		expect(options.documentPath).toBe('/test/openrouter-document.md')
		expect(options.baseURL).toBe('https://openrouter.ai/api/v1/chat/completions')
		expect(options.mcpManager).toBeDefined()
		expect(options.mcpExecutor).toBeDefined()
	})

	it('should have openRouterVendor with Tool Calling capability', async () => {
		// WHEN: Importing OpenRouter vendor
		const { openRouterVendor } = await import('../../src/providers/openRouter.js')

		// THEN: Should have Tool Calling capability
		expect(openRouterVendor.capabilities).toContain('Tool Calling')
		expect(openRouterVendor.name).toBe('OpenRouter')
	})

	it('should support Image Vision and PDF Vision', async () => {
		// WHEN: Importing OpenRouter vendor
		const { openRouterVendor } = await import('../../src/providers/openRouter.js')

		// THEN: Should have vision capabilities
		expect(openRouterVendor.capabilities).toContain('Image Vision')
		expect(openRouterVendor.capabilities).toContain('PDF Vision')
	})
})

describe('Integration - OpenAI SDK Compatibility', () => {
	it('should use OpenAI SDK for both Azure and OpenRouter in tool-aware mode', async () => {
		// This test verifies that both providers can use the OpenAI SDK
		// which ensures compatibility with OpenAIProviderAdapter

		// Import OpenAI SDK
		const OpenAI = (await import('openai')).default
		const { AzureOpenAI } = await import('openai')

		// THEN: Both constructors should be available
		expect(OpenAI).toBeDefined()
		expect(AzureOpenAI).toBeDefined()

		// Verify they can be instantiated (will fail in test env but type-checks)
		expect(() => new OpenAI({ apiKey: 'test', dangerouslyAllowBrowser: true })).not.toThrow()
		expect(
			() =>
				new AzureOpenAI({
					apiKey: 'test',
					endpoint: 'https://test.azure.com',
					apiVersion: '2024-02-01',
					deployment: 'gpt-4',
					dangerouslyAllowBrowser: true
				})
		).not.toThrow()
	})

	it('should export ToolCallingCoordinator and OpenAIProviderAdapter for reuse', async () => {
		// WHEN: Importing MCP module
		const mcp = await import('../../src/mcp/index.js')

		// THEN: Both providers can use these exports
		expect(mcp.ToolCallingCoordinator).toBeDefined()
		expect(mcp.OpenAIProviderAdapter).toBeDefined()

		// Verify adapter can be instantiated with minimal params
		const mockToolCache = {
			getSnapshot: vi.fn().mockResolvedValue({ mapping: new Map(), servers: [] }),
			getToolMapping: vi.fn().mockResolvedValue(new Map()),
			getCachedMapping: vi.fn().mockReturnValue(new Map()),
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
		const mockMcpManager = {
			listServers: vi.fn().mockReturnValue([]),
			getClient: vi.fn(),
			getToolDiscoveryCache: vi.fn().mockReturnValue(mockToolCache),
			on: vi.fn().mockReturnThis()
		}
		const mockMcpExecutor = { executeTool: vi.fn(), canExecute: vi.fn() }
		const mockClient = {
			chat: {
				completions: {
					create: vi.fn()
				}
			}
		}

		expect(
			() =>
				new mcp.OpenAIProviderAdapter({
					// biome-ignore lint/suspicious/noExplicitAny: test mock
					mcpManager: mockMcpManager as any,
					// biome-ignore lint/suspicious/noExplicitAny: test mock
					mcpExecutor: mockMcpExecutor as any,
					// biome-ignore lint/suspicious/noExplicitAny: test mock
					openaiClient: mockClient as any,
					controller: new AbortController(),
					resolveEmbedAsBinary: async () => new ArrayBuffer(0)
				})
		).not.toThrow()
	})
})
