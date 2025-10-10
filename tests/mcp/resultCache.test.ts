/**
 * Tests for ResultCache
 * Validates caching behavior, TTL expiration, and cache management
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResultCache } from '../../src/mcp/resultCache'
import type { ToolExecutionResult } from '../../src/mcp/toolCallingCoordinator'

describe('ResultCache', () => {
	let cache: ResultCache
	const mockResult: ToolExecutionResult = {
		content: { data: 'test' },
		contentType: 'json',
		executionDuration: 100
	}

	beforeEach(() => {
		cache = new ResultCache(5 * 60 * 1000) // 5 minutes default
		vi.clearAllMocks()
	})

	describe('Key Generation', () => {
		it('should generate deterministic keys for same parameters', async () => {
			// Given: Same parameters
			const serverId = 'test-server'
			const toolName = 'test-tool'
			const parameters = { param1: 'value1', param2: 'value2' }

			// When: Storing and retrieving
			await cache.set(serverId, toolName, parameters, mockResult)
			const retrieved = await cache.get(serverId, toolName, parameters)

			// Then: Should retrieve the same result (with cacheAge added - Task-500-20-10-1)
			expect(retrieved).toMatchObject(mockResult)
			expect(retrieved?.cacheAge).toBeGreaterThanOrEqual(0)
		})

		it('should generate same key regardless of parameter order', async () => {
			// Given: Parameters in different orders
			const serverId = 'test-server'
			const toolName = 'test-tool'
			const params1 = { a: 1, b: 2, c: 3 }
			const params2 = { c: 3, a: 1, b: 2 }

			// When: Storing with first order
			await cache.set(serverId, toolName, params1, mockResult)

			// Then: Should retrieve with second order (with cacheAge added - Task-500-20-10-1)
			const retrieved = await cache.get(serverId, toolName, params2)
			expect(retrieved).toMatchObject(mockResult)
			expect(retrieved?.cacheAge).toBeGreaterThanOrEqual(0)
		})

		it('should generate different keys for different parameters', async () => {
			// Given: Different parameters
			const serverId = 'test-server'
			const toolName = 'test-tool'
			const params1 = { param: 'value1' }
			const params2 = { param: 'value2' }

			const result1: ToolExecutionResult = {
				content: { data: 'result1' },
				contentType: 'json',
				executionDuration: 100
			}
			const result2: ToolExecutionResult = {
				content: { data: 'result2' },
				contentType: 'json',
				executionDuration: 200
			}

			// When: Storing different results
			await cache.set(serverId, toolName, params1, result1)
			await cache.set(serverId, toolName, params2, result2)

			// Then: Should retrieve correct results (with cacheAge added - Task-500-20-10-1)
			expect(await cache.get(serverId, toolName, params1)).toMatchObject(result1)
			expect(await cache.get(serverId, toolName, params2)).toMatchObject(result2)
		})

		it('should generate different keys for different servers', async () => {
			// Given: Same tool and params, different servers
			const server1 = 'server-1'
			const server2 = 'server-2'
			const toolName = 'test-tool'
			const parameters = { param: 'value' }

			const result1: ToolExecutionResult = {
				content: { data: 'result1' },
				contentType: 'json',
				executionDuration: 100
			}
			const result2: ToolExecutionResult = {
				content: { data: 'result2' },
				contentType: 'json',
				executionDuration: 200
			}

			// When: Storing for different servers
			await cache.set(server1, toolName, parameters, result1)
			await cache.set(server2, toolName, parameters, result2)

			// Then: Should retrieve correct results per server (with cacheAge added - Task-500-20-10-1)
			expect(await cache.get(server1, toolName, parameters)).toMatchObject(result1)
			expect(await cache.get(server2, toolName, parameters)).toMatchObject(result2)
		})
	})

	describe('TTL Expiration', () => {
		it('should return cached result within TTL', async () => {
			// Given: Short TTL cache
			cache = new ResultCache(1000) // 1 second
			const serverId = 'test-server'
			const toolName = 'test-tool'
			const parameters = { param: 'value' }

			// When: Storing and retrieving immediately
			await cache.set(serverId, toolName, parameters, mockResult)
			const retrieved = await cache.get(serverId, toolName, parameters)

			// Then: Should retrieve result (with cacheAge added - Task-500-20-10-1)
			expect(retrieved).toMatchObject(mockResult)
			expect(retrieved?.cacheAge).toBeGreaterThanOrEqual(0)
		})

		it('should return null for expired entries', async () => {
			// Given: Very short TTL cache
			cache = new ResultCache(100) // 100ms
			const serverId = 'test-server'
			const toolName = 'test-tool'
			const parameters = { param: 'value' }

			// When: Storing and waiting for expiration
			await cache.set(serverId, toolName, parameters, mockResult)
			await new Promise((resolve) => setTimeout(resolve, 150))

			// Then: Should return null
			const retrieved = await cache.get(serverId, toolName, parameters)
			expect(retrieved).toBeNull()
		})

		it('should update TTL dynamically', async () => {
			// Given: Cache with initial TTL
			cache = new ResultCache(100)
			const serverId = 'test-server'
			const toolName = 'test-tool'
			const parameters = { param: 'value' }

			// When: Storing, then updating TTL
			await cache.set(serverId, toolName, parameters, mockResult)
			cache.setTTL(1000) // Extend TTL to 1 second

			// Wait 150ms (past original TTL, within new TTL)
			await new Promise((resolve) => setTimeout(resolve, 150))

			// Then: Should still retrieve result with new TTL (with cacheAge added - Task-500-20-10-1)
			const retrieved = await cache.get(serverId, toolName, parameters)
			expect(retrieved).toMatchObject(mockResult)
			expect(retrieved?.cacheAge).toBeGreaterThanOrEqual(140)
		})
	})

	describe('Cache Statistics', () => {
		it('should track cache hits and misses', async () => {
			// Given: Cache with some entries
			const serverId = 'test-server'
			const toolName = 'test-tool'
			const params1 = { param: 'value1' }
			const params2 = { param: 'value2' }

			// When: Storing one entry and making multiple requests
			await cache.set(serverId, toolName, params1, mockResult)
			await cache.get(serverId, toolName, params1) // Hit
			await cache.get(serverId, toolName, params1) // Hit
			await cache.get(serverId, toolName, params2) // Miss

			// Then: Should track hits and misses
			const stats = cache.getStats()
			expect(stats.hits).toBe(2)
			expect(stats.misses).toBe(1)
			expect(stats.size).toBe(1)
		})

		it('should calculate hit rate correctly', async () => {
			// Given: Cache with entries
			const serverId = 'test-server'
			const toolName = 'test-tool'
			const params = { param: 'value' }

			// When: Making requests
			await cache.set(serverId, toolName, params, mockResult)
			await cache.get(serverId, toolName, params) // Hit
			await cache.get(serverId, toolName, { param: 'other' }) // Miss

			// Then: Hit rate should be 50%
			expect(cache.getHitRate()).toBe(50)
		})

		it('should return 0 hit rate when no requests made', () => {
			// Given: Empty cache
			// When: Getting hit rate
			const hitRate = cache.getHitRate()

			// Then: Should return 0
			expect(hitRate).toBe(0)
		})

		it('should track oldest entry age', async () => {
			// Given: Cache with entries
			const serverId = 'test-server'
			const toolName = 'test-tool'

			// When: Adding entries with delays
			await cache.set(serverId, toolName, { id: 1 }, mockResult)
			await new Promise((resolve) => setTimeout(resolve, 50))
			await cache.set(serverId, toolName, { id: 2 }, mockResult)

			// Then: Oldest entry age should be > 50ms
			const stats = cache.getStats()
			expect(stats.oldestEntryAge).toBeGreaterThanOrEqual(50)
		})

		it('should return null for oldest entry age when cache is empty', () => {
			// Given: Empty cache
			// When: Getting stats
			const stats = cache.getStats()

			// Then: Oldest entry age should be null
			expect(stats.oldestEntryAge).toBeNull()
		})
	})

	describe('Cache Invalidation', () => {
		it('should clear all entries', async () => {
			// Given: Cache with multiple entries
			await cache.set('server-1', 'tool-1', { param: 'value1' }, mockResult)
			await cache.set('server-2', 'tool-2', { param: 'value2' }, mockResult)

			// When: Clearing cache
			cache.clear()

			// Then: All entries should be removed
			const stats = cache.getStats()
			expect(stats.size).toBe(0)
			expect(stats.hits).toBe(0)
			expect(stats.misses).toBe(0)
		})

		it('should clear entries for specific server', async () => {
			// Given: Cache with entries from multiple servers
			const result1: ToolExecutionResult = {
				content: { data: 'server1' },
				contentType: 'json',
				executionDuration: 100
			}
			const result2: ToolExecutionResult = {
				content: { data: 'server2' },
				contentType: 'json',
				executionDuration: 200
			}

			await cache.set('server-1', 'tool', { param: 'value' }, result1)
			await cache.set('server-2', 'tool', { param: 'value' }, result2)

			// When: Clearing server-1
			cache.clearServer('server-1')

			// Then: Only server-1 entries should be removed
			expect(await cache.get('server-1', 'tool', { param: 'value' })).toBeNull()
			expect(await cache.get('server-2', 'tool', { param: 'value' })).toMatchObject(result2)
		})

		it('should clear entries for specific tool', async () => {
			// Given: Cache with multiple tools from same server
			const result1: ToolExecutionResult = {
				content: { data: 'tool1' },
				contentType: 'json',
				executionDuration: 100
			}
			const result2: ToolExecutionResult = {
				content: { data: 'tool2' },
				contentType: 'json',
				executionDuration: 200
			}

			await cache.set('server', 'tool-1', { param: 'value' }, result1)
			await cache.set('server', 'tool-2', { param: 'value' }, result2)

			// When: Clearing tool-1
			cache.clearTool('server', 'tool-1')

			// Then: Only tool-1 entries should be removed
			expect(await cache.get('server', 'tool-1', { param: 'value' })).toBeNull()
			expect(await cache.get('server', 'tool-2', { param: 'value' })).toMatchObject(result2)
		})

		it('should purge expired entries only', async () => {
			// Given: Cache with short TTL
			cache = new ResultCache(100) // 100ms
			const freshResult: ToolExecutionResult = {
				content: { data: 'fresh' },
				contentType: 'json',
				executionDuration: 100
			}
			const staleResult: ToolExecutionResult = {
				content: { data: 'stale' },
				contentType: 'json',
				executionDuration: 200
			}

			// Add stale entry
			await cache.set('server', 'tool', { id: 'stale' }, staleResult)
			await new Promise((resolve) => setTimeout(resolve, 150))

			// Add fresh entry
			await cache.set('server', 'tool', { id: 'fresh' }, freshResult)

			// When: Purging expired
			cache.purgeExpired()

			// Then: Only fresh entry should remain (with cacheAge added - Task-500-20-10-1)
			expect(await cache.get('server', 'tool', { id: 'stale' })).toBeNull()
			expect(await cache.get('server', 'tool', { id: 'fresh' })).toMatchObject(freshResult)
			expect(cache.getStats().size).toBe(1)
		})
	})

	describe('Cache Miss Scenarios', () => {
		it('should return null for non-existent entry', async () => {
			// Given: Empty cache
			// When: Getting non-existent entry
			const result = await cache.get('server', 'tool', { param: 'value' })

			// Then: Should return null
			expect(result).toBeNull()
		})

		it('should increment miss count for non-existent entries', async () => {
			// Given: Empty cache
			// When: Attempting to get non-existent entries
			await cache.get('server', 'tool', { param: 'value1' })
			await cache.get('server', 'tool', { param: 'value2' })

			// Then: Should track misses
			expect(cache.getStats().misses).toBe(2)
		})

		it('should increment miss count for expired entries', async () => {
			// Given: Cache with expired entry
			cache = new ResultCache(50)
			await cache.set('server', 'tool', { param: 'value' }, mockResult)
			await new Promise((resolve) => setTimeout(resolve, 100))

			// When: Attempting to get expired entry
			await cache.get('server', 'tool', { param: 'value' })

			// Then: Should track as miss
			expect(cache.getStats().misses).toBe(1)
			expect(cache.getStats().hits).toBe(0)
		})
	})

	describe('TTL Management', () => {
		it('should get current TTL', () => {
			// Given: Cache with specific TTL
			const ttl = 10 * 60 * 1000 // 10 minutes
			cache = new ResultCache(ttl)

			// When: Getting TTL
			const currentTTL = cache.getTTL()

			// Then: Should return configured TTL
			expect(currentTTL).toBe(ttl)
		})

		it('should allow changing TTL', () => {
			// Given: Cache with initial TTL
			cache = new ResultCache(5 * 60 * 1000)

			// When: Changing TTL
			const newTTL = 10 * 60 * 1000
			cache.setTTL(newTTL)

			// Then: Should update TTL
			expect(cache.getTTL()).toBe(newTTL)
		})
	})
})
