import type { Ollama } from 'ollama/browser'

import { createLogger } from '../../logger'
import type { ToolExecutor } from '../executor'
import type { MCPServerManager } from '../managerMCPUse'
import type { Message, ProviderAdapter } from '../toolCallingCoordinator'
import type { ToolDiscoveryCache } from '../toolDiscoveryCache'
import { OllamaToolResponseParser } from '../toolResponseParser'
import type { ToolExecutionResult, ToolServerInfo } from '../types'

const logger = createLogger('mcp:ollama-adapter')
const streamLogger = createLogger('mcp:ollama-adapter:stream')

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
	private readonly toolDiscoveryCache: ToolDiscoveryCache
	private toolMapping: Map<string, ToolServerInfo> | null = null
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
		this.toolDiscoveryCache = this.mcpManager.getToolDiscoveryCache()

		this.mcpManager.on('server-started', () => this.invalidateCache())
		this.mcpManager.on('server-stopped', () => this.invalidateCache())
		this.mcpManager.on('server-failed', () => this.invalidateCache())
	}

	async initialize(options?: { preloadTools?: boolean }): Promise<void> {
		logger.debug('initializing adapter')

		try {
			if (options?.preloadTools === false) {
				logger.debug('lazy initialization enabled; deferring tool preload')
				this.toolMapping = this.toolDiscoveryCache.getCachedMapping()
				this.cachedTools = null
				return
			}

			const tools = await this.buildTools()
			logger.debug('tools preloaded', { count: tools.length })
			logger.debug('initialization complete')
		} catch (error) {
			logger.error('adapter initialization failed', error)
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

	findServer(toolName: string): ToolServerInfo | null {
		if (!this.toolMapping) {
			const cached = this.toolDiscoveryCache.getCachedMapping()
			if (cached) {
				this.toolMapping = cached
			} else {
				throw new Error('OllamaProviderAdapter tool mapping not initialized - call initialize() first')
			}
		}
		return this.toolMapping.get(toolName) ?? null
	}

	async *sendRequest(messages: Message[]): AsyncGenerator<OllamaChunk> {
		logger.debug('starting sendRequest', { messageCount: messages.length })

		const tools = await this.buildTools()
		const formattedMessages = await this.formatMessages(messages)

		logger.debug('messages formatted for ollama', { count: formattedMessages.length })
		logger.debug('available tools for ollama request', { count: tools.length })

		const requestParams = {
			model: this.model,
			messages: formattedMessages,
			stream: true,
			tools: tools.length > 0 ? tools : undefined
		}

		logger.debug('ollama request params prepared', {
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
					streamLogger.debug('received chunk', {
						chunk: chunkCount,
						hasMessage: Boolean(chunk.message),
						done: chunk.done
					})
					if (this.controller.signal.aborted) {
						streamLogger.info('request aborted', { chunkCount })
						this.client.abort()
						break
					}

					streamLogger.debug('chunk summary', {
						hasMessage: Boolean(chunk.message),
						contentLength: chunk.message?.content?.length || 0,
						hasToolCalls: Boolean(chunk.message?.tool_calls?.length),
						toolCallCount: chunk.message?.tool_calls?.length || 0,
						done: chunk.done
					})

					if (!chunk.message?.content && !chunk.message?.tool_calls?.length) {
						streamLogger.debug('chunk without content or tool calls', { chunk: chunkCount, done: chunk.done })
					}

					yield chunk
				}
			} catch (streamError) {
				streamLogger.error('error during streaming', streamError)
				throw streamError
			}

			streamLogger.info('streaming completed', { chunkCount })
		} catch (connectionError) {
			logger.error('failed to connect to ollama', connectionError)
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
			logger.debug('using cached tools', { count: this.cachedTools.length })
			return this.cachedTools
		}

		logger.debug('building tools from discovery cache')
		const snapshot = await this.toolDiscoveryCache.getSnapshot()
		this.toolMapping = snapshot.mapping

		const tools = snapshot.servers.flatMap((server) =>
			server.tools.map((tool) => ({
				type: 'function' as const,
				function: {
					name: tool.name,
					description: tool.description,
					parameters: tool.inputSchema as unknown
				}
			}))
		)

		logger.debug('discovery cache tools built', {
			toolCount: tools.length,
			serverCount: snapshot.servers.length
		})
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
					content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
				}
			}

			return {
				role: msg.role,
				content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
			}
		})
	}
}
