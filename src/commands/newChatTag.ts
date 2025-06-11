import { Command, Editor, MarkdownView, Notice, Platform } from 'obsidian'
import { t } from 'src/lang/helper'
import { toNewChatMark } from 'src/suggest'
import { TagCmdMeta } from './tagCmd'

export const newChatTagCmd = ({ id, name, tag }: TagCmdMeta): Command => ({
	id,
	name,
	editorCallback: async (editor: Editor, _view: MarkdownView) => {
		try {
			// Keep it simple for now, just insert directly. No other checks or line break handling.
			const cursor = editor.getCursor()
			const mark = toNewChatMark(tag)
			editor.replaceRange(mark, cursor)
			editor.setCursor(cursor.line, cursor.ch + mark.length)
		} catch (error) {
			console.error(error)
			new Notice(
				`🔴 ${Platform.isDesktopApp ? t('Check the developer console for error details. ') : ''}${error}`,
				10 * 1000
			)
		}
	}
})
