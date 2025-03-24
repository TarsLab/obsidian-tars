import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	Notice,
	Platform,
	TFile
} from 'obsidian'
import { buildRunEnv, generate } from './editor'
import { t } from './lang/helper'
import { PluginSettings } from './settings'

export type TagRole = 'user' | 'assistant' | 'system' | 'newChat'

export interface TagEntry {
	readonly role: TagRole
	readonly tag: string
	readonly replacement: string
}

// Add space before colon for better input experience. Space is needed after #tag to input colon
export const toSpeakMark = (tag: string) => `#${tag} : `

export const toNewChatMark = (tag: string) => `#${tag} `

export const toMark = (role: TagRole, tag: string, needNewLine: boolean = false) =>
	needNewLine ? `\n#${tag}` : role === 'newChat' ? toNewChatMark(tag) : toSpeakMark(tag)

const speakerPostFix = [' ', '  ', ' :', ' ：']

export const getMaxTriggerLineLength = (settings: PluginSettings) => {
	const maxNewChatLength = Math.max(0, ...settings.newChatTags.map((tag) => tag.length))
	const maxOtherLength = Math.max(
		0,
		...settings.systemTags.map((tag) => tag.length),
		...settings.userTags.map((tag) => tag.length),
		...settings.providers.map((p) => p.tag.length)
	)
	return 4 + (maxNewChatLength + 1) + (maxOtherLength + 2)
}

/**
 * Extract words from string, ignore specific special characters (exclude #, English:, Chinese：)
 * Optimized for scenarios where only up to 3 words are needed
 */
const extractWords = (input: string): string[] => {
	// Use regular expression to match up to two words and return directly
	const matches = []
	const regex = /[^\s#:：]+/g
	let match

	// Only find up to 3 matches
	for (let i = 0; i < 3; i++) {
		match = regex.exec(input)
		if (!match) break
		matches.push(match[0])
	}

	return matches
}

const needsNewLine = (cursor: EditorPosition, editor: Editor) => {
	if (cursor.line >= 1) {
		if (editor.getLine(cursor.line - 1).trim().length > 0) return true
	}
	return false
}

export class TagEditorSuggest extends EditorSuggest<TagEntry> {
	settings: PluginSettings
	tagLowerCaseMap: Map<string, Omit<TagEntry, 'replacement'>>
	statusBarItem: HTMLElement

	constructor(
		app: App,
		settings: PluginSettings,
		tagLowerCaseMap: Map<string, Omit<TagEntry, 'replacement'>>,
		statusBarItem: HTMLElement
	) {
		super(app)
		this.app = app
		this.settings = settings
		this.tagLowerCaseMap = tagLowerCaseMap
		this.statusBarItem = statusBarItem
	}

	/** Based on the editor line and cursor position, determine if this EditorSuggest should be triggered at this moment. Typically, you would run a regular expression on the current line text before the cursor. Return null to indicate that this editor suggest is not supposed to be triggered.
	Please be mindful of performance when implementing this function, as it will be triggered very often (on each keypress). Keep it simple, and return null as early as possible if you determine that it is not the right time. **/
	onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
		if (this.settings.editorStatus.isTextInserting) return null
		if (cursor.ch < 1 || cursor.ch > this.settings.tagSuggestMaxLineLength) return null
		// console.debug('---- onTrigger ---------')
		const text = editor.getLine(cursor.line)
		if (text.length > cursor.ch) return null // Cursor is not at the end of the line

		const words = extractWords(text)
		if (words.length === 0 || words.length >= 3) return null

		// words.length 1, 2
		const firstTag = this.tagLowerCaseMap.get(words[0].toLowerCase())
		if (!firstTag) return null

		let secondTag: Omit<TagEntry, 'replacement'> | undefined = undefined
		if (words.length === 2) {
			secondTag = this.tagLowerCaseMap.get(words[1].toLowerCase())
			if (!secondTag) return null
			if (firstTag.role !== 'newChat') return null // Only newChat tags can follow newChat tags
		}

		const suggestTag = secondTag || firstTag
		const word = words.length === 2 ? words[1] : words[0]

		const index = text.indexOf(word)
		const postFix = text.slice(index + word.length)
		if (postFix) {
			if (suggestTag.role === 'newChat') {
				// newChat followed by content, do not trigger
				return null
			} else if (!speakerPostFix.includes(postFix)) {
				// speaker followed by content, but not content in speakerPostFix, do not trigger
				return null
			}
		}

		const shouldInsertNewLine = needsNewLine(cursor, editor)
		return {
			start: { line: cursor.line, ch: index > 0 && text[index - 1] === '#' ? index - 1 : index },
			end: { line: cursor.line, ch: cursor.ch },
			query: JSON.stringify({
				...suggestTag,
				replacement: toMark(suggestTag.role, suggestTag.tag, shouldInsertNewLine)
			} as TagEntry)
		}
	}

	async getSuggestions(ctx: EditorSuggestContext) {
		return [JSON.parse(ctx.query) as TagEntry]
	}

	renderSuggestion(element: TagEntry, el: HTMLElement) {
		if (element.replacement.includes('\n')) {
			el.createSpan({ text: element.replacement })
			return
		}

		switch (element.role) {
			case 'assistant': {
				el.createSpan({ text: element.replacement + '  ✨ ' + t('AI generate') + ' ✨  ' })
				break
			}
			case 'user': {
				el.createSpan({ text: element.replacement + '  💬  ' })
				break
			}
			case 'system': {
				el.createSpan({ text: element.replacement + '  💬  ' })
				break
			}
			case 'newChat': {
				el.createSpan({ text: element.replacement + '  🚀  ' })
				break
			}
			default: {
				el.createSpan({ text: element.replacement })
			}
		}
	}

	async selectSuggestion(element: TagEntry, evt: MouseEvent | KeyboardEvent) {
		if (!this.context) return
		const editor = this.context.editor
		editor.replaceRange(element.replacement, this.context.start, this.context.end)

		if (element.role !== 'assistant' || element.replacement.includes('\n')) {
			this.close()
			return
		}
		console.debug('element', element)

		try {
			const provider = this.settings.providers.find((p) => p.tag === element.tag)
			if (!provider) {
				throw new Error('No provider found ' + element.tag)
			}

			const env = await buildRunEnv(this.app, this.settings)
			const messagesEndOffset = editor.posToOffset(this.context.start)
			console.debug('endOffset', messagesEndOffset)
			await generate(env, editor, provider, messagesEndOffset, this.statusBarItem, this.settings.editorStatus)
			new Notice(t('Text generated successfully'))
		} catch (error) {
			this.settings.editorStatus.isTextInserting = false
			console.error('error', error)
			new Notice(
				`🔴 ${Platform.isDesktopApp ? t('Check the developer console for error details. ') : ''}${error}`,
				10 * 1000
			)
		}
		this.close()
	}
}
