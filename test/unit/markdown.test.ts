import { describe, expect, it } from 'vitest'
import { FIXTURES } from './fixtures'
import baseline from './fixtures.json'
import { parseDoc } from './markdown'

type Pos = { start: { offset: number }; end: { offset: number } }

/**
 * The fixture builder is only worth anything if it agrees with Obsidian, so the
 * first test in the suite is the one that says whether it still does. The
 * baseline is Obsidian's own output for the same notes, captured through the CLI.
 */
describe('parseDoc against Obsidian', () => {
	for (const name of Object.keys(baseline.notes)) {
		it(`matches Obsidian ${baseline.obsidianVersion} on "${name}"`, () => {
			const doc = parseDoc(FIXTURES[name])
			const ref = (r: { link: string; original: string; displayText?: string; position: Pos }) => [
				r.link,
				r.original,
				r.displayText,
				r.position.start.offset,
				r.position.end.offset
			]
			const seen = {
				tags: doc.tags.map((t) => [t.tag, t.position.start.offset, t.position.end.offset, t.position.start.line]),
				sections: doc.sections.map((s) => [s.type, s.position.start.offset, s.position.end.offset]),
				links: doc.links.map(ref),
				embeds: doc.embeds.map(ref)
			}
			expect(seen).toEqual(baseline.notes[name as keyof typeof baseline.notes])
		})
	}
})
