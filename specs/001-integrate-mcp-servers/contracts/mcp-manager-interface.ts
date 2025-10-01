/**
 * Contract: MCP Server Manager Interface
 * 
 * Manages lifecycle of multiple MCP servers.
 * Handles Docker integration, health monitoring, and retry logic.
 */

export interface MCPServerManager {
  /**
   * Initialize manager and start all enabled servers.
   * 
   * @param configs - Array of server configurations from settings
   * @returns Promise resolving when initialization complete
   */
  initialize(configs: MCPServerConfig[]): Promise<void>;

  /**
   * Start a specific MCP server.
   * For Docker servers: creates and starts container.
   * For remote servers: establishes SSE connection.
   * 
   * @param serverId - Server ID to start
   * @returns Promise resolving when server is running
   * @throws DockerError if Docker operation fails
   * @throws ConnectionError if remote server unreachable
   */
  startServer(serverId: string): Promise<void>;

  /**
   * Stop a specific MCP server.
   * For Docker servers: stops and removes container.
   * For remote servers: closes SSE connection.
   * 
   * @param serverId - Server ID to stop
   */
  stopServer(serverId: string): Promise<void>;

  /**
   * Get current health status of a server.
   * 
   * @param serverId - Server ID
   * @returns Current health status or undefined if not found
   */
  getHealthStatus(serverId: string): ServerHealthStatus | undefined;

  /**
   * Get MCP client instance for a server.
   * Used by executor to send tool requests.
   * 
   * @param serverId - Server ID
   * @returns Connected client or undefined if server not running
   */
  getClient(serverId: string): MCPClient | undefined;

  /**
   * Manually trigger health check for all running servers.
   * Normally runs on 30s interval.
   */
  performHealthCheck(): Promise<void>;

  /**
   * Re-enable a server that was auto-disabled due to failures.
   * Resets failure count and retry state.
   * 
   * @param serverId - Server ID to re-enable
   */
  reenableServer(serverId: string): Promise<void>;

  /**
   * Get list of all managed servers.
   */
  listServers(): MCPServerConfig[];

  /**
   * Cleanup all servers and resources.
   * Called on plugin unload.
   */
  shutdown(): Promise<void>;

  /**
   * Subscribe to server lifecycle events.
   */
  on(event: 'server-started' | 'server-stopped' | 'server-failed' | 'server-auto-disabled', 
     callback: (serverId: string, details?: unknown) => void): void;
}
