/**
 * MCP Server Manager using mcp-use library
 * 
 * Architecture:
 * - Uses MCPClient from mcp-use to manage server processes
 * - Creates MCPSession per server for tool access
 * - Wraps mcp-use API to maintain compatibility with existing codebase
 */

import { EventEmitter } from "events";
import { MCPClient, MCPSession } from "mcp-use";
import type { MCPServerConfig, ServerHealthStatus, ToolDefinition } from "./types";
import { ConnectionState } from "./types";
import { toMCPUseConfig, partitionConfigs } from "./mcpUseAdapter";
import { ServerNotAvailableError } from "./errors";
import { logError, logWarning } from "./utils";

export interface MCPServerManagerEvents {
	"server-started": [serverId: string];
	"server-stopped": [serverId: string];
	"server-failed": [serverId: string, error: Error];
	"server-auto-disabled": [serverId: string];
}

/**
 * MCP Server Manager using mcp-use
 */
export class MCPServerManager extends EventEmitter<MCPServerManagerEvents> {
	private mcpClient: MCPClient | null = null;
	private servers: Map<string, MCPServerConfig> = new Map();
	private sessions: Map<string, MCPSession> = new Map();
	private healthStatuses: Map<string, ServerHealthStatus> = new Map();

	constructor() {
		super();
	}

	/**
	 * Initialize manager with server configurations
	 */
	async initialize(configs: MCPServerConfig[]): Promise<void> {
		// Store server configurations
		this.servers.clear();
		for (const config of configs) {
			this.servers.set(config.id, config);
		}

		// Partition configs: mcp-use supported vs custom handling needed
		const { mcpUseConfigs, customConfigs } = partitionConfigs(configs);

		// Warn about unsupported configs (skip in test environment)
		if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
			for (const config of customConfigs) {
				logWarning(
					`Server ${config.id} uses unsupported transport/deployment. ` +
					`Supported: stdio transport only. Config: ${config.transport}/${config.deploymentType}`
				);
			}
		}

		// Convert configs to mcp-use format
		const mcpUseConfig = toMCPUseConfig(mcpUseConfigs);

		try {
			// Initialize mcp-use client with all servers
			if (Object.keys(mcpUseConfig.mcpServers).length > 0) {
				this.mcpClient = MCPClient.fromDict(mcpUseConfig);

				// Create sessions for all servers
				for (const config of mcpUseConfigs) {
					try {
						const session = await this.mcpClient.createSession(config.id, true);
						this.sessions.set(config.id, session);
						this.emit("server-started", config.id);
						this.updateHealthStatus(config.id, "healthy");
					} catch (error) {
						logError(`Failed to create session for ${config.id}`, error);
						this.emit("server-failed", config.id, error as Error);
						this.updateHealthStatus(config.id, "unhealthy");
					}
				}
			}
		} catch (error) {
			logError("Failed to initialize MCP client", error);
			throw error;
		}
	}

	/**
	 * Start a specific MCP server
	 */
	async startServer(serverId: string): Promise<void> {
		const config = this.servers.get(serverId);
		if (!config) {
			throw new ServerNotAvailableError(
				`Unknown server: ${serverId}`,
				"Server configuration not found",
			);
		}

		if (!config.enabled) {
			throw new ServerNotAvailableError(
				`Server ${config.name}`,
				"Server is disabled",
			);
		}

		if (!this.mcpClient) {
			throw new Error("MCP client not initialized");
		}

		try {
			// Create session for this server
			const session = await this.mcpClient.createSession(serverId, true);
			this.sessions.set(serverId, session);
			this.emit("server-started", serverId);
			this.updateHealthStatus(serverId, "healthy");
		} catch (error) {
			this.emit("server-failed", serverId, error as Error);
			this.updateHealthStatus(serverId, "unhealthy");
			throw error;
		}
	}

	/**
	 * Stop a specific MCP server
	 */
	async stopServer(serverId: string): Promise<void> {
		const config = this.servers.get(serverId);
		if (!config) {
			throw new ServerNotAvailableError(
				`Unknown server: ${serverId}`,
				"Server configuration not found",
			);
		}

		try {
			if (this.mcpClient) {
				await this.mcpClient.closeSession(serverId);
				this.sessions.delete(serverId);
			}
			
			this.updateHealthStatus(serverId, "stopped");
			this.emit("server-stopped", serverId);
		} catch (error) {
			logError(`Error stopping server ${serverId}`, error);
			throw error;
		}
	}

	/**
	 * Get MCP client wrapper for a server (compatibility method)
	 */
	getClient(serverId: string): MCPClientWrapper | undefined {
		const config = this.servers.get(serverId);
		if (!config || !config.enabled) {
			return undefined;
		}

		const session = this.sessions.get(serverId);
		if (!session) {
			return undefined;
		}

		return new MCPClientWrapper(session, serverId);
	}

	/**
	 * Get health status for a server
	 */
	getHealthStatus(serverId: string): ServerHealthStatus | undefined {
		return this.healthStatuses.get(serverId);
	}

	/**
	 * Perform health check on all servers
	 */
	async performHealthCheck(): Promise<void> {
		for (const [serverId, session] of this.sessions) {
			try {
				if (session.isConnected) {
					this.updateHealthStatus(serverId, "healthy");
				} else {
					this.updateHealthStatus(serverId, "unhealthy");
				}
			} catch (error) {
				this.updateHealthStatus(serverId, "unhealthy");
			}
		}
	}

	/**
	 * Re-enable a server that was auto-disabled
	 */
	reenableServer(serverId: string): Promise<void> {
		const config = this.servers.get(serverId);
		if (config) {
			config.enabled = true;
			config.autoDisabled = false;
			this.updateHealthStatus(serverId, "healthy");
		}
		return Promise.resolve();
	}

	/**
	 * Get list of all servers
	 */
	listServers(): MCPServerConfig[] {
		return Array.from(this.servers.values());
	}

	/**
	 * Shutdown all servers and cleanup
	 */
	async shutdown(): Promise<void> {
		if (this.mcpClient) {
			try {
				await this.mcpClient.closeAllSessions();
			} catch (error) {
				logWarning("Error closing MCP sessions", error);
			}
			this.mcpClient = null;
		}

		// Clear state
		this.sessions.clear();
		this.servers.clear();
		this.healthStatuses.clear();
	}

	/**
	 * Update health status for a server
	 */
	private updateHealthStatus(serverId: string, state: "healthy" | "unhealthy" | "stopped"): void {
		const current = this.healthStatuses.get(serverId);
		
		// Map our simple states to ConnectionState enum
		const connectionState = state === "healthy" ? ConnectionState.CONNECTED : 
								state === "stopped" ? ConnectionState.DISCONNECTED : 
								ConnectionState.ERROR;
		
		this.healthStatuses.set(serverId, {
			serverId,
			connectionState,
			lastPingAt: Date.now(),
			consecutiveFailures: state === "unhealthy" ? (current?.consecutiveFailures || 0) + 1 : 0,
			retryState: {
				isRetrying: false,
				currentAttempt: 0,
				backoffIntervals: []
			}
		});
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
			throw new Error(`Session for ${this.serverId} not connected`);
		}

		// Access tools from the connector
		const tools = (this.session.connector as any).tools || [];
		
		return tools.map((tool: any) => ({
			name: tool.name,
			description: tool.description || '',
			inputSchema: tool.inputSchema
		}));
	}

	async callTool(
		toolName: string,
		parameters: Record<string, unknown>,
		_timeout?: number
	): Promise<{ content: unknown; contentType: string; executionDuration: number }> {
		if (!this.session.isConnected) {
			throw new Error(`Session for ${this.serverId} not connected`);
		}

		const startTime = Date.now();

		// Call tool through the connector
		const result = await (this.session.connector as any).callTool(toolName, parameters);
		
		const duration = Date.now() - startTime;

		return {
			content: result.content,
			contentType: 'json' as const,
			executionDuration: duration
		};
	}

	isConnected(): boolean {
		return this.session.isConnected;
	}

	async connect(): Promise<void> {
		if (!this.session.isConnected) {
			await this.session.connect();
			await this.session.initialize();
		}
	}

	async disconnect(): Promise<void> {
		await this.session.disconnect();
	}
}
