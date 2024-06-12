import { App, Command, Editor, Notice } from 'obsidian'
import { buildRunEnv, fetchConversation, fetchTagsWithSections, insertText } from 'src/editor'
import { t } from 'src/lang/helper'
import { PluginSettings, availableVendors } from 'src/settings'

export const selectAllResponsesCmd = (app: App, settings: PluginSettings): Command => ({
	id: 'select-all-responses',
	name: 'Select All Responses',
	// 清空所有回答
	editorCallback: async (editor) => {
		await selectAllResponses(app, settings, editor)
	}
})

export const fillFirstBlankAsstTagCmd = (app: App, settings: PluginSettings): Command => ({
	id: 'fill-first-blank-assistant',
	name: 'Fill first blank assistant',
	// 填充第一个空白助手标签
	editorCallback: async (editor) => {
		await fillFirstBlankAsstTag(app, settings, editor)
	}
})

const fillFirstBlankAsstTag = async (app: App, settings: PluginSettings, editor: Editor) => {
	const env = await buildRunEnv(app, settings)
	const { fileText } = env

	const firstBlankAsstTag = fetchTagsWithSections(env, 0, Infinity)
		.map((tag) => ({
			...tag,
			content: fileText.slice(tag.contentRange[0], tag.contentRange[1])
		}))
		.find((tag) => tag.role === 'assistant' && tag.content.trim() === '')

	if (!firstBlankAsstTag) {
		new Notice('No blank assistant tag found')
		return
	}

	const insertPosition = editor.offsetToPos(firstBlankAsstTag.tagRange[1] + 1)
	const conversation = await fetchConversation(env, 0, firstBlankAsstTag.tagRange[0] - 1)
	const messages = conversation.map((c) => ({ role: c.role, content: c.content }))
	editor.setCursor(insertPosition)

	// const llmProvider = providers.find((provider) => provider.tag.toLowerCase() === firstBlankAsstTag.lowerCaseTag)
	// if (!llmProvider) {
	// 	throw new Error('No provider found')
	// }

	const provider = settings.providers.find((p) => p.tag.toLowerCase() === firstBlankAsstTag.lowerCaseTag)
	if (!provider) {
		throw new Error('No provider found')
	}
	const vendor = availableVendors.find((v) => v.name === provider.vendor)
	if (!vendor) {
		throw new Error('No vendor found ' + provider.vendor)
	}
	const sendRequest = vendor.sendRequestFunc(provider.options)

	try {
		for await (const text of sendRequest(messages)) {
			insertText(editor, text)
		}
		new Notice('Text generated successfully')
	} catch (error) {
		console.error('error', error)
		new Notice(`🔴${t('Error')}: ${error}`, 10 * 1000)
	}
}

const selectAllResponses = async (app: App, settings: PluginSettings, editor: Editor) => {
	const env = await buildRunEnv(app, settings)
	const { fileText } = env
	const tagsWithOriginContent = fetchTagsWithSections(env, 0, Infinity).map((tag) => ({
		...tag,
		content: fileText.slice(tag.contentRange[0], tag.contentRange[1])
	}))

	const ranges = tagsWithOriginContent
		.filter((tag) => tag.role === 'assistant')
		.map((tag) => ({
			anchor: editor.offsetToPos(tag.contentRange[0]),
			head: editor.offsetToPos(tag.contentRange[1])
		}))

	editor.setSelections(ranges)
}
