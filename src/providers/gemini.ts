import { type Content, GoogleGenerativeAI } from '@google/generative-ai'
import { createLogger } from '../logger'
import { t } from 'src/lang/helper'
import type { BaseOptions, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'

const logger = createLogger('providers:gemini')

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, _resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const { parameters, mcpManager, mcpExecutor, ...optionsExcludingParams } = settings
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

		// Get MCP tools for Gemini if available (note: Gemini tool calling requires special format)
		// For now, we'll skip Gemini tool integration until we implement proper format conversion
		// TODO: Implement Gemini-specific tool format conversion
		if (mcpManager && mcpExecutor) {
			logger.debug('gemini tool integration not yet implemented; skipping MCP tools')
		}

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
