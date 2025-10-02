/**
 * MCP Integration Public API
 * Main entry point for MCP server integration functionality
 */

// Core classes
export { CodeBlockProcessor } from './codeBlockProcessor'
export * from './errors'
export { ToolExecutor } from './executor'
export { MCPServerManager } from './managerMCPUse' // Using mcp-use library
// Provider integration
export {
	buildAIToolContext,
	formatToolResultForAI,
	formatToolsForSystemMessage,
	parseToolCallFromResponse
} from './providerIntegration'
// Provider tool integration (native tool calling)
export {
	buildClaudeTools,
	buildOllamaTools,
	buildOpenAITools,
	buildToolsForProvider,
	type ClaudeTool,
	getToolCallingModels,
	injectMCPTools,
	type OllamaTool,
	type OpenAITool,
	providerSupportsTools
} from './providerToolIntegration'
// Core types
export * from './types'
export * from './utils'

import { CodeBlockProcessor } from './codeBlockProcessor'
import { ToolExecutor } from './executor'
// Import types for function signatures
import { MCPServerManager } from './managerMCPUse'

// Factory functions for common usage patterns
export function createMCPManager(): MCPServerManager {
	return new MCPServerManager()
}

export function createToolExecutor(manager: MCPServerManager): ToolExecutor {
	const tracker = {
		concurrentLimit: 3,
		sessionLimit: 25,
		activeExecutions: new Set<string>(),
		totalExecuted: 0,
		stopped: false,
		executionHistory: []
	}

	return new ToolExecutor(manager, tracker)
}

export function createCodeBlockProcessor(): CodeBlockProcessor {
	return new CodeBlockProcessor()
}

// Default configuration helpers
export const DEFAULT_MCP_TIMEOUT = 30000 // 30 seconds
export const DEFAULT_CONCURRENT_LIMIT = 3
export const DEFAULT_SESSION_LIMIT = 25

// Health monitoring intervals
export const HEALTH_CHECK_INTERVAL = 30000 // 30 seconds
export const RETRY_BACKOFF_INTERVALS = [1000, 5000, 15000] // 1s, 5s, 15s
