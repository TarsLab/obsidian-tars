/**
 * MCP Server Manager
 * Orchestrates MCP server lifecycle, health monitoring, and client management
 */

import { EventEmitter } from 'events';
import { MCPServerConfig, ServerHealthStatus } from './types';
import { MCPClientImpl, MCPClient } from './client';
import { DockerClient } from './docker';
import { HealthMonitor } from './healthMonitor';
import { DockerError, ServerNotAvailableError } from './errors';

export interface MCPServerManagerEvents {
  'server-started': [serverId: string];
  'server-stopped': [serverId: string];
  'server-failed': [serverId: string, error: Error];
  'server-auto-disabled': [serverId: string];
}

export class MCPServerManager extends EventEmitter<MCPServerManagerEvents> {
  private clients: Map<string, MCPClient> = new Map();
  private servers: Map<string, MCPServerConfig> = new Map();
  private readonly dockerClient: DockerClient;
  private readonly healthMonitor: HealthMonitor;

  constructor() {
    super();
    this.dockerClient = new DockerClient();
    this.healthMonitor = new HealthMonitor();

    // Forward health monitor events
    this.healthMonitor.on('server-auto-disabled', (serverId) => {
      this.emit('server-auto-disabled', serverId);
    });
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

    // Start health monitoring
    this.healthMonitor.startMonitoring(configs);

    // Start all enabled servers
    for (const config of configs) {
      if (config.enabled) {
        try {
          await this.startServer(config.id);
        } catch (error) {
          console.error(`Failed to start server ${config.name}:`, error);
          this.emit('server-failed', config.id, error as Error);
        }
      }
    }
  }

  /**
   * Start a specific MCP server
   */
  async startServer(serverId: string): Promise<void> {
    const config = this.servers.get(serverId);
    if (!config) {
      throw new ServerNotAvailableError(`Unknown server: ${serverId}`);
    }

    if (!config.enabled) {
      throw new ServerNotAvailableError(`Server ${config.name} is disabled`);
    }

    try {
      if (config.deploymentType === 'managed') {
        await this.startManagedServer(config);
      } else if (config.deploymentType === 'external') {
        await this.startExternalServer(config);
      } else {
        throw new Error(`Unsupported deployment type: ${config.deploymentType}`);
      }

      // Create and connect MCP client
      const client = new MCPClientImpl();
      await client.connect(config);
      this.clients.set(serverId, client);

      this.emit('server-started', serverId);

    } catch (error) {
      this.emit('server-failed', serverId, error as Error);
      throw error;
    }
  }

  /**
   * Start a managed (Docker) server
   */
  private async startManagedServer(config: MCPServerConfig): Promise<void> {
    if (!config.dockerConfig) {
      throw new DockerError('Docker config required for managed server');
    }

    try {
      // Check if container already exists
      const containers = await this.dockerClient.listContainers(true);
      const existingContainer = containers.find(c =>
        c.Names.includes(`/${config.dockerConfig!.containerName}`)
      );

      if (existingContainer) {
        // Check if it's running
        if (existingContainer.State.Status === 'running') {
          return; // Already running
        } else {
          // Remove stopped container
          await this.dockerClient.removeContainer(existingContainer.Id);
        }
      }

      // Create and start new container
      const containerConfig = this.dockerClient.buildContainerConfig(config);
      const containerId = await this.dockerClient.createContainer(containerConfig);
      await this.dockerClient.startContainer(containerId);

    } catch (error) {
      if (error instanceof DockerError) {
        throw error;
      }
      throw new DockerError(
        `Failed to start managed server ${config.name}`,
        config.dockerConfig.containerName,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Start an external server (no-op, just verify configuration)
   */
  private async startExternalServer(config: MCPServerConfig): Promise<void> {
    // For external servers, we don't manage lifecycle
    // Just validate configuration
    if (!config.sseConfig?.url) {
      throw new Error(`External server ${config.name} missing SSE URL configuration`);
    }

    // Could add basic connectivity check here if desired
    // For now, assume external servers are self-managed
  }

  /**
   * Stop a specific MCP server
   */
  async stopServer(serverId: string): Promise<void> {
    const config = this.servers.get(serverId);
    if (!config) {
      throw new ServerNotAvailableError(`Unknown server: ${serverId}`);
    }

    try {
      // Disconnect client
      const client = this.clients.get(serverId);
      if (client) {
        await client.disconnect();
        this.clients.delete(serverId);
      }

      // Stop managed servers
      if (config.deploymentType === 'managed' && config.dockerConfig) {
        try {
          await this.dockerClient.stopContainer(config.dockerConfig.containerName);
          // Optionally remove container
          // await this.dockerClient.removeContainer(config.dockerConfig.containerName);
        } catch (error) {
          // Log but don't fail if container is already stopped
          console.warn(`Error stopping container for ${config.name}:`, error);
        }
      }

      this.emit('server-stopped', serverId);

    } catch (error) {
      console.error(`Error stopping server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * Get MCP client for a server
   */
  getClient(serverId: string): MCPClient | undefined {
    const config = this.servers.get(serverId);
    if (!config || !config.enabled) {
      return undefined;
    }

    return this.clients.get(serverId);
  }

  /**
   * Get health status for a server
   */
  getHealthStatus(serverId: string): ServerHealthStatus | undefined {
    return this.healthMonitor.getHealthStatus(serverId);
  }

  /**
   * Perform health check on all servers
   */
  async performHealthCheck(): Promise<void> {
    await this.healthMonitor.performHealthChecks(Array.from(this.servers.values()));
  }

  /**
   * Re-enable a server that was auto-disabled
   */
  reenableServer(serverId: string): Promise<void> {
    this.healthMonitor.reenableServer(serverId);
    // Server config would need to be updated externally
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
    this.healthMonitor.stopMonitoring();

    // Stop all servers
    const stopPromises = Array.from(this.servers.keys()).map(serverId =>
      this.stopServer(serverId).catch(error =>
        console.warn(`Error stopping server ${serverId}:`, error)
      )
    );

    await Promise.all(stopPromises);

    // Clear state
    this.clients.clear();
    this.servers.clear();
  }
}
