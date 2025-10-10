import { createHash } from 'crypto'
import type { Editor } from 'obsidian'
import { parse as parseYAML } from 'yaml'

export interface CachedToolResult {
	serverId: string
	serverName: string
	toolName: string
	parameters: Record<string, unknown>
	parameterHash: string
	durationMs?: number
	executedAt?: number
	resultMarkdown: string
	calloutRange: { startLine: number; endLine: number }
	resultRange?: { startLine: number; endLine: number }
}

interface ParsedCalloutBlock {
	toolName: string
	serverId: string
	serverName: string
	parameters: Record<string, unknown>
	parameterHash: string
	durationMs?: number
	executedAt?: number
	resultMarkdown: string
	startLine: number
	endLine: number
	resultStartLine?: number
	resultEndLine?: number
}

export class DocumentToolCache {
	findExistingResult(
		editor: Editor,
		serverId: string,
		toolName: string,
		parameters: Record<string, unknown>
	): CachedToolResult | null {
		const parameterHash = this.hashParameters(parameters)
		return (
			this.getAllResults(editor).find(
				(result) =>
					result.serverId === serverId && result.toolName === toolName && result.parameterHash === parameterHash
			) ?? null
		)
	}

	getAllResults(editor: Editor): CachedToolResult[] {
		const value = editor.getValue()
		return this.parseDocument(value)
	}

	hashParameters(parameters: Record<string, unknown>): string {
		const normalized = this.normalizeForHash(parameters)
		return createHash('sha256').update(normalized).digest('hex')
	}

	private normalizeForHash(value: unknown): string {
		return JSON.stringify(this.sortValue(value))
	}

	private sortValue(value: unknown): unknown {
		if (Array.isArray(value)) {
			return value.map((entry) => this.sortValue(entry))
		}

		if (value && typeof value === 'object') {
			const entries = Object.entries(value as Record<string, unknown>)
			return entries
				.sort(([a], [b]) => a.localeCompare(b))
				.reduce<Record<string, unknown>>((acc, [key, val]) => {
					acc[key] = this.sortValue(val)
					return acc
				}, {})
		}

		return value
	}

	private parseDocument(value: string): CachedToolResult[] {
		const lines = value.split('\n')
		const results: CachedToolResult[] = []

		for (let index = 0; index < lines.length; index++) {
			const line = lines[index]
			if (!line.trimStart().startsWith('> [!tool]')) {
				continue
			}

			const parsed = this.parseCalloutBlock(lines, index)
			if (parsed) {
				results.push({
					serverId: parsed.serverId,
					serverName: parsed.serverName,
					toolName: parsed.toolName,
					parameters: parsed.parameters,
					parameterHash: parsed.parameterHash,
					durationMs: parsed.durationMs,
					executedAt: parsed.executedAt,
					resultMarkdown: parsed.resultMarkdown,
					calloutRange: { startLine: parsed.startLine, endLine: parsed.endLine },
					resultRange:
						parsed.resultStartLine !== undefined && parsed.resultEndLine !== undefined
							? { startLine: parsed.resultStartLine, endLine: parsed.resultEndLine }
							: undefined
				})
				index = parsed.endLine
			}
		}

		return results
	}

	private parseCalloutBlock(lines: string[], startLine: number): ParsedCalloutBlock | null {
		const blockLines: string[] = []
		let endLine = startLine

		for (let index = startLine; index < lines.length; index++) {
			const line = lines[index]
			if (!line.trimStart().startsWith('>')) {
				break
			}
			blockLines.push(line)
			endLine = index
		}

		if (blockLines.length === 0) {
			return null
		}

		const stripped = blockLines.map((line) => this.stripPrefix(line))
		const header = stripped[0]
		if (!header?.startsWith('[!tool]')) {
			return null
		}

		let serverId = ''
		let serverName = ''
		let toolName = ''

		const headerDetailMatch = header.match(/^\[!tool\]\s*Tool Call \((.+)\)$/)
		if (headerDetailMatch) {
			const detail = headerDetailMatch[1]
			const colonIndex = detail.lastIndexOf(':')
			if (colonIndex !== -1) {
				const headerServer = detail.slice(0, colonIndex).trim()
				const headerTool = detail.slice(colonIndex + 1).trim()
				if (headerServer) {
					serverName = headerServer
				}
				if (headerTool) {
					toolName = headerTool
				}
			}
		}
		let durationMs: number | undefined
		let executedAt: number | undefined
		let resultMarkdown = ''
		let resultStartLine: number | undefined
		let resultEndLine: number | undefined

		let inToolCode = false
		let inResultCode = false
		let resultsSection = false
		const toolCodeLines: string[] = []
		const resultLines: string[] = []

		for (let offset = 1; offset < stripped.length; offset++) {
			const rawLine = stripped[offset]
			const trimmed = rawLine.trim()
			const absoluteLine = startLine + offset

			if (inToolCode) {
				if (trimmed.startsWith('```')) {
					inToolCode = false
				} else {
					toolCodeLines.push(rawLine)
				}
				continue
			}

			if (inResultCode) {
				if (trimmed.startsWith('```')) {
					inResultCode = false
					resultEndLine = absoluteLine
				} else {
					resultLines.push(rawLine)
				}
				continue
			}

			if (trimmed.length === 0) {
				continue
			}

			if (trimmed.startsWith('Server ID:')) {
				serverId = trimmed.replace('Server ID:', '').trim()
				continue
			}

			if (trimmed.startsWith('Duration:')) {
				const match = trimmed.match(/Duration:\s*(\d+)ms/i)
				if (match) {
					durationMs = Number.parseInt(match[1], 10)
				}
				continue
			}

			if (trimmed.startsWith('Executed:')) {
				const iso = trimmed.replace('Executed:', '').trim()
				const parsed = Date.parse(iso)
				executedAt = Number.isNaN(parsed) ? undefined : parsed
				continue
			}

			if (trimmed.startsWith('```')) {
				const language = trimmed.slice(3).trim()
				if (!resultsSection) {
					inToolCode = true
					serverName = language || serverName
				} else {
					inResultCode = true
					resultStartLine = absoluteLine
				}
				continue
			}

			if (trimmed.toLowerCase() === 'results:') {
				resultsSection = true
				resultStartLine = absoluteLine
				continue
			}
		}

		if (toolCodeLines.length === 0) {
			return null
		}

		const toolYamlSource = toolCodeLines.join('\n')
		let parsedYaml: Record<string, unknown> | null = null
		try {
			const parsed = parseYAML(toolYamlSource)
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				parsedYaml = parsed as Record<string, unknown>
			}
		} catch {
			parsedYaml = null
		}

		if (!parsedYaml) {
			return null
		}

		const { tool, ...rest } = parsedYaml
		if (typeof tool === 'string') {
			toolName = tool
		} else if (!toolName) {
			toolName = ''
		}

		const parameters = rest
		const parameterHash = this.hashParameters(parameters)

		if (resultLines.length === 0) {
			return null
		}

		resultMarkdown = resultLines.join('\n').trim()

		if (!serverId || !toolName) {
			return null
		}

		return {
			toolName,
			serverId,
			serverName,
			parameters,
			parameterHash,
			durationMs,
			executedAt,
			resultMarkdown,
			startLine,
			endLine,
			resultStartLine,
			resultEndLine
		}
	}

	private stripPrefix(line: string): string {
		return line.replace(/^>\s?/, '')
	}
}
