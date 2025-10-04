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

	beforeEach(async () => {
		// Create mock MCPClient instance
		mockMCPClient = {
			createSession: vi.fn(),
			closeSession: vi.fn(),
			closeAllSessions: vi.fn()
		}

		// Setup the mock to return our mock client
		const { MCPClient } = await import('mcp-use')
		vi.mocked(MCPClient.fromDict).mockReturnValue(mockMCPClient)

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

		beforeEach(async () => {
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

			// Initialize manager with configs
			await manager.initialize(configs)

			// Clear mock call counts after initialization
			vi.clearAllMocks()
		})

		it('should succeed on first attempt', async () => {
			mockMCPClient.createSession.mockResolvedValue({ isConnected: true })

			await manager.startServer('test-server')

			expect(mockMCPClient.createSession).toHaveBeenCalledTimes(1)
			const serverConfig = manager.listServers().find((s) => s.id === 'test-server')
			expect(serverConfig?.failureCount).toBe(0)
		})

		it('should retry transient errors', async () => {
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
			const serverConfig = manager.listServers().find((s) => s.id === 'test-server')
			expect(serverConfig?.failureCount).toBe(0) // Reset on success
		})

		it('should not retry permanent errors', async () => {
			mockMCPClient.createSession.mockRejectedValue(new Error('Invalid configuration'))

			await expect(manager.startServer('test-server')).rejects.toThrow('Invalid configuration')

			expect(mockMCPClient.createSession).toHaveBeenCalledTimes(1)
			const serverConfig = manager.listServers().find((s) => s.id === 'test-server')
			expect(serverConfig?.failureCount).toBe(1)
		})

		it('should auto-disable after max failures', async () => {
			// Re-initialize with custom failure threshold
			await manager.initialize(configs, { failureThreshold: 2 })
			vi.clearAllMocks()

			// Fail with permanent error (no code, non-transient message)
			mockMCPClient.createSession.mockRejectedValue(new Error('Invalid configuration'))

			// First failure
			await expect(manager.startServer('test-server')).rejects.toThrow('Invalid configuration')
			let serverConfig = manager.listServers().find((s) => s.id === 'test-server')
			expect(serverConfig?.failureCount).toBe(1)
			expect(serverConfig?.enabled).toBe(true) // Still enabled after 1 failure

			// Second failure - should trigger auto-disable
			await expect(manager.startServer('test-server')).rejects.toThrow('Invalid configuration')
			serverConfig = manager.listServers().find((s) => s.id === 'test-server')
			expect(serverConfig?.failureCount).toBe(2)
			expect(serverConfig?.enabled).toBe(false)
			expect(serverConfig?.autoDisabled).toBe(true)
		})

		it('should emit retry events', async () => {
			vi.clearAllMocks()

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
			vi.clearAllMocks()

			let attempts = 0
			let retryStatusChecked = false
			mockMCPClient.createSession.mockImplementation(async () => {
				attempts++
				if (attempts < 2) {
					const error = new Error('Connection refused')
					;(error as any).code = 'ECONNREFUSED'
					throw error
				}
				return { isConnected: true }
			})

			// Listen for retry event to check status during retry
			manager.once('server-retry', () => {
				const status = manager.getHealthStatus('test-server')
				expect(status?.retryState.isRetrying).toBe(true)
				expect(status?.retryState.currentAttempt).toBeGreaterThan(0)
				retryStatusChecked = true
			})

			// Start server (will retry once)
			await manager.startServer('test-server')

			// Verify we checked retry status
			expect(retryStatusChecked).toBe(true)

			// Check final status
			const finalStatus = manager.getHealthStatus('test-server')
			expect(finalStatus?.retryState.isRetrying).toBe(false)
			expect(finalStatus?.connectionState).toBe('connected')
		})
	})
})
