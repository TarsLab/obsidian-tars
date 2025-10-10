import OpenAI from 'openai'
import { t } from 'src/lang/helper'
import { createLogger } from '../logger'
import type { BaseOptions, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'
import { CALLOUT_BLOCK_END, CALLOUT_BLOCK_START } from './utils'

const logger = createLogger('providers:deepseek')

type DeepSeekDelta = OpenAI.ChatCompletionChunk.Choice.Delta & {
	reasoning_content?: string
} // hack, deepseek-reasoner added a reasoning_content field

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, _resolveEmbedAsBinary: ResolveEmbedAsBinary) {
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
				requestParams = await injectMCPTools(requestParams, 'DeepSeek', mcpManager as any, mcpExecutor as any)
			} catch (error) {
				logger.warn('failed to inject MCP tools for deepseek', error)
			}
		}

		const client = new OpenAI({
			apiKey,
			baseURL,
			dangerouslyAllowBrowser: true
		})

		const stream = await client.chat.completions.create(
			{
				...(requestParams as object),
				messages,
				stream: true
			} as OpenAI.ChatCompletionCreateParamsStreaming,
			{ signal: controller.signal }
		)

		let startReasoning = false
		for await (const part of stream) {
			if (part.usage?.prompt_tokens && part.usage.completion_tokens)
				logger.debug('usage update', {
					promptTokens: part.usage.prompt_tokens,
					completionTokens: part.usage.completion_tokens
				})

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

const models = ['deepseek-chat', 'deepseek-reasoner']

export const deepSeekVendor: Vendor = {
	name: 'DeepSeek',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://api.deepseek.com',
		model: models[0],
		parameters: {}
	},
	sendRequestFunc,
	models,
	websiteToObtainKey: 'https://platform.deepseek.com',
	capabilities: ['Text Generation', 'Reasoning', 'Tool Calling']
}
