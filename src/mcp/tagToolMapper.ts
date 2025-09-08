import { MCPTool, TagToolMapping, ToolResult } from './types'
import { MCPManager } from './mcpManager'

export class TagToolMapper {
	private mappings: TagToolMapping[] = []
	private mcpManager: MCPManager

	constructor(mcpManager: MCPManager) {
		this.mcpManager = mcpManager
		this.initializeDefaultMappings()
	}

	private initializeDefaultMappings(): void {
		// Default tag-to-tool mappings based on common patterns
		this.mappings = [
			{
				tagPattern: 'project/*',
				toolNames: ['jira-get-tickets', 'project-status', 'get-sprint-info'],
				serverIds: ['jira-connector'],
				parameters: { includeDetails: true }
			},
			{
				tagPattern: 'web/*',
				toolNames: ['web-scraper', 'fetch-url'],
				serverIds: ['web-scraper'],
				parameters: { maxLength: 5000 }
			},
			{
				tagPattern: 'research/*',
				toolNames: ['web-search', 'web-scraper'],
				serverIds: ['web-scraper'],
				parameters: { searchDepth: 'basic' }
			},
			{
				tagPattern: 'meeting/*',
				toolNames: ['calendar-events', 'get-attendees'],
				serverIds: ['calendar-connector'],
				parameters: { timeRange: '7d' }
			}
		]
	}

	addMapping(mapping: TagToolMapping): void {
		this.mappings.push(mapping)
	}

	/**
	 * Verify and attempt to recover connections for all servers that have tools for the given tags
	 */
	async verifyConnectionsForTags(tags: string[]): Promise<{ verified: number; failed: string[] }> {
		const tools = await this.getToolsForTags(tags)
		const serverIds = new Set(tools.map(tool => tool.serverId))
		
		let verified = 0
		const failed: string[] = []
		
		for (const serverId of serverIds) {
			const client = this.mcpManager['clients'].get(serverId)
			
			if (!client) {
				failed.push(serverId)
				continue
			}
			
			try {
				// Perform health check
				const isHealthy = await client.healthCheck()
				
				if (!isHealthy && !client.isConnected) {
					// Attempt reconnection
					console.log(`Attempting to reconnect to MCP server ${serverId} before prompt generation...`)
					await client.reconnect()
				}
				
				if (client.isConnected) {
					verified++
				} else {
					failed.push(serverId)
				}
			} catch (error) {
				console.warn(`Failed to verify/reconnect to MCP server ${serverId}:`, error.message)
				failed.push(serverId)
			}
		}
		
		return { verified, failed }
	}

	removeMapping(tagPattern: string): void {
		this.mappings = this.mappings.filter(m => m.tagPattern !== tagPattern)
	}

	getMappings(): TagToolMapping[] {
		return [...this.mappings]
	}

	async getToolsForTags(tags: string[]): Promise<MCPTool[]> {
		const matchedTools: MCPTool[] = []
		const availableTools = this.mcpManager.getAvailableTools()
		
		for (const tag of tags) {
			const matchingMappings = this.findMatchingMappings(tag)
			
			for (const mapping of matchingMappings) {
				for (const toolName of mapping.toolNames) {
					const tool = availableTools.find(t => 
						t.name === toolName && 
						mapping.serverIds.includes(t.serverId)
					)
					
					if (tool && !matchedTools.some(mt => mt.name === tool.name && mt.serverId === tool.serverId)) {
						matchedTools.push(tool)
					}
				}
			}
		}
		
		return matchedTools
	}

	async invokeToolsForTags(tags: string[]): Promise<ToolResult[]> {
		const results: ToolResult[] = []
		
		if (tags.length === 0) {
			return results
		}
		
		console.debug(`Invoking MCP tools for tags: ${tags.join(', ')}`)
		
		const tools = await this.getToolsForTags(tags)
		
		if (tools.length === 0) {
			console.debug(`No MCP tools found for tags: ${tags.join(', ')}`)
			return results
		}
		
		console.debug(`Found ${tools.length} tools for tags: ${tools.map(t => t.name).join(', ')}`)
		
		for (const tool of tools) {
			const mapping = this.findMappingForTool(tool.name, tags)
			const parameters = this.buildToolParameters(tool, tags, mapping)
			
			try {
				const startTime = Date.now()
				const client = this.mcpManager['clients'].get(tool.serverId)
				
				if (!client) {
					console.warn(`MCP client not found for server: ${tool.serverId}`)
					results.push({
						toolName: tool.name,
						serverId: tool.serverId,
						result: null,
						executionTime: 0,
						error: `MCP server "${tool.serverId}" is not connected`
					})
					continue
				}
				
				// Verify connection and attempt recovery if needed
				if (!client.isConnected) {
					console.log(`MCP client for server ${tool.serverId} is not connected. Attempting to reconnect...`)
					
					try {
						await client.reconnect()
						console.log(`Successfully reconnected to MCP server ${tool.serverId}`)
					} catch (reconnectError) {
						console.warn(`Failed to reconnect to MCP server ${tool.serverId}: ${reconnectError.message}`)
						results.push({
							toolName: tool.name,
							serverId: tool.serverId,
							result: null,
							executionTime: 0,
							error: `MCP server "${tool.serverId}" is not connected and reconnection failed: ${reconnectError.message}`
						})
						continue
					}
				}
				
				console.debug(`Invoking tool "${tool.name}" with parameters:`, parameters)
				
				const result = await client.invokeTool(tool.name, parameters)
				const executionTime = Date.now() - startTime
				
				console.debug(`Tool "${tool.name}" completed in ${executionTime}ms`)
				
				results.push({
					toolName: tool.name,
					serverId: tool.serverId,
					result: result.result,
					executionTime
				})
			} catch (error) {
				const executionTime = Date.now() - (Date.now() - 1000) // Approximate
				console.error(`Failed to invoke tool ${tool.name} for tags ${tags.join(', ')}:`, error)
				
				let errorMessage = error.message || 'Unknown error'
				if (error.message?.includes('timeout')) {
					errorMessage = `Tool execution timed out`
				} else if (error.message?.includes('not found')) {
					errorMessage = `Tool "${tool.name}" not found on server "${tool.serverId}"`
				} else if (error.message?.includes('parameter')) {
					errorMessage = `Invalid parameters for tool "${tool.name}": ${error.message}`
				}
				
				results.push({
					toolName: tool.name,
					serverId: tool.serverId,
					result: null,
					error: errorMessage,
					executionTime
				})
			}
		}
		
		const successCount = results.filter(r => !r.error).length
		const errorCount = results.length - successCount
		
		console.debug(`MCP tool invocation completed: ${successCount} successful, ${errorCount} failed`)
		
		return results
	}

	private findMatchingMappings(tag: string): TagToolMapping[] {
		return this.mappings.filter(mapping => this.matchesPattern(tag, mapping.tagPattern))
	}

	private matchesPattern(tag: string, pattern: string): boolean {
		// Convert glob-like pattern to regex
		const regexPattern = pattern
			.replace(/\*/g, '.*')
			.replace(/\?/g, '.')
		
		const regex = new RegExp(`^${regexPattern}$`, 'i')
		return regex.test(tag)
	}

	private findMappingForTool(toolName: string, tags: string[]): TagToolMapping | undefined {
		for (const tag of tags) {
			const mapping = this.mappings.find(m => 
				m.toolNames.includes(toolName) && 
				this.matchesPattern(tag, m.tagPattern)
			)
			if (mapping) return mapping
		}
		return undefined
	}

	private buildToolParameters(tool: MCPTool, tags: string[], mapping?: TagToolMapping): Record<string, unknown> {
		const parameters: Record<string, unknown> = {}
		
		// Start with mapping parameters if available
		if (mapping?.parameters) {
			Object.assign(parameters, mapping.parameters)
		}
		
		// Add tag-specific parameters
		parameters.tags = tags
		parameters.context = tags.join(' ')
		
		// Extract specific parameters from tags
		for (const tag of tags) {
			if (tag.includes('/')) {
				const [category, value] = tag.split('/', 2)
				parameters[category] = value
			}
		}
		
		// Tool-specific parameter handling
		if (tool.name.includes('jira')) {
			parameters.project = this.extractProjectFromTags(tags)
		}
		
		if (tool.name.includes('web') || tool.name.includes('search')) {
			parameters.query = tags.join(' ')
		}
		
		return parameters
	}

	private extractProjectFromTags(tags: string[]): string | undefined {
		for (const tag of tags) {
			if (tag.startsWith('project/')) {
				return tag.substring(8) // Remove 'project/' prefix
			}
		}
		return undefined
	}

	// Smart parameter inference based on tag context
	inferParametersFromContext(tags: string[], toolName: string): Record<string, unknown> {
		const parameters: Record<string, unknown> = {}
		
		// Time-based inference
		const timeKeywords = ['today', 'yesterday', 'week', 'month', 'sprint']
		for (const keyword of timeKeywords) {
			if (tags.some(tag => tag.toLowerCase().includes(keyword))) {
				parameters.timeRange = keyword
				break
			}
		}
		
		// Priority inference
		const priorityKeywords = ['urgent', 'high', 'critical', 'blocker']
		for (const keyword of priorityKeywords) {
			if (tags.some(tag => tag.toLowerCase().includes(keyword))) {
				parameters.priority = keyword
				break
			}
		}
		
		// Status inference
		const statusKeywords = ['open', 'closed', 'in-progress', 'done', 'todo']
		for (const keyword of statusKeywords) {
			if (tags.some(tag => tag.toLowerCase().includes(keyword))) {
				parameters.status = keyword
				break
			}
		}
		
		return parameters
	}
}