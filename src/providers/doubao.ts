import { Notice, requestUrl } from 'obsidian'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[], _controller: AbortController, _resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { apiKey, baseURL, model, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))
		if (!model) throw new Error(t('Model is required'))

		const data = {
			model,
			messages,
			stream: false,
			...remains
		}

		new Notice(t('This is a non-streaming request, please wait...'), 5 * 1000)

		const response = await requestUrl({
			url: baseURL,
			method: 'POST',
			body: JSON.stringify(data),
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			}
		})

		yield response.json.choices[0].message.content
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
	websiteToObtainKey: 'https://www.volcengine.com',
	capabilities: ['Text Generation']
}
