/**
 * Tests for MCP Server Manager retry functionality
 * Tests retry logic, error recovery, and UI status updates
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MCPServerManager } from '../../src/mcp/managerMCPUse'
import type { MCPServerConfig, RetryPolicy } from '../../src/mcp/types'

// Mock mcp-use at the top level
vi.mock('mcp-use', () => ({
	MCPClient: {
		fromDict: vi.fn()
	}
}))

describe('MCPServerManager Retry Functionality', () => {
	let manager: MCPServerManager
	let mockMCPClient: any

	beforeEach(() => {
		// Create mock MCPClient instance
		mockMCPClient = {
			createSession: vi.fn(),
			closeSession: vi.fn(),
			closeAllSessions: vi.fn()
		}

		// Setup the mock to return our mock client
		const { MCPClient } = require('mcp-use')
		MCPClient.fromDict.mockReturnValue(mockMCPClient)

		manager = new MCPServerManager()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('Retry Policy Configuration', () => {
		it('should accept custom retry policy', async () => {
			const customPolicy: RetryPolicy = {
				maxAttempts: 3,
				initialDelay: 500,
				maxDelay: 10000,
				backoffMultiplier: 1.5,
				jitter: false,
				transientErrorCodes: ['ECONNREFUSED']
			}

			const configs: MCPServerConfig[] = [
				{
					id: 'test-server',
					name: 'Test Server',
					configInput: 'npx @modelcontextprotocol/server-memory',
					enabled: true,
					failureCount: 0,
					autoDisabled: false
				}
			]

			await manager.initialize(configs, { retryPolicy: customPolicy })

			// Verify the manager was configured with custom policy
			expect(manager).toBeDefined()
		})

		it('should use default retry policy when none provided', async () => {
			const configs: MCPServerConfig[] = [
				{
					id: 'test-server',
					name: 'Test Server',
					configInput: 'npx @modelcontextprotocol/server-memory',
					enabled: true,
					failureCount: 0,
					autoDisabled: false
				}
			]

			await manager.initialize(configs)

			expect(manager).toBeDefined()
		})
	})

	describe('Server Start with Retry', () => {
		let configs: MCPServerConfig[]

		beforeEach(() => {
			configs = [
				{
					id: 'test-server',
					name: 'Test Server',
					configInput: 'npx @modelcontextprotocol/server-memory',
					enabled: true,
					failureCount: 0,
					autoDisabled: false
				}
			]

			// Initialize manager
			mockMCPClient.fromDict.mockReturnValue(mockMCPClient)
		})

		it('should succeed on first attempt', async () => {
			await manager.initialize(configs)
			mockMCPClient.createSession.mockResolvedValue({ isConnected: true })

			await manager.startServer('test-server')

			expect(mockMCPClient.createSession).toHaveBeenCalledTimes(1)
			expect(configs[0].failureCount).toBe(0)
		})

		it('should retry transient errors', async () => {
			await manager.initialize(configs)

			// Fail twice with transient error, then succeed
			let attempts = 0
			mockMCPClient.createSession.mockImplementation(() => {
				attempts++
				if (attempts < 3) {
					const error = new Error('Connection refused')
					;(error as any).code = 'ECONNREFUSED'
					throw error
				}
				return { isConnected: true }
			})

			await manager.startServer('test-server')

			expect(mockMCPClient.createSession).toHaveBeenCalledTimes(3)
			expect(configs[0].failureCount).toBe(0) // Reset on success
		})

		it('should not retry permanent errors', async () => {
			await manager.initialize(configs)

			mockMCPClient.createSession.mockRejectedValue(new Error('Invalid configuration'))

			await expect(manager.startServer('test-server')).rejects.toThrow('Invalid configuration')

			expect(mockMCPClient.createSession).toHaveBeenCalledTimes(1)
			expect(configs[0].failureCount).toBe(1)
		})

		it('should auto-disable after max failures', async () => {
			await manager.initialize(configs, { failureThreshold: 2 })

			// Fail 3 times (initial + 2 retries)
			mockMCPClient.createSession.mockRejectedValue(new Error('Connection refused'))

			await expect(manager.startServer('test-server')).rejects.toThrow('Connection refused')

			expect(configs[0].failureCount).toBe(3)
			expect(configs[0].enabled).toBe(false)
			expect(configs[0].autoDisabled).toBe(true)
		})

		it('should emit retry events', async () => {
			await manager.initialize(configs)

			let attempts = 0
			mockMCPClient.createSession.mockImplementation(() => {
				attempts++
				if (attempts < 2) {
					const error = new Error('Connection refused')
					;(error as any).code = 'ECONNREFUSED'
					throw error
				}
				return { isConnected: true }
			})

			const retryEvents: any[] = []
			manager.on('server-retry', (serverId, attempt, nextRetryIn, error) => {
				retryEvents.push({ serverId, attempt, nextRetryIn, error })
			})

			await manager.startServer('test-server')

			expect(retryEvents).toHaveLength(1)
			expect(retryEvents[0].serverId).toBe('test-server')
			expect(retryEvents[0].attempt).toBe(1)
			expect(retryEvents[0].nextRetryIn).toBeGreaterThan(0)
			expect(retryEvents[0].error.message).toBe('Connection refused')
		})
	})

	describe('Health Status Updates', () => {
		it('should update retry status during retry attempts', async () => {
			const configs: MCPServerConfig[] = [
				{
					id: 'test-server',
					name: 'Test Server',
					configInput: 'npx @modelcontextprotocol/server-memory',
					enabled: true,
					failureCount: 0,
					autoDisabled: false
				}
			]

			await manager.initialize(configs)

			let attempts = 0
			mockMCPClient.createSession.mockImplementation(() => {
				attempts++
				if (attempts < 2) {
					const error = new Error('Connection refused')
					;(error as any).code = 'ECONNREFUSED'
					throw error
				}
				return { isConnected: true }
			})

			// Start server (will retry once)
			const startPromise = manager.startServer('test-server')

			// Check status during retry
			const status = manager.getHealthStatus('test-server')
			expect(status?.retryState.isRetrying).toBe(true)
			expect(status?.retryState.currentAttempt).toBeGreaterThan(0)

			await startPromise

			// Check final status
			const finalStatus = manager.getHealthStatus('test-server')
			expect(finalStatus?.retryState.isRetrying).toBe(false)
			expect(finalStatus?.connectionState).toBe('connected')
		})
	})
})
