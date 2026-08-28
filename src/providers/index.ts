import { EmbedCache } from 'obsidian'
import type { LocaleKey } from 'src/lang/helper'

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
	saveAttachment?: SaveAttachment
) => AsyncGenerator<string, void, unknown>

export type Capability =
	| 'Text Generation'
	| 'Image Vision'
	| 'PDF Vision'
	| 'Image Generation'
	| 'Image Editing'
	| 'Web Search'
	| 'Reasoning'

export interface Vendor {
	readonly name: string
	/**
	 * What this vendor is, for the one whose name does not already say it.
	 *
	 * A locale key rather than a string, because a vendor is built at module load
	 * and the settings tab is rendered much later: holding the key defers the
	 * lookup to the render, where every other string in the tab is translated.
	 */
	readonly description?: LocaleKey
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
