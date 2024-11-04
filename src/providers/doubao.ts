import fetch from 'node-fetch'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, SendRequest, Vendor } from '.'

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[]) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters } // 这样的设计，让parameters 可以覆盖掉前面的设置 optionsExcludingParams
		const { apiKey, baseURL, model, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))
		if (!model) throw new Error(t('Model is required'))

		const data = {
			model,
			messages,
			stream: true,
			...remains
		}
		const response = await fetch(baseURL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(data)
		})

		if (!response || !response.body) {
			throw new Error('No response')
		}
		if (!response.ok) {
			console.error('response', response)
			throw new Error(`Unexpected response status: ${response.status} ${response.statusText}`)
		}
		const decoder = new TextDecoder('utf-8')
		for await (const chunk of response.body) {
			const lines = decoder.decode(Buffer.from(chunk))
			for (const line of lines.split('\n')) {
				if (line.startsWith('{"error"')) {
					const data = JSON.parse(line)
					throw new Error(data.error.message)
				}
				if (line.startsWith('data: ')) {
					const rawStr = line.slice('data: '.length)
					if (rawStr.startsWith('[DONE]')) break
					const data = JSON.parse(rawStr)
					const content = data.choices[0].delta.content
					if (content) {
						yield content
					}
				}
			}
		}
	}

export const doubaoVendor: Vendor = {
	name: 'Doubao',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
		model: '',
		parameters: {}
	},
	sendRequestFunc,
	models: [],
	websiteToObtainKey: 'https://www.volcengine.com'
}
