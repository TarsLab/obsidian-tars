import { MCPClient, MCPServerConfig, MCPTool, ToolResult, ConnectionState, RetryConfig } from './types'

const DEFAULT_RETRY_CONFIG: RetryConfig = {
	maxRetries: 5,
	initialDelay: 1000, // 1 second
	maxDelay: 30000, // 30 seconds
	backoffMultiplier: 2
}

export class RemoteMCPClient implements MCPClient {
	serverId: string
	isConnected: boolean = false
	tools: MCPTool[] = []
	lastHealthCheck: Date = new Date()
	connectionState: ConnectionState
	
	private config: MCPServerConfig
	private client: any // mcp-remote client instance
	private retryConfig: RetryConfig
	private retryTimeoutId?: NodeJS.Timeout
	private reconnectPromise?: Promise<void>

	constructor(config: MCPServerConfig) {
		this.serverId = config.id
		this.config = config
		this.retryConfig = config.retryConfig || DEFAULT_RETRY_CONFIG
		
		this.connectionState = {
			status: 'disconnected',
			retryCount: 0
		}
	}

	async connect(): Promise<void> {
		this.connectionState.status = 'connecting'
		this.connectionState.retryCount = 0
		
		try {
			await this.attemptConnection()
			this.connectionState.status = 'connected'
			this.connectionState.lastConnected = new Date()
			this.connectionState.lastError = undefined
			this.isConnected = true
			this.lastHealthCheck = new Date()
			
			// Discover tools after connection
			await this.discoverTools()
		} catch (error) {
			this.connectionState.status = 'failed'
			this.connectionState.lastError = error.message
			this.isConnected = false
			throw new Error(`Failed to connect to MCP server ${this.serverId}: ${error.message}`)
		}
	}

	private async attemptConnection(): Promise<void> {
		// Import mcp-remote dynamically to handle potential missing dependency
		const { RemoteClient } = await import('mcp-remote')
		
		this.client = new RemoteClient({
			url: `${this.config.url}:${this.config.port}`,
			timeout: 10000
		})

		await this.client.connect()
	}

	async disconnect(): Promise<void> {
		// Clear any pending retry timeouts
		if (this.retryTimeoutId) {
			clearTimeout(this.retryTimeoutId)
			this.retryTimeoutId = undefined
		}
		
		this.connectionState.status = 'disconnected'
		
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

	async reconnect(): Promise<void> {
		if (this.reconnectPromise) {
			return this.reconnectPromise
		}

		this.reconnectPromise = this.performReconnect()
		
		try {
			await this.reconnectPromise
		} finally {
			this.reconnectPromise = undefined
		}
	}

	private async performReconnect(): Promise<void> {
		console.log(`Attempting to reconnect to MCP server ${this.serverId}...`)
		
		this.connectionState.status = 'reconnecting'
		this.connectionState.retryCount = 0
		
		while (this.connectionState.retryCount < this.retryConfig.maxRetries) {
			try {
				await this.attemptConnection()
				
				this.connectionState.status = 'connected'
				this.connectionState.lastConnected = new Date()
				this.connectionState.lastError = undefined
				this.connectionState.retryCount = 0
				this.isConnected = true
				this.lastHealthCheck = new Date()
				
				// Rediscover tools after reconnection
				await this.discoverTools()
				
				console.log(`Successfully reconnected to MCP server ${this.serverId}`)
				return
			} catch (error) {
				this.connectionState.retryCount++
				this.connectionState.lastError = error.message
				
				if (this.connectionState.retryCount >= this.retryConfig.maxRetries) {
					this.connectionState.status = 'failed'
					console.error(`Failed to reconnect to MCP server ${this.serverId} after ${this.retryConfig.maxRetries} attempts`)
					throw new Error(`Failed to reconnect to MCP server ${this.serverId}: ${error.message}`)
				}
				
				const delay = Math.min(
					this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffMultiplier, this.connectionState.retryCount - 1),
					this.retryConfig.maxDelay
				)
				
				this.connectionState.nextRetryAt = new Date(Date.now() + delay)
				
				console.log(`Reconnection attempt ${this.connectionState.retryCount} failed for ${this.serverId}. Retrying in ${delay}ms...`)
				
				await new Promise(resolve => setTimeout(resolve, delay))
			}
		}
	}

	private scheduleReconnect(): void {
		if (this.retryTimeoutId || this.connectionState.status === 'reconnecting') {
			return
		}

		const delay = Math.min(
			this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffMultiplier, this.connectionState.retryCount),
			this.retryConfig.maxDelay
		)

		this.connectionState.nextRetryAt = new Date(Date.now() + delay)

		this.retryTimeoutId = setTimeout(async () => {
			this.retryTimeoutId = undefined
			
			try {
				await this.reconnect()
			} catch (error) {
				console.error(`Auto-reconnect failed for MCP server ${this.serverId}:`, error)
			}
		}, delay)
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
		const startTime = Date.now()
		
		// Check connection and attempt recovery if needed
		if (!this.isConnected || !this.client) {
			console.log(`MCP server ${this.serverId} is not connected. Attempting to reconnect...`)
			
			try {
				await this.reconnect()
			} catch (error) {
				return {
					toolName,
					serverId: this.serverId,
					result: null,
					error: `Server not connected and reconnection failed: ${error.message}`,
					executionTime: Date.now() - startTime
				}
			}
		}
		
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
			// Check if error indicates connection loss
			if (this.isConnectionError(error)) {
				console.log(`Connection error detected for ${this.serverId}. Scheduling reconnect...`)
				this.isConnected = false
				this.connectionState.status = 'failed'
				this.connectionState.lastError = error.message
				this.scheduleReconnect()
			}
			
			return {
				toolName,
				serverId: this.serverId,
				result: null,
				error: error.message,
				executionTime: Date.now() - startTime
			}
		}
	}

	private isConnectionError(error: any): boolean {
		const errorMessage = error.message?.toLowerCase() || ''
		return errorMessage.includes('connection') || 
		       errorMessage.includes('timeout') || 
		       errorMessage.includes('network') ||
		       errorMessage.includes('econnrefused') ||
		       errorMessage.includes('socket')
	}

	async healthCheck(): Promise<boolean> {
		try {
			if (!this.client) {
				return false
			}

			// Simple ping to check if server is responsive
			await this.client.ping()
			this.lastHealthCheck = new Date()
			
			// Update connection state if we were previously failed
			if (this.connectionState.status === 'failed') {
				this.connectionState.status = 'connected'
				this.connectionState.lastError = undefined
			}
			
			return true
		} catch (error) {
			this.isConnected = false
			
			// Check if this is a connection error that warrants reconnection
			if (this.isConnectionError(error)) {
				console.log(`Health check failed for ${this.serverId}. Scheduling reconnect...`)
				this.connectionState.status = 'failed'
				this.connectionState.lastError = error.message
				this.scheduleReconnect()
			}
			
			return false
		}
	}
}