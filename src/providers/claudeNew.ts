import Anthropic from '@anthropic-ai/sdk'
import { EmbedCache, Notice } from 'obsidian'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'
import { arrayBufferToBase64, getCapabilityEmoji, getMimeTypeFromFilename } from './utils'

export interface ClaudeOptions extends BaseOptions {
	max_tokens: number
	enableWebSearch: boolean
	enableThinking: boolean
	budget_tokens: number
}

const CALLOUT_BLOCK_START = '\n\n> [!quote]-  \n> '
const CALLOUT_BLOCK_END = '\n\n'

const formatMsgForClaudeAPI = async (msg: Message, resolveEmbedAsBinary: ResolveEmbedAsBinary) => {
	const content: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam)[] = msg.embeds
		? await Promise.all(msg.embeds.map((embed) => formatEmbed(embed, resolveEmbedAsBinary)))
		: []

	if (msg.content.trim()) {
		content.push({
			type: 'text',
			text: msg.content
		})
	}

	return {
		role: msg.role as 'user' | 'assistant',
		content
	}
}

const formatEmbed = async (embed: EmbedCache, resolveEmbedAsBinary: ResolveEmbedAsBinary) => {
	const mimeType = getMimeTypeFromFilename(embed.link)
	if (mimeType === 'application/pdf') {
		const embedBuffer = await resolveEmbedAsBinary(embed)
		const base64Data = arrayBufferToBase64(embedBuffer)
		return {
			type: 'document',
			source: {
				type: 'base64',
				media_type: mimeType,
				data: base64Data
			}
		} as Anthropic.DocumentBlockParam
	} else if (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mimeType)) {
		const embedBuffer = await resolveEmbedAsBinary(embed)
		const base64Data = arrayBufferToBase64(embedBuffer)
		return {
			type: 'image',
			source: {
				type: 'base64',
				media_type: mimeType,
				data: base64Data
			}
		} as Anthropic.ImageBlockParam
	} else {
		throw new Error(t('Only PNG, JPEG, GIF, WebP, and PDF files are supported.'))
	}
}

const sendRequestFunc = (settings: ClaudeOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const {
			apiKey,
			baseURL: originalBaseURL,
			model,
			max_tokens,
			enableWebSearch = false,
			enableThinking = false,
			budget_tokens = 1600
		} = options
		let baseURL = originalBaseURL
		if (!apiKey) throw new Error(t('API key is required'))

		// 如果 baseURL 末尾包含 /v1/messages，则移除它，因为 Anthropic SDK 会自动添加
		if (baseURL.endsWith('/v1/messages/')) {
			baseURL = baseURL.slice(0, -'/v1/messages/'.length)
		} else if (baseURL.endsWith('/v1/messages')) {
			baseURL = baseURL.slice(0, -'/v1/messages'.length)
		}

		const [system_msg, messagesWithoutSys] =
			messages[0].role === 'system' ? [messages[0], messages.slice(1)] : [null, messages]

		// 检查 messagesWithoutSys 中的角色是否只包含 user 或 assistant
		messagesWithoutSys.forEach((msg) => {
			if (msg.role === 'system') {
				throw new Error('System messages are only allowed as the first message')
			}
		})

		const formattedMsgs = await Promise.all(
			messagesWithoutSys.map((msg) => formatMsgForClaudeAPI(msg, resolveEmbedAsBinary))
		)

		const client = new Anthropic({
			apiKey,
			baseURL,
			fetch: globalThis.fetch,
			dangerouslyAllowBrowser: true
		})

		const requestParams: Anthropic.MessageCreateParams = {
			model,
			max_tokens,
			messages: formattedMsgs,
			stream: true,
			...(system_msg && { system: system_msg.content }),
			...(enableWebSearch && {
				tools: [
					{
						name: 'web_search',
						type: 'web_search_20250305'
					}
				]
			}),
			...(enableThinking && {
				thinking: {
					type: 'enabled',
					budget_tokens
				}
			})
		}
		console.debug('ClaudeNew requestParams', requestParams)

		const stream = await client.messages.create(requestParams, {
			signal: controller.signal
		})

		let startReasoning = false
		for await (const messageStreamEvent of stream) {
			// console.debug('ClaudeNew messageStreamEvent', messageStreamEvent)

			// 处理不同类型的流事件
			if (messageStreamEvent.type === 'content_block_delta') {
				if (messageStreamEvent.delta.type === 'text_delta') {
					if (startReasoning) {
						startReasoning = false
						yield CALLOUT_BLOCK_END + messageStreamEvent.delta.text
					} else {
						yield messageStreamEvent.delta.text
					}
				}
				if (messageStreamEvent.delta.type === 'thinking_delta') {
					const prefix = !startReasoning ? ((startReasoning = true), CALLOUT_BLOCK_START) : ''
					yield prefix + messageStreamEvent.delta.thinking.replace(/\n/g, '\n> ') // Each line of the callout needs to have '>' at the beginning
				}
			} else if (messageStreamEvent.type === 'content_block_start') {
				// 处理内容块开始事件，包括工具使用
				console.debug('Content block started', messageStreamEvent.content_block)
				if (
					messageStreamEvent.content_block.type === 'server_tool_use' &&
					messageStreamEvent.content_block.name === 'web_search'
				) {
					new Notice(getCapabilityEmoji('Web Search') + 'Web Search')
				}
			} else if (messageStreamEvent.type === 'content_block_stop') {
				// 处理内容块结束事件
				console.debug('Content block stopped')
			} else if (messageStreamEvent.type === 'message_start') {
				// 处理消息开始事件
				console.debug('Message started')
			} else if (messageStreamEvent.type === 'message_stop') {
				// 处理消息结束事件
				console.debug('Message stopped')
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
		enableWebSearch: false,
		enableThinking: false,
		budget_tokens: 1600,
		parameters: {}
	} as ClaudeOptions,
	sendRequestFunc,
	models,
	websiteToObtainKey: 'https://console.anthropic.com',
	capabilities: ['Text Generation', 'Web Search', 'Reasoning', 'Image Vision', 'PDF Vision']
}
