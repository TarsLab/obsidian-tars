import Handlebars from 'handlebars'
import { App, Command, Editor, EditorSelection, MarkdownView, normalizePath, Notice, Platform } from 'obsidian'
import { refineRange } from 'src/commands/tagUtils'
import { t } from 'src/lang/helper'
import { ReporterModal } from './modal'
import { APP_FOLDER, PromptTemplate } from './template'

export interface PromptCmdMeta extends PromptTemplate {
	id: string
}

export const templateToCmdId = (template: PromptTemplate): string => `Prompt#${template.title}`
export const getTitleFromCmdId = (id: string): string => id.slice(id.indexOf('#') + 1)

export const loadTemplateFileCommand = (app: App, loadTemplateFile: () => Promise<string[] | undefined>): Command => ({
	id: 'LoadTemplateFile',
	name: t('Load template file: ') + `${APP_FOLDER}/${t('promptFileName')}.md`,
	callback: async () => {
		const promptFilePath = normalizePath(`${APP_FOLDER}/${t('promptFileName')}.md`)
		if (app.workspace.getActiveFile()?.path != promptFilePath) {
			await app.workspace.openLinkText('', promptFilePath, true)
		}
		const reporter = await loadTemplateFile()
		if (reporter && reporter.length > 0) {
			new ReporterModal(app, reporter).open()
		}
	}
})

export const promptTemplateCmd = ({ id, title, template }: PromptCmdMeta, app: App): Command => ({
	id,
	name: title,
	editorCallback: async (editor: Editor, view: MarkdownView) => {
		try {
			const range = refineRange(app, editor)
			const { from, to } = range
			editor.setSelection(from, to)
			await new Promise((resolve) => setTimeout(resolve, 500)) // 让用户看到选中的文本，可能体验会好些。但这不是必要的。
			applyTemplate(editor, template)
		} catch (error) {
			console.error(error)
			new Notice(
				`🔴 ${Platform.isDesktopApp ? t('Check the developer console for error details. ') : ''}${error}`,
				10 * 1000
			)
		}
	}
})

const getEditorSelection = (editor: Editor): EditorSelection => {
	const selections = editor.listSelections()
	if (selections.length === 0) {
		throw new Error('No selection')
	} else if (selections.length > 1) {
		throw new Error('Multiple selections')
	}
	const selection = selections[0]
	return selection
}

const applyTemplate = (editor: Editor, template: string) => {
	const selectedText = editor.getSelection()
	const templateFn = Handlebars.compile(template, { strict: false, noEscape: true })
	const substitution = templateFn({ s: selectedText })
	const newPrompt = substitution.includes(selectedText) ? substitution : selectedText + substitution // 选中文本在newPrompt中，替换，否则追加
	// console.debug('newPrompt', newPrompt)
	const { anchor, head } = getEditorSelection(editor)
	editor.replaceRange(newPrompt, anchor, head)
}
