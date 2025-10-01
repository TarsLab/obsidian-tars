/**
 * MCP Server Manager (refactored with mcp-use)
 * Orchestrates MCP server lifecycle using mcp-use library
 */

import { EventEmitter } from "events";
import { MCPClient, MCPSession } from "mcp-use";
import type { MCPServerConfig, ServerHealthStatus, ToolDefinition } from "./types";
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
 * Simplified MCP Server Manager using mcp-use library
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

		// Warn about unsupported configs
		for (const config of customConfigs) {
			logWarning(
				`Server ${config.id} uses unsupported transport/deployment. ` +
				`Supported: stdio transport only. Config: ${config.transport}/${config.deploymentType}`
			);
		}

		// Convert configs to mcp-use format
		const mcpUseConfig = toMCPUseConfig(mcpUseConfigs);

		try {
			// Initialize mcp-use client with all servers
			if (Object.keys(mcpUseConfig.mcpServers).length > 0) {
				this.mcpClient = MCPClient.fromDict(mcpUseConfig);

				// Emit started events for all servers
				for (const config of mcpUseConfigs) {
					this.emit("server-started", config.id);
					this.updateHealthStatus(config.id, "healthy");
				}
			}
		} catch (error) {
			logError("Failed to initialize MCP client", error);
			throw error;
		}
	}

	/**
	 * Start a specific MCP server
	 * Note: With mcp-use, servers are started during initialization
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

		// With mcp-use, servers are started on initialization
		// Individual start/stop is handled by reinitializing
		logWarning(`Server ${serverId} management via mcp-use. Reinitialize to start.`);
	}

	/**
	 * Stop a specific MCP server
	 * Note: With mcp-use, individual server stop requires reinitialization
	 */
	async stopServer(serverId: string): Promise<void> {
		const config = this.servers.get(serverId);
		if (!config) {
			throw new ServerNotAvailableError(
				`Unknown server: ${serverId}`,
				"Server configuration not found",
			);
		}

		// Update health status
		this.updateHealthStatus(serverId, "stopped");
		this.emit("server-stopped", serverId);

		// Note: mcp-use doesn't support stopping individual servers
		// Would need to close entire client and reinitialize
		logWarning(`Server ${serverId} stop requires full reinit with mcp-use`);
	}

	/**
	 * List tools for a specific server
	 */
	async listTools(serverId: string): Promise<ToolDefinition[]> {
		if (!this.mcpClient) {
			throw new Error("MCP client not initialized");
		}

		const config = this.servers.get(serverId);
		if (!config || !config.enabled) {
			throw new ServerNotAvailableError(
				`Server ${serverId} not available`,
				"Server not found or disabled"
			);
		}

		try {
			// Get tools from mcp-use client
			const tools = await this.mcpClient.listTools();
			
			// Filter tools for this specific server
			// mcp-use returns all tools from all servers
			// Tools are prefixed with server name (e.g., "servername.toolname")
			const serverTools = tools
				.filter(tool => tool.name.startsWith(`${serverId}.`))
				.map(tool => ({
					name: tool.name.replace(`${serverId}.`, ''), // Remove prefix
					description: tool.description || '',
					inputSchema: tool.inputSchema
				}));

			return serverTools;
		} catch (error) {
			this.updateHealthStatus(serverId, "unhealthy");
			throw error;
		}
	}

	/**
	 * Call a tool on a specific server
	 */
	async callTool(
		serverId: string,
		toolName: string,
		parameters: Record<string, unknown>
	): Promise<{ content: unknown; contentType: string }> {
		if (!this.mcpClient) {
			throw new Error("MCP client not initialized");
		}

		const config = this.servers.get(serverId);
		if (!config || !config.enabled) {
			throw new ServerNotAvailableError(
				`Server ${serverId} not available`,
				"Server not found or disabled"
			);
		}

		try {
			// mcp-use expects tool name with server prefix
			const fullToolName = `${serverId}.${toolName}`;
			
			const result = await this.mcpClient.callTool({
				name: fullToolName,
				arguments: parameters
			});

			this.updateHealthStatus(serverId, "healthy");

			return {
				content: result.content,
				contentType: "json"
			};
		} catch (error) {
			this.updateHealthStatus(serverId, "unhealthy");
			throw error;
		}
	}

	/**
	 * Get MCP client for a server (compatibility method)
	 * Returns a wrapper that provides the expected interface
	 */
	getClient(serverId: string): MCPClientWrapper | undefined {
		const config = this.servers.get(serverId);
		if (!config || !config.enabled) {
			return undefined;
		}

		if (!this.mcpClient) {
			return undefined;
		}

		// Return a wrapper that implements the expected MCPClient interface
		return new MCPClientWrapper(this.mcpClient, serverId);
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
		if (!this.mcpClient) {
			return;
		}

		// Simple health check: try to list tools
		for (const [serverId, config] of this.servers) {
			if (config.enabled) {
				try {
					await this.listTools(serverId);
					this.updateHealthStatus(serverId, "healthy");
				} catch (error) {
					this.updateHealthStatus(serverId, "unhealthy");
				}
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
				await this.mcpClient.close();
			} catch (error) {
				logWarning("Error closing MCP client", error);
			}
			this.mcpClient = null;
		}

		// Clear state
		this.servers.clear();
		this.healthStatuses.clear();
	}

	/**
	 * Update health status for a server
	 */
	private updateHealthStatus(serverId: string, status: "healthy" | "unhealthy" | "stopped"): void {
		this.healthStatuses.set(serverId, {
			status,
			lastChecked: new Date(),
			consecutiveFailures: status === "unhealthy" ? (this.healthStatuses.get(serverId)?.consecutiveFailures || 0) + 1 : 0
		});
	}
}

/**
 * Wrapper to provide MCPClient interface using mcp-use client
 */
class MCPClientWrapper {
	constructor(
		private mcpClient: MCPClient,
		private serverId: string
	) {}

	async listTools(): Promise<ToolDefinition[]> {
		const tools = await this.mcpClient.listTools();
		
		// Filter and transform tools for this server
		return tools
			.filter(tool => tool.name.startsWith(`${this.serverId}.`))
			.map(tool => ({
				name: tool.name.replace(`${this.serverId}.`, ''),
				description: tool.description || '',
				inputSchema: tool.inputSchema
			}));
	}

	async callTool(params: { name: string; arguments: Record<string, unknown> }): Promise<{ content: unknown }> {
		const fullToolName = `${this.serverId}.${params.name}`;
		const result = await this.mcpClient.callTool({
			name: fullToolName,
			arguments: params.arguments
		});
		return { content: result.content };
	}

	isConnected(): boolean {
		// mcp-use doesn't expose connection status directly
		// Assume connected if client exists
		return !!this.mcpClient;
	}

	async connect(): Promise<void> {
		// mcp-use handles connection automatically
		return Promise.resolve();
	}

	async disconnect(): Promise<void> {
		// Individual server disconnect not supported by mcp-use
		return Promise.resolve();
	}
}
