/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { AxiosResponse } from 'axios'
import { EmbedCache } from 'obsidian'
import { t } from 'src/lang/helper'
import { BaseOptions, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'
import { arrayBufferToBase64, getMimeTypeFromFilename } from './utils'

interface ClaudeOptions extends BaseOptions {
	max_tokens?: number
}

interface TextDelta {
	text: string
	type: 'text_delta'
}

interface InputJSONDelta {
	partial_json: string
	type: 'input_json_delta'
}

interface ContentBlockDeltaEvent {
	delta: TextDelta | InputJSONDelta
	index: number
	type: 'content_block_delta'
}

interface MessageDeltaEvent {
	type: 'message_delta'
	delta: {
		stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null
		stop_sequence: string | null
	}
}

interface OthersEvent {
	type: 'message_start' | 'message_stop' | 'content_block_start' | 'content_block_stop'
	[key: string]: any
}

type PartialEvent = ContentBlockDeltaEvent | MessageDeltaEvent | OthersEvent

const formatMsgForClaudeAPI = async (msg: Message, resolveEmbedAsBinary: ResolveEmbedAsBinary) => {
	const content: (
		| {
				type: string
				source: {
					type: string
					media_type: string
					data: string
				}
		  }
		| { type: 'text'; text: string }
	)[] = msg.embeds ? await Promise.all(msg.embeds.map((embed) => formatEmbed(embed, resolveEmbedAsBinary))) : []

	if (msg.content.trim()) {
		content.push({
			type: 'text',
			text: msg.content
		})
	}

	return {
		role: msg.role,
		content
	}
}

const formatEmbed = async (embed: EmbedCache, resolveEmbedAsBinary: ResolveEmbedAsBinary) => {
	const mimeType = getMimeTypeFromFilename(embed.link)
	const mimeTypeMap: Record<string, string> = {
		'image/png': 'image',
		'image/jpeg': 'image',
		'image/gif': 'image',
		'image/webp': 'image',
		'application/pdf': 'document'
	}

	const type = mimeTypeMap[mimeType]
	if (!type) {
		throw new Error(t('Only PNG, JPEG, GIF, WebP, and PDF files are supported.'))
	}

	const embedBuffer = await resolveEmbedAsBinary(embed)
	const base64Data = arrayBufferToBase64(embedBuffer)
	return {
		type: type,
		source: {
			type: 'base64',
			media_type: mimeType,
			data: base64Data
		}
	}
}

const sendRequestFunc = (settings: ClaudeOptions): SendRequest =>
	async function* (messages: Message[], controller: AbortController, resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const { parameters, ...optionsExcludingParams } = settings
		const options = { ...optionsExcludingParams, ...parameters }
		const { apiKey, baseURL, model, max_tokens } = options
		if (!apiKey) throw new Error(t('API key is required'))

		const [system_msg, messagesWithoutSys] =
			messages[0].role === 'system' ? [messages[0], messages.slice(1)] : [null, messages]
		const headers = {
			'Content-Type': 'application/json',
			'anthropic-version': '2023-06-01',
			'X-Api-Key': apiKey,
			'anthropic-dangerous-direct-browser-access': 'true'
		}

		const formattedMsgs = await Promise.all(
			messagesWithoutSys.map((msg) => formatMsgForClaudeAPI(msg, resolveEmbedAsBinary))
		)
		const body = {
			model,
			system: system_msg?.content,
			max_tokens,
			messages: formattedMsgs,
			stream: true
		}
		// console.debug('claude api body', JSON.stringify(body))

		const response = await axios.post(baseURL, body, {
			headers,
			adapter: 'fetch',
			responseType: 'stream',
			withCredentials: false,
			signal: controller.signal
		})

		const stream = Stream.fromSSEResponse<PartialEvent>(response, controller)

		for await (const event of stream) {
			// console.debug('event', event)
			if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
				yield event.delta.text
			} else if (event.type === 'message_delta') {
				if (event.delta.stop_reason !== 'end_turn') {
					throw new Error(`Unexpected stop reason: ${event.delta.stop_reason}`)
				}
			}
		}
	}

const models = [
	'claude-sonnet-4-0',
	'claude-opus-4-0',
	'claude-3-7-sonnet-latest',
	'claude-3-5-sonnet-latest',
	'claude-3-opus-latest',
	'claude-3-5-haiku-latest'
]

export const claudeVendor: Vendor = {
	name: 'Claude',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://api.anthropic.com/v1/messages',
		model: models[0],
		max_tokens: 8192,
		parameters: {}
	} as ClaudeOptions,
	sendRequestFunc,
	models,
	websiteToObtainKey: 'https://console.anthropic.com',
	capabilities: ['Text Generation', 'Image Vision', 'PDF Vision']
}

// The following code is based on the src/streaming.ts file from github:anthropics/anthropic-sdk-typescript
type Bytes = string | ArrayBuffer | Uint8Array | Buffer | null | undefined

export type ServerSentEvent = {
	event: string | null
	data: string
	raw: string[]
}

class Stream<Item> implements AsyncIterable<Item> {
	controller: AbortController

	constructor(
		private iterator: () => AsyncIterator<Item>,
		controller: AbortController
	) {
		this.controller = controller
	}

	static fromSSEResponse<Item>(response: AxiosResponse, controller: AbortController) {
		let consumed = false

		async function* iterator(): AsyncIterator<Item, any, undefined> {
			if (consumed) {
				throw new Error('Cannot iterate over a consumed stream, use `.tee()` to split the stream.')
			}
			consumed = true
			let done = false
			try {
				for await (const sse of _iterSSEMessages(response, controller)) {
					if (sse.event === 'completion') {
						try {
							yield JSON.parse(sse.data)
						} catch (e) {
							console.error(`Could not parse message into JSON:`, sse.data)
							console.error(`From chunk:`, sse.raw)
							throw e
						}
					}

					if (
						sse.event === 'message_start' ||
						sse.event === 'message_delta' ||
						sse.event === 'message_stop' ||
						sse.event === 'content_block_start' ||
						sse.event === 'content_block_delta' ||
						sse.event === 'content_block_stop'
					) {
						try {
							yield JSON.parse(sse.data)
						} catch (e) {
							console.error(`Could not parse message into JSON:`, sse.data)
							console.error(`From chunk:`, sse.raw)
							throw e
						}
					}

					if (sse.event === 'ping') {
						continue
					}

					if (sse.event === 'error') {
						console.error(`Error event from server:`, sse.data)
						const errText = sse.data
						const errJSON = JSON.parse(errText)
						const errMessage = errJSON ? undefined : errText

						throw new Error(errMessage)
					}
				}
				done = true
			} catch (e) {
				// If the user calls `stream.controller.abort()`, we should exit without throwing.
				if (e instanceof Error && e.name === 'AbortError') return
				throw e
			} finally {
				// If the user `break`s, abort the ongoing request.
				if (!done) controller.abort()
			}
		}

		return new Stream(iterator, controller)
	}

	/**
	 * Generates a Stream from a newline-separated ReadableStream
	 * where each item is a JSON value.
	 */
	static fromReadableStream<Item>(readableStream: ReadableStream, controller: AbortController) {
		let consumed = false

		async function* iterLines(): AsyncGenerator<string, void, unknown> {
			const lineDecoder = new LineDecoder()

			const iter = readableStreamAsyncIterable<Bytes>(readableStream)
			for await (const chunk of iter) {
				for (const line of lineDecoder.decode(chunk)) {
					yield line
				}
			}

			for (const line of lineDecoder.flush()) {
				yield line
			}
		}

		async function* iterator(): AsyncIterator<Item, any, undefined> {
			if (consumed) {
				throw new Error('Cannot iterate over a consumed stream, use `.tee()` to split the stream.')
			}
			consumed = true
			let done = false
			try {
				for await (const line of iterLines()) {
					if (done) continue
					if (line) yield JSON.parse(line)
				}
				done = true
			} catch (e) {
				// If the user calls `stream.controller.abort()`, we should exit without throwing.
				if (e instanceof Error && e.name === 'AbortError') return
				throw e
			} finally {
				// If the user `break`s, abort the ongoing request.
				if (!done) controller.abort()
			}
		}

		return new Stream(iterator, controller)
	}

	[Symbol.asyncIterator](): AsyncIterator<Item> {
		return this.iterator()
	}

	/**
	 * Splits the stream into two streams which can be
	 * independently read from at different speeds.
	 */
	tee(): [Stream<Item>, Stream<Item>] {
		const left: Array<Promise<IteratorResult<Item>>> = []
		const right: Array<Promise<IteratorResult<Item>>> = []
		const iterator = this.iterator()

		const teeIterator = (queue: Array<Promise<IteratorResult<Item>>>): AsyncIterator<Item> => {
			return {
				next: () => {
					if (queue.length === 0) {
						const result = iterator.next()
						left.push(result)
						right.push(result)
					}
					return queue.shift()!
				}
			}
		}

		return [new Stream(() => teeIterator(left), this.controller), new Stream(() => teeIterator(right), this.controller)]
	}

	/**
	 * Converts this stream to a newline-separated ReadableStream of
	 * JSON stringified values in the stream
	 * which can be turned back into a Stream with `Stream.fromReadableStream()`.
	 */
	toReadableStream(): ReadableStream {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self = this
		let iter: AsyncIterator<Item>
		const encoder = new TextEncoder()

		return new ReadableStream({
			async start() {
				iter = self[Symbol.asyncIterator]()
			},
			async pull(ctrl: any) {
				try {
					const { value, done } = await iter.next()
					if (done) return ctrl.close()

					const bytes = encoder.encode(JSON.stringify(value) + '\n')

					ctrl.enqueue(bytes)
				} catch (err) {
					ctrl.error(err)
				}
			},
			async cancel() {
				await iter.return?.()
			}
		})
	}
}

export async function* _iterSSEMessages(
	response: AxiosResponse,
	controller: AbortController
): AsyncGenerator<ServerSentEvent, void, unknown> {
	if (!response.data) {
		controller.abort()
		throw new Error(`Attempted to iterate over a response with no data`)
	}

	const sseDecoder = new SSEDecoder()
	const lineDecoder = new LineDecoder()

	const iter = readableStreamAsyncIterable<Bytes>(response.data)
	for await (const sseChunk of iterSSEChunks(iter)) {
		for (const line of lineDecoder.decode(sseChunk)) {
			// console.debug('lineDecoder1', line)
			const sse = sseDecoder.decode(line)
			if (sse) yield sse
		}
	}

	for (const line of lineDecoder.flush()) {
		// console.debug('lineDecoder2', line)
		if (line.startsWith('{"type":"error"')) {
			throw new Error(line)
		}
		const sse = sseDecoder.decode(line)
		if (sse) yield sse
	}
}

/**
 * Given an async iterable iterator, iterates over it and yields full
 * SSE chunks, i.e. yields when a double new-line is encountered.
 */
async function* iterSSEChunks(iterator: AsyncIterableIterator<Bytes>): AsyncGenerator<Uint8Array> {
	let data = new Uint8Array()

	for await (const chunk of iterator) {
		if (chunk == null) {
			continue
		}

		const binaryChunk =
			chunk instanceof ArrayBuffer
				? new Uint8Array(chunk)
				: typeof chunk === 'string'
					? new TextEncoder().encode(chunk)
					: chunk

		const newData = new Uint8Array(data.length + binaryChunk.length)
		newData.set(data)
		newData.set(binaryChunk, data.length)
		data = newData

		let patternIndex
		while ((patternIndex = findDoubleNewlineIndex(data)) !== -1) {
			yield data.slice(0, patternIndex)
			data = data.slice(patternIndex)
		}
	}

	if (data.length > 0) {
		yield data
	}
}

function findDoubleNewlineIndex(buffer: Uint8Array): number {
	// This function searches the buffer for the end patterns (\r\r, \n\n, \r\n\r\n)
	// and returns the index right after the first occurrence of any pattern,
	// or -1 if none of the patterns are found.
	const newline = 0x0a // \n
	const carriage = 0x0d // \r

	for (let i = 0; i < buffer.length - 2; i++) {
		if (buffer[i] === newline && buffer[i + 1] === newline) {
			// \n\n
			return i + 2
		}
		if (buffer[i] === carriage && buffer[i + 1] === carriage) {
			// \r\r
			return i + 2
		}
		if (
			buffer[i] === carriage &&
			buffer[i + 1] === newline &&
			i + 3 < buffer.length &&
			buffer[i + 2] === carriage &&
			buffer[i + 3] === newline
		) {
			// \r\n\r\n
			return i + 4
		}
	}

	return -1
}

class SSEDecoder {
	private data: string[]
	private event: string | null
	private chunks: string[]

	constructor() {
		this.event = null
		this.data = []
		this.chunks = []
	}

	decode(line: string) {
		if (line.endsWith('\r')) {
			line = line.substring(0, line.length - 1)
		}

		if (!line) {
			// empty line and we didn't previously encounter any messages
			if (!this.event && !this.data.length) return null

			const sse: ServerSentEvent = {
				event: this.event,
				data: this.data.join('\n'),
				raw: this.chunks
			}

			this.event = null
			this.data = []
			this.chunks = []

			return sse
		}

		this.chunks.push(line)

		if (line.startsWith(':')) {
			return null
		}

		const [fieldName, , leftoverValue] = partition(line, ':')
		const value = leftoverValue.startsWith(' ') ? leftoverValue.substring(1) : leftoverValue

		if (fieldName === 'event') {
			this.event = value
		} else if (fieldName === 'data') {
			this.data.push(value)
		}

		return null
	}
}

/**
 * A re-implementation of httpx's `LineDecoder` in Python that handles incrementally
 * reading lines from text.
 *
 * https://github.com/encode/httpx/blob/920333ea98118e9cf617f246905d7b202510941c/httpx/_decoders.py#L258
 */
class LineDecoder {
	// prettier-ignore
	static NEWLINE_CHARS = new Set(['\n', '\r']);
	static NEWLINE_REGEXP = /\r\n|[\n\r]/g

	buffer: string[]
	trailingCR: boolean
	textDecoder: any // TextDecoder found in browsers; not typed to avoid pulling in either "dom" or "node" types.

	constructor() {
		this.buffer = []
		this.trailingCR = false
	}

	decode(chunk: Bytes): string[] {
		let text = this.decodeText(chunk)

		if (this.trailingCR) {
			text = '\r' + text
			this.trailingCR = false
		}
		if (text.endsWith('\r')) {
			this.trailingCR = true
			text = text.slice(0, -1)
		}

		if (!text) {
			return []
		}

		const trailingNewline = LineDecoder.NEWLINE_CHARS.has(text[text.length - 1] || '')
		let lines = text.split(LineDecoder.NEWLINE_REGEXP)

		// if there is a trailing new line then the last entry will be an empty
		// string which we don't care about
		if (trailingNewline) {
			lines.pop()
		}

		if (lines.length === 1 && !trailingNewline) {
			this.buffer.push(lines[0]!)
			return []
		}

		if (this.buffer.length > 0) {
			lines = [this.buffer.join('') + lines[0], ...lines.slice(1)]
			this.buffer = []
		}

		if (!trailingNewline) {
			this.buffer = [lines.pop() || '']
		}

		return lines
	}

	decodeText(bytes: Bytes): string {
		if (bytes == null) return ''
		if (typeof bytes === 'string') return bytes

		// Node:
		if (typeof Buffer !== 'undefined') {
			if (bytes instanceof Buffer) {
				return bytes.toString()
			}
			if (bytes instanceof Uint8Array) {
				return Buffer.from(bytes).toString()
			}

			throw new Error(
				`Unexpected: received non-Uint8Array (${bytes.constructor.name}) stream chunk in an environment with a global "Buffer" defined, which this library assumes to be Node. Please report this error.`
			)
		}

		// Browser
		if (typeof TextDecoder !== 'undefined') {
			if (bytes instanceof Uint8Array || bytes instanceof ArrayBuffer) {
				this.textDecoder ??= new TextDecoder('utf8')
				return this.textDecoder.decode(bytes)
			}

			throw new Error(
				`Unexpected: received non-Uint8Array/ArrayBuffer (${
					(bytes as any).constructor.name
				}) in a web platform. Please report this error.`
			)
		}

		throw new Error(`Unexpected: neither Buffer nor TextDecoder are available as globals. Please report this error.`)
	}

	flush(): string[] {
		if (!this.buffer.length && !this.trailingCR) {
			return []
		}

		const lines = [this.buffer.join('')]
		this.buffer = []
		this.trailingCR = false
		return lines
	}
}

/** This is an internal helper function that's just used for testing */
export function _decodeChunks(chunks: string[]): string[] {
	const decoder = new LineDecoder()
	const lines: string[] = []
	for (const chunk of chunks) {
		lines.push(...decoder.decode(chunk))
	}

	return lines
}

function partition(str: string, delimiter: string): [string, string, string] {
	const index = str.indexOf(delimiter)
	if (index !== -1) {
		return [str.substring(0, index), delimiter, str.substring(index + delimiter.length)]
	}

	return [str, '', '']
}

/**
 * Most browsers don't yet have async iterable support for ReadableStream,
 * and Node has a very different way of reading bytes from its "ReadableStream".
 *
 * This polyfill was pulled from https://github.com/MattiasBuelens/web-streams-polyfill/pull/122#issuecomment-1627354490
 */
export function readableStreamAsyncIterable<T>(stream: any): AsyncIterableIterator<T> {
	if (stream[Symbol.asyncIterator]) return stream

	const reader = stream.getReader()
	return {
		async next() {
			try {
				const result = await reader.read()
				if (result?.done) reader.releaseLock() // release lock when stream becomes closed
				return result
			} catch (e) {
				reader.releaseLock() // release lock when stream becomes errored
				throw e
			}
		},
		async return() {
			const cancelPromise = reader.cancel()
			reader.releaseLock()
			await cancelPromise
			return { done: true, value: undefined }
		},
		[Symbol.asyncIterator]() {
			return this
		}
	}
}
