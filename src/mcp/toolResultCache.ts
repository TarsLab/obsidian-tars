import { createHash } from 'crypto'
import type { Editor } from 'obsidian'

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

interface ParsedCallBlock {
	toolName: string
	serverId: string
	serverName: string
	parameters: Record<string, unknown>
	parameterHash: string
	startLine: number
	endLine: number
}

interface ParsedResultBlock {
	toolName?: string
	durationMs?: number
	executedAt?: number
	markdown: string
	startLine: number
	endLine: number
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
		const callBlocks: ParsedCallBlock[] = []
		const results: CachedToolResult[] = []

		let pendingCall: ParsedCallBlock | undefined

		for (let index = 0; index < lines.length; index++) {
			const line = lines[index]

			if (line.startsWith('> [!tool]- Tool Call')) {
				const parsedCall = this.parseCallBlock(lines, index)
				if (parsedCall) {
					callBlocks.push(parsedCall)
					pendingCall = parsedCall
					index = parsedCall.endLine
				}
				continue
			}

			if (line.startsWith('> [!tool]- Tool Result')) {
				const parsedResult = this.parseResultBlock(lines, index)
				if (parsedResult) {
					const relatedCall = this.findRelatedCall(callBlocks, pendingCall, parsedResult.startLine)
					if (relatedCall) {
						results.push({
							serverId: relatedCall.serverId,
							serverName: relatedCall.serverName,
							toolName: relatedCall.toolName,
							parameters: relatedCall.parameters,
							parameterHash: relatedCall.parameterHash,
							durationMs: parsedResult.durationMs,
							executedAt: parsedResult.executedAt,
							resultMarkdown: parsedResult.markdown,
							calloutRange: { startLine: relatedCall.startLine, endLine: relatedCall.endLine },
							resultRange: { startLine: parsedResult.startLine, endLine: parsedResult.endLine }
						})
						if (pendingCall === relatedCall) {
							pendingCall = undefined
						}
					}
					index = parsedResult.endLine
				}
			}
		}

		return results
	}

	private parseCallBlock(lines: string[], startLine: number): ParsedCallBlock | null {
		let toolName = ''
		let serverName = ''
		let serverId = ''
		const paramsLines: string[] = []
		let inJson = false
		let endLine = startLine

		for (let index = startLine + 1; index < lines.length; index++) {
			const line = lines[index]
			if (!line.startsWith('>')) {
				endLine = index - 1
				break
			}

			endLine = index
			const content = this.stripPrefix(line)

			if (!inJson && content.startsWith('Tool:')) {
				toolName = content.replace('Tool:', '').trim()
				continue
			}

			if (!inJson && content.startsWith('Server Name:')) {
				serverName = content.replace('Server Name:', '').trim()
				continue
			}

			if (!inJson && content.startsWith('Server ID:')) {
				serverId = content.replace('Server ID:', '').trim()
				continue
			}

			if (content.startsWith('```json')) {
				inJson = true
				continue
			}

			if (inJson && content.startsWith('```')) {
				inJson = false
				continue
			}

			if (inJson) {
				paramsLines.push(content)
			}
		}

		const paramsJson = paramsLines.join('\n') || '{}'
		let parameters: Record<string, unknown> = {}
		try {
			parameters = JSON.parse(paramsJson) as Record<string, unknown>
		} catch {
			return null
		}

		return {
			toolName,
			serverId,
			serverName,
			parameters,
			parameterHash: this.hashParameters(parameters),
			startLine,
			endLine
		}
	}

	private parseResultBlock(lines: string[], startLine: number): ParsedResultBlock | null {
		const header = lines[startLine]
		const durationMatch = header.match(/\((\d+)ms\)/)
		const durationMs = durationMatch ? Number.parseInt(durationMatch[1], 10) : undefined

		let executedAt: number | undefined
		const bodyLines: string[] = []
		let endLine = startLine

		for (let index = startLine + 1; index < lines.length; index++) {
			const line = lines[index]
			if (!line.startsWith('>')) {
				endLine = index - 1
				break
			}

			endLine = index
			const content = this.stripPrefix(line)

			if (content.startsWith('Executed:')) {
				const iso = content.replace('Executed:', '').trim()
				const parsed = Date.parse(iso)
				executedAt = Number.isNaN(parsed) ? undefined : parsed
				continue
			}

			bodyLines.push(content)
		}

		return {
			toolName: undefined,
			durationMs,
			executedAt,
			markdown: bodyLines.join('\n').trim(),
			startLine,
			endLine
		}
	}

	private findRelatedCall(
		calls: ParsedCallBlock[],
		pending: ParsedCallBlock | undefined,
		resultStartLine: number
	): ParsedCallBlock | null {
		if (pending && pending.endLine < resultStartLine) {
			return pending
		}

		for (let index = calls.length - 1; index >= 0; index--) {
			const call = calls[index]
			if (call.endLine < resultStartLine) {
				return call
			}
		}

		return null
	}

	private stripPrefix(line: string): string {
		return line.replace(/^>\s?/, '')
	}
}
