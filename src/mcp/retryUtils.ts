/**
 * Retry utilities for MCP server connections
 * Implements exponential backoff with jitter for resilient server management
 */

import type { RetryPolicy, RetryState } from './types'

export type { RetryPolicy, RetryState }

/**
 * Default retry policy for MCP server connections
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
	maxAttempts: 5,
	initialDelay: 1000, // 1 second
	maxDelay: 30000, // 30 seconds
	backoffMultiplier: 2,
	jitter: true,
	transientErrorCodes: [
		'ECONNREFUSED',
		'ECONNRESET',
		'ETIMEDOUT',
		'ENOTFOUND',
		'ECONNABORTED',
		'EPIPE',
		'ECONNREFUSED',
		'ENETUNREACH',
		'EHOSTUNREACH'
	]
}

/**
 * Classify error as transient (retryable) or permanent
 */
export function isTransientError(error: Error, policy: RetryPolicy): boolean {
	// Check if error code is in transient list
	const errorCode = (error as any).code || (error as any).errno
	if (errorCode && policy.transientErrorCodes.includes(errorCode)) {
		return true
	}

	// Check error message for common transient patterns
	const message = error.message.toLowerCase()
	const transientPatterns = [
		'connection refused',
		'connection reset',
		'connection timeout',
		'network unreachable',
		'host unreachable',
		'temporarily unavailable',
		'service unavailable',
		'timeout',
		'connection aborted'
	]

	return transientPatterns.some((pattern) => message.includes(pattern))
}

/**
 * Calculate next retry delay using exponential backoff with optional jitter
 */
export function calculateRetryDelay(attempt: number, policy: RetryPolicy): number {
	const baseDelay = policy.initialDelay * policy.backoffMultiplier ** (attempt - 1)
	const delay = Math.min(baseDelay, policy.maxDelay)

	if (policy.jitter) {
		// Add random jitter (±25% of delay)
		const jitterRange = delay * 0.25
		return delay + (Math.random() * 2 - 1) * jitterRange
	}

	return delay
}

/**
 * Create initial retry state
 */
export function createInitialRetryState(): RetryState {
	return {
		isRetrying: false,
		currentAttempt: 0,
		backoffIntervals: []
	}
}

/**
 * Update retry state for next attempt
 */
export function updateRetryState(state: RetryState, error: Error, policy: RetryPolicy): RetryState {
	const nextAttempt = state.currentAttempt + 1

	if (nextAttempt > policy.maxAttempts) {
		return {
			...state,
			isRetrying: false,
			currentAttempt: nextAttempt,
			lastError: error
		}
	}

	const delay = calculateRetryDelay(nextAttempt, policy)
	const nextRetryAt = Date.now() + delay

	return {
		isRetrying: true,
		currentAttempt: nextAttempt,
		nextRetryAt,
		backoffIntervals: [...state.backoffIntervals, delay],
		lastError: error
	}
}

/**
 * Check if retry should be attempted
 */
export function shouldRetry(error: Error, state: RetryState, policy: RetryPolicy): boolean {
	if (state.currentAttempt >= policy.maxAttempts) {
		return false
	}

	return isTransientError(error, policy)
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number, timer: { setTimeout: typeof setTimeout } = { setTimeout }): Promise<void> {
	return new Promise((resolve) => timer.setTimeout(resolve, ms))
}

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	policy: RetryPolicy = DEFAULT_RETRY_POLICY,
	onRetry?: (attempt: number, error: Error, nextRetryIn: number) => void,
	_timer: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout } = { setTimeout, clearTimeout }
): Promise<T> {
	let state = createInitialRetryState()
	let lastError: Error

	for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
		try {
			return await fn()
		} catch (error) {
			lastError = error as Error

			if (!shouldRetry(lastError, state, policy)) {
				break
			}

			state = updateRetryState(state, lastError, policy)

			if (onRetry && state.nextRetryAt) {
				const nextRetryIn = state.nextRetryAt - Date.now()
				onRetry(attempt, lastError, nextRetryIn)
			}

			if (state.nextRetryAt) {
				await new Promise<void>((resolve) => {
					_timer.setTimeout(resolve, state.nextRetryAt! - Date.now())
				})
			}
		}
	}

	throw lastError!
}
