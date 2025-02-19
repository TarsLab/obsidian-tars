import { AzureOpenAI } from 'openai'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, SendRequest, Vendor } from '.'

interface AzureOptions extends BaseOptions {
	endpoint: string
	apiVersion: string
}

const CALLOUT_BLOCK_START = '\n\n> [!quote]-  \n> ' // TODO, 后续可以考虑增加配置项，配置 callout 类型，比如 quote, note
const CALLOUT_BLOCK_END = '' // '\n\n'

const sendRequestFunc = (settings: AzureOptions): SendRequest =>
	async function* (messages: Message[]) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters } // 这样的设计，让parameters 可以覆盖掉前面的设置 optionsExcludingParams
		const { apiKey, model, endpoint, apiVersion, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))

		const client = new AzureOpenAI({ endpoint, apiKey, apiVersion, deployment: model, dangerouslyAllowBrowser: true })

		// 添加系统提示，要求模型在每次输出前加入 <think>，解决 Azure DeepSeek-R1 不推理的问题
		messages = [
			{ role: 'system', content: `Initiate your response with "<think>\n嗯" at the beginning of every output.` },
			...messages
		]

		const stream = await client.chat.completions.create({
			model,
			messages,
			stream: true,
			...remains
		})

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

const models = ['o3-mini', 'deepseek-r1', 'phi-4', 'o1', 'o1-mini', 'gpt-4o', 'gpt-4o-mini']

export const azureVendor: Vendor = {
	name: 'Azure',
	defaultOptions: {
		apiKey: '',
		baseURL: '',
		model: models[0],
		endpoint: '',
		apiVersion: '',
		parameters: {}
	} as AzureOptions,
	sendRequestFunc,
	models,
	websiteToObtainKey: 'https://portal.azure.com'
}
