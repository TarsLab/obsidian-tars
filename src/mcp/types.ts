export interface MCPServerConfig {
	id: string
	name: string
	dockerImage: string
	port: number
	enabled?: boolean
	protocol: 'STDIO' | 'SSE'
	command?: string
	endpoint?: string // For SSE protocol
	credentials?: Record<string, string>
	environment?: Record<string, string>
	retryConfig?: RetryConfig
}

export interface RetryConfig {
	maxRetries: number
	initialDelay: number
	maxDelay: number
	backoffMultiplier: number
}

export interface MCPTool {
	name: string
	description: string
	inputSchema: Record<string, unknown>
	serverId: string
}

export interface ToolResult {
	toolName: string
	serverId: string
	result: unknown
	error?: string
	executionTime: number
}

export interface TagToolMapping {
	tagPattern: string
	toolNames: string[]
	serverIds: string[]
	parameters?: Record<string, unknown>
}

export interface ConnectionState {
	status: 'connected' | 'disconnected' | 'connecting' | 'reconnecting' | 'failed'
	lastConnected?: Date
	lastError?: string
	retryCount: number
	nextRetryAt?: Date
}

export interface MCPClient {
	serverId: string
	isConnected: boolean
	tools: MCPTool[]
	lastHealthCheck: Date
	connectionState: ConnectionState
	connect(): Promise<void>
	disconnect(): Promise<void>
	discoverTools(): Promise<MCPTool[]>
	invokeTool(toolName: string, parameters: Record<string, unknown>): Promise<ToolResult>
	healthCheck(): Promise<boolean>
	reconnect(): Promise<void>
}