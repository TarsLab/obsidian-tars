import type { EmbedCache } from 'obsidian'
import type { DocumentWriteLock } from '../utils/documentWriteLock'

export type MsgRole = 'user' | 'assistant' | 'system'

export type SaveAttachment = (fileName: string, data: ArrayBuffer) => Promise<void>

export type ResolveEmbedAsBinary = (embed: EmbedCache) => Promise<ArrayBuffer>

export type CreatePlainText = (filePath: string, text: string) => Promise<void>

export interface Message {
	readonly role: MsgRole
	readonly content: string
	readonly embeds?: EmbedCache[]
}

export type SendRequest = (
	messages: readonly Message[],
	controller: AbortController,
	resolveEmbedAsBinary: ResolveEmbedAsBinary,
	saveAttachment?: SaveAttachment
) => AsyncGenerator<string, void, unknown>

export type Capability =
	| 'Text Generation'
	| 'Image Vision'
	| 'PDF Vision'
	| 'Image Generation'
	| 'Image Editing'
	| 'Web Search'
	| 'Reasoning'
	| 'Tool Calling'

export interface Vendor {
	readonly name: string
	readonly defaultOptions: BaseOptions
	readonly sendRequestFunc: (options: BaseOptions) => SendRequest
	readonly models: string[]
	readonly websiteToObtainKey: string
	readonly capabilities: Capability[]
}

export interface BaseOptions {
	apiKey: string
	baseURL: string
	model: string
	parameters: Record<string, unknown>
	enableWebSearch?: boolean
	// MCP tool integration - injected by the system when available
	mcpManager?: unknown // MCPServerManager from mcp module
	mcpExecutor?: unknown // ToolExecutor from mcp module
	documentPath?: string // Current document path for tool execution context
	statusBarManager?: unknown // StatusBarManager for error logging
	editor?: unknown // Active Obsidian editor for markdown persistence
	pluginSettings?: unknown // Plugin settings for parallel execution configuration
	documentWriteLock?: DocumentWriteLock
	beforeToolExecution?: () => Promise<void>
}

export interface ProviderSettings {
	tag: string
	readonly vendor: string
	options: BaseOptions
}

export interface Optional {
	apiSecret: string
	endpoint: string
	apiVersion: string
}
