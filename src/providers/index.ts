export interface TextBlock {
	text: string
	type: 'text'
}

export interface ImageBlock {
	source: {
		data: string
		media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
		type: 'base64'
	}

	type: 'image'
}

export interface Message {
	readonly role: 'user' | 'assistant' | 'system'
	readonly content: Array<TextBlock | ImageBlock>
}

export type SendRequest = (messages: readonly Message[]) => AsyncGenerator<string, void, unknown>

export interface Vendor {
	readonly name: string
	readonly defaultOptions: BaseOptions
	readonly sendRequestFunc: (options: BaseOptions) => SendRequest
	readonly models: string[]
	readonly websiteToObtainKey: string
}
export interface BaseOptions {
	apiKey: string
	baseURL: string
	model: string
	parameters: Record<string, unknown>
}

export interface ProviderSettings {
	tag: string
	readonly vendor: string
	options: BaseOptions
}

export interface Optional {
	apiSecret: string
	proxyUrl: string
	max_tokens: number
	endpoint: string
}
