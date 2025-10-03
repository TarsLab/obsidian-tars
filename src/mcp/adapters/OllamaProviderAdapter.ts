import type { Ollama } from 'ollama/browser'

import type { ToolExecutor } from '../executor'
import type { MCPServerManager } from '../managerMCPUse'
import type { Message, ProviderAdapter, ToolExecutionResult } from '../toolCallingCoordinator'
import { OllamaToolResponseParser } from '../toolResponseParser'
import { buildToolServerMapping } from './toolMapping'

interface OllamaChunk {
	message?: {
		content?: string
		tool_calls?: Array<{
			function: {
				name: string
				arguments: Record<string, unknown>
			}
		}>
	}
	done?: boolean
}

export interface OllamaAdapterConfig {
	mcpManager: MCPServerManager
	mcpExecutor: ToolExecutor
	ollamaClient: Ollama
	controller: AbortController
	model: string
}

export class OllamaProviderAdapter implements ProviderAdapter<OllamaChunk> {
	private readonly mcpManager: MCPServerManager
	private readonly mcpExecutor: ToolExecutor
	private readonly client: Ollama
	private readonly controller: AbortController
	private readonly model: string
	private toolMapping: Map<string, string> | null = null
	private cachedTools: Array<{ type: 'function'; function: { name: string; description?: string; parameters?: unknown } }> | null = null
	private readonly parser = new OllamaToolResponseParser()

	constructor(config: OllamaAdapterConfig) {
		this.mcpManager = config.mcpManager
		this.mcpExecutor = config.mcpExecutor
		this.client = config.ollamaClient
		this.controller = config.controller
		this.model = config.model

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

	getParser(): OllamaToolResponseParser {
		return this.parser
	}

	findServerId(toolName: string): string | null {
		if (!this.toolMapping) {
			throw new Error('OllamaProviderAdapter not initialized - call initialize() first')
		}
		return this.toolMapping.get(toolName) ?? null
	}

	async *sendRequest(messages: Message[]): AsyncGenerator<OllamaChunk> {
		const tools = await this.buildTools()
		const formattedMessages = await this.formatMessages(messages)

		const requestParams = {
			model: this.model,
			messages: formattedMessages,
			stream: true,
			tools: tools.length > 0 ? tools : undefined
		}

		// biome-ignore lint/suspicious/noExplicitAny: Chat API expects loosely typed params
		const response = (await this.client.chat(requestParams as any)) as unknown as AsyncIterable<OllamaChunk>

		for await (const chunk of response) {
			if (this.controller.signal.aborted) {
				this.client.abort()
				break
			}
			yield chunk
		}
	}

	formatToolResult(_toolCallId: string, result: ToolExecutionResult): Message {
		return {
			role: 'assistant',
			content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
		}
	}

	private async buildTools(): Promise<Array<{ type: 'function'; function: { name: string; description?: string; parameters?: unknown } }>> {
		if (this.cachedTools) {
			return this.cachedTools
		}

		const tools: Array<{ type: 'function'; function: { name: string; description?: string; parameters?: unknown } }> = []
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
							description: tool.description,
							parameters: tool.inputSchema
						}
					})
				}
			} catch (error) {
				console.error(`Failed to list tools from Ollama server ${server.id}:`, error)
			}
		}

		this.cachedTools = tools
		return tools
	}

	private async formatMessages(messages: Message[]): Promise<Array<{ role: string; content: string }>> {
		return messages.map((msg) => ({
			role: msg.role === 'tool' ? 'assistant' : msg.role,
			content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
		}))
	}
}
