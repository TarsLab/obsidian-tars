import { Content, GoogleGenerativeAI } from '@google/generative-ai'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, _resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { apiKey, baseURL: baseUrl, model } = options
		if (!apiKey) throw new Error(t('API key is required'))

		const [system_msg, messagesWithoutSys, lastMsg] =
			messages[0].role === 'system'
				? [messages[0], messages.slice(1, -1), messages[messages.length - 1]]
				: [null, messages.slice(0, -1), messages[messages.length - 1]]
		const systemInstruction = system_msg?.content
		const history: Content[] = messagesWithoutSys.map((m) => ({
			role: m.role === 'assistant' ? 'model' : m.role,
			parts: [{ text: m.content }]
		}))

		const genAI = new GoogleGenerativeAI(apiKey)
		const genModel = genAI.getGenerativeModel({ model, systemInstruction }, { baseUrl })
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
		model: 'gemini-1.5-flash',
		parameters: {}
	},
	sendRequestFunc,
	models: [],
	websiteToObtainKey: 'https://makersuite.google.com/app/apikey',
	capabilities: ['Text Generation']
}
