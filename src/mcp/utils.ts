/**
 * MCP Utility Functions
 * Common helpers and patterns used across MCP modules
 */

import type { MCPServerConfig } from './types';
import { DeploymentType, TransportProtocol } from './types';

/**
 * Extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Format error with context for logging
 */
export function formatErrorWithContext(context: string, error: unknown): string {
  return `${context}: ${getErrorMessage(error)}`;
}

/**
 * Safe async operation wrapper that logs errors but doesn't throw
 */
export async function safeAsync<T>(
  operation: () => Promise<T>,
  fallback: T,
  errorMessage: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.warn(formatErrorWithContext(errorMessage, error));
    return fallback;
  }
}

/**
 * Log error with context
 */
export function logError(context: string, error: unknown): void {
  console.error(formatErrorWithContext(context, error));
}

/**
 * Log warning with context
 */
export function logWarning(context: string, error: unknown): void {
  console.warn(formatErrorWithContext(context, error));
}

/**
 * Parse executionCommand and populate config fields
 * Supports: 1) Plain shell command, 2) VS Code MCP JSON format, 3) URL for remote server
 */
export function parseExecutionCommand(config: MCPServerConfig): void {
  const cmd = config.executionCommand?.trim();
  
  if (!cmd) {
    return; // No command to parse
  }

  // Skip parsing if config already has dockerConfig or sseConfig
  if (config.dockerConfig || config.sseConfig) {
    return;
  }

  // Try to parse as JSON first (VS Code MCP format)
  if (cmd.startsWith('{')) {
    try {
      const jsonConfig = JSON.parse(cmd);
      
      // Check if it's a VS Code MCP JSON config
      if (jsonConfig.command) {
        const command = jsonConfig.command;
        const args = jsonConfig.args || [];
        const env = jsonConfig.env || {};
        
        // Determine if this is a Docker command
        if (command === 'docker' && args.length > 0 && args[0] === 'run') {
          // Parse docker run command from JSON args
          config.deploymentType = DeploymentType.MANAGED;
          
          // Extract image name - find first non-flag arg after 'run'
          // Skip known single-char flags without values: -i, -t, -d
          // Skip known flags with no values: --rm, --init
          let imageIndex = -1;
          let i = 1; // Start after 'run'
          while (i < args.length) {
            const arg = args[i];
            
            // Skip single-char flags and their potential values
            if (arg === '-i' || arg === '-t' || arg === '-d' || arg === '--rm' || arg === '--init') {
              i++;
              continue;
            }
            
            // Skip flags with values (--name, --env, -e, etc.)
            if (arg.startsWith('--') && i + 1 < args.length && !args[i].includes('=')) {
              i += 2; // Skip flag and its value
              continue;
            }
            
            if (arg.startsWith('-') && arg.length === 2 && i + 1 < args.length) {
              i += 2; // Skip short flag and its value
              continue;
            }
            
            // Skip flags with inline values (--name=value)
            if (arg.includes('=')) {
              i++;
              continue;
            }
            
            // Found the image name
            if (!arg.startsWith('-')) {
              imageIndex = i;
              break;
            }
            
            i++;
          }
          
          if (imageIndex >= 0) {
            const image = args[imageIndex];
            const containerName = config.name || `mcp-${Date.now()}`;
            const extraArgs = args.slice(imageIndex + 1);
            
            config.dockerConfig = {
              image: image,
              containerName: containerName,
              command: extraArgs.length > 0 ? extraArgs : undefined,
              env: Object.keys(env).length > 0 ? env : undefined
            };
          }
        } else {
          // Non-docker command (e.g., npx, uvx, node, python, etc.)
          config.deploymentType = DeploymentType.MANAGED;
          config.dockerConfig = {
            image: command, // Use command as "image" for npx/uvx style invocations
            containerName: config.name || `mcp-${Date.now()}`,
            command: args.length > 0 ? args : undefined,
            env: Object.keys(env).length > 0 ? env : undefined
          };
        }
        
        return;
      }
    } catch (e) {
      // Not valid JSON, fall through to try other parsing methods
      console.debug('Failed to parse as JSON:', e);
    }
  }
  
  // Check if it's a URL (for SSE transport)
  if (cmd.startsWith('http://') || cmd.startsWith('https://')) {
    config.deploymentType = DeploymentType.EXTERNAL;
    config.sseConfig = {
      url: cmd
    };
    // Ensure transport is set to SSE
    if (config.transport !== TransportProtocol.SSE) {
      console.warn(`URL provided but transport is ${config.transport}, setting to SSE`);
      config.transport = TransportProtocol.SSE;
    }
    return;
  }
  
  // Parse as plain shell command
  const parts = cmd.split(/\s+/);
  if (parts.length === 0) {
    return;
  }
  
  const command = parts[0];
  const args = parts.slice(1);
  
  // Check if it's a docker command
  if (command === 'docker' && args.length > 0) {
    if (args[0] === 'run') {
      // Parse docker run command
      config.deploymentType = DeploymentType.MANAGED;
      
      // Simple parsing: find the image name (first non-flag argument after 'run')
      let imageIndex = -1;
      for (let i = 1; i < args.length; i++) {
        if (!args[i].startsWith('-')) {
          imageIndex = i;
          break;
        }
      }
      
      if (imageIndex >= 0) {
        const image = args[imageIndex];
        const containerName = config.name || `mcp-${Date.now()}`;
        const extraArgs = args.slice(imageIndex + 1);
        
        config.dockerConfig = {
          image: image,
          containerName: containerName,
          command: extraArgs.length > 0 ? extraArgs : undefined
        };
      }
    } else if (args[0] === 'exec') {
      // Docker exec - external server
      config.deploymentType = DeploymentType.EXTERNAL;
      const containerName = args[1] || config.name;
      const execCommand = args.slice(2);
      
      config.dockerConfig = {
        image: '', // Not needed for exec
        containerName: containerName,
        command: execCommand.length > 0 ? execCommand : undefined
      };
    }
  } else {
    // Non-docker command (npx, uvx, node, python, etc.)
    config.deploymentType = DeploymentType.MANAGED;
    config.dockerConfig = {
      image: command,
      containerName: config.name || `mcp-${Date.now()}`,
      command: args.length > 0 ? args : undefined
    };
  }
}
