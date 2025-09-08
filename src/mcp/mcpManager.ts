import { Notice } from 'obsidian'
import { RemoteMCPClient } from './mcpClient'
import { MCPClient, MCPServerConfig, MCPTool, ToolResult } from './types'

export class MCPManager {
	private clients: Map<string, MCPClient> = new Map()
	private healthCheckInterval: NodeJS.Timeout | null = null
	private readonly HEALTH_CHECK_INTERVAL = 30000 // 30 seconds

	constructor() {
		this.startHealthChecking()
	}

	async connectToServer(config: MCPServerConfig): Promise<MCPClient> {
		try {
			// Disconnect existing client if any
			if (this.clients.has(config.id)) {
				await this.disconnectFromServer(config.id)
			}

			const client = new RemoteMCPClient(config)
			await client.connect()
			
			this.clients.set(config.id, client)
			console.log(`Connected to MCP server: ${config.name} (${config.id})`)
			
			return client
		} catch (error) {
			console.error(`Failed to connect to MCP server ${config.name}:`, error)
			
			// Add specific error handling for common issues
			if (error.message?.includes('ECONNREFUSED')) {
				throw new Error(`Cannot connect to MCP server "${config.name}". Please ensure the server is running and accessible at ${config.transport.type}://${config.transport.host}:${config.transport.port}`)
			} else if (error.message?.includes('timeout')) {
				throw new Error(`Connection timeout to MCP server "${config.name}". The server may be overloaded or unreachable.`)
			} else if (error.message?.includes('authentication')) {
				throw new Error(`Authentication failed for MCP server "${config.name}". Please check your credentials.`)
			} else {
				throw new Error(`Failed to connect to MCP server "${config.name}": ${error.message || 'Unknown error'}`)
			}
		}
	}

	async disconnectFromServer(serverId: string): Promise<void> {
		const client = this.clients.get(serverId)
		if (client) {
			await client.disconnect()
			this.clients.delete(serverId)
			console.log(`Disconnected from MCP server: ${serverId}`)
		}
	}

	async disconnectAll(): Promise<void> {
		const disconnectPromises = Array.from(this.clients.keys()).map(serverId => 
			this.disconnectFromServer(serverId)
		)
		await Promise.all(disconnectPromises)
		
		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval)
			this.healthCheckInterval = null
		}
	}

	async discoverTools(): Promise<MCPTool[]> {
		const allTools: MCPTool[] = []
		
		for (const client of this.clients.values()) {
			if (client.isConnected) {
				try {
					const tools = await client.discoverTools()
					allTools.push(...tools)
				} catch (error) {
					console.warn(`Failed to discover tools from server ${client.serverId}:`, error)
				}
			}
		}
		
		return allTools
	}

	async invokeToolsForTags(tags: string[]): Promise<ToolResult[]> {
		const results: ToolResult[] = []
		
		// For now, implement basic tag-to-tool mapping
		// This will be enhanced with the TagToolMapper
		for (const tag of tags) {
			const toolResults = await this.invokeToolsForTag(tag)
			results.push(...toolResults)
		}
		
		return results
	}

	private async invokeToolsForTag(tag: string): Promise<ToolResult[]> {
		const results: ToolResult[] = []
		
		// Basic tag pattern matching - this will be enhanced
		if (tag.includes('project') || tag.includes('jira')) {
			results.push(...await this.invokeProjectTools(tag))
		}
		
		if (tag.includes('web') || tag.includes('search')) {
			results.push(...await this.invokeWebTools(tag))
		}
		
		return results
	}

	private async invokeProjectTools(tag: string): Promise<ToolResult[]> {
		const results: ToolResult[] = []
		
		for (const client of this.clients.values()) {
			if (!client.isConnected) continue
			
			const projectTools = client.tools.filter(tool => 
				tool.name.includes('jira') || 
				tool.name.includes('project') ||
				tool.name.includes('ticket')
			)
			
			for (const tool of projectTools) {
				try {
					const result = await client.invokeTool(tool.name, { query: tag })
					results.push(result)
				} catch (error) {
					console.warn(`Failed to invoke tool ${tool.name}:`, error)
				}
			}
		}
		
		return results
	}

	private async invokeWebTools(tag: string): Promise<ToolResult[]> {
		const results: ToolResult[] = []
		
		for (const client of this.clients.values()) {
			if (!client.isConnected) continue
			
			const webTools = client.tools.filter(tool => 
				tool.name.includes('web') || 
				tool.name.includes('scrape') ||
				tool.name.includes('search')
			)
			
			for (const tool of webTools) {
				try {
					const result = await client.invokeTool(tool.name, { query: tag })
					results.push(result)
				} catch (error) {
					console.warn(`Failed to invoke tool ${tool.name}:`, error)
				}
			}
		}
		
		return results
	}

	getConnectedServers(): string[] {
		return Array.from(this.clients.values())
			.filter(client => client.isConnected)
			.map(client => client.serverId)
	}

	getAvailableTools(): MCPTool[] {
		const allTools: MCPTool[] = []
		
		for (const client of this.clients.values()) {
			if (client.isConnected) {
				allTools.push(...client.tools)
			}
		}
		
		return allTools
	}

	private startHealthChecking(): void {
		this.healthCheckInterval = setInterval(async () => {
			for (const client of this.clients.values()) {
				if (client.isConnected) {
					const isHealthy = await client.healthCheck()
					if (!isHealthy) {
						console.warn(`MCP server ${client.serverId} failed health check`)
						new Notice(`MCP server ${client.serverId} is not responding`)
					}
				}
			}
		}, this.HEALTH_CHECK_INTERVAL)
	}
}