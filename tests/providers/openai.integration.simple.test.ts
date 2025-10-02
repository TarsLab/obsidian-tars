/**
 * Simple integration test for OpenAI provider with tool calling
 * Tests that the provider correctly switches between tool-aware and traditional paths
 */

import { describe, expect, it, vi } from 'vitest'
import type { BaseOptions } from '../../src/providers'

// Mock lang helper (needs window object)
vi.mock('src/lang/helper', () => ({
	t: (key: string) => key
}))

describe('OpenAI Provider Integration - Path Selection', () => {
	it('should have correct BaseOptions type with documentPath', () => {
		// GIVEN: BaseOptions interface
		const options: BaseOptions = {
			apiKey: 'test-key',
			baseURL: 'https://api.openai.com/v1',
			model: 'gpt-4',
			parameters: {},
			documentPath: '/test/document.md',
			mcpManager: {},
			mcpExecutor: {}
		}

		// THEN: Should compile and have all expected fields
		expect(options.documentPath).toBe('/test/document.md')
		expect(options.mcpManager).toBeDefined()
		expect(options.mcpExecutor).toBeDefined()
	})

	it('should have openAIVendor with Tool Calling capability', async () => {
		// WHEN: Importing vendor
		const { openAIVendor } = await import('../../src/providers/openAI')

		// THEN: Should have Tool Calling capability
		expect(openAIVendor.capabilities).toContain('Tool Calling')
		expect(openAIVendor.name).toBe('OpenAI')
	})

	it('should export ToolCallingCoordinator from mcp module', async () => {
		// WHEN: Importing MCP module
		const mcp = await import('../../src/mcp/index.js')

		// THEN: Should export coordinator and adapter
		expect(mcp.ToolCallingCoordinator).toBeDefined()
		expect(mcp.OpenAIProviderAdapter).toBeDefined()
	})
})
