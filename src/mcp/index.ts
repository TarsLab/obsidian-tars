/**
 * MCP Integration Public API
 * Main entry point for MCP server integration functionality
 */

// Core classes
export { CodeBlockProcessor } from './codeBlockProcessor'
export { registerDocumentSessionHandlers } from './documentSessionHandlers'
export * from './errors'
export type { SessionNotificationHandlers } from './executor'
export { ToolExecutor } from './executor'
export { MCPServerManager } from './managerMCPUse' // Using mcp-use library
// Migration
export { migrateServerConfig, migrateServerConfigs, needsMigration } from './migration'
export {
	buildToolServerMapping,
	type ClaudeAdapterConfig,
	ClaudeProviderAdapter,
	createOpenAIAdapter,
	createOpenAIAdapterWithMapping,
	type OllamaAdapterConfig,
	OllamaProviderAdapter,
	type OpenAIAdapterConfig,
	type OpenAIAdapterConfigSimple,
	OpenAIProviderAdapter
} from './providerAdapters'
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
export {
	createToolCallingCoordinator,
	type GenerateOptions,
	type Message,
	type ProviderAdapter,
	ToolCallingCoordinator,
	type ToolExecutionRequest,
} from './toolCallingCoordinator'
// Tool calling infrastructure
export {
	ClaudeToolResponseParser,
	OllamaToolResponseParser,
	OpenAIToolResponseParser,
	type StreamChunk,
	type TextChunk,
	type ToolCall,
	type ToolCallChunk,
	type ToolResponseParser
} from './toolResponseParser'
export { type CachedToolResult, DocumentToolCache } from './toolResultCache'
// Tool result formatting
export {
	type FormatOptions,
	formatResultContent,
	formatToolResult,
	formatToolResultAsMarkdown,
	renderToolResultToDOM
} from './toolResultFormatter'
// Core types
export * from './types'
export * from './utils'

import type { StatusBarManager } from '../statusBarManager'
import { CodeBlockProcessor } from './codeBlockProcessor'
import type { SessionNotificationHandlers } from './executor'
import { ToolExecutor } from './executor'
// Import types for function signatures
import { MCPServerManager } from './managerMCPUse'

// Factory functions for common usage patterns
export function createMCPManager(): MCPServerManager {
	return new MCPServerManager()
}

export function createToolExecutor(
	manager: MCPServerManager,
	options?: {
		timeout?: number
		concurrentLimit?: number
		sessionLimit?: number
		statusBarManager?: StatusBarManager
		sessionNotifications?: SessionNotificationHandlers
	}
): ToolExecutor {
	const tracker = {
		concurrentLimit: options?.concurrentLimit ?? DEFAULT_CONCURRENT_LIMIT,
		sessionLimit: options?.sessionLimit ?? DEFAULT_SESSION_LIMIT,
		activeExecutions: new Set<string>(),
		totalExecuted: 0,
		stopped: false,
		executionHistory: []
	}

	return new ToolExecutor(
		manager,
		tracker,
		{
			timeout: options?.timeout ?? DEFAULT_MCP_TIMEOUT,
			sessionNotifications: options?.sessionNotifications
		},
		options?.statusBarManager
	)
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
