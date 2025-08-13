import { EmbedCache } from 'obsidian'
import { ToolRegistry } from 'src/tools'

export type MsgRole = 'user' | 'assistant' | 'system'

export interface SaveAttachment {
	(fileName: string, data: ArrayBuffer): Promise<void>
}

export interface ResolveEmbedAsBinary {
	(embed: EmbedCache): Promise<ArrayBuffer>
}

export interface CreatePlainText {
	(filePath: string, text: string): Promise<void>
}

export interface Message {
	readonly role: MsgRole
	readonly content: string
	readonly embeds?: EmbedCache[]
}

export type SendRequest = (
	messages: readonly Message[],
	controller: AbortController,
	resolveEmbedAsBinary: ResolveEmbedAsBinary,
	saveAttachment?: SaveAttachment,
	toolRegistry?: ToolRegistry
) => AsyncGenerator<string, void, unknown>

export type Capability =
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
	readonly capabilities: Capability[]
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
