import { requestUrl } from 'obsidian'
import OpenAI from 'openai'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, SendRequest, Vendor } from '.'

const CALLOUT_BLOCK_START = '\n\n> [!quote]-  \n> '
const CALLOUT_BLOCK_END = '\n\n'

type DeepSeekDelta = OpenAI.ChatCompletionChunk.Choice.Delta & {
	reasoning_content?: string
} // hack, deepseek-reasoner added a reasoning_content field

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { apiKey, baseURL, model, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))

		const client = new OpenAI({
			apiKey,
			baseURL,
			dangerouslyAllowBrowser: true
		})

		const stream = await client.chat.completions.create(
			{
				model,
				messages,
				stream: true,
				...remains
			},
			{ signal: controller.signal }
		)

		let startReasoning = false
		for await (const part of stream) {
			const delta = part.choices[0]?.delta as DeepSeekDelta
			const reasonContent = delta?.reasoning_content

			if (reasonContent) {
				const prefix = !startReasoning ? ((startReasoning = true), CALLOUT_BLOCK_START) : ''
				yield prefix + reasonContent.replace(/\n/g, '\n> ') // Each line of the callout needs to have '>' at the beginning
			} else {
				const prefix = startReasoning ? ((startReasoning = false), CALLOUT_BLOCK_END) : ''
				if (delta?.content) yield prefix + delta?.content
			}
		}
	}

export const siliconFlowVendor: Vendor = {
	name: 'SiliconFlow',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://api.siliconflow.cn/v1',
		model: '',
		parameters: {}
	},
	sendRequestFunc,
	models: [],
	websiteToObtainKey: 'https://siliconflow.cn'
}

export const fetchModels = async (apiKey: string): Promise<string[]> => {
	const response = await requestUrl({
		url: 'https://api.siliconflow.cn/v1/models?type=text&sub_type=chat',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		}
	})
	const result = response.json
	return result.data.map((model: { id: string }) => model.id)
}
