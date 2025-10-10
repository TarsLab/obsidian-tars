import { describe, expect, it, vi } from 'vitest'

import {
	type Message,
	type ProviderAdapter,
	ToolCallingCoordinator,
	type ToolExecutionResult
} from '../../src/mcp/toolCallingCoordinator'
import type { ToolCall, ToolResponseParser } from '../../src/mcp/toolResponseParser'

interface StubToolExecutor {
	executeTool(request: {
		serverId: string
		toolName: string
		parameters: Record<string, unknown>
		source: 'user-codeblock' | 'ai-autonomous'
		documentPath: string
	}): Promise<ToolExecutionResult>
}

class MockEditor {
	public content = ''
	private cursor = { line: 0, ch: 0 }

	getCursor() {
		return { ...this.cursor }
	}

	getValue() {
		return this.content
	}

	setCursor(position: { line: number; ch: number }) {
		this.cursor = { ...position }
	}

	replaceRange(text: string, from?: { line: number; ch: number }, to?: { line: number; ch: number }) {
		const startPos = from ?? this.cursor
		const startOffset = this.posToOffset(startPos)
		const endOffset = to ? this.posToOffset(to) : startOffset
		this.content = `${this.content.slice(0, startOffset)}${text}${this.content.slice(endOffset)}`
		const newOffset = startOffset + text.length
		this.cursor = this.offsetToPos(newOffset)
	}

	posToOffset(pos: { line: number; ch: number }) {
		const lines = this.content.split('\n')
		let offset = 0
		for (let line = 0; line < pos.line; line++) {
			offset += (lines[line]?.length ?? 0) + 1
		}
		return offset + pos.ch
	}

	offsetToPos(offset: number) {
		const lines = this.content.split('\n')
		let remaining = offset
		for (let line = 0; line < lines.length; line++) {
			const length = lines[line]?.length ?? 0
			if (remaining <= length) {
				return { line, ch: remaining }
			}
			remaining -= length + 1
		}
		const lastLine = Math.max(0, lines.length - 1)
		return { line: lastLine, ch: (lines[lastLine]?.length ?? 0) }
	}
}

describe('ToolCallingCoordinator integration: markdown persistence', () => {
	it('should persist tool call markdown into editor', async () => {
		const toolCall: ToolCall = {
			id: 'call_1',
			name: 'getWeather',
			arguments: { city: 'London' }
		}

		const mockParser: ToolResponseParser<unknown> = {
			reset: vi.fn(),
			parseChunk: vi.fn().mockImplementation(() => null),
			hasCompleteToolCalls: vi.fn().mockReturnValueOnce(true).mockReturnValue(false),
			getToolCalls: vi.fn().mockReturnValueOnce([toolCall]).mockReturnValue([])
		}

		const adapter: ProviderAdapter = {
			async *sendRequest(messages: Message[]) {
				if (messages.length === 1) {
					yield {}
				} else {
					yield { content: 'Weather retrieved.' }
				}
			},
			getParser: () => mockParser,
			findServer: () => ({ id: 'server-weather', name: 'Weather Server' }),
			formatToolResult: vi.fn().mockImplementation(() => ({
				role: 'tool',
				content: JSON.stringify({ forecast: 'Sunny' }),
				tool_call_id: toolCall.id
			}))
		}

		const executor: StubToolExecutor = {
			executeTool: vi.fn().mockResolvedValue({
				content: { forecast: 'Sunny', temperature: 25 },
				contentType: 'json',
				executionDuration: 1234
			})
		}

		const editor = new MockEditor()

		const coordinator = new ToolCallingCoordinator()

		for await (const _chunk of coordinator.generateWithTools(
			[{ role: 'user', content: 'What is the weather?' }],
			adapter,
			executor as unknown as import('../../src/mcp/executor').ToolExecutor,
			{
				documentPath: 'Weather.md',
				onToolCall: vi.fn(),
				onToolResult: vi.fn(),
				editor
			} as never
		)) {
			// consume generator
		}

		expect(editor.content).toContain('> [!tool] Tool Call (Weather Server: getWeather)')
		expect(editor.content).toContain('> Server ID: server-weather')
		expect(editor.content).toContain('> ```Weather Server')
		expect(editor.content).toContain('> tool: getWeather')
		expect(editor.content).toContain('> city: London')
		expect(editor.content).toContain('> Duration: 1234ms')
		expect(editor.content).toContain('> Results:')
		expect(editor.content).toContain('> {')
		expect(editor.content).toContain('>   "forecast": "Sunny"')
		expect(editor.content).toMatch(/> Executed: .+Z/)
		expect(editor.content).toContain('>   "forecast": "Sunny"')
	})

	it('should reuse cached tool result when user chooses cached option', async () => {
		const toolCall: ToolCall = {
			id: 'call_cached',
			name: 'getWeather',
			arguments: { city: 'Paris' }
		}

		const mockParser: ToolResponseParser<unknown> = {
			reset: vi.fn(),
			parseChunk: vi.fn().mockImplementation(() => null),
			hasCompleteToolCalls: vi.fn().mockReturnValueOnce(true).mockReturnValue(false),
			getToolCalls: vi.fn().mockReturnValueOnce([toolCall]).mockReturnValue([])
		}

		const adapter = {
			sendRequest: async function* () {
				yield {}
			},
			getParser: () => mockParser,
			findServer: () => ({ id: 'weather-server', name: 'Weather Server' }),
			formatToolResult: vi.fn().mockImplementation((_id, result) => ({
				role: 'tool',
				content: String(result.content),
				tool_call_id: toolCall.id
			}))
		} as unknown as ProviderAdapter<unknown>

		const executor: StubToolExecutor = {
			executeTool: vi.fn().mockResolvedValue({
				content: { forecast: 'Rainy' },
				contentType: 'json',
				executionDuration: 999
			})
		}

		const coordinator = new ToolCallingCoordinator()
		const editor = new MockEditor()
		editor.content = `> [!tool] Tool Call (Weather Server: getWeather)
> Server ID: weather-server
> \`\`\`Weather Server
> tool: getWeather
> city: Paris
> \`\`\`
> Duration: 180ms
> Executed: 2025-10-09T12:00:00.000Z
> Results:
> \`\`\`
> {
>   "forecast": "Cloudy"
> }
> \`\`\`
`

		const prompt = vi.fn().mockResolvedValue<'use-cached'>('use-cached')

		for await (const _chunk of coordinator.generateWithTools(
			[{ role: 'user', content: 'Weather?' }],
			adapter,
			executor as unknown as import('../../src/mcp/executor').ToolExecutor,
			{
				documentPath: 'Weather.md',
				editor,
				onPromptCachedResult: prompt
			} as never
		)) {
			// consume generator
		}

		expect(prompt).toHaveBeenCalledWith('getWeather', expect.objectContaining({ serverId: 'weather-server' }))
		expect(executor.executeTool).not.toHaveBeenCalled()
		expect(adapter.formatToolResult).toHaveBeenCalledWith(
			toolCall.id,
			expect.objectContaining({ contentType: 'markdown' })
		)
	})
})
