import { App, Command, Editor, EditorPosition, MarkdownView, Notice, Platform } from 'obsidian'
import { buildRunEnv, generate } from 'src/editor'
import { t } from 'src/lang/helper'
import { ProviderSettings } from 'src/providers'
import { PluginSettings } from 'src/settings'
import { toSpeakMark } from 'src/suggest'
import { TagCmdMeta } from './tagCmd'
import { HARD_LINE_BREAK } from './utils'

export const asstTagCmd = (
	{ id, name, tag }: TagCmdMeta,
	app: App,
	settings: PluginSettings,
	statusBarItem: HTMLElement
): Command => ({
	id,
	name,
	editorCallback: async (editor: Editor, view: MarkdownView) => {
		try {
			const provider = settings.providers.find((p) => p.tag === tag)
			if (!provider) {
				new Notice('Provider not found')
				return
			}
			await answer(app, editor, settings, statusBarItem, provider, settings.answerDelayInMilliseconds)
		} catch (error) {
			console.error(error)
			new Notice(
				`🔴 ${Platform.isDesktopApp ? t('Check the developer console for error details. ') : ''}${error}`,
				10 * 1000
			)
		}
	}
})

export const answer = async (
	app: App,
	editor: Editor,
	settings: PluginSettings,
	statusBarItem: HTMLElement,
	providerSettings: ProviderSettings,
	delayDuration: number
) => {
	const messagesEndOffset = await setAssistantTag(editor, providerSettings.tag, settings.providers, delayDuration)
	console.debug('messagesEndOffset', messagesEndOffset)
	const env = await buildRunEnv(app, settings)
	await generate(env, editor, providerSettings, messagesEndOffset, statusBarItem)
}

/** 遵循对话语法。这里主要是设置空行 */
export const setAssistantTag = async (
	editor: Editor,
	tag: string,
	providers: ProviderSettings[],
	delayDuration: number
) => {
	const cursor = editor.getCursor()
	const assistantMark = toSpeakMark(tag)
	const currentLine = cursor.line
	let lnToWrite = null
	if (editor.getLine(currentLine).trim().length > 0) {
		// 当前行非空
		if (isStartWithAssistantTag(editor.getLine(currentLine), providers)) {
			// 当前行以助手标签开头, 替换当前行
			editor.replaceRange(
				'',
				{
					line: currentLine,
					ch: 0
				},
				{
					line: currentLine,
					ch: editor.getLine(currentLine).length
				}
			) // 清掉当前行
			editor.setCursor({ line: currentLine, ch: 0 })
			lnToWrite = await insertMarkSlowMo(editor, assistantMark, delayDuration)

			if (lnToWrite != currentLine) console.error('lnToWrite != currentLine')

			// TODO, 这里会删除用户内容，有没有更优的用户体验？
			new Notice(t('Regenerate Answer'))
		} else {
			// 不清楚的内容，换行，新一行
			editor.setCursor({ line: currentLine, ch: editor.getLine(currentLine).length })
			insertText(editor, HARD_LINE_BREAK + '\n')
			lnToWrite = await insertMarkSlowMo(editor, assistantMark, delayDuration)

			if (lnToWrite != currentLine + 2) console.error('lnToWrite != currentLine + 2')
		}
	} else if (currentLine >= 1 && editor.getLine(currentLine - 1).trim().length > 0) {
		// 当前行空，前面一行非空。新一行
		editor.setCursor({ line: currentLine, ch: 0 })
		insertText(editor, '\n')
		lnToWrite = await insertMarkSlowMo(editor, assistantMark, delayDuration)

		if (lnToWrite != currentLine + 1) console.error('lnToWrite != current + 1')
	} else {
		// 当前行空，前面一行也空。
		editor.setCursor({ line: currentLine, ch: 0 })
		lnToWrite = await insertMarkSlowMo(editor, assistantMark, delayDuration)

		if (lnToWrite != currentLine) console.error('lnToWrite != currentLine')
	}
	// editor.setCursor({ line: lnToWrite, ch: editor.getLine(lnToWrite).length })
	const messageEndPosition = {
		line: lnToWrite,
		ch: 0
	}
	return editor.posToOffset(messageEndPosition)
}

const insertText = (editor: Editor, text: string) => {
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

const insertMarkSlowMo = async (editor: Editor, mark: string, delayDuration: number) => {
	const steps = mark.length - 2
	if (steps <= 0) {
		throw new Error('mark length must be greater than 2')
	}
	const delay = Math.round(delayDuration / steps)

	let lnToWrite = insertText(editor, mark[0] + mark[1]) // 先插入带#号的前两个字符
	for (let i = 2; i < mark.length; i++) {
		await new Promise((resolve) => setTimeout(resolve, delay))
		lnToWrite = insertText(editor, mark[i])
	}
	return lnToWrite
}

const isStartWithAssistantTag = (lineContent: string, providers: ProviderSettings[]) => {
	// TODO，这里的逻辑需要考虑更多场景，这里先匹配常见的重试场景
	if (!lineContent.startsWith('#')) {
		return false
	}
	const stripped = lineContent.slice(1)
	for (const provider of providers) {
		if (stripped.startsWith(provider.tag)) {
			return true
		}
	}
	return false
}
