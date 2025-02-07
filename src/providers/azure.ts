import { AzureOpenAI } from 'openai'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, SendRequest, Vendor } from '.'

interface AzureOptions extends BaseOptions {
	endpoint: string
}

const sendRequestFunc = (settings: AzureOptions): SendRequest =>
	async function* (messages: Message[]) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters } // 这样的设计，让parameters 可以覆盖掉前面的设置 optionsExcludingParams
		const { apiKey, model, endpoint, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))

		const apiVersion = '2024-06-01'
		const deployment = model

		const client = new AzureOpenAI({ endpoint, apiKey, apiVersion, deployment, dangerouslyAllowBrowser: true })

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

const models = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'gpt-3.5-turbo-16k']

export const azureVendor: Vendor = {
	name: 'Azure',
	defaultOptions: {
		apiKey: '',
		baseURL: '',
		model: models[0],
		endpoint: '',
		parameters: {}
	} as AzureOptions,
	sendRequestFunc,
	models,
	websiteToObtainKey: 'https://portal.azure.com'
}
