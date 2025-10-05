import type { ToolDefinition } from '../mcp/types'

export type EditorPositionLike = { line: number; ch: number }
export type EditorLike = { getLine(line: number): string }

export interface CodeBlockContext {
	serverName: string
}

export interface TriggerContext {
	startCh: number
	query: string
}

export function detectMCPCodeBlockContext(editor: EditorLike, cursor: EditorPositionLike): CodeBlockContext | null {
	let insideBlock = false
	let currentServer: string | null = null

	for (let lineIndex = 0; lineIndex <= cursor.line; lineIndex++) {
		const trimmed = editor.getLine(lineIndex)?.trim() ?? ''
		if (!trimmed.startsWith('```')) continue

		if (!insideBlock) {
			insideBlock = true
			currentServer = trimmed.slice(3).trim() || null
		} else {
			insideBlock = false
			currentServer = null
		}
	}

	if (!insideBlock || !currentServer) {
		return null
	}

	return { serverName: currentServer }
}

export function parseToolLine(line: string, cursorCh: number): TriggerContext | null {
	const toolIndex = line.indexOf('tool:')
	if (toolIndex === -1) return null

	const colonIndex = toolIndex + 5
	let startCh = colonIndex
	while (startCh < line.length && line.charAt(startCh) === ' ') {
		startCh++
	}

	if (cursorCh < startCh) return null
	const querySegment = line.slice(startCh, cursorCh)
	return { startCh, query: querySegment }
}

export function filterTools(tools: ToolDefinition[], query: string): ToolDefinition[] {
	if (!query) {
		return tools.slice(0, 50)
	}

	const lowerQuery = query.toLowerCase()
	return tools.filter((tool) => tool.name.toLowerCase().startsWith(lowerQuery)).slice(0, 50)
}
