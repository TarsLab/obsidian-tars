import { requestUrl } from 'obsidian'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, SendRequest, Vendor } from '.'

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[]) {
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
		const response = await fetch(baseURL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(data)
		})

		const reader = response.body?.getReader()
		if (!reader) {
			throw new Error('Response body is not readable')
		}
		const decoder = new TextDecoder()
		let buffer = ''

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				// Append new chunk to buffer
				buffer += decoder.decode(value, { stream: true })
				// Process complete lines from buffer
				while (true) {
					const lineEnd = buffer.indexOf('\n')
					if (lineEnd === -1) break
					const line = buffer.slice(0, lineEnd).trim()
					buffer = buffer.slice(lineEnd + 1)
					if (line.startsWith('data: ')) {
						const data = line.slice(6)
						if (data === '[DONE]') break
						try {
							const parsed = JSON.parse(data)
							const content = parsed.choices[0].delta.content
							if (content) {
								yield content
							}
						} catch (e) {
							// Ignore invalid JSON
						}
					}
				}
			}
		} finally {
			reader.cancel()
		}
	}

export const openRouterVendor: Vendor = {
	name: 'OpenRouter',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://openrouter.ai/api/v1/chat/completions',
		model: '',
		parameters: {}
	},
	sendRequestFunc,
	models: [],
	websiteToObtainKey: 'https://openrouter.ai'
}

export const fetchOpenRouterModels = async (): Promise<string[]> => {
	const response = await requestUrl({
		url: 'https://openrouter.ai/api/v1/models',
		headers: {
			'Content-Type': 'application/json'
		}
	})
	const result = response.json
	return result.data.map((model: { id: string }) => model.id)
}
