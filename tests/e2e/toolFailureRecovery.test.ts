import { describe, expect, it, vi } from 'vitest'
import type { ToolExecutor } from '../../src/mcp/executor'
import type { ProviderAdapter } from '../../src/mcp/toolCallingCoordinator'
import { ToolCallingCoordinator } from '../../src/mcp/toolCallingCoordinator'

describe('Tool Failure Recovery E2E', () => {
	describe('Tool Error Recovery Scenarios', () => {
		it.skip('should allow LLM to continue when tool returns error', async () => {
			// Given: A tool that fails with an error
			const mockExecutor: ToolExecutor = {
				executeTool: vi.fn().mockRejectedValue(new Error('Tool execution failed: Network timeout'))
			} as any

			// Mock adapter that simulates LLM requesting tool, then responding to error
			let callCount = 0
			const mockAdapter: ProviderAdapter = {
				sendRequest: vi.fn(async function* (_messages) {
					callCount++
					if (callCount === 1) {
						// First turn: LLM requests tool
						yield { choices: [{ delta: { content: '' }, finish_reason: null }] }
					} else {
						// Second turn: LLM acknowledges error and provides alternative
						yield { choices: [{ delta: { content: 'I encountered an error accessing that tool. ' } }] }
						yield { choices: [{ delta: { content: 'Let me provide an alternative solution instead.' } }] }
					}
				}),
				getParser: vi.fn(() => {
					if (callCount === 1) {
						// First turn: Return tool call
						return {
							reset: vi.fn(),
							parseChunk: vi.fn(() => null),
							hasCompleteToolCalls: vi.fn(() => true),
							getToolCalls: vi.fn(() => [
								{
									id: 'call_123',
									name: 'failing_tool',
									arguments: { param: 'value' }
								}
							])
						}
					} else {
						// Second turn: Return text response (no tools)
						return {
							reset: vi.fn(),
							parseChunk: vi.fn((chunk: any) =>
								chunk.choices?.[0]?.delta?.content ? { type: 'text', content: chunk.choices[0].delta.content } : null
							),
							hasCompleteToolCalls: vi.fn(() => false),
							getToolCalls: vi.fn(() => [])
						}
					}
				}),
				findServer: vi.fn(() => ({ id: 'test-server', name: 'test-server' })),
				formatToolResult: vi.fn((id, result) => ({
					role: 'tool',
					content: JSON.stringify(result.content),
					tool_call_id: id
				}))
			} as any

			const coordinator = new ToolCallingCoordinator()

			// When: Generating with a failing tool
			const results: string[] = []
			for await (const text of coordinator.generateWithTools(
				[{ role: 'user', content: 'Please use the failing tool' }],
				mockAdapter,
				mockExecutor,
				{ maxTurns: 5 }
			)) {
				results.push(text)
			}

			// Then: LLM should receive error and generate final response
			expect(mockExecutor.executeTool).toHaveBeenCalled()
			expect(mockAdapter.formatToolResult).toHaveBeenCalledWith(
				'call_123',
				expect.objectContaining({
					content: expect.objectContaining({ error: expect.stringContaining('Network timeout') })
				})
			)

			// Verify LLM saw the error and responded
			const finalText = results.join('')
			expect(finalText).toContain('error')
			expect(finalText).toContain('alternative')
			expect(results.length).toBeGreaterThan(0)
		})

		it('should handle tool timeout gracefully', async () => {
			// Given: A tool that times out
			const mockExecutor: ToolExecutor = {
				executeTool: vi.fn().mockRejectedValue(new Error('Tool execution timeout: exceeded 30s limit'))
			} as any

			let turnNumber = 0
			const mockAdapter: ProviderAdapter = {
				sendRequest: vi.fn(async function* (_messages) {
					turnNumber++
					if (turnNumber === 1) {
						yield { choices: [{ delta: { content: '' } }] }
					} else {
						yield { choices: [{ delta: { content: 'I apologize, the tool timed out. ' } }] }
						yield { choices: [{ delta: { content: 'Let me continue without it.' } }] }
					}
				}),
				getParser: vi.fn(() => ({
					reset: vi.fn(),
					parseChunk: vi.fn((chunk: any) =>
						chunk.choices?.[0]?.delta?.content ? { type: 'text', content: chunk.choices[0].delta.content } : null
					),
					hasCompleteToolCalls: vi.fn(() => turnNumber === 1),
					getToolCalls: vi.fn(() =>
						turnNumber === 1
							? [
									{
										id: 'call_timeout',
										name: 'slow_tool',
										arguments: {}
									}
								]
							: []
					)
				})),
				findServer: vi.fn(() => ({ id: 'test-server', name: 'test-server' })),
				formatToolResult: vi.fn((id, result) => ({
					role: 'tool',
					content: JSON.stringify(result.content),
					tool_call_id: id
				}))
			} as any

			const coordinator = new ToolCallingCoordinator()

			// When: Tool times out
			const results: string[] = []
			for await (const text of coordinator.generateWithTools(
				[{ role: 'user', content: 'Use slow tool' }],
				mockAdapter,
				mockExecutor,
				{ maxTurns: 3 }
			)) {
				results.push(text)
			}

			// Then: LLM receives timeout error and continues
			expect(mockAdapter.formatToolResult).toHaveBeenCalledWith(
				'call_timeout',
				expect.objectContaining({
					content: expect.objectContaining({ error: expect.stringContaining('timeout') })
				})
			)

			const finalText = results.join('')
			expect(finalText).toContain('apologize')
			expect(finalText.length).toBeGreaterThan(0)
		})

		it('should handle server disconnection during execution', async () => {
			// Given: Server that disconnects mid-execution
			const mockExecutor: ToolExecutor = {
				executeTool: vi.fn().mockRejectedValue(new Error('Server disconnected: session closed unexpectedly'))
			} as any

			let requestCount = 0
			const mockAdapter: ProviderAdapter = {
				sendRequest: vi.fn(async function* (_messages) {
					requestCount++
					if (requestCount === 1) {
						yield { choices: [{ delta: { content: '' } }] }
					} else {
						yield { choices: [{ delta: { content: "The server disconnected. I'll work without that tool." } }] }
					}
				}),
				getParser: vi.fn(() => ({
					reset: vi.fn(),
					parseChunk: vi.fn((chunk: any) =>
						chunk.choices?.[0]?.delta?.content ? { type: 'text', content: chunk.choices[0].delta.content } : null
					),
					hasCompleteToolCalls: vi.fn(() => requestCount === 1),
					getToolCalls: vi.fn(() =>
						requestCount === 1
							? [
									{
										id: 'call_disconnect',
										name: 'remote_tool',
										arguments: {}
									}
								]
							: []
					)
				})),
				findServer: vi.fn(() => ({ id: 'remote-server', name: 'remote-server' })),
				formatToolResult: vi.fn((id, result) => ({
					role: 'tool',
					content: JSON.stringify(result.content),
					tool_call_id: id
				}))
			} as any

			const coordinator = new ToolCallingCoordinator()

			// When: Server disconnects
			const results: string[] = []
			for await (const text of coordinator.generateWithTools(
				[{ role: 'user', content: 'Call remote tool' }],
				mockAdapter,
				mockExecutor,
				{ maxTurns: 3 }
			)) {
				results.push(text)
			}

			// Then: LLM handles disconnection gracefully
			expect(mockAdapter.formatToolResult).toHaveBeenCalledWith(
				'call_disconnect',
				expect.objectContaining({
					content: expect.objectContaining({ error: expect.stringContaining('disconnected') })
				})
			)

			const finalText = results.join('')
			expect(finalText).toContain('disconnected')
			expect(finalText.length).toBeGreaterThan(0)
		})

		it('should handle invalid tool parameters gracefully', async () => {
			// Given: Tool with validation error
			const mockExecutor: ToolExecutor = {
				executeTool: vi.fn().mockRejectedValue(new Error('Invalid parameters: "path" is required'))
			} as any

			let iteration = 0
			const mockAdapter: ProviderAdapter = {
				sendRequest: vi.fn(async function* (_messages) {
					iteration++
					if (iteration === 1) {
						// First attempt: Bad parameters
						yield { choices: [{ delta: { content: '' } }] }
					} else if (iteration === 2) {
						// Second attempt: Corrected parameters
						yield { choices: [{ delta: { content: '' } }] }
					} else {
						// Final response after successful tool use
						yield { choices: [{ delta: { content: 'Here are the results from the corrected parameters.' } }] }
					}
				}),
				getParser: vi.fn(() => ({
					reset: vi.fn(),
					parseChunk: vi.fn((chunk: any) =>
						chunk.choices?.[0]?.delta?.content ? { type: 'text', content: chunk.choices[0].delta.content } : null
					),
					hasCompleteToolCalls: vi.fn(() => iteration <= 2),
					getToolCalls: vi.fn(() => {
						if (iteration === 1) {
							return [
								{
									id: 'call_invalid',
									name: 'file_tool',
									arguments: { query: 'test' } // Missing required "path"
								}
							]
						} else if (iteration === 2) {
							return [
								{
									id: 'call_corrected',
									name: 'file_tool',
									arguments: { path: '/test/file.txt', query: 'test' } // Now includes path
								}
							]
						}
						return []
					})
				})),
				findServer: vi.fn(() => ({ id: 'fs-server', name: 'fs-server' })),
				formatToolResult: vi.fn((id, result) => ({
					role: 'tool',
					content: JSON.stringify(result.content),
					tool_call_id: id
				}))
			} as any

			// Mock executor that fails first time, succeeds second time
			mockExecutor.executeTool = vi
				.fn()
				.mockRejectedValueOnce(new Error('Invalid parameters: "path" is required'))
				.mockResolvedValueOnce({
					content: { file: 'content here' },
					contentType: 'json',
					executionDuration: 100
				})

			const coordinator = new ToolCallingCoordinator()

			// When: Tool validation fails then succeeds
			const results: string[] = []
			for await (const text of coordinator.generateWithTools(
				[{ role: 'user', content: 'Read the file' }],
				mockAdapter,
				mockExecutor,
				{ maxTurns: 5 }
			)) {
				results.push(text)
			}

			// Then: LLM sees validation error, corrects parameters, and continues
			expect(mockExecutor.executeTool).toHaveBeenCalledTimes(2)

			// First call should have triggered error response
			const firstCall = (mockAdapter.formatToolResult as any).mock.calls.find((call: any) => call[0] === 'call_invalid')
			expect(firstCall).toBeDefined()
			expect(firstCall[1].content).toMatchObject({ error: expect.stringContaining('Invalid parameters') })

			// Second call should have succeeded
			const secondCall = (mockAdapter.formatToolResult as any).mock.calls.find(
				(call: any) => call[0] === 'call_corrected'
			)
			expect(secondCall).toBeDefined()

			const finalText = results.join('')
			expect(finalText.length).toBeGreaterThan(0)
		})

		it('should not block generation when tool is unavailable', async () => {
			// Given: Tool server not found
			const mockExecutor: ToolExecutor = {
				executeTool: vi.fn()
			} as any

			const mockAdapter: ProviderAdapter = {
				sendRequest: vi.fn(async function* (_messages) {
					yield { choices: [{ delta: { content: 'I notice the tool server is unavailable. ' } }] }
					yield { choices: [{ delta: { content: "I'll provide my best answer without it." } }] }
				}),
				getParser: vi.fn(() => ({
					reset: vi.fn(),
					parseChunk: vi.fn((chunk: any) =>
						chunk.choices?.[0]?.delta?.content ? { type: 'text', content: chunk.choices[0].delta.content } : null
					),
					hasCompleteToolCalls: vi.fn(() => true),
					getToolCalls: vi.fn(() => [
						{
							id: 'call_unavailable',
							name: 'missing_tool',
							arguments: {}
						}
					])
				})),
				findServer: vi.fn(() => null), // Server not found
				formatToolResult: vi.fn()
			} as any

			const coordinator = new ToolCallingCoordinator()

			// When: Tool server not found (findServer returns null)
			const results: string[] = []
			for await (const text of coordinator.generateWithTools(
				[{ role: 'user', content: 'Use missing tool' }],
				mockAdapter,
				mockExecutor,
				{ maxTurns: 2 }
			)) {
				results.push(text)
			}

			// Then: Tool execution should be skipped, LLM continues
			expect(mockExecutor.executeTool).not.toHaveBeenCalled()
			expect(results.length).toBeGreaterThan(0)

			const finalText = results.join('')
			expect(finalText).toContain('unavailable')
			expect(finalText).toContain('without it')
		})

		it('should pass error details to LLM in correct format', async () => {
			// Given: Tool that fails with detailed error
			const detailedError = new Error('Database connection failed')
			detailedError.name = 'DatabaseError'

			const mockExecutor: ToolExecutor = {
				executeTool: vi.fn().mockRejectedValue(detailedError)
			} as any

			const mockAdapter: ProviderAdapter = {
				sendRequest: vi.fn(async function* (_messages) {
					yield { choices: [{ delta: { content: '' } }] }
				}),
				getParser: vi.fn(() => ({
					reset: vi.fn(),
					parseChunk: vi.fn(),
					hasCompleteToolCalls: vi.fn(() => true),
					getToolCalls: vi.fn(() => [
						{
							id: 'call_db',
							name: 'query_database',
							arguments: { query: 'SELECT *' }
						}
					])
				})),
				findServer: vi.fn(() => ({ id: 'db-server', name: 'db-server' })),
				formatToolResult: vi.fn((id, result) => ({
					role: 'tool',
					content: JSON.stringify(result.content),
					tool_call_id: id
				}))
			} as any

			const coordinator = new ToolCallingCoordinator()

			// When: Tool fails
			try {
				for await (const _text of coordinator.generateWithTools(
					[{ role: 'user', content: 'Query database' }],
					mockAdapter,
					mockExecutor,
					{ maxTurns: 1 }
				)) {
					// Consume generator
				}
			} catch (_error) {
				// May throw depending on implementation
			}

			// Then: Error should be formatted and passed to LLM
			expect(mockAdapter.formatToolResult).toHaveBeenCalledWith(
				'call_db',
				expect.objectContaining({
					content: { error: 'Database connection failed' },
					contentType: 'json',
					executionDuration: 0
				})
			)
		})
	})

	describe('Error Recovery Behavior Validation', () => {
		it('should continue multi-turn conversation after tool failure', async () => {
			// Given: A scenario with multiple tool calls, one fails
			const mockExecutor: ToolExecutor = {
				executeTool: vi
					.fn()
					.mockResolvedValueOnce({
						content: { status: 'success', data: 'first tool result' },
						contentType: 'json',
						executionDuration: 50
					})
					.mockRejectedValueOnce(new Error('Second tool failed'))
					.mockResolvedValueOnce({
						content: { status: 'success', data: 'third tool result' },
						contentType: 'json',
						executionDuration: 60
					})
			} as any

			let turnCount = 0
			const mockAdapter: ProviderAdapter = {
				sendRequest: vi.fn(async function* (_messages) {
					turnCount++
					if (turnCount <= 3) {
						yield { choices: [{ delta: { content: '' } }] }
					} else {
						yield { choices: [{ delta: { content: 'I successfully used 2 tools despite one failure.' } }] }
					}
				}),
				getParser: vi.fn(() => ({
					reset: vi.fn(),
					parseChunk: vi.fn((chunk: any) =>
						chunk.choices?.[0]?.delta?.content ? { type: 'text', content: chunk.choices[0].delta.content } : null
					),
					hasCompleteToolCalls: vi.fn(() => turnCount <= 3),
					getToolCalls: vi.fn(() => {
						if (turnCount === 1) {
							return [{ id: 'call_1', name: 'tool_1', arguments: {} }]
						} else if (turnCount === 2) {
							return [{ id: 'call_2', name: 'tool_2', arguments: {} }]
						} else if (turnCount === 3) {
							return [{ id: 'call_3', name: 'tool_3', arguments: {} }]
						}
						return []
					})
				})),
				findServer: vi.fn(() => ({ id: 'test-server', name: 'test-server' })),
				formatToolResult: vi.fn((id, result) => ({
					role: 'tool',
					content: JSON.stringify(result.content),
					tool_call_id: id
				}))
			} as any

			const coordinator = new ToolCallingCoordinator()

			// When: Multiple tools with one failure
			const results: string[] = []
			for await (const text of coordinator.generateWithTools(
				[{ role: 'user', content: 'Use all three tools' }],
				mockAdapter,
				mockExecutor,
				{ maxTurns: 5 }
			)) {
				results.push(text)
			}

			// Then: All 3 tools attempted, conversation continues despite middle failure
			expect(mockExecutor.executeTool).toHaveBeenCalledTimes(3)
			expect(mockAdapter.formatToolResult).toHaveBeenCalledTimes(3)

			// Verify error was formatted for middle tool
			const errorCall = (mockAdapter.formatToolResult as any).mock.calls.find((call: any) => call[1].content?.error)
			expect(errorCall).toBeDefined()
			expect(errorCall[1].content.error).toContain('Second tool failed')

			const finalText = results.join('')
			expect(finalText).toContain('successfully')
			expect(finalText).toContain('2 tools')
		})

		it('should never leave user stuck in error state', async () => {
			// Given: Every tool call fails
			const mockExecutor: ToolExecutor = {
				executeTool: vi.fn().mockRejectedValue(new Error('All tools unavailable'))
			} as any

			let attemptNumber = 0
			const mockAdapter: ProviderAdapter = {
				sendRequest: vi.fn(async function* (_messages) {
					attemptNumber++
					if (attemptNumber <= 2) {
						// First 2 turns: Try tools
						yield { choices: [{ delta: { content: '' } }] }
					} else {
						// Final turn: Give up on tools, provide text response
						yield { choices: [{ delta: { content: 'I cannot access the tools right now. ' } }] }
						yield { choices: [{ delta: { content: 'Here is what I can tell you without them: ...' } }] }
					}
				}),
				getParser: vi.fn(() => ({
					reset: vi.fn(),
					parseChunk: vi.fn((chunk: any) =>
						chunk.choices?.[0]?.delta?.content ? { type: 'text', content: chunk.choices[0].delta.content } : null
					),
					hasCompleteToolCalls: vi.fn(() => attemptNumber <= 2),
					getToolCalls: vi.fn(() =>
						attemptNumber <= 2
							? [
									{
										id: `call_${attemptNumber}`,
										name: 'unavailable_tool',
										arguments: {}
									}
								]
							: []
					)
				})),
				findServer: vi.fn(() => ({ id: 'failing-server', name: 'failing-server' })),
				formatToolResult: vi.fn((id, result) => ({
					role: 'tool',
					content: JSON.stringify(result.content),
					tool_call_id: id
				}))
			} as any

			const coordinator = new ToolCallingCoordinator()

			// When: All tools fail
			const results: string[] = []
			for await (const text of coordinator.generateWithTools(
				[{ role: 'user', content: 'Help me with this task' }],
				mockAdapter,
				mockExecutor,
				{ maxTurns: 5 }
			)) {
				results.push(text)
			}

			// Then: User still gets a response (not stuck)
			const finalText = results.join('')
			expect(finalText.length).toBeGreaterThan(0)
			expect(finalText).toContain('cannot access')
			expect(finalText).toContain('without them')

			// Verify errors were formatted for LLM
			expect(mockAdapter.formatToolResult).toHaveBeenCalledTimes(2)
		})
	})

	describe('Error Message Format Validation', () => {
		it('should include error message in tool result', async () => {
			// Given: Failing tool
			const mockExecutor: ToolExecutor = {
				executeTool: vi.fn().mockRejectedValue(new Error('Specific error message'))
			} as any

			const mockAdapter: ProviderAdapter = {
				sendRequest: vi.fn(async function* () {
					yield { choices: [{ delta: { content: '' } }] }
				}),
				getParser: vi.fn(() => ({
					reset: vi.fn(),
					parseChunk: vi.fn(),
					hasCompleteToolCalls: vi.fn(() => true),
					getToolCalls: vi.fn(() => [
						{
							id: 'call_format',
							name: 'test_tool',
							arguments: {}
						}
					])
				})),
				findServer: vi.fn(() => ({ id: 'test-server', name: 'test-server' })),
				formatToolResult: vi.fn((id, result) => ({
					role: 'tool',
					content: JSON.stringify(result.content),
					tool_call_id: id
				}))
			} as any

			const coordinator = new ToolCallingCoordinator()

			// When: Tool fails
			try {
				for await (const _text of coordinator.generateWithTools(
					[{ role: 'user', content: 'test' }],
					mockAdapter,
					mockExecutor,
					{ maxTurns: 1 }
				)) {
					// Consume
				}
			} catch (_error) {
				// Expected
			}

			// Then: Error message should be in formatted result
			expect(mockAdapter.formatToolResult).toHaveBeenCalledWith(
				'call_format',
				expect.objectContaining({
					content: { error: 'Specific error message' },
					contentType: 'json',
					executionDuration: 0
				})
			)
		})
	})
})
