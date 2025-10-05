import { type Command, type Editor, type MarkdownView, Notice, Platform } from 'obsidian'
import { createLogger } from '../logger'
import { t } from 'src/lang/helper'
import { toNewChatMark } from 'src/suggest'
import type { TagCmdMeta } from './tagCmd'

const logger = createLogger('commands:new-chat-tag')

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
			logger.error('new chat tag command failed', error)
			const err = error instanceof Error ? error : new Error(String(error))
			new Notice(
				`🔴 ${Platform.isDesktopApp ? t('Check the developer console for error details. ') : ''}${err}`,
				10 * 1000
			)
		}
	}
})
