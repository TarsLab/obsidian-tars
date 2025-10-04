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
	private cachedTools: Array<{
		type: 'function'
		function: { name: string; description?: string; parameters?: unknown }
	}> | null = null
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
		console.debug(`[Ollama MCP Adapter] Initializing adapter...`)

		try {
			console.debug(`[Ollama MCP Adapter] Building tool server mapping...`)
			this.toolMapping = await buildToolServerMapping(this.mcpManager)
			console.debug(`[Ollama MCP Adapter] Tool mapping built:`, Array.from(this.toolMapping.entries()))

			console.debug(`[Ollama MCP Adapter] Building tools...`)
			this.cachedTools = await this.buildTools()
			console.debug(`[Ollama MCP Adapter] Tools built: ${this.cachedTools?.length || 0} tools`)

			console.debug(`[Ollama MCP Adapter] Initialization complete`)
		} catch (error) {
			console.error(`[Ollama MCP Adapter] Initialization failed:`, error)
			throw error
		}
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
		console.debug(`[Ollama MCP Adapter] Starting sendRequest with ${messages.length} messages`)

		const tools = await this.buildTools()
		const formattedMessages = await this.formatMessages(messages)

		console.debug(`[Ollama MCP Adapter] Formatted ${messages.length} messages`)
		console.debug(`[Ollama MCP Adapter] Available tools: ${tools.length}`)

		const requestParams = {
			model: this.model,
			messages: formattedMessages,
			stream: true,
			tools: tools.length > 0 ? tools : undefined
		}

		console.debug(`[Ollama MCP Adapter] Request params:`, {
			model: this.model,
			messageCount: formattedMessages.length,
			toolCount: tools.length,
			stream: true
		})

		try {
			// biome-ignore lint/suspicious/noExplicitAny: Chat API expects loosely typed params
			const response = (await this.client.chat(requestParams as any)) as unknown as AsyncIterable<OllamaChunk>

			let chunkCount = 0
			try {
				for await (const chunk of response) {
					chunkCount++
					console.debug(`[Ollama MCP Adapter] Raw chunk ${chunkCount}:`, chunk)
					if (this.controller.signal.aborted) {
						console.debug(`[Ollama MCP Adapter] Request aborted after ${chunkCount} chunks`)
						this.client.abort()
						break
					}

					console.debug(`[Ollama MCP Adapter] Chunk ${chunkCount}:`, {
						hasMessage: !!chunk.message,
						contentLength: chunk.message?.content?.length || 0,
						hasToolCalls: !!chunk.message?.tool_calls?.length,
						toolCallCount: chunk.message?.tool_calls?.length || 0,
						done: chunk.done
					})

					if (!chunk.message?.content && !chunk.message?.tool_calls?.length) {
						console.debug(`[Ollama MCP Adapter] Chunk ${chunkCount} has no content or tool calls`, {
							done: chunk.done
						})
					}

					yield chunk
				}
			} catch (streamError) {
				console.error(`[Ollama MCP Adapter] Error during streaming:`, streamError)
				throw streamError
			}

			console.debug(`[Ollama MCP Adapter] Streaming completed after ${chunkCount} chunks`)
		} catch (connectionError) {
			console.error(`[Ollama MCP Adapter] Failed to connect to Ollama:`, connectionError)
			throw new Error(
				`Ollama connection failed: ${connectionError instanceof Error ? connectionError.message : String(connectionError)}`
			)
		}
	}

	formatToolResult(_toolCallId: string, result: ToolExecutionResult): Message {
		return {
			role: 'tool',
			tool_call_id: _toolCallId,
			content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
		}
	}

	private async buildTools(): Promise<
		Array<{ type: 'function'; function: { name: string; description?: string; parameters?: unknown } }>
	> {
		if (this.cachedTools) {
			console.debug(`[Ollama MCP Adapter] Using cached tools: ${this.cachedTools.length} tools`)
			return this.cachedTools
		}

		console.debug(`[Ollama MCP Adapter] Building tools from MCP servers...`)
		const tools: Array<{ type: 'function'; function: { name: string; description?: string; parameters?: unknown } }> =
			[]
		const servers = this.mcpManager.listServers()

		console.debug(
			`[Ollama MCP Adapter] Found ${servers.length} MCP servers:`,
			servers.map((s) => ({ id: s.id, enabled: s.enabled }))
		)

		for (const server of servers) {
			if (!server.enabled) {
				console.debug(`[Ollama MCP Adapter] Skipping disabled server: ${server.id}`)
				continue
			}

			console.debug(`[Ollama MCP Adapter] Processing server: ${server.id}`)
			const client = this.mcpManager.getClient(server.id)
			if (!client) {
				console.warn(`[Ollama MCP Adapter] No client found for server: ${server.id}`)
				continue
			}

			try {
				console.debug(`[Ollama MCP Adapter] Listing tools for server: ${server.id}`)
				const serverTools = await client.listTools()
				console.debug(
					`[Ollama MCP Adapter] Server ${server.id} has ${serverTools.length} tools:`,
					serverTools.map((t) => t.name)
				)

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
				console.debug(`[Ollama MCP Adapter] Added ${serverTools.length} tools from server ${server.id}`)
			} catch (error) {
				console.error(`[Ollama MCP Adapter] Failed to list tools from server ${server.id}:`, error)
			}
		}

		console.debug(`[Ollama MCP Adapter] Total tools built: ${tools.length}`)
		this.cachedTools = tools
		return tools
	}

	private async formatMessages(messages: Message[]): Promise<Array<Record<string, unknown>>> {
		return messages.map((msg) => {
			if (msg.tool_calls && msg.tool_calls.length > 0) {
				return {
					role: 'assistant',
					content: msg.content ?? '',
					tool_calls: msg.tool_calls.map((toolCall) => ({
						id: toolCall.id,
						type: 'function',
						function: {
							name: toolCall.name,
							arguments: toolCall.arguments
						}
					}))
				}
			}

			if (msg.role === 'tool') {
				return {
					role: 'tool',
					tool_call_id: msg.tool_call_id,
					content:
						typeof msg.content === 'string'
							? msg.content
							: JSON.stringify(msg.content)
				}
			}

			return {
				role: msg.role,
				content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
			}
		})
	}
}
