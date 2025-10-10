import { describe, expect, it } from 'vitest'
import type { ToolDefinition } from '../../src/mcp/types'
import {
	buildParameterPlaceholder,
	buildRequiredParameterInsertion,
	collectUsedParameters,
	detectMCPCodeBlockContext,
	extractParameterDefinitions,
	filterParameters,
	filterTools,
	findToolNameInBlock,
	parseParameterLine,
	parseToolLine
} from '../../src/suggests/mcpToolSuggestHelpers'

type EditorPosition = { line: number; ch: number }

const buildEditor = (lines: string[]) => ({
	getLine: (line: number) => lines[line] ?? ''
})

describe('Required parameter insertion planning', () => {
	it('builds lines for required parameters with indentation and hints', () => {
		// Given: Required parameter definitions needing scaffold
		const definitions = [
			{ name: 'query', type: 'string', required: true, description: '', example: 'search term' },
			{ name: 'limit', type: 'integer', required: true, description: '' },
			{ name: 'include_metadata', type: 'boolean', required: false, description: '' }
		]
		const used = new Set<string>()

		// When: Building insertion plan
		const plan = buildRequiredParameterInsertion(definitions, used, '	')

		// Then: Only required parameters are planned with placeholders
		expect(plan.lines).toEqual(['	query: search term', '	limit: 0'])
		expect(plan.cursorColumn).toBe(8)
	})

	it('skips parameters that already exist and returns empty plan when none remain', () => {
		// Given: Required parameter already present in document
		const definitions = [{ name: 'query', type: 'string', required: true, description: '', example: 'term' }]
		const used = new Set<string>(['query'])

		// When: Building insertion plan
		const plan = buildRequiredParameterInsertion(definitions, used, '')

		// Then: No lines need to be inserted and cursor remains null
		expect(plan.lines).toEqual([])
		expect(plan.cursorColumn).toBeNull()
	})
})

describe('MCP tool suggestion helpers', () => {
	it('detects server language when cursor is inside MCP code block', () => {
		// Given: Code block with MCP server language and cursor on tool line
		const editor = buildEditor(['Regular text', '```memory', 'tool: store', '```'])
		const cursor: EditorPosition = { line: 2, ch: 9 } as EditorPosition

		// When: Detecting MCP code block context
		const context = detectMCPCodeBlockContext(editor, cursor)

		// Then: Server name and block start position are returned
		expect(context).toEqual({ serverName: 'memory', blockStartLine: 1 })
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

describe('MCP parameter suggestion helpers', () => {
	it('parses parameter line before colon and returns trigger information', () => {
		// Given: Parameter declaration with partial name typed
		const line = '  query_va'
		const cursorCh = line.length

		// When: Parsing parameter line context
		const result = parseParameterLine(line, cursorCh)

		// Then: Trigger starts at first non-whitespace and query captures partial name
		expect(result).toEqual({ startCh: 2, query: 'query_va' })
	})

	it('returns null when cursor is positioned after parameter colon', () => {
		// Given: Parameter with existing colon and cursor in value position
		const line = 'query: value'
		const cursorCh = line.length

		// When: Parsing parameter line context
		const result = parseParameterLine(line, cursorCh)

		// Then: No suggestions are triggered while editing parameter value
		expect(result).toBeNull()
	})

	it('returns trigger info for blank parameter line to prompt suggestions', () => {
		// Given: Newly created parameter line within code block
		const line = ''
		const cursorCh = 0

		// When: Parsing parameter line context
		const result = parseParameterLine(line, cursorCh)

		// Then: Suggestion trigger starts at cursor with empty query
		expect(result).toEqual({ startCh: 0, query: '' })
	})

	it('ignores closing code fence when parsing parameter lines', () => {
		// Given: Line representing end of code block
		const line = '```'
		const cursorCh = line.length

		// When: Parsing parameter line context
		const result = parseParameterLine(line, cursorCh)

		// Then: No suggestions are offered for code fence
		expect(result).toBeNull()
	})

	it('finds tool name earlier in the same MCP code block', () => {
		// Given: Editor lines with code block header and tool declaration
		const editor = buildEditor(['```memory', 'tool: store_memory', 'query: '])
		const blockStartLine = 0
		const cursorLine = 2

		// When: Looking up tool name within block scope
		const toolName = findToolNameInBlock(editor, blockStartLine, cursorLine)

		// Then: Tool name from earlier line is returned
		expect(toolName).toBe('store_memory')
	})

	it('collects parameter names already used in the code block', () => {
		// Given: Editor lines with two parameter declarations before cursor
		const editor = buildEditor(['```memory', 'tool: store', 'query: abc', 'max_results: 3', ''])
		const used = collectUsedParameters(editor, 0, 4)

		// When/Then: Existing parameter names are tracked to avoid duplicate suggestions
		expect([...used]).toEqual(['query', 'max_results'])
	})

	it('extracts parameter metadata and filters unused matches', () => {
		// Given: Tool schema with required and optional parameters
		const tool: ToolDefinition = {
			name: 'search',
			description: 'Search memories',
			inputSchema: {
				type: 'object',
				required: ['query'],
				properties: {
					query: { type: 'string', description: 'What to search for' },
					max_results: { type: 'integer', description: 'Limit number of results' },
					include_metadata: { type: 'boolean' }
				}
			}
		}
		const definitions = extractParameterDefinitions(tool)
		const usedNames = new Set(['query'])

		// When: Filtering using partial query text
		const filtered = filterParameters(definitions, 'm', usedNames)

		// Then: Matching unused parameters are returned with metadata preserved
		expect(filtered).toHaveLength(1)
		expect(filtered[0]).toMatchObject({
			name: 'max_results',
			type: 'integer',
			description: 'Limit number of results',
			required: false
		})
	})

	it('builds parameter placeholders using examples and type defaults', () => {
		// Given: Parameter definitions with and without explicit examples
		const definitions = [
			{ name: 'query', type: 'string', description: '', required: true, example: 'search term' },
			{ name: 'limit', type: 'integer', description: '', required: true },
			{ name: 'include_metadata', type: 'boolean', description: '', required: false },
			{ name: 'notes', type: 'string', description: '', required: false }
		]

		// When: Building placeholders for each definition
		const hints = definitions.map((definition) => buildParameterPlaceholder(definition))

		// Then: Examples are reused and defaults applied per type
		expect(hints).toEqual(['search term', '0', 'false', '""'])
	})
})
