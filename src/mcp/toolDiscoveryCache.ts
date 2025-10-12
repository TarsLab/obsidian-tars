import type { MCPServerConfig, ToolDefinition, ToolServerInfo } from './types'
import { logWarning } from './utils'

export interface ToolServerAccessor {
	listServers(): MCPServerConfig[]
	getClient(serverId: string): { listTools(): Promise<ToolDefinition[]> } | undefined
}

export interface ToolDiscoverySnapshot {
	mapping: Map<string, ToolServerInfo>
	servers: Array<{
		serverId: string
		serverName: string
		tools: ToolDefinition[]
	}>
}

export interface ToolDiscoveryMetrics {
	requests: number
	hits: number
	misses: number
	batched: number
	invalidations: number
	inFlight: boolean
	lastUpdatedAt: number | null
	lastBuildDurationMs: number | null
	lastServerCount: number
	lastToolCount: number
	lastError: string | null
	lastInvalidationAt: number | null
	lastInvalidationReason: string | null
}

interface InternalSnapshot {
	mapping: Map<string, ToolServerInfo>
	servers: Array<{
		serverId: string
		serverName: string
		tools: ToolDefinition[]
	}>
}

export class ToolDiscoveryCache {
	private snapshot: InternalSnapshot | null = null
	private buildPromise: Promise<void> | null = null
	private metrics: ToolDiscoveryMetrics = {
		requests: 0,
		hits: 0,
		misses: 0,
		batched: 0,
		invalidations: 0,
		inFlight: false,
		lastUpdatedAt: null,
		lastBuildDurationMs: null,
		lastServerCount: 0,
		lastToolCount: 0,
		lastError: null,
		lastInvalidationAt: null,
		lastInvalidationReason: null
	}

	constructor(private readonly accessor: ToolServerAccessor) {}

	async getSnapshot(options?: { forceRefresh?: boolean }): Promise<ToolDiscoverySnapshot> {
		this.metrics.requests++

		if (!options?.forceRefresh && this.snapshot) {
			this.metrics.hits++
			return cloneSnapshot(this.snapshot)
		}

		if (this.buildPromise) {
			this.metrics.batched++
			await this.buildPromise
			if (this.snapshot) {
				this.metrics.hits++
				return cloneSnapshot(this.snapshot)
			}
		}

		this.metrics.misses++
		this.buildPromise = this.buildSnapshot()
		try {
			await this.buildPromise
		} finally {
			this.buildPromise = null
		}

		if (!this.snapshot) {
			throw new Error('Tool discovery cache build produced no snapshot')
		}

		return cloneSnapshot(this.snapshot)
	}

	getCachedSnapshot(): ToolDiscoverySnapshot | null {
		if (!this.snapshot) {
			return null
		}
		return cloneSnapshot(this.snapshot)
	}

	async getToolMapping(options?: { forceRefresh?: boolean }): Promise<Map<string, ToolServerInfo>> {
		const snapshot = await this.getSnapshot(options)
		return snapshot.mapping
	}

	getCachedMapping(): Map<string, ToolServerInfo> | null {
		return this.snapshot ? new Map(this.snapshot.mapping) : null
	}

	async preload(): Promise<void> {
		await this.getSnapshot()
	}

	invalidate(reason = 'unknown'): void {
		this.snapshot = null
		this.metrics.invalidations++
		this.metrics.lastInvalidationAt = Date.now()
		this.metrics.lastInvalidationReason = reason
	}

	getMetrics(): ToolDiscoveryMetrics {
		return { ...this.metrics }
	}

	private async buildSnapshot(): Promise<void> {
		this.metrics.inFlight = true
		const start = now()

		try {
			const servers = this.accessor.listServers()
			const enabledServers = servers.filter((server) => server.enabled)

			const serverResults = await Promise.all(
				enabledServers.map(async (server) => {
					const client = this.accessor.getClient(server.id)
					if (!client) {
						return { server, tools: [] as ToolDefinition[] }
					}

					try {
						const tools = await client.listTools()
						return { server, tools }
					} catch (error) {
						logWarning(`Failed to list tools for server ${server.id}`, error)
						return { server, tools: [] as ToolDefinition[] }
					}
				})
			)

			const mapping = new Map<string, ToolServerInfo>()
			const snapshotServers: InternalSnapshot['servers'] = []
			let totalTools = 0

			for (const { server, tools } of serverResults) {
				const normalizedTools = tools.map((tool) => ({
					name: tool.name,
					description: tool.description,
					inputSchema: tool.inputSchema
				}))

				snapshotServers.push({
					serverId: server.id,
					serverName: server.name,
					tools: normalizedTools
				})

				for (const tool of normalizedTools) {
					if (!mapping.has(tool.name)) {
						mapping.set(tool.name, { id: server.id, name: server.name })
					}
				}

				totalTools += normalizedTools.length
			}

			this.snapshot = {
				mapping,
				servers: snapshotServers
			}

			this.metrics.lastUpdatedAt = Date.now()
			this.metrics.lastBuildDurationMs = now() - start
			this.metrics.lastServerCount = serverResults.length
			this.metrics.lastToolCount = totalTools
			this.metrics.lastError = null
		} catch (error) {
			this.metrics.lastError = error instanceof Error ? error.message : String(error)
			throw error
		} finally {
			this.metrics.inFlight = false
		}
	}
}

function cloneSnapshot(snapshot: InternalSnapshot): ToolDiscoverySnapshot {
	return {
		mapping: new Map(snapshot.mapping),
		servers: snapshot.servers.map((server) => ({
			serverId: server.serverId,
			serverName: server.serverName,
			tools: server.tools.map((tool) => ({
				name: tool.name,
				description: tool.description,
				inputSchema: tool.inputSchema
			}))
		}))
	}
}

function now(): number {
	return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
