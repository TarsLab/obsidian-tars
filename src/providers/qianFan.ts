import axios from 'axios'
import { Notice, Platform, requestUrl } from 'obsidian'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, Optional, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'

interface TokenResponse {
	access_token: string
	expires_in: number
}

interface Token {
	accessToken: string
	exp: number
	apiKey: string
	apiSecret: string
}

type QianFanOptions = BaseOptions & Pick<Optional, 'apiSecret'> & { token?: Token }

const createToken = async (apiKey: string, apiSecret: string) => {
	if (!apiKey || !apiSecret) throw new Error('Invalid API key secret')

	const queryParams = {
		grant_type: 'client_credentials',
		client_id: apiKey,
		client_secret: apiSecret
	}
	const queryString = new URLSearchParams(queryParams).toString()
	const res = await requestUrl(`https://aip.baidubce.com/oauth/2.0/token?${queryString}`)
	const result = res.json as TokenResponse

	return {
		accessToken: result.access_token,
		exp: Date.now() + result.expires_in,
		apiKey,
		apiSecret
	} as Token
}

const validOrCreate = async (currentToken: Token | undefined, apiKey: string, apiSecret: string) => {
	const now = Date.now()
	if (
		currentToken &&
		currentToken.apiKey === apiKey &&
		currentToken.apiSecret === apiSecret &&
		currentToken.exp > now + 3 * 60 * 1000
	) {
		return {
			isValid: true,
			token: currentToken
		}
	}
	const newToken = await createToken(apiKey, apiSecret)
	console.debug('create new token', newToken)
	return {
		isValid: false,
		token: newToken
	}
}

const getLines = (buffer: string[], text: string): string[] => {
	const trailingNewline = text.endsWith('\n') || text.endsWith('\r')
	let lines = text.split(/\r\n|[\n\r]/g)

	if (lines.length === 1 && !trailingNewline) {
		buffer.push(lines[0])
		return []
	}
	if (buffer.length > 0) {
		lines = [buffer.join('') + lines[0], ...lines.slice(1)]
		buffer = []
	}
	if (!trailingNewline) {
		buffer = [lines.pop() || '']
	}
	return lines
}

const sendRequestFunc = (settings: QianFanOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, _resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { apiKey, apiSecret, baseURL, model, token: currentToken, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))
		if (!apiSecret) throw new Error(t('API secret is required'))
		if (!model) throw new Error(t('Model is required'))

		const { token } = await validOrCreate(currentToken, apiKey, apiSecret)
		settings.token = token

		if (Platform.isDesktopApp) {
			const data = {
				messages,
				stream: true,
				...remains
			}
			const response = await axios.post(baseURL + `/${model}?access_token=${token.accessToken}`, data, {
				headers: {
					'Content-Type': 'application/json'
				},
				adapter: 'fetch',
				responseType: 'stream',
				withCredentials: false,
				signal: controller.signal
			})

			const buffer: string[] = []
			const decoder = new TextDecoder('utf-8')
			for await (const chunk of response.data) {
				const text = decoder.decode(Buffer.from(chunk))
				const lines = getLines(buffer, text)
				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const rawStr = line.slice('data: '.length)
						const data = JSON.parse(rawStr)
						const content = data.result
						if (content) {
							yield content
						}
					}
				}
			}
		} else {
			const data = {
				messages,
				stream: false,
				...remains
			}

			new Notice(t('This is a non-streaming request, please wait...'), 5 * 1000)

			const response = await requestUrl({
				url: baseURL + `/${model}?access_token=${token.accessToken}`,
				method: 'POST',
				body: JSON.stringify(data),
				headers: {
					'Content-Type': 'application/json'
				}
			})

			console.debug('response', response.json)
			yield response.json.result
		}
	}

const models = [
	'ernie-4.0-8k-latest',
	'ernie-4.0-turbo-8k',
	'ernie-3.5-128k',
	'ernie_speed',
	'ernie-speed-128k',
	'gemma_7b_it',
	'yi_34b_chat',
	'mixtral_8x7b_instruct',
	'llama_2_70b'
]

export const qianFanVendor: Vendor = {
	name: 'QianFan',
	defaultOptions: {
		apiKey: '',
		apiSecret: '',
		baseURL: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat',
		model: models[0],
		parameters: {}
	} as QianFanOptions,
	sendRequestFunc,
	models: models,
	websiteToObtainKey: 'https://qianfan.cloud.baidu.com',
	capabilities: ['Text Generation']
}
