import { Editor, EditorPosition, SectionCache, debounce, normalizePath, parseLinktext, resolveSubpath } from 'obsidian'
import { t } from 'src/lang/helper'
import { RunEnv, buildCapabilities } from './environment'
import { Message, ProviderSettings, ToolMessage, Vendor, isArrayOfToolUses, isTextOutput } from './providers'
import { withStreamLogging } from './providers/decorator'
import { APP_FOLDER, EditorStatus, availableVendors } from './settings'
import { GenerationStats, StatusBarManager } from './statusBarManager'
import { TagRole } from './suggest'
import { ToolExecution, ToolUse, formatToolExecution, parseReferenceFromFormattedExecution } from './tools'
import { readToolExecutions, storeToolExecution } from './tools/storage'

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

const resolveLinkedContent = async (env: RunEnv, linkText: string) => {
	const { appMeta, vault, filePath } = env
	const { path, subpath } = parseLinktext(linkText)
	console.debug('path', path, 'subpath', subpath)

	const targetFile = appMeta.getFirstLinkpathDest(path, filePath)

	if (targetFile === null) {
		throw new Error('LinkText broken: ' + linkText.substring(0, 20))
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
		options: { userTags, assistantTags, systemTags, toolTags }
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
						: toolTags.some((tt) => tt.toLowerCase() === lowerCaseTag)
							? 'tool'
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
	console.debug('roleMappedTags', roleMappedTags)

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
	console.debug('taggedBlocks', taggedBlocks)
	return taggedBlocks
}

const resolveTextRangeWithLinks = async (
	env: RunEnv,
	section: SectionCache,
	contentRange: readonly [number, number],
	role: 'user' | 'assistant' | 'system' | 'tool'
) => {
	const {
		fileText,
		links: links = [],
		embeds: embeds = [],
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
	console.debug('accumulatedText', accumulatedText)
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
	console.debug('textRanges', textRanges)
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

const extractTaggedMessages = async (env: RunEnv, startOffset: number, endOffset: number) => {
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
	const taggedMessages = await Promise.all(
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
	return taggedMessages
}

const debouncedResetInsertState = debounce(
	(editorStatus: EditorStatus) => {
		editorStatus.isTextInserting = false
	},
	1000,
	true
)

const insertText = (editor: Editor, text: string, editorStatus: EditorStatus, lastEditPos: EditorPosition | null) => {
	editorStatus.isTextInserting = true
	let cursor = editor.getCursor('to')

	if (lastEditPos !== null && (lastEditPos.line !== cursor.line || lastEditPos.ch !== cursor.ch)) {
		// If there is a previous edit position, and it is different from the current cursor position, update the cursor to the last edit position
		cursor = lastEditPos
	}

	const lineAtCursor = editor.getLine(cursor.line)
	if (lineAtCursor.length > cursor.ch) {
		cursor = { line: cursor.line, ch: lineAtCursor.length }
		// console.debug('Update cursor to end of line', cursor)
	}

	const lines = text.split('\n')
	const newEditPos = {
		line: cursor.line + lines.length - 1,
		ch: lines.length === 1 ? cursor.ch + text.length : lines[lines.length - 1].length
	}

	editor.replaceRange(text, cursor)
	editor.setCursor(newEditPos)
	debouncedResetInsertState(editorStatus)
	return newEditPos
}

export const extractAllTaggedMessages = async (env: RunEnv) => {
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

	console.debug('ranges', ranges)

	const allTaggedMessages = await Promise.all(
		ranges.map(async (r) => {
			const taggedBlocks = extractTaggedBlocks(env, r.startOffset, r.endOffset)
			const taggedMessages = Promise.all(
				taggedBlocks.map(async (tag) => ({
					...tag,
					content: await extractTaggedBlockContent(env, tag)
				}))
			)
			return taggedMessages
		})
	)

	return allTaggedMessages.filter((arr) => arr.length > 0)
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
	console.debug('msgTagsInMeta', msgTagsInMeta)
	const msgIndex = msgTagsInMeta.findLastIndex((t) => t.position.start.line <= line)
	if (msgIndex < 0) return [-1, -1]

	console.debug('msgTag', msgTagsInMeta[msgIndex])
	const startOffset = msgTagsInMeta[msgIndex].position.end.offset + 2
	const nextMsgIndex = msgIndex + 1
	const nextMsgStartOffset =
		nextMsgIndex < msgTagsInMeta.length ? msgTagsInMeta[nextMsgIndex].position.start.offset : Infinity
	console.debug('nextTag', msgTagsInMeta[nextMsgIndex])
	const lastSection = sections.findLast(
		(section) => section.position.end.offset <= nextMsgStartOffset && section.position.start.line >= line
	)
	if (!lastSection) return [-1, -1]

	const endOffset = lastSection.position.end.offset
	console.debug('startOff', startOffset, 'endOffset', endOffset)
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
		console.debug('Using stream logging')
		return withStreamLogging(vendor.sendRequestFunc(provider.options))
	} else {
		return vendor.sendRequestFunc(provider.options)
	}
}

export const buildMessages = async (env: RunEnv, endOffset: number) => {
	const taggedMessages = await extractTaggedMessages(env, 0, endOffset)

	// 1. 收集所有工具消息的 references
	const toolReferences = taggedMessages
		.filter((msg) => msg.role === 'tool')
		.map((msg) => {
			const reference = parseReferenceFromFormattedExecution(msg.content)
			if (!reference)
				throw new Error(
					`Tool message missing or invalid reference ID in content (line ${msg.line[0]}-${msg.line[1]}): ` + msg.content
				)
			return reference
		})

	// 2. 批量读取所有工具执行结果
	const toolExecutions =
		toolReferences.length > 0 ? await readToolExecutions(env.vault, toolReferences) : new Map<string, ToolExecution>()

	// 3. 构建消息数组
	const messages: Message[] = taggedMessages.map((msg) => {
		if (msg.role === 'tool') {
			const reference = parseReferenceFromFormattedExecution(msg.content)!
			const execution = toolExecutions.get(reference)!
			return {
				role: 'tool',
				toolUses: execution.toolUses,
				toolResults: execution.toolResults
			} as ToolMessage
		} else {
			// Handle chat messages
			return msg.embeds
				? { role: msg.role, content: msg.content, embeds: msg.embeds }
				: { role: msg.role, content: msg.content }
		}
	})

	console.debug('messages', messages)

	if (messages.length === 0) {
		throw new Error('Please add at least one message first.')
	}

	const lastMsg = messages.last()
	if (!lastMsg || (lastMsg.role !== 'user' && lastMsg.role !== 'tool')) {
		throw new Error('The last message must be a user message or tool message.')
	}

	if (lastMsg.role === 'user' && lastMsg.content.trim().length === 0) {
		throw new Error(t('Please add a user message first, or wait for the user message to be parsed.'))
	}

	if (env.options.enableDefaultSystemMsg && messages[0]?.role !== 'system' && env.options.defaultSystemMsg) {
		// If the first message is not a system message, add the default system message
		messages.unshift({
			role: 'system',
			content: env.options.defaultSystemMsg
		})
		console.debug('Default system message added:', env.options.defaultSystemMsg)
	}
	return messages
}

export const generate = async (
	env: RunEnv,
	editor: Editor,
	provider: ProviderSettings,
	endOffset: number,
	statusBarManager: StatusBarManager,
	editorStatus: EditorStatus,
	requestController: RequestController,
	messages?: Message[]
) => {
	try {
		const vendor = availableVendors.find((v) => v.name === provider.vendor)
		if (!vendor) {
			throw new Error('No vendor found ' + provider.vendor)
		}
		const isContinuation = messages !== undefined
		const msgs = isContinuation ? messages : await buildMessages(env, endOffset)
		const round = msgs.filter((m) => m.role === 'assistant').length + 1
		const capabilities = buildCapabilities(env, provider.vendor, provider.options.enableTarsTools)
		const sendRequest = await createDecoratedSendRequest(env, vendor, provider)

		const startTime = new Date()
		statusBarManager.setGeneratingStatus(round)

		let textResponse = ''
		const controller = requestController.getController()

		let lastEditPos: EditorPosition | null = null
		let textStartPos: EditorPosition | null = null
		let toolsToExecute: ToolUse[] | null = null

		let needsProviderTag = isContinuation ? true : false
		for await (const streamItem of sendRequest(msgs, controller, capabilities)) {
			if (isTextOutput(streamItem)) {
				if (needsProviderTag) {
					lastEditPos = insertText(editor, `#${provider.tag} : `, editorStatus, lastEditPos)
					needsProviderTag = false
				}
				if (textStartPos == null) textStartPos = editor.getCursor('to')

				lastEditPos = insertText(editor, streamItem, editorStatus, lastEditPos)
				textResponse += streamItem
				statusBarManager.updateGeneratingProgress(textResponse.length)
			} else if (isArrayOfToolUses(streamItem)) {
				toolsToExecute = streamItem
				console.debug('Tools to execute:', toolsToExecute)
			}
		}

		const endTime = new Date()
		const duration = formatDuration(endTime.getTime() - startTime.getTime())

		// Create statistics and set success status
		const stats: GenerationStats = {
			round,
			characters: textResponse.length,
			duration,
			model: provider.options.model,
			vendor: provider.vendor,
			startTime,
			endTime
		}

		statusBarManager.setSuccessStatus(stats)

		if (textResponse.length === 0 && toolsToExecute === null) {
			throw new Error(t('No text generated'))
		}

		console.debug('✨ ' + t('AI generate') + ' ✨ ', textResponse)
		if (textStartPos && textResponse.length > 0) {
			const textEndPos = editor.getCursor('to')
			const insertedText = editor.getRange(textStartPos, textEndPos)
			const formattedText = formatTextWithLeadingBreaks(textResponse)
			if (insertedText !== formattedText) {
				console.debug('format text with leading breaks')
				editor.replaceRange(formattedText, textStartPos, textEndPos)
			}
		}

		if (controller.signal.aborted) {
			throw new DOMException('Operation was aborted', 'AbortError')
		}

		if (toolsToExecute) {
			const toolResults = await capabilities.toolRegistry.execute(env, toolsToExecute)
			const toolExecution = await storeToolExecution(env, toolsToExecute, toolResults)
			const toolTag = env.options.toolTags[0]
			const lineBreaks = textResponse.length > 0 ? '\n\n' : ''
			const text = `${lineBreaks}#${toolTag} : ${formatToolExecution(toolExecution)}  \n\n`
			lastEditPos = insertText(editor, text, editorStatus, lastEditPos)

			const nextEndOffset = editor.posToOffset(lastEditPos)

			if (textResponse.length > 0) {
				msgs.push({
					role: 'assistant',
					content: textResponse
				})
			}
			msgs.push({
				role: 'tool',
				toolUses: toolExecution.toolUses,
				toolResults: toolExecution.toolResults
			})
			await generate(env, editor, provider, nextEndOffset, statusBarManager, editorStatus, requestController, msgs)
		}
	} finally {
		requestController.cleanup()
	}
}

const formatTextWithLeadingBreaks = (text: string) => {
	const firstLine = text.split('\n')[0]
	if (firstLine.startsWith('#') || firstLine.startsWith('```')) {
		// Markdown header or code block
		return ' \n' + text
	}
	if (firstLine.startsWith('| ')) {
		// Markdown table
		return ' \n\n' + text
	}
	return text
}
