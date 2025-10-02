import { Ollama } from 'ollama/browser'
import type { BaseOptions, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, _resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const { parameters, mcpManager, mcpExecutor, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { baseURL, model, ...remains } = options

		// Inject MCP tools if available
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
		const response = (await ollama.chat({ ...requestParams, messages, stream: true } as Parameters<typeof ollama.chat>[0])) as unknown as AsyncIterable<{ message: { content: string } }>
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
	capabilities: ['Text Generation']
}
