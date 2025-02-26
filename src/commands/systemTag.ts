import { Command, Editor, MarkdownView, Notice, Platform } from 'obsidian'
import { t } from 'src/lang/helper'
import { TagCmdMeta } from './tagCmd'

export const systemTagCmd = ({ id, name, tag }: TagCmdMeta): Command => ({
	id,
	name,
	editorCallback: async (editor: Editor, view: MarkdownView) => {
		try {
			new Notice(`systemTagCmd ${tag}`)
			console.debug('systemTagCmd', tag)
		} catch (error) {
			console.error(error)
			new Notice(
				`🔴 ${Platform.isDesktopApp ? t('Check the developer console for error details. ') : ''}${error}`,
				10 * 1000
			)
		}
	}
})
