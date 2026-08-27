import type OpenAI from 'openai'
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

const THINK_OPEN = '<think>'
const THINK_CLOSE = '</think>'

/** Length of the longest suffix of `text` that could still grow into `tag`. */
const partialTagSuffix = (text: string, tag: string) => {
	for (let n = Math.min(text.length, tag.length - 1); n > 0; n--) {
		if (tag.startsWith(text.slice(-n))) return n
	}
	return 0
}

/** Inside a callout every line needs its own '>', including ones the model wraps. */
const quoteLines = (text: string, inside: boolean) => (inside ? text.replace(/\n/g, '\n> ') : text)

/**
 * Turns a content stream that marks its thinking with `<think>` tags into one
 * where the thinking sits in a collapsed callout.
 *
 * The tags cannot be recognised a chunk at a time. GLM-Z1 streams `<think>` as
 * `'<th'`, `'ink'`, `'>\nOkay'` — the tag spans three chunks and its last
 * character arrives fused to the first word of the thinking. Comparing a chunk
 * against `'<think>'` finds nothing, which is why such a model's thinking ends up
 * rendered as ordinary text.
 *
 * Hence the buffer: hold back whatever trailing text could still turn out to be
 * the beginning of a tag, and release it once enough has arrived to decide.
 * `flush()` empties that buffer when the stream ends, and closes the callout if
 * the model never emitted its `</think>`.
 */
export const createThinkTagParser = () => {
	let buffer = ''
	let thinking = false

	return {
		push(chunk: string): string {
			buffer += chunk
			let out = ''

			for (;;) {
				const tag = thinking ? THINK_CLOSE : THINK_OPEN
				const at = buffer.indexOf(tag)
				if (at === -1) break
				// Text before the tag still belongs to the state being left.
				out += quoteLines(buffer.slice(0, at), thinking)
				buffer = buffer.slice(at + tag.length)
				thinking = !thinking
				out += thinking ? CALLOUT_BLOCK_START : CALLOUT_BLOCK_END
			}

			const held = partialTagSuffix(buffer, thinking ? THINK_CLOSE : THINK_OPEN)
			const ready = buffer.slice(0, buffer.length - held)
			buffer = buffer.slice(buffer.length - held)
			return out + quoteLines(ready, thinking)
		},

		flush(): string {
			const rest = quoteLines(buffer, thinking)
			buffer = ''
			if (!thinking) return rest
			thinking = false
			return rest + CALLOUT_BLOCK_END
		}
	}
}

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

type ThinkingDelta = OpenAI.ChatCompletionChunk.Choice.Delta & {
	reasoning_content?: string
}

/**
 * Yields a chat stream's text with the model's thinking inside a collapsed callout.
 *
 * A provider that reasons has two ways to say so and may use either, sometimes
 * across models of the same family. Zhipu puts it in `reasoning_content` on
 * GLM-4.5 and 4.6 but in `<think>` tags on GLM-Z1; MiniMax decides by the
 * `reasoning_split` parameter, defaulting to the tags. Handling only one leaves
 * the thinking either discarded or dumped into the note as plain text — which was
 * issue #116, and is an open complaint against MiniMax-M2.7 elsewhere.
 *
 * So handle both. `createThinkTagParser` deals with tags split across chunks;
 * `reasoning_content` needs no buffering because the field is already separate.
 */
export async function* streamWithThinking(
	stream: AsyncIterable<OpenAI.ChatCompletionChunk>
): AsyncGenerator<string, void, unknown> {
	const thinkTags = createThinkTagParser()
	let startReasoning = false

	for await (const part of stream) {
		const delta = part.choices[0]?.delta as ThinkingDelta
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

	// The parser holds back anything that might still have become a tag.
	const tail = thinkTags.flush()
	if (tail) yield tail
}
