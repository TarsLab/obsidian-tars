import { EmbedCache } from 'obsidian'
import { t } from 'src/lang/helper'
import { Capability, ResolveEmbedAsBinary } from '.'

/**
 * Headers that unset the OpenAI SDK's telemetry, for its `defaultHeaders` option.
 *
 * The SDK stamps `X-Stainless-*` onto every request. Nothing needs them, but they
 * join the CORS preflight, and a provider whose `Access-Control-Allow-Headers` is
 * a fixed allowlist rejects the whole request for carrying them. ModelScope does
 * (issue #108) and so does Kimi — which is the real reason `kimi.ts` reaches for
 * axios rather than this SDK, since axios never sent them in the first place.
 *
 * Nothing in the failure names a header: it arrives as a bare "Failed to fetch".
 *
 * An explicit null unsets a default header, and the SDK merges `defaultHeaders`
 * after its own, so this also clears the per-request `X-Stainless-Retry-Count`
 * and `X-Stainless-Timeout`. The last three below belong to polling helpers this
 * plugin does not call; they are listed so the set stays complete.
 *
 * `test/smoke`'s cors() is what tells you a provider needs this: it is the one
 * that fails only in the `fetch+stainless` column.
 */
/**
 * The extra parameters a provider should put in its request body.
 *
 * `parameters` is the only user-declared input to a request body. Everything else
 * stored on a provider is plugin state: an API key, a cached token, a UI
 * preference, or a field left behind by a feature that no longer exists. The
 * older idiom took the request body from whatever remained of the settings after
 * destructuring, which sent all of that to the API — a `proxyUrl: ''` from a
 * removed feature is enough to earn a `400 Unrecognized request argument
 * supplied: proxyUrl` from a backend that validates its input.
 *
 * Keys that name a provider setting are dropped even when they arrive through
 * `parameters`, since there they are overriding configuration rather than adding
 * to the body — which is what putting `model` in `parameters` has always meant.
 * Passing the settings object rather than a list keeps the two from drifting.
 */
export const bodyParams = (parameters: Record<string, unknown>, providerSettings: object): Record<string, unknown> =>
	Object.fromEntries(Object.entries(parameters ?? {}).filter(([key]) => !Object.hasOwn(providerSettings, key)))

export const stripStainlessHeaders: Record<string, null> = {
	'x-stainless-arch': null,
	'x-stainless-custom-poll-interval': null,
	'x-stainless-helper-method': null,
	'x-stainless-lang': null,
	'x-stainless-os': null,
	'x-stainless-package-version': null,
	'x-stainless-poll-helper': null,
	'x-stainless-retry-count': null,
	'x-stainless-runtime': null,
	'x-stainless-runtime-version': null,
	'x-stainless-timeout': null
}

export const getMimeTypeFromFilename = (filename: string) => {
	const extension = filename.split('.').pop()?.toLowerCase() || ''

	const mimeTypes: Record<string, string> = {
		png: 'image/png',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		gif: 'image/gif',
		webp: 'image/webp',
		svg: 'image/svg+xml',
		bmp: 'image/bmp',
		ico: 'image/x-icon',

		pdf: 'application/pdf',
		doc: 'application/msword',
		docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		xls: 'application/vnd.ms-excel',
		xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		ppt: 'application/vnd.ms-powerpoint',
		pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

		txt: 'text/plain',
		html: 'text/html',
		css: 'text/css',
		js: 'application/javascript',
		json: 'application/json',
		xml: 'application/xml',
		md: 'text/markdown',

		mp3: 'audio/mpeg',
		wav: 'audio/wav',
		ogg: 'audio/ogg',
		flac: 'audio/flac',
		m4a: 'audio/mp4',

		mp4: 'video/mp4',
		avi: 'video/x-msvideo',
		mov: 'video/quicktime',
		wmv: 'video/x-ms-wmv',
		webm: 'video/webm'
	}

	return mimeTypes[extension] || 'application/octet-stream'
}

export const CALLOUT_BLOCK_START = ' \n\n> [!quote]-  \n> '
export const CALLOUT_BLOCK_END = '\n\n'

export const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
	let binary = ''
	const bytes = new Uint8Array(buffer)
	const len = bytes.byteLength
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i])
	}
	return window.btoa(binary)
}

export const convertEmbedToImageUrl = async (embed: EmbedCache, resolveEmbedAsBinary: ResolveEmbedAsBinary) => {
	const mimeType = getMimeTypeFromFilename(embed.link)

	if (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mimeType) === false) {
		throw new Error(t('Only PNG, JPEG, GIF, and WebP images are supported.'))
	}

	const embedBuffer = await resolveEmbedAsBinary(embed)
	const base64Data = arrayBufferToBase64(embedBuffer)
	return {
		type: 'image_url' as const,
		image_url: {
			url: `data:${mimeType};base64,${base64Data}`
		}
	}
}

export const getCapabilityEmoji = (capability: Capability): string => {
	switch (capability) {
		case 'Text Generation':
			return '✍️'
		case 'Image Vision':
			return '👁️'
		case 'PDF Vision':
			return '📄'
		case 'Image Generation':
			return '🎨'
		case 'Image Editing':
			return '✏️'
		case 'Web Search':
			return '🔍'
		case 'Reasoning':
			return '🧠'
	}
}
