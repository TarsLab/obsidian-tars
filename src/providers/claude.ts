import Anthropic from '@anthropic-ai/sdk'

import { t } from 'src/lang/helper'
import { BaseOptions, Message, SendRequest, Vendor } from '.'

interface ClaudeMessage {
	role: 'user' | 'assistant'
	content: string
}

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (rawMessages: Message[]) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters } // 这样的设计，让parameters 可以覆盖掉前面的设置 optionsExcludingParams
		const { apiKey, baseURL, model, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))

		const messages = rawMessages.filter((m) => m.role === 'user' || m.role == 'assistant') as ClaudeMessage[]
		const client = new Anthropic({
			apiKey,
			baseURL
		})

		const stream = client.messages.stream({
			model,
			messages,
			max_tokens: 1024
			// ...remains
		})

		// for await (const part of stream) {
		// 	const text = part.choices[0]?.delta?.content
		// 	if (!text) continue
		// 	yield text
		// }
		for await (const event of stream) {
			console.log('event', event)
			yield 'todo'
		}
	}

const models = ['claude-3-opus-20240229', 'claude-3-haiku-20240307', 'claude-3-5-sonnet-20240620']

export const claudeVendor: Vendor = {
	name: 'Claude',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://fast.bemore.lol',
		model: models[0],
		parameters: {}
	},
	sendRequestFunc,
	models,
	websiteToObtainKey: ''
}
