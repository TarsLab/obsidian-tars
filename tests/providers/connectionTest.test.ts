import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vendor } from '../../src/providers'
import { testProviderConnection } from '../../src/providers/utils'

describe('Provider Connection Testing', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// Reset fetch mock
		global.fetch = vi.fn()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('testProviderConnection', () => {
		it('should successfully test connection via model listing for OpenAI', async () => {
			// Arrange
			const mockVendor: Vendor = {
				name: 'OpenAI',
				defaultOptions: {
					apiKey: 'test-key',
					baseURL: 'https://api.openai.com/v1',
					model: 'gpt-4',
					parameters: {}
				},
				sendRequestFunc: vi.fn(),
				models: [],
				websiteToObtainKey: 'https://platform.openai.com',
				capabilities: ['Text Generation']
			}

			const mockOptions = {
				apiKey: 'sk-test-key-123',
				baseURL: 'https://api.openai.com/v1',
				model: 'gpt-4',
				parameters: {}
			}

			// Mock successful models list response
			;(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					data: [
						{ id: 'gpt-4', object: 'model' },
						{ id: 'gpt-3.5-turbo', object: 'model' }
					]
				})
			})

			const _startTime = Date.now()

			// Act
			const result = await testProviderConnection(mockVendor, mockOptions)

			// Assert
			expect(result.success).toBe(true)
			expect(result.message).toContain('Connected')
			expect(result.models).toHaveLength(2)
			expect(result.models).toContain('gpt-4')
			expect(result.models).toContain('gpt-3.5-turbo')
			expect(result.latency).toBeGreaterThanOrEqual(0)
			expect(result.latency).toBeLessThan(5000)
			expect(global.fetch).toHaveBeenCalledWith(
				'https://api.openai.com/v1/models',
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: 'Bearer sk-test-key-123'
					})
				})
			)
		})

		it('should fall back to echo test when model listing fails', async () => {
			// Arrange
			const mockVendor: Vendor = {
				name: 'CustomProvider',
				defaultOptions: {
					apiKey: 'test-key',
					baseURL: 'https://api.custom.com/v1',
					model: 'custom-model',
					parameters: {}
				},
				sendRequestFunc: vi.fn(),
				models: [],
				websiteToObtainKey: 'https://custom.com',
				capabilities: ['Text Generation']
			}

			const mockOptions = {
				apiKey: 'custom-key-123',
				baseURL: 'https://api.custom.com/v1',
				model: 'custom-model',
				parameters: {}
			}

			// Mock models endpoint failure (404)
			;(global.fetch as any)
				.mockResolvedValueOnce({
					ok: false,
					status: 404,
					statusText: 'Not Found'
				})
				// Mock successful echo/chat completion
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => ({
						choices: [{ message: { content: 'test response' } }]
					})
				})

			// Act
			const result = await testProviderConnection(mockVendor, mockOptions)

			// Assert
			expect(result.success).toBe(true)
			expect(result.message).toContain('Connected')
			expect(result.models).toBeUndefined()
			expect(result.latency).toBeGreaterThanOrEqual(0)
			expect(global.fetch).toHaveBeenCalledTimes(2) // Once for models, once for echo
		})

		it('should fail with clear message on invalid credentials', async () => {
			// Arrange
			const mockVendor: Vendor = {
				name: 'OpenAI',
				defaultOptions: {
					apiKey: '',
					baseURL: 'https://api.openai.com/v1',
					model: 'gpt-4',
					parameters: {}
				},
				sendRequestFunc: vi.fn(),
				models: [],
				websiteToObtainKey: 'https://platform.openai.com',
				capabilities: ['Text Generation']
			}

			const mockOptions = {
				apiKey: 'invalid-key',
				baseURL: 'https://api.openai.com/v1',
				model: 'gpt-4',
				parameters: {}
			}

			// Mock 401 Unauthorized response
			;(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 401,
				statusText: 'Unauthorized',
				json: async () => ({
					error: { message: 'Invalid API key' }
				})
			})

			// Act
			const result = await testProviderConnection(mockVendor, mockOptions)

			// Assert
			expect(result.success).toBe(false)
			expect(result.message).toContain('Invalid API key')
			expect(result.models).toBeUndefined()
			expect(result.latency).toBeUndefined()
		})

		it('should handle timeout errors gracefully', async () => {
			// Arrange
			const mockVendor: Vendor = {
				name: 'SlowProvider',
				defaultOptions: {
					apiKey: 'test-key',
					baseURL: 'https://api.slow.com/v1',
					model: 'slow-model',
					parameters: {}
				},
				sendRequestFunc: vi.fn(),
				models: [],
				websiteToObtainKey: 'https://slow.com',
				capabilities: ['Text Generation']
			}

			const mockOptions = {
				apiKey: 'test-key',
				baseURL: 'https://api.slow.com/v1',
				model: 'slow-model',
				parameters: {}
			}

			// Mock timeout error
			;(global.fetch as any).mockRejectedValueOnce(new Error('Request timeout'))

			// Act
			const result = await testProviderConnection(mockVendor, mockOptions)

			// Assert
			expect(result.success).toBe(false)
			expect(result.message).toContain('timeout')
			expect(result.models).toBeUndefined()
			expect(result.latency).toBeUndefined()
		})

		it('should handle network errors with helpful messages', async () => {
			// Arrange
			const mockVendor: Vendor = {
				name: 'Ollama',
				defaultOptions: {
					apiKey: '',
					baseURL: 'http://127.0.0.1:11434',
					model: 'llama3.1',
					parameters: {}
				},
				sendRequestFunc: vi.fn(),
				models: [],
				websiteToObtainKey: 'https://ollama.com',
				capabilities: ['Text Generation']
			}

			const mockOptions = {
				apiKey: '',
				baseURL: 'http://127.0.0.1:11434',
				model: 'llama3.1',
				parameters: {}
			}

			// Mock network error (ECONNREFUSED)
			;(global.fetch as any).mockRejectedValueOnce(
				Object.assign(new Error('Failed to fetch'), {
					cause: { code: 'ECONNREFUSED' }
				})
			)

			// Act
			const result = await testProviderConnection(mockVendor, mockOptions)

			// Assert
			expect(result.success).toBe(false)
			expect(result.message).toMatch(/connection|refused|running/i)
			expect(result.models).toBeUndefined()
		})

		it('should successfully test Ollama using tags endpoint', async () => {
			// Arrange
			const mockVendor: Vendor = {
				name: 'Ollama',
				defaultOptions: {
					apiKey: '',
					baseURL: 'http://127.0.0.1:11434',
					model: 'llama3.1',
					parameters: {}
				},
				sendRequestFunc: vi.fn(),
				models: [],
				websiteToObtainKey: 'https://ollama.com',
				capabilities: ['Text Generation']
			}

			const mockOptions = {
				apiKey: '',
				baseURL: 'http://127.0.0.1:11434',
				model: 'llama3.1',
				parameters: {}
			}

			// Mock Ollama tags endpoint response
			;(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					models: [
						{ name: 'llama3.1:latest', size: 4661224384 },
						{ name: 'llama3.2:latest', size: 2019393792 }
					]
				})
			})

			// Act
			const result = await testProviderConnection(mockVendor, mockOptions)

			// Assert
			expect(result.success).toBe(true)
			expect(result.message).toContain('Connected')
			expect(result.models).toHaveLength(2)
			expect(result.models).toContain('llama3.1:latest')
			expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:11434/api/tags', expect.any(Object))
		})

		it('should successfully test Claude with minimal message', async () => {
			// Arrange
			const mockVendor: Vendor = {
				name: 'Claude',
				defaultOptions: {
					apiKey: 'test-key',
					baseURL: 'https://api.anthropic.com',
					model: 'claude-3-5-sonnet-latest',
					parameters: {}
				},
				sendRequestFunc: vi.fn(),
				models: [],
				websiteToObtainKey: 'https://console.anthropic.com',
				capabilities: ['Text Generation']
			}

			const mockOptions = {
				apiKey: 'sk-ant-test-key',
				baseURL: 'https://api.anthropic.com',
				model: 'claude-3-5-sonnet-latest',
				parameters: {}
			}

			// Mock models endpoint not available (404)
			;(global.fetch as any)
				.mockResolvedValueOnce({
					ok: false,
					status: 404
				})
				// Mock successful minimal message
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => ({
						id: 'msg_test',
						type: 'message',
						role: 'assistant',
						content: [{ type: 'text', text: 'Hello' }]
					})
				})

			// Act
			const result = await testProviderConnection(mockVendor, mockOptions)

			// Assert
			expect(result.success).toBe(true)
			expect(result.message).toContain('Connected')
			expect(result.latency).toBeGreaterThanOrEqual(0)
			// Claude-specific headers should be present
			expect(global.fetch).toHaveBeenCalledWith(
				expect.stringContaining('anthropic.com'),
				expect.objectContaining({
					headers: expect.objectContaining({
						'x-api-key': 'sk-ant-test-key',
						'anthropic-version': expect.any(String)
					})
				})
			)
		})

		it('should complete within 5 seconds or return timeout', async () => {
			// Arrange
			const mockVendor: Vendor = {
				name: 'TestProvider',
				defaultOptions: {
					apiKey: 'test',
					baseURL: 'https://api.test.com',
					model: 'test',
					parameters: {}
				},
				sendRequestFunc: vi.fn(),
				models: [],
				websiteToObtainKey: 'https://test.com',
				capabilities: ['Text Generation']
			}

			const mockOptions = {
				apiKey: 'test',
				baseURL: 'https://api.test.com',
				model: 'test',
				parameters: {}
			}

			// Mock slow response that respects abort signal
			;(global.fetch as any).mockImplementation(
				(_url: string, options: { signal?: AbortSignal }) =>
					new Promise((resolve, reject) => {
						const timeoutId = setTimeout(
							() =>
								resolve({
									ok: true,
									status: 200,
									json: async () => ({ data: [] })
								}),
							6000
						)

						// Listen for abort signal
						if (options.signal) {
							options.signal.addEventListener('abort', () => {
								clearTimeout(timeoutId)
								const error = new Error('The operation was aborted')
								error.name = 'AbortError'
								reject(error)
							})
						}
					})
			)

			// Act
			const startTime = Date.now()
			const result = await testProviderConnection(mockVendor, mockOptions)
			const duration = Date.now() - startTime

			// Assert
			expect(duration).toBeLessThan(5500) // Should timeout before 6 seconds
			expect(result.success).toBe(false)
			expect(result.message).toMatch(/timeout/i)
		})
	})
})
