import Anthropic from '@anthropic-ai/sdk'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, Optional, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'

type ClaudeOptions = BaseOptions & Pick<Optional, 'max_tokens'>

const sendRequestFunc = (settings: ClaudeOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, _resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { apiKey, model, max_tokens } = options
		let { baseURL } = options
		if (!apiKey) throw new Error(t('API key is required'))

		// 如果 baseURL 末尾包含 /v1/messages，则移除它，因为 Anthropic SDK 会自动添加
		if (baseURL.endsWith('/v1/messages/')) {
			baseURL = baseURL.slice(0, -'/v1/messages/'.length)
		} else if (baseURL.endsWith('/v1/messages')) {
			baseURL = baseURL.slice(0, -'/v1/messages'.length)
		}
		const [system_msg, messagesWithoutSys] =
			messages[0].role === 'system' ? [messages[0], messages.slice(1)] : [null, messages]

		const client = new Anthropic({
			apiKey,
			baseURL,
			fetch: globalThis.fetch,
			dangerouslyAllowBrowser: true
		})

		// 构建请求参数
		const requestParams: Anthropic.MessageCreateParams = {
			max_tokens,
			messages: messagesWithoutSys as Anthropic.MessageParam[],
			model: model,
			stream: true,
			// 如果有系统消息，添加到请求中
			...(system_msg && { system: system_msg.content })
		}

		const stream = await client.messages.create(requestParams, {
			signal: controller.signal
		})

		for await (const messageStreamEvent of stream) {
			// console.debug('ClaudeNew messageStreamEvent', messageStreamEvent)

			// 处理不同类型的流事件
			if (messageStreamEvent.type === 'content_block_delta') {
				if (messageStreamEvent.delta.type === 'text_delta') {
					yield messageStreamEvent.delta.text
				}
			} else if (messageStreamEvent.type === 'message_delta') {
				// 处理消息级别的增量更新
				console.debug('Message delta received', messageStreamEvent.delta)
			}
		}
	}

const models = [
	'claude-sonnet-4-0',
	'claude-opus-4-0',
	'claude-3-7-sonnet-latest',
	'claude-3-5-sonnet-latest',
	'claude-3-opus-latest',
	'claude-3-5-haiku-latest'
]

export const claudeNewVendor: Vendor = {
	name: 'ClaudeNew',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://api.anthropic.com',
		model: models[0],
		max_tokens: 8192,
		parameters: {}
	} as ClaudeOptions,
	sendRequestFunc,
	models,
	websiteToObtainKey: 'https://console.anthropic.com',
	capabilities: ['Text Generation', 'Image Vision', 'PDF Vision']
}
