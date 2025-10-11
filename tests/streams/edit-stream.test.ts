import { once } from 'node:events'
import { LockMap, SimpleAsyncLock } from 'src/streams/async-lock'
import { TextEditStream } from 'src/streams/edit-stream'
import { SimplePieceTable } from 'src/streams/piece-table'
import { Range } from 'src/streams/types'
import { describe, expect, it } from 'vitest'

const delay = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

describe('SimplePieceTable', () => {
	it('supports basic insertion (Case 1.1)', () => {
		// GIVEN: an empty piece table buffer
		const buffer = new SimplePieceTable()

		// WHEN: inserting text at the start
		buffer.insert(0, 'Hello')

		// THEN: the buffer contains the new text
		expect(buffer.getText()).toBe('Hello')
	})

	it('appends text (Case 1.2)', () => {
		// GIVEN: a buffer seeded with existing text
		const buffer = new SimplePieceTable('Hello')

		// WHEN: inserting at the end offset
		buffer.insert(5, ' World')

		// THEN: the buffer reflects the appended text
		expect(buffer.getText()).toBe('Hello World')
	})

	it('inserts in the middle (Case 1.3)', () => {
		// GIVEN: a buffer with a missing character
		const buffer = new SimplePieceTable('Helo')

		// WHEN: inserting the missing letter at the middle offset
		buffer.insert(2, 'l')

		// THEN: the buffer reconstructs the intended word
		expect(buffer.getText()).toBe('Hello')
	})

	it('deletes from the middle (Case 1.4)', () => {
		// GIVEN: a buffer with sequential characters
		const buffer = new SimplePieceTable('abcdef')

		// WHEN: deleting a slice from the middle
		buffer.delete(2, 2)

		// THEN: the removed characters no longer appear
		expect(buffer.getText()).toBe('abef')
	})

	it('handles combined insert/delete sequence (Case 1.5)', () => {
		// GIVEN: a numeric buffer
		const buffer = new SimplePieceTable('12345')

		// WHEN: replacing a slice with alternate characters
		buffer.delete(2, 2)
		buffer.insert(2, 'XYZ')

		// THEN: the buffer shows the replacement inline
		expect(buffer.getText()).toBe('12XYZ5')
	})

	it('getText reflects cumulative edits (Case 1.6)', () => {
		// GIVEN: a buffer that will undergo multiple mutations
		const buffer = new SimplePieceTable('start')

		// WHEN: applying inserts and deletes in sequence
		buffer.insert(5, ' middle')
		buffer.delete(0, 5)
		buffer.insert(0, 'begin')
		buffer.insert(buffer.length(), ' end')

		// THEN: the final text reflects all mutations in order
		expect(buffer.getText()).toBe('begin middle end')
	})

	it('rebuilds after deleting all content (Case 1.7)', () => {
		// GIVEN: a buffer that will be cleared completely
		const buffer = new SimplePieceTable('gone')

		// WHEN: deleting all content and inserting anew
		buffer.delete(0, buffer.length())
		expect(buffer.getText()).toBe('')
		buffer.insert(0, 'rebuild')

		// THEN: the buffer restarts with the newly inserted text
		expect(buffer.getText()).toBe('rebuild')
	})

	it('delete section with a minuse length is ignored', () => {
		// GIVEN: a buffer with some content
		const buffer = new SimplePieceTable('gone')

		// WHEN: deleting a section with a negative length or a negative offset
		buffer.delete(0, -1)
		buffer.delete(-1, 0)

		// THEN: the buffer remains unchanged
		expect(buffer.getText()).toBe('gone')
	})
})

describe('Lock system', () => {
	it('runs operations sequentially on a single lock (Case 2.1)', async () => {
		// GIVEN: an async lock shared by multiple tasks
		const lock = new SimpleAsyncLock()
		const events: string[] = []

		// WHEN: two tasks run under the same lock
		await Promise.all([
			lock.runExclusive(async () => {
				events.push('first-start')
				await delay(10)
				events.push('first-end')
			}),
			lock.runExclusive(async () => {
				events.push('second-start')
				events.push('second-end')
			})
		])

		// THEN: the second task runs only after the first completes
		expect(events).toEqual(['first-start', 'first-end', 'second-start', 'second-end'])
	})

	it('allows parallel locks for different keys (Case 2.2)', async () => {
		// GIVEN: a lock map keyed by identifiers
		const lockMap = new LockMap()
		const events: string[] = []

		// WHEN: running tasks under separate keys
		await Promise.all([
			lockMap.get('a').runExclusive(async () => {
				events.push('a-start')
				await delay(10)
				events.push('a-end')
			}),
			lockMap.get('b').runExclusive(async () => {
				events.push('b-start')
				await delay(10)
				events.push('b-end')
			})
		])

		// THEN: both tasks interleave without blocking one another
		expect(events.includes('a-start')).toBe(true)
		expect(events.includes('b-start')).toBe(true)
		expect(events.indexOf('a-start')).toBeLessThan(events.indexOf('a-end'))
		expect(events.indexOf('b-start')).toBeLessThan(events.indexOf('b-end'))
		expect(Math.min(events.indexOf('a-end'), events.indexOf('b-end'))).toBeGreaterThan(
			Math.min(events.indexOf('a-start'), events.indexOf('b-start'))
		)
	})

	it('serializes access on the same key (Case 2.3)', async () => {
		// GIVEN: a shared lock key
		const lockMap = new LockMap()
		const events: string[] = []

		// WHEN: concurrent tasks target the same key
		await Promise.all([
			lockMap.get('shared').runExclusive(async () => {
				events.push('first')
				await delay(5)
			}),
			lockMap.get('shared').runExclusive(async () => {
				events.push('second')
			})
		])

		// THEN: the executions serialize in order of acquisition
		expect(events).toEqual(['first', 'second'])
	})
})

describe('Anchors', () => {
	it('shifts anchor forward after insertion (Case 3.1)', async () => {
		// GIVEN: a stream with an anchor at the start
		const stream = new TextEditStream('')
		stream.addAnchor('cursor', 0)

		// WHEN: inserting text at that anchor
		await stream.applyChange('user', 'cursor', 'ABC')

		// THEN: the anchor shifts forward by the inserted length
		expect(stream.findAnchor('cursor').position).toBe(3)
	})

	it('moves anchors backward after deletion (Case 3.2)', async () => {
		// GIVEN: a stream with an anchor past the deletion zone
		const initial = '0123456789abcdefghij'
		const stream = new TextEditStream(initial)
		stream.addAnchor('target', 10)

		// WHEN: deleting characters before the anchor
		const range = new Range({ id: 'start', position: 5 }, { id: 'end', position: 10 })
		await stream.deleteRange('editor', range)

		// THEN: both the text and anchor position reflect the deletion
		expect(stream.getText()).toBe(initial.slice(0, 5) + initial.slice(10))
		expect(stream.findAnchor('target').position).toBe(5)
	})

	it('shifts multiple anchors after insertion (Case 3.3)', async () => {
		// GIVEN: a stream with several anchors ahead of an insertion point
		const text = 'AAAAAAAAAABBBBBBBBBBCCCCCCCCCC'
		const stream = new TextEditStream(text)
		stream.addAnchor('A', 0)
		stream.addAnchor('B', 10)
		stream.addAnchor('C', 20)
		stream.addAnchor('insert', 5)

		// WHEN: inserting text at the shared insertion anchor
		await stream.applyChange('actor', 'insert', 'xxxxx')

		// THEN: downstream anchors shift by the inserted length
		expect(stream.findAnchor('B').position).toBe(15)
		expect(stream.findAnchor('C').position).toBe(25)
	})
})

describe('Ranges', () => {
	it('replaces range content (Case 4.1)', async () => {
		// GIVEN: a stream with anchors bracketing a word
		const stream = new TextEditStream('test data set')
		stream.addAnchor('a-start', 5)
		stream.addAnchor('a-end', 9)
		const range = new Range(stream.findAnchor('a-start'), stream.findAnchor('a-end'))

		// WHEN: replacing the range with alternate text
		await stream.replaceRange('user', range, 'info')

		// THEN: the document reflects the swapped word
		expect(stream.getText()).toBe('test info set')
	})

	it('deletes range content (Case 4.2)', async () => {
		// GIVEN: a stream containing a removable phrase
		const stream = new TextEditStream('keep this, remove this, keep that')
		const startIndex = stream.getText().indexOf('remove')
		const endIndex = startIndex + 'remove this'.length
		stream.addAnchor('start', startIndex)
		stream.addAnchor('end', endIndex)
		const range = new Range(stream.findAnchor('start'), stream.findAnchor('end'))

		// WHEN: deleting the marked range
		await stream.deleteRange('user', range)

		// THEN: the phrase disappears from the document
		expect(stream.getText()).toBe('keep this, , keep that')
	})

	it('inserts relative before anchor (Case 4.3)', async () => {
		// GIVEN: a stream with an anchor in the middle of text
		const stream = new TextEditStream('XYZ')
		stream.addAnchor('cursor', 1)

		// WHEN: inserting text before the anchor
		await stream.insertRelative('user', 'cursor', '_', 'before')

		// THEN: the inserted text precedes the anchor position
		expect(stream.getText()).toBe('X_YZ')
	})

	it('inserts relative after anchor (Case 4.4)', async () => {
		// GIVEN: the same anchor position inside the text
		const stream = new TextEditStream('XYZ')
		stream.addAnchor('cursor', 1)

		// WHEN: inserting text after the anchor
		await stream.insertRelative('user', 'cursor', '_', 'after')

		// THEN: the new text appears immediately after the anchor index
		expect(stream.getText()).toBe('XY_Z')
	})

	describe('Offset handling', () => {
		it('clamps negative numeric offsets to zero', async () => {
			// GIVEN: a stream with an anchor after the start
			const stream = new TextEditStream('ABC')
			stream.addAnchor('cursor', 1)

			// WHEN: applying a change using a negative offset override
			await stream.applyChange('actor', 'cursor', 'X', -10)

			// THEN: the insertion clamps to position zero and anchors shift accordingly
			expect(stream.getText()).toBe('XABC')
			expect(stream.findAnchor('cursor').position).toBe(2)
		})

		it('clamps oversized offsets to buffer length', async () => {
			// GIVEN: a stream with an anchor at the end of the current text
			const stream = new TextEditStream('ABC')
			stream.addAnchor('cursor', stream.getText().length)

			// WHEN: applying a change using an offset beyond the buffer length
			await stream.applyChange('actor', 'cursor', 'XYZ', 999)

			// THEN: the insertion appends at the buffer end and anchors move forward
			expect(stream.getText()).toBe('ABCXYZ')
			expect(stream.findAnchor('cursor').position).toBe(6)
		})
	})
})

describe('Concurrent editing', () => {
	it('allows parallel edits on different anchors (Case 5.1)', async () => {
		// GIVEN: a document with distinct anchors for summary and details
		const stream = new TextEditStream('summary:\ndetails:\n')
		stream.addAnchor('summary', 8)
		stream.addAnchor('details', 17)

		// WHEN: concurrent edits target separate anchors
		await Promise.all([
			stream.applyChange('assistant', 'summary', ' updated summary'),
			stream.applyChange('server', 'details', ' updated details')
		])

		// THEN: both edits appear without blocking each other
		const output = stream.getText()
		expect(output).toContain('summary: updated summary')
		expect(output).toContain('details: updated details')
	})

	it('serializes edits on the same anchor (Case 5.2)', async () => {
		// GIVEN: a document with a single summary anchor at the end
		const stream = new TextEditStream('summary:')
		stream.addAnchor('summary', stream.getText().length)

		// WHEN: multiple edits target the same anchor concurrently
		await Promise.all([
			stream.applyChange('assistant', 'summary', ' first'),
			stream.applyChange('assistant', 'summary', ' second')
		])

		// THEN: the lock serializes the edits in arrival order
		expect(stream.getText()).toBe('summary: first second')
	})

	it('emits snapshot after exceeding history (Case 5.3)', async () => {
		// GIVEN: a stream with a reduced history threshold
		const stream = new TextEditStream('')
		Reflect.set(stream as object, 'maxHistory', 3)
		stream.addAnchor('main', 0)

		// WHEN: performing more edits than the max history
		const snapshots: number[] = []
		stream.on('snapshot', (evt: { length: number }) => snapshots.push(evt.length))

		await stream.applyChange('actor', 'main', 'a')
		await stream.applyChange('actor', 'main', 'b')
		await stream.applyChange('actor', 'main', 'c')
		await stream.applyChange('actor', 'main', 'd')

		// THEN: a snapshot event fires with the current document length
		expect(snapshots).toHaveLength(1)
		expect(snapshots[0]).toBe(stream.getText().length)
	})
})

describe('Stream behavior', () => {
	it('reads stream content (Case 6.1)', async () => {
		// GIVEN: a stream preloaded with text and an anchor at the end
		const stream = new TextEditStream('Hello')
		stream.addAnchor('cursor', 5)
		await stream.applyChange('user', 'cursor', ' World')

		// WHEN: consuming data events from the stream
		const chunks: string[] = []
		stream.on('data', (chunk) => {
			chunks.push(typeof chunk === 'string' ? chunk : chunk.toString())
		})
		stream.resume()
		await once(stream, 'end')

		// THEN: the emitted chunks contain the full document text once
		expect(chunks).toEqual(['Hello World'])
	})

	it('serializes state via toJSON', async () => {
		// GIVEN: a stream with an anchor positioned at the end of the seed text
		const stream = new TextEditStream('Seed')
		stream.addAnchor('marker', 4)
		await stream.applyChange('actor', 'marker', '!')

		// WHEN: serializing the stream state
		const json = stream.toJSON()

		// THEN: the JSON payload mirrors the current text and anchor metadata
		expect(json.text).toBe('Seed!')
		expect(json.anchors).toEqual([stream.findAnchor('marker')])
	})

	it('appends content via write (Case 6.2)', async () => {
		// GIVEN: an empty stream buffer ready for writes
		const stream = new TextEditStream('')
		// WHEN: writing sequential chunks followed by an end signal
		stream.write('A')
		stream.write('B')
		stream.write('C')
		stream.end()

		// THEN: the stored text includes the concatenated chunks
		expect(stream.getText()).toBe('ABC')
	})
})

describe('Integration scenarios', () => {
	it('supports dynamic anchor creation (Case 7.1)', async () => {
		// GIVEN: markdown text with placeholders for summary and analysis sections
		const initial = '## Summary\n\n## Analysis\n'
		const stream = new TextEditStream(initial)
		const summaryIndex = initial.indexOf('## Analysis') - 1
		const analysisIndex = initial.length

		stream.addAnchor('summary', summaryIndex)
		stream.addAnchor('analysis', analysisIndex)

		// WHEN: inserting content at the dynamically created anchors
		await stream.applyChange('assistant', 'summary', 'Content for summary\n')
		await stream.applyChange('assistant', 'analysis', 'Content for analysis')

		// THEN: both sections contain their respective generated content
		expect(stream.getText()).toContain('## Summary\nContent for summary')
		expect(stream.getText()).toContain('## Analysis\nContent for analysis')
	})

	it('adjusts anchors after range update (Case 7.2)', async () => {
		// GIVEN: a document with anchors bracketing the body section
		const initial = 'Intro\nBody\nConclusion'
		const stream = new TextEditStream(initial)
		const bodyStart = initial.indexOf('Body')
		const bodyEnd = bodyStart + 'Body'.length
		stream.addAnchor('body-start', bodyStart)
		stream.addAnchor('body-end', bodyEnd)
		stream.addAnchor('after-body', bodyEnd + 1)

		// WHEN: replacing the range with longer content
		const range = new Range(stream.findAnchor('body-start'), stream.findAnchor('body-end'))
		await stream.replaceRange('assistant', range, 'Main Content')

		// THEN: the document updates and trailing anchors shift accordingly
		expect(stream.getText()).toContain('Main Content')
		expect(stream.findAnchor('after-body').position).toBe(bodyEnd + 1 + ('Main Content'.length - 'Body'.length))
	})

	it('merges complex multi-actor session (Case 7.3)', async () => {
		// GIVEN: a document with anchors for three independent participants
		const initial = 'Summary:\nDetails:\nNotes:\n'
		const stream = new TextEditStream(initial)
		const summaryAnchorPos = initial.indexOf('Summary:') + 'Summary:'.length
		const detailsAnchorPos = initial.indexOf('Details:') + 'Details:'.length + 1
		const notesAnchorPos = initial.indexOf('Notes:') + 'Notes:'.length + 1
		stream.addAnchor('summary', summaryAnchorPos)
		stream.addAnchor('details', detailsAnchorPos)
		stream.addAnchor('notes', notesAnchorPos)

		// WHEN: all actors edit concurrently at their respective anchors
		await Promise.all([
			stream.applyChange('assistant', 'summary', ' Intro completed\n'),
			stream.applyChange('server', 'details', ' Technical details\n'),
			stream.applyChange('user', 'notes', ' Personal notes\n')
		])

		// THEN: the document contains each actor's contribution in place
		const text = stream.getText()
		expect(text).toContain('Summary: Intro completed')
		expect(text).toContain('Details:\n Technical details')
		expect(text).toContain('Notes:\n Personal notes')
	})
})

describe('Negative path', () => {
	it('throws on invalid range, swapped start and end', () => {
		const stream = new TextEditStream('')
		expect(() => new Range(stream.addAnchor('start', 1), stream.addAnchor('end', 0))).toThrow()
	})

	it('throws on attempt to find non-existent anchor', () => {
		const stream = new TextEditStream('')
		expect(() => stream.findAnchor('non-existent')).toThrow()
	})
})

describe('Smoke scenarios', () => {
	it('updates conversational ranges with appended context', async () => {
		// GIVEN: a multi-turn transcript with hashtag-prefixed roles
		const initial = `#System : You are helping to test LLM integration. Reply in short form to all requests.\n\n#User : Which model are you?\n\n#Ollama : I'm a large language model, specifically one of the models integrated with this platform.\n\n#User : Which tools are available for you?\n\n#Ollama : `
		const stream = new TextEditStream(initial)

		// WHEN: extracting ranges between hashtags and recording their lengths
		const ranges: Range[] = []
		const seen = new Map<string, number>()
		const blockPattern = /^#([^:\n]+)\s*:([\s\S]*?)(?=^#|$)/gm
		for (const match of initial.matchAll(blockPattern)) {
			const tag = (match[1] ?? '').trim()
			const count = seen.get(tag) ?? 0
			const baseId = `${tag.toLowerCase()}-${count}`
			seen.set(tag, count + 1)

			const sectionStart = match.index ?? 0
			const colonOffset = match[0].indexOf(':')
			let contentStart = sectionStart + colonOffset + 1
			while (initial[contentStart] === ' ' || initial[contentStart] === '\n') contentStart += 1
			let contentEnd = sectionStart + match[0].length
			while (contentEnd > contentStart && /[ \t\n]/.test(initial[contentEnd - 1])) contentEnd -= 1
			const initialText = initial.slice(contentStart, contentEnd)

			const startAnchor = stream.addAnchor(`${baseId}-start`, contentStart)
			const endAnchor = stream.addAnchor(`${baseId}-end`, contentEnd)
			ranges.push(new Range(startAnchor, endAnchor, { tag, text: initialText }))
		}
		// THEN: the measured lengths match the expected span of each turn
		const lengths = ranges.map((segment) => segment.length)
		expect(lengths).toEqual([77, 20, 89, 34, 0])

		// WHEN: augmenting each conversational range with smoke test markers
		const finalFragments: string[] = []
		const getRangeExtra = <T>(range: Range, key: string): T | undefined => {
			const symbol = Object.getOwnPropertySymbols(range).find((sym) => sym.description === key)
			return symbol ? ((range as Record<symbol, unknown>)[symbol] as T) : undefined
		}
		for (const [index, range] of ranges.entries()) {
			const tag = getRangeExtra<string>(range, 'tag') ?? 'unknown'
			const current = stream.getText().slice(range.start.position, range.end.position)
			const augmentation = ` [${tag} smoke ${index}]`
			await stream.replaceRange('smoke', range, `${current}${augmentation}`)
			finalFragments.push(`${current}${augmentation}`)
		}

		// THEN: the final transcript contains every augmented fragment in place
		const finalText = stream.getText()
		finalFragments.forEach((fragment) => {
			expect(finalText).toContain(fragment)
		})
	})
})
