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
	expendCoT: boolean
	calloutType: CalloutType
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

export interface ReasoningOptional {
	reasoningLLMs: string[]
	ReasoningLLMOptions: ReasoningLLMOptions
}

export enum CalloutType {
	Info = 'info',
	Note = 'note'
}
export type CalloutState = '+' | '-' | ''
export type ReasoningCalloutParts = {
	header: string
	prefix: string
}
export const CALLOUT_OPTIONS = Object.values(CalloutType)

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