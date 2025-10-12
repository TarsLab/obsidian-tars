import { createLogger } from '../logger'
import type { ToolDefinition } from '../mcp/types'

const logger = createLogger('suggest:mcp-helpers')

export type EditorPositionLike = { line: number; ch: number }
export type EditorLike = { getLine(line: number): string }

export interface CodeBlockContext {
	serverName: string
	blockStartLine: number
}

export interface TriggerContext {
	startCh: number
	query: string
}

export function detectMCPCodeBlockContext(editor: EditorLike, cursor: EditorPositionLike): CodeBlockContext | null {
	let insideBlock = false
	let currentServer: string | null = null
	let blockStartLine = -1

	for (let lineIndex = 0; lineIndex <= cursor.line; lineIndex++) {
		const trimmed = editor.getLine(lineIndex)?.trim() ?? ''
		if (!trimmed.startsWith('```')) continue

		if (!insideBlock) {
			insideBlock = true
			currentServer = trimmed.slice(3).trim() || null
			blockStartLine = lineIndex
		} else {
			insideBlock = false
			currentServer = null
			blockStartLine = -1
		}
	}

	if (!insideBlock || !currentServer || blockStartLine === -1) {
		return null
	}

	return { serverName: currentServer, blockStartLine }
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

export interface ParameterDefinition {
	name: string
	type: string
	description?: string
	required: boolean
	example?: unknown
}

export interface RequiredParameterInsertionPlan {
	lines: string[]
	cursorColumn: number | null
}

export function parseParameterLine(line: string, cursorCh: number): TriggerContext | null {
	const trimmedLine = line.trim()
	if (trimmedLine.startsWith('```')) {
		return null
	}
	if (trimmedLine.toLowerCase().startsWith('tool:')) {
		return null
	}

	const firstNonWhitespace = line.search(/\S/)
	const startCh = firstNonWhitespace === -1 ? cursorCh : Math.min(firstNonWhitespace, cursorCh)
	if (startCh > cursorCh) return null

	const colonIndex = line.indexOf(':', startCh)
	if (colonIndex !== -1 && cursorCh > colonIndex) {
		return null
	}

	const endCh = colonIndex === -1 ? cursorCh : Math.min(colonIndex, cursorCh)
	if (endCh < startCh) {
		return null
	}

	const querySegment = line.slice(startCh, endCh)
	return { startCh, query: querySegment }
}

export function findToolNameInBlock(editor: EditorLike, blockStartLine: number, cursorLine: number): string | null {
	for (let lineIndex = blockStartLine + 1; lineIndex <= cursorLine; lineIndex++) {
		const rawLine = editor.getLine(lineIndex) ?? ''
		const trimmed = rawLine.trim()
		if (!trimmed.toLowerCase().startsWith('tool:')) {
			continue
		}

		const toolBody = trimmed.slice(5).trim()
		if (!toolBody) {
			continue
		}

		const [toolName] = toolBody.split(/\s+/)
		return toolName || null
	}

	return null
}

export function collectUsedParameters(editor: EditorLike, blockStartLine: number, cursorLine: number): Set<string> {
	const used = new Set<string>()
	for (let lineIndex = blockStartLine + 1; lineIndex < cursorLine; lineIndex++) {
		const rawLine = editor.getLine(lineIndex) ?? ''
		const trimmed = rawLine.trim()
		if (!trimmed || trimmed.startsWith('tool:')) {
			continue
		}

		const colonIndex = trimmed.indexOf(':')
		if (colonIndex === -1) {
			continue
		}

		const paramName = trimmed.slice(0, colonIndex).trim()
		if (!paramName) {
			continue
		}

		used.add(paramName)
	}
	return used
}

export function extractParameterDefinitions(tool: ToolDefinition): ParameterDefinition[] {
	const schema = tool.inputSchema as Record<string, unknown> | undefined
	if (!schema || typeof schema !== 'object') {
		return []
	}

	const properties = (schema.properties as Record<string, unknown> | undefined) ?? undefined
	if (!properties || typeof properties !== 'object') {
		return []
	}

	const requiredRaw = (schema.required as unknown) ?? []
	const required = Array.isArray(requiredRaw)
		? (requiredRaw.filter((value) => typeof value === 'string') as string[])
		: []

	const entries = Object.entries(properties)
	return entries.map(([name, value]) => {
		const paramSchema = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
		const typeValue = paramSchema['type']
		let paramType = 'any'
		if (typeof typeValue === 'string') {
			paramType = typeValue
		} else if (Array.isArray(typeValue)) {
			const firstString = typeValue.find((item) => typeof item === 'string')
			if (firstString) {
				paramType = firstString
			}
		}

		const example =
			paramSchema['example'] ??
			(Array.isArray(paramSchema['examples']) && paramSchema['examples'].length > 0
				? (paramSchema['examples'][0] as unknown)
				: undefined)

		return {
			name,
			type: paramType,
			description: typeof paramSchema['description'] === 'string' ? (paramSchema['description'] as string) : undefined,
			required: required.includes(name),
			example
		}
	})
}

export function filterParameters(
	parameters: ParameterDefinition[],
	query: string,
	usedParameterNames: Set<string>
): ParameterDefinition[] {
	const normalizedQuery = query.trim().toLowerCase()
	return parameters
		.filter((param) => !usedParameterNames.has(param.name))
		.filter((param) => {
			if (!normalizedQuery) return true
			return param.name.toLowerCase().startsWith(normalizedQuery)
		})
		.slice(0, 50)
}

export function buildParameterPlaceholder(definition: ParameterDefinition): string {
	if (definition.example !== undefined && definition.example !== null) {
		return formatExample(definition.example)
	}

	switch (definition.type) {
		case 'string':
			return '""'
		case 'number':
		case 'integer':
			return '0'
		case 'boolean':
			return 'false'
		case 'array':
			return '[]'
		case 'object':
			return '{}'
		default:
			return ''
	}
}

function formatExample(example: unknown): string {
	if (typeof example === 'string') {
		return example
	}
	if (typeof example === 'number' || typeof example === 'bigint') {
		return String(example)
	}
	if (typeof example === 'boolean') {
		return example ? 'true' : 'false'
	}
	if (example === null) {
		return 'null'
	}
	if (typeof example === 'object') {
		try {
			return JSON.stringify(example)
		} catch (error) {
			logger.debug('failed to stringify parameter example', error)
		}
	}
	return String(example)
}

export function buildRequiredParameterInsertion(
	definitions: ParameterDefinition[],
	usedParameterNames: Set<string>,
	indentation: string
): RequiredParameterInsertionPlan {
	const requiredDefinitions = definitions.filter(
		(definition) => definition.required && !usedParameterNames.has(definition.name)
	)
	if (requiredDefinitions.length === 0) {
		return { lines: [], cursorColumn: null }
	}

	const lines = requiredDefinitions.map((definition) => {
		const placeholder = buildParameterPlaceholder(definition)
		const valueSegment = placeholder ? ` ${placeholder}` : ' '
		return `${indentation}${definition.name}:${valueSegment}`
	})

	const firstLine = lines[0] ?? ''
	const colonIndex = firstLine.indexOf(':')
	let cursorColumn = colonIndex === -1 ? firstLine.length : colonIndex + 1
	if (firstLine.charAt(cursorColumn) === ' ') {
		cursorColumn += 1
	}

	return { lines, cursorColumn }
}
