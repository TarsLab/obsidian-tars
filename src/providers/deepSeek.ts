import OpenAI from 'openai'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, Optional, SendRequest, Vendor } from '.'

type DeepSeekOptions = BaseOptions & Pick<Optional, 'reasoningLLMs' | 'ReasoningLLMOptions'>

const models = ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner']

const deepseekDefaultOptions: DeepSeekOptions = {
	apiKey: '',
	baseURL: 'https://api.deepseek.com',
	model: models[0],
	parameters: {},
	reasoningLLMs: ['deepseek-reasoner'],
	ReasoningLLMOptions: {
		expend: false
	}
}

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[]) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { apiKey, baseURL, model, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))

		const client = new OpenAI({
			apiKey,
			baseURL,
			dangerouslyAllowBrowser: true
		})

		const stream = await client.chat.completions.create({
			model,
			messages,
			stream: true,
			...remains
		})

		if (!deepseekDefaultOptions.reasoningLLMs.includes(model)) {
			// 对话模型
			for await (const part of stream) {
				const text = part.choices[0]?.delta?.content
				if (!text) continue
				yield text
			}
		} else {
			let isReasoning = true

			// 推理模型，输出 callout 头部
			if (remains?.ReasoningLLMOptions?.expend)
				yield "\n\n> [!info]+ reasoning content\n> "
			else
				yield "\n\n> [!info]- reasoning content\n> "

			for await (const chunk of stream) {
				if (chunk.choices[0]?.delta?.reasoning_content !== null) {
					const reasoningContent = chunk.choices[0]?.delta?.reasoning_content
					if (!reasoningContent) continue
					for (const char of reasoningContent) {
						yield char === '\n' ? char + '> ' : char
					}
				} else {
					if (isReasoning) {
						isReasoning = false
						yield "\n\n"
					}
					const text = chunk.choices[0]?.delta?.content
					if (!text) continue
					yield text
				}
			}
		}

	}

export const deepSeekVendor: Vendor = {
	name: 'DeepSeek',
	defaultOptions: deepseekDefaultOptions,
	sendRequestFunc,
	models,
	websiteToObtainKey: 'https://platform.deepseek.com'
}
