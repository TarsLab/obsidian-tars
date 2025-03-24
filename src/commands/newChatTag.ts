import { Command, Editor, MarkdownView, Notice, Platform } from 'obsidian'
import { t } from 'src/lang/helper'
import { toNewChatMark } from 'src/suggest'
import { TagCmdMeta } from './tagCmd'

export const newChatTagCmd = ({ id, name, tag }: TagCmdMeta): Command => ({
	id,
	name,
	editorCallback: async (editor: Editor, view: MarkdownView) => {
		try {
			// Simple approach, direct insert. No other judgments or line break considerations
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
