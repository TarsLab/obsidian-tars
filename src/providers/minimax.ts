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
				// Only the two fields the API knows about: a Message also carries the
				// note's embeds, and this vendor has no use for them.
				messages: messages.map(({ role, content }) => ({ role, content })),
				stream: true,
				...remains
			},
			{ signal: controller.signal }
		)

		// Which way MiniMax reports its thinking depends on the `reasoning_split`
		// parameter: set, it arrives in `reasoning_content`; unset, which is the
		// default, the model leaves `<think>` tags in `content`. Clients that read
		// only one of the two are why MiniMax-M2.7 has an open complaint about
		// thinking tags showing up mid-answer.
		yield* streamWithThinking(stream)
	}

export const miniMaxVendor: Vendor = {
	name: 'MiniMax',
	defaultOptions: {
		apiKey: '',
		// The mainland endpoint. The international platform is api.minimax.io/v1 and
		// issues its own keys — a key from one is rejected by the other, so an
		// overseas account has to change this in settings.
		baseURL: 'https://api.minimaxi.com/v1',
		model: '',
		parameters: {}
	},
	sendRequestFunc,
	models: [],
	websiteToObtainKey: 'https://platform.minimaxi.com/',
	capabilities: ['Text Generation', 'Reasoning']
}
