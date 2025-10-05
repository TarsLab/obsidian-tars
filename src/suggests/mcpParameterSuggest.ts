import {
	App,
	type Editor,
	type EditorPosition,
	EditorSuggest,
	type EditorSuggestContext,
	type EditorSuggestTriggerInfo,
	type TFile
} from 'obsidian'

import { createLogger } from '../logger'
import type { MCPServerManager } from '../mcp/managerMCPUse'
import type { MCPServerConfig } from '../mcp/types'
import {
	collectUsedParameters,
	detectMCPCodeBlockContext,
	extractParameterDefinitions,
	filterParameters,
	findToolNameInBlock,
	parseParameterLine
} from './mcpToolSuggestHelpers'

export interface ParameterSuggestion {
	name: string
	type: string
	description?: string
	required: boolean
}

const logger = createLogger('suggest:mcp-parameters')

export class MCPParameterSuggest extends EditorSuggest<ParameterSuggestion> {
	private readonly getServerConfigs: () => MCPServerConfig[]
	private activeServerName: string | null = null
	private activeServerId: string | null = null
	private activeToolName: string | null = null
	private usedParameterNames: Set<string> = new Set()

	constructor(app: App, private readonly mcpManager: MCPServerManager, getServerConfigs: () => MCPServerConfig[]) {
		super(app)
		this.getServerConfigs = getServerConfigs
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		const codeBlockContext = detectMCPCodeBlockContext(editor, cursor)
		if (!codeBlockContext) return null

		const parameterContext = parseParameterLine(editor.getLine(cursor.line) ?? '', cursor.ch)
		if (!parameterContext) return null

		const toolName = findToolNameInBlock(editor, codeBlockContext.blockStartLine, cursor.line)
		if (!toolName) return null

		const serverConfig = this.findServerByName(codeBlockContext.serverName)
		if (!serverConfig) return null

		this.activeServerName = serverConfig.name
		this.activeServerId = serverConfig.id
		this.activeToolName = toolName
		this.usedParameterNames = collectUsedParameters(editor, codeBlockContext.blockStartLine, cursor.line)

		return {
			start: { line: cursor.line, ch: parameterContext.startCh },
			end: { line: cursor.line, ch: cursor.ch },
			query: parameterContext.query.trim()
		}
	}

	async getSuggestions(context: EditorSuggestContext): Promise<ParameterSuggestion[]> {
		if (!this.activeServerName || !this.activeToolName) {
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

			const toolDefinition = serverEntry.tools.find((tool) => tool.name === this.activeToolName)
			if (!toolDefinition) {
				return []
			}

			const parameterDefinitions = extractParameterDefinitions(toolDefinition)
			const filtered = filterParameters(parameterDefinitions, context.query ?? '', this.usedParameterNames)
			return filtered.map((definition) => ({
				name: definition.name,
				type: definition.type,
				description: definition.description,
				required: definition.required
			}))
		} catch (error) {
			logger.warn('failed to build parameter suggestions', error)
			return []
		}
	}

	renderSuggestion(suggestion: ParameterSuggestion, el: HTMLElement): void {
		const container = el.createDiv({ cls: 'mcp-parameter-suggest-item' })
		const header = container.createDiv({ cls: 'mcp-parameter-suggest-header' })
		header.createSpan({ cls: 'mcp-parameter-suggest-name', text: suggestion.name })
		header.createSpan({
			cls: 'mcp-parameter-suggest-meta',
			text: `(${suggestion.type || 'any'})${suggestion.required ? ' *' : ''}`
		})

		if (suggestion.description) {
			container.createDiv({ cls: 'mcp-parameter-suggest-description', text: suggestion.description })
		}
	}

	async selectSuggestion(suggestion: ParameterSuggestion): Promise<void> {
		if (!this.context) return
		const { editor, start, end } = this.context
		editor.replaceRange(suggestion.name, start, end)

		const insertionEnd = {
			line: start.line,
			ch: start.ch + suggestion.name.length
		}

		const updatedLine = editor.getLine(start.line) ?? ''
		const charAfter = updatedLine.charAt(insertionEnd.ch)
		if (charAfter !== ':') {
			editor.replaceRange(': ', insertionEnd, insertionEnd)
			return
		}

		const charFollowingColon = updatedLine.charAt(insertionEnd.ch + 1)
		if (charFollowingColon && charFollowingColon !== ' ') {
			editor.replaceRange(' ', { line: start.line, ch: insertionEnd.ch + 1 }, { line: start.line, ch: insertionEnd.ch + 1 })
		}
	}

	onClose(): void {
		this.activeServerName = null
		this.activeServerId = null
		this.activeToolName = null
		this.usedParameterNames = new Set()
	}

	private findServerByName(name: string): MCPServerConfig | undefined {
		return this.getServerConfigs().find((server) => server.name === name)
	}
}
