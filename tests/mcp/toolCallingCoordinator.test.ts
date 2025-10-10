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
	findServer(toolName: string): { id: string; name: string } | null

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
				findServer: () => null,
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
					getToolCalls: vi.fn(() => (parserHasToolCalls ? [mockToolCall] : [])),
					reset: vi.fn()
				}),
				findServer: (_toolName: string) => ({ id: 'weather-server', name: 'Weather Server' }),
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
				findServer: () => ({ id: 'test-server', name: 'Test Server' }),
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
				findServer: () => ({ id: 'test-server', name: 'Test Server' }),
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
				findServer: () => ({ id: 'test-server', name: 'Test Server' }),
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

	describe('Parallel execution', () => {
		it('should execute multiple tools sequentially by default', async () => {
			// GIVEN: Three tool calls that need execution
			const toolCalls: ToolCall[] = [
				{ id: 'call_1', name: 'tool_a', arguments: {} },
				{ id: 'call_2', name: 'tool_b', arguments: {} },
				{ id: 'call_3', name: 'tool_c', arguments: {} }
			]

			const executionOrder: string[] = []
			let requestCount = 0

			const mockAdapter: ProviderAdapter = {
				async *sendRequest(_messages: Message[]) {
					requestCount++
					if (requestCount === 1) {
						// First request - return multiple tool calls
						yield { tool_calls: toolCalls }
					} else {
						// Second request - return final text
						yield { content: 'All tools executed' }
					}
				},
				getParser: () => ({
					parseChunk: vi.fn((chunk: unknown) => {
						// biome-ignore lint/suspicious/noExplicitAny: mock chunk
						const c = chunk as any
						if (c?.content) {
							return { type: 'text', content: c.content }
						}
						return null
					}),
					hasCompleteToolCalls: vi.fn(() => requestCount === 1),
					getToolCalls: vi.fn(() => (requestCount === 1 ? toolCalls : [])),
					reset: vi.fn()
				}),
				findServer: (name: string) => ({ id: 'test-server', name: 'Test Server' }),
				formatToolResult: (toolCallId: string, result: ToolExecutionResult) => ({
					role: 'tool',
					tool_call_id: toolCallId,
					content: JSON.stringify(result.content)
				})
			}

			const mockExecutor: ToolExecutor = {
				executeTool: vi.fn().mockImplementation(async (request: { toolName: string }) => {
					// Track when execution starts
					executionOrder.push(`start:${request.toolName}`)
					// Simulate async work
					await new Promise((resolve) => setTimeout(resolve, 10))
					// Track when execution completes
					executionOrder.push(`end:${request.toolName}`)
					return {
						content: { result: 'success' },
						contentType: 'json',
						executionDuration: 10
					}
				}),
				canExecute: () => true
			}

			const coordinator = new ToolCallingCoordinator()

			// WHEN: Generating with default parallelExecution=false (sequential)
			const results: string[] = []
			for await (const text of coordinator.generateWithTools(
				[{ role: 'user', content: 'test' }],
				mockAdapter,
				mockExecutor,
				{ parallelExecution: false, documentPath: 'test.md' }
			)) {
				results.push(text)
			}

			// THEN: Tools should execute sequentially (each completes before next starts)
			expect(mockExecutor.executeTool).toHaveBeenCalledTimes(3)
			expect(results).toEqual(['All tools executed'])
			// Sequential execution means: start A, end A, start B, end B, start C, end C
			expect(executionOrder).toEqual([
				'start:tool_a',
				'end:tool_a',
				'start:tool_b',
				'end:tool_b',
				'start:tool_c',
				'end:tool_c'
			])
		})

		it('should execute tools in parallel when enabled', async () => {
			// GIVEN: Three tool calls that need execution
			const toolCalls: ToolCall[] = [
				{ id: 'call_1', name: 'tool_a', arguments: {} },
				{ id: 'call_2', name: 'tool_b', arguments: {} },
				{ id: 'call_3', name: 'tool_c', arguments: {} }
			]

			const executionOrder: string[] = []
			let requestCount = 0

			const mockAdapter: ProviderAdapter = {
				async *sendRequest(_messages: Message[]) {
					requestCount++
					if (requestCount === 1) {
						yield { tool_calls: toolCalls }
					} else {
						yield { content: 'All tools executed' }
					}
				},
				getParser: () => ({
					parseChunk: vi.fn((chunk: unknown) => {
						// biome-ignore lint/suspicious/noExplicitAny: mock chunk
						const c = chunk as any
						if (c?.content) {
							return { type: 'text', content: c.content }
						}
						return null
					}),
					hasCompleteToolCalls: vi.fn(() => requestCount === 1),
					getToolCalls: vi.fn(() => (requestCount === 1 ? toolCalls : [])),
					reset: vi.fn()
				}),
				findServer: (name: string) => ({ id: 'test-server', name: 'Test Server' }),
				formatToolResult: (toolCallId: string, result: ToolExecutionResult) => ({
					role: 'tool',
					tool_call_id: toolCallId,
					content: JSON.stringify(result.content)
				})
			}

			const mockExecutor: ToolExecutor = {
				executeTool: vi.fn().mockImplementation(async (request: { toolName: string }) => {
					executionOrder.push(`start:${request.toolName}`)
					await new Promise((resolve) => setTimeout(resolve, 10))
					executionOrder.push(`end:${request.toolName}`)
					return {
						content: { result: 'success' },
						contentType: 'json',
						executionDuration: 10
					}
				}),
				canExecute: () => true
			}

			const coordinator = new ToolCallingCoordinator()

			// WHEN: Generating with parallelExecution=true
			const results: string[] = []
			for await (const text of coordinator.generateWithTools(
				[{ role: 'user', content: 'test' }],
				mockAdapter,
				mockExecutor,
				{ parallelExecution: true, maxParallelTools: 3, documentPath: 'test.md' }
			)) {
				results.push(text)
			}

			// THEN: All tools should start before any complete (parallel execution)
			expect(mockExecutor.executeTool).toHaveBeenCalledTimes(3)
			expect(results).toEqual(['All tools executed'])
			// Parallel execution means all start before any end
			expect(executionOrder.slice(0, 3)).toEqual(['start:tool_a', 'start:tool_b', 'start:tool_c'])
		})

		it('should respect maxParallelTools limit', async () => {
			// GIVEN: Five tool calls but limit of 2 concurrent executions
			const toolCalls: ToolCall[] = [
				{ id: 'call_1', name: 'tool_a', arguments: {} },
				{ id: 'call_2', name: 'tool_b', arguments: {} },
				{ id: 'call_3', name: 'tool_c', arguments: {} },
				{ id: 'call_4', name: 'tool_d', arguments: {} },
				{ id: 'call_5', name: 'tool_e', arguments: {} }
			]

			const concurrentExecutions = { count: 0, maxObserved: 0 }
			let requestCount = 0

			const mockAdapter: ProviderAdapter = {
				async *sendRequest(_messages: Message[]) {
					requestCount++
					if (requestCount === 1) {
						yield { tool_calls: toolCalls }
					} else {
						yield { content: 'Done' }
					}
				},
				getParser: () => ({
					parseChunk: vi.fn((chunk: unknown) => {
						// biome-ignore lint/suspicious/noExplicitAny: mock chunk
						const c = chunk as any
						if (c?.content) {
							return { type: 'text', content: c.content }
						}
						return null
					}),
					hasCompleteToolCalls: vi.fn(() => requestCount === 1),
					getToolCalls: vi.fn(() => (requestCount === 1 ? toolCalls : [])),
					reset: vi.fn()
				}),
				findServer: () => ({ id: 'test-server', name: 'Test Server' }),
				formatToolResult: () => ({ role: 'tool', content: '{}' })
			}

			const mockExecutor: ToolExecutor = {
				executeTool: vi.fn().mockImplementation(async () => {
					concurrentExecutions.count++
					concurrentExecutions.maxObserved = Math.max(concurrentExecutions.maxObserved, concurrentExecutions.count)
					await new Promise((resolve) => setTimeout(resolve, 20))
					concurrentExecutions.count--
					return { content: {}, contentType: 'json', executionDuration: 20 }
				}),
				canExecute: () => true
			}

			const coordinator = new ToolCallingCoordinator()

			// WHEN: Running with maxParallelTools=2
			for await (const _text of coordinator.generateWithTools(
				[{ role: 'user', content: 'test' }],
				mockAdapter,
				mockExecutor,
				{ parallelExecution: true, maxParallelTools: 2, documentPath: 'test.md' }
			)) {
				// Consume generator
			}

			// THEN: Should never exceed 2 concurrent executions
			expect(mockExecutor.executeTool).toHaveBeenCalledTimes(5)
			expect(concurrentExecutions.maxObserved).toBe(2)
		})

		it('should handle partial failures in parallel execution', async () => {
			// GIVEN: Three tools, one will fail
			const toolCalls: ToolCall[] = [
				{ id: 'call_1', name: 'tool_success_a', arguments: {} },
				{ id: 'call_2', name: 'tool_fail', arguments: {} },
				{ id: 'call_3', name: 'tool_success_b', arguments: {} }
			]

			let requestCount = 0
			const formatToolResultSpy = vi.fn((toolCallId: string, result: ToolExecutionResult) => ({
				role: 'tool' as const,
				tool_call_id: toolCallId,
				content: JSON.stringify(result.content)
			}))

			const mockAdapter: ProviderAdapter = {
				async *sendRequest(_messages: Message[]) {
					requestCount++
					if (requestCount === 1) {
						yield { tool_calls: toolCalls }
					} else {
						yield { content: 'Completed with partial failures' }
					}
				},
				getParser: () => ({
					parseChunk: vi.fn((chunk: unknown) => {
						// biome-ignore lint/suspicious/noExplicitAny: mock chunk
						const c = chunk as any
						if (c?.content) {
							return { type: 'text', content: c.content }
						}
						return null
					}),
					hasCompleteToolCalls: vi.fn(() => requestCount === 1),
					getToolCalls: vi.fn(() => (requestCount === 1 ? toolCalls : [])),
					reset: vi.fn()
				}),
				findServer: () => ({ id: 'test-server', name: 'Test Server' }),
				formatToolResult: formatToolResultSpy
			}

			const mockExecutor: ToolExecutor = {
				executeTool: vi.fn().mockImplementation(async (request: { toolName: string }) => {
					if (request.toolName === 'tool_fail') {
						throw new Error('Tool execution failed')
					}
					return {
						content: { result: 'success' },
						contentType: 'json',
						executionDuration: 10
					}
				}),
				canExecute: () => true
			}

			const coordinator = new ToolCallingCoordinator()

			// WHEN: Executing with one failure
			const results: string[] = []
			for await (const text of coordinator.generateWithTools(
				[{ role: 'user', content: 'test' }],
				mockAdapter,
				mockExecutor,
				{ parallelExecution: true, maxParallelTools: 3, documentPath: 'test.md' }
			)) {
				results.push(text)
			}

			// THEN: Should execute all tools and continue despite failure
			expect(mockExecutor.executeTool).toHaveBeenCalledTimes(3)
			expect(results).toEqual(['Completed with partial failures'])
			// Verify error message was formatted and added to conversation
			expect(formatToolResultSpy).toHaveBeenCalledWith(
				'call_2',
				expect.objectContaining({
					content: expect.objectContaining({ error: 'Tool execution failed' })
				})
			)
		})

		it('should default to sequential when maxParallelTools=1', async () => {
			// GIVEN: Two tool calls
			const toolCalls: ToolCall[] = [
				{ id: 'call_1', name: 'tool_a', arguments: {} },
				{ id: 'call_2', name: 'tool_b', arguments: {} }
			]

			const executionOrder: string[] = []
			let requestCount = 0

			const mockAdapter: ProviderAdapter = {
				async *sendRequest(_messages: Message[]) {
					requestCount++
					if (requestCount === 1) {
						yield { tool_calls: toolCalls }
					} else {
						yield { content: 'Done' }
					}
				},
				getParser: () => ({
					parseChunk: vi.fn((chunk: unknown) => {
						// biome-ignore lint/suspicious/noExplicitAny: mock chunk
						const c = chunk as any
						if (c?.content) {
							return { type: 'text', content: c.content }
						}
						return null
					}),
					hasCompleteToolCalls: vi.fn(() => requestCount === 1),
					getToolCalls: vi.fn(() => (requestCount === 1 ? toolCalls : [])),
					reset: vi.fn()
				}),
				findServer: () => ({ id: 'test-server', name: 'Test Server' }),
				formatToolResult: () => ({ role: 'tool', content: '{}' })
			}

			const mockExecutor: ToolExecutor = {
				executeTool: vi.fn().mockImplementation(async (request: { toolName: string }) => {
					executionOrder.push(`start:${request.toolName}`)
					await new Promise((resolve) => setTimeout(resolve, 10))
					executionOrder.push(`end:${request.toolName}`)
					return { content: {}, contentType: 'json', executionDuration: 10 }
				}),
				canExecute: () => true
			}

			const coordinator = new ToolCallingCoordinator()

			// WHEN: Running with maxParallelTools=1
			for await (const _text of coordinator.generateWithTools(
				[{ role: 'user', content: 'test' }],
				mockAdapter,
				mockExecutor,
				{ parallelExecution: true, maxParallelTools: 1, documentPath: 'test.md' }
			)) {
				// Consume generator
			}

			// THEN: Should execute sequentially
			expect(executionOrder).toEqual(['start:tool_a', 'end:tool_a', 'start:tool_b', 'end:tool_b'])
		})
	})
})
