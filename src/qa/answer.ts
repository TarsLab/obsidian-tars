import { App, Command, Editor, MarkdownView, Notice, Platform } from 'obsidian'
import { buildRunEnv, generate } from 'src/editor'
import { t } from 'src/lang/helper'
import { PluginSettings } from 'src/settings'
import { toSpeakMark } from 'src/suggest'
import { SelectProviderModal } from './modal'
import { Provider } from './types'

const HARD_LINE_BREAK = '  \n' // 两个空格加换行符, hard line break in markdown

export const answerCmd = (
	app: App,
	settings: PluginSettings,
	statusBarItem: HTMLElement,
	saveSettings: () => Promise<void>
): Command => ({
	id: 'answer',
	name: 'Answer',
	editorCallback: async (editor: Editor, view: MarkdownView) => {
		if (!settings.providers.length) {
			new Notice('Please add one assistant in the settings first')
			return
		}
		const providers: Provider[] = settings.providers.map((p) => ({
			tag: p.tag,
			description: p.options.model
		}))

		const onChooseProvider = async (provider: Provider) => {
			settings.lastUsedProviderTag = provider.tag
			console.debug('Selected provider: ' + provider.tag)
			await saveSettings()
			try {
				const messagesEndOffset = applyAssistantTag(editor, provider.tag, providers)
				const env = await buildRunEnv(app, settings)
				const providerSettings = settings.providers.find((p) => p.tag === provider.tag)
				if (!providerSettings) {
					throw new Error('No provider found ' + provider.tag)
				}
				console.debug('endOffset', messagesEndOffset)
				await generate(env, editor, providerSettings, messagesEndOffset, statusBarItem)
			} catch (error) {
				console.error(error)
				new Notice(
					`🔴 ${Platform.isDesktopApp ? t('Check the developer console for error details. ') : ''}${error}`,
					10 * 1000
				)
			}
		}

		const prioritizeLastUsedProvider = (providers: Provider[], lastUsedProviderTag?: string) => {
			if (!lastUsedProviderTag) {
				return providers
			}
			const lastUsedProviderIndex = providers.findIndex((p) => p.tag === lastUsedProviderTag)
			if (lastUsedProviderIndex === -1) {
				return providers
			}

			return [
				providers[lastUsedProviderIndex],
				...providers.slice(0, lastUsedProviderIndex),
				...providers.slice(lastUsedProviderIndex + 1)
			]
		}
		const prioritizedProviders = prioritizeLastUsedProvider(providers, settings.lastUsedProviderTag)
		new SelectProviderModal(app, prioritizedProviders, onChooseProvider, settings.lastUsedProviderTag).open()
	}
})

const applyAssistantTag = (editor: Editor, tag: string, providers: Provider[]) => {
	const cursor = editor.getCursor()
	const assistantMark = toSpeakMark(tag)
	const currentLine = cursor.line
	let lnToWrite = null
	if (editor.getLine(currentLine).trim().length > 0) {
		// 当前行非空
		if (isStartWithAssistantTag(editor.getLine(currentLine), providers)) {
			// 当前行以助手标签开头, 替换当前行
			editor.replaceRange(
				assistantMark,
				{
					line: currentLine,
					ch: 0
				},
				{
					line: currentLine,
					ch: editor.getLine(currentLine).length
				}
			)
			lnToWrite = currentLine
			new Notice(t('Regenerate Answer'))
		} else {
			// 不清楚的内容，换行，新一行
			editor.replaceRange(HARD_LINE_BREAK + '\n' + assistantMark, {
				line: currentLine,
				ch: editor.getLine(currentLine).length
			})
			lnToWrite = currentLine + 2
		}
	} else if (currentLine >= 1 && editor.getLine(currentLine - 1).trim().length > 0) {
		// 当前行空，前面一行非空
		editor.replaceRange(
			'\n' + assistantMark,
			{
				line: currentLine,
				ch: 0
			},
			{ line: currentLine, ch: editor.getLine(currentLine).length }
		)
		lnToWrite = currentLine + 1
	} else {
		// 当前行空，前面一行也空
		editor.replaceRange(
			assistantMark,
			{ line: currentLine, ch: 0 },
			{ line: currentLine, ch: editor.getLine(currentLine).length }
		)
		lnToWrite = currentLine
	}
	editor.setCursor({ line: lnToWrite, ch: editor.getLine(lnToWrite).length })
	const messageEndPosition = {
		line: lnToWrite,
		ch: 0
	}
	return editor.posToOffset(messageEndPosition)
}

const isStartWithAssistantTag = (lineContent: string, providers: Provider[]) => {
	// TODO，这里的逻辑需要考虑更多场景，这里先匹配常见的重试场景
	if (!lineContent.startsWith('#')) {
		return false
	}
	const stripped = lineContent.slice(1)
	for (const provider of providers) {
		if (stripped.startsWith(provider.tag)) {
			return true
		}
	}
	return false
}
