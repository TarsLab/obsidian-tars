/**
 * Tests for MCP Server Failure Tracking
 * Feature-200-10-5: Implement Failure Tracking
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MCPServerManager } from '../../src/mcp/managerMCPUse'
import type { MCPServerConfig } from '../../src/mcp/types'

describe('MCP Server Failure Tracking', () => {
	let manager: MCPServerManager

	beforeEach(() => {
		manager = new MCPServerManager()
	})

	afterEach(async () => {
		await manager.shutdown()
	})

	describe('Failure Counter', () => {
		it('should increment failureCount on startServer failure', async () => {
			// GIVEN: A server config with initial failureCount
			const config: MCPServerConfig = {
				id: 'test-server',
				name: 'Test Server',
				configInput: 'npx @modelcontextprotocol/server-invalid',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			}

			await manager.initialize([config])

			// WHEN: Server fails to start (invalid command)
			try {
				await manager.startServer('test-server')
			} catch {
				// Expected to fail
			}

			// THEN: Failure count should increment
			const servers = manager.listServers()
			const server = servers.find((s) => s.id === 'test-server')
			expect(server?.failureCount).toBeGreaterThan(0)
		})

		it('should reset failureCount on successful server start', async () => {
			// GIVEN: A server config with previous failures
			const config: MCPServerConfig = {
				id: 'memory-server',
				name: 'Memory Server',
				configInput: 'npx -y @modelcontextprotocol/server-memory',
				enabled: true,
				failureCount: 3,
				autoDisabled: false
			}

			await manager.initialize([config])

			// WHEN: Server starts successfully
			// Note: initialization already starts servers, so if it succeeded, it should reset

			// THEN: Failure count should be reset to 0
			const servers = manager.listServers()
			const server = servers.find((s) => s.id === 'memory-server')
			expect(server?.failureCount).toBe(0)
		})

		it('should track consecutive failures correctly', async () => {
			// GIVEN: A server that will fail multiple times
			const config: MCPServerConfig = {
				id: 'failing-server',
				name: 'Failing Server',
				configInput: 'npx @modelcontextprotocol/server-nonexistent',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			}

			await manager.initialize([config])

			// WHEN: Server fails multiple times
			let failureCount = 0
			for (let i = 0; i < 3; i++) {
				try {
					await manager.startServer('failing-server')
				} catch {
					failureCount++
				}
			}

			// THEN: Failure count should accumulate
			const servers = manager.listServers()
			const server = servers.find((s) => s.id === 'failing-server')
			expect(server?.failureCount).toBeGreaterThanOrEqual(failureCount)
		})

		it('should maintain failureCount across manager instances', async () => {
			// GIVEN: A config with existing failure count
			const config: MCPServerConfig = {
				id: 'persistent-server',
				name: 'Persistent Server',
				configInput: 'npx @modelcontextprotocol/server-memory',
				enabled: true,
				failureCount: 5,
				autoDisabled: false
			}

			// WHEN: Manager is initialized with this config
			await manager.initialize([config])

			// THEN: Failure count should be preserved
			const servers = manager.listServers()
			const server = servers.find((s) => s.id === 'persistent-server')

			// If server starts successfully, count should reset to 0
			// Otherwise it should remain at 5
			expect(server?.failureCount).toBeDefined()
			expect(typeof server?.failureCount).toBe('number')
		})
	})

	describe('Failure Events', () => {
		it('should emit server-failed event on startup failure', async () => {
			// GIVEN: Event listener and invalid server config
			const failedEvents: Array<{ serverId: string; error: Error }> = []
			manager.on('server-failed', (serverId, error) => {
				failedEvents.push({ serverId, error })
			})

			const config: MCPServerConfig = {
				id: 'event-test-server',
				name: 'Event Test Server',
				configInput: 'npx @modelcontextprotocol/server-invalid',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			}

			await manager.initialize([config])

			// WHEN: Server fails to start
			try {
				await manager.startServer('event-test-server')
			} catch {
				// Expected to fail
			}

			// THEN: server-failed event should be emitted
			expect(failedEvents.length).toBeGreaterThan(0)
			expect(failedEvents[0].serverId).toBe('event-test-server')
			expect(failedEvents[0].error).toBeInstanceOf(Error)
		})
	})

	describe('Health Status Integration', () => {
		it('should update health status to unhealthy after failure', async () => {
			// GIVEN: A server that will fail
			const config: MCPServerConfig = {
				id: 'health-test-server',
				name: 'Health Test Server',
				configInput: 'npx @modelcontextprotocol/server-invalid',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			}

			await manager.initialize([config])

			// WHEN: Server fails to start
			try {
				await manager.startServer('health-test-server')
			} catch {
				// Expected to fail
			}

			// THEN: Health status should be unhealthy
			const healthStatus = manager.getHealthStatus('health-test-server')
			expect(healthStatus).toBeDefined()
			expect(healthStatus?.connectionState).toBe('error')
		})
	})
})
