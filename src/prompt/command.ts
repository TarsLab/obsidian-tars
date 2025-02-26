import Handlebars from 'handlebars'
import { App, Command, Editor, MarkdownView, Notice } from 'obsidian'
import { t } from 'src/lang/helper'
import { getEditorSelection } from 'src/selection'
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
	name: 'Prompt template',
	editorCallback: async (editor: Editor, view: MarkdownView) => {
		const sortedPromptTemplates = await getSortedPromptTemplates(app, settings)
		const onChooseTemplate = async (template: PromptTemplate) => {
			new Notice(t('Selected template: ') + template.title)
			settings.lastUsedTemplateTitle = template.title
			await saveSettings()
			applyTemplate(editor, template)
		}

		new SelectPromptTemplateModal(app, sortedPromptTemplates, onChooseTemplate, settings.lastUsedTemplateTitle).open()
	}
})

const getSortedPromptTemplates = async (app: App, settings: PluginSettings): Promise<PromptTemplate[]> => {
	const { promptTemplates } = await fetchOrCreateTemplates(app, false)
	const sortedPromptTemplates = prioritizeLastUsedTemplate(promptTemplates, settings.lastUsedTemplateTitle)
	return sortedPromptTemplates
}

const applyTemplate = (editor: Editor, promptTemplate: PromptTemplate) => {
	const selectedText = editor.getSelection()
	console.debug('selectedText', selectedText)
	const templateFn = Handlebars.compile(promptTemplate.template, { noEscape: true })
	console.debug('selectedText', selectedText)
	const substitution = templateFn({ s: selectedText })
	const newPrompt = substitution.includes(selectedText) ? substitution : selectedText + substitution // 选中文本在newPrompt中，替换，否则追加
	console.debug('newPrompt', newPrompt)
	const { anchor, head } = getEditorSelection(editor)
	editor.replaceRange(newPrompt, anchor, head)

	const newSelection = getEditorSelection(editor)
	editor.setCursor({
		line: newSelection.head.line,
		ch: editor.getLine(newSelection.head.line).length
	})
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
