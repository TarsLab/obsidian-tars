import { Notice } from 'obsidian'
import OpenAI from 'openai'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, ResolveEmbedAsBinary, SaveAttachment, SendRequest, Vendor } from '.'
import { getMimeTypeFromFilename } from './utils'

const models = ['gpt-image-1']

export const DEFAULT_GPT_IMAGE_OPTIONS = {
	n: 2,
	displayWidth: 400,
	background: 'auto',
	output_format: 'jpeg',
	output_compression: 90,
	quality: 'auto',
	size: 'auto'
}

export interface GptImageOptions extends BaseOptions {
	displayWidth: number
	background: 'auto' | 'transparent' | 'opaque'
	n: number
	output_compression: number
	output_format: 'png' | 'jpeg' | 'webp'
	quality: 'auto' | 'high' | 'medium' | 'low'
	size: 'auto' | '1024x1024' | '1536x1024' | '1024x1536'
}

const sendRequestFunc = (settings: GptImageOptions): SendRequest =>
	async function* (
		messages: Message[],
		controller: AbortController,
		resolveEmbedAsBinary: ResolveEmbedAsBinary,
		saveAttachment?: SaveAttachment
	) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { apiKey, baseURL, model, displayWidth, background, n, output_compression, output_format, quality, size } =
			options
		if (!apiKey) throw new Error(t('API key is required'))
		if (!saveAttachment) throw new Error('saveAttachment is required')

		console.debug('messages:', messages)
		console.debug('options:', options)
		if (messages.length > 1) {
			new Notice(t('Only the last user message is used for image generation. Other messages are ignored.'))
		}
		const lastMsg = messages.last()
		if (!lastMsg) {
			throw new Error('No user message found in the conversation')
		}
		const prompt = lastMsg.content

		const client = new OpenAI({
			apiKey,
			baseURL,
			dangerouslyAllowBrowser: true
		})

		new Notice(t('This is a non-streaming request, please wait...'), 5 * 1000)
		let response = null
		if (lastMsg.embeds && lastMsg.embeds.length > 0) {
			if (lastMsg.embeds.length > 1) {
				new Notice(t('Multiple embeds found, only the first one will be used'))
			}
			const embed = lastMsg.embeds[0]
			const mimeType = getMimeTypeFromFilename(embed.link)
			const supportedMimeTypes = ['image/png', 'image/jpeg', 'image/webp']
			if (!supportedMimeTypes.includes(mimeType)) {
				throw new Error(t('Only PNG, JPEG, and WebP images are supported for editing.'))
			}
			const embedBuffer = await resolveEmbedAsBinary(embed)

			if (!embedBuffer || embedBuffer.byteLength === 0) {
				throw new Error(t('Embed data is empty or invalid'))
			}

			const file = new File([embedBuffer], embed.link, { type: mimeType })
			response = await client.images.edit(
				{
					image: file,
					prompt,
					background,
					model,
					n,
					size,
					quality
				},
				{ signal: controller.signal }
			)
		} else {
			response = await client.images.generate(
				{
					prompt,
					background,
					model,
					size,
					n,
					output_compression: output_format === 'jpeg' || output_format === 'webp' ? output_compression : undefined,
					output_format,
					quality
				},
				{ signal: controller.signal }
			)
		}

		if (!response.data || response.data.length === 0) {
			throw new Error(t('Failed to generate image. no data received from API'))
		}
		yield ' \n'
		const now = new Date()
		const formatTime =
			`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}` +
			`_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`

		for (let i = 0; i < response.data.length; i++) {
			const imageData = response.data[i]
			const imageBase64 = imageData.b64_json
			if (!imageBase64) {
				console.error(`No base64 image data returned for image ${i + 1}`)
				continue
			}
			const imageBuffer = Buffer.from(imageBase64, 'base64')
			const indexFlag = n > 1 ? `-${i + 1}` : ''
			const filename = `gptImage-${formatTime}${indexFlag}.${output_format}`
			console.debug(`Saving image as ${filename}`)
			await saveAttachment(filename, imageBuffer)

			yield `![[${filename}|${displayWidth}]]\n\n`
		}
	}

export const gptImageVendor: Vendor = {
	name: 'GptImage',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://api.openai.com/v1',
		model: models[0],
		n: DEFAULT_GPT_IMAGE_OPTIONS.n,
		displayWidth: DEFAULT_GPT_IMAGE_OPTIONS.displayWidth,
		background: DEFAULT_GPT_IMAGE_OPTIONS.background,
		output_compression: DEFAULT_GPT_IMAGE_OPTIONS.output_compression,
		output_format: DEFAULT_GPT_IMAGE_OPTIONS.output_format,
		quality: DEFAULT_GPT_IMAGE_OPTIONS.quality,
		size: DEFAULT_GPT_IMAGE_OPTIONS.size,
		parameters: {}
	} as GptImageOptions,
	sendRequestFunc,
	models,
	websiteToObtainKey: 'https://platform.openai.com/api-keys',
	capabilities: ['Image Generation', 'Image Editing']
}
