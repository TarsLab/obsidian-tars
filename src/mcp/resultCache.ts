/**
 * Tool Result Cache
 * Caches tool execution results to avoid redundant executions
 * Uses SHA-256 hashing over server ID, tool name, and parameters for deterministic keys
 */

import type { ToolExecutionResult } from './types'

/**
 * Cache entry with result and metadata
 */
interface CacheEntry {
	result: ToolExecutionResult
	timestamp: number
	serverId: string
	toolName: string
	parameters: Record<string, unknown>
}

/**
 * Cache statistics
 */
export interface CacheStats {
	hits: number
	misses: number
	size: number
	oldestEntryAge: number | null
}

/**
 * ResultCache manages tool execution results with TTL-based expiration
 */
export class ResultCache {
	private cache: Map<string, CacheEntry>
	private ttlMs: number
	private hits: number
	private misses: number

	constructor(ttlMs: number = 5 * 60 * 1000) {
		// Default 5 minutes
		this.cache = new Map()
		this.ttlMs = ttlMs
		this.hits = 0
		this.misses = 0
	}

	/**
	 * Generate a deterministic cache key from server ID, tool name, and parameters
	 */
	private async generateKey(serverId: string, toolName: string, parameters: Record<string, unknown>): Promise<string> {
		// Sort parameters by key to ensure consistent hashing regardless of order
		const sortedParams = Object.keys(parameters)
			.sort()
			.reduce((acc, key) => {
				acc[key] = parameters[key]
				return acc
			}, {} as Record<string, unknown>)

		const data = JSON.stringify({
			serverId,
			toolName,
			parameters: sortedParams
		})

		// Use SubtleCrypto for SHA-256 hashing
		const encoder = new TextEncoder()
		const dataBuffer = encoder.encode(data)
		const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
		const hashArray = Array.from(new Uint8Array(hashBuffer))
		const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

		return hashHex
	}

	/**
	 * Get a cached result if available and not expired
	 * Returns result with cacheAge populated (Task-500-20-10-1)
	 */
	async get(
		serverId: string,
		toolName: string,
		parameters: Record<string, unknown>
	): Promise<ToolExecutionResult | null> {
		const key = await this.generateKey(serverId, toolName, parameters)
		const entry = this.cache.get(key)

		if (!entry) {
			this.misses++
			return null
		}

		// Check if entry has expired
		const age = Date.now() - entry.timestamp
		if (age > this.ttlMs) {
			this.cache.delete(key)
			this.misses++
			return null
		}

		this.hits++
		// Return result with cache age populated
		return {
			...entry.result,
			cacheAge: age
		}
	}

	/**
	 * Store a result in the cache
	 */
	async set(
		serverId: string,
		toolName: string,
		parameters: Record<string, unknown>,
		result: ToolExecutionResult
	): Promise<void> {
		const key = await this.generateKey(serverId, toolName, parameters)
		this.cache.set(key, {
			result,
			timestamp: Date.now(),
			serverId,
			toolName,
			parameters
		})
	}

	/**
	 * Clear all cache entries
	 */
	clear(): void {
		this.cache.clear()
		this.hits = 0
		this.misses = 0
	}

	/**
	 * Clear cache entries for a specific server
	 */
	clearServer(serverId: string): void {
		for (const [key, entry] of this.cache.entries()) {
			if (entry.serverId === serverId) {
				this.cache.delete(key)
			}
		}
	}

	/**
	 * Clear cache entries for a specific tool
	 */
	clearTool(serverId: string, toolName: string): void {
		for (const [key, entry] of this.cache.entries()) {
			if (entry.serverId === serverId && entry.toolName === toolName) {
				this.cache.delete(key)
			}
		}
	}

	/**
	 * Purge expired entries
	 */
	purgeExpired(): void {
		const now = Date.now()
		for (const [key, entry] of this.cache.entries()) {
			const age = now - entry.timestamp
			if (age > this.ttlMs) {
				this.cache.delete(key)
			}
		}
	}

	/**
	 * Get cache statistics
	 */
	getStats(): CacheStats {
		let oldestEntryAge: number | null = null

		if (this.cache.size > 0) {
			const now = Date.now()
			for (const entry of this.cache.values()) {
				const age = now - entry.timestamp
				if (oldestEntryAge === null || age > oldestEntryAge) {
					oldestEntryAge = age
				}
			}
		}

		return {
			hits: this.hits,
			misses: this.misses,
			size: this.cache.size,
			oldestEntryAge
		}
	}

	/**
	 * Get hit rate as percentage
	 */
	getHitRate(): number {
		const total = this.hits + this.misses
		return total === 0 ? 0 : (this.hits / total) * 100
	}

	/**
	 * Set TTL for cache entries
	 */
	setTTL(ttlMs: number): void {
		this.ttlMs = ttlMs
	}

	/**
	 * Get current TTL
	 */
	getTTL(): number {
		return this.ttlMs
	}
}
