import fetch from 'node-fetch'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, SendRequest, Vendor } from '.'

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[]) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters } // 这样的设计，让parameters 可以覆盖掉前面的设置 optionsExcludingParams
		const { apiKey, baseURL, model, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))

		const data = {
			model,
			input: {
				messages
			},
			parameters: {
				incremental_output: 'true'
			},
			...remains
		}
		const response = await fetch(baseURL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'X-DashScope-SSE': 'enable'
			},
			body: JSON.stringify(data)
		})

		if (!response || !response.body) {
			throw new Error('No response')
		}
		const decoder = new TextDecoder('utf-8')
		let isError = false
		let _statusCode = 500
		for await (const chunk of response.body) {
			const lines = decoder.decode(Buffer.from(chunk))
			for (const line of lines.split('\n')) {
				if (line.startsWith('event:error')) {
					isError = true
				} else if (line.startsWith('status:')) {
					_statusCode = parseInt(line.slice('status:'.length).trim(), 10)
				} else if (line.startsWith('data:')) {
					const data = line.slice('data:'.length)
					const msg = JSON.parse(data)
					const text = msg.output.text
					yield text
					if (isError) break
				}
			}
		}
	}

const models = ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-max-longcontext']

export const qwenVendor: Vendor = {
	name: 'Qwen',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
		model: models[0],
		parameters: {}
	},
	sendRequestFunc,
	models,
	websiteToObtainKey: 'https://dashscope.console.aliyun.com'
}
