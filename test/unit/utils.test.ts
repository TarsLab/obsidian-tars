import type OpenAI from 'openai'
import { describe, expect, it } from 'vitest'
import {
	bodyParams,
	CALLOUT_BLOCK_END,
	CALLOUT_BLOCK_START,
	chatCompletionChunks,
	createThinkTagParser,
	streamWithThinking
} from '../../src/providers/utils'

/** Everything a provider's answer passes through on its way into the note. */

const drain = (parser: ReturnType<typeof createThinkTagParser>, chunks: string[]) =>
	chunks.map((c) => parser.push(c)).join('') + parser.flush()

// Only the field under test; the rest of a chunk never reaches this code.
const delta = (d: Record<string, string>) => ({ choices: [{ delta: d }] }) as unknown as OpenAI.ChatCompletionChunk

async function* iterate<T>(items: T[]) {
	for (const item of items) yield item
}

const collect = async (stream: AsyncIterable<string>) => {
	let out = ''
	for await (const text of stream) out += text
	return out
}

/** A body delivered in the pieces a network hands over, not in whole frames. */
const streamOf = (pieces: string[]): ReadableStream<Uint8Array> => {
	const encoder = new TextEncoder()
	let i = 0
	return new ReadableStream({
		pull(controller) {
			if (i >= pieces.length) return controller.close()
			controller.enqueue(encoder.encode(pieces[i++]))
		}
	})
}

describe('createThinkTagParser', () => {
	it('leaves an answer without thinking alone', () => {
		expect(drain(createThinkTagParser(), ['1+1', ' 等于 ', '2。'])).toBe('1+1 等于 2。')
	})

	it('puts thinking in a callout', () => {
		expect(drain(createThinkTagParser(), ['<think>', '想一想', '</think>', '答案'])).toBe(
			CALLOUT_BLOCK_START + '想一想' + CALLOUT_BLOCK_END + '答案'
		)
	})

	// The failure this parser exists for: GLM-Z1 streams `<think>` as '<th',
	// 'ink', '>\nOkay', so no single chunk ever equals the tag and a chunk-at-a-time
	// comparison renders the thinking into the note as ordinary text.
	it('recognises a tag split across chunks', () => {
		expect(drain(createThinkTagParser(), ['<th', 'ink', '>\nOkay', '</think>', '答案'])).toBe(
			CALLOUT_BLOCK_START + 'Okay' + CALLOUT_BLOCK_END + '答案'
		)
	})

	it('holds back text that might still become a tag', () => {
		const parser = createThinkTagParser()
		// '<thi' could still grow into '<think>', so none of it may be emitted yet.
		expect(parser.push('答案<thi')).toBe('答案')
		expect(parser.flush()).toBe('<thi')
	})

	it('quotes every line of the thinking, so the callout holds', () => {
		const out = drain(createThinkTagParser(), ['<think>第一行\n第二行</think>答案'])
		expect(out).toBe(CALLOUT_BLOCK_START + '第一行\n> 第二行' + CALLOUT_BLOCK_END + '答案')
	})

	it('drops the padding models leave around the tags', () => {
		const out = drain(createThinkTagParser(), ['<think>\n\n想一想\n\n</think>\n\n答案'])
		expect(out).toBe(CALLOUT_BLOCK_START + '想一想' + CALLOUT_BLOCK_END + '答案')
	})

	it('closes a callout the model never closed', () => {
		expect(drain(createThinkTagParser(), ['<think>', '想到一半就断了'])).toBe(
			CALLOUT_BLOCK_START + '想到一半就断了' + CALLOUT_BLOCK_END
		)
	})
})

describe('streamWithThinking', () => {
	it('reads thinking from reasoning_content', async () => {
		const out = await collect(
			streamWithThinking(iterate([delta({ reasoning_content: '想一想' }), delta({ content: '答案' })]))
		)
		expect(out).toBe(CALLOUT_BLOCK_START + '想一想' + CALLOUT_BLOCK_END + '答案')
	})

	// Zhipu uses reasoning_content on GLM-4.5 and think tags on GLM-Z1; MiniMax
	// picks by parameter. Both forms have to reach the same callout.
	it('reads thinking from think tags, to the same result', async () => {
		const tagged = await collect(streamWithThinking(iterate([delta({ content: '<think>想一想</think>答案' })])))
		const field = await collect(
			streamWithThinking(iterate([delta({ reasoning_content: '想一想' }), delta({ content: '答案' })]))
		)
		expect(tagged).toBe(field)
	})

	it('passes an answer with no thinking through unchanged', async () => {
		expect(await collect(streamWithThinking(iterate([delta({ content: '等于' }), delta({ content: ' 2。' })])))).toBe(
			'等于 2。'
		)
	})
})

describe('chatCompletionChunks', () => {
	const frame = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`

	const textOf = async (body: ReadableStream<Uint8Array>) => {
		let out = ''
		for await (const chunk of chatCompletionChunks(body)) out += chunk.choices[0]?.delta?.content ?? ''
		return out
	}

	it('reads whole frames', async () => {
		expect(await textOf(streamOf([frame('等于'), frame(' 2。'), 'data: [DONE]\n']))).toBe('等于 2。')
	})

	// The regression: a frame that straddles two network reads used to reach
	// JSON.parse in halves, which threw out of the generator and ended the answer
	// mid-sentence with nothing to retry it.
	it('survives a frame split across reads', async () => {
		const whole = frame('等于 2。')
		const cut = Math.floor(whole.length / 2)
		expect(await textOf(streamOf([whole.slice(0, cut), whole.slice(cut), 'data: [DONE]\n']))).toBe('等于 2。')
	})

	it('skips keep-alives and event lines instead of parsing them', async () => {
		const body = streamOf([': keep-alive\n', 'event: message\n', frame('等于 2。'), 'data: [DONE]\n'])
		expect(await textOf(body)).toBe('等于 2。')
	})

	it('does not end an answer over one unparsable frame', async () => {
		expect(await textOf(streamOf([frame('等于'), 'data: {not json}\n', frame(' 2。'), 'data: [DONE]\n']))).toBe(
			'等于 2。'
		)
	})

	it('stops at [DONE]', async () => {
		expect(await textOf(streamOf([frame('等于 2。'), 'data: [DONE]\n', frame('不该出现')]))).toBe('等于 2。')
	})
})

describe('bodyParams', () => {
	const settings = { apiKey: 'k', baseURL: 'u', model: 'm', proxyUrl: '' }

	it('keeps an override the API has never heard from this plugin', () => {
		expect(bodyParams({ temperature: 0.2 }, settings)).toEqual({ temperature: 0.2 })
	})

	// Putting `model` in the override has always meant changing the setting, not
	// adding a body field; and a `proxyUrl: ''` left over from a removed feature
	// is enough to earn a 400 from a backend that validates its input.
	it('drops an override that names a provider setting', () => {
		expect(bodyParams({ model: 'other', proxyUrl: 'x', temperature: 0.2 }, settings)).toEqual({ temperature: 0.2 })
	})

	it('answers with nothing when there are no parameters', () => {
		expect(bodyParams(undefined as unknown as Record<string, unknown>, settings)).toEqual({})
	})
})
