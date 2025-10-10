import type { EmbedCache } from 'obsidian'
import type OpenAI from 'openai'

import type { ToolExecutor } from '../executor'
import type { MCPServerManager } from '../managerMCPUse'
import type { Message, ProviderAdapter } from '../toolCallingCoordinator'
import type { ToolDiscoveryCache } from '../toolDiscoveryCache'
import { OpenAIToolResponseParser } from '../toolResponseParser'
import type { ToolExecutionResult, ToolServerInfo } from '../types'

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
	private readonly toolDiscoveryCache: ToolDiscoveryCache
	private toolMapping: Map<string, ToolServerInfo> | null = null
	private cachedTools: OpenAI.ChatCompletionTool[] | null = null
	private readonly resolveEmbedAsBinary?: (embed: EmbedCache) => Promise<ArrayBuffer>

	constructor(config: OpenAIAdapterConfig) {
		this.mcpManager = config.mcpManager
		this.mcpExecutor = config.mcpExecutor
		this.client = config.openaiClient
		this.controller = config.controller
		this.toolDiscoveryCache = this.mcpManager.getToolDiscoveryCache()
		this.resolveEmbedAsBinary = config.resolveEmbedAsBinary

		this.mcpManager.on('server-started', () => this.invalidateCache())
		this.mcpManager.on('server-stopped', () => this.invalidateCache())
		this.mcpManager.on('server-failed', () => this.invalidateCache())
	}

	async initialize(options?: { preloadTools?: boolean }): Promise<void> {
		if (options?.preloadTools === false) {
			this.toolMapping = this.toolDiscoveryCache.getCachedMapping()
			this.cachedTools = null
			return
		}

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
		if (!this.toolMapping) {
			const cached = this.toolDiscoveryCache.getCachedMapping()
			if (cached) {
				this.toolMapping = cached
			}
		}

		if (this.toolMapping) {
			const serverInfo = this.toolMapping.get(toolName)
			if (serverInfo) {
				return serverInfo
			}
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

		const snapshot = await this.toolDiscoveryCache.getSnapshot()
		this.toolMapping = snapshot.mapping

		const tools: OpenAI.ChatCompletionTool[] = snapshot.servers.flatMap((server) =>
			server.tools.map((tool) => ({
				type: 'function',
				function: {
					name: tool.name,
					description: tool.description || '',
					parameters: tool.inputSchema as Record<string, unknown>
				}
			}))
		)

		this.cachedTools = tools
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
