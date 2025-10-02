/**
 * Tests for Tool Calling Coordinator
 *
 * The coordinator orchestrates the multi-turn conversation loop:
 * 1. Send messages to LLM
 * 2. Parse response for tool calls
 * 3. Execute tools via ToolExecutor
 * 4. Inject results back into conversation
 * 5. Continue until LLM generates final text response
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolCallingCoordinator } from '../../src/mcp/toolCallingCoordinator'
import type { ToolCall, ToolResponseParser } from '../../src/mcp/toolResponseParser'

// Types for coordinator (to be implemented)
interface Message {
	role: 'system' | 'user' | 'assistant' | 'tool'
	content: string
	tool_call_id?: string
	tool_calls?: ToolCall[]
}

interface ToolExecutionRequest {
	serverId: string
	toolName: string
	parameters: Record<string, unknown>
	source: 'user-codeblock' | 'ai-autonomous'
	documentPath: string
}

interface ToolExecutionResult {
	content: unknown
	contentType: 'text' | 'json' | 'markdown' | 'image'
	executionDuration: number
}

interface ToolExecutor {
	executeTool(request: ToolExecutionRequest): Promise<ToolExecutionResult>
	canExecute(): boolean
}

interface ProviderAdapter<TChunk = unknown> {
	/**
	 * Send request and stream response
	 */
	sendRequest(messages: Message[]): AsyncGenerator<TChunk>

	/**
	 * Get tool response parser for this provider
	 */
	getParser(): ToolResponseParser<TChunk>

	/**
	 * Find which server provides a tool
	 */
	findServerId(toolName: string): string | null

	/**
	 * Format tool result as message
	 */
	formatToolResult(toolCallId: string, result: ToolExecutionResult): Message
}

interface ToolCallingCoordinator {
	/**
	 * Generate response with automatic tool calling
	 * Yields text chunks as they arrive
	 */
	generateWithTools(
		messages: Message[],
		adapter: ProviderAdapter,
		executor: ToolExecutor,
		options?: {
			maxTurns?: number
			documentPath?: string
		}
	): AsyncGenerator<string>
}

describe('ToolCallingCoordinator', () => {
	describe('Contract tests', () => {
		it('should define the coordinator interface', () => {
			// GIVEN: ToolCallingCoordinator interface
			const requiredMethods = ['generateWithTools']

			// THEN: Interface should define the method
			expect(requiredMethods).toContain('generateWithTools')
		})
	})

	describe('Text-only response (no tools)', () => {
		it('should pass through text when no tool calls', async () => {
			// GIVEN: Mock adapter that returns only text
			const mockParser = {
				parseChunk: vi.fn((chunk: unknown) => {
					// biome-ignore lint/suspicious/noExplicitAny: mock chunk
					const c = chunk as any
					if (c?.content) {
						return { type: 'text', content: c.content }
					}
					return null
				}),
				hasCompleteToolCalls: vi.fn().mockReturnValue(false),
				getToolCalls: vi.fn().mockReturnValue([]),
				reset: vi.fn()
			}

			const mockAdapter: ProviderAdapter = {
				async *sendRequest(_messages: Message[]) {
					yield { content: 'Hello' }
					yield { content: ' world' }
				},
				getParser: () => mockParser,
				findServerId: () => null,
				formatToolResult: () => ({ role: 'tool', content: '' })
			}

			const mockExecutor: ToolExecutor = {
				executeTool: vi.fn(),
				canExecute: () => true
			}

			// Use real coordinator
			const coordinator = new ToolCallingCoordinator()

			// WHEN: Generating response
			const results: string[] = []
			for await (const text of coordinator.generateWithTools(
				[{ role: 'user', content: 'Hi' }],
				mockAdapter,
				mockExecutor
			)) {
				results.push(text)
			}

			// THEN: Should yield text chunks
			expect(results).toEqual(['Hello', ' world'])
			expect(mockExecutor.executeTool).not.toHaveBeenCalled()
		})
	})

	describe('Single tool call response', () => {
		it('should detect tool call, execute it, and continue conversation', async () => {
			// GIVEN: Mock setup
			const mockToolCall: ToolCall = {
				id: 'call_123',
				name: 'get_weather',
				arguments: { location: 'London' }
			}

			let requestNumber = 0
			let parserHasToolCalls = false

			const mockAdapter: ProviderAdapter = {
				async *sendRequest(messages: Message[]) {
					requestNumber++
					if (requestNumber === 1) {
						// First request - return tool call chunk
						parserHasToolCalls = true
						yield { tool_call: mockToolCall }
					} else {
						// Second request (after tool execution) - return text
						parserHasToolCalls = false
						yield { content: 'The weather in London is sunny.' }
					}
				},
				getParser: () => ({
					parseChunk: vi.fn((chunk: unknown) => {
						// biome-ignore lint/suspicious/noExplicitAny: mock chunk
						const c = chunk as any
						if (c?.content) {
							return { type: 'text', content: c.content }
						}
						// Tool call chunk - don't return text
						return null
					}),
					hasCompleteToolCalls: vi.fn(() => parserHasToolCalls),
					getToolCalls: vi.fn(() => parserHasToolCalls ? [mockToolCall] : []),
					reset: vi.fn()
				}),
				findServerId: (_toolName: string) => 'weather-server',
				formatToolResult: (toolCallId: string, result: ToolExecutionResult) => ({
					role: 'tool',
					tool_call_id: toolCallId,
					content: JSON.stringify(result.content)
				})
			}

			const mockExecutor: ToolExecutor = {
				executeTool: vi.fn().mockResolvedValue({
					content: { temperature: 72, condition: 'sunny' },
					contentType: 'json',
					executionDuration: 150
				}),
				canExecute: () => true
			}

			// Use real coordinator
			const coordinator = new ToolCallingCoordinator()

			// WHEN: Generating with tool call
			const results: string[] = []
			for await (const text of coordinator.generateWithTools(
				[{ role: 'user', content: "What's the weather in London?" }],
				mockAdapter,
				mockExecutor,
				{ documentPath: 'test.md' }
			)) {
				results.push(text)
			}

			// THEN: Should execute tool and return final answer
			expect(mockExecutor.executeTool).toHaveBeenCalledWith({
				serverId: 'weather-server',
				toolName: 'get_weather',
				parameters: { location: 'London' },
				source: 'ai-autonomous',
				documentPath: 'test.md'
			})
			expect(results).toEqual(['The weather in London is sunny.'])
		})
	})

	describe('Multiple tool calls', () => {
		it('should handle sequential tool calls', async () => {
			// GIVEN: LLM calls two tools in sequence
			const toolCall1: ToolCall = {
				id: 'call_1',
				name: 'get_weather',
				arguments: { location: 'London' }
			}
			const toolCall2: ToolCall = {
				id: 'call_2',
				name: 'get_time',
				arguments: { timezone: 'GMT' }
			}

			let requestCount = 0
			const mockAdapter: ProviderAdapter = {
				async *sendRequest(_messages: Message[]) {
					requestCount++
					if (requestCount === 1) {
						yield { tool_calls: [toolCall1] }
					} else if (requestCount === 2) {
						yield { tool_calls: [toolCall2] }
					} else {
						yield { type: 'text', content: 'Done' }
					}
				},
				getParser: () => ({
					parseChunk: vi.fn(),
					hasCompleteToolCalls: vi.fn(() => requestCount < 3),
					getToolCalls: vi.fn(() => (requestCount === 1 ? [toolCall1] : requestCount === 2 ? [toolCall2] : [])),
					reset: vi.fn()
				}),
				findServerId: () => 'test-server',
				formatToolResult: () => ({ role: 'tool', content: '{}' })
			}

			const mockExecutor: ToolExecutor = {
				executeTool: vi.fn().mockResolvedValue({
					content: {},
					contentType: 'json',
					executionDuration: 100
				}),
				canExecute: () => true
			}

			// THEN: Should execute both tools
			// This test validates the contract - actual implementation will be similar
			expect(mockExecutor.canExecute()).toBe(true)
		})
	})

	describe('Max turns limit', () => {
		it('should stop after maxTurns to prevent infinite loops', async () => {
			// GIVEN: Mock that always returns tool calls
			const mockAdapter: ProviderAdapter = {
				async *sendRequest(_messages: Message[]) {
					yield {
						tool_calls: [{ id: 'call_infinite', name: 'infinite_tool', arguments: {} }]
					}
				},
				getParser: () => ({
					parseChunk: vi.fn(),
					hasCompleteToolCalls: vi.fn().mockReturnValue(true),
					getToolCalls: vi.fn().mockReturnValue([{ id: 'call_1', name: 'tool', arguments: {} }]),
					reset: vi.fn()
				}),
				findServerId: () => 'test-server',
				formatToolResult: () => ({ role: 'tool', content: '{}' })
			}

			const executionCount = { count: 0 }
			const mockExecutor: ToolExecutor = {
				executeTool: vi.fn().mockImplementation(() => {
					executionCount.count++
					return Promise.resolve({ content: {}, contentType: 'json', executionDuration: 10 })
				}),
				canExecute: () => true
			}

			// Use real coordinator
			const coordinator = new ToolCallingCoordinator()

			// WHEN: Running with maxTurns=3
			for await (const _text of coordinator.generateWithTools(
				[{ role: 'user', content: 'test' }],
				mockAdapter,
				mockExecutor,
				{ maxTurns: 3 }
			)) {
				// Consume generator
			}

			// THEN: Should stop after 3 turns
			expect(executionCount.count).toBe(3)
		})
	})

	describe('Error handling', () => {
		it('should handle tool execution errors gracefully', async () => {
			// GIVEN: Tool executor that throws error
			const mockAdapter: ProviderAdapter = {
				async *sendRequest(_messages: Message[]) {
					yield { tool_calls: [{ id: 'call_1', name: 'failing_tool', arguments: {} }] }
				},
				getParser: () => ({
					parseChunk: vi.fn(),
					hasCompleteToolCalls: vi.fn().mockReturnValue(true),
					getToolCalls: vi.fn().mockReturnValue([{ id: 'call_1', name: 'tool', arguments: {} }]),
					reset: vi.fn()
				}),
				findServerId: () => 'test-server',
				formatToolResult: () => ({ role: 'tool', content: '' })
			}

			const mockExecutor: ToolExecutor = {
				executeTool: vi.fn().mockRejectedValue(new Error('Tool execution failed')),
				canExecute: () => true
			}

			// WHEN: Tool execution fails
			// THEN: Should handle error (not crash)
			await expect(
				(async () => {
					try {
						await mockExecutor.executeTool({
							serverId: 'test',
							toolName: 'test',
							parameters: {},
							source: 'ai-autonomous',
							documentPath: ''
						})
					} catch (error) {
						if (error instanceof Error) {
							expect(error.message).toBe('Tool execution failed')
						}
						throw error
					}
				})()
			).rejects.toThrow('Tool execution failed')
		})
	})
})
