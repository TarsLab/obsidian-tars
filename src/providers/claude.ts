import Anthropic from '@anthropic-ai/sdk'
import { EmbedCache, Notice } from 'obsidian'
import { Capabilities, ResolveEmbedAsBinary } from 'src/environment'
import { t } from 'src/lang/helper'
import { ToolUse } from 'src/tools'
import { BaseOptions, ChatMessage, Message, SendRequest, ToolMessage, Vendor } from '.'
import {
	arrayBufferToBase64,
	CALLOUT_BLOCK_END,
	CALLOUT_BLOCK_START,
	getFeatureEmoji,
	getMimeTypeFromFilename
} from './utils'

export interface ClaudeOptions extends BaseOptions {
	max_tokens: number
	budget_tokens: number
}

const formatMsgForClaudeAPI = async (msg: ChatMessage, resolveEmbedAsBinary: ResolveEmbedAsBinary) => {
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

/**
 * 将消息数组转换为 Anthropic API 格式
 * 正确处理工具消息，按照 Anthropic 的格式要求
 */
const convertMessagesToAnthropicFormat = async (
	messagesWithoutSys: Message[],
	resolveEmbedAsBinary: ResolveEmbedAsBinary
): Promise<Anthropic.MessageParam[]> => {
	const anthropicMessages: Anthropic.MessageParam[] = []

	for (let i = 0; i < messagesWithoutSys.length; i++) {
		const currentMsg = messagesWithoutSys[i]

		if (currentMsg.role === 'tool') {
			// 工具消息需要拆分处理
			const toolMsg = currentMsg as ToolMessage

			// 1. 将 toolUses 添加到前一个 assistant 消息，或创建新的 assistant 消息
			if (anthropicMessages.length > 0 && anthropicMessages[anthropicMessages.length - 1].role === 'assistant') {
				const lastAssistantMsg = anthropicMessages[anthropicMessages.length - 1]
				// 添加 tool_use 块到 assistant 消息的 content
				for (const toolUse of toolMsg.toolUses) {
					;(lastAssistantMsg.content as Anthropic.ContentBlockParam[]).push({
						type: 'tool_use',
						id: toolUse.id,
						name: toolUse.name,
						input: toolUse.input
					} as Anthropic.ToolUseBlockParam)
				}
			} else {
				// 没有前一个 assistant 消息，创建一个新的
				const toolUseBlocks: Anthropic.ToolUseBlockParam[] = toolMsg.toolUses.map((toolUse) => ({
					type: 'tool_use',
					id: toolUse.id,
					name: toolUse.name,
					input: toolUse.input
				}))

				anthropicMessages.push({
					role: 'assistant',
					content: toolUseBlocks
				})
			}

			// 2. 将 toolResults 添加到下一个 user 消息（如果存在）
			const nextMsg = messagesWithoutSys[i + 1]
			if (nextMsg && nextMsg.role === 'user') {
				// 下一条是 user 消息，将 tool_result 添加到其开头
				const formattedNextMsg = await formatMsgForClaudeAPI(nextMsg, resolveEmbedAsBinary)

				// tool_result 必须在 content 数组的最前面
				const toolResults: Anthropic.ToolResultBlockParam[] = toolMsg.toolResults.map((result) => ({
					type: 'tool_result',
					tool_use_id: result.tool_use_id,
					content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
					...(result.is_error && { is_error: result.is_error })
				}))

				// 合并内容，tool_result 在前面
				const combinedContent: Anthropic.ContentBlockParam[] = [...toolResults, ...formattedNextMsg.content]

				anthropicMessages.push({
					role: 'user',
					content: combinedContent
				})
				i++ // 跳过下一个消息，因为已经处理了
			} else {
				// 如果没有下一个 user 消息，创建一个只包含 tool_result 的 user 消息
				const toolResults: Anthropic.ToolResultBlockParam[] = toolMsg.toolResults.map((result) => ({
					type: 'tool_result',
					tool_use_id: result.tool_use_id,
					content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
					...(result.is_error && { is_error: result.is_error })
				}))

				anthropicMessages.push({
					role: 'user',
					content: toolResults
				})
			}
		} else {
			// 非工具消息正常处理
			const formattedMsg = await formatMsgForClaudeAPI(currentMsg, resolveEmbedAsBinary)
			anthropicMessages.push(formattedMsg)
		}
	}

	return anthropicMessages
}

const sendRequestFunc = (settings: ClaudeOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, capabilities: Capabilities) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const {
			apiKey,
			baseURL: originalBaseURL,
			model,
			max_tokens,
			enableThinking,
			budget_tokens = 1600,
			enableTarsTools
		} = options
		let baseURL = originalBaseURL
		if (!apiKey) throw new Error(t('API key is required'))

		// Remove /v1/messages from baseURL if present, as Anthropic SDK will add it automatically
		if (baseURL.endsWith('/v1/messages/')) {
			baseURL = baseURL.slice(0, -'/v1/messages/'.length)
		} else if (baseURL.endsWith('/v1/messages')) {
			baseURL = baseURL.slice(0, -'/v1/messages'.length)
		}

		const [system_msg, messagesWithoutSys] =
			messages[0].role === 'system' ? [messages[0], messages.slice(1)] : [null, messages]

		// Check if messagesWithoutSys only contains user or assistant roles
		messagesWithoutSys.forEach((msg) => {
			if (msg.role === 'system') {
				throw new Error('System messages are only allowed as the first message')
			}
		})

		const { resolveEmbedAsBinary, toolRegistry } = capabilities

		// 处理消息转换为 Anthropic 格式
		const anthropicMessages = await convertMessagesToAnthropicFormat(messagesWithoutSys, resolveEmbedAsBinary)
		console.debug('Converted messages for Anthropic:', anthropicMessages)

		const client = new Anthropic({
			apiKey,
			baseURL,
			fetch: globalThis.fetch,
			dangerouslyAllowBrowser: true
		})

		const tools: unknown[] = []

		// 添加内置的 Text Editor Tool (Claude 4 专用)
		if (
			enableTarsTools &&
			(model.includes('claude-4') || model.includes('claude-opus-4') || model.includes('claude-sonnet-4'))
		) {
			tools.push({
				type: 'text_editor_20250728',
				name: 'str_replace_based_edit_tool'
			})
		}

		// 添加 Tars 工具 (自定义工具)
		if (enableTarsTools) {
			const tarsTools = toolRegistry.getTools()
			for (const tool of tarsTools) {
				tools.push({
					name: tool.name,
					description: tool.description,
					input_schema: tool.input_schema
				})
			}
		}
		console.debug('Using tools:', tools)
		const requestParams: Anthropic.MessageCreateParams = {
			model,
			max_tokens,
			messages: anthropicMessages,
			stream: true,
			...(system_msg && { system: system_msg.content }),
			...(tools.length > 0 && { tools: tools as Anthropic.Tool[] }),
			...(enableThinking && {
				thinking: {
					type: 'enabled',
					budget_tokens
				}
			})
		}

		const stream = await client.messages.create(requestParams, {
			signal: controller.signal
		})

		let startReasoning = false
		// 收集工具调用参数
		const activeToolUses = new Map<
			string,
			{
				toolUse: Anthropic.Messages.ToolUseBlock
				buffer: string
			}
		>()

		// @ts-ignore - 类型检查问题，但运行时正常
		for await (const messageStreamEvent of stream) {
			// console.debug('ClaudeNew messageStreamEvent', messageStreamEvent)

			// Handle different types of stream events
			if (messageStreamEvent.type === 'content_block_delta') {
				if (messageStreamEvent.delta.type === 'text_delta') {
					const text = messageStreamEvent.delta.text

					if (startReasoning) {
						startReasoning = false
						yield CALLOUT_BLOCK_END + text
					} else {
						yield text
					}
				}
				if (messageStreamEvent.delta.type === 'thinking_delta') {
					const prefix = !startReasoning ? ((startReasoning = true), CALLOUT_BLOCK_START) : ''
					yield prefix + messageStreamEvent.delta.thinking.replace(/\n/g, '\n> ') // Each line of the callout needs to have '>' at the beginning
				}
				// 处理工具调用的增量数据
				if (messageStreamEvent.delta.type === 'input_json_delta') {
					const blockIndex = messageStreamEvent.index
					// 查找对应的工具调用（通过索引或其他方式）
					for (const [, toolData] of activeToolUses.entries()) {
						// 简化处理：如果只有一个活跃工具，就更新它
						if (activeToolUses.size === 1 || blockIndex === undefined) {
							toolData.buffer += messageStreamEvent.delta.partial_json || ''
							break
						}
						// 更复杂的索引匹配逻辑可以在这里实现
					}
				}
			} else if (messageStreamEvent.type === 'content_block_start') {
				// Handle content block start events, including tool usage
				// console.debug('Content block started', messageStreamEvent.content_block)
				if (
					messageStreamEvent.content_block.type === 'server_tool_use' &&
					messageStreamEvent.content_block.name === 'web_search'
				) {
					new Notice(getFeatureEmoji('Web Search') + 'Web Search')
				}
				// 处理 Tars 工具调用开始 (包括内置和自定义工具)
				if (enableTarsTools && messageStreamEvent.content_block.type === 'tool_use') {
					const toolUse = messageStreamEvent.content_block as Anthropic.Messages.ToolUseBlock

					// 添加到活跃工具列表
					activeToolUses.set(toolUse.id, {
						toolUse: toolUse,
						buffer: ''
					})
					console.debug('Tool use recorded:', toolUse.id, toolUse.name)

					// 为内置text editor工具显示通知
					if (toolUse.name === 'str_replace_based_edit_tool') {
						new Notice('📝 Text Editor Tool')
					}
				}
			} else if (messageStreamEvent.type === 'content_block_stop') {
				// content_block_stop 不需要特殊处理，工具执行在流结束后统一处理
			} else if (messageStreamEvent.type === 'message_delta') {
				// Handle message-level incremental updates
				// console.debug('Message delta received', messageStreamEvent.delta)
				// Check stop reason and notify user
				if (messageStreamEvent.delta.stop_reason) {
					const stopReason = messageStreamEvent.delta.stop_reason
					// console.debug('Stop reason:', stopReason)
					switch (stopReason) {
						case 'end_turn':
						case 'stop_sequence':
						case 'tool_use':
							break
						case 'max_tokens':
							throw new Error(
								'⚠️ Response truncated: Maximum token limit reached. Consider increasing max_tokens setting.'
							)
						case 'pause_turn':
							throw new Error(
								'⏸️ Response paused: The conversation was paused due to length. You can continue by sending another message.'
							)
						case 'refusal':
							throw new Error(
								'🚫 Content blocked: The response was blocked due to content policy. Please rephrase your request.'
							)
						default:
							console.error(`⚠️ Unexpected stop reason: ${stopReason}`)
							break
					}
				}
			}
		}

		// 流结束后，统一处理所有收集到的工具调用
		if (enableTarsTools && activeToolUses.size > 0) {
			const toolsToExecute: ToolUse[] = []

			for (const [, toolData] of activeToolUses.entries()) {
				try {
					const toolInput = JSON.parse(toolData.buffer || JSON.stringify(toolData.toolUse.input) || '{}')

					console.debug('Tool:', toolData.toolUse.name, 'with input:', toolInput)

					const toolUseBlock: ToolUse = {
						type: 'tool_use',
						id: toolData.toolUse.id,
						name: toolData.toolUse.name,
						input: toolInput
					}

					toolsToExecute.push(toolUseBlock)
				} catch (error) {
					console.error(`Failed to parse tool input for ${toolData.toolUse.name}:`, error)
				}
			}

			if (toolsToExecute.length > 0) {
				yield toolsToExecute
			}

			// 清理工具调用状态
			activeToolUses.clear()
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

export const claudeVendor: Vendor = {
	name: 'Claude',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://api.anthropic.com',
		model: models[0],
		max_tokens: 8192,
		enableWebSearch: false,
		enableThinking: false,
		enableTarsTools: false,
		budget_tokens: 1600,
		parameters: {}
	} as ClaudeOptions,
	sendRequestFunc,
	models,
	websiteToObtainKey: 'https://console.anthropic.com',
	features: ['Text Generation', 'Reasoning', 'Image Vision', 'PDF Vision', 'Tars Tools']
}
