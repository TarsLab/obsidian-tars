import { HttpsProxyAgent } from 'https-proxy-agent'
import { t } from 'src/lang/helper'
import fetch from 'node-fetch'
import { BaseOptions, Message, SendRequest, Vendor, Optional } from '.'

type ClaudeOptions = BaseOptions & Pick<Optional, 'max_tokens' | 'proxyUrl'>

const sendRequestFunc = (settings: ClaudeOptions): SendRequest =>
	async function* (messages: Message[]) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters } // 这样的设计，让parameters 可以覆盖掉前面的设置 optionsExcludingParams
		const { apiKey, baseURL, model, max_tokens, proxyUrl, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))

		const [system_msg, messagesWithoutSys] =
			messages[0].role === 'system' ? [messages[0], messages.slice(1)] : [null, messages]
		const headers = {
			'Content-Type': 'application/json',
			'anthropic-version': '2023-06-01',
			'X-Api-Key': apiKey
		}
		const body = {
			model,
			system: system_msg?.content,
			max_tokens,
			messages: messagesWithoutSys,
			stream: true,
			...remains
		}
		console.debug('proxyUrl', proxyUrl)
		console.debug('claude api body', JSON.stringify(body))
		const response = await fetch(baseURL, {
			method: 'POST',
			headers,
			body: JSON.stringify(body),
			agent: proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined
		})

		if (!response || !response.body) {
			throw new Error('No response')
		}

		const decoder = new TextDecoder('utf-8')
		// 参考 https://docs.anthropic.com/en/api/messages-streaming
		for await (const chunk of response.body) {
			const lines = decoder.decode(Buffer.from(chunk))
			// console.debug('lines', lines)
			const [firstLine, secondLine, _] = lines.split('\n')
			if (!firstLine.startsWith('event: ')) {
				// {"type":"error","error":{"type":"invalid_request_error","message":"max_tokens: 8192 > 4096, which is the maximum allowed number of output tokens for claude-3-opus-20240229"}}
				throw new Error(lines)
			}

			const event = firstLine.slice('event: '.length).trim()
			const dataStr = secondLine.slice('data:'.length)
			const data = JSON.parse(dataStr)
			switch (event) {
				case 'content_block_delta':
					yield data.delta.text
					break
				case 'message_delta':
					if (data.delta.stop_reason !== 'end_turn') {
						throw new Error(`Unexpected stop reason: ${data.delta.stop_reason}`)
					}
					break
				case 'error':
					throw new Error(data.error.message)
			}
		}
	}

const models = ['claude-3-opus-20240229', 'claude-3-haiku-20240307', 'claude-3-5-sonnet-20240620']

export const claudeVendor: Vendor = {
	name: 'Claude',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://api.anthropic.com/v1/messages',
		model: models[0],
		max_tokens: 1024,
		proxyUrl: '',
		parameters: {}
	} as ClaudeOptions,
	sendRequestFunc,
	models,
	websiteToObtainKey: 'https://console.anthropic.com'
}
