import { App, Command, Editor, MarkdownView, Notice, Platform } from 'obsidian'
import { t } from 'src/lang/helper'
import { PluginSettings } from 'src/settings'
import { answer, openProviderModal } from './answer'
import { getSortedPromptTemplates, question } from './question'
import { BASIC_PROMPT_TEMPLATE, PromptTemplate } from './types'

export const qaCmd = (
	app: App,
	settings: PluginSettings,
	statusBarItem: HTMLElement,
	saveSettings: () => Promise<void>
): Command => ({
	id: 'qa',
	name: t('Question & Answer: Recently used template and assistant'),
	editorCallback: async (editor: Editor, view: MarkdownView) => {
		try {
			if (settings.userTags.length === 0) {
				new Notice(t('At least one user tag is required'))
				return
			}
			if (!settings.providers.length) {
				new Notice(t('Please add one assistant in the settings first'))
				return
			}
			const sortedPromptTemplates = await getSortedPromptTemplates(app, settings)
			const matchedTemplate = sortedPromptTemplates.find((t) => t.title === settings.lastUsedTemplateTitle)
			let promptTemplate: PromptTemplate | undefined
			if (!matchedTemplate) {
				new Notice('Last used template not found, reset to basic template')
				console.debug('Last used template not found, reset to basic template')
				promptTemplate = BASIC_PROMPT_TEMPLATE
				settings.lastUsedTemplateTitle = promptTemplate.title
				await saveSettings()
			} else {
				if (matchedTemplate.title !== BASIC_PROMPT_TEMPLATE.title) {
					new Notice('Selected template: ' + matchedTemplate.title)
					console.debug('Selected template: ' + matchedTemplate.title)
				}

				promptTemplate = matchedTemplate
			}

			question(app, editor, settings.userTags, promptTemplate)
			const provider = settings.providers.find((p) => p.tag === settings.lastUsedProviderTag)

			if (provider != undefined && settings.lastUsedProviderTag != undefined) {
				await answer(app, editor, settings, statusBarItem, provider, settings.answerDelayInMilliseconds)
			} else {
				await openProviderModal(app, editor, settings, statusBarItem, saveSettings)
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
