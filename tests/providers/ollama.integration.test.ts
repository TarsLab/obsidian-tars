/**
 * Integration tests for Ollama provider with tool calling
 * Tests that the provider correctly uses OllamaProviderAdapter
 */

import { describe, expect, it, vi } from 'vitest'
import type { BaseOptions } from '../../src/providers'

// Mock lang helper (needs window object)
vi.mock('src/lang/helper', () => ({
	t: (key: string) => key
}))

describe('Ollama Provider Integration - Tool Calling', () => {
	it('should have correct BaseOptions type with documentPath', () => {
		// GIVEN: Ollama options with MCP
		const options: BaseOptions = {
			apiKey: '', // Ollama doesn't require API key
			baseURL: 'http://127.0.0.1:11434',
			model: 'llama3.1',
			parameters: {},
			documentPath: '/test/ollama-document.md',
			mcpManager: {},
			mcpExecutor: {}
		}

		// THEN: Should compile and have all expected fields
		expect(options.documentPath).toBe('/test/ollama-document.md')
		expect(options.baseURL).toBe('http://127.0.0.1:11434')
		expect(options.mcpManager).toBeDefined()
		expect(options.mcpExecutor).toBeDefined()
	})

	it('should have ollamaVendor with Tool Calling capability', async () => {
		// WHEN: Importing Ollama vendor
		const { ollamaVendor } = await import('../../src/providers/ollama')

		// THEN: Should have Tool Calling capability
		expect(ollamaVendor.capabilities).toContain('Tool Calling')
		expect(ollamaVendor.name).toBe('Ollama')
	})

	it('should have default model and local baseURL', async () => {
		// WHEN: Importing Ollama vendor
		const { ollamaVendor } = await import('../../src/providers/ollama')

		// THEN: Should have sensible defaults
		expect(ollamaVendor.defaultOptions.model).toBe('llama3.1')
		expect(ollamaVendor.defaultOptions.baseURL).toBe('http://127.0.0.1:11434')
		expect(ollamaVendor.defaultOptions.apiKey).toBe('') // No API key needed
	})

	it('should export OllamaProviderAdapter from mcp module', async () => {
		// WHEN: Importing MCP module
		const mcp = await import('../../src/mcp/index.js')

		// THEN: Should export Ollama adapter
		expect(mcp.OllamaProviderAdapter).toBeDefined()
		expect(mcp.OllamaToolResponseParser).toBeDefined()
	})

	it('should create OllamaProviderAdapter with minimal config', async () => {
		// GIVEN: MCP module
		const mcp = await import('../../src/mcp/index.js')

		// Mock dependencies
		const mockMcpManager = {
			listServers: vi.fn().mockReturnValue([]),
			getClient: vi.fn()
		}
		const mockMcpExecutor = {
			executeTool: vi.fn(),
			canExecute: vi.fn()
		}
		const mockOllamaClient = {
			chat: vi.fn(),
			abort: vi.fn()
		}

		// WHEN: Creating adapter
		const adapter = new mcp.OllamaProviderAdapter({
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			mcpManager: mockMcpManager as any,
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			mcpExecutor: mockMcpExecutor as any,
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			ollamaClient: mockOllamaClient as any,
			controller: new AbortController(),
			model: 'llama3.1'
		})

		// THEN: Should instantiate successfully
		expect(adapter).toBeDefined()
		expect(adapter.getParser).toBeDefined()
		expect(adapter.findServerId).toBeDefined()
		expect(adapter.formatToolResult).toBeDefined()
	})
})

describe('Ollama Tool Format Compatibility', () => {
	it('should parse Ollama tool call format correctly', async () => {
		// GIVEN: Ollama tool response parser
		const { OllamaToolResponseParser } = await import('../../src/mcp/toolResponseParser')
		const parser = new OllamaToolResponseParser()

		// Ollama format: arguments are already parsed objects
		const chunk = {
			message: {
				tool_calls: [{
					function: {
						name: 'get_weather',
						arguments: { location: 'London', units: 'celsius' } // Already parsed!
					}
				}]
			}
		}

		// WHEN: Parsing chunk
		const result = parser.parseChunk(chunk)

		// THEN: Should extract tool call
		expect(parser.hasCompleteToolCalls()).toBe(true)
		const toolCalls = parser.getToolCalls()
		expect(toolCalls).toHaveLength(1)
		expect(toolCalls[0].name).toBe('get_weather')
		expect(toolCalls[0].arguments).toEqual({ location: 'London', units: 'celsius' })
		expect(toolCalls[0].id).toBeDefined() // Synthetic ID generated
	})

	it('should handle text content in Ollama format', async () => {
		// GIVEN: Parser
		const { OllamaToolResponseParser } = await import('../../src/mcp/toolResponseParser')
		const parser = new OllamaToolResponseParser()

		const chunk = {
			message: {
				content: 'The weather in London is sunny.'
			}
		}

		// WHEN: Parsing
		const result = parser.parseChunk(chunk)

		// THEN: Should return text chunk
		expect(result).toEqual({
			type: 'text',
			content: 'The weather in London is sunny.'
		})
	})

	it('should handle multiple tool calls in one chunk', async () => {
		// GIVEN: Parser
		const { OllamaToolResponseParser } = await import('../../src/mcp/toolResponseParser')
		const parser = new OllamaToolResponseParser()

		// Ollama can send multiple tool calls at once
		const chunk = {
			message: {
				tool_calls: [
					{
						function: {
							name: 'get_weather',
							arguments: { location: 'NYC' }
						}
					},
					{
						function: {
							name: 'get_weather',
							arguments: { location: 'LA' }
						}
					}
				]
			}
		}

		// WHEN: Parsing
		parser.parseChunk(chunk)

		// THEN: Should extract both tool calls
		expect(parser.hasCompleteToolCalls()).toBe(true)
		const toolCalls = parser.getToolCalls()
		expect(toolCalls).toHaveLength(2)
		expect(toolCalls[0].name).toBe('get_weather')
		expect(toolCalls[0].arguments).toEqual({ location: 'NYC' })
		expect(toolCalls[1].name).toBe('get_weather')
		expect(toolCalls[1].arguments).toEqual({ location: 'LA' })
	})
})
