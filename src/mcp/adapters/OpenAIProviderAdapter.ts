import OpenAI from 'openai'
import type { EmbedCache } from 'obsidian'

import type { ToolExecutor } from '../executor'
import type { MCPServerManager } from '../managerMCPUse'
import type { Message, ProviderAdapter, ToolExecutionResult } from '../toolCallingCoordinator'
import type { ToolServerInfo } from '../types'
import { OpenAIToolResponseParser } from '../toolResponseParser'
import { buildToolServerMapping } from './toolMapping'

export interface OpenAIAdapterConfig {
	mcpManager: MCPServerManager
	mcpExecutor: ToolExecutor
	openaiClient: OpenAI
	controller: AbortController
	resolveEmbedAsBinary?: (embed: EmbedCache) => Promise<ArrayBuffer>
}

export class OpenAIProviderAdapter implements ProviderAdapter<OpenAI.ChatCompletionChunk> {
	private readonly mcpManager: MCPServerManager
	private readonly mcpExecutor: ToolExecutor
	private readonly client: OpenAI
	private readonly controller: AbortController
	private toolMapping: Map<string, ToolServerInfo> | null = null
	private cachedTools: OpenAI.ChatCompletionTool[] | null = null
	private readonly resolveEmbedAsBinary?: (embed: EmbedCache) => Promise<ArrayBuffer>

	constructor(config: OpenAIAdapterConfig) {
		this.mcpManager = config.mcpManager
		this.mcpExecutor = config.mcpExecutor
		this.client = config.openaiClient
		this.controller = config.controller
		this.resolveEmbedAsBinary = config.resolveEmbedAsBinary

		this.mcpManager.on('server-started', () => this.invalidateCache())
		this.mcpManager.on('server-stopped', () => this.invalidateCache())
		this.mcpManager.on('server-failed', () => this.invalidateCache())
	}

	async initialize(): Promise<void> {
		this.toolMapping = await buildToolServerMapping(this.mcpManager)
		this.cachedTools = await this.buildTools()
	}

	private invalidateCache(): void {
		this.cachedTools = null
		this.toolMapping = null
	}

	async *sendRequest(messages: Message[]): AsyncGenerator<OpenAI.ChatCompletionChunk> {
		const formattedMessages = await this.formatMessages(messages)
		const tools = await this.buildTools()

		const stream = await this.client.chat.completions.create(
			{
				messages: formattedMessages as OpenAI.ChatCompletionMessageParam[],
				tools: tools.length > 0 ? tools : undefined,
				stream: true
			} as OpenAI.ChatCompletionCreateParamsStreaming,
			{ signal: this.controller.signal }
		)

		for await (const chunk of stream) {
			yield chunk
		}
	}

	getParser(): OpenAIToolResponseParser {
		return new OpenAIToolResponseParser()
	}

	findServer(toolName: string): ToolServerInfo | null {
		if (this.toolMapping) {
			return this.toolMapping.get(toolName) ?? null
		}

		const servers = this.mcpManager.listServers()
		for (const server of servers) {
			if (server.enabled && this.mcpManager.getClient(server.id)) {
				return {
					id: server.id,
					name: server.name
				}
			}
		}
		return null
}

	formatToolResult(toolCallId: string, result: ToolExecutionResult): Message {
		return {
			role: 'tool',
			tool_call_id: toolCallId,
			content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
		}
	}

	private async buildTools(): Promise<OpenAI.ChatCompletionTool[]> {
		if (this.cachedTools) {
			return this.cachedTools
		}

		const tools: OpenAI.ChatCompletionTool[] = []
		const servers = this.mcpManager.listServers()

		for (const server of servers) {
			if (!server.enabled) continue

			const client = this.mcpManager.getClient(server.id)
			if (!client) continue

			try {
				const serverTools = await client.listTools()
				for (const tool of serverTools) {
					tools.push({
						type: 'function',
						function: {
							name: tool.name,
							description: tool.description || '',
							parameters: tool.inputSchema as Record<string, unknown>
						}
					})
				}
			} catch (error) {
				console.error(`Failed to list tools for ${server.name}:`, error)
			}
		}

		return tools
	}

	private async formatMessages(messages: Message[]): Promise<unknown[]> {
		const formatted: unknown[] = []

		for (const msg of messages) {
			if (msg.role === 'tool') {
				formatted.push({
					role: 'tool',
					tool_call_id: msg.tool_call_id,
					content: msg.content
				})
				continue
			}

			if (msg.tool_calls) {
				formatted.push({
					role: 'assistant',
					content: msg.content || '',
					tool_calls: msg.tool_calls.map((tc) => ({
						id: tc.id,
						type: 'function',
						function: {
							name: tc.name,
							arguments: JSON.stringify(tc.arguments)
						}
					}))
				})
				continue
			}

			const content: unknown[] = []

			if (msg.content.trim()) {
				content.push({
					type: 'text',
					text: msg.content
				})
			}

			formatted.push({
				role: msg.role,
				content: content.length > 0 ? content : msg.content
			})
		}

		return formatted
	}
}
