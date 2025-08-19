import {
	App,
	EmbedCache,
	LinkCache,
	MetadataCache,
	ReferenceCache,
	SectionCache,
	TagCache,
	Vault,
	parseLinktext
} from 'obsidian'
import { t } from './lang/helper'
import { PluginSettings } from './settings'
import { ToolRegistry } from './tools'
import { registerFileSystemTools } from './tools/fileSystem'

export interface RunEnv {
	readonly app: App
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
		toolTags: string[]
		enableInternalLink: boolean
		enableInternalLinkForAssistantMsg: boolean
		enableDefaultSystemMsg: boolean
		defaultSystemMsg: string
		enableStreamLog: boolean
	}
}

export interface Capabilities {
	readonly runEnv: RunEnv
	readonly resolveEmbedAsBinary: ResolveEmbedAsBinary
	readonly saveAttachment: SaveAttachment
	readonly createFile: CreateFile
	readonly toolRegistry: ToolRegistry
}

export interface SaveAttachment {
	(fileName: string, data: ArrayBuffer): Promise<void>
}

export interface ResolveEmbedAsBinary {
	(embed: EmbedCache): Promise<ArrayBuffer>
}

export interface CreateFile {
	(filePath: string, text: string): Promise<void>
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
		toolTags: settings.toolTags,
		enableInternalLink: settings.enableInternalLink,
		enableInternalLinkForAssistantMsg: settings.enableInternalLinkForAssistantMsg,
		enableDefaultSystemMsg: settings.enableDefaultSystemMsg,
		defaultSystemMsg: settings.defaultSystemMsg,
		enableStreamLog: settings.enableStreamLog
	}

	return {
		app,
		appMeta,
		vault,
		fileText,
		filePath,
		tags: filteredTags,
		sections: fileMeta.sections?.filter((s) => !ignoreSectionTypes.includes(s.type)) || [],
		links: fileMeta.links,
		embeds: fileMeta.embeds,
		options
	}
}

export const buildCapabilities = (runEnv: RunEnv, enableTarsTools: boolean = false): Capabilities => {
	const { app, vault, filePath, appMeta } = runEnv
	const saveAttachment = async (filename: string, data: ArrayBuffer) => {
		const attachmentPath = await app.fileManager.getAvailablePathForAttachment(filename)
		await vault.createBinary(attachmentPath, data)
	}
	const resolveEmbedAsBinary = async (embed: EmbedCache) => {
		const { path, subpath } = parseLinktext(embed.link)
		console.debug('resolveEmbed path', path, 'subpath', subpath)
		const targetFile = appMeta.getFirstLinkpathDest(path, filePath)
		if (targetFile === null) {
			throw new Error('LinkText broken: ' + embed.link.substring(0, 20))
		}
		return await vault.readBinary(targetFile)
	}
	const createFile = async (filePath: string, text: string) => {
		await vault.create(filePath, text)
	}

	const toolRegistry = new ToolRegistry()
	if (enableTarsTools) {
		registerFileSystemTools(toolRegistry)
	}

	return {
		runEnv,
		resolveEmbedAsBinary,
		saveAttachment,
		createFile,
		toolRegistry
	}
}
