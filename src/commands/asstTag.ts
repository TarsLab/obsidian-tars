import { App, Command, Editor, EditorRange, MarkdownView, Modal, Notice, Platform, Setting } from 'obsidian'
import { buildRunEnv, generate, RequestController } from 'src/editor'
import { t } from 'src/lang/helper'
import { ProviderSettings } from 'src/providers'
import { PluginSettings } from 'src/settings'
import { StatusBarManager } from 'src/statusBarManager'
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
	statusBarManager: StatusBarManager,
	requestController: RequestController
): Command => ({
	id,
	name,
	editorCallback: async (editor: Editor, _view: MarkdownView) => {
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

			// If it's an empty line, directly insert the tag
			if (isEmptyLines(editor, range)) {
				const lnToWrite = insertMarkToEmptyLines(editor, range.from, mark)
				const messagesEndOffset = editor.posToOffset({
					line: lnToWrite,
					ch: 0
				})
				const env = await buildRunEnv(app, settings)
				await generate(
					env,
					editor,
					provider,
					messagesEndOffset,
					statusBarManager,
					settings.editorStatus,
					requestController
				)
				return
			}

			// If it's plain text, insert userTag, add a new line (only this case needs slowMo)
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
				await generate(
					env,
					editor,
					provider,
					messagesEndOffset,
					statusBarManager,
					settings.editorStatus,
					requestController
				)
			} else if (role === 'assistant') {
				// If it's an asstTag, prompt the user whether to regenerate
				if (settings.confirmRegenerate) {
					const onConfirm = async () => {
						await regenerate(app, settings, statusBarManager, requestController, editor, provider, range, mark)
					}
					new ConfirmModal(app, onConfirm).open()
				} else {
					await regenerate(app, settings, statusBarManager, requestController, editor, provider, range, mark)
				}
			} else {
				// If it's a userTag, systemTag (warn later), newChat mixed, etc., add a new line, insert assistant tag. Let subsequent code handle the judgment
				editor.setCursor({ line: range.to.line, ch: editor.getLine(range.to.line).length })
				const lnToWrite = insertText(editor, HARD_LINE_BREAK + '\n' + mark)

				const messagesEndOffset = editor.posToOffset({
					line: lnToWrite,
					ch: 0
				})
				const env = await buildRunEnv(app, settings)
				await generate(
					env,
					editor,
					provider,
					messagesEndOffset,
					statusBarManager,
					settings.editorStatus,
					requestController
				)
			}
		} catch (error) {
			console.error(error)
			if (error.name === 'AbortError') {
				statusBarManager.setCancelledStatus()
				new Notice(t('Generation cancelled'))
				return
			}

			statusBarManager.setErrorStatus(error as Error)
			new Notice(`🔴 ${Platform.isDesktopApp ? t('Click status bar for error details. ') : ''}${error}`, 10 * 1000)
		}
	}
})

const regenerate = async (
	app: App,
	settings: PluginSettings,
	statusBarManager: StatusBarManager,
	requestController: RequestController,
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
	await generate(env, editor, provider, messagesEndOffset, statusBarManager, settings.editorStatus, requestController)
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
				.setButtonText(t('Yes'))
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

	let lnToWrite = insertText(editor, mark[0] + mark[1]) // Insert the first two characters with the # symbol
	for (let i = 2; i < mark.length; i++) {
		await new Promise((resolve) => setTimeout(resolve, delay))
		lnToWrite = insertText(editor, mark[i])
	}
	return lnToWrite
}
