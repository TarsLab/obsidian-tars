/**
 * MCP Integration Public API
 * Main entry point for MCP server integration functionality
 */

// Core types
export * from './types';
export * from './errors';

// Core classes
export { MCPClientImpl } from './client';
export type { MCPClient } from './client';
export { MCPServerManager } from './manager';
export { ToolExecutor } from './executor';
export { CodeBlockProcessor } from './codeBlockProcessor';
export { DockerClient } from './docker';
export { HealthMonitor } from './healthMonitor';

// Import types for function signatures
import { MCPServerManager } from './manager';
import { ToolExecutor } from './executor';
import { CodeBlockProcessor } from './codeBlockProcessor';

// Factory functions for common usage patterns
export function createMCPManager(): MCPServerManager {
  return new MCPServerManager();
}

export function createToolExecutor(manager: MCPServerManager): ToolExecutor {
  const tracker = {
    concurrentLimit: 25,
    sessionLimit: 25,
    activeExecutions: new Set<string>(),
    totalExecuted: 0,
    stopped: false,
    executionHistory: []
  };

  return new ToolExecutor(manager, tracker);
}

export function createCodeBlockProcessor(): CodeBlockProcessor {
  return new CodeBlockProcessor();
}

// Default configuration helpers
export const DEFAULT_MCP_TIMEOUT = 30000; // 30 seconds
export const DEFAULT_CONCURRENT_LIMIT = 25;
export const DEFAULT_SESSION_LIMIT = 25;

// Health monitoring intervals
export const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
export const RETRY_BACKOFF_INTERVALS = [1000, 5000, 15000]; // 1s, 5s, 15s
