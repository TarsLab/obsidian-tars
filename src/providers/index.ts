export interface Message {
	readonly role: 'user' | 'assistant' | 'system'
	readonly content: string
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

export interface ReasoningLLMOptions {
	expend: boolean
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
	reasoningLLMs: string[]
	ReasoningLLMOptions: ReasoningLLMOptions
}

type CalloutType = 'info' | 'note' 
type CalloutState = '+' | '-' | ''
type ReasoningCalloutParts = {
	header: string
	prefix: string
}

export const createReasoningCallout = (
	type: CalloutType, 
	state: CalloutState
): ReasoningCalloutParts => {
	return {
		header: `> [!${type}]${state} reasoning content`,
		prefix: '> '
	}
}

export const isReasoningCalloutStart = (line: string): boolean => {
	return line.startsWith('> [!') && line.includes('reasoning content')
}