import { Ollama } from 'ollama'
import { BaseOptions, Message, SendRequest, Vendor } from '.'

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[]) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters } // 这样的设计，让parameters 可以覆盖掉前面的设置 optionsExcludingParams
		const { baseURL, model, ...remains } = options

		const ollama = new Ollama({ host: baseURL })
		const response = await ollama.chat({ model, messages, stream: true, ...remains })
		for await (const part of response) {
			console.log(part.message.content)
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
