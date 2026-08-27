import * as jose from 'jose'
import OpenAI from 'openai'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'
import {
	CALLOUT_BLOCK_END,
	CALLOUT_BLOCK_START,
	bodyParams,
	createThinkTagParser,
	stripStainlessHeaders
} from './utils'

type ZhipuDelta = OpenAI.ChatCompletionChunk.Choice.Delta & {
	reasoning_content?: string
} // hack, the GLM-4.5 and 4.6 thinking models add a reasoning_content field

interface Token {
	id: string
	exp: number
	apiKeySecret: string
}

export interface ZhipuOptions extends BaseOptions {
	token?: Token
	tokenExpireInMinutes: number
	enableWebSearch: boolean
}

const sendRequestFunc = (settings: ZhipuOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, _resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { apiKey, baseURL, model, token: currentToken, tokenExpireInMinutes, enableWebSearch } = options
		const remains = bodyParams(parameters, optionsExcludingParams)
		if (!apiKey) throw new Error(t('API key is required'))
		console.debug('zhipu options', { baseURL, apiKey, model, currentToken, tokenExpireInMinutes, enableWebSearch })

		const { token } = await validOrCreate(currentToken, apiKey, tokenExpireInMinutes)
		settings.token = token

		const client = new OpenAI({
			apiKey: token.id,
			baseURL,
			dangerouslyAllowBrowser: true,
			defaultHeaders: stripStainlessHeaders
		})

		const tools = (enableWebSearch
			? [
					{
						type: 'web_search',
						web_search: {
							enable: true
						}
					}
				]
			: []) as object[] as OpenAI.Chat.Completions.ChatCompletionTool[] // hack, because the zhipu-ai function call type definition is different from openai's type definition

		const stream = await client.chat.completions.create(
			{
				model,
				messages,
				stream: true,
				tools: tools,
				...remains
			},
			{
				signal: controller.signal
			}
		)

		// Zhipu carries thinking two different ways depending on the model, and until
		// now neither reached the note. GLM-4.5 and 4.6 stream it in
		// `reasoning_content`, which this loop used to discard outright — asking
		// glm-4.6 for a digit meant eighteen seconds of silence and then "2". GLM-Z1
		// instead marks it with `<think>` tags inside `content`, which arrived as
		// plain text with no callout around it. Both end up in the same collapsed
		// quote block now.
		const thinkTags = createThinkTagParser()
		let startReasoning = false

		for await (const part of stream) {
			const delta = part.choices[0]?.delta as ZhipuDelta
			const reasonContent = delta?.reasoning_content

			if (reasonContent) {
				const prefix = !startReasoning ? ((startReasoning = true), CALLOUT_BLOCK_START) : ''
				yield prefix + reasonContent.replace(/\n/g, '\n> ') // Each line of the callout needs to have '>' at the beginning
				continue
			}

			if (delta?.content) {
				const prefix = startReasoning ? ((startReasoning = false), CALLOUT_BLOCK_END) : ''
				const text = thinkTags.push(delta.content)
				if (prefix || text) yield prefix + text
			}
		}

		// The buffer holds back anything that might still have become a tag.
		const tail = thinkTags.flush()
		if (tail) yield tail
	}

const createToken = async (apiKeySecret: string, expireInMinutes: number) => {
	const [apiKey, apiSecret] = apiKeySecret.split('.')
	if (!apiKey || !apiSecret) throw new Error('Invalid API key secret, must be in the format "apiKey.apiSecret"')
	const now = Date.now()
	const payload = {
		api_key: apiKey,
		exp: now + expireInMinutes * 60 * 1000,
		timestamp: now
	}
	const encoded = await new jose.SignJWT({ ...payload })
		.setProtectedHeader({ alg: 'HS256', sign_type: 'SIGN' })
		.sign(new TextEncoder().encode(apiSecret))
	return {
		id: encoded,
		exp: payload.exp,
		apiKeySecret: apiKeySecret
	}
}

/**
 * Validates the current token or creates a new one if it is invalid or expired.
 * @param currentToken - The current token to validate.
 * @param apiKeySecret - The API key secret used for token validation.
 * @param expireInMinutes - The expiration time for the new token in minutes.
 * @returns An object containing the validity status and the token.
 */
const validOrCreate = async (currentToken: Token | undefined, apiKeySecret: string, expireInMinutes: number) => {
	const now = Date.now()
	if (currentToken && currentToken.apiKeySecret === apiKeySecret && currentToken.exp > now + 3 * 60 * 1000) {
		return {
			isValid: true,
			token: currentToken
		}
	}
	const newToken = await createToken(apiKeySecret, expireInMinutes)
	console.debug('create new token', newToken)
	return {
		isValid: false,
		token: newToken
	}
}

const models = ['glm-4-plus', 'glm-4-air', 'glm-4-airx', 'glm-4-long', 'glm-4-flash', 'glm-4-flashx']

export const zhipuVendor: Vendor = {
	name: 'Zhipu',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://open.bigmodel.cn/api/paas/v4/',
		model: models[0],
		tokenExpireInMinutes: 60 * 24,
		enableWebSearch: false,
		parameters: {}
	} as ZhipuOptions,
	sendRequestFunc,
	models,
	websiteToObtainKey: 'https://open.bigmodel.cn/',
	capabilities: ['Text Generation', 'Web Search']
}
