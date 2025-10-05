import { afterEach, describe, expect, it, vi } from 'vitest'

import { ToolDiscoveryCache } from '../../src/mcp/toolDiscoveryCache'
import { MCPServerManager } from '../../src/mcp/managerMCPUse'
import type { MCPServerConfig, ToolDefinition } from '../../src/mcp/types'

afterEach(() => {
	vi.restoreAllMocks()
})

describe('ToolDiscoveryCache', () => {
	it('caches tool snapshots between requests', async () => {
		// Given: A manager accessor with a single server and listTools spy
		const serverConfig: MCPServerConfig = {
			id: 'server-1',
			name: 'Test Server',
			configInput: 'npx server',
			enabled: true,
			failureCount: 0,
			autoDisabled: false
		}
		const toolDefinition: ToolDefinition = {
			name: 'tool-alpha',
			description: 'Sample tool',
			inputSchema: { type: 'object' }
		}
		const listTools = vi.fn().mockResolvedValue([toolDefinition])
		const accessor = {
			listServers: () => [serverConfig],
			getClient: () => ({ listTools })
		}

		const cache = new ToolDiscoveryCache(accessor)

		// When: Fetching snapshot twice
		await cache.getSnapshot()
		await cache.getSnapshot()

		// Then: Underlying listTools called only once and metrics capture hit/miss
		expect(listTools).toHaveBeenCalledTimes(1)
		const metrics = cache.getMetrics()
		expect(metrics.requests).toBe(2)
		expect(metrics.misses).toBe(1)
		expect(metrics.hits).toBe(1)
	})

	it('invalidates cache when MCPServerManager emits server events', async () => {
		// Given: A MCPServerManager with stubbed listServers/getClient
		const manager = new MCPServerManager()
		const serverConfig: MCPServerConfig = {
			id: 'server-42',
			name: 'Server 42',
			configInput: 'npx @mcp/test',
			enabled: true,
			failureCount: 0,
			autoDisabled: false
		}
		const toolDefinition: ToolDefinition = {
			name: 'diagnostics',
			description: 'Diagnostics tool',
			inputSchema: { type: 'object' }
		}
		const listTools = vi.fn().mockResolvedValue([toolDefinition])

		vi.spyOn(manager, 'listServers').mockReturnValue([serverConfig])
		vi.spyOn(manager, 'getClient').mockReturnValue({ listTools } as any)

		const cache = manager.getToolDiscoveryCache()

		// When: Snapshot requested, then server-started event emitted, then snapshot requested again
		await cache.getSnapshot()
		manager.emit('server-started', serverConfig.id)
		await cache.getSnapshot()

		// Then: listTools invoked twice due to invalidation
		expect(listTools).toHaveBeenCalledTimes(2)
	})

	it('batches concurrent snapshot requests into one build', async () => {
		// Given: Slow listTools implementation to simulate in-flight build
		const serverConfig: MCPServerConfig = {
			id: 'server-batch',
			name: 'Batch Server',
			configInput: 'npx batch',
			enabled: true,
			failureCount: 0,
			autoDisabled: false
		}
		const toolDefinition: ToolDefinition = {
			name: 'batch-tool',
			description: 'Batched tool',
			inputSchema: { type: 'object' }
		}
		const listTools = vi.fn().mockImplementation(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0))
			return [toolDefinition]
		})
		const accessor = {
			listServers: () => [serverConfig],
			getClient: () => ({ listTools })
		}
		const cache = new ToolDiscoveryCache(accessor)

		// When: Two snapshot requests issued concurrently
		const promiseA = cache.getSnapshot()
		const promiseB = cache.getSnapshot()
		await Promise.all([promiseA, promiseB])

		// Then: listTools called once, metrics capture batched request
		expect(listTools).toHaveBeenCalledTimes(1)
		const metrics = cache.getMetrics()
		expect(metrics.misses).toBe(1)
		expect(metrics.batched).toBe(1)
		expect(metrics.requests).toBe(2)
		expect(metrics.hits).toBe(1)
	})
})
