import { App, Editor, EditorPosition, EditorRange, EditorSelection, TagCache } from 'obsidian'
import { t } from 'src/lang/helper'
import { PluginSettings } from 'src/settings'
import { TagRole } from 'src/suggest'

export const HARD_LINE_BREAK = '  \n' // Two spaces plus newline, hard line break in markdown

export const getEditorSelection = (editor: Editor): EditorSelection => {
	const selections = editor.listSelections()
	if (selections.length === 0) {
		throw new Error('No selection')
	} else if (selections.length > 1) {
		throw new Error('Multiple selections')
	}
	const selection = selections[0]
	return selection
}

export const fetchTagMeta = (app: App, editor: Editor, settings: PluginSettings): TagMeta => {
	const range = refineRange(app, editor)
	return getTagMeta(app, editor, range, settings)
}

export const refineRange = (app: App, editor: Editor): EditorRange => {
	const selection = getEditorSelection(editor)
	console.debug('anchor', selection.anchor)
	console.debug('head', selection.head)
	const cursor = editor.getCursor()

	const { sections } = getEnv(app)
	if (!sections) {
		console.debug('No sections')
		return {
			from: {
				line: cursor.line,
				ch: 0
			},
			to: {
				line: cursor.line,
				ch: editor.getLine(cursor.line).length
			}
		}
	}

	const anchorOffset = editor.posToOffset(selection.anchor)
	const headOffset = editor.posToOffset(selection.head)

	const [frontOffset, backOffset] = anchorOffset < headOffset ? [anchorOffset, headOffset] : [headOffset, anchorOffset]

	const overlappingSections = sections.filter(
		(s) => frontOffset <= s.position.end.offset && s.position.start.offset <= backOffset
	)

	if (overlappingSections.length === 0) {
		console.debug('No overlapping sections')

		// select the whole line
		return {
			from: {
				line: cursor.line,
				ch: 0
			},
			to: {
				line: cursor.line,
				ch: editor.getLine(cursor.line).length
			}
		}
	}
	return {
		from: {
			line: overlappingSections[0].position.start.line,
			ch: overlappingSections[0].position.start.col
		},
		to: {
			line: overlappingSections[overlappingSections.length - 1].position.end.line,
			ch: overlappingSections[overlappingSections.length - 1].position.end.col
		}
	}
}

export const isEmptyLines = (editor: Editor, range: EditorRange): boolean => {
	const { from, to } = range
	const content = editor.getRange(from, to)
	return content.trim().length === 0
}

// Check if line break is needed before
export const insertMarkToEmptyLines = (editor: Editor, from: EditorPosition, mark: string) => {
	let toLine = from.line
	let insertText = ''
	if (from.line > 0 && editor.getLine(from.line - 1).trim().length > 0) {
		// Previous line is not empty, add a blank line
		insertText = '\n' + mark
		toLine += 1
	} else {
		insertText = mark
	}

	editor.replaceRange(insertText, from, from)

	editor.setSelection({
		line: toLine,
		ch: editor.getLine(toLine).length
	})
	return toLine
}

// Determine whether to include an empty line before. If the range's starting position is not at the beginning, ignore this consideration.
export const insertMarkToBegin = (editor: Editor, range: EditorRange, mark: string) => {
	const { from, to } = range

	let insertText = ''
	let toLine = to.line
	if (from.line > 0 && editor.getLine(from.line - 1).trim().length > 0 && from.ch === 0) {
		// If the previous line is not empty and 'from' is at the beginning of a line, add an empty line
		insertText = '\n' + mark
		toLine += 1
	} else {
		insertText = mark
	}

	editor.replaceRange(insertText, from, from)

	editor.setSelection({
		line: toLine,
		ch: editor.getLine(toLine).length
	})
}

export const replaceTag = (editor: Editor, range: EditorRange, tagRange: EditorRange, newTag: string) => {
	const { to } = range
	if (tagRange) {
		editor.replaceRange('#' + newTag, tagRange.from, tagRange.to)
		editor.setSelection({
			line: to.line,
			ch: editor.getLine(to.line).length
		})
	}
}

export interface TagMeta {
	tagContent: string | null
	role: TagRole | null
	range: EditorRange
	tagRange: EditorRange | null
}

// Tags might be in the middle of a paragraph or at the beginning. Middle is also normal, but messages might be different.
const getTagMeta = (app: App, editor: Editor, range: EditorRange, settings: PluginSettings): TagMeta => {
	const { tags } = getEnv(app)
	if (!tags) {
		return {
			tagContent: null,
			role: null,
			range,
			tagRange: null
		}
	}
	const { from, to } = range
	const firstTag = tags.find(
		(t) => editor.posToOffset(from) <= t.position.start.offset && t.position.end.offset <= editor.posToOffset(to)
	)

	if (firstTag) {
		const userTags = settings.userTags
		const assistantTags = settings.providers.map((provider) => provider.tag)
		const systemTags = settings.systemTags
		const newChatTags = settings.newChatTags

		const lowerCaseTag = firstTag.tag.slice(1).toLowerCase()
		const isNewChat = newChatTags.some((nt) => nt.toLowerCase() === lowerCaseTag)

		if (isNewChat) {
			const secondTag = tags.find(
				(t) =>
					firstTag.position.end.offset <= t.position.start.offset && t.position.end.offset <= editor.posToOffset(to)
			)
			if (secondTag) {
				// In the case of newChat, return the role of the second tag
				return {
					tagContent: secondTag.tag.slice(1),
					role: getTagRole(secondTag, { userTags, assistantTags, systemTags, newChatTags }),
					range: { from: editor.offsetToPos(firstTag.position.end.offset + 1), to: range.to }, // 从第一个标签的结尾到range的结尾
					tagRange: {
						from: editor.offsetToPos(secondTag.position.start.offset),
						to: editor.offsetToPos(secondTag.position.end.offset)
					}
				}
			} else {
				// Only one newChat tag
				return {
					tagContent: firstTag.tag.slice(1),
					role: null,
					range: { from: editor.offsetToPos(firstTag.position.end.offset + 1), to: range.to }, // 从第一个标签的结尾到range的结
					tagRange: {
						from: editor.offsetToPos(firstTag.position.start.offset),
						to: editor.offsetToPos(firstTag.position.end.offset)
					}
				}
			}
		}

		// First tag
		return {
			tagContent: firstTag.tag.slice(1),
			role: getTagRole(firstTag, { userTags, assistantTags, systemTags, newChatTags }),
			range,
			tagRange: {
				from: editor.offsetToPos(firstTag.position.start.offset),
				to: editor.offsetToPos(firstTag.position.end.offset)
			}
		}
	} else {
		// No tags, plain text
		return {
			tagContent: null,
			role: null,
			range,
			tagRange: null
		}
	}
}

interface TagSettings {
	newChatTags: string[]
	userTags: string[]
	assistantTags: string[]
	systemTags: string[]
}

const getTagRole = (tag: TagCache, settings: TagSettings): TagRole | null => {
	const { userTags, assistantTags, systemTags, newChatTags } = settings
	const lowerCaseTag = tag.tag.slice(1).toLowerCase()

	const role = userTags.some((ut) => ut.toLowerCase() === lowerCaseTag)
		? 'user'
		: assistantTags.some((at) => at.toLowerCase() === lowerCaseTag)
			? 'assistant'
			: systemTags.some((st) => st.toLowerCase() === lowerCaseTag)
				? 'system'
				: newChatTags.some((nt) => nt.toLowerCase() === lowerCaseTag)
					? 'newChat'
					: null
	return role
}

const getEnv = (app: App) => {
	const activeFile = app.workspace.getActiveFile()
	if (!activeFile) {
		throw new Error('No active file')
	}
	const fileMeta = app.metadataCache.getFileCache(activeFile)
	if (!fileMeta) {
		throw new Error(t('Waiting for metadata to be ready. Please try again.'))
	}
	const tags = fileMeta.tags
	return { sections: fileMeta.sections, tags: tags }
}

export const insertText = (editor: Editor, text: string) => {
	const current = editor.getCursor('to')
	const lines = text.split('\n')
	const newPos: EditorPosition = {
		line: current.line + lines.length - 1,
		ch: lines.length === 1 ? current.ch + text.length : lines[lines.length - 1].length
	}
	editor.replaceRange(text, current)
	editor.setCursor(newPos)
	return newPos.line
}
