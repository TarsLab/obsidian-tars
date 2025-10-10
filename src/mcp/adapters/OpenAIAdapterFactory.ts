import { createLogger } from '../../logger'
import type { ToolExecutor } from '../executor'
import type { MCPServerManager } from '../managerMCPUse'
import type { Message, ProviderAdapter, ToolExecutionResult } from '../toolCallingCoordinator'
import { OpenAIToolResponseParser } from '../toolResponseParser'
import type { ToolServerInfo } from '../types'
import type { OpenAIAdapterConfig } from './OpenAIProviderAdapter'

const logger = createLogger('mcp:openai-adapter-factory')

export interface OpenAIAdapterConfigSimple {
	mcpManager: MCPServerManager
	mcpExecutor: ToolExecutor
}

export function createOpenAIAdapter(
	config: OpenAIAdapterConfig
): Pick<ProviderAdapter, 'getParser' | 'findServer' | 'formatToolResult'> {
	const { mcpManager } = config

	return {
		getParser: () => new OpenAIToolResponseParser(),

		findServer: (_toolName: string): ToolServerInfo | null => {
			const servers = mcpManager.listServers()

			for (const server of servers) {
				if (!server.enabled) continue

				const client = mcpManager.getClient(server.id)
				if (!client) continue

				try {
					return {
						id: server.id,
						name: server.name
					}
				} catch (error) {
					logger.debug('failed to inspect tools for server', { serverId: server.id, error })
				}
			}

			return null
		},

		formatToolResult: (toolCallId: string, result: ToolExecutionResult): Message => {
			return {
				role: 'tool',
				tool_call_id: toolCallId,
				content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
			}
		}
	}
}

export async function createOpenAIAdapterWithMapping(
	config: OpenAIAdapterConfig
): Promise<Pick<ProviderAdapter, 'getParser' | 'findServer' | 'formatToolResult'>> {
	const { mcpManager } = config
	const toolMapping = await mcpManager.getToolDiscoveryCache().getToolMapping()

	return {
		getParser: () => new OpenAIToolResponseParser(),

		findServer: (toolName: string): ToolServerInfo | null => {
			return toolMapping.get(toolName) || null
		},

		formatToolResult: (toolCallId: string, result: ToolExecutionResult): Message => {
			return {
				role: 'tool',
				tool_call_id: toolCallId,
				content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
			}
		}
	}
}
