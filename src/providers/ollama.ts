import { Ollama } from 'ollama/browser'
import { createLogger } from '../logger'
import type { BaseOptions, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'

const logger = createLogger('providers:ollama')

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, _resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const {
			parameters,
			mcpManager,
			mcpExecutor,
			documentPath,
			statusBarManager,
			editor,
			...optionsExcludingParams
		} = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { baseURL, model, ...remains } = options

		// Tool-aware path: Use coordinator for autonomous tool calling
		if (mcpManager && mcpExecutor) {
			try {
				const { ToolCallingCoordinator, OllamaProviderAdapter } = await import('../mcp/index.js')
				// biome-ignore lint/suspicious/noExplicitAny: MCP types are optional dependencies
				const mcpMgr = mcpManager as any
				// biome-ignore lint/suspicious/noExplicitAny: MCP types are optional dependencies
				const mcpExec = mcpExecutor as any

				const ollama = new Ollama({ host: baseURL })

				const adapter = new OllamaProviderAdapter({
					mcpManager: mcpMgr,
					mcpExecutor: mcpExec,
					ollamaClient: ollama,
					controller,
					model
				})

				await adapter.initialize({ preloadTools: false })

				const coordinator = new ToolCallingCoordinator()

				// Convert messages to coordinator format
				const formattedMessages = messages.map((msg) => ({
					role: msg.role,
					content: msg.content,
					embeds: msg.embeds
				}))

				yield* coordinator.generateWithTools(formattedMessages, adapter, mcpExec, {
					documentPath: documentPath || 'unknown.md',
					statusBarManager: statusBarManager as any,
					editor: editor as any
				})

				return
			} catch (error) {
				logger.warn('tool-aware path unavailable, falling back to streaming pipeline', error)
				// Fall through to original path
			}
		}

		// Original streaming path (backward compatible)
		let requestParams: Record<string, unknown> = { model, ...remains }

		logger.info('starting ollama chat', { baseURL, model, messageCount: messages.length })
		logger.debug('initial request params', { ...requestParams, messages: `${messages.length} messages` })

		if (mcpManager && mcpExecutor) {
			try {
				const { injectMCPTools } = await import('../mcp/providerToolIntegration.js')
				// biome-ignore lint/suspicious/noExplicitAny: MCP types are optional dependencies
				requestParams = await injectMCPTools(requestParams, 'Ollama', mcpManager as any, mcpExecutor as any)
				logger.debug('mcp tools injected successfully')
			} catch (error) {
				logger.warn('failed to inject MCP tools for ollama', error)
			}
		}

		const ollama = new Ollama({ host: baseURL })

		try {
			logger.debug('initiating streaming chat request')
			const response = (await ollama.chat({ ...requestParams, messages, stream: true } as Parameters<
				typeof ollama.chat
			>[0])) as unknown as AsyncIterable<{ message: { content: string } }>

			let responseChunkCount = 0
			try {
				for await (const part of response) {
					responseChunkCount++
					if (controller.signal.aborted) {
						logger.info('request aborted', { chunkCount: responseChunkCount })
						ollama.abort()
						break
					}

					const content = part.message?.content || ''
					logger.debug('received chunk', {
						chunk: responseChunkCount,
						contentLength: content.length,
						preview: content.substring(0, 100)
					})

					if (content) {
						yield content
					} else {
						logger.warn('empty content received from stream', { chunk: responseChunkCount })
					}
				}
			} catch (streamError) {
				logger.error('error during ollama stream', streamError)
				throw streamError
			}

			logger.info('stream completed', { chunkCount: responseChunkCount })
		} catch (connectionError) {
			logger.error('failed to connect to ollama', connectionError)
			throw new Error(
				`Ollama connection failed: ${connectionError instanceof Error ? connectionError.message : String(connectionError)}`
			)
		}
	}

export const ollamaVendor: Vendor = {
	name: 'Ollama',
	defaultOptions: {
		apiKey: '',
		baseURL: 'http://127.0.0.1:11434',
		model: 'llama3.1',
		parameters: {}
	},
	sendRequestFunc,
	models: [],
	websiteToObtainKey: 'https://ollama.com',
	capabilities: ['Text Generation', 'Tool Calling']
}
