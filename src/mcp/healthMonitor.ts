/**
 * Health Monitoring System
 * Monitors MCP server health and implements retry logic with exponential backoff
 */

import { MCPServerConfig, ServerHealthStatus, ConnectionState } from './types';
import { MCPClientImpl } from './client';
import { DockerClient } from './docker';

export interface RetryStrategy {
  isRetrying: boolean;
  currentAttempt: number;
  nextRetryAt?: number;
  backoffIntervals: number[];
}

export class HealthMonitor {
  private healthStatus: Map<string, ServerHealthStatus> = new Map();
  private intervalId?: NodeJS.Timeout;
  private readonly dockerClient: DockerClient;
  private readonly checkIntervalMs = 30000; // 30 seconds

  constructor() {
    this.dockerClient = new DockerClient();
  }

  /**
   * Start health monitoring for all enabled servers
   */
  startMonitoring(servers: MCPServerConfig[]): void {
    // Initialize health status for all servers
    for (const server of servers) {
      if (!this.healthStatus.has(server.id)) {
        this.initializeHealthStatus(server);
      }
    }

    // Start periodic health checks
    if (!this.intervalId) {
      this.intervalId = setInterval(() => {
        this.performHealthChecks(servers);
      }, this.checkIntervalMs);
    }
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Get health status for a server
   */
  getHealthStatus(serverId: string): ServerHealthStatus | undefined {
    return this.healthStatus.get(serverId);
  }

  /**
   * Manually trigger health check
   */
  async performHealthChecks(servers: MCPServerConfig[]): Promise<void> {
    for (const server of servers) {
      if (!server.enabled) continue;

      try {
        await this.checkServerHealth(server);
      } catch (error) {
        console.error(`Health check failed for server ${server.name}:`, error);
        this.handleHealthCheckFailure(server);
      }
    }
  }

  /**
   * Initialize health status for a server
   */
  private initializeHealthStatus(server: MCPServerConfig): void {
    this.healthStatus.set(server.id, {
      serverId: server.id,
      connectionState: ConnectionState.DISCONNECTED,
      consecutiveFailures: server.failureCount,
      retryState: {
        isRetrying: false,
        currentAttempt: 0,
        backoffIntervals: [1000, 5000, 15000] // 1s, 5s, 15s
      }
    });
  }

  /**
   * Check health of a single server
   */
  private async checkServerHealth(server: MCPServerConfig): Promise<void> {
    const healthStatus = this.healthStatus.get(server.id);
    if (!healthStatus) return;

    // Skip if currently retrying and not time yet
    if (healthStatus.retryState.isRetrying &&
        healthStatus.retryState.nextRetryAt &&
        Date.now() < healthStatus.retryState.nextRetryAt) {
      return;
    }

    healthStatus.connectionState = ConnectionState.CONNECTING;

    try {
      let isHealthy = false;

      if (server.deploymentType === 'managed') {
        // Check Docker container status
        if (!server.dockerConfig) {
          throw new Error('Docker config missing for managed server');
        }

        const containers = await this.dockerClient.listContainers(true);
        const container = containers.find(c =>
          c.Names.includes(`/${server.dockerConfig!.containerName}`)
        );

        if (container && container.State.Status === 'running') {
          isHealthy = true;
        }
      } else if (server.deploymentType === 'external') {
        // For external servers, try to create a temporary client connection
        const client = new MCPClientImpl();
        try {
          await client.connect(server);
          await client.disconnect();
          isHealthy = true;
        } catch (error) {
          isHealthy = false;
        }
      }

      if (isHealthy) {
        this.handleSuccessfulHealthCheck(server, healthStatus);
      } else {
        throw new Error('Server not responding');
      }

    } catch (error) {
      this.handleHealthCheckFailure(server, healthStatus);
    }
  }

  /**
   * Handle successful health check
   */
  private handleSuccessfulHealthCheck(
    server: MCPServerConfig,
    healthStatus: ServerHealthStatus
  ): void {
    healthStatus.connectionState = ConnectionState.CONNECTED;
    healthStatus.lastPingAt = Date.now();
    healthStatus.consecutiveFailures = 0;
    healthStatus.retryState.isRetrying = false;
    healthStatus.retryState.currentAttempt = 0;
    healthStatus.retryState.nextRetryAt = undefined;
    healthStatus.autoDisabledAt = undefined;

    // Reset auto-disabled flag if server recovered
    if (server.autoDisabled) {
      // This would need to be updated in the server config
      console.log(`Server ${server.name} recovered from auto-disable`);
    }
  }

  /**
   * Handle failed health check
   */
  private handleHealthCheckFailure(
    server: MCPServerConfig,
    healthStatus: ServerHealthStatus = this.healthStatus.get(server.id)!
  ): void {
    if (!healthStatus) return;

    healthStatus.connectionState = ConnectionState.ERROR;
    healthStatus.consecutiveFailures++;

    const maxRetries = healthStatus.retryState.backoffIntervals.length;

    if (healthStatus.retryState.currentAttempt < maxRetries) {
      // Schedule retry with exponential backoff
      healthStatus.retryState.isRetrying = true;
      healthStatus.retryState.currentAttempt++;

      const backoffIndex = healthStatus.retryState.currentAttempt - 1;
      const backoffMs = healthStatus.retryState.backoffIntervals[backoffIndex] || 15000;

      healthStatus.retryState.nextRetryAt = Date.now() + backoffMs;

      console.warn(
        `Server ${server.name} health check failed (attempt ${healthStatus.retryState.currentAttempt}/${maxRetries}). ` +
        `Retrying in ${backoffMs}ms`
      );
    } else {
      // Max retries exceeded - auto-disable
      this.autoDisableServer(server);
    }
  }

  /**
   * Auto-disable a server after repeated failures
   */
  private autoDisableServer(server: MCPServerConfig): void {
    const healthStatus = this.healthStatus.get(server.id);
    if (!healthStatus) return;

    healthStatus.autoDisabledAt = Date.now();

    console.error(
      `Server ${server.name} auto-disabled after ${healthStatus.retryState.currentAttempt} failed attempts`
    );

    // Show user notification (would be handled by UI layer)
    // This is just the monitoring logic
  }

  /**
   * Re-enable a server that was auto-disabled
   */
  reenableServer(serverId: string): void {
    const healthStatus = this.healthStatus.get(serverId);
    if (!healthStatus) return;

    healthStatus.consecutiveFailures = 0;
    healthStatus.retryState.isRetrying = false;
    healthStatus.retryState.currentAttempt = 0;
    healthStatus.retryState.nextRetryAt = undefined;
    healthStatus.autoDisabledAt = undefined;
  }

  /**
   * Get all health statuses
   */
  getAllHealthStatuses(): ServerHealthStatus[] {
    return Array.from(this.healthStatus.values());
  }

  /**
   * Check if a server should be considered healthy
   */
  isServerHealthy(serverId: string): boolean {
    const healthStatus = this.healthStatus.get(serverId);
    return healthStatus?.connectionState === ConnectionState.CONNECTED && !healthStatus.autoDisabledAt;
  }
}
