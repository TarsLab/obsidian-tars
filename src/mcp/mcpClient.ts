import { MCPClient, MCPServerConfig, MCPTool, ToolResult } from './types'

export class RemoteMCPClient implements MCPClient {
	serverId: string
	isConnected: boolean = false
	tools: MCPTool[] = []
	lastHealthCheck: Date = new Date()
	
	private config: MCPServerConfig
	private client: any // mcp-remote client instance

	constructor(config: MCPServerConfig) {
		this.serverId = config.id
		this.config = config
	}

	async connect(): Promise<void> {
		try {
			// Import mcp-remote dynamically to handle potential missing dependency
			const { RemoteClient } = await import('mcp-remote')
			
			this.client = new RemoteClient({
				url: `${this.config.url}:${this.config.port}`,
				timeout: 10000
			})

			await this.client.connect()
			this.isConnected = true
			this.lastHealthCheck = new Date()
			
			// Discover tools after connection
			await this.discoverTools()
		} catch (error) {
			this.isConnected = false
			throw new Error(`Failed to connect to MCP server ${this.serverId}: ${error.message}`)
		}
	}

	async disconnect(): Promise<void> {
		try {
			if (this.client) {
				await this.client.disconnect()
			}
			this.isConnected = false
			this.tools = []
		} catch (error) {
			console.warn(`Error disconnecting from MCP server ${this.serverId}:`, error)
		}
	}

	async discoverTools(): Promise<MCPTool[]> {
		if (!this.isConnected || !this.client) {
			throw new Error(`MCP server ${this.serverId} is not connected`)
		}

		try {
			const toolsResponse = await this.client.listTools()
			this.tools = toolsResponse.tools.map((tool: any) => ({
				name: tool.name,
				description: tool.description,
				inputSchema: tool.inputSchema,
				serverId: this.serverId
			}))
			
			return this.tools
		} catch (error) {
			throw new Error(`Failed to discover tools from MCP server ${this.serverId}: ${error.message}`)
		}
	}

	async invokeTool(toolName: string, parameters: Record<string, unknown>): Promise<ToolResult> {
		if (!this.isConnected || !this.client) {
			throw new Error(`MCP server ${this.serverId} is not connected`)
		}

		const startTime = Date.now()
		
		try {
			const result = await this.client.callTool({
				name: toolName,
				arguments: parameters
			})

			return {
				toolName,
				serverId: this.serverId,
				result: result.content,
				executionTime: Date.now() - startTime
			}
		} catch (error) {
			return {
				toolName,
				serverId: this.serverId,
				result: null,
				error: error.message,
				executionTime: Date.now() - startTime
			}
		}
	}

	async healthCheck(): Promise<boolean> {
		try {
			if (!this.client) {
				return false
			}

			// Simple ping to check if server is responsive
			await this.client.ping()
			this.lastHealthCheck = new Date()
			return true
		} catch (error) {
			this.isConnected = false
			return false
		}
	}
}