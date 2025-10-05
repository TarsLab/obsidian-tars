import {
	App,
	type Editor,
	type EditorPosition,
	EditorSuggest,
	type EditorSuggestContext,
	type EditorSuggestTriggerInfo,
	type TFile
} from 'obsidian'

import type { MCPServerManager } from '../mcp/managerMCPUse'
import type { MCPServerConfig } from '../mcp/types'
import { detectMCPCodeBlockContext, filterTools, parseToolLine } from './mcpToolSuggestHelpers'

export interface ToolSuggestion {
	name: string
	description?: string
	serverId: string
	serverName: string
}

export class MCPToolSuggest extends EditorSuggest<ToolSuggestion> {
	private readonly getServerConfigs: () => MCPServerConfig[]
	private activeServerName: string | null = null
	private activeServerId: string | null = null

	constructor(app: App, private readonly mcpManager: MCPServerManager, getServerConfigs: () => MCPServerConfig[]) {
		super(app)
		this.getServerConfigs = getServerConfigs
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		const codeBlockContext = detectMCPCodeBlockContext(editor, cursor)
		if (!codeBlockContext) return null

		const toolContext = parseToolLine(editor.getLine(cursor.line), cursor.ch)
		if (!toolContext) return null

		const serverConfig = this.findServerByName(codeBlockContext.serverName)
		if (!serverConfig) return null

		this.activeServerName = serverConfig.name
		this.activeServerId = serverConfig.id

		return {
			start: { line: cursor.line, ch: toolContext.startCh },
			end: { line: cursor.line, ch: cursor.ch },
			query: toolContext.query
		}
	}

	async getSuggestions(context: EditorSuggestContext): Promise<ToolSuggestion[]> {
		if (!this.activeServerName) {
			return []
		}

		try {
			const snapshot = await this.mcpManager.getToolDiscoveryCache().getSnapshot()
			const serverEntry = snapshot.servers.find((server) => {
				return (
					server.serverId === this.activeServerId ||
					server.serverName === this.activeServerName
				)
			})

			if (!serverEntry) {
				return []
			}

			const query = context.query.trim().toLowerCase()
			const tools = filterTools(serverEntry.tools, query)

			return tools.map((tool) => ({
				name: tool.name,
				description: tool.description,
				serverId: serverEntry.serverId,
				serverName: serverEntry.serverName
			}))
		} catch (error) {
			console.debug('Failed to build tool suggestions', error)
			return []
		}
	}

	renderSuggestion(suggestion: ToolSuggestion, el: HTMLElement): void {
		const container = el.createDiv({ cls: 'mcp-tool-suggest-item' })
		const header = container.createDiv({ cls: 'mcp-tool-suggest-header' })
		header.createSpan({ cls: 'mcp-tool-suggest-name', text: suggestion.name })
		header.createSpan({
			cls: 'mcp-tool-suggest-server',
			text: suggestion.serverName
		})

		if (suggestion.description) {
			container.createDiv({ cls: 'mcp-tool-suggest-description', text: suggestion.description })
		}
	}

	async selectSuggestion(suggestion: ToolSuggestion): Promise<void> {
		if (!this.context) return
		this.context.editor.replaceRange(suggestion.name, this.context.start, this.context.end)
	}

	private findServerByName(name: string): MCPServerConfig | undefined {
		return this.getServerConfigs().find((server) => server.name === name)
	}
}
