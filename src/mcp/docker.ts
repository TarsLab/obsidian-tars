/**
 * Docker API Integration
 * Provides Docker Engine API client for managing MCP server containers
 */

import { MCPServerConfig, ConnectionState } from './types';
import { DockerError } from './errors';

export interface DockerContainerInfo {
  Id: string;
  Names: string[];
  Image: string;
  State: {
    Status: string; // "running", "exited", "created", etc.
    Running: boolean;
    Paused: boolean;
    Restarting: boolean;
    OOMKilled: boolean;
    Dead: boolean;
    Pid: number;
    ExitCode: number;
    Error: string;
    StartedAt: string;
    FinishedAt: string;
  };
  Ports: Array<{
    PrivatePort: number;
    PublicPort: number;
    Type: string;
  }>;
}

export interface DockerContainerConfig {
  Image: string;
  name?: string;
  Cmd?: string[];
  Env?: string[];
  ExposedPorts?: { [key: string]: Record<string, never> };
  HostConfig?: {
    PortBindings?: { [key: string]: Array<{ HostPort: string }> };
    Binds?: string[];
    RestartPolicy?: {
      Name: string;
      MaximumRetryCount?: number;
    };
  };
}

export class DockerClient {
  private baseUrl: string;

  constructor() {
    // Determine Docker socket location based on platform
    this.baseUrl = process.platform === 'win32'
      ? 'http://localhost:2375'  // Windows: Named pipe or TCP
      : 'http://unix:/var/run/docker.sock';  // Unix/macOS
  }

  /**
   * Create a new Docker container
   */
  async createContainer(config: DockerContainerConfig): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/containers/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new DockerError(
          `Failed to create container: ${response.status} ${response.statusText}`,
          undefined,
          errorText
        );
      }

      const data: { Id: string; Warnings?: string[] | null } = await response.json();
      return data.Id;
    } catch (error) {
      if (error instanceof DockerError) {
        throw error;
      }
      throw new DockerError(
        `Failed to create container: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        error
      );
    }
  }

  /**
   * Start a Docker container
   */
  async startContainer(containerId: string): Promise<void> {
    const response = await this.request(`/containers/${containerId}/start`, {
      method: 'POST'
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (errorText.includes('port is already allocated')) {
        throw new DockerError(
          `Port already in use for container ${containerId}`,
          containerId,
          errorText
        );
      }
      throw new DockerError(
        `Failed to start container ${containerId}: ${response.status} ${response.statusText}`,
        containerId,
        errorText
      );
    }
  }

  /**
   * Stop a Docker container
   */
  async stopContainer(containerId: string): Promise<void> {
    const response = await this.request(`/containers/${containerId}/stop`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new DockerError(
        `Failed to stop container ${containerId}: ${response.status} ${response.statusText}`,
        containerId,
        await response.text()
      );
    }
  }

  /**
   * Remove a Docker container
   */
  async removeContainer(containerId: string): Promise<void> {
    const response = await this.request(`/containers/${containerId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new DockerError(
        `Failed to remove container ${containerId}: ${response.status} ${response.statusText}`,
        containerId,
        await response.text()
      );
    }
  }

  /**
   * Get container information
   */
  async getContainerInfo(containerId: string): Promise<DockerContainerInfo> {
    const response = await this.request(`/containers/${containerId}/json`);

    if (!response.ok) {
      throw new DockerError(
        `Failed to get container info ${containerId}: ${response.status} ${response.statusText}`,
        containerId,
        await response.text()
      );
    }

    return await response.json();
  }

  /**
   * Get container status (running, exited, etc.)
   */
  async getContainerStatus(containerId: string): Promise<ConnectionState> {
    try {
      const info = await this.getContainerInfo(containerId);

      switch (info.State.Status) {
        case 'running':
          return ConnectionState.CONNECTED;
        case 'exited':
        case 'dead':
          return ConnectionState.ERROR;
        case 'created':
        case 'paused':
        case 'restarting':
          return ConnectionState.CONNECTING;
        default:
          return ConnectionState.ERROR;
      }
    } catch (_error) {
      return ConnectionState.ERROR;
    }
  }

  /**
   * List containers
   */
  async listContainers(all = false): Promise<DockerContainerInfo[]> {
    const url = `/containers/json${all ? '?all=true' : ''}`;
    const response = await this.request(url);

    if (!response.ok) {
      throw new DockerError(
        `Failed to list containers: ${response.status} ${response.statusText}`,
        undefined,
        await response.text()
      );
    }

    return await response.json();
  }

  /**
   * Check if Docker is available
   */
  async ping(): Promise<boolean> {
    try {
      const response = await this.request('/_ping');
      return response.ok;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Make HTTP request to Docker API
   */
  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    return response;
  }

  /**
   * Build container configuration from MCPServerConfig
   */
  buildContainerConfig(config: MCPServerConfig): DockerContainerConfig {
    if (!config.dockerConfig) {
      throw new DockerError('Docker config required for container creation');
    }

    const dockerConfig = config.dockerConfig;
    const containerConfig: DockerContainerConfig = {
      Image: dockerConfig.image,
      name: dockerConfig.containerName,
      Cmd: dockerConfig.command
    };

    // Add port bindings if specified
    if (dockerConfig.ports && Object.keys(dockerConfig.ports).length > 0) {
      containerConfig.ExposedPorts = {};
      containerConfig.HostConfig = {
        PortBindings: {}
      };

      for (const [containerPort, hostPort] of Object.entries(dockerConfig.ports)) {
        containerConfig.ExposedPorts[`${containerPort}/tcp`] = {};
        containerConfig.HostConfig!.PortBindings![`${containerPort}/tcp`] = [
          { HostPort: hostPort.toString() }
        ];
      }
    }

    return containerConfig;
  }
}
