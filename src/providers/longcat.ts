import OpenAI from 'openai'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'
import { bodyParams, streamWithThinking, stripStainlessHeaders } from './utils'

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, _resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { apiKey, baseURL, model } = options
		const remains = bodyParams(parameters, optionsExcludingParams)
		if (!apiKey) throw new Error(t('API key is required'))
		if (!model) throw new Error(t('Model is required'))

		const client = new OpenAI({
			apiKey,
			baseURL,
			dangerouslyAllowBrowser: true,
			defaultHeaders: stripStainlessHeaders
		})

		const stream = await client.chat.completions.create(
			{
				model,
				messages: messages.map(({ role, content }) => ({ role, content })),
				stream: true,
				...remains
			},
			{ signal: controller.signal }
		)

		yield* streamWithThinking(stream)
	}

export const longCatVendor: Vendor = {
	name: 'LongCat',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://api.longcat.chat/openai/v1',
		model: '',
		parameters: {}
	},
	sendRequestFunc,
	models: [],
	websiteToObtainKey: 'https://longcat.chat/platform/',
	capabilities: ['Text Generation', 'Reasoning']
}
