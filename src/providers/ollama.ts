import { Ollama } from 'ollama/browser'
import { BaseOptions, Message, SendRequest, Vendor } from '.'

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[]) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters } // This design allows parameters to override the previous optionsExcludingParams settings
		const { baseURL, model, ...remains } = options

		const ollama = new Ollama({ host: baseURL })
		const response = await ollama.chat({ model, messages, stream: true, ...remains })
		for await (const part of response) {
			yield part.message.content
		}
	}

export const ollamaVendor: Vendor = {
	name: 'Ollama',
	defaultOptions: {
		apiKey: '',
		baseURL: 'http://127.0.0.1:11434',
		model: 'llama3.1',
		parameters: {}
	},
	sendRequestFunc,
	models: [],
	websiteToObtainKey: 'https://ollama.com'
}
