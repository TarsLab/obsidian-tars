import { AzureOpenAI } from 'openai'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'
import { CALLOUT_BLOCK_END, CALLOUT_BLOCK_START, bodyParams, stripStainlessHeaders } from './utils'

interface AzureOptions extends BaseOptions {
	endpoint: string
	apiVersion: string
}

const sendRequestFunc = (settings: AzureOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, _resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters } // 这样的设计，让parameters 可以覆盖掉前面的设置 optionsExcludingParams
		const { apiKey, model, endpoint, apiVersion } = options
		const remains = bodyParams(parameters, optionsExcludingParams)
		if (!apiKey) throw new Error(t('API key is required'))
		if (!model) throw new Error(t('Model is required'))
		// Left empty, the endpoint reaches the SDK, which falls back to
		// `process.env.AZURE_OPENAI_ENDPOINT` without checking that `process`
		// exists. On mobile there is none, so its "Must provide one of…" message
		// arrives as `process is not defined` instead.
		if (!endpoint) throw new Error(t('Endpoint is required'))

		const client = new AzureOpenAI({
			endpoint,
			apiKey,
			apiVersion,
			deployment: model,
			dangerouslyAllowBrowser: true,
			defaultHeaders: stripStainlessHeaders
		})

		// 添加系统提示，要求模型在每次输出前加入 <think>，解决 Azure DeepSeek-R1 不推理的问题
		messages = [
			{ role: 'system', content: `Initiate your response with "<think>\n嗯" at the beginning of every output.` },
			...messages
		]

		const stream = await client.chat.completions.create(
			{
				model,
				messages,
				stream: true,
				...remains
			},
			{
				signal: controller.signal
			}
		)

		let isReasoning = false
		let thinkBegin = false // 过滤掉重复的 <think>
		let thinkEnd = false // 过滤掉重复的 </think>

		for await (const part of stream) {
			if (part.usage && part.usage.prompt_tokens && part.usage.completion_tokens)
				console.debug(`Prompt tokens: ${part.usage.prompt_tokens}, completion tokens: ${part.usage.completion_tokens}`)

			const text = part.choices[0]?.delta?.content
			if (!text) continue

			if (text === '<think>') {
				if (thinkBegin) continue
				isReasoning = true
				thinkBegin = true
				yield CALLOUT_BLOCK_START
				continue
			}

			if (text === '</think>') {
				if (thinkEnd) continue
				isReasoning = false
				thinkEnd = true
				yield CALLOUT_BLOCK_END
				continue
			}

			yield isReasoning
				? text.replace(/\n/g, '\n> ') // callout的每行前面都要加上 >
				: text
		}
	}

export const azureVendor: Vendor = {
	name: 'Azure',
	defaultOptions: {
		apiKey: '',
		baseURL: '',
		model: '',
		endpoint: '',
		apiVersion: '',
		parameters: {}
	} as AzureOptions,
	sendRequestFunc,
	// Azure addresses a deployment, not a model: the name is whatever it was given
	// in the portal, so no list can be offered — neither a curated one nor a
	// fetched one, since listing deployments needs a management credential rather
	// than the inference key.
	models: [],
	websiteToObtainKey: 'https://portal.azure.com',
	capabilities: ['Text Generation', 'Reasoning']
}
