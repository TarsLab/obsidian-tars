/**
 * Provider Tool Integration Tests
 *
 * Validates that MCP tools can be properly formatted for all supported providers
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	buildClaudeTools,
	buildOllamaTools,
	buildOpenAITools,
	buildToolsForProvider,
	getToolCallingModels,
	injectMCPTools,
	providerSupportsTools
} from '../../src/mcp'
import { ToolExecutor } from '../../src/mcp/executor'
import { MCPServerManager } from '../../src/mcp/managerMCPUse'

// Mock mcp-use
vi.mock('mcp-use', () => {
	const mockTools = [
		{
			name: 'calculate',
			description: 'Perform calculations',
			inputSchema: {
				type: 'object',
				properties: {
					operation: { type: 'string' },
					numbers: { type: 'array', items: { type: 'number' } }
				}
			}
		}
	]

	const mockSession = {
		isConnected: true,
		connector: {
			tools: mockTools,
			callTool: vi.fn()
		},
		connect: vi.fn(),
		disconnect: vi.fn(),
		initialize: vi.fn()
	}

	return {
		MCPClient: {
			fromDict: vi.fn(() => ({
				createSession: vi.fn().mockResolvedValue(mockSession),
				closeSession: vi.fn(),
				closeAllSessions: vi.fn()
			}))
		},
		MCPSession: vi.fn(() => mockSession)
	}
})

describe('Provider Tool Integration', () => {
	let manager: MCPServerManager
	let executor: ToolExecutor

	beforeEach(async () => {
		manager = new MCPServerManager()
		executor = new ToolExecutor(manager)

		await manager.initialize([
			{
				id: 'test-server',
				name: 'Test Server',
				configInput: 'npx -y @modelcontextprotocol/server-test',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			}
		])
	})

	describe('buildOllamaTools', () => {
		it('should build Ollama-format tools', async () => {
			const tools = await buildOllamaTools(manager, executor)

			expect(tools).toHaveLength(1)
			expect(tools[0]).toEqual({
				type: 'function',
				function: {
					name: 'calculate',
					description: 'Perform calculations',
					parameters: {
						type: 'object',
						properties: {
							operation: { type: 'string' },
							numbers: { type: 'array', items: { type: 'number' } }
						}
					}
				}
			})
		})
	})

	describe('buildOpenAITools', () => {
		it('should build OpenAI-format tools', async () => {
			const tools = await buildOpenAITools(manager, executor)

			expect(tools).toHaveLength(1)
			expect(tools[0]).toEqual({
				type: 'function',
				function: {
					name: 'calculate',
					description: 'Perform calculations',
					parameters: {
						type: 'object',
						properties: {
							operation: { type: 'string' },
							numbers: { type: 'array', items: { type: 'number' } }
						}
					}
				}
			})
		})
	})

	describe('buildClaudeTools', () => {
		it('should build Claude-format tools', async () => {
			const tools = await buildClaudeTools(manager, executor)

			expect(tools).toHaveLength(1)
			expect(tools[0]).toEqual({
				name: 'calculate',
				description: 'Perform calculations',
				input_schema: {
					type: 'object',
					properties: {
						operation: { type: 'string' },
						numbers: { type: 'array', items: { type: 'number' } }
					}
				}
			})
		})
	})

	describe('buildToolsForProvider', () => {
		it('should return Ollama format for Ollama provider', async () => {
			const tools = await buildToolsForProvider('Ollama', manager, executor)
			expect(tools[0]).toHaveProperty('type', 'function')
			expect(tools[0]).toHaveProperty('function')
		})

		it('should return Claude format for Claude provider', async () => {
			const tools = await buildToolsForProvider('Claude', manager, executor)
			expect(tools[0]).toHaveProperty('name')
			expect(tools[0]).toHaveProperty('input_schema')
			expect(tools[0]).not.toHaveProperty('type')
		})

		it('should return OpenAI format for unknown providers', async () => {
			const tools = await buildToolsForProvider('SomeProvider', manager, executor)
			expect(tools[0]).toHaveProperty('type', 'function')
			expect(tools[0]).toHaveProperty('function')
		})

		it('should return OpenAI format for OpenAI', async () => {
			const tools = await buildToolsForProvider('OpenAI', manager, executor)
			expect(tools[0]).toHaveProperty('type', 'function')
		})

		it('should return OpenAI format for Azure', async () => {
			const tools = await buildToolsForProvider('Azure OpenAI', manager, executor)
			expect(tools[0]).toHaveProperty('type', 'function')
		})

		it('should return OpenAI format for DeepSeek', async () => {
			const tools = await buildToolsForProvider('DeepSeek', manager, executor)
			expect(tools[0]).toHaveProperty('type', 'function')
		})
	})

	describe('injectMCPTools', () => {
		it('should inject tools into parameters', async () => {
			const params = { model: 'llama3.2', temperature: 0.7 }
			const withTools = await injectMCPTools(params, 'Ollama', manager, executor)

			expect(withTools).toHaveProperty('model', 'llama3.2')
			expect(withTools).toHaveProperty('temperature', 0.7)
			expect(withTools).toHaveProperty('tools')
			expect(Array.isArray(withTools.tools)).toBe(true)
			// biome-ignore lint/suspicious/noExplicitAny: test assertion
			expect((withTools.tools as any[]).length).toBe(1)
		})

		it('should preserve existing parameters', async () => {
			const params = {
				model: 'gpt-4',
				temperature: 0.5,
				max_tokens: 1000,
				custom_field: 'value'
			}
			const withTools = await injectMCPTools(params, 'OpenAI', manager, executor)

			expect(withTools.model).toBe('gpt-4')
			expect(withTools.temperature).toBe(0.5)
			expect(withTools.max_tokens).toBe(1000)
			expect(withTools.custom_field).toBe('value')
		})
	})

	describe('providerSupportsTools', () => {
		it('should return true for Ollama', () => {
			expect(providerSupportsTools('Ollama')).toBe(true)
		})

		it('should return true for OpenAI', () => {
			expect(providerSupportsTools('OpenAI')).toBe(true)
		})

		it('should return true for Claude', () => {
			expect(providerSupportsTools('Claude')).toBe(true)
			expect(providerSupportsTools('Anthropic')).toBe(true)
		})

		it('should return true for supported providers', () => {
			expect(providerSupportsTools('Azure OpenAI')).toBe(true)
			expect(providerSupportsTools('OpenRouter')).toBe(true)
			expect(providerSupportsTools('DeepSeek')).toBe(true)
			expect(providerSupportsTools('Grok')).toBe(true)
			expect(providerSupportsTools('Gemini')).toBe(true)
		})

		it('should return false for unsupported providers', () => {
			expect(providerSupportsTools('UnknownProvider')).toBe(false)
			expect(providerSupportsTools('RandomAI')).toBe(false)
		})
	})

	describe('getToolCallingModels', () => {
		it('should return Ollama models', () => {
			const models = getToolCallingModels('Ollama')
			expect(models).toContain('llama3.2:3b')
			expect(models).toContain('llama3.2')
		})

		it('should return OpenAI models', () => {
			const models = getToolCallingModels('OpenAI')
			expect(models).toContain('gpt-4')
			expect(models).toContain('gpt-4-turbo')
		})

		it('should return Claude models', () => {
			const models = getToolCallingModels('Claude')
			expect(models).toContain('claude-3-opus')
			expect(models).toContain('claude-3-sonnet')
		})

		it('should return Gemini models', () => {
			const models = getToolCallingModels('Gemini')
			expect(models).toContain('gemini-pro')
		})

		it('should return empty array for unknown providers', () => {
			const models = getToolCallingModels('UnknownProvider')
			expect(models).toEqual([])
		})
	})
})
