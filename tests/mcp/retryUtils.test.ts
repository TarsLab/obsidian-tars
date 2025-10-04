/**
 * Tests for MCP retry utilities
 * Tests exponential backoff, error classification, and retry logic
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	calculateRetryDelay,
	createInitialRetryState,
	DEFAULT_RETRY_POLICY,
	isTransientError,
	type RetryPolicy,
	updateRetryState,
	withRetry
} from '../../src/mcp/retryUtils'

describe('Retry Utilities', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.restoreAllMocks()
		vi.useRealTimers()
	})

	describe('DEFAULT_RETRY_POLICY', () => {
		it('should have sensible default values', () => {
			expect(DEFAULT_RETRY_POLICY.maxAttempts).toBe(5)
			expect(DEFAULT_RETRY_POLICY.initialDelay).toBe(1000)
			expect(DEFAULT_RETRY_POLICY.maxDelay).toBe(30000)
			expect(DEFAULT_RETRY_POLICY.backoffMultiplier).toBe(2)
			expect(DEFAULT_RETRY_POLICY.jitter).toBe(true)
			expect(DEFAULT_RETRY_POLICY.transientErrorCodes).toContain('ECONNREFUSED')
			expect(DEFAULT_RETRY_POLICY.transientErrorCodes).toContain('ETIMEDOUT')
		})
	})

	describe('isTransientError', () => {
		const policy: RetryPolicy = {
			...DEFAULT_RETRY_POLICY,
			transientErrorCodes: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']
		}

		it('should identify transient errors by code', () => {
			const error = new Error('Connection refused')
			;(error as any).code = 'ECONNREFUSED'

			expect(isTransientError(error, policy)).toBe(true)
		})

		it('should identify transient errors by errno', () => {
			const error = new Error('Connection timeout')
			;(error as any).errno = 'ETIMEDOUT'

			expect(isTransientError(error, policy)).toBe(true)
		})

		it('should identify transient errors by message pattern', () => {
			const error = new Error('Connection refused by server')

			expect(isTransientError(error, policy)).toBe(true)
		})

		it('should not retry permanent errors', () => {
			const error = new Error('Invalid credentials')

			expect(isTransientError(error, policy)).toBe(false)
		})

		it('should handle errors without code property', () => {
			const error = new Error('Some other error')

			expect(isTransientError(error, policy)).toBe(false)
		})
	})

	describe('calculateRetryDelay', () => {
		it('should calculate exponential backoff without jitter', () => {
			const policy: RetryPolicy = {
				...DEFAULT_RETRY_POLICY,
				jitter: false
			}

			expect(calculateRetryDelay(1, policy)).toBe(1000) // 1 * 1000
			expect(calculateRetryDelay(2, policy)).toBe(2000) // 2 * 1000
			expect(calculateRetryDelay(3, policy)).toBe(4000) // 4 * 1000
			expect(calculateRetryDelay(4, policy)).toBe(8000) // 8 * 1000
		})

		it('should respect max delay', () => {
			const policy: RetryPolicy = {
				...DEFAULT_RETRY_POLICY,
				jitter: false,
				maxDelay: 5000
			}

			expect(calculateRetryDelay(10, policy)).toBe(5000) // capped at maxDelay
		})

		it('should add jitter when enabled', () => {
			const policy: RetryPolicy = {
				...DEFAULT_RETRY_POLICY,
				jitter: true,
				initialDelay: 1000,
				backoffMultiplier: 1 // no backoff for testing
			}

			const delay = calculateRetryDelay(1, policy)
			expect(delay).toBeGreaterThanOrEqual(750) // 1000 * 0.75
			expect(delay).toBeLessThanOrEqual(1250) // 1000 * 1.25
		})
	})

	describe('createInitialRetryState', () => {
		it('should create initial retry state', () => {
			const state = createInitialRetryState()

			expect(state.isRetrying).toBe(false)
			expect(state.currentAttempt).toBe(0)
			expect(state.backoffIntervals).toEqual([])
			expect(state.nextRetryAt).toBeUndefined()
			expect(state.lastError).toBeUndefined()
		})
	})

	describe('updateRetryState', () => {
		it('should update state for next retry attempt', () => {
			const initialState = createInitialRetryState()
			const error = new Error('Connection failed')
			const policy: RetryPolicy = {
				...DEFAULT_RETRY_POLICY,
				jitter: false
			}

			const newState = updateRetryState(initialState, error, policy)

			expect(newState.isRetrying).toBe(true)
			expect(newState.currentAttempt).toBe(1)
			expect(newState.backoffIntervals).toEqual([1000])
			expect(newState.nextRetryAt).toBeDefined()
			expect(newState.lastError).toBe(error)
		})

		it('should stop retrying after max attempts', () => {
			const state = {
				isRetrying: true,
				currentAttempt: 5,
				backoffIntervals: [1000, 2000, 4000, 8000, 16000],
				nextRetryAt: Date.now() + 1000
			}
			const error = new Error('Still failing')
			const policy = DEFAULT_RETRY_POLICY

			const newState = updateRetryState(state, error, policy)

			expect(newState.isRetrying).toBe(false)
			expect(newState.currentAttempt).toBe(6)
			expect(newState.lastError).toBe(error)
		})
	})

	describe('withRetry', () => {
		beforeEach(() => {
			vi.useFakeTimers()
		})

		afterEach(() => {
			vi.restoreAllMocks()
		})

		it('should succeed on first attempt', async () => {
			const fn = vi.fn().mockResolvedValue('success')
			const policy = DEFAULT_RETRY_POLICY

			const result = await withRetry(fn, policy)

			expect(result).toBe('success')
			expect(fn).toHaveBeenCalledTimes(1)
		})

		it('should retry transient errors', async () => {
			let attempts = 0
			const fn = vi.fn().mockImplementation(() => {
				attempts++
				if (attempts < 3) {
					const error = new Error('Connection refused')
					;(error as any).code = 'ECONNREFUSED'
					throw error
				}
				return 'success'
			})

			const policy: RetryPolicy = {
				...DEFAULT_RETRY_POLICY,
				maxAttempts: 5,
				jitter: false
			}

			const onRetry = vi.fn()
			const promise = withRetry(fn, policy, onRetry)

			// Advance timers for retries
			await vi.runOnlyPendingTimersAsync()
			await vi.runOnlyPendingTimersAsync()

			const result = await promise

			expect(result).toBe('success')
			expect(fn).toHaveBeenCalledTimes(3)
			expect(onRetry).toHaveBeenCalledTimes(2)
		})

		it('should not retry permanent errors', async () => {
			const fn = vi.fn().mockRejectedValue(new Error('Invalid credentials'))
			const policy = DEFAULT_RETRY_POLICY

			await expect(withRetry(fn, policy)).rejects.toThrow('Invalid credentials')
			expect(fn).toHaveBeenCalledTimes(1)
		})

		it('should call onRetry callback with correct parameters', async () => {
			let attempts = 0
			const fn = vi.fn().mockImplementation(() => {
				attempts++
				if (attempts < 2) {
					const error = new Error('Connection failed')
					;(error as any).code = 'ECONNREFUSED'
					throw error
				}
				return 'success'
			})

			const policy: RetryPolicy = {
				...DEFAULT_RETRY_POLICY,
				jitter: false
			}

			const onRetry = vi.fn()
			const promise = withRetry(fn, policy, onRetry)

			// Advance timer for retry
			await vi.runOnlyPendingTimersAsync()

			await promise

			expect(onRetry).toHaveBeenCalledTimes(1)
			expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), 1000)
		})

		it('should handle delays correctly', async () => {
			let attempts = 0
			const fn = vi.fn().mockImplementation(() => {
				attempts++
				if (attempts < 2) {
					const error = new Error('Connection failed')
					;(error as any).code = 'ECONNREFUSED'
					throw error
				}
				return 'success'
			})

			const policy: RetryPolicy = {
				...DEFAULT_RETRY_POLICY,
				jitter: false
			}

			const promise = withRetry(fn, policy)
			await vi.advanceTimersByTimeAsync(1000) // advance past the delay
			const result = await promise

			expect(result).toBe('success')
			expect(fn).toHaveBeenCalledTimes(2)
		})
	})
})
