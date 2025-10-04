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

	setCursor(position: { line: number; ch: number }) {
		this.cursor = { ...position }
	}

	replaceRange(text: string, _from: unknown, _to?: unknown) {
		this.content += text
		this.cursor.ch = this.content.length
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

	expect(editor.content).toContain('> [!tool]- Tool Call (Weather Server: getWeather)')
	expect(editor.content).toContain('> Tool: getWeather')
	expect(editor.content).toContain('> Server Name: Weather Server')
	expect(editor.content).toContain('> Server ID: server-weather')
	expect(editor.content).toContain('> ```json')
	expect(editor.content).toContain('>   "city": "London"')
	expect(editor.content).toContain('> [!tool]- Tool Result (1234ms)')
	expect(editor.content).toContain('>   "forecast": "Sunny"')
	})
})
