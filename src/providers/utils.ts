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
	// Whitespace is held rather than emitted. If a tag turns out to follow it, it
	// was padding around the tag and belongs to neither side: models write
	// `<think>\n…\n</think>\n\n`, and the callout markers bring their own spacing,
	// so emitting both leaves a run of blank lines between thinking and answer.
	let pendingWhitespace = ''
	// True until the current section has produced something other than whitespace.
	let atSectionStart = true

	/** Queues text for the section being read, holding back what may be padding. */
	const take = (text: string): string => {
		const body = atSectionStart ? text.replace(/^\s+/, '') : text
		if (!body) return ''

		const trailing = /\s+$/.exec(body)
		const held = trailing ? trailing[0] : ''
		const ready = held ? body.slice(0, -held.length) : body

		const out = ready ? pendingWhitespace + ready : ''
		pendingWhitespace = ready ? held : pendingWhitespace + held
		if (ready) atSectionStart = false
		return quoteLines(out, thinking)
	}

	return {
		push(chunk: string): string {
			buffer += chunk
			let out = ''

			for (;;) {
				const tag = thinking ? THINK_CLOSE : THINK_OPEN
				const at = buffer.indexOf(tag)
				if (at === -1) break
				// Text before the tag still belongs to the state being left.
				out += take(buffer.slice(0, at))
				buffer = buffer.slice(at + tag.length)
				pendingWhitespace = ''
				thinking = !thinking
				out += thinking ? CALLOUT_BLOCK_START : CALLOUT_BLOCK_END
				atSectionStart = true
			}

			const held = partialTagSuffix(buffer, thinking ? THINK_CLOSE : THINK_OPEN)
			const ready = buffer.slice(0, buffer.length - held)
			buffer = buffer.slice(buffer.length - held)
			return out + take(ready)
		},

		flush(): string {
			// Whatever is left was never a tag after all; trailing padding still is.
			const rest = take(buffer)
			buffer = ''
			pendingWhitespace = ''
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

export type ThinkingDelta = OpenAI.ChatCompletionChunk.Choice.Delta & {
	reasoning_content?: string
}

/**
 * Decodes a server-sent-event body into chat completion chunks.
 *
 * A frame is not guaranteed to arrive whole. Read the stream the obvious way —
 * split each decoded chunk on newlines and parse the pieces — and the first
 * `data:` line that straddles two network reads reaches `JSON.parse` in halves,
 * which throws out of the generator and ends the answer mid-sentence. Nothing
 * upstream retries, and the note simply stops. Buffering across reads is the
 * whole fix; everything else here follows from it.
 *
 * Lines that are not `data:` are skipped rather than parsed, because keep-alive
 * comments and `event:` lines are part of the protocol and were being fed to
 * `JSON.parse` too.
 *
 * `TextDecoder` rather than `TextDecoderStream`: the streaming form only reached
 * Safari 16.4, and no provider may be desktop-only.
 */
export async function* chatCompletionChunks(
	body: ReadableStream<Uint8Array>
): AsyncGenerator<OpenAI.ChatCompletionChunk, void, unknown> {
	const reader = body.getReader()
	const decoder = new TextDecoder()
	let buffer = ''

	try {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			buffer += decoder.decode(value, { stream: true })

			while (true) {
				const lineEnd = buffer.indexOf('\n')
				if (lineEnd === -1) break
				const line = buffer.slice(0, lineEnd).trim()
				buffer = buffer.slice(lineEnd + 1)

				if (!line.startsWith('data:')) continue
				const payload = line.slice('data:'.length).trim()
				if (payload === '[DONE]') return

				try {
					yield JSON.parse(payload) as OpenAI.ChatCompletionChunk
				} catch {
					// One frame this malformed is not worth ending an answer over.
					console.debug('skipping unparsable SSE frame', payload)
				}
			}
		}
	} finally {
		// The consumer can walk away early — the smoke harness does, at maxChars —
		// and the body stays open until somebody says otherwise.
		await reader.cancel().catch(() => undefined)
	}
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
	let inReasoning = false

	// A provider that reports thinking in `reasoning_content` is describing what
	// the tags describe, so say it in tags and let one parser handle both. The
	// seams — the padding models leave around their thinking — then get trimmed
	// the same way whichever form arrives, and a model using both still works.
	const feed = (text: string) => thinkTags.push(text)

	for await (const part of stream) {
		const delta = part.choices[0]?.delta as ThinkingDelta
		const reasoning = delta?.reasoning_content
		const content = delta?.content

		if (reasoning) {
			let out = inReasoning ? '' : ((inReasoning = true), feed(THINK_OPEN))
			out += feed(reasoning)
			if (out) yield out
			continue
		}

		if (content) {
			let out = inReasoning ? ((inReasoning = false), feed(THINK_CLOSE)) : ''
			out += feed(content)
			if (out) yield out
		}
	}

	// Closes a block the model never closed, and releases anything still buffered.
	const tail = thinkTags.flush()
	if (tail) yield tail
}
