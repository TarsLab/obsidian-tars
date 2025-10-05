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
import type { MCPServerConfig, ToolDefinition } from '../mcp/types'
import {
	buildRequiredParameterInsertion,
	collectUsedParameters,
	detectMCPCodeBlockContext,
	extractParameterDefinitions,
	filterTools,
	parseToolLine
} from './mcpToolSuggestHelpers'

export interface ToolSuggestion {
	name: string
	description?: string
	serverId: string
	serverName: string
	tool: ToolDefinition
}

const logger = createLogger('suggest:mcp-tools')

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
				serverName: serverEntry.serverName,
				tool
			}))
		} catch (error) {
			logger.warn('failed to build tool suggestions', error)
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
		const { editor, start, end } = this.context
		editor.replaceRange(suggestion.name, start, end)

		const insertionEnd = {
			line: start.line,
			ch: start.ch + suggestion.name.length
		}

		editor.setCursor(insertionEnd)
		this.insertRequiredParameters(editor, insertionEnd, suggestion.tool)
	}

	private findServerByName(name: string): MCPServerConfig | undefined {
		return this.getServerConfigs().find((server) => server.name === name)
	}

	private insertRequiredParameters(editor: Editor, insertionEnd: EditorPosition, tool: ToolDefinition): void {
		const lineContent = editor.getLine(insertionEnd.line) ?? ''
		const indentation = lineContent.match(/^\s*/)?.[0] ?? ''
		const blockContext = detectMCPCodeBlockContext(editor, insertionEnd)
		if (!blockContext) {
			return
		}

		const parameterDefinitions = extractParameterDefinitions(tool)
		const requiredDefinitions = parameterDefinitions.filter((definition) => definition.required)
		if (requiredDefinitions.length === 0) {
			return
		}

		const blockEndLine = this.findBlockEndLine(editor, blockContext.blockStartLine)
		const usedParameters = collectUsedParameters(editor, blockContext.blockStartLine, blockEndLine)
		const { lines, cursorColumn } = buildRequiredParameterInsertion(parameterDefinitions, usedParameters, indentation)

		if (lines.length === 0) {
			return
		}

		const insertionLineLength = (editor.getLine(insertionEnd.line) ?? '').length
		const insertionPoint = { line: insertionEnd.line, ch: insertionLineLength }
		const insertText = `\n${lines.join('\n')}`
		editor.replaceRange(insertText, insertionPoint, insertionPoint)

		const firstParamLineIndex = insertionEnd.line + 1
		const firstParamLine = editor.getLine(firstParamLineIndex) ?? ''
		let cursorCh = cursorColumn ?? firstParamLine.length
		if (cursorColumn === null) {
			const colonIndex = firstParamLine.indexOf(':')
			cursorCh = colonIndex === -1 ? firstParamLine.length : colonIndex + 1 + (firstParamLine.charAt(colonIndex + 1) === ' ' ? 1 : 0)
		}
		editor.setCursor({ line: firstParamLineIndex, ch: cursorCh })
	}

	private findBlockEndLine(editor: Editor, blockStartLine: number): number {
		const lineCount = editor.lineCount()
		for (let lineIndex = blockStartLine + 1; lineIndex < lineCount; lineIndex++) {
			const trimmed = editor.getLine(lineIndex)?.trim() ?? ''
			if (trimmed.startsWith('```')) {
				return lineIndex
			}
		}
		return lineCount
	}
}
