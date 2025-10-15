import axios from 'axios'
import { Notice } from 'obsidian'
import { Capabilities, ResolveEmbedAsBinary } from 'src/environment'
import { t } from 'src/lang/helper'
import { ToolUse } from 'src/tools'
import { BaseOptions, ChatMessage, Message, SendRequest, ToolMessage, Vendor } from '.'
import { CALLOUT_BLOCK_END, CALLOUT_BLOCK_START, convertEmbedToImageUrl, getFeatureEmoji } from './utils'

// Kimi API 消息格式
export interface KimiMessage {
	role: 'user' | 'assistant' | 'system' | 'tool'
	content?: string | ContentItem[]
	tool_calls?: KimiToolCall[]
	tool_call_id?: string
}

interface KimiToolCall {
	id: string
	type: 'function'
	function: {
		name: string
		arguments: string
	}
}

interface KimiTool {
	type: 'function'
	function: {
		name: string
		description: string
		parameters: Record<string, unknown>
	}
}

/**
 * 将消息数组转换为 Kimi API 格式
 * 处理工具消息，按照 OpenAI 兼容格式组织 tool calls 和 tool results
 */
export const convertMessagesToKimiFormat = async (
	messages: Message[],
	resolveEmbedAsBinary: ResolveEmbedAsBinary
): Promise<KimiMessage[]> => {
	const kimiMessages: KimiMessage[] = []

	for (let i = 0; i < messages.length; i++) {
		const currentMsg = messages[i]

		if (currentMsg.role === 'tool') {
			// 工具消息需要拆分处理
			const toolMsg = currentMsg as ToolMessage

			// 1. 将 toolUses 添加到前一个 assistant 消息
			if (kimiMessages.length > 0 && kimiMessages[kimiMessages.length - 1].role === 'assistant') {
				const lastAssistantMsg = kimiMessages[kimiMessages.length - 1]
				// 添加 tool_calls 到 assistant 消息
				if (!lastAssistantMsg.tool_calls) {
					lastAssistantMsg.tool_calls = []
				}
				for (const toolUse of toolMsg.toolUses) {
					lastAssistantMsg.tool_calls.push({
						id: toolUse.id,
						type: 'function',
						function: {
							name: toolUse.name,
							arguments: JSON.stringify(toolUse.input)
						}
					})
				}
			}

			// 2. 为每个 toolResult 创建独立的 tool 消息
			for (const result of toolMsg.toolResults) {
				kimiMessages.push({
					role: 'tool',
					tool_call_id: result.tool_use_id,
					content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
				})
			}
		} else {
			// 非工具消息正常处理
			const formattedMsg = await formatMsg(currentMsg as ChatMessage, resolveEmbedAsBinary)
			kimiMessages.push(formattedMsg)
		}
	}

	return kimiMessages
}

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, capabilities: Capabilities) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { apiKey, baseURL, model, enableTarsTools, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))
		if (!model) throw new Error(t('Model is required'))

		const { resolveEmbedAsBinary, toolRegistry } = capabilities

		// 使用新的消息转换函数
		const formattedMessages = await convertMessagesToKimiFormat(messages, resolveEmbedAsBinary)

		const tools: KimiTool[] = []

		// 添加 Tars 工具（使用 OpenAI 兼容格式）
		if (enableTarsTools) {
			const tarsTools = toolRegistry.getTools()
			for (const tool of tarsTools) {
				tools.push({
					type: 'function',
					function: {
						name: tool.name,
						description: tool.description,
						parameters: tool.input_schema
					}
				})
			}
		}
		console.debug('Using tools:', tools)

		const data = {
			model,
			messages: formattedMessages,
			stream: true,
			...(tools.length > 0 && { tools }),
			...remains
		}

		console.debug('Kimi request data:', data)

		const response = await axios.post(baseURL, data, {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			adapter: 'fetch',
			responseType: 'stream',
			withCredentials: false,
			signal: controller.signal
		})

		const reader = response.data.pipeThrough(new TextDecoderStream()).getReader()

		let reading = true
		let startReasoning = false
		// 收集工具调用参数
		const activeToolCalls = new Map<
			string,
			{
				id: string
				name: string
				arguments: string
			}
		>()

		while (reading) {
			const { done, value } = await reader.read()
			if (done) {
				reading = false
				break
			}

			const parts = value.split('\n')

			for (const part of parts) {
				if (part.includes('data: [DONE]')) {
					reading = false
					break
				}

				const trimmedPart = part.replace(/^data: /, '').trim()
				if (trimmedPart) {
					try {
						const data = JSON.parse(trimmedPart)
						if (data.choices && data.choices[0].delta) {
							const delta = data.choices[0].delta
							const reasonContent = delta.reasoning_content

							if (reasonContent) {
								const prefix = !startReasoning ? ((startReasoning = true), CALLOUT_BLOCK_START) : ''
								yield prefix + reasonContent.replace(/\n/g, '\n> ')
							} else {
								const prefix = startReasoning ? ((startReasoning = false), CALLOUT_BLOCK_END) : ''

								// 处理工具调用
								if (delta.tool_calls) {
									for (const toolCall of delta.tool_calls) {
										if (toolCall.function) {
											if (!activeToolCalls.has(toolCall.id)) {
												activeToolCalls.set(toolCall.id, {
													id: toolCall.id,
													name: toolCall.function.name || '',
													arguments: ''
												})
												// 显示工具调用通知
												if (toolCall.function.name) {
													new Notice(getFeatureEmoji('Tars Tools') + `Tool: ${toolCall.function.name}`)
												}
											}

											// 累积参数
											if (toolCall.function.arguments) {
												const existingCall = activeToolCalls.get(toolCall.id)!
												existingCall.arguments += toolCall.function.arguments
											}
										}
									}
								}

								if (delta.content) {
									yield prefix + delta.content
								}
							}
						}
					} catch (error) {
						console.error('Failed to parse Kimi response:', error)
					}
				}
			}
		}

		// 流结束后，统一处理所有收集到的工具调用
		if (enableTarsTools && activeToolCalls.size > 0) {
			const toolsToExecute: ToolUse[] = []

			for (const [, toolCall] of activeToolCalls.entries()) {
				try {
					const toolInput = JSON.parse(toolCall.arguments || '{}')

					console.debug('Tool:', toolCall.name, 'with input:', toolInput)

					const toolUseBlock: ToolUse = {
						type: 'tool_use',
						id: toolCall.id,
						name: toolCall.name,
						input: toolInput
					}

					toolsToExecute.push(toolUseBlock)
				} catch (error) {
					console.error(`Failed to parse tool arguments for ${toolCall.name}:`, error)
				}
			}

			if (toolsToExecute.length > 0) {
				yield toolsToExecute
			}

			// 清理工具调用状态
			activeToolCalls.clear()
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

const formatMsg = async (msg: ChatMessage, resolveEmbedAsBinary: ResolveEmbedAsBinary) => {
	const content: ContentItem[] = msg.embeds
		? await Promise.all(msg.embeds.map((embed) => convertEmbedToImageUrl(embed, resolveEmbedAsBinary)))
		: []

	// If there are no embeds/images, return a simple text message format
	if (content.length === 0) {
		return {
			role: msg.role,
			content: msg.content
		}
	}
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

export const kimiVendor: Vendor = {
	name: 'Kimi',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://api.moonshot.cn/v1/chat/completions',
		model: '',
		parameters: {}
	},
	sendRequestFunc,
	models: [],
	websiteToObtainKey: 'https://www.moonshot.cn',
	features: ['Text Generation', 'Image Vision', 'Reasoning', 'Tars Tools']
}
