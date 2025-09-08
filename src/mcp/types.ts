export interface MCPServerConfig {
	id: string
	name: string
	url: string
	port: number
	enabled: boolean
	credentials?: Record<string, string>
	dockerImage?: string
	environment?: Record<string, string>
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

export interface MCPClient {
	serverId: string
	isConnected: boolean
	tools: MCPTool[]
	lastHealthCheck: Date
	connect(): Promise<void>
	disconnect(): Promise<void>
	discoverTools(): Promise<MCPTool[]>
	invokeTool(toolName: string, parameters: Record<string, unknown>): Promise<ToolResult>
	healthCheck(): Promise<boolean>
}