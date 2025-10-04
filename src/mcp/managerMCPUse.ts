/**
 * MCP Server Manager using mcp-use library
 *
 * Architecture:
 * - Uses MCPClient from mcp-use to manage server processes
 * - Creates MCPSession per server for tool access
 * - Wraps mcp-use API to maintain compatibility with existing codebase
 */

import { EventEmitter } from 'node:events'
import { MCPClient, type MCPSession } from 'mcp-use'
import type { StatusBarManager } from '../statusBarManager'
import { ServerNotAvailableError } from './errors'
import { partitionConfigs, toMCPUseConfig } from './mcpUseAdapter'
import { migrateServerConfigs } from './migration'
import { DEFAULT_RETRY_POLICY, withRetry } from './retryUtils'
import type { MCPServerConfig, RetryPolicy, ServerHealthStatus, ToolDefinition } from './types'
import { ConnectionState } from './types'
import { logError, logWarning } from './utils'

export interface MCPServerManagerEvents {
	'server-started': [serverId: string]
	'server-stopped': [serverId: string]
	'server-failed': [serverId: string, error: Error]
	'server-auto-disabled': [serverId: string]
	'server-retry': [serverId: string, attempt: number, nextRetryIn: number, error: Error]
}

/**
 * MCP Server Manager using mcp-use
 */
export class MCPServerManager extends EventEmitter<MCPServerManagerEvents> {
	private mcpClient: MCPClient | null = null
	private servers: Map<string, MCPServerConfig> = new Map()
	private sessions: Map<string, MCPSession> = new Map()
	private healthStatuses: Map<string, ServerHealthStatus> = new Map()
	private failureThreshold: number = 3
	private retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY
	private statusBarManager?: StatusBarManager

	/**
	 * Initialize manager with server configurations
	 */
	async initialize(
		configs: MCPServerConfig[],
		options?: { failureThreshold?: number; retryPolicy?: RetryPolicy; statusBarManager?: StatusBarManager }
	): Promise<void> {
		// Set failure threshold from options or use default
		if (options?.failureThreshold !== undefined) {
			this.failureThreshold = options.failureThreshold
		}

		// Set retry policy from options or use default
		if (options?.retryPolicy) {
			this.retryPolicy = options.retryPolicy
		}

		// Store status bar manager for error logging
		if (options?.statusBarManager) {
			this.statusBarManager = options.statusBarManager
		}

		const normalizedConfigs = migrateServerConfigs(configs as unknown as Parameters<typeof migrateServerConfigs>[0])

		// Store server configurations
		this.servers.clear()
		for (const config of normalizedConfigs) {
			this.servers.set(config.id, config)
		}
		this.sessions.clear()

		// Partition configs: mcp-use supported vs custom handling needed
		const { mcpUseConfigs, customConfigs } = partitionConfigs(normalizedConfigs)

		// Warn about unsupported configs (skip in test environment)
		if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
			for (const config of customConfigs) {
				console.warn(
					`[MCP Manager] Server ${config.id} uses unsupported format. ` +
						`Supported: stdio commands or Claude Desktop JSON format.`
				)
			}
		}

		// Convert configs to mcp-use format
		const mcpUseConfig = toMCPUseConfig(mcpUseConfigs)

		try {
			// Initialize mcp-use client with all servers
			if (Object.keys(mcpUseConfig.mcpServers).length > 0) {
				this.mcpClient = MCPClient.fromDict(mcpUseConfig)

				// Create sessions for all servers
				for (const config of mcpUseConfigs) {
					try {
						const session = await this.mcpClient.createSession(config.id, true)
						this.sessions.set(config.id, session)

						// Reset failure count on successful start
						config.failureCount = 0

						this.emit('server-started', config.id)
						this.updateHealthStatus(config.id, 'healthy')
					} catch (error) {
						logError(`Failed to create session for ${config.id}`, error)

						// Log to status bar error buffer
						this.statusBarManager?.logError('mcp', `Failed to start MCP server: ${config.name}`, error as Error, {
							serverId: config.id,
							serverName: config.name,
							configInput: config.configInput
						})

						// Increment failure count on startup failure
						config.failureCount++

						// Check if threshold exceeded and auto-disable
						this.checkAndAutoDisable(config)

						this.emit('server-failed', config.id, error as Error)
						this.updateHealthStatus(config.id, 'unhealthy')
					}
				}
			}
		} catch (error) {
			logError('Failed to initialize MCP client', error)
			throw error
		}
	}

	/**
	 * Start a specific MCP server with retry logic
	 */
	async startServer(serverId: string): Promise<void> {
		const config = this.servers.get(serverId)
		if (!config) {
			throw new ServerNotAvailableError(`Unknown server: ${serverId}`, 'Server configuration not found')
		}

		if (!config.enabled) {
			throw new ServerNotAvailableError(`Server ${config.name}`, 'Server is disabled')
		}

		if (!this.mcpClient) {
			throw new Error('MCP client not initialized')
		}

		// Update health status to show retry in progress
		this.updateHealthStatus(serverId, 'retrying')

		try {
			// Use retry logic with exponential backoff
			await withRetry(
				async () => {
					// Create session for this server
					const session = await this.mcpClient?.createSession(serverId, true)
					if (!session) {
						throw new Error(`Failed to create session for server ${serverId}`)
					}
					this.sessions.set(serverId, session)
				},
				this.retryPolicy,
				(attempt: number, error: Error, nextRetryIn: number) => {
					// Update retry status in health
					this.updateRetryStatus(serverId, attempt, nextRetryIn, error)

					// Emit retry event for UI updates
					this.emit('server-retry', serverId, attempt, nextRetryIn, error)

					// Log retry attempt (skip in test environment)
					if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
						console.warn(
							`[MCP Manager] Retrying server ${serverId} (attempt ${attempt}/${this.retryPolicy.maxAttempts}) in ${Math.round(nextRetryIn / 1000)}s: ${error.message}`
						)
					}
				}
			)

			// Success - reset failure count and update status
			config.failureCount = 0
			this.emit('server-started', serverId)
			this.updateHealthStatus(serverId, 'healthy')
		} catch (error) {
			// All retries failed - increment failure count
			config.failureCount++

			// Log to status bar error buffer
			this.statusBarManager?.logError(
				'mcp',
				`Failed to start MCP server after retries: ${config.name}`,
				error as Error,
				{
					serverId: config.id,
					serverName: config.name,
					configInput: config.configInput,
					failureCount: config.failureCount,
					maxRetries: this.retryPolicy.maxAttempts
				}
			)

			// Check if threshold exceeded and auto-disable
			this.checkAndAutoDisable(config)

			this.emit('server-failed', serverId, error as Error)
			this.updateHealthStatus(serverId, 'unhealthy')
			throw error
		}
	}

	/**
	 * Stop a specific MCP server
	 */
	async stopServer(serverId: string): Promise<void> {
		const config = this.servers.get(serverId)
		if (!config) {
			throw new ServerNotAvailableError(`Unknown server: ${serverId}`, 'Server configuration not found')
		}

		try {
			if (this.mcpClient) {
				await this.mcpClient.closeSession(serverId)
				this.sessions.delete(serverId)
			}

			this.updateHealthStatus(serverId, 'stopped')
			this.emit('server-stopped', serverId)
		} catch (error) {
			logError(`Error stopping server ${serverId}`, error)

			// Log to status bar error buffer
			this.statusBarManager?.logError('mcp', `Failed to stop MCP server: ${config.name}`, error as Error, {
				serverId: config.id,
				serverName: config.name
			})

			throw error
		}
	}

	/**
	 * Get MCP client wrapper for a server (compatibility method)
	 */
	getClient(serverId: string): MCPClientWrapper | undefined {
		const config = this.servers.get(serverId)
		if (!config || !config.enabled) {
			return undefined
		}

		const session = this.sessions.get(serverId)
		if (!session) {
			return undefined
		}

		return new MCPClientWrapper(session, serverId)
	}

	/**
	 * Get health status for a server
	 */
	getHealthStatus(serverId: string): ServerHealthStatus | undefined {
		return this.healthStatuses.get(serverId)
	}

	/**
	 * Perform health check on all servers
	 */
	async performHealthCheck(): Promise<void> {
		for (const [serverId, session] of this.sessions) {
			try {
				if (session.isConnected) {
					this.updateHealthStatus(serverId, 'healthy')
				} else {
					this.updateHealthStatus(serverId, 'unhealthy')
				}
			} catch (_error) {
				this.updateHealthStatus(serverId, 'unhealthy')
			}
		}
	}

	/**
	 * Re-enable a server that was auto-disabled
	 */
	reenableServer(serverId: string): Promise<void> {
		const config = this.servers.get(serverId)
		if (config) {
			config.enabled = true
			config.autoDisabled = false
			this.updateHealthStatus(serverId, 'healthy')
		}
		return Promise.resolve()
	}

	/**
	 * Get list of all servers
	 */
	listServers(): MCPServerConfig[] {
		return Array.from(this.servers.values())
	}

	/**
	 * Shutdown all servers and cleanup
	 */
	async shutdown(): Promise<void> {
		if (this.mcpClient) {
			try {
				await this.mcpClient.closeAllSessions()
			} catch (error) {
				logWarning('Error closing MCP sessions', error)
			}
			this.mcpClient = null
		}

		// Clear state
		this.sessions.clear()
		this.servers.clear()
		this.healthStatuses.clear()
	}

	/**
	 * Check if server has exceeded failure threshold and auto-disable if needed
	 */
	private checkAndAutoDisable(config: MCPServerConfig): void {
		if (config.failureCount >= this.failureThreshold && config.enabled && !config.autoDisabled) {
			// Disable the server
			config.enabled = false
			config.autoDisabled = true

			// Emit auto-disabled event
			this.emit('server-auto-disabled', config.id)

			// Log warning (skip in test environment)
			if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
				console.warn(
					`[MCP Manager] Server ${config.id} auto-disabled after ${config.failureCount} consecutive failures`
				)
			}
		}
	}

	/**
	 * Update retry status for a server
	 */
	private updateRetryStatus(serverId: string, attempt: number, nextRetryIn: number, error: Error): void {
		const current = this.healthStatuses.get(serverId)
		if (!current) return

		this.healthStatuses.set(serverId, {
			...current,
			retryState: {
				isRetrying: true,
				currentAttempt: attempt,
				nextRetryAt: Date.now() + nextRetryIn,
				backoffIntervals: [...(current.retryState?.backoffIntervals || []), nextRetryIn],
				lastError: error
			}
		})
	}

	/**
	 * Update health status for a server
	 */
	private updateHealthStatus(serverId: string, state: 'healthy' | 'unhealthy' | 'stopped' | 'retrying'): void {
		const current = this.healthStatuses.get(serverId)

		// Map our simple states to ConnectionState enum
		let connectionState: ConnectionState
		if (state === 'healthy') {
			connectionState = ConnectionState.CONNECTED
		} else if (state === 'stopped') {
			connectionState = ConnectionState.DISCONNECTED
		} else if (state === 'retrying') {
			connectionState = ConnectionState.CONNECTING
		} else {
			connectionState = ConnectionState.ERROR
		}

		this.healthStatuses.set(serverId, {
			serverId,
			connectionState,
			lastPingAt: Date.now(),
			consecutiveFailures: state === 'unhealthy' ? (current?.consecutiveFailures || 0) + 1 : 0,
			retryState:
				state === 'retrying'
					? current?.retryState || {
							isRetrying: true,
							currentAttempt: 0,
							backoffIntervals: []
						}
					: {
							isRetrying: false,
							currentAttempt: 0,
							backoffIntervals: []
						}
		})
	}
}

/**
 * Wrapper to provide MCPClient interface using mcp-use MCPSession
 */
class MCPClientWrapper {
	constructor(
		private session: MCPSession,
		private serverId: string
	) {}

	async listTools(): Promise<ToolDefinition[]> {
		if (!this.session.isConnected) {
			throw new Error(`Session for ${this.serverId} not connected`)
		}

		// Access tools from the connector
		// biome-ignore lint/suspicious/noExplicitAny: mcp-use connector type is not exported
		const tools = (this.session.connector as any).tools || []

		// biome-ignore lint/suspicious/noExplicitAny: tool type from mcp-use is not exported
		return tools.map((tool: any) => ({
			name: tool.name,
			description: tool.description || '',
			inputSchema: tool.inputSchema
		}))
	}

	async callTool(
		toolName: string,
		parameters: Record<string, unknown>,
		_timeout?: number
	): Promise<{ content: unknown; contentType: 'text' | 'json' | 'image' | 'markdown'; executionDuration: number }> {
		if (!this.session.isConnected) {
			throw new Error(`Session for ${this.serverId} not connected`)
		}

		const startTime = Date.now()

		// Call tool through the connector
		// biome-ignore lint/suspicious/noExplicitAny: mcp-use connector type is not exported
		const result = await (this.session.connector as any).callTool(toolName, parameters)

		const duration = Date.now() - startTime

		return {
			content: result.content,
			contentType: 'json',
			executionDuration: duration
		}
	}

	isConnected(): boolean {
		return this.session.isConnected
	}

	async connect(): Promise<void> {
		if (!this.session.isConnected) {
			await this.session.connect()
			await this.session.initialize()
		}
	}

	async disconnect(): Promise<void> {
		await this.session.disconnect()
	}
}
