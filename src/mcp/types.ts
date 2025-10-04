/**
 * MCP Server Integration Types
 * Core type definitions for MCP server management, tool execution, and health monitoring
 */

// Connection and Transport Types
export enum TransportProtocol {
	STDIO = 'stdio',
	SSE = 'sse'
}

export enum ConnectionState {
	DISCONNECTED = 'disconnected',
	CONNECTING = 'connecting',
	CONNECTED = 'connected',
	ERROR = 'error'
}

// Execution Status Types
export enum ExecutionStatus {
	PENDING = 'pending',
	EXECUTING = 'executing',
	SUCCESS = 'success',
	ERROR = 'error',
	TIMEOUT = 'timeout',
	CANCELLED = 'cancelled'
}

// Core Configuration Types (DEPRECATED - use config.ts instead)
// Keeping for backward compatibility during migration
export type ConfigDisplayMode = 'simple' | 'command'

export interface MCPServerConfig {
	// Identity
	id: string
	name: string

	// Configuration input (URL, Command, or JSON)
	configInput: string

	// Preferred display mode for settings UI (optional)
	displayMode?: ConfigDisplayMode

	// State
	enabled: boolean

	// Health tracking
	lastConnectedAt?: number
	failureCount: number
	autoDisabled: boolean
}

export interface SectionBinding {
	sectionType: 'heading' | 'block' | 'range'
	headingText?: string
	blockId?: string
	startLine?: number
	endLine?: number
	serverId: string
	inheritToChildren: boolean
}

// Tool Execution Types
export interface ToolInvocationRequest {
	id: string
	serverId: string
	toolName: string
	parameters: Record<string, unknown>
	source: 'user-codeblock' | 'ai-autonomous'
	documentPath: string
	sectionLine?: number
	status: ExecutionStatus
	submittedAt: number
	startedAt?: number
	completedAt?: number
	retryAttempt: number
	maxRetries: number
	result?: ToolExecutionResult
	error?: ErrorInfo
}

export interface ToolExecutionResult {
	content: unknown
	contentType: 'text' | 'json' | 'markdown' | 'image'
	executionDuration: number
	tokensUsed?: number
	displayFormat?: 'inline' | 'block' | 'collapsed'
}

export interface ToolServerInfo {
	id: string
	name: string
}

export interface ErrorInfo {
	message: string
	code?: string
	details?: unknown
	timestamp: number
}

// Retry Policy Types
export interface RetryPolicy {
	maxAttempts: number
	initialDelay: number // milliseconds
	maxDelay: number // milliseconds
	backoffMultiplier: number
	jitter: boolean // add randomness to prevent thundering herd
	transientErrorCodes: string[] // error codes that should be retried
}

export interface RetryState {
	isRetrying: boolean
	currentAttempt: number
	nextRetryAt?: number
	backoffIntervals: number[]
	lastError?: Error
}

// Health Monitoring Types
export interface ServerHealthStatus {
	serverId: string
	connectionState: ConnectionState
	lastPingAt?: number
	pingLatency?: number
	consecutiveFailures: number
	retryState: RetryState
	autoDisabledAt?: number
}

// Session Tracking Types
export interface ExecutionTracker {
	concurrentLimit: number
	sessionLimit: number
	activeExecutions: Set<string>
	totalExecuted: number
	stopped: boolean
	executionHistory: ExecutionHistoryEntry[]
}

export interface ExecutionHistoryEntry {
	requestId: string
	serverId: string
	serverName: string
	toolName: string
	timestamp: number
	duration: number
	status: 'pending' | 'success' | 'error' | 'timeout' | 'cancelled'
	errorMessage?: string
}

// AI Provider Integration Types
export interface AIToolContext {
	tools: {
		serverId: string
		serverName: string
		toolName: string
		description: string
		inputSchema: JSONSchema
	}[]
	executeTool: (serverId: string, toolName: string, params: Record<string, unknown>) => Promise<ToolExecutionResult>
	enabledServers: string[]
	sectionBinding?: string
}

export interface ToolRequest {
	toolName: string
	serverId?: string
	parameters: Record<string, unknown>
	requestId: string
}

// Type Guards for Validation
export function isMCPServerConfig(obj: unknown): obj is MCPServerConfig {
	return (
		typeof obj === 'object' &&
		obj !== null &&
		'id' in obj &&
		typeof obj.id === 'string' &&
		'name' in obj &&
		typeof obj.name === 'string' &&
		'configInput' in obj &&
		typeof obj.configInput === 'string' &&
		'enabled' in obj &&
		typeof obj.enabled === 'boolean' &&
		'failureCount' in obj &&
		typeof obj.failureCount === 'number' &&
		'autoDisabled' in obj &&
		typeof obj.autoDisabled === 'boolean'
	)
}

export function isToolInvocationRequest(obj: unknown): obj is ToolInvocationRequest {
	return (
		typeof obj === 'object' &&
		obj !== null &&
		'id' in obj &&
		typeof obj.id === 'string' &&
		'serverId' in obj &&
		typeof obj.serverId === 'string' &&
		'toolName' in obj &&
		typeof obj.toolName === 'string' &&
		'parameters' in obj &&
		typeof obj.parameters === 'object' &&
		'source' in obj &&
		(obj.source === 'user-codeblock' || obj.source === 'ai-autonomous') &&
		'documentPath' in obj &&
		typeof obj.documentPath === 'string' &&
		'status' in obj &&
		Object.values(ExecutionStatus).includes(obj.status as ExecutionStatus) &&
		'submittedAt' in obj &&
		typeof obj.submittedAt === 'number' &&
		'retryAttempt' in obj &&
		typeof obj.retryAttempt === 'number' &&
		'maxRetries' in obj &&
		typeof obj.maxRetries === 'number'
	)
}

export function isToolExecutionResult(obj: unknown): obj is ToolExecutionResult {
	return (
		typeof obj === 'object' &&
		obj !== null &&
		'content' in obj &&
		'contentType' in obj &&
		['text', 'json', 'markdown', 'image'].includes(obj.contentType as string) &&
		'executionDuration' in obj &&
		typeof obj.executionDuration === 'number'
	)
}

// MCP Client Interface
export interface MCPClient {
	connect(config: MCPServerConfig): Promise<void>
	disconnect(): Promise<void>
	listTools(): Promise<ToolDefinition[]>
	callTool(toolName: string, parameters: Record<string, unknown>, timeout?: number): Promise<ToolExecutionResult>
	isConnected(): boolean
	getCapabilities(): ServerCapabilities
}

// Tool Definition
export interface ToolDefinition {
	name: string
	description?: string
	inputSchema: JSONSchema
}

// Server Capabilities
export interface ServerCapabilities {
	tools: boolean
	prompts: boolean
	resources: boolean
}

// Tool Invocation (for code block processor)
export interface ToolInvocation {
	serverId: string
	toolName: string
	parameters: Record<string, unknown>
}

// Type aliases for external types
export type JSONSchema = Record<string, unknown>
export type Message = {
	role: 'system' | 'user' | 'assistant'
	content: string | unknown
}
