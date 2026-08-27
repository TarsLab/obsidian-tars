import { Content, GoogleGenerativeAI, ModelParams } from '@google/generative-ai'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'
import { bodyParams } from './utils'

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, _resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { apiKey, baseURL: baseUrl, model } = options
		const remains = bodyParams(parameters, optionsExcludingParams)
		if (!apiKey) throw new Error(t('API key is required'))
		if (!model) throw new Error(t('Model is required'))

		const [system_msg, messagesWithoutSys, lastMsg] =
			messages[0].role === 'system'
				? [messages[0], messages.slice(1, -1), messages[messages.length - 1]]
				: [null, messages.slice(0, -1), messages[messages.length - 1]]
		const systemInstruction = system_msg?.content
		const history: Content[] = messagesWithoutSys.map((m) => ({
			role: m.role === 'assistant' ? 'model' : m.role,
			parts: [{ text: m.content }]
		}))

		// Gemini takes no flat request body: the generation knobs live under
		// `generationConfig`, and only safetySettings, tools, toolConfig and
		// cachedContent sit beside them. "Override input parameters" used to reach
		// this vendor and go nowhere, so route each key where the SDK reads it —
		// spreading a temperature at the top level would be ignored just as
		// silently. The cast is the price of letting a user hand-write JSON, which
		// is what that setting is for.
		const { safetySettings, tools, toolConfig, cachedContent, ...generationConfig } = remains
		const genAI = new GoogleGenerativeAI(apiKey)
		const genModel = genAI.getGenerativeModel(
			{
				model,
				systemInstruction,
				...(safetySettings !== undefined && { safetySettings }),
				...(tools !== undefined && { tools }),
				...(toolConfig !== undefined && { toolConfig }),
				...(cachedContent !== undefined && { cachedContent }),
				...(Object.keys(generationConfig).length > 0 && { generationConfig })
			} as ModelParams,
			{ baseUrl }
		)
		const chat = genModel.startChat({ history })

		const result = await chat.sendMessageStream(lastMsg.content, { signal: controller.signal })
		for await (const chunk of result.stream) {
			const chunkText = chunk.text()
			// console.debug('chunkText', chunkText)
			yield chunkText
		}
	}

export const geminiVendor: Vendor = {
	name: 'Gemini',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://generativelanguage.googleapis.com',
		model: '',
		parameters: {}
	},
	sendRequestFunc,
	models: [],
	websiteToObtainKey: 'https://makersuite.google.com/app/apikey',
	capabilities: ['Text Generation']
}
