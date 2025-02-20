import { App, Command, Editor, MarkdownView, Notice, normalizePath } from 'obsidian'
import { t } from 'src/lang/helper'
import { PluginSettings } from 'src/settings'
import { PromptTemplate } from './types'

const APP_FOLDER = 'tars'

const showFileMeta = async (app: App) => {
	const activeFile = app.workspace.getActiveFile()
	if (!activeFile) {
		throw new Error('No active file')
	}

	console.log('path', activeFile.path)
	console.log('basename', activeFile.basename)
	console.log('extension', activeFile.extension)
	console.log('parent path', activeFile.parent?.path)
	console.log('grandparent path', activeFile.parent?.parent?.path)

	console.log('root path', app.vault.getRoot().path)
	const appMeta = app.metadataCache
	const fileMeta = appMeta.getFileCache(activeFile)
	if (!fileMeta) {
		throw new Error('No cached metadata found')
	}

	console.log('fileMeta', fileMeta)
	console.log('sections', fileMeta.sections)
}

export const showFileMetaCmd = (app: App) => ({
	id: 'ShowFileMeta',
	name: 'Show file meta',
	callback: () => showFileMeta(app)
})

export const generateFromSelectedCmd = (app: App, settings: PluginSettings): Command => ({
	id: 'generate',
	name: t('Generate from the selected text / current line'),
	editorCallback: async (editor: Editor, view: MarkdownView) => {
		const onChoose = (template: PromptTemplate) => {
			// this.generateText(editor, template)
		}
		// const promptTemplates = await fetchPromptTemplates(app, settings)
		// new SelectPromptTemplateModal(app, promptTemplates, settings.lastUsedTemplateTitle, onChoose).open()
	}
})

export const viewPromptTemplatesCmd = (app: App, settings: PluginSettings): Command => ({
	id: 'view-prompt-templates',
	name: 'View prompt templates',
	callback: async () => {
		await getTemplatesWithCreate(app, settings, true)
	}
})

const getTemplatesWithCreate = async (app: App, settings: PluginSettings, open: boolean) => {
	if (!(await app.vault.adapter.exists(normalizePath(APP_FOLDER)))) {
		await app.vault.createFolder(APP_FOLDER)
		new Notice(t('Create tars folder'))
	}

	const promptFilePath = normalizePath(`${APP_FOLDER}/${t('promptFileName')}.md`)
	if (!(await app.vault.adapter.exists(promptFilePath))) {
		await app.vault.create(promptFilePath, t('PRESET_PROMPT_TEMPLATES'))
		new Notice('Create prompt template file')
	}

	if (open) {
		console.debug('open prompt file')
		await app.workspace.openLinkText('', promptFilePath, true)
	}

	// 解析，先输出到命令行
}

export const getTemplates = (fileContent: string): PromptTemplate[] => {
	const templates: PromptTemplate[] = [
		{
			title: 'test',
			content: 'test'
		}
	]
	return templates
}
