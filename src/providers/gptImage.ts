import { Notice } from 'obsidian'
import OpenAI from 'openai'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, SaveAttachmentFunc, SendRequest, Vendor } from '.'

const models = ['gpt-image-1']

export const options = {
	n: 1,
	displayWidth: 400,
	background: ['auto', 'transparent', 'opaque'],
	output_format: ['png', 'jpeg', 'webp'],
	quality: ['auto', 'high', 'medium', 'low'],
	size: ['auto', '1024x1024', '1536x1024', '1024x1536']
}

interface GptImageOptions extends BaseOptions {
	displayWidth: number
	background: 'auto' | 'transparent' | 'opaque'
	n: number
	output_compression: number
	output_format: 'png' | 'jpeg' | 'webp'
	quality: 'auto' | 'high' | 'medium' | 'low'
	size: 'auto' | '1024x1024' | '1536x1024' | '1024x1536'
}

const sendRequestFunc = (settings: GptImageOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, saveAttachment?: SaveAttachmentFunc) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { apiKey, baseURL, model, displayWidth, background, n, output_compression, output_format, quality, size } =
			options
		if (!apiKey) throw new Error(t('API key is required'))
		if (!saveAttachment) throw new Error('saveAttachment is required') // TODO

		const client = new OpenAI({
			apiKey,
			baseURL,
			dangerouslyAllowBrowser: true
		})
		const prompt = messages[0].content.trim()
		if (!prompt) throw new Error('Prompt is required') // TODO 检查是否是单轮对话

		new Notice(t('This is a non-streaming request, please wait...'), 5 * 1000)

		// 生成图片
		const result = await client.images.generate(
			{
				prompt,
				background,
				model,
				size,
				n,
				output_compression,
				output_format,
				quality
			},
			{ signal: controller.signal }
		)

		// 检查是否有结果返回
		if (!result.data || result.data.length === 0) {
			console.error('No image data returned from API')
			return
		}

		const now = new Date()
		const formatTime =
			`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}` +
			`_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`

		for (let i = 0; i < result.data.length; i++) {
			const imageData = result.data[i]
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

			yield `![[${filename}|${displayWidth}]]`
		}
	}

export const gptImageVendor: Vendor = {
	name: 'GptImage',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://api.openai.com/v1',
		model: models[0],
		displayWidth: options.displayWidth,
		background: options.background[0],
		output_compression: 100,
		output_format: options.output_format[0],
		quality: options.quality[0],
		size: options.size[0],
		n: options.n,
		parameters: {}
	} as GptImageOptions,
	sendRequestFunc,
	models,
	websiteToObtainKey: 'https://platform.openai.com/api-keys'
}
