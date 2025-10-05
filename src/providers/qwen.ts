import OpenAI from 'openai'
import { createLogger } from '../logger'
import { t } from 'src/lang/helper'
import type { BaseOptions, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'
import { convertEmbedToImageUrl } from './utils'

const logger = createLogger('providers:qwen')

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const { parameters, mcpManager, mcpExecutor, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { apiKey, baseURL, model, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))
		logger.info('starting qwen chat', { baseURL, model, messageCount: messages.length })

		// Inject MCP tools if available
		let requestParams: Record<string, unknown> = { model, ...remains }
		if (mcpManager && mcpExecutor) {
			try {
				const { injectMCPTools } = await import('../mcp/providerToolIntegration.js')
				// biome-ignore lint/suspicious/noExplicitAny: MCP types are optional dependencies
				requestParams = await injectMCPTools(requestParams, 'Qwen', mcpManager as any, mcpExecutor as any)
			} catch (error) {
				logger.warn('failed to inject MCP tools for qwen', error)
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
			{
				signal: controller.signal
			}
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

const models = ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-vl-max']

export const qwenVendor: Vendor = {
	name: 'Qwen',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
		model: models[0],
		parameters: {}
	},
	sendRequestFunc,
	models,
	websiteToObtainKey: 'https://dashscope.console.aliyun.com',
	capabilities: ['Text Generation', 'Image Vision', 'Tool Calling']
}
