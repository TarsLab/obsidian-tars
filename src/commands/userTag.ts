import { App, Command, Editor, EditorPosition, MarkdownView, Notice, Platform } from 'obsidian'
import { t } from 'src/lang/helper'
import { refineSelection } from 'src/selection'
import { PluginSettings } from 'src/settings'
import { toSpeakMark } from 'src/suggest'
import { TagCmdMeta } from './tagCmd'
import { HARD_LINE_BREAK } from './utils'

export const userTagCmd = ({ id, name, tag }: TagCmdMeta, app: App, settings: PluginSettings): Command => ({
	id,
	name,
	editorCallback: async (editor: Editor, view: MarkdownView) => {
		try {
			const { anchor, head } = refineSelection(app, editor)
			editor.setSelection(anchor, head)

			console.debug('anchor', anchor)
			console.debug('head', head)
			addUserTag(editor, anchor, head, settings.userTags, tag)
		} catch (error) {
			console.error(error)
			new Notice(
				`🔴 ${Platform.isDesktopApp ? t('Check the developer console for error details. ') : ''}${error}`,
				10 * 1000
			)
		}
	}
})

const addUserTag = (editor: Editor, anchor: EditorPosition, head: EditorPosition, userTags: string[], tag: string) => {
	const selectedText = editor.getSelection()

	if (selectedText.startsWith(toSpeakMark(tag))) {
		// TODO,前面一行非空, 加空行, 这种情况先不考虑。可能是用户手动输入的
		editor.setSelection(
			// 选择后面的内容
			{
				line: anchor.line,
				ch: anchor.ch + toSpeakMark(tag).length
			},
			head
		)
		new Notice('already added user tag')
		return
	}

	const userMark = toSpeakMark(tag)
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
