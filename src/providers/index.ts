import { EmbedCache } from 'obsidian'
import { Capabilities } from 'src/environment'
import { ToolExecution, ToolResult, ToolUse } from 'src/tools'

// 聊天消息 - 聊天对话中的消息
export interface ChatMessage {
	readonly role: 'user' | 'assistant' | 'system'
	readonly content: string
	readonly embeds?: EmbedCache[]
}

// 工具消息 - 工具调用的消息
export interface ToolMessage {
	readonly role: 'tool'
	readonly embeds?: EmbedCache[]
	readonly toolUses: ToolUse[]
	readonly toolResults: ToolResult[]
}

export type Message = ChatMessage | ToolMessage

export type StreamOutputBlock = string | ToolExecution

export type SendRequest = (
	messages: readonly Message[],
	controller: AbortController,
	capabilities: Capabilities
) => AsyncGenerator<StreamOutputBlock, void, unknown>

export type Feature =
	| 'Text Generation'
	| 'Image Vision'
	| 'PDF Vision'
	| 'Image Generation'
	| 'Image Editing'
	| 'Web Search'
	| 'Reasoning'
	| 'Tars Tools'

export interface Vendor {
	readonly name: string
	readonly defaultOptions: BaseOptions
	readonly sendRequestFunc: (options: BaseOptions) => SendRequest
	readonly models: string[]
	readonly websiteToObtainKey: string
	readonly features: Feature[]
}

export interface BaseOptions {
	apiKey: string
	baseURL: string
	model: string
	parameters: Record<string, unknown>
	enableWebSearch?: boolean
	enableTarsTools?: boolean
	enableThinking?: boolean
}

export interface ProviderSettings {
	tag: string
	readonly vendor: string
	options: BaseOptions
}

export interface Optional {
	apiSecret: string
	endpoint: string
	apiVersion: string
}

export const filterToChatMessages = (messages: readonly Message[]): ChatMessage[] => {
	return messages.filter((msg): msg is ChatMessage => msg.role !== 'tool')
}

// 类型保护函数 - 判断是否为字符串输出
export const isTextOutput = (block: StreamOutputBlock): block is string => {
	return typeof block === 'string'
}

// 类型保护函数 - 判断是否为工具执行块
export const isToolExecution = (block: StreamOutputBlock): block is ToolExecution => {
	return typeof block === 'object' && block.type === 'tool_execution'
}
