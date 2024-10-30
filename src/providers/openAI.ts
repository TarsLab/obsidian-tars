import { HttpsProxyAgent } from 'https-proxy-agent'
import OpenAI from 'openai'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, SendRequest, Vendor } from '.'

type OpenAIOptions = BaseOptions & { proxyUrl?: string }

const sendRequestFunc = (settings: OpenAIOptions): SendRequest =>
	async function* (messages: Message[]) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters } // 这样的设计，让parameters 可以覆盖掉前面的设置 optionsExcludingParams
		const { apiKey, baseURL, model, proxyUrl, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))

		const client = new OpenAI({
			apiKey,
			baseURL,
			dangerouslyAllowBrowser: true,
			httpAgent: proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined
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

const models = ['gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-4-32k', 'gpt-3.5-turbo', 'gpt-3.5-turbo-16k']

export const openAIVendor: Vendor = {
	name: 'OpenAI',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://api.openai.com/v1',
		model: models[0],
		proxyUrl: '',
		parameters: {}
	} as OpenAIOptions,
	sendRequestFunc,
	models,
	websiteToObtainKey: 'https://platform.openai.com/api-keys'
}
