import { Ollama } from 'ollama/browser'
import type { BaseOptions, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, _resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const { parameters, mcpManager, mcpExecutor, documentPath, statusBarManager, ...optionsExcludingParams } = settings
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

				await adapter.initialize()

				const coordinator = new ToolCallingCoordinator()

				// Convert messages to coordinator format
				const formattedMessages = messages.map((msg) => ({
					role: msg.role,
					content: msg.content,
					embeds: msg.embeds
				}))

				yield* coordinator.generateWithTools(formattedMessages, adapter, mcpExec, {
					documentPath: documentPath || 'unknown.md',
					statusBarManager: statusBarManager as any
				})

				return
			} catch (error) {
				console.warn('Failed to use tool-aware path for Ollama, falling back to original:', error)
				// Fall through to original path
			}
		}

		// Original streaming path (backward compatible)
		let requestParams: Record<string, unknown> = { model, ...remains }
		if (mcpManager && mcpExecutor) {
			try {
				const { injectMCPTools } = await import('../mcp/providerToolIntegration.js')
				// biome-ignore lint/suspicious/noExplicitAny: MCP types are optional dependencies
				requestParams = await injectMCPTools(requestParams, 'Ollama', mcpManager as any, mcpExecutor as any)
			} catch (error) {
				console.warn('Failed to inject MCP tools for Ollama:', error)
			}
		}

		const ollama = new Ollama({ host: baseURL })
		const response = (await ollama.chat({ ...requestParams, messages, stream: true } as Parameters<
			typeof ollama.chat
		>[0])) as unknown as AsyncIterable<{ message: { content: string } }>
		for await (const part of response) {
			if (controller.signal.aborted) {
				ollama.abort()
				break
			}
			yield part.message.content
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
