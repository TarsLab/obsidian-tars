import {
	App,
	CachedMetadata,
	Editor,
	EditorPosition,
	MetadataCache,
	ReferenceCache,
	SectionCache,
	TagCache,
	Vault,
	parseLinktext,
	resolveSubpath
} from 'obsidian'
import { Message } from './providers'
import { PluginSettings } from './settings'

export interface RunEnv {
	readonly appMeta: MetadataCache
	readonly vault: Vault
	readonly fileText: string
	readonly filePath: string
	readonly tagsInMeta: TagCache[]
	readonly sectionsWithRefer: SectionCacheWithRefer[]
	readonly options: {
		newChatTags: string[]
		userTags: string[]
		assistantTags: string[]
		systemTags: string[]
	}
}

interface Tag extends Omit<Message, 'content'> {
	readonly tag: string
	readonly lowerCaseTag: string
	readonly tagRange: [number, number]
	readonly tagLine: number
}

// 按照obsidian的link，embed的定义，link和embed必须包含在一个section里面，不会跨越多个，
interface SectionCacheWithRefer extends SectionCache {
	readonly refers: ReferenceCache[]
}

interface TagWithSections extends Tag {
	readonly contentRange: [number, number]
	readonly line: [number, number]
	readonly sections: SectionCacheWithRefer[]
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
		throw new Error('No cached metadata found')
	}

	const ignoreSections = fileMeta.sections?.filter((s) => ignoreSectionTypes.includes(s.type)) || []
	const tagsInMeta = (fileMeta.tags || []).filter(
		(t) =>
			!ignoreSections.some(
				(s) => s.position.start.offset <= t.position.start.offset && t.position.end.offset <= s.position.end.offset
			)
	)
	console.debug('tagsInMeta', tagsInMeta)

	const sectionsWithRefer = getSectionsWithRefer(fileMeta)
	const assistantTags = settings.providers.map((p) => p.tag)

	const options = {
		newChatTags: settings.newChatTags,
		userTags: settings.userTags,
		assistantTags,
		systemTags: settings.systemTags
	}

	return { appMeta, vault, fileText, filePath, tagsInMeta, sectionsWithRefer, options }
}

const fetchLinkTextContent = async (env: RunEnv, linkText: string) => {
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

export const fetchTagsWithSections = (env: RunEnv, startOffset: number, endOffset: number) => {
	const {
		tagsInMeta,
		sectionsWithRefer,
		options: { userTags, assistantTags, systemTags }
	} = env

	const tags: Tag[] = tagsInMeta
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
	console.debug('tags', tags)

	const ranges: [number, number][] = tags.map((tag, i) => [
		tag.tagRange[0],
		tags[i + 1] ? tags[i + 1].tagRange[0] - 1 : endOffset
	])

	const tagsWithSections: TagWithSections[] = ranges.map((range, i) => ({
		...tags[i],
		contentRange: [tags[i].tagRange[1] + 2, tags[i + 1] ? tags[i + 1].tagRange[0] - 1 : endOffset], // +2 是因为tag后面有一个空格和冒号
		sections: sectionsWithRefer.filter(
			(section) =>
				section.position.end.offset <= range[1] &&
				(section.position.start.offset < range[0] ? section.position.end.offset > range[0] : true)
		),
		line: [tags[i].tagLine, tags[i + 1] ? tags[i + 1].tagLine - 1 : Infinity]
	}))
	console.debug('tagsWithSections', tagsWithSections)
	return tagsWithSections
}

export const fetchTextRange = async (
	env: RunEnv,
	sectionWithRefer: SectionCacheWithRefer,
	contentRange: readonly [number, number]
) => {
	const { fileText } = env

	const startOffset =
		sectionWithRefer.position.start.offset <= contentRange[0] ? contentRange[0] : sectionWithRefer.position.start.offset

	const endOffset = sectionWithRefer.position.end.offset
	const refersWithText = await Promise.all(
		sectionWithRefer.refers.map(async (ref) => {
			return {
				ref,
				text: await fetchLinkTextContent(env, ref.link)
			}
		})
	)

	const accumulatedText = refersWithText.reduce(
		(acc, { ref, text }) => ({
			endOffset: ref.position.end.offset,
			text: acc.text + fileText.slice(acc.endOffset, ref.position.start.offset) + text
		}),
		{ endOffset: startOffset, text: '' }
	)
	return {
		text: accumulatedText.text + fileText.slice(accumulatedText.endOffset, endOffset),
		range: [startOffset, endOffset] as [number, number]
	}
}

export const fetchTextForTag = async (env: RunEnv, tagWithSections: TagWithSections) => {
	const textRanges = await Promise.all(
		tagWithSections.sections.map((section) => fetchTextRange(env, section, tagWithSections.contentRange))
	)

	const accumulated = textRanges
		.map((range) => range.text)
		.join('\n\n')
		.trim()
	return accumulated
}

export const fetchConversation = async (env: RunEnv, startOffset: number, endOffset: number) => {
	const {
		tagsInMeta,
		options: { newChatTags }
	} = env

	const lastNewChatTag = tagsInMeta.findLast(
		(t) =>
			newChatTags.some((n) => t.tag.slice(1).split('/')[0].toLowerCase() === n.toLowerCase()) &&
			startOffset <= t.position.start.offset &&
			t.position.end.offset <= endOffset
	)
	const conversationStart = lastNewChatTag ? lastNewChatTag.position.end.offset : startOffset

	const tagsWithSections = fetchTagsWithSections(env, conversationStart, endOffset)
	const conversation = await Promise.all(
		tagsWithSections.map(async (tag) => ({
			...tag,
			content: await fetchTextForTag(env, tag)
		}))
	)
	return conversation
}

export const insertText = (editor: Editor, text: string) => {
	const current = editor.getCursor('to')
	const lines = text.split('\n')
	const newPos: EditorPosition = {
		line: current.line + lines.length - 1,
		ch: lines.length === 1 ? current.ch + text.length : lines[lines.length - 1].length
	}
	editor.replaceRange(text, current)
	editor.setCursor(newPos)
	editor.scrollIntoView({ from: newPos, to: newPos })
}

export const getSectionsWithRefer = (fileMeta: CachedMetadata) => {
	if (!fileMeta.sections) return []
	const refersCache: ReferenceCache[] = [...(fileMeta.links || []), ...(fileMeta.embeds || [])].sort(
		(a, b) => a.position.start.offset - b.position.start.offset // keep the order
	)
	const sectionsWithRefer: SectionCacheWithRefer[] = fileMeta.sections
		.filter((s) => !ignoreSectionTypes.includes(s.type))
		.map((section) => {
			const refers = refersCache.filter(
				(ref) =>
					section.position.start.offset <= ref.position.start.offset &&
					ref.position.end.offset <= section.position.end.offset
			)
			return { ...section, refers }
		})
	console.debug('sectionsWithRefer', sectionsWithRefer)
	return sectionsWithRefer
}

export const fetchAllConversations = async (env: RunEnv) => {
	const {
		tagsInMeta,
		options: { newChatTags }
	} = env

	const conversationTags = tagsInMeta.filter((t) =>
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

	const conversations = await Promise.all(
		ranges.map(async (r) => {
			const tagsWithSections = fetchTagsWithSections(env, r.startOffset, r.endOffset)
			const conversation = Promise.all(
				tagsWithSections.map(async (tag) => ({
					...tag,
					content: await fetchTextForTag(env, tag)
				}))
			)
			return conversation
		})
	)

	return conversations.filter((arr) => arr.length > 0)
}

export const getMsgPositionByLine = (env: RunEnv, line: number) => {
	const {
		tagsInMeta,
		sectionsWithRefer,
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
	const lastSection = sectionsWithRefer.findLast(
		(section) => section.position.end.offset <= nextMsgStartOffset && section.position.start.line >= line
	)
	if (!lastSection) return [-1, -1]

	const endOffset = lastSection.position.end.offset
	console.debug('startOff', startOffset, 'endOffset', endOffset)
	return [startOffset, endOffset]
}
