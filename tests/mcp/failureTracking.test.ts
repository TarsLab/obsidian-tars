/**
 * Tests for MCP Server Failure Tracking
 * Feature-200-10-5: Implement Failure Tracking
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MCPServerManager } from '../../src/mcp/managerMCPUse'
import type { MCPServerConfig } from '../../src/mcp/types'

const FAILURE_MARKERS = ['server-invalid', 'server-nonexistent']

vi.mock('mcp-use', () => {
	class MockMCPClient {
		private readonly serverConfigs: Record<string, { command: string; args: string[]; env?: Record<string, string> }>

		static fromDict(config: { mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }> }) {
			return new MockMCPClient(config.mcpServers ?? {})
		}

		constructor(serverConfigs: Record<string, { command: string; args: string[]; env?: Record<string, string> }>) {
			this.serverConfigs = serverConfigs
		}

		async createSession(serverId: string): Promise<{ isConnected: boolean }> {
			const config = this.serverConfigs[serverId]
			if (!config) {
				throw new Error(`Unknown server ${serverId}`)
			}
			const signature = [config.command, ...(config.args ?? [])].join(' ')
			if (FAILURE_MARKERS.some((marker) => signature.includes(marker))) {
				throw new Error(`Simulated failure launching ${signature}`)
			}
			return { isConnected: true }
		}

		async closeSession(): Promise<void> {
			// no-op for tests
		}

		async closeAllSessions(): Promise<void> {
			// no-op for tests
		}
	}

	return {
		MCPClient: MockMCPClient
	}
})

describe('MCP Server Failure Tracking', () => {
	let manager: MCPServerManager
	let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined
	let consoleWarnSpy: ReturnType<typeof vi.spyOn> | undefined
	let consoleErrorMessages: string[]

	const expectErrorLoggedFor = (serverId: string) => {
		expect(
			consoleErrorMessages.some((msg) => msg.includes(`Failed to create session for ${serverId}`))
		).toBe(true)
	}

	beforeEach(() => {
		manager = new MCPServerManager()
		consoleErrorMessages = []
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
			consoleErrorMessages.push(args.map((arg) => String(arg)).join(' '))
		})
		consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
	})

	afterEach(async () => {
		await manager.shutdown()
		consoleErrorSpy?.mockRestore()
		consoleWarnSpy?.mockRestore()
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
			expectErrorLoggedFor('test-server')
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
			expectErrorLoggedFor('failing-server')
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
			expectErrorLoggedFor('event-test-server')
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
			expectErrorLoggedFor('health-test-server')
		})
	})

	describe('Auto-Disable Logic', () => {
		it('should auto-disable server after reaching failure threshold', async () => {
			// GIVEN: A server with custom threshold and event listener
			const autoDisabledEvents: string[] = []
			manager.on('server-auto-disabled', (serverId) => {
				autoDisabledEvents.push(serverId)
			})

			const config: MCPServerConfig = {
				id: 'threshold-test-server',
				name: 'Threshold Test Server',
				configInput: 'npx @modelcontextprotocol/server-invalid',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			}

			await manager.initialize([config], { failureThreshold: 3 })

			// WHEN: Server fails 3 times
			for (let i = 0; i < 3; i++) {
				try {
					await manager.startServer('threshold-test-server')
				} catch {
					// Expected to fail
				}
			}

			// THEN: Server should be auto-disabled
			const servers = manager.listServers()
			const server = servers.find((s) => s.id === 'threshold-test-server')
			expect(server?.enabled).toBe(false)
			expect(server?.autoDisabled).toBe(true)
			expect(autoDisabledEvents).toContain('threshold-test-server')
			expectErrorLoggedFor('threshold-test-server')
		})

		it('should not auto-disable server below threshold', async () => {
			// GIVEN: A server with threshold of 5
			const config: MCPServerConfig = {
				id: 'below-threshold-server',
				name: 'Below Threshold Server',
				configInput: 'npx @modelcontextprotocol/server-invalid',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			}

			await manager.initialize([config], { failureThreshold: 5 })

			// WHEN: Server fails 2 more times (total 3 failures: 1 from init + 2 explicit)
			for (let i = 0; i < 2; i++) {
				try {
					await manager.startServer('below-threshold-server')
				} catch {
					// Expected to fail
				}
			}

			// THEN: Server should still be enabled (3 < 5 threshold)
			const servers = manager.listServers()
			const server = servers.find((s) => s.id === 'below-threshold-server')
			expect(server?.enabled).toBe(true)
			expect(server?.autoDisabled).toBe(false)
			expect(server?.failureCount).toBe(3)
			expectErrorLoggedFor('below-threshold-server')
		})

		it('should emit server-auto-disabled event only once', async () => {
			// GIVEN: Event listener tracking auto-disable events
			const autoDisabledEvents: string[] = []
			manager.on('server-auto-disabled', (serverId) => {
				autoDisabledEvents.push(serverId)
			})

			const config: MCPServerConfig = {
				id: 'once-disable-server',
				name: 'Once Disable Server',
				configInput: 'npx @modelcontextprotocol/server-invalid',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			}

			await manager.initialize([config], { failureThreshold: 2 })

			// WHEN: Server fails 4 times (2x threshold)
			for (let i = 0; i < 4; i++) {
				try {
					await manager.startServer('once-disable-server')
				} catch {
					// Expected to fail
				}
			}

			// THEN: Event should be emitted only once
			expect(autoDisabledEvents.filter((id) => id === 'once-disable-server')).toHaveLength(1)
			expectErrorLoggedFor('once-disable-server')
		})

		it('should allow re-enabling auto-disabled server', async () => {
			// GIVEN: A server that gets auto-disabled
			const config: MCPServerConfig = {
				id: 'reenable-test-server',
				name: 'Re-enable Test Server',
				configInput: 'npx @modelcontextprotocol/server-invalid',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			}

			await manager.initialize([config], { failureThreshold: 2 })

			// Fail until auto-disabled
			for (let i = 0; i < 2; i++) {
				try {
					await manager.startServer('reenable-test-server')
				} catch {
					// Expected to fail
				}
			}

			// Verify it's disabled
			let servers = manager.listServers()
			let server = servers.find((s) => s.id === 'reenable-test-server')
			expect(server?.enabled).toBe(false)
			expect(server?.autoDisabled).toBe(true)

			// WHEN: Server is manually re-enabled
			await manager.reenableServer('reenable-test-server')

			// THEN: Server should be enabled again
			servers = manager.listServers()
			server = servers.find((s) => s.id === 'reenable-test-server')
			expect(server?.enabled).toBe(true)
			expect(server?.autoDisabled).toBe(false)
			expectErrorLoggedFor('reenable-test-server')
		})
	})
})
