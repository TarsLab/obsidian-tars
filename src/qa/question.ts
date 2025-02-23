import Handlebars from 'handlebars'
import { App, Command, Editor, EditorPosition, EditorSelection, MarkdownView, Notice, Platform } from 'obsidian'
import { t } from 'src/lang/helper'
import { PluginSettings } from 'src/settings'
import { toSpeakMark } from 'src/suggest'
import { SelectPromptTemplateModal } from './modal'
import { fetchOrCreateTemplates } from './promptTemplate'
import { BASIC_PROMPT_TEMPLATE, PromptTemplate } from './types'

export const questionCmd = (app: App, settings: PluginSettings, saveSettings: () => Promise<void>): Command => ({
	id: 'question',
	name: 'Question: selected sections / current section at cursor', // 这里隐藏了空行也行，在文档说明就好
	editorCallback: async (editor: Editor, view: MarkdownView) => {
		try {
			const userTag = settings.userTags.first()
			if (!userTag) {
				new Notice('At least one user tag is required')
				return
			}
			const sortedPromptTemplates = await getSortedPromptTemplates(app, settings)
			const onChooseTemplate = async (template: PromptTemplate) => {
				new Notice('Selected template: ' + template.title)
				settings.lastUsedTemplateTitle = template.title
				await saveSettings()
				question(app, editor, userTag, template)
			}

			new SelectPromptTemplateModal(app, sortedPromptTemplates, onChooseTemplate, settings.lastUsedTemplateTitle).open()
		} catch (error) {
			console.error(error)
			new Notice(
				`🔴 ${Platform.isDesktopApp ? t('Check the developer console for error details. ') : ''}${error}`,
				10 * 1000
			)
		}
	}
})

export const getSortedPromptTemplates = async (app: App, settings: PluginSettings): Promise<PromptTemplate[]> => {
	const templatesFromFile = await fetchOrCreateTemplates(app, false)
	const sortedPromptTemplates = prioritizeLastUsedTemplate(
		[BASIC_PROMPT_TEMPLATE, ...templatesFromFile],
		settings.lastUsedTemplateTitle
	)
	return sortedPromptTemplates
}

export const question = (app: App, editor: Editor, userTag: string, template: PromptTemplate) => {
	const { anchor, head } = refineSelection(app, editor)
	editor.setSelection(anchor, head)

	console.debug('anchor', anchor)
	console.debug('head', head)
	addUserTag(editor, anchor, head, userTag)
	applyTemplate(editor, template)
}

const getSections = (app: App) => {
	const activeFile = app.workspace.getActiveFile()
	if (!activeFile) {
		throw new Error('No active file')
	}
	const fileMeta = app.metadataCache.getFileCache(activeFile)
	if (!fileMeta) {
		throw new Error('No cached metadata found')
	}
	return fileMeta.sections
}

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

const refineSelection = (app: App, editor: Editor): EditorSelection => {
	const selection = getEditorSelection(editor)
	console.debug('anchor', selection.anchor)
	console.debug('head', selection.head)

	const sections = getSections(app)
	if (!sections) {
		console.debug('No sections')
		throw new Error('No sections')
	}

	const anchorOffset = editor.posToOffset(selection.anchor)
	const headOffset = editor.posToOffset(selection.head)

	const [frontOffset, backOffset] = anchorOffset < headOffset ? [anchorOffset, headOffset] : [headOffset, anchorOffset]

	const overlappingSections = sections.filter(
		(s) => frontOffset <= s.position.end.offset && s.position.start.offset <= backOffset
	)

	if (overlappingSections.length === 0) {
		console.debug('No overlapping sections')
		const cursor = editor.getCursor()
		// select the whole line
		return {
			anchor: {
				line: cursor.line,
				ch: 0
			},
			head: {
				line: cursor.line,
				ch: editor.getLine(cursor.line).length
			}
		}
	}
	return {
		anchor: {
			line: overlappingSections[0].position.start.line,
			ch: overlappingSections[0].position.start.col
		},
		head: {
			line: overlappingSections[overlappingSections.length - 1].position.end.line,
			ch: overlappingSections[overlappingSections.length - 1].position.end.col
		}
	}
}

const addUserTag = async (editor: Editor, anchor: EditorPosition, head: EditorPosition, userTag: string) => {
	const userMark = toSpeakMark(userTag)
	// TODO , 检测前面是否有userTag，有则跳过userTag。
	// TODO, 是否需要加空行？
	editor.replaceRange(userMark, anchor, anchor)
	// TODO，如果之前没有选中，还要调整 anchor 和 head
}

/**
 * Apply the selected template to the selected text, 后续如何改进？
 */
const applyTemplate = async (editor: Editor, promptTemplate: PromptTemplate) => {
	const selectedText = editor.getSelection()
	const templateFn = Handlebars.compile(promptTemplate.template, { noEscape: true })
	console.debug('selectedText', selectedText)
	const substitution = templateFn({ s: selectedText })
	const newPrompt = substitution.includes(selectedText) ? substitution : selectedText + substitution // 选中文本在newPrompt中，替换，否则追加
	console.debug('newPrompt', newPrompt)
	const { anchor, head } = getEditorSelection(editor)
	editor.replaceRange(newPrompt, anchor, head)
}

const prioritizeLastUsedTemplate = (promptTemplates: PromptTemplate[], lastUsedTemplateTitle: null | string) => {
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
