import { describe, expect, it } from 'vitest'

import {
	detectMCPCodeBlockContext,
	filterTools,
	parseToolLine
} from '../../src/suggests/mcpToolSuggestHelpers'
import type { ToolDefinition } from '../../src/mcp/types'

type EditorPosition = { line: number; ch: number }

const buildEditor = (lines: string[]) => ({
	getLine: (line: number) => lines[line] ?? ''
})

describe('MCP tool suggestion helpers', () => {
	it('detects server language when cursor is inside MCP code block', () => {
		// Given: Code block with MCP server language and cursor on tool line
		const editor = buildEditor(['Regular text', '```memory', 'tool: store', '```'])
		const cursor: EditorPosition = { line: 2, ch: 9 } as EditorPosition

		// When: Detecting MCP code block context
		const context = detectMCPCodeBlockContext(editor, cursor)

		// Then: Server name is returned for the active code block
		expect(context).toEqual({ serverName: 'memory' })
	})

	it('returns null when cursor is not inside MCP code block', () => {
		// Given: Document without MCP code block wrapping cursor line
		const editor = buildEditor(['Regular text', 'tool: store'])
		const cursor: EditorPosition = { line: 1, ch: 5 } as EditorPosition

		// When: Detecting MCP code block context
		const context = detectMCPCodeBlockContext(editor, cursor)

		// Then: No server language is detected
		expect(context).toBeNull()
	})

	it('parses tool line and returns start column and partial query', () => {
		// Given: Tool declaration line with partial tool name
		const line = 'tool: store_mem'

		// When: Parsing the tool line up to cursor position
		const result = parseToolLine(line, line.length)

		// Then: Start column excludes prefix and query reflects typed text
		expect(result).toEqual({ startCh: 5 + 1, query: 'store_mem' })
	})

	it('filters tools by prefix and enforces maximum list size', () => {
		// Given: Tool definitions and partial query
		const tools: ToolDefinition[] = [
			{ name: 'store_memory', description: 'Store memory', inputSchema: {} },
			{ name: 'retrieve_memory', description: 'Retrieve memory', inputSchema: {} },
			{ name: 'list_memories', description: 'List', inputSchema: {} }
		]

		// When: Filtering using matching prefix
		const matches = filterTools(tools, 'store')

		// Then: Only tools starting with prefix are returned
		expect(matches.map((tool) => tool.name)).toEqual(['store_memory'])
	})
})
