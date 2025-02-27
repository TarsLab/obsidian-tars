import Handlebars from 'handlebars'
import { App, Command, Editor, EditorSelection, MarkdownView, Notice, Platform } from 'obsidian'
import { refineRange } from 'src/commands/tagUtils'
import { t } from 'src/lang/helper'
import { PluginSettings } from 'src/settings'
import { ReporterModal, SelectPromptTemplateModal } from './modal'
import { fetchOrCreateTemplates, PromptTemplate } from './template'

export const viewPromptTemplatesCmd = (app: App): Command => ({
	id: 'view-prompt-templates',
	name: t('View prompt templates: check syntax'),
	callback: async () => {
		const { reporter } = await fetchOrCreateTemplates(app, true)
		if (reporter.length > 0) {
			new ReporterModal(app, reporter).open()
		} else {
			new Notice(t('Prompt template file is syntactically correct'))
		}
	}
})

export const promptTemplateCmd = (app: App, settings: PluginSettings, saveSettings: () => Promise<void>): Command => ({
	id: 'prompt-template',
	name: t('Prompt template: selected sections / current section at cursor'),
	editorCallback: async (editor: Editor, view: MarkdownView) => {
		const sortedPromptTemplates = await getSortedPromptTemplates(app, settings)
		const onChooseTemplate = async (template: PromptTemplate) => {
			settings.lastUsedTemplateTitle = template.title
			await saveSettings()

			try {
				const range = refineRange(app, editor)
				const { from, to } = range
				editor.setSelection(from, to)
				new Notice(t('Using template') + ' : ' + template.title)
				await new Promise((resolve) => setTimeout(resolve, 500))
				applyTemplate(editor, template)
			} catch (error) {
				console.error(error)
				new Notice(
					`🔴 ${Platform.isDesktopApp ? t('Check the developer console for error details. ') : ''}${error}`,
					10 * 1000
				)
			}
		}

		new SelectPromptTemplateModal(app, sortedPromptTemplates, onChooseTemplate, settings.lastUsedTemplateTitle).open()
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

const getSortedPromptTemplates = async (app: App, settings: PluginSettings): Promise<PromptTemplate[]> => {
	const { promptTemplates } = await fetchOrCreateTemplates(app, false)
	const sortedPromptTemplates = prioritizeLastUsedTemplate(promptTemplates, settings.lastUsedTemplateTitle)
	return sortedPromptTemplates
}

const applyTemplate = (editor: Editor, promptTemplate: PromptTemplate) => {
	const selectedText = editor.getSelection()
	const templateFn = Handlebars.compile(promptTemplate.template, { noEscape: true })
	const substitution = templateFn({ s: selectedText })
	const newPrompt = substitution.includes(selectedText) ? substitution : selectedText + substitution // 选中文本在newPrompt中，替换，否则追加
	// console.debug('newPrompt', newPrompt)
	const { anchor, head } = getEditorSelection(editor)
	editor.replaceRange(newPrompt, anchor, head)
}

const prioritizeLastUsedTemplate = (promptTemplates: PromptTemplate[], lastUsedTemplateTitle?: string) => {
	const lastUsedTemplateIndex = promptTemplates.findIndex((p) => p.title === lastUsedTemplateTitle)
	if (lastUsedTemplateIndex === -1) {
		return promptTemplates
	}

	return [
		promptTemplates[lastUsedTemplateIndex],
		...promptTemplates.slice(0, lastUsedTemplateIndex),
		...promptTemplates.slice(lastUsedTemplateIndex + 1)
	]
}
