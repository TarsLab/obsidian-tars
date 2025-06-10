import { App, Command, Editor, MarkdownView, Notice, Platform } from 'obsidian'
import { t } from 'src/lang/helper'
import { PluginSettings } from 'src/settings'
import { toSpeakMark } from 'src/suggest'
import { TagCmdMeta } from './tagCmd'
import { fetchTagMeta, insertMarkToBegin, insertMarkToEmptyLines, isEmptyLines, replaceTag } from './tagUtils'

export const systemTagCmd = ({ id, name, tag }: TagCmdMeta, app: App, settings: PluginSettings): Command => ({
	id,
	name,
	editorCallback: async (editor: Editor, _view: MarkdownView) => {
		try {
			const mark = toSpeakMark(tag)
			const { range, role, tagContent, tagRange } = fetchTagMeta(app, editor, settings)
			console.debug('systemTagCmd', { range, role, tagContent, tagRange })

			// If it's an empty line, directly insert the tag
			if (isEmptyLines(editor, range)) {
				return insertMarkToEmptyLines(editor, range.from, mark)
			}

			// If it's plain text, insert the tag at the beginning
			if (role === null) {
				return insertMarkToBegin(editor, range, mark)
			}

			// If it's a system tag, but different tag, replace it
			if (role === 'system') {
				if (tag !== tagContent && tagRange) {
					return replaceTag(editor, range, tagRange, tag)
				}
			} else {
				// For the remaining types, which are incompatible types, show a notice indicating what message type was selected and keep the text selected.
				editor.setSelection(range.from, range.to)
				new Notice(`${t('Conversion failed. Selected sections is a')} ${t(role)} ${t('message')}`)
			}
		} catch (error) {
			console.error(error)
			new Notice(
				`🔴 ${Platform.isDesktopApp ? t('Check the developer console for error details. ') : ''}${error}`,
				10 * 1000
			)
		}
	}
})
