import { App, normalizePath, Notice } from 'obsidian'
import { extractAllTaggedMessages } from 'src/editor'
import { buildRunEnv } from 'src/environment'
import { t } from 'src/lang/helper'
import { PluginSettings } from 'src/settings'

// Type for the enriched tagged messages returned by extractAllTaggedMessages
type ExtractedMessage = {
	content: string
	role: 'user' | 'assistant' | 'system' | 'tool'
	[key: string]: unknown
}

export const exportCmdId = 'export-to-jsonl'

export const exportCmd = (app: App, settings: PluginSettings) => ({
	id: exportCmdId,
	name: t('Export conversations to JSONL'),
	callback: async () => {
		await exportConversation(app, settings)
	}
})

const exportConversation = async (app: App, settings: PluginSettings) => {
	const env = await buildRunEnv(app, settings)
	const conversations = await extractAllTaggedMessages(env)
	console.debug('conversations', conversations)

	let query_responses = []
	try {
		query_responses = conversations.map(to_query_response_history)
	} catch (error) {
		console.error('error', error)
		new Notice(`🔴${t('Error')}: ${error}`, 10 * 1000)
		return
	}
	// console.debug('query_responses', query_responses)
	if (query_responses.length === 0) {
		new Notice(t('No conversation found'))
		return
	}

	const jsonlContent = query_responses.map((qr) => JSON.stringify(qr)).join('\n')
	const folder = app.workspace.getActiveFile()?.parent?.path
	const basename = app.workspace.getActiveFile()?.basename
	const filePath = normalizePath(`${folder}/${basename}.jsonl`)
	const tFile = app.vault.getFileByPath(filePath)
	if (tFile) {
		await app.vault.process(tFile, (_fileText) => jsonlContent)
	} else {
		await app.vault.create(filePath, jsonlContent)
	}
	new Notice(
		t('Exported to the same directory, Obsidian does not display the JSONL format. Please open with another software.'),
		5 * 1000
	)
}

const to_query_response_history = (conversation: readonly ExtractedMessage[]) => {
	// Convert ExtractedMessage to ChatMessage format and filter out tool messages
	const chatMessages = conversation
		.filter((msg) => msg.role !== 'tool')
		.map((msg) => ({
			role: msg.role as 'user' | 'assistant' | 'system',
			content: msg.content
		}))

	const messages = chatMessages

	if (messages.length < 2) {
		throw new Error('No conversation')
	}

	let system = null
	if (messages.first()?.role === 'system') {
		system = messages.shift()?.content
	}

	// TODO, if the last message is from user
	const history: [string, string][] = []
	while (messages.length > 0) {
		const user = messages.shift()
		const assistant = messages.shift()
		if (user?.role !== 'user' || assistant?.role !== 'assistant') {
			throw new Error('Invalid message role')
		}
		if (user?.content.trim().length === 0 || assistant?.content.trim().length === 0) {
			throw new Error('Empty message content')
		}
		history.push([user.content, assistant.content])
	}

	const lastTurn = history.pop()
	if (!lastTurn) {
		throw new Error('No conversation')
	}
	const [query, response] = lastTurn

	const res = {
		system,
		query,
		response,
		history: history.length > 0 ? history : null
	}

	return Object.fromEntries(Object.entries(res).filter(([_key, value]) => value != null))
}
