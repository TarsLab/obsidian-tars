import { App, Command, HeadingCache, normalizePath, Notice, SectionCache } from 'obsidian'
import { t } from 'src/lang/helper'
import { ReporterModal } from './modal'
import { PromptTemplate } from './types'

const APP_FOLDER = 'Tars'

export const viewPromptTemplatesCmd = (app: App): Command => ({
	id: 'view-prompt-templates',
	name: 'View prompt templates',
	callback: async () => {
		const { reporter } = await fetchOrCreateTemplates(app, true)
		if (reporter.length > 0) {
			new ReporterModal(app, reporter).open()
		}
	}
})

export const fetchOrCreateTemplates = async (app: App, open: boolean = false) => {
	if (!(await app.vault.adapter.exists(normalizePath(APP_FOLDER)))) {
		await app.vault.createFolder(APP_FOLDER)
		new Notice(t('Create tars folder'))
	}

	const promptFilePath = normalizePath(`${APP_FOLDER}/${t('promptFileName')}.md`)
	if (!(await app.vault.adapter.exists(promptFilePath))) {
		await app.vault.create(promptFilePath, t('PRESET_PROMPT_TEMPLATES'))
		new Notice('Create prompt template file')
	}

	if (open && app.workspace.getActiveFile()?.path != promptFilePath) {
		await app.workspace.openLinkText('', promptFilePath, true)
	}

	return await getPromptTemplatesFromFile(app)
}

const getPromptTemplatesFromFile = async (app: App) => {
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

	const promptTemplates: PromptTemplate[] = []
	const reporter: string[] = []
	for (const s of slides) {
		try {
			const promptTemplate = toPromptTemplate(s, headings, fileText)
			promptTemplates.push(promptTemplate)
		} catch (error) {
			reporter.push(error.message)
		}
	}
	console.debug('promptTemplates', promptTemplates)
	console.debug('reporter', reporter)
	return { promptTemplates, reporter }
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
		throw new Error(`Line ${slide[0].position.start.line + 1}, Expected heading`)
	}
	const title = heading.heading.trim()
	if (!title) {
		throw new Error(`Line ${heading.position.start.line + 1}, Expected heading title`)
	}
	console.debug('title', title)

	const startOffset = slide[1].position.start.offset
	const endOffset = slide[slide.length - 1].position.end.offset
	const content = fileText.slice(startOffset, endOffset)
	const trimmedContent = content.trim()
	console.debug('trimmedContent', trimmedContent)

	return {
		title,
		template: trimmedContent
	}
}
