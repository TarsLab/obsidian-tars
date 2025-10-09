import OpenAI from 'openai'
import { createLogger } from '../logger'
import { t } from 'src/lang/helper'
import type { BaseOptions, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'
import { convertEmbedToImageUrl } from './utils'

const logger = createLogger('providers:openai')

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const { parameters, mcpManager, mcpExecutor, documentPath, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { apiKey, baseURL, model, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))
		logger.info('starting openai chat', { baseURL, model, messageCount: messages.length })

		// Tool-aware path: Use coordinator for autonomous tool calling
		if (mcpManager && mcpExecutor) {
			try {
				const { ToolCallingCoordinator, OpenAIProviderAdapter } = await import('../mcp/index.js')
				// biome-ignore lint/suspicious/noExplicitAny: MCP types are optional dependencies
				const mcpMgr = mcpManager as any
				// biome-ignore lint/suspicious/noExplicitAny: MCP types are optional dependencies
				const mcpExec = mcpExecutor as any

				const client = new OpenAI({
					apiKey,
					baseURL,
					dangerouslyAllowBrowser: true
				})

				const adapter = new OpenAIProviderAdapter({
					mcpManager: mcpMgr,
					mcpExecutor: mcpExec,
					openaiClient: client,
					controller,
					resolveEmbedAsBinary
				})

				await adapter.initialize({ preloadTools: false })

				const coordinator = new ToolCallingCoordinator()

				// Convert messages to coordinator format
				const formattedMessages = await Promise.all(messages.map((msg) => formatMsgForCoordinator(msg, resolveEmbedAsBinary)))

				yield* coordinator.generateWithTools(
					formattedMessages,
					adapter,
					mcpExec,
					{
						documentPath: documentPath || 'unknown.md',
						autoUseDocumentCache: true
					}
				)

				return
			} catch (error) {
				logger.warn('tool-aware path unavailable, falling back to streaming pipeline', error)
				// Fall through to original path
			}
		}

		// Original streaming path (backward compatible)
		let requestParams: Record<string, unknown> = { model, ...remains }
		if (mcpManager && mcpExecutor) {
			try {
				const { injectMCPTools } = await import('../mcp/providerToolIntegration.js')
				// biome-ignore lint/suspicious/noExplicitAny: MCP types are optional dependencies
				requestParams = await injectMCPTools(requestParams, 'OpenAI', mcpManager as any, mcpExecutor as any)
			} catch (error) {
				logger.warn('failed to inject MCP tools for openai', error)
			}
		}

		const formattedMessages = await Promise.all(messages.map((msg) => formatMsg(msg, resolveEmbedAsBinary)))
		const client = new OpenAI({
			apiKey,
			baseURL,
			dangerouslyAllowBrowser: true
		})

		const stream = await client.chat.completions.create(
			{
				...(requestParams as object),
				messages: formattedMessages as OpenAI.ChatCompletionMessageParam[],
				stream: true
			} as OpenAI.ChatCompletionCreateParamsStreaming,
			{ signal: controller.signal }
		)

		for await (const part of stream) {
			const text = part.choices[0]?.delta?.content
			if (!text) continue
			yield text
		}
	}

type ContentItem =
	| {
			type: 'image_url'
			image_url: {
				url: string
			}
	  }
	| { type: 'text'; text: string }

const formatMsg = async (msg: Message, resolveEmbedAsBinary: ResolveEmbedAsBinary) => {
	const content: ContentItem[] = msg.embeds
		? await Promise.all(msg.embeds.map((embed) => convertEmbedToImageUrl(embed, resolveEmbedAsBinary)))
		: []

	if (msg.content.trim()) {
		content.push({
			type: 'text' as const,
			text: msg.content
		})
	}
	return {
		role: msg.role,
		content
	}
}

/**
 * Format message for coordinator (simpler format - just role and content)
 */
const formatMsgForCoordinator = async (msg: Message, resolveEmbedAsBinary: ResolveEmbedAsBinary) => {
	// For coordinator, we keep it simple - embeds will be handled by the adapter
	return {
		role: msg.role,
		content: msg.content,
		embeds: msg.embeds
	}
}

export const openAIVendor: Vendor = {
	name: 'OpenAI',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://api.openai.com/v1',
		model: 'gpt-4.1',
		parameters: {}
	},
	sendRequestFunc,
	models: [],
	websiteToObtainKey: 'https://platform.openai.com/api-keys',
	capabilities: ['Text Generation', 'Image Vision', 'Tool Calling']
}
