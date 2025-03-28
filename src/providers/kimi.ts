import axios from 'axios'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, SendRequest, Vendor } from '.'

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { apiKey, baseURL, model, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))
		if (!model) throw new Error(t('Model is required'))

		const data = {
			model,
			messages,
			stream: true,
			...remains
		}
		const response = await axios.post(baseURL, data, {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			adapter: 'fetch',
			responseType: 'stream',
			withCredentials: false,
			signal: controller.signal
		})

		const reader = response.data.pipeThrough(new TextDecoderStream()).getReader()

		let reading = true
		while (reading) {
			const { done, value } = await reader.read()
			if (done) {
				reading = false
				break
			}

			const parts = value.split('\n')

			for (const part of parts) {
				if (part.includes('data: [DONE]')) {
					reading = false
					break
				}

				const trimmedPart = part.replace(/^data: /, '').trim()
				if (trimmedPart) {
					const data = JSON.parse(trimmedPart)
					if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
						const content = data.choices[0].delta.content
						yield content
					}
				}
			}
		}
	}

const models = ['moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k']

export const kimiVendor: Vendor = {
	name: 'Kimi',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://api.moonshot.cn/v1/chat/completions',
		model: models[0],
		parameters: {}
	},
	sendRequestFunc,
	models,
	websiteToObtainKey: 'https://www.moonshot.cn'
}
