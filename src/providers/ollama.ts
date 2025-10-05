import { Ollama } from 'ollama/browser'
import type { BaseOptions, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'

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
				console.warn('Failed to use tool-aware path for Ollama, falling back to original:', error)
				// Fall through to original path
			}
		}

		// Original streaming path (backward compatible)
		let requestParams: Record<string, unknown> = { model, ...remains }

		console.debug(`[Ollama Provider] Connecting to Ollama at ${baseURL}`)
		console.debug(`[Ollama Provider] Using model: ${model}`)
		console.debug(`[Ollama Provider] Request params:`, { ...requestParams, messages: `${messages.length} messages` })

		if (mcpManager && mcpExecutor) {
			try {
				const { injectMCPTools } = await import('../mcp/providerToolIntegration.js')
				// biome-ignore lint/suspicious/noExplicitAny: MCP types are optional dependencies
				requestParams = await injectMCPTools(requestParams, 'Ollama', mcpManager as any, mcpExecutor as any)
				console.debug(`[Ollama Provider] MCP tools injected successfully`)
			} catch (error) {
				console.warn('[Ollama Provider] Failed to inject MCP tools for Ollama:', error)
			}
		}

		const ollama = new Ollama({ host: baseURL })

		try {
			console.debug(`[Ollama Provider] Initiating chat request...`)
			const response = (await ollama.chat({ ...requestParams, messages, stream: true } as Parameters<
				typeof ollama.chat
			>[0])) as unknown as AsyncIterable<{ message: { content: string } }>

			let responseChunkCount = 0
			try {
				for await (const part of response) {
					responseChunkCount++
					if (controller.signal.aborted) {
						console.debug(`[Ollama Provider] Request aborted after ${responseChunkCount} chunks`)
						ollama.abort()
						break
					}

					const content = part.message?.content || ''
					console.debug(`[Ollama Provider] Chunk ${responseChunkCount}:`, {
						contentLength: content.length,
						contentPreview: content.substring(0, 100)
					})

					if (content) {
						yield content
					} else {
						console.warn(`[Ollama Provider] Empty content in chunk ${responseChunkCount}`)
					}
				}
			} catch (streamError) {
				console.error(`[Ollama Provider] Error during streaming:`, streamError)
				throw streamError
			}

			console.debug(`[Ollama Provider] Streaming completed after ${responseChunkCount} chunks`)
		} catch (connectionError) {
			console.error(`[Ollama Provider] Failed to connect to Ollama:`, connectionError)
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
