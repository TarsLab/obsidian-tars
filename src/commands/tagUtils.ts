import { App, Editor, EditorPosition, EditorRange, EditorSelection, TagCache } from 'obsidian'
import { t } from 'src/lang/helper'
import { PluginSettings } from 'src/settings'
import { TagRole } from 'src/suggest'

export const HARD_LINE_BREAK = '  \n' // 两个空格加换行符, hard line break in markdown

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

// 判断前面是否要带空行
export const insertMarkToEmptyLines = (editor: Editor, from: EditorPosition, mark: string) => {
	let toLine = from.line
	let insertText = ''
	if (from.line > 0 && editor.getLine(from.line - 1).trim().length > 0) {
		// 前面一行非空, 加空行
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

// 判断前面是否要带空行，如果range起始位置不是开头，就不管了
export const insertMarkToBegin = (editor: Editor, range: EditorRange, mark: string) => {
	const { from, to } = range

	let insertText = ''
	let toLine = to.line
	if (from.line > 0 && editor.getLine(from.line - 1).trim().length > 0 && from.ch === 0) {
		// 前面一行非空，并且是from是一行的开头， 那么加空行
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

// 这里的标签可能在段落中间，也可能在段落开头。段落中间也算正常情况，但是消息可能会不一样。
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

		const lowerCaseTag = firstTag.tag.slice(1).split('/')[0].toLowerCase()
		const isNewChat = newChatTags.some((nt) => nt.toLowerCase() === lowerCaseTag)

		if (isNewChat) {
			const secondTag = tags.find(
				(t) =>
					firstTag.position.end.offset <= t.position.start.offset && t.position.end.offset <= editor.posToOffset(to)
			)
			if (secondTag) {
				// newChat情形，返回第二个标签的role
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
				// 只有一个newChat标签
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

		// 第一个标签
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
		// 没有标签，普通文本
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
	const lowerCaseTag = tag.tag.slice(1).split('/')[0].toLowerCase()

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
