import { App, Command, Editor, EditorRange, MarkdownView, Modal, Notice, Platform, Setting } from 'obsidian'
import { buildRunEnv, generate } from 'src/editor'
import { t } from 'src/lang/helper'
import { ProviderSettings } from 'src/providers'
import { PluginSettings } from 'src/settings'
import { toSpeakMark } from 'src/suggest'
import { TagCmdMeta } from './tagCmd'
import {
	fetchTagMeta,
	HARD_LINE_BREAK,
	insertMarkToBegin,
	insertMarkToEmptyLines,
	insertText,
	isEmptyLines
} from './tagUtils'

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
				new Notice(`Assistant ${tag} not found`)
				return
			}
			const defaultUserMark = toSpeakMark(settings.userTags[0])
			const mark = toSpeakMark(tag)
			const { range, role, tagContent, tagRange } = fetchTagMeta(app, editor, settings)
			console.debug('asstTagCmd', { range, role, tagContent, tagRange })

			// 如果是空行，直接插入标签
			if (isEmptyLines(editor, range)) {
				const lnToWrite = insertMarkToEmptyLines(editor, range.from, mark)
				const messagesEndOffset = editor.posToOffset({
					line: lnToWrite,
					ch: 0
				})
				const env = await buildRunEnv(app, settings)
				await generate(env, editor, provider, messagesEndOffset, statusBarItem)
				return
			}

			// 如果是普通文本，插入 userTag，新增一行（只有这种情况需要slowMo)
			if (role === null) {
				insertMarkToBegin(editor, range, defaultUserMark)

				editor.setCursor({ line: range.to.line, ch: editor.getLine(range.to.line).length })
				insertText(editor, HARD_LINE_BREAK + '\n')
				const lnToWrite = await insertMarkSlowMo(editor, mark, settings.answerDelayInMilliseconds)

				const messagesEndOffset = editor.posToOffset({
					line: lnToWrite,
					ch: 0
				})
				const env = await buildRunEnv(app, settings)
				await generate(env, editor, provider, messagesEndOffset, statusBarItem)
			} else if (role === 'assistant') {
				// 如果是asstTag，弹窗问用户是否重新生成
				if (settings.confirmRegenerate) {
					const onConfirm = async () => {
						await regenerate(app, settings, statusBarItem, editor, provider, range, mark)
					}
					new ConfirmModal(app, onConfirm).open()
				} else {
					await regenerate(app, settings, statusBarItem, editor, provider, range, mark)
				}
			} else {
				// 如果是userTag，systemTag（稍后警告），newChat混合等等，新增一行, 插入助手标签。交给后续做判断。
				editor.setCursor({ line: range.to.line, ch: editor.getLine(range.to.line).length })
				const lnToWrite = insertText(editor, HARD_LINE_BREAK + '\n' + mark)

				const messagesEndOffset = editor.posToOffset({
					line: lnToWrite,
					ch: 0
				})
				const env = await buildRunEnv(app, settings)
				await generate(env, editor, provider, messagesEndOffset, statusBarItem)
			}
		} catch (error) {
			console.error(error)
			new Notice(
				`🔴 ${Platform.isDesktopApp ? t('Check the developer console for error details. ') : ''}${error}`,
				10 * 1000
			)
		}
	}
})

const regenerate = async (
	app: App,
	settings: PluginSettings,
	statusBarItem: HTMLElement,
	editor: Editor,
	provider: ProviderSettings,
	range: EditorRange,
	mark: string
) => {
	editor.replaceRange(mark, range.from, range.to)
	editor.setCursor({
		line: range.from.line,
		ch: editor.getLine(range.from.line).length
	})

	const messagesEndOffset = editor.posToOffset({
		line: range.from.line,
		ch: 0
	})
	const env = await buildRunEnv(app, settings)
	await generate(env, editor, provider, messagesEndOffset, statusBarItem)
}

class ConfirmModal extends Modal {
	onConfirm: () => void
	constructor(app: App, onConfirm: () => void) {
		super(app)
		this.onConfirm = onConfirm
	}

	onOpen() {
		const { contentEl } = this
		contentEl.createEl('h2', { text: t('Regenerate?') })
		contentEl.createEl('p', {
			text: t(
				'This will delete the current response content. You can configure this in settings to not require confirmation.'
			)
		})

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText('确认')
				.setCta()
				.onClick(async () => {
					this.close()
					await this.onConfirm()
				})
		)
	}
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
