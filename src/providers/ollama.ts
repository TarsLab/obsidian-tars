import { Ollama } from 'ollama/browser'
import { BaseOptions, Message, SendRequest, Vendor } from '.'

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters } // 这样的设计，让parameters 可以覆盖掉前面的设置 optionsExcludingParams
		const { baseURL, model, ...remains } = options

		const ollama = new Ollama({ host: baseURL })
		const response = await ollama.chat({ model, messages, stream: true, ...remains })
		for await (const part of response) {
			if (controller.signal.aborted) {
				ollama.abort()
				break
			}
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
