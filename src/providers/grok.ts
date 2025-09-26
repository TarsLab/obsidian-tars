import axios from 'axios'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'
import { CALLOUT_BLOCK_END, CALLOUT_BLOCK_START, convertEmbedToImageUrl } from './utils'

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { apiKey, baseURL, model, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))
		if (!model) throw new Error(t('Model is required'))

		const formattedMessages = await Promise.all(messages.map((msg) => formatMsg(msg, resolveEmbedAsBinary)))
		const data = {
			model,
			messages: formattedMessages,
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
		let startReasoning = false
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
					if (data.choices && data.choices[0].delta) {
						const delta = data.choices[0].delta
						const reasonContent = delta.reasoning_content

						if (reasonContent) {
							const prefix = !startReasoning ? ((startReasoning = true), CALLOUT_BLOCK_START) : ''
							yield prefix + reasonContent.replace(/\n/g, '\n> ') // Each line of the callout needs to have '>' at the beginning
						} else {
							const prefix = startReasoning ? ((startReasoning = false), CALLOUT_BLOCK_END) : ''
							if (delta.content) {
								yield prefix + delta.content
							}
						}
					}
				}
			}
		}
	}

type ContentItem =
	| {
			type: 'image_url'
			image_url: {
				url: string
			}
	  }
	| { type: 'text'; text: string }

const formatMsg = async (msg: Message, resolveEmbedAsBinary: ResolveEmbedAsBinary) => {
	const content: ContentItem[] = msg.embeds
		? await Promise.all(msg.embeds.map((embed) => convertEmbedToImageUrl(embed, resolveEmbedAsBinary)))
		: []

	// If there are no embeds/images, return a simple text message format
	if (content.length === 0) {
		return {
			role: msg.role,
			content: msg.content
		}
	}
	if (msg.content.trim()) {
		content.push({
			type: 'text' as const,
			text: msg.content
		})
	}
	return {
		role: msg.role,
		content
	}
}

export const grokVendor: Vendor = {
	name: 'Grok',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://api.x.ai/v1/chat/completions',
		model: '',
		parameters: {}
	},
	sendRequestFunc,
	models: [],
	websiteToObtainKey: 'https://x.ai',
	capabilities: ['Text Generation', 'Reasoning', 'Image Vision']
}
