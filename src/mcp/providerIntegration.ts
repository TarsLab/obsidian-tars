/**
 * MCP Provider Integration
 * Helper functions to integrate MCP tools with AI providers
 */

import { createLogger } from '../logger'
import type { ToolExecutor } from './executor'
import type { MCPServerManager } from './managerMCPUse'
import type { AIToolContext } from './types'

const logger = createLogger('mcp:provider-integration')

/**
 * Build AI tool context from enabled MCP servers
 */
export async function buildAIToolContext(
	manager: MCPServerManager,
	executor: ToolExecutor,
	options: {
		enabledOnly?: boolean
		sectionBinding?: string
	} = {}
): Promise<AIToolContext> {
	const { enabledOnly = true, sectionBinding } = options

	// Get all servers
	const allServers = manager.listServers()

	// Filter servers based on options
	let servers = allServers
	if (enabledOnly) {
		servers = servers.filter((s) => s.enabled)
	}
	if (sectionBinding) {
		servers = servers.filter((s) => s.id === sectionBinding)
	}

	// Collect tools from all enabled servers
	const tools: AIToolContext['tools'] = []
	const snapshot = await manager.getToolDiscoveryCache().getSnapshot()
	const serversById = new Map(snapshot.servers.map((entry) => [entry.serverId, entry]))

	for (const server of servers) {
		const snapshotServer = serversById.get(server.id)
		if (!snapshotServer) continue

		for (const tool of snapshotServer.tools) {
			tools.push({
				serverId: server.id,
				serverName: server.name,
				toolName: tool.name,
				description: tool.description || '',
				inputSchema: tool.inputSchema
			})
		}
	}

	return {
		tools,
		executeTool: async (serverId: string, toolName: string, params: Record<string, unknown>) => {
			return await executor.executeTool({
				serverId,
				toolName,
				parameters: params,
				source: 'ai-autonomous',
				documentPath: '' // Will be set by provider
			})
		},
		enabledServers: servers.map((s) => s.id),
		sectionBinding
	}
}

/**
 * Format MCP tools for AI system message
 */
export function formatToolsForSystemMessage(context: AIToolContext): string {
	if (context.tools.length === 0) {
		return ''
	}

	const toolDescriptions = context.tools
		.map((tool) => {
			const schemaStr = JSON.stringify(tool.inputSchema, null, 2)
			return `### ${tool.toolName} (${tool.serverName})
Description: ${tool.description}
Parameters: ${schemaStr}`
		})
		.join('\n\n')

	return `

## Available MCP Tools

You have access to the following external tools via Model Context Protocol (MCP). You can use these tools to extend your capabilities:

${toolDescriptions}

To use a tool, indicate in your response that you need to call a tool with the format:
TOOL_CALL: {serverId: "server-id", toolName: "tool_name", parameters: {...}}

After the tool executes, you will receive the result and can continue your response.`
}

/**
 * Parse tool call requests from AI response
 */
export function parseToolCallFromResponse(response: string): {
	serverId: string
	toolName: string
	parameters: Record<string, unknown>
} | null {
	// Look for TOOL_CALL: pattern
	const toolCallMatch = response.match(/TOOL_CALL:\s*({[^}]+})/)
	if (!toolCallMatch) return null

	try {
		const toolCall = JSON.parse(toolCallMatch[1])
		if (toolCall.serverId && toolCall.toolName && toolCall.parameters) {
			return {
				serverId: toolCall.serverId,
				toolName: toolCall.toolName,
				parameters: toolCall.parameters
			}
		}
	} catch (error) {
		logger.error('failed to parse tool call from response', error)
	}

	return null
}

/**
 * Format tool result for injection into conversation
 */
export function formatToolResultForAI(
	toolName: string,
	result: {
		content: unknown
		contentType: string
		executionDuration: number
	}
): string {
	let contentStr: string

	if (result.contentType === 'json') {
		contentStr = JSON.stringify(result.content, null, 2)
	} else {
		contentStr = String(result.content)
	}

	return `[Tool Result: ${toolName}]
Execution time: ${result.executionDuration}ms
Result:
${contentStr}
[End Tool Result]`
}
