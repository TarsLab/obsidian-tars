/**
 * Adapter layer to convert Tars MCP configs to mcp-use format
 * 
 * This adapter bridges our Obsidian-specific configuration format
 * with the mcp-use library's expected format.
 */

import type { MCPServerConfig } from './types';

/**
 * mcp-use server configuration format
 */
export interface MCPUseServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * mcp-use full configuration format
 */
export interface MCPUseConfig {
  mcpServers: Record<string, MCPUseServerConfig>;
}

/**
 * Convert a single Tars MCPServerConfig to mcp-use format
 */
export function toMCPUseServerConfig(config: MCPServerConfig): Record<string, MCPUseServerConfig> {
  const serverName = config.id;

  // Handle stdio transport
  if (config.transport === 'stdio') {
    if (!config.dockerConfig) {
      throw new Error(`Stdio transport requires dockerConfig for server ${config.id}`);
    }

    if (config.deploymentType === 'managed') {
      // Check if this is a package name (like @modelcontextprotocol/server-memory) or Docker image
      const isPackage = config.dockerConfig.image.startsWith('@') || 
                       config.dockerConfig.image.includes('/') && !config.dockerConfig.image.includes(':');
      
      if (isPackage) {
        // Run as npx package
        return {
          [serverName]: {
            command: 'npx',
            args: [
              '-y',
              config.dockerConfig.image,
              ...(config.dockerConfig.command || [])
            ],
            env: config.dockerConfig.env
          }
        };
      } else {
        // Managed server: spawn container with docker run
        return {
          [serverName]: {
            command: 'docker',
            args: [
              'run',
              '-i',
              '--rm', // Auto-remove when done
              '--name',
              config.dockerConfig.containerName,
              config.dockerConfig.image,
              ...(config.dockerConfig.command || [])
            ],
            env: config.dockerConfig.env
          }
        };
      }
    } else {
      // External server: exec into existing container
      const execCommand = config.dockerConfig.command || ['mcp-server'];
      return {
        [serverName]: {
          command: 'docker',
          args: [
            'exec',
            '-i',
            config.dockerConfig.containerName,
            ...execCommand
          ],
          env: config.dockerConfig.env
        }
      };
    }
  }

  // Handle SSE transport (not supported by mcp-use yet)
  if (config.transport === 'sse') {
    throw new Error(
      `SSE transport is not yet supported by mcp-use for server ${config.id}. ` +
      'Please use stdio transport or implement custom SSE handling.'
    );
  }

  throw new Error(`Unsupported transport type: ${config.transport}`);
}

/**
 * Convert array of Tars configs to full mcp-use config
 */
export function toMCPUseConfig(configs: MCPServerConfig[]): MCPUseConfig {
  const mcpServers: Record<string, MCPUseServerConfig> = {};

  for (const config of configs) {
    if (config.enabled) {
      try {
        const serverConfig = toMCPUseServerConfig(config);
        Object.assign(mcpServers, serverConfig);
      } catch (error) {
        console.warn(`Skipping server ${config.id}:`, error);
      }
    }
  }

  return { mcpServers };
}

/**
 * Validate that a config can be converted to mcp-use format
 */
export function canUseMCPUse(config: MCPServerConfig): boolean {
  // Only stdio transport is supported by mcp-use
  if (config.transport !== 'stdio') {
    return false;
  }

  // Requires docker config
  if (!config.dockerConfig) {
    return false;
  }

  return true;
}

/**
 * Get list of configs that can/cannot use mcp-use
 */
export function partitionConfigs(configs: MCPServerConfig[]): {
  mcpUseConfigs: MCPServerConfig[];
  customConfigs: MCPServerConfig[];
} {
  const mcpUseConfigs: MCPServerConfig[] = [];
  const customConfigs: MCPServerConfig[] = [];

  for (const config of configs) {
    if (config.enabled) {
      if (canUseMCPUse(config)) {
        mcpUseConfigs.push(config);
      } else {
        customConfigs.push(config);
      }
    }
  }

  return { mcpUseConfigs, customConfigs };
}
