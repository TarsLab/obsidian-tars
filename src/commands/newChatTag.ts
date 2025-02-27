import { Command, Editor, MarkdownView, Notice, Platform } from 'obsidian'
import { t } from 'src/lang/helper'
import { toNewChatMark } from 'src/suggest'
import { TagCmdMeta } from './tagCmd'

export const newChatTagCmd = ({ id, name, tag }: TagCmdMeta): Command => ({
	id,
	name,
	editorCallback: async (editor: Editor, view: MarkdownView) => {
		try {
			// 先用最简单的方式，直接insert。不作其他判断，也不考虑换行
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
