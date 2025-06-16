import Handlebars from 'handlebars'
import { App, Command, Editor, EditorSelection, MarkdownView, normalizePath, Notice, Platform } from 'obsidian'
import { refineRange } from 'src/commands/tagUtils'
import { t } from 'src/lang/helper'
import { APP_FOLDER, PluginSettings } from 'src/settings'
import { ReporterModal } from './modal'
import { findChangedTemplates, getPromptTemplatesFromFile, PromptTemplate } from './template'

export const templateToCmdId = (template: PromptTemplate): string => `Prompt#${template.title}`
export const getTitleFromCmdId = (id: string): string => id.slice(id.indexOf('#') + 1)

export const loadTemplateFileCommand = (
	app: App,
	settings: PluginSettings,
	saveSettings: () => Promise<void>,
	buildPromptCommands: () => void
): Command => ({
	id: 'LoadTemplateFile',
	name: t('Load template file: ') + `${APP_FOLDER}/${t('promptFileName')}.md`,
	callback: async () => {
		try {
			const filePath = normalizePath(`${APP_FOLDER}/${t('promptFileName')}.md`)
			const isCreated = await createPromptFileIfNotExists(app)

			if (isCreated) {
				await workspaceOpenFile(app, filePath)
				await new Promise((resolve) => setTimeout(resolve, 2000)) // Wait for file metadata to load, 2s
			}

			const { promptTemplates, reporter } = await getPromptTemplatesFromFile(app, filePath)

			// Find elements in these two arrays that have the same title but different content
			const changed = findChangedTemplates(settings.promptTemplates, promptTemplates)
			if (changed.length > 0) {
				console.debug('changed', changed)
				new Notice(t('Templates have been updated: ') + changed.map((t) => t.title).join(', '))
			}

			settings.promptTemplates = promptTemplates
			await saveSettings()
			buildPromptCommands()

			if (reporter && reporter.length > 0) {
				await workspaceOpenFile(app, filePath) // If there are syntax errors, open the file in the editor
				new ReporterModal(app, reporter).open()
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

const createPromptFileIfNotExists = async (app: App) => {
	let isCreated = false
	if (!(await app.vault.adapter.exists(normalizePath(APP_FOLDER)))) {
		await app.vault.createFolder(APP_FOLDER)
	}

	const promptFilePath = normalizePath(`${APP_FOLDER}/${t('promptFileName')}.md`)
	if (!(await app.vault.adapter.exists(promptFilePath))) {
		await app.vault.create(promptFilePath, t('PRESET_PROMPT_TEMPLATES'))
		new Notice(t('Create prompt template file') + ' ' + `${APP_FOLDER}/${t('promptFileName')}.md`)
		isCreated = true
	}

	return isCreated
}

const workspaceOpenFile = async (app: App, filePath: string) => {
	if (app.workspace.getActiveFile()?.path != filePath) {
		await app.workspace.openLinkText('', filePath, true)
	}
}

export const promptTemplateCmd = (id: string, name: string, app: App, settings: PluginSettings): Command => ({
	id,
	name,
	editorCallback: async (editor: Editor, _view: MarkdownView) => {
		try {
			const template = settings.promptTemplates.find((t) => t.title === name)
			if (!template) {
				throw new Error(`No template found. ${template}`)
			}
			const range = refineRange(app, editor)
			const { from, to } = range
			editor.setSelection(from, to)
			// Letting users see the selected text might improve the experience, but it's not essential.
			await new Promise((resolve) => setTimeout(resolve, 500))
			applyTemplate(editor, template.template)
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
	// If the selected text is within newPrompt, replace it; otherwise append
	const newPrompt = substitution.includes(selectedText) ? substitution : selectedText + substitution
	// console.debug('newPrompt', newPrompt)
	const { anchor, head } = getEditorSelection(editor)
	editor.replaceRange(newPrompt, anchor, head)
}
