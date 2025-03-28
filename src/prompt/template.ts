import { App, HeadingCache, SectionCache } from 'obsidian'
import { t } from 'src/lang/helper'

export interface PromptTemplate {
	readonly title: string
	readonly template: string
}

export const getPromptTemplatesFromFile = async (app: App, promptFilePath: string) => {
	const promptFile = app.vault.getFileByPath(promptFilePath)

	if (!promptFile) {
		throw new Error('No prompt file found. ' + promptFilePath)
	}

	const appMeta = app.metadataCache
	const fileMeta = appMeta.getFileCache(promptFile)
	if (!fileMeta) {
		throw new Error(t('Waiting for metadata to be ready. Please try again.'))
	}

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
			const template = toPromptTemplate(s, headings, fileText)
			if (promptTemplates.some((t) => t.title === template.title)) {
				throw new Error(`${t('Duplicate title:')} ${template.title}`)
			}
			promptTemplates.push(template)
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
		throw new Error(
			`Line ${slide[0].position.start.line + 1}, ${t('Expected at least 2 sections, heading and content')}`
		)
	}
	if (slide[0].type !== 'heading') {
		throw new Error(
			`Line ${slide[0].position.start.line + 1} - ${slide[0].position.end.line + 1}, ${t('Expected heading')}`
		)
	}
	const heading = headings.find((heading) => heading.position.start.line === slide[0].position.start.line)
	if (!heading) {
		throw new Error(`Line ${slide[0].position.start.line + 1}, ${t('Expected heading')}`)
	}
	const title = heading.heading.trim()
	if (!title) {
		throw new Error(`Line ${heading.position.start.line + 1}, ${t('Expected heading')}`)
	}

	const startOffset = slide[1].position.start.offset
	const endOffset = slide[slide.length - 1].position.end.offset
	const content = fileText.slice(startOffset, endOffset)
	const trimmedContent = content.trim()

	return {
		title,
		template: trimmedContent
	}
}

export const findChangedTemplates = (
	oldTemplates: PromptTemplate[],
	newTemplates: PromptTemplate[]
): PromptTemplate[] => {
	const result: PromptTemplate[] = []

	const oldTemplateMap = new Map<string, string>()
	oldTemplates.forEach((template) => {
		oldTemplateMap.set(template.title, template.template)
	})

	newTemplates.forEach((newTemplate) => {
		const oldTemplate = oldTemplateMap.get(newTemplate.title)

		// If the title exists in the old templates but the content is different
		if (oldTemplate !== undefined && oldTemplate !== newTemplate.template) {
			result.push(newTemplate)
		}
	})

	return result
}
