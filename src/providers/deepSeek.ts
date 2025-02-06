import OpenAI from 'openai'
import { t } from 'src/lang/helper'
import { BaseOptions, CalloutType, Message, ReasoningOptional, SendRequest, Vendor, createReasoningCallout, ReasoningDelta } from '.'
import { Notice } from 'obsidian'

type DeepSeekOptions = BaseOptions & ReasoningOptional

const models = ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner']

const deepseekDefaultOptions: DeepSeekOptions = {
	apiKey: '',
	baseURL: 'https://api.deepseek.com',
	model: models[0],
	parameters: {},
	reasoningLLMs: ['deepseek-reasoner'],
	ReasoningLLMOptions: {
		expendCoT: false,
		calloutType: CalloutType.Note
	}
}

const sendRequestFunc = (settings: DeepSeekOptions): SendRequest =>
	async function* (messages: Message[]) {
		const { parameters, ...optionsExcludingParams } = settings
		const originalModel = optionsExcludingParams.model
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

		const isReasoningLLM = deepseekDefaultOptions.reasoningLLMs.includes(model) || deepseekDefaultOptions.reasoningLLMs.includes(originalModel)
		if (!isReasoningLLM) {
			// 对话模型
			for await (const part of stream) {
				const text = part.choices[0]?.delta?.content
				if (!text) continue
				yield text
			}
		} else {
			let isReasoning = true
			const reasoningCallout = createReasoningCallout(remains?.ReasoningLLMOptions?.calloutType, remains?.ReasoningLLMOptions?.expendCoT ? '+' : '-')

			// 推理模型，输出 callout 头部
			yield '\n\n'
			yield reasoningCallout.header
			yield '\n' + reasoningCallout.prefix

			for await (const chunk of stream) {
				const delta = chunk.choices[0]?.delta as ReasoningDelta
				console.debug('delta', delta)

				if (delta?.reasoning_content !== null) {
					const reasoningContent = delta?.reasoning_content
					if (!reasoningContent) continue
					for (const char of reasoningContent) {
						yield char === '\n' ? char + reasoningCallout.prefix : char
					}
				} else {
					if (isReasoning) {
						isReasoning = false
						yield "\n\n"
					}
					const text = chunk.choices[0]?.delta?.content
					if (text) 
						yield text
				}

				if (chunk.usage && !chunk.usage.prompt_tokens && !chunk.usage.completion_tokens) {
					// 当调用结束切存在 usage 字段时，统计消耗的 token 数量
					const promptToken = chunk.usage?.prompt_tokens
					const completionToken = chunk.usage?.completion_tokens
	
					if (promptToken && completionToken) {
						console.debug('deepseek-R1 promptToken', promptToken)
						console.debug('deepseek-R1 completionToken', completionToken)
						new Notice(t(`Input tokens: `) + promptToken + '\n' + t(`Output tokens: `) + completionToken)
					}
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
