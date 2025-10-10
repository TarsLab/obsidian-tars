import OpenAI from 'openai'
import { t } from 'src/lang/helper'
import { createLogger } from '../logger'
import type { BaseOptions, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'
import { CALLOUT_BLOCK_END, CALLOUT_BLOCK_START, convertEmbedToImageUrl } from './utils'

const logger = createLogger('providers:siliconflow')

type DeepSeekDelta = OpenAI.ChatCompletionChunk.Choice.Delta & {
	reasoning_content?: string
} // hack, deepseek-reasoner added a reasoning_content field

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const { parameters, mcpManager, mcpExecutor, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { apiKey, baseURL, model, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))

		// Inject MCP tools if available
		let requestParams: Record<string, unknown> = { model, ...remains }
		if (mcpManager && mcpExecutor) {
			try {
				const { injectMCPTools } = await import('../mcp/providerToolIntegration.js')
				// biome-ignore lint/suspicious/noExplicitAny: MCP types are optional dependencies
				requestParams = await injectMCPTools(requestParams, 'SiliconFlow', mcpManager as any, mcpExecutor as any)
			} catch (error) {
				logger.warn('failed to inject MCP tools for siliconflow', error)
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

		let startReasoning = false
		for await (const part of stream) {
			const delta = part.choices[0]?.delta as DeepSeekDelta
			const reasonContent = delta?.reasoning_content

			if (reasonContent) {
				const prefix = !startReasoning ? ((startReasoning = true), CALLOUT_BLOCK_START) : ''
				yield prefix + reasonContent.replace(/\n/g, '\n> ') // Each line of the callout needs to have '>' at the beginning
			} else {
				const prefix = startReasoning ? ((startReasoning = false), CALLOUT_BLOCK_END) : ''
				if (delta?.content) yield prefix + delta?.content
			}
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

export const siliconFlowVendor: Vendor = {
	name: 'SiliconFlow',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://api.siliconflow.cn/v1',
		model: '',
		parameters: {}
	},
	sendRequestFunc,
	models: [],
	websiteToObtainKey: 'https://siliconflow.cn',
	capabilities: ['Text Generation', 'Image Vision', 'Reasoning', 'Tool Calling']
}
