import {
	App,
	Command,
	Editor,
	HeadingCache,
	MarkdownView,
	normalizePath,
	Notice,
	Platform,
	SectionCache
} from 'obsidian'
import { t } from 'src/lang/helper'
import { PluginSettings } from 'src/settings'
import { SelectPromptTemplateModal, SelectProviderModal } from './modal'
import { PromptTemplate, Provider } from './types'

const APP_FOLDER = 'Tars'

const getPromptTemplatesFromFile = async (app: App): Promise<PromptTemplate[]> => {
	const promptFilePath = normalizePath(`${APP_FOLDER}/${t('promptFileName')}.md`)
	const promptFile = app.vault.getFileByPath(promptFilePath)

	if (!promptFile) {
		throw new Error('No prompt file found. ' + promptFilePath)
	}

	const appMeta = app.metadataCache
	const fileMeta = appMeta.getFileCache(promptFile)
	if (!fileMeta) {
		throw new Error('No cached metadata found. ' + promptFilePath)
	}

	console.debug('fileMeta', fileMeta)
	console.debug('sections', fileMeta.sections)

	const sections = fileMeta.sections
	if (!sections) {
		throw new Error('No sections found. ' + promptFilePath)
	}
	const headings = fileMeta.headings
	if (!headings) {
		throw new Error('No headings found. ' + promptFilePath)
	}

	const fileText = await app.vault.cachedRead(promptFile)
	console.debug('fileText', fileText)
	// Group sections using reduce
	const sectionGroups = sections
		.reduce<SectionCache[][]>(
			(acc, section) => {
				if (section.type === 'thematicBreak') {
					// Start a new group when encountering a thematic break
					return [...acc, []]
				}
				// Add current section to the last group
				const lastGroupIndex = acc.length - 1
				acc[lastGroupIndex] = [...acc[lastGroupIndex], section]
				return acc
			},
			[[]] // Start with an empty group
		)
		.filter((group) => group.length > 0) // Remove empty groups

	console.debug('sectionGroups', sectionGroups)

	const slides = sectionGroups.slice(1) // Remove the intro slide
	console.debug('slides', slides)
	const promptTemplates = slides.map((slide) => toPromptTemplate(slide, headings, fileText))
	console.debug('promptTemplates', promptTemplates)
	return promptTemplates
}

const toPromptTemplate = (slide: SectionCache[], headings: HeadingCache[], fileText: string): PromptTemplate => {
	if (slide.length < 2) {
		throw new Error(`Line ${slide[0].position.start.line + 1}, Expected at least 2 sections, heading and content`)
	}
	if (slide[0].type !== 'heading') {
		throw new Error(`Line ${slide[0].position.start.line + 1} - ${slide[0].position.end.line + 1}, Expected heading`)
	}
	const heading = headings.find((heading) => heading.position.start.line === slide[0].position.start.line)
	if (!heading) {
		throw new Error('No heading found')
	}
	const title = heading.heading
	console.debug('title', title)

	const startOffset = slide[1].position.start.offset
	const endOffset = slide[slide.length - 1].position.end.offset
	const content = fileText.slice(startOffset, endOffset)
	console.debug('content', content)
	const trimmedContent = content.trim()
	console.debug('trimmedContent', trimmedContent)

	return {
		title,
		content: trimmedContent
	}
}

export const showFileMetaCmd = (app: App) => ({
	id: 'ShowFileMeta',
	name: 'Show file meta',
	callback: () => getPromptTemplatesFromFile(app)
})

export const generateFromSelectedCmd = (app: App, settings: PluginSettings): Command => ({
	id: 'generate',
	name: t('Generate from the selected text / current line'),
	editorCallback: async (editor: Editor, view: MarkdownView) => {
		try {
			const promptTemplates = await getTemplatesWithCreate(app, false)
			const onChooseTemplate = (template: PromptTemplate) => {
				const providers: Provider[] = settings.providers.map((p) => ({
					tag: p.tag,
					description: p.options.model
				}))
				const onChooseProvider = (provider: Provider) => {
					settings.lastUsedProviderTag = provider.tag
					settings.lastUsedTemplateTitle = template.title
					new Notice('Selected provider: ' + provider.tag)
				}
				new SelectProviderModal(app, providers, onChooseProvider, settings.lastUsedProviderTag).open()
				new Notice('Selected template: ' + template.title)
			}
			new SelectPromptTemplateModal(app, promptTemplates, onChooseTemplate, settings.lastUsedTemplateTitle).open()
		} catch (error) {
			console.error(error)
			new Notice(
				`🔴 ${Platform.isDesktopApp ? t('Check the developer console for error details. ') : ''}${error}`,
				10 * 1000
			)
		}
	}
})

export const viewPromptTemplatesCmd = (app: App): Command => ({
	id: 'view-prompt-templates',
	name: 'View prompt templates',
	callback: async () => {
		await getTemplatesWithCreate(app, true)
		// 用 modal 展示promptTemplates
	}
})

const getTemplatesWithCreate = async (app: App, open: boolean) => {
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

	const promptTemplates = await getPromptTemplatesFromFile(app)
	return promptTemplates
}
