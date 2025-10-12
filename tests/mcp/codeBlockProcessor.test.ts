/**
 * Contract tests for CodeBlockProcessor parsing and rendering
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createCodeBlockProcessor } from '../../src/mcp'
import type { MCPServerConfig } from '../../src/mcp/types'

describe('CodeBlockProcessor parsing contract tests', () => {
	let processor: ReturnType<typeof createCodeBlockProcessor>

	beforeEach(() => {
		vi.clearAllMocks()
		processor = createCodeBlockProcessor()

		const serverConfig: MCPServerConfig = {
			id: 'memory-server',
			name: 'memory-server',
			configInput: 'memory-server',
			enabled: true,
			failureCount: 0,
			autoDisabled: false
		}

		processor.updateServerConfigs([serverConfig])
	})

	describe('tool invocation parsing', () => {
		it('parses simple scalar parameters', () => {
			// Given: Code block with scalar values
			const content = `tool: echo
message: Hello World
timestamp: true
count: 42`

			// When: Parsing invocation
			const invocation = processor.parseToolInvocation(content, 'memory-server')

			expect(invocation).not.toBeNull()
			const parameters = invocation!.parameters

			// Then: Scalars are parsed correctly
			expect(invocation!.toolName).toBe('echo')
			expect(parameters).toMatchObject({
				message: 'Hello World',
				timestamp: true,
				count: 42
			})
		})

		it('parses empty array placeholder as real array', () => {
			// Given: Placeholder inserted as []
			const content = `tool: create_entities
entities: []`

			// When: Parsing invocation
			const invocation = processor.parseToolInvocation(content, 'memory-server')
			expect(invocation).not.toBeNull()
			const parameters = invocation!.parameters as Record<string, unknown>

			// Then: Entities parameter is parsed as an empty array
			expect(parameters['entities']).toEqual([])
		})

		it('parses empty object placeholder as real object', () => {
			// Given: Placeholder inserted as {}
			const content = `tool: update_settings
options: {}`

			const invocation = processor.parseToolInvocation(content, 'memory-server')
			expect(invocation).not.toBeNull()
			const parameters = invocation!.parameters as Record<string, unknown>

			expect(parameters['options']).toEqual({})
		})
	})
})
