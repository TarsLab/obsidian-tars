import OpenAI from 'openai'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, SendRequest, Vendor } from '.'

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[]) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { apiKey, baseURL, model, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))

		const client = new OpenAI({
			apiKey,
			baseURL,
			dangerouslyAllowBrowser: true
		})

		const stream = await client.chat.completions.create({
			model,
			messages,
			stream: true,
			...remains
		})

		for await (const part of stream) {
			const text = part.choices[0]?.delta?.content
			if (!text) continue
			yield text
		}
	}

const models = ['deepseek-chat', 'deepseek-coder']

export const deepSeekVendor: Vendor = {
	name: 'DeepSeek',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://api.deepseek.com',
		model: models[0],
		parameters: {}
	},
	sendRequestFunc,
	models,
	websiteToObtainKey: 'https://platform.deepseek.com'
}
