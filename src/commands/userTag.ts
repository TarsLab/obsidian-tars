import { App, Command, Editor, MarkdownView, Notice, Platform } from 'obsidian'
import { t } from 'src/lang/helper'
import { PluginSettings } from 'src/settings'
import { toSpeakMark } from 'src/suggest'
import { TagCmdMeta } from './tagCmd'
import { fetchTagMeta, insertMarkToBegin, insertMarkToEmptyLines, isEmptyLines, replaceTag } from './tagUtils'

export const userTagCmd = ({ id, name, tag }: TagCmdMeta, app: App, settings: PluginSettings): Command => ({
	id,
	name,
	editorCallback: async (editor: Editor, _view: MarkdownView) => {
		try {
			const mark = toSpeakMark(tag)
			const { range, role, tagContent, tagRange } = fetchTagMeta(app, editor, settings)
			console.debug('userTagCmd', { range, role, tagContent, tagRange })

			// If it's an empty line, directly insert the tag
			if (isEmptyLines(editor, range)) {
				return insertMarkToEmptyLines(editor, range.from, mark)
			}

			// If it's plain text, insert the tag at the beginning
			if (role === null) {
				return insertMarkToBegin(editor, range, mark)
			}

			// If it's a userTag, but different tag, replace it
			if (role === 'user') {
				if (tag !== tagContent && tagRange) {
					return replaceTag(editor, range, tagRange, tag)
				}
			} else {
				// Remaining types are incompatible types. Show a notice indicating the selected content is an xx message type, while keeping the text selected.
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
