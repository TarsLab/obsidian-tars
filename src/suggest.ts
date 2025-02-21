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

interface TagEntry {
	readonly type: 'user' | 'assistant' | 'system' | 'newChat'
	readonly tag: string
	readonly replacement: string
}

// 冒号前面加空格，对中文输入更友好。中文输入#tag后需要空格，才能输入中文的冒号
export const toSpeakMark = (tag: string) => `#${tag} : `

const toNewChatMark = (tag: string) => `#${tag} `

// “#tag” 触发会有问题，可能会被 obsidian的标签补全拦截
const toTriggerPhrase = (w: string) => [
	w.toLowerCase(),
	`#${w.toLowerCase()} `,
	`#${w.toLowerCase()} :`, // 英文冒号
	`#${w.toLowerCase()} ：` // 中文冒号
]

export class TagEditorSuggest extends EditorSuggest<TagEntry> {
	settings: PluginSettings

	constructor(app: App, settings: PluginSettings) {
		super(app)
		this.app = app
		this.settings = settings
	}

	onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
		// 为了避免干扰，基于新的段落触发
		if (cursor.line >= 1) {
			// 如果前面有一行，那么前面那行必须是空行
			if (editor.getLine(cursor.line - 1).trim()) return null
		}
		let ch = 0
		const rawLine = editor.getLine(cursor.line)
		// 如果前面是 newChatTags, 把 newChatTag 截断
		const newTagsText = this.settings.newChatTags.map(toNewChatMark)
		for (const t of newTagsText) {
			if (rawLine.startsWith(t)) {
				ch = t.length
				break
			}
		}
		let selected = rawLine.slice(ch, cursor.ch)
		const indexOfFirstNonWhitespace = selected.search(/\S/)
		if (indexOfFirstNonWhitespace === -1) return null
		ch += indexOfFirstNonWhitespace
		selected = rawLine.slice(ch, cursor.ch)

		const selectedInLowerCase = selected.toLowerCase()
		const triggerInfo = {
			start: { line: cursor.line, ch: ch },
			end: { line: cursor.line, ch: cursor.ch }
		}

		for (const t of this.settings.newChatTags) {
			if (toTriggerPhrase(t).includes(selectedInLowerCase)) {
				return {
					...triggerInfo,
					query: JSON.stringify({
						type: 'newChat',
						tag: t,
						replacement: toNewChatMark(t)
					} as TagEntry)
				}
			}
		}

		for (const t of this.settings.userTags) {
			if (toTriggerPhrase(t).includes(selectedInLowerCase)) {
				return {
					...triggerInfo,
					query: JSON.stringify({
						type: 'user',
						tag: t,
						replacement: toSpeakMark(t)
					} as TagEntry)
				}
			}
		}

		const providerTags = this.settings.providers.map((p) => p.tag)
		for (const t of providerTags) {
			if (toTriggerPhrase(t).includes(selectedInLowerCase)) {
				return {
					...triggerInfo,
					query: JSON.stringify({
						type: 'assistant',
						tag: t,
						replacement: toSpeakMark(t)
					} as TagEntry)
				}
			}
		}

		for (const t of this.settings.systemTags) {
			if (toTriggerPhrase(t).includes(selectedInLowerCase)) {
				return {
					...triggerInfo,
					query: JSON.stringify({
						type: 'system',
						tag: t,
						replacement: toSpeakMark(t)
					} as TagEntry)
				}
			}
		}
		return null
	}

	async getSuggestions(ctx: EditorSuggestContext) {
		return [JSON.parse(ctx.query) as TagEntry]
	}

	renderSuggestion(element: TagEntry, el: HTMLElement) {
		switch (element.type) {
			case 'assistant': {
				el.createSpan({ text: element.replacement + '  ✨ ' + t('AI generate') + ' ✨  ' })
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

		if (element.type !== 'assistant') return
		console.debug('element', element)

		try {
			const provider = this.settings.providers.find((p) => p.tag === element.tag)
			if (!provider) {
				throw new Error('No provider found ' + element.tag)
			}

			const env = await buildRunEnv(this.app, this.settings)
			const endOffset = editor.posToOffset(this.context.start)
			await generate(env, editor, provider, endOffset)
			new Notice(t('Text generated successfully'))
		} catch (error) {
			console.error('error', error)
			new Notice(
				`🔴 ${Platform.isDesktopApp ? t('Check the developer console for error details. ') : ''}${error}`,
				10 * 1000
			)
		}
		this.close()
	}
}
