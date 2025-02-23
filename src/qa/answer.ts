import { App, Command, Editor, MarkdownView, Notice, Platform } from 'obsidian'
import { buildRunEnv, generate } from 'src/editor'
import { t } from 'src/lang/helper'
import { ProviderSettings } from 'src/providers'
import { PluginSettings } from 'src/settings'
import { toSpeakMark } from 'src/suggest'
import { SelectProviderSettingModal } from './modal'
import { HARD_LINE_BREAK } from './types'

export const answer = async (
	app: App,
	editor: Editor,
	settings: PluginSettings,
	statusBarItem: HTMLElement,
	providerSettings: ProviderSettings
) => {
	const messagesEndOffset = setAssistantTag(editor, providerSettings.tag, settings.providers)
	const env = await buildRunEnv(app, settings)
	await generate(env, editor, providerSettings, messagesEndOffset, statusBarItem)
}

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
		await openProviderModal(app, editor, settings, statusBarItem, saveSettings)
	}
})

export const openProviderModal = async (
	app: App,
	editor: Editor,
	settings: PluginSettings,
	statusBarItem: HTMLElement,
	saveSettings: () => Promise<void>
) => {
	const onChooseProvider = async (provider: ProviderSettings) => {
		settings.lastUsedProviderTag = provider.tag
		await saveSettings()
		console.debug('Selected provider: ' + provider.tag)
		try {
			await answer(app, editor, settings, statusBarItem, provider)
		} catch (error) {
			console.error(error)
			new Notice(
				`🔴 ${Platform.isDesktopApp ? t('Check the developer console for error details. ') : ''}${error}`,
				10 * 1000
			)
		}
	}

	const prioritizedProviders = prioritizeLastUsed(settings.providers, settings.lastUsedProviderTag)
	new SelectProviderSettingModal(app, prioritizedProviders, onChooseProvider, settings.lastUsedProviderTag).open()
}

/** 遵循对话语法。这里主要是设置空行 */
export const setAssistantTag = (editor: Editor, tag: string, providers: ProviderSettings[]) => {
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

const prioritizeLastUsed = (provider: ProviderSettings[], lastUsedProviderTag?: string) => {
	if (!lastUsedProviderTag) {
		return provider
	}
	const lastUsedProviderIndex = provider.findIndex((p) => p.tag === lastUsedProviderTag)
	if (lastUsedProviderIndex === -1) {
		return provider
	}

	return [
		provider[lastUsedProviderIndex],
		...provider.slice(0, lastUsedProviderIndex),
		...provider.slice(lastUsedProviderIndex + 1)
	]
}

const isStartWithAssistantTag = (lineContent: string, providers: ProviderSettings[]) => {
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
