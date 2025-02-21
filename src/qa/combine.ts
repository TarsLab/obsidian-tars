import { App, Command, Editor, MarkdownView, Notice, Platform } from 'obsidian'
import { t } from 'src/lang/helper'
import { PluginSettings } from 'src/settings'
import { SelectProviderModal } from './modal'
import { Provider } from './types'

export const qaCmd = (app: App, settings: PluginSettings): Command => ({
	id: 'qa',
	name: 'Question & Answer (recently used)',
	editorCallback: async (editor: Editor, view: MarkdownView) => {
		try {
			const onChooseProvider = (provider: Provider) => {
				settings.lastUsedProviderTag = provider.tag
				new Notice('Selected provider: ' + provider.tag)
				applyAssistantTag(editor, provider.tag)
				// 类似 suggest.ts 里的 await generate(env, editor, provider, endOffset)
			}
			const providers: Provider[] = settings.providers.map((p) => ({
				tag: p.tag,
				description: p.options.model
			}))
			new SelectProviderModal(app, providers, onChooseProvider, settings.lastUsedProviderTag).open()
		} catch (error) {
			console.error(error)
			new Notice(
				`🔴 ${Platform.isDesktopApp ? t('Check the developer console for error details. ') : ''}${error}`,
				10 * 1000
			)
		}
	}
})

const applyAssistantTag = async (editor: Editor, tag: string) => {
	// 基于前面的行，另起新的一行。不去检查后面的内容。
}
