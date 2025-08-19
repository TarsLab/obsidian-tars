import { Content, GoogleGenerativeAI } from '@google/generative-ai'
import { Capabilities } from 'src/environment'
import { t } from 'src/lang/helper'
import { BaseOptions, filterToChatMessages, Message, SendRequest, Vendor } from '.'

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, _capabilities: Capabilities) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { apiKey, baseURL: baseUrl, model } = options
		if (!apiKey) throw new Error(t('API key is required'))

		const msgs = filterToChatMessages(messages)
		const [system_msg, messagesWithoutSys, lastMsg] =
			msgs[0].role === 'system'
				? [msgs[0], msgs.slice(1, -1), msgs[msgs.length - 1]]
				: [null, msgs.slice(0, -1), msgs[msgs.length - 1]]
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
	features: ['Text Generation']
}
