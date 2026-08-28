import { EmbedCache, LinkCache, SectionCache, TagCache } from 'obsidian'

/**
 * Builds the metadata caches Obsidian would build for a note.
 *
 * The parser reads a conversation out of `tags` and `sections`, never out of the
 * markdown, so a unit test has to supply both — and writing them by hand for
 * every fixture buries the case under coordinate arithmetic.
 *
 * This models the subset the plugin's own syntax lives in: paragraphs separated
 * by blank lines, which is the rule the README states ("a paragraph cannot
 * contain more than one message"). Nested structures, lists, tables and
 * multi-line callouts inside blockquotes are not modelled — a test that needs
 * them should drive the real app instead of trusting this.
 *
 * `test/unit/fixtures.json` holds this file's output next to Obsidian's own for
 * the same notes, so that the model is checked rather than assumed; see
 * `docs/manual-testing.md`.
 */
export interface Doc {
	text: string
	tags: TagCache[]
	sections: SectionCache[]
	links: LinkCache[]
	embeds: EmbedCache[]
}

const position = (text: string, start: number, end: number) => {
	const before = text.slice(0, start)
	const startLine = before.split('\n').length - 1
	const startCol = start - (before.lastIndexOf('\n') + 1)
	const upToEnd = text.slice(0, end)
	const endLine = upToEnd.split('\n').length - 1
	const endCol = end - (upToEnd.lastIndexOf('\n') + 1)
	return {
		start: { line: startLine, col: startCol, offset: start },
		end: { line: endLine, col: endCol, offset: end }
	}
}

const sectionType = (block: string): string => {
	if (block.startsWith('```')) return 'code'
	if (/^>\s*\[!/.test(block)) return 'callout'
	if (block.startsWith('>')) return 'blockquote'
	if (/^#{1,6}\s/.test(block)) return 'heading'
	if (/^(-{3,}|\*{3,}|_{3,})$/.test(block.trim())) return 'thematicBreak'
	if (/^\s*([-*+]|\d+\.)\s/.test(block)) return 'list'
	return 'paragraph'
}

/**
 * A tag is a `#` and the run of non-space that follows it, and must contain
 * something other than digits — `#1` is not a tag, `#DeepSeek` and `#我` are.
 */
const TAG = /#[^\s#[\]()]+/g

/** `[[target|alias]]`, and the same with a leading `!` for an embed. */
const WIKILINK = /(!?)\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g

export const parseDoc = (text: string): Doc => {
	const sections: SectionCache[] = []

	// Blocks are runs of non-blank lines. Offsets are tracked rather than
	// recomputed by searching, so repeated text cannot shift a later block.
	let offset = 0
	for (const chunk of text.split(/\n\s*\n/)) {
		const leading = chunk.length - chunk.trimStart().length
		const body = chunk.trim()
		if (body) {
			const start = offset + leading
			sections.push({ type: sectionType(body), position: position(text, start, start + body.length) })
		}
		// +2 for the blank line the split consumed. Runs of more than one blank
		// line would need the real separator length; fixtures use single ones.
		offset += chunk.length + 2
	}

	const codeRanges = sections
		.filter((s) => s.type === 'code')
		.map((s) => [s.position.start.offset, s.position.end.offset] as const)

	const tags: TagCache[] = []
	for (const match of text.matchAll(TAG)) {
		const start = match.index
		const value = match[0]
		// Obsidian does not index tags inside code.
		if (codeRanges.some(([from, to]) => from <= start && start < to)) continue
		if (!/[^\d#]/.test(value)) continue
		tags.push({ tag: value, position: position(text, start, start + value.length) })
	}

	const links: LinkCache[] = []
	const embeds: EmbedCache[] = []
	for (const match of text.matchAll(WIKILINK)) {
		const [original, bang, target, alias] = match
		const cache = {
			link: target,
			original,
			displayText: alias ?? target,
			position: position(text, match.index, match.index + original.length)
		}
		if (bang) embeds.push(cache)
		else links.push(cache)
	}

	return { text, tags, sections, links, embeds }
}
