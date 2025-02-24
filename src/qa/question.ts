import Handlebars from 'handlebars'
import { App, Command, Editor, EditorPosition, EditorSelection, MarkdownView, Notice, Platform } from 'obsidian'
import { t } from 'src/lang/helper'
import { PluginSettings } from 'src/settings'
import { toSpeakMark } from 'src/suggest'
import { SelectPromptTemplateModal } from './modal'
import { fetchOrCreateTemplates } from './promptTemplate'
import { BASIC_PROMPT_TEMPLATE, HARD_LINE_BREAK, PromptTemplate } from './types'

export const questionCmd = (app: App, settings: PluginSettings, saveSettings: () => Promise<void>): Command => ({
	id: 'question',
	name: t('Question: selected sections / current section at cursor'), // 这里隐藏了空行也行，在文档说明就好
	editorCallback: async (editor: Editor, view: MarkdownView) => {
		try {
			if (settings.userTags.length === 0) {
				new Notice('At least one user tag is required')
				return
			}
			const sortedPromptTemplates = await getSortedPromptTemplates(app, settings)
			const onChooseTemplate = async (template: PromptTemplate) => {
				new Notice('Selected template: ' + template.title)
				settings.lastUsedTemplateTitle = template.title
				await saveSettings()
				question(app, editor, settings.userTags, template)
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
	const { promptTemplates } = await fetchOrCreateTemplates(app, false)
	const sortedPromptTemplates = prioritizeLastUsedTemplate(
		[BASIC_PROMPT_TEMPLATE, ...promptTemplates],
		settings.lastUsedTemplateTitle
	)
	return sortedPromptTemplates
}

export const question = (app: App, editor: Editor, userTags: string[], template: PromptTemplate) => {
	const { anchor, head } = refineSelection(app, editor)
	editor.setSelection(anchor, head)

	console.debug('anchor', anchor)
	console.debug('head', head)
	addUserTag(editor, anchor, head, userTags)
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

const addUserTag = (editor: Editor, anchor: EditorPosition, head: EditorPosition, userTags: string[]) => {
	const selectedText = editor.getSelection()
	for (const t of userTags) {
		if (selectedText.startsWith(toSpeakMark(t))) {
			// TODO,前面一行非空, 加空行, 这种情况先不考虑。可能是用户手动输入的
			editor.setSelection(
				// 选择后面的内容
				{
					line: anchor.line,
					ch: anchor.ch + toSpeakMark(t).length
				},
				head
			)
			console.debug('already added user tag', t)
			return
		}
	}

	const userMark = toSpeakMark(userTags[0])
	let insertText = ''
	let line = anchor.line
	if (anchor.line > 0 && editor.getLine(anchor.line - 1).trim().length > 0) {
		// 前面一行非空, 加空行
		insertText = HARD_LINE_BREAK + '\n' + userMark
		line += 1
	} else {
		insertText = userMark
	}

	editor.replaceRange(insertText, anchor, anchor)

	// 如果之前没有选中，还要 把cursor设置到最后
	if (editor.posToOffset(anchor) === editor.posToOffset(head)) {
		editor.setCursor({
			line,
			ch: editor.getLine(line).length
		})
	}
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
