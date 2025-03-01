import { App, Command, Editor, MarkdownView, Notice, Platform } from 'obsidian'
import { t } from 'src/lang/helper'
import { PluginSettings } from 'src/settings'
import { toSpeakMark } from 'src/suggest'
import { TagCmdMeta } from './tagCmd'
import { fetchTagMeta, insertMarkToBegin, insertMarkToEmptyLines, isEmptyLines, replaceTag } from './tagUtils'

export const userTagCmd = ({ id, name, tag }: TagCmdMeta, app: App, settings: PluginSettings): Command => ({
	id,
	name,
	editorCallback: async (editor: Editor, view: MarkdownView) => {
		try {
			const mark = toSpeakMark(tag)
			const { range, role, tagContent, tagRange } = fetchTagMeta(app, editor, settings)
			console.debug('userTagCmd', { range, role, tagContent, tagRange })

			// 如果是空行，直接插入标签
			if (isEmptyLines(editor, range)) {
				return insertMarkToEmptyLines(editor, range.from, mark)
			}

			// 如果是普通文本，前面插入标签
			if (role === null) {
				return insertMarkToBegin(editor, range, mark)
			}

			// 如果是 userTag，tag不同，则替换
			if (role === 'user') {
				if (tag !== tagContent && tagRange) {
					return replaceTag(editor, range, tagRange, tag)
				}
			} else {
				// 剩下的 asstTag， systemTag。newChat混合，不兼容类型，notice 提示选中的是xx消息，同时选中文本。
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
