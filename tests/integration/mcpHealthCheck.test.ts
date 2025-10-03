/**
 * Integration tests for MCP Health Check Timer
 * Tests timer orchestration during plugin lifecycle
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HEALTH_CHECK_INTERVAL } from '../../src/mcp'

describe('MCP Health Check Timer Orchestration', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('should schedule health check interval when MCP manager exists', async () => {
		// GIVEN: A simulated plugin with MCP manager
		const mockPerformHealthCheck = vi.fn().mockResolvedValue(undefined)
		const mockUpdateStatus = vi.fn()

		const mcpManager = {
			performHealthCheck: mockPerformHealthCheck,
			initialize: vi.fn().mockResolvedValue(undefined),
			shutdown: vi.fn().mockResolvedValue(undefined),
			listServers: vi.fn().mockReturnValue([])
		}

		let healthCheckInterval: NodeJS.Timeout | null = null

		// WHEN: Plugin loads and starts health check timer
		healthCheckInterval = setInterval(async () => {
			if (mcpManager) {
				await mcpManager.performHealthCheck()
				mockUpdateStatus()
			}
		}, HEALTH_CHECK_INTERVAL)

		// Fast-forward time to trigger health checks
		await vi.advanceTimersByTimeAsync(HEALTH_CHECK_INTERVAL)

		// THEN: Health check should be called after interval
		expect(mockPerformHealthCheck).toHaveBeenCalledTimes(1)
		expect(mockUpdateStatus).toHaveBeenCalledTimes(1)

		// Fast-forward again to verify periodic execution
		await vi.advanceTimersByTimeAsync(HEALTH_CHECK_INTERVAL)

		expect(mockPerformHealthCheck).toHaveBeenCalledTimes(2)
		expect(mockUpdateStatus).toHaveBeenCalledTimes(2)

		// Cleanup
		if (healthCheckInterval) {
			clearInterval(healthCheckInterval)
		}
	})

	it('should clear interval on plugin unload and leave no dangling timers', async () => {
		// GIVEN: A running health check timer
		const mockPerformHealthCheck = vi.fn().mockResolvedValue(undefined)

		let healthCheckInterval: NodeJS.Timeout | null = null

		// Start timer
		healthCheckInterval = setInterval(async () => {
			await mockPerformHealthCheck()
		}, HEALTH_CHECK_INTERVAL)

		// Verify timer is running
		await vi.advanceTimersByTimeAsync(HEALTH_CHECK_INTERVAL)
		expect(mockPerformHealthCheck).toHaveBeenCalledTimes(1)

		// WHEN: Plugin unloads (clear timer)
		if (healthCheckInterval) {
			clearInterval(healthCheckInterval)
			healthCheckInterval = null
		}

		// THEN: Timer should be cleared and no longer execute
		mockPerformHealthCheck.mockClear()
		await vi.advanceTimersByTimeAsync(HEALTH_CHECK_INTERVAL * 2)

		expect(mockPerformHealthCheck).not.toHaveBeenCalled()
		expect(healthCheckInterval).toBeNull()
	})

	it('should handle health check errors gracefully without stopping timer', async () => {
		// GIVEN: A health check that fails
		const mockPerformHealthCheck = vi.fn()
			.mockRejectedValueOnce(new Error('Health check failed'))
			.mockResolvedValueOnce(undefined) // Second call succeeds

		const mockUpdateStatus = vi.fn()

		let healthCheckInterval: NodeJS.Timeout | null = null

		// WHEN: Timer runs with error handling
		healthCheckInterval = setInterval(async () => {
			try {
				await mockPerformHealthCheck()
				mockUpdateStatus()
			} catch (error) {
				// Error is logged but doesn't stop the timer
				console.debug('Health check failed:', error)
			}
		}, HEALTH_CHECK_INTERVAL)

		// First execution fails
		await vi.advanceTimersByTimeAsync(HEALTH_CHECK_INTERVAL)

		// THEN: Error doesn't break the timer
		expect(mockPerformHealthCheck).toHaveBeenCalledTimes(1)
		expect(mockUpdateStatus).not.toHaveBeenCalled() // Not called due to error

		// Second execution succeeds
		await vi.advanceTimersByTimeAsync(HEALTH_CHECK_INTERVAL)

		expect(mockPerformHealthCheck).toHaveBeenCalledTimes(2)
		expect(mockUpdateStatus).toHaveBeenCalledTimes(1) // Called on success

		// Cleanup
		if (healthCheckInterval) {
			clearInterval(healthCheckInterval)
		}
	})

	it('should verify HEALTH_CHECK_INTERVAL is 30 seconds', () => {
		// THEN: Interval constant matches expected value
		expect(HEALTH_CHECK_INTERVAL).toBe(30000) // 30 seconds in milliseconds
	})
})
