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
import { RequestController, buildRunEnv, generate } from './editor'
import { t } from './lang/helper'
import { PluginSettings } from './settings'
import { StatusBarManager } from './statusBarManager'

export type TagRole = 'user' | 'assistant' | 'system' | 'newChat'

export interface TagEntry {
	readonly role: TagRole
	readonly tag: string
	readonly replacement: string
}

// Add a space before the colon for better Chinese input experience. After typing #tag in Chinese input mode, a space is needed before typing the colon
export const toSpeakMark = (tag: string) => `#${tag} : `

export const toNewChatMark = (tag: string) => `#${tag} `

export const toMark = (role: TagRole, tag: string, needNewLine: boolean = false) =>
	needNewLine ? `\n#${tag}` : role === 'newChat' ? toNewChatMark(tag) : toSpeakMark(tag)

const validTagSuffixes = [' ', '  ', ' :', ' ：']

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
 * Extract words from a string, ignoring specific special symbols (excluding #, English :, Chinese：)
 * Optimized for scenarios requiring at most 3 words
 */
const extractWords = (input: string): string[] => {
	// Use regex to match up to two words and return them directly
	const matches = []
	const regex = /[^\s#:：]+/g
	let match

	// Only search for a maximum of 3 matches
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
	statusBarManager: StatusBarManager
	requestController: RequestController

	constructor(
		app: App,
		settings: PluginSettings,
		tagLowerCaseMap: Map<string, Omit<TagEntry, 'replacement'>>,
		statusBarManager: StatusBarManager,
		requestController: RequestController
	) {
		super(app)
		this.app = app
		this.settings = settings
		this.tagLowerCaseMap = tagLowerCaseMap
		this.statusBarManager = statusBarManager
		this.requestController = requestController
	}

	/** Based on the editor line and cursor position, determine if this EditorSuggest should be triggered at this moment. Typically, you would run a regular expression on the current line text before the cursor. Return null to indicate that this editor suggest is not supposed to be triggered.
	Please be mindful of performance when implementing this function, as it will be triggered very often (on each keypress). Keep it simple, and return null as early as possible if you determine that it is not the right time. **/
	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile): EditorSuggestTriggerInfo | null {
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
			if (firstTag.role !== 'newChat') return null // Only newChat tags can be followed by another tag
		}

		const suggestTag = secondTag || firstTag
		const word = words.length === 2 ? words[1] : words[0]

		const index = text.indexOf(word)
		const afterWordText = text.slice(index + word.length)
		if (afterWordText) {
			if (suggestTag.role === 'newChat') {
				// If newChat is followed by plain text, don't trigger suggestion
				return null
			} else if (!validTagSuffixes.includes(afterWordText)) {
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
		const asstEmoji = this.settings.roleEmojis.assistant
		switch (element.role) {
			case 'assistant': {
				el.createSpan({
					text: `${element.replacement}  ${asstEmoji} ${t('AI generate')} ${asstEmoji}  `
				})
				break
			}
			case 'user': {
				el.createSpan({ text: `${element.replacement}  ${this.settings.roleEmojis.user}  ` })
				break
			}
			case 'system': {
				el.createSpan({ text: `${element.replacement}  ${this.settings.roleEmojis.system}  ` })
				break
			}
			case 'newChat': {
				el.createSpan({ text: `${element.replacement}  ${this.settings.roleEmojis.newChat}  ` })
				break
			}
			default: {
				el.createSpan({ text: element.replacement })
			}
		}
	}

	async selectSuggestion(element: TagEntry, _evt: MouseEvent | KeyboardEvent) {
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
			await generate(
				env,
				editor,
				provider,
				messagesEndOffset,
				this.statusBarManager,
				this.settings.editorStatus,
				this.requestController
			)
		} catch (error) {
			console.error('error', error)
			if (error.name === 'AbortError') {
				this.statusBarManager.setCancelledStatus()
				new Notice(t('Generation cancelled'))
				return
			}

			this.statusBarManager.setErrorStatus(error as Error)
			new Notice(`🔴 ${Platform.isDesktopApp ? t('Click status bar for error details. ') : ''}${error}`, 10 * 1000)
		}
		this.close()
	}
}
