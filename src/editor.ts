import {
	type App,
	debounce,
	type Editor,
	type EditorPosition,
	type EmbedCache,
	type LinkCache,
	type MetadataCache,
	Notice,
	normalizePath,
	parseLinktext,
	type ReferenceCache,
	resolveSubpath,
	type SectionCache,
	type TagCache,
	type Vault
} from 'obsidian'
import { t } from 'src/lang/helper'
import { TextEditStream } from 'src/streams/edit-stream'
import { createLogger } from './logger'
import type { MCPServerManager } from './mcp/managerMCPUse'
import { formatUtilitySectionCallout, type UtilitySectionServer } from './mcp/utilitySectionFormatter'
import type {
	CreatePlainText,
	Message,
	ProviderSettings,
	ResolveEmbedAsBinary,
	SaveAttachment,
	Vendor
} from './providers'
import { withStreamLogging } from './providers/decorator'
import { APP_FOLDER, availableVendors, type EditorStatus, type PluginSettings } from './settings'
import type { GenerationStats, StatusBarManager } from './statusBarManager'
import type { TagRole } from './suggest'
import { DocumentWriteLock, runWithLock } from './utils/documentWriteLock'

const logger = createLogger('editor')
const streamLogger = createLogger('editor:stream')

export interface RunEnv {
	readonly appMeta: MetadataCache
	readonly vault: Vault
	readonly fileText: string
	readonly filePath: string
	readonly tags: TagCache[]
	readonly sections: SectionCache[]
	readonly links?: LinkCache[]
	readonly embeds?: ReferenceCache[]
	readonly options: {
		newChatTags: string[]
		userTags: string[]
		assistantTags: string[]
		systemTags: string[]
		enableInternalLink: boolean
		enableInternalLinkForAssistantMsg: boolean
		enableDefaultSystemMsg: boolean
		defaultSystemMsg: string
		enableStreamLog: boolean
	}
	saveAttachment: SaveAttachment
	resolveEmbed: ResolveEmbedAsBinary
	createPlainText: CreatePlainText
}

interface Tag extends Omit<Message, 'content'> {
	readonly tag: TagRole
	readonly lowerCaseTag: string
	readonly tagRange: [number, number]
	readonly tagLine: number
}

interface TaggedBlock extends Tag {
	readonly contentRange: [number, number]
	readonly line: [number, number]
	readonly sections: SectionCache[]
}

const ignoreSectionTypes: readonly string[] = ['callout']

export const buildRunEnv = async (app: App, settings: PluginSettings): Promise<RunEnv> => {
	const activeFile = app.workspace.getActiveFile()
	if (!activeFile) {
		throw new Error('No active file')
	}

	const appMeta = app.metadataCache
	const vault = app.vault
	const fileText = await vault.cachedRead(activeFile)
	const filePath = activeFile.path
	const fileMeta = appMeta.getFileCache(activeFile)
	if (!fileMeta) {
		throw new Error(t('Waiting for metadata to be ready. Please try again.'))
	}

	const ignoreSections = fileMeta.sections?.filter((s) => ignoreSectionTypes.includes(s.type)) || []
	const filteredTags = (fileMeta.tags || []).filter(
		(t) =>
			!ignoreSections.some(
				(s) => s.position.start.offset <= t.position.start.offset && t.position.end.offset <= s.position.end.offset
			)
	)

	const options = {
		newChatTags: settings.newChatTags,
		userTags: settings.userTags,
		assistantTags: settings.providers.map((p) => p.tag),
		systemTags: settings.systemTags,
		enableInternalLink: settings.enableInternalLink,
		enableInternalLinkForAssistantMsg: settings.enableInternalLinkForAssistantMsg,
		enableDefaultSystemMsg: settings.enableDefaultSystemMsg,
		defaultSystemMsg: settings.defaultSystemMsg,
		enableStreamLog: settings.enableStreamLog
	}

	const saveAttachment = async (filename: string, data: ArrayBuffer) => {
		const attachmentPath = await app.fileManager.getAvailablePathForAttachment(filename)
		await vault.createBinary(attachmentPath, data)
	}
	const resolveEmbed = async (embed: EmbedCache) => {
		const { path, subpath } = parseLinktext(embed.link)
		logger.debug('resolving embed reference', { path, subpath })
		const targetFile = appMeta.getFirstLinkpathDest(path, filePath)
		if (targetFile === null) {
			throw new Error(`LinkText broken: ${embed.link.substring(0, 20)}`)
		}
		return await vault.readBinary(targetFile)
	}
	const createPlainText = async (filePath: string, text: string) => {
		await vault.create(filePath, text)
	}

	return {
		appMeta,
		vault,
		fileText,
		filePath,
		tags: filteredTags,
		sections: fileMeta.sections?.filter((s) => !ignoreSectionTypes.includes(s.type)) || [],
		links: fileMeta.links,
		embeds: fileMeta.embeds,
		options,
		saveAttachment,
		resolveEmbed,
		createPlainText
	}
}

const resolveLinkedContent = async (env: RunEnv, linkText: string) => {
	const { appMeta, vault, filePath } = env
	const { path, subpath } = parseLinktext(linkText)
	logger.debug('resolving linked content', { path, subpath })

	const targetFile = appMeta.getFirstLinkpathDest(path, filePath)

	if (targetFile === null) {
		throw new Error(`LinkText broken: ${linkText.substring(0, 20)}`)
	}

	const fileMeta = appMeta.getFileCache(targetFile)
	if (fileMeta === null) throw new Error(`No metadata found: ${path} ${subpath}`)

	const targetFileText = await vault.cachedRead(targetFile)
	if (subpath) {
		const subPathData = resolveSubpath(fileMeta, subpath)
		if (subPathData === null) throw new Error(`no subpath data found: ${subpath}`)
		return targetFileText.substring(subPathData.start.offset, subPathData.end ? subPathData.end.offset : undefined)
	} else {
		return targetFileText
	}
}

const extractTaggedBlocks = (env: RunEnv, startOffset: number, endOffset: number) => {
	const {
		tags,
		sections,
		options: { userTags, assistantTags, systemTags }
	} = env

	const roleMappedTags: Tag[] = tags
		.filter((t) => startOffset <= t.position.start.offset && t.position.end.offset <= endOffset)
		.map((t) => {
			const lowerCaseTag = t.tag.slice(1).split('/')[0].toLowerCase()
			const role = userTags.some((ut) => ut.toLowerCase() === lowerCaseTag)
				? 'user'
				: assistantTags.some((at) => at.toLowerCase() === lowerCaseTag)
					? 'assistant'
					: systemTags.some((st) => st.toLowerCase() === lowerCaseTag)
						? 'system'
						: null
			return role != null
				? {
						tag: t.tag,
						role,
						lowerCaseTag,
						tagRange: [t.position.start.offset, t.position.end.offset] as [number, number],
						tagLine: t.position.start.line
					}
				: null
		})
		.filter((t) => t !== null) as Tag[]
	logger.debug('role mapped tags identified', {
		count: roleMappedTags.length,
		roles: [...new Set(roleMappedTags.map((tag) => tag.tag))]
	})

	const ranges: [number, number][] = roleMappedTags.map((tag, i) => [
		tag.tagRange[0],
		roleMappedTags[i + 1] ? roleMappedTags[i + 1].tagRange[0] - 1 : endOffset
	])

	const taggedBlocks: TaggedBlock[] = ranges.map((range, i) => ({
		...roleMappedTags[i],
		contentRange: [
			roleMappedTags[i].tagRange[1] + 2,
			roleMappedTags[i + 1] ? roleMappedTags[i + 1].tagRange[0] - 1 : endOffset
		], // +2 because there is a space and a colon after the tag
		sections: sections.filter(
			(section) =>
				section.position.end.offset <= range[1] &&
				(section.position.start.offset < range[0] ? section.position.end.offset > range[0] : true)
		),
		line: [roleMappedTags[i].tagLine, roleMappedTags[i + 1] ? roleMappedTags[i + 1].tagLine - 1 : Infinity]
	}))
	logger.debug('tagged blocks extracted', { count: taggedBlocks.length })
	return taggedBlocks
}

const resolveTextRangeWithLinks = async (
	env: RunEnv,
	section: SectionCache,
	contentRange: readonly [number, number],
	role: 'user' | 'assistant' | 'system'
) => {
	const {
		fileText,
		links = [],
		embeds = [],
		options: { enableInternalLink, enableInternalLinkForAssistantMsg }
	} = env

	const startOffset = section.position.start.offset <= contentRange[0] ? contentRange[0] : section.position.start.offset

	const endOffset = section.position.end.offset

	const linksWithType = links.map((link) => ({
		ref: link,
		type: 'link' as const
	}))

	const embedsWithType = embeds.map((embed) => ({
		ref: embed,
		type: 'embed' as const
	}))

	const ordered = [...linksWithType, ...embedsWithType].sort(
		(a, b) => a.ref.position.start.offset - b.ref.position.start.offset
	)

	const filteredRefers = ordered.filter(
		(item) => startOffset <= item.ref.position.start.offset && item.ref.position.end.offset <= endOffset
	)

	const shouldResolveLinks = role === 'assistant' ? enableInternalLinkForAssistantMsg : enableInternalLink
	const resolvedLinkTexts = await Promise.all(
		filteredRefers.map(async (item) => {
			const referCache = item.ref
			if (item.type === 'link') {
				return {
					referCache,
					text: shouldResolveLinks ? await resolveLinkedContent(env, referCache.link) : referCache.original
				}
			}
			return {
				referCache,
				text: ''
			}
		})
	)

	const accumulatedText = resolvedLinkTexts.reduce(
		(acc, { referCache, text }) => ({
			endOffset: referCache.position.end.offset,
			text: acc.text + fileText.slice(acc.endOffset, referCache.position.start.offset) + text
		}),
		{ endOffset: startOffset, text: '' }
	)
	logger.debug('accumulated link text built', { length: accumulatedText.text.length })
	return {
		text: accumulatedText.text + fileText.slice(accumulatedText.endOffset, endOffset),
		range: [startOffset, endOffset] as [number, number]
	}
}

const extractTaggedBlockContent = async (env: RunEnv, taggedBlock: TaggedBlock) => {
	const textRanges = await Promise.all(
		taggedBlock.sections.map((section) =>
			resolveTextRangeWithLinks(env, section, taggedBlock.contentRange, taggedBlock.role)
		)
	)
	logger.debug('text ranges resolved', { count: textRanges.length })
	const accumulated = textRanges
		.map((range) => range.text)
		.join('\n\n')
		.trim()
	return accumulated
}

const filterEmbeds = (env: RunEnv, contentRange: [number, number]) =>
	env.embeds?.filter(
		(embed) => contentRange[0] <= embed.position.start.offset && embed.position.end.offset <= contentRange[1]
	)

const extractConversation = async (env: RunEnv, startOffset: number, endOffset: number) => {
	const {
		tags: tagsInMeta,
		options: { newChatTags }
	} = env

	const lastNewChatTag = tagsInMeta.findLast(
		(t) =>
			newChatTags.some((n) => t.tag.slice(1).split('/')[0].toLowerCase() === n.toLowerCase()) &&
			startOffset <= t.position.start.offset &&
			t.position.end.offset <= endOffset
	)
	const conversationStart = lastNewChatTag ? lastNewChatTag.position.end.offset : startOffset

	const taggedBlocks = extractTaggedBlocks(env, conversationStart, endOffset)
	const conversation = await Promise.all(
		taggedBlocks.map(async (tag) => {
			const message = {
				...tag,
				content: await extractTaggedBlockContent(env, tag)
			}
			// Only add the embeds property when there are embedded contents
			const filteredEmbeds = filterEmbeds(env, tag.contentRange)
			if (filteredEmbeds && filteredEmbeds.length > 0) {
				message.embeds = filteredEmbeds
			}
			return message
		})
	)
	return conversation
}

const debouncedResetInsertState = debounce(
	(editorStatus: EditorStatus) => {
		editorStatus.isTextInserting = false
	},
	1000,
	true
)

const insertText = async (
	editor: Editor,
	stream: TextEditStream,
	anchorId: string,
	text: string,
	editorStatus: EditorStatus,
	lastEditPos: EditorPosition | null
) => {
	editorStatus.isTextInserting = true

	const anchor = stream.findAnchor(anchorId)
	if (lastEditPos !== null) {
		// update anchor to lastEditPos
		anchor.position = editor.posToOffset(lastEditPos)
	}

	// adjust for end of line
	const cursor = editor.offsetToPos(anchor.position)
	const lineAtCursor = editor.getLine(cursor.line)
	if (lineAtCursor.length > cursor.ch) {
		anchor.position = editor.posToOffset({ line: cursor.line, ch: lineAtCursor.length })
	}

	const insertPos = editor.offsetToPos(anchor.position)
	await stream.applyChange('llm', anchorId, text)

	// sync to editor
	editor.replaceRange(text, insertPos, insertPos)

	// new position
	const position = anchor.position
	const newCursor = editor.offsetToPos(position)
	editor.setCursor(newCursor)
	debouncedResetInsertState(editorStatus)
	return newCursor
}

export const extractConversationsTextOnly = async (env: RunEnv) => {
	const {
		tags,
		options: { newChatTags }
	} = env

	const conversationTags = tags.filter((t) =>
		newChatTags.some((n) => t.tag.slice(1).split('/')[0].toLowerCase() === n.toLowerCase())
	) // support Nested tags

	const positionOffsets = conversationTags.flatMap((tag) => [
		tag.position.start.offset - 1,
		tag.position.end.offset + 1
	])
	const positions = [0, ...positionOffsets, Infinity]
	const ranges = positions
		.filter((_, index) => index % 2 === 0)
		.map((startOffset, index) => ({ startOffset, endOffset: positions[index * 2 + 1] }))

	logger.debug('conversation ranges computed', { count: ranges.length })

	const conversations = await Promise.all(
		ranges.map(async (r) => {
			const taggedBlocks = extractTaggedBlocks(env, r.startOffset, r.endOffset)
			const conversation = Promise.all(
				taggedBlocks.map(async (tag) => ({
					...tag,
					content: await extractTaggedBlockContent(env, tag)
				}))
			)
			return conversation
		})
	)

	return conversations.filter((arr) => arr.length > 0)
}

export const getMsgPositionByLine = (env: RunEnv, line: number) => {
	const {
		tags: tagsInMeta,
		sections,
		options: { systemTags, userTags, assistantTags }
	} = env
	const msgTags = [...systemTags, ...userTags, ...assistantTags]
	const msgTagsInMeta = tagsInMeta.filter((t) =>
		msgTags.some((n) => t.tag.slice(1).split('/')[0].toLowerCase() === n.toLowerCase())
	)
	const msgIndex = msgTagsInMeta.findLastIndex((t) => t.position.start.line <= line)
	if (msgIndex < 0) return [-1, -1]

	const startOffset = msgTagsInMeta[msgIndex].position.end.offset + 2
	const nextMsgIndex = msgIndex + 1
	const nextMsgStartOffset =
		nextMsgIndex < msgTagsInMeta.length ? msgTagsInMeta[nextMsgIndex].position.start.offset : Infinity
	const lastSection = sections.findLast(
		(section) => section.position.end.offset <= nextMsgStartOffset && section.position.start.line >= line
	)
	if (!lastSection) return [-1, -1]

	const endOffset = lastSection.position.end.offset
	logger.debug('message positions resolved', {
		line,
		tag: msgTagsInMeta[msgIndex].tag,
		startOffset,
		endOffset
	})
	return [startOffset, endOffset]
}

const formatDuration = (d: number) => `${(d / 1000).toFixed(2)}s`

export interface RequestController {
	getController: () => AbortController
	cleanup: () => void
}

const createDecoratedSendRequest = async (env: RunEnv, vendor: Vendor, provider: ProviderSettings) => {
	if (env.options.enableStreamLog) {
		if (!(await env.vault.adapter.exists(normalizePath(APP_FOLDER)))) {
			await env.vault.createFolder(APP_FOLDER)
		}
		logger.info('stream logging enabled for provider request')
		return withStreamLogging(vendor.sendRequestFunc(provider.options), env.createPlainText)
	} else {
		return vendor.sendRequestFunc(provider.options)
	}
}

export const generate = async (
	env: RunEnv,
	editor: Editor,
	provider: ProviderSettings,
	endOffset: number,
	statusBarManager: StatusBarManager,
	editorStatus: EditorStatus,
	requestController: RequestController,
	mcpManager?: unknown,
	mcpExecutor?: unknown,
	pluginSettings?: unknown
) => {
	try {
		const vendor = availableVendors.find((v) => v.name === provider.vendor)
		if (!vendor) {
			throw new Error(`No vendor found ${provider.vendor}`)
		}

		const documentWriteLock = new DocumentWriteLock()

		const stream = new TextEditStream(editor.getValue())
		const cursorPos = editor.posToOffset(editor.getCursor('to'))
		stream.addAnchor('cursor', cursorPos)

		const clearStreamingOutput = async () => {
			if (!startPos) return
			const startPosition = startPos
			await documentWriteLock.runExclusive(() => {
				const currentCursor = editor.getCursor('to')
				editor.replaceRange('', startPosition, currentCursor)
				editor.setCursor(startPosition)
			})
			lastEditPos = startPosition
			startPos = null
			llmResponse = ''
			statusBarManager.updateGeneratingProgress(0)
		}

		// Inject MCP manager, executor, statusBarManager, and document path into provider options if available
		if (mcpManager && mcpExecutor) {
			provider.options.mcpManager = mcpManager
			provider.options.mcpExecutor = mcpExecutor
			provider.options.documentPath = env.filePath
			provider.options.statusBarManager = statusBarManager
			provider.options.pluginSettings = pluginSettings
		}

		provider.options.editor = editor
		provider.options.documentWriteLock = documentWriteLock
		provider.options.beforeToolExecution = clearStreamingOutput

		const conversation = await extractConversation(env, 0, endOffset)
		const messages = conversation.map((c) =>
			c.embeds ? { role: c.role, content: c.content, embeds: c.embeds } : { role: c.role, content: c.content }
		)
		logger.debug('messages prepared for provider', { count: messages.length })

		const lastMsg = messages.last()
		if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content.trim().length === 0) {
			throw new Error(t('Please add a user message first, or wait for the user message to be parsed.'))
		}

		if (env.options.enableDefaultSystemMsg && messages[0]?.role !== 'system' && env.options.defaultSystemMsg) {
			// If the first message is not a system message, add the default system message
			messages.unshift({
				role: 'system',
				content: env.options.defaultSystemMsg
			})
			logger.debug('default system message injected')
		}

		await insertUtilitySectionIfEnabled(editor, provider, pluginSettings, mcpManager, documentWriteLock)

		const round = messages.filter((m) => m.role === 'assistant').length + 1

		const sendRequest = await createDecoratedSendRequest(env, vendor, provider)

		const startTime = new Date()
		statusBarManager.setGeneratingStatus(round)

		let llmResponse = ''
		const controller = requestController.getController()

		let lastEditPos: EditorPosition | null = null
		let startPos: EditorPosition | null = null
		let chunkCount = 0
		let totalTextLength = 0

		streamLogger.debug('starting generation', { messageCount: messages.length })
		streamLogger.debug('last message summary', {
			role: lastMsg.role,
			length: lastMsg.content.length
		})

		try {
			for await (const text of sendRequest(messages, controller, env.resolveEmbed, env.saveAttachment)) {
				chunkCount++
				totalTextLength += text?.length || 0

				streamLogger.debug('received chunk', {
					chunk: chunkCount,
					textLength: text?.length || 0,
					preview: text?.substring(0, 100) || 'EMPTY',
					totalResponseLength: totalTextLength
				})

				await documentWriteLock.runExclusive(async () => {
					if (startPos == null) startPos = editor.getCursor('to')
					lastEditPos = await insertText(editor, stream, 'cursor', text, editorStatus, lastEditPos)
					llmResponse += text
					statusBarManager.updateGeneratingProgress(llmResponse.length)
				})
			}
		} catch (error) {
			streamLogger.error('streaming error', error)
			throw error
		}

		streamLogger.info('streaming complete', {
			chunkCount,
			totalTextLength,
			llmResponseLength: llmResponse.length,
			llmResponsePreview: llmResponse.substring(0, 200)
		})

		const endTime = new Date()
		const duration = formatDuration(endTime.getTime() - startTime.getTime())

		// Create statistics and set success status
		const stats: GenerationStats = {
			round,
			characters: llmResponse.length,
			duration,
			model: provider.options.model,
			vendor: provider.vendor,
			startTime,
			endTime
		}

		statusBarManager.setSuccessStatus(stats)

		// Check if anything was generated (text or tool calls via cursor movement)
		const endPos = editor.getCursor('to')
		const startPositionForCheck = startPos as EditorPosition | null
		const cursorMoved =
			startPositionForCheck != null &&
			(startPositionForCheck.line !== endPos.line || startPositionForCheck.ch !== endPos.ch)

		// Only throw error if no LLM text AND no content inserted (no tool calls)
		if (llmResponse.length === 0 && !cursorMoved) {
			throw new Error(t('No text generated'))
		}

		logger.info('assistant response generated', { characters: llmResponse.length })
		if (startPos) {
			const startPosition = startPos
			await documentWriteLock.runExclusive(() => {
				const endCursorPos = editor.getCursor('to')
				const insertedText = editor.getRange(startPosition, endCursorPos)
				const formattedText = formatTextWithLeadingBreaks(llmResponse)
				if (insertedText !== formattedText) {
					logger.debug('normalizing leading breaks in response')
					editor.replaceRange(formattedText, startPosition, endCursorPos)
				}
			})
		}

		if (controller.signal.aborted) {
			throw new DOMException('Operation was aborted', 'AbortError')
		}
		new Notice(t('Text generated successfully'))
	} finally {
		requestController.cleanup()
	}
}

const formatTextWithLeadingBreaks = (text: string) => {
	const firstLine = text.split('\n')[0]
	if (firstLine.startsWith('#') || firstLine.startsWith('```')) {
		// Markdown header or code block
		return ` \n${text}`
	}
	if (firstLine.startsWith('| ')) {
		// Markdown table
		return ` \n\n${text}`
	}
	return text
}

const isMCPServerManager = (value: unknown): value is MCPServerManager => {
	return (
		value !== null &&
		typeof value === 'object' &&
		typeof (value as MCPServerManager).getToolDiscoveryCache === 'function'
	)
}

async function insertUtilitySectionIfEnabled(
	editor: Editor,
	provider: ProviderSettings,
	pluginSettings?: unknown,
	mcpManager?: unknown,
	documentWriteLock?: DocumentWriteLock
): Promise<void> {
	const typedSettings = pluginSettings as PluginSettings | undefined
	const isEnabled = typedSettings?.enableUtilitySection ?? true
	if (!isEnabled) return

	const manager = isMCPServerManager(mcpManager) ? mcpManager : undefined
	const callout = await buildUtilitySectionCallout(provider, manager)
	if (!callout) {
		return
	}

	await runWithLock(documentWriteLock, () => {
		const cursor = editor.getCursor('to')
		const startOffset = editor.posToOffset(cursor)
		editor.replaceRange(callout, cursor)
		const newCursor = editor.offsetToPos(startOffset + callout.length)
		editor.setCursor(newCursor)
	})
}

async function buildUtilitySectionCallout(provider: ProviderSettings, mcpManager?: MCPServerManager): Promise<string> {
	const providerName = provider.vendor ?? 'Unknown'
	const modelOption =
		typeof provider.options === 'object' && provider.options !== null && 'model' in provider.options
			? (provider.options as { model?: unknown }).model
			: undefined
	const modelName = typeof modelOption === 'string' && modelOption.trim().length > 0 ? modelOption : 'unknown'

	const servers: UtilitySectionServer[] = []
	if (mcpManager) {
		try {
			const snapshot = await mcpManager.getToolDiscoveryCache().getSnapshot()
			for (const server of snapshot.servers) {
				const toolNames = server.tools.map((tool) => tool.name).filter((name) => name && name.trim().length > 0)
				servers.push({
					serverName: server.serverName,
					toolNames
				})
			}
		} catch (error) {
			logger.warn('failed to build utility section tool list', error)
		}
	}

	return formatUtilitySectionCallout({
		providerName,
		modelName,
		servers
	})
}
