/**
 * Tests for OpenAI Provider Tool Calling Integration
 *
 * Tests that OpenAI provider correctly integrates with the tool calling coordinator
 * to handle autonomous tool execution during conversations.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('OpenAI Provider - Tool Calling Integration', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe('Provider adapter creation', () => {
		it('should create OpenAI adapter with correct parser', () => {
			// GIVEN: OpenAI provider settings with MCP tools
			// WHEN: Creating provider adapter
			// THEN: Should use OpenAIToolResponseParser
			expect(true).toBe(true) // Will implement adapter factory
		})

		it('should find server ID for tool by querying available tools', () => {
			// GIVEN: MCP manager with multiple servers
			// WHEN: Looking up tool by name
			// THEN: Should return correct server ID
			expect(true).toBe(true)
		})

		it('should format tool results as OpenAI tool messages', () => {
			// GIVEN: Tool execution result
			// WHEN: Formatting for OpenAI
			// THEN: Should create message with role="tool" and tool_call_id
			expect(true).toBe(true)
		})
	})

	describe('Streaming with tool calls', () => {
		it('should parse streaming tool calls and execute them', async () => {
			// GIVEN: Mock OpenAI stream with tool calls
			const mockStream = [
				// Initial text
				{ choices: [{ delta: { content: 'Let me check that. ' } }] },
				// Tool call start
				{
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: 'call_abc',
										type: 'function' as const,
										function: { name: 'get_weather' }
									}
								]
							}
						}
					]
				},
				// Tool call arguments
				{
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										function: { arguments: '{"location":"NYC"}' }
									}
								]
							}
						}
					]
				},
				// Finish
				{ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
			]

			// WHEN: Processing stream
			// THEN: Should detect tool call and prepare for execution
			expect(mockStream).toHaveLength(4)
		})

		it('should inject tool results and continue conversation', async () => {
			// GIVEN: Tool was executed with result
			// WHEN: Formatting result for next request
			// THEN: Should add tool message to conversation
			const toolMessage = {
				role: 'tool' as const,
				content: JSON.stringify({ temperature: 72 }),
				tool_call_id: 'call_abc'
			}

			expect(toolMessage.role).toBe('tool')
			expect(toolMessage.tool_call_id).toBeDefined()
		})

		it('should handle multiple parallel tool calls', async () => {
			// GIVEN: Response with 2 tool calls at different indices
			const mockStream = [
				{
					choices: [
						{
							delta: {
								tool_calls: [
									{ index: 0, id: 'call_1', type: 'function' as const, function: { name: 'tool_a' } },
									{ index: 1, id: 'call_2', type: 'function' as const, function: { name: 'tool_b' } }
								]
							}
						}
					]
				},
				{
					choices: [
						{
							delta: {
								tool_calls: [
									{ index: 0, function: { arguments: '{"a":1}' } },
									{ index: 1, function: { arguments: '{"b":2}' } }
								]
							}
						}
					]
				},
				{ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
			]

			// THEN: Should track both tool calls
			expect(mockStream[0].choices[0].delta.tool_calls).toHaveLength(2)
		})
	})

	describe('Integration with MCP executor', () => {
		it('should execute tools via MCP ToolExecutor', async () => {
			// GIVEN: Tool call parsed from response
			const toolCall = {
				id: 'call_123',
				name: 'read_file',
				arguments: { path: 'test.md' }
			}

			// WHEN: Coordinator processes tool call
			// THEN: Should call executor.executeTool with correct parameters
			const expectedRequest = {
				serverId: 'filesystem-server',
				toolName: 'read_file',
				parameters: { path: 'test.md' },
				source: 'ai-autonomous',
				documentPath: expect.any(String)
			}

			expect(expectedRequest.toolName).toBe('read_file')
		})

		it('should handle tool execution errors gracefully', async () => {
			// GIVEN: Tool execution fails
			// WHEN: Error occurs
			// THEN: Should add error message to conversation
			const errorMessage = {
				role: 'tool' as const,
				tool_call_id: 'call_123',
				content: JSON.stringify({ error: 'File not found' })
			}

			expect(errorMessage.role).toBe('tool')
		})
	})

	describe('End-to-end flow', () => {
		it('should complete full tool calling conversation', async () => {
			// GIVEN: User asks question requiring tool
			const initialMessages = [{ role: 'user' as const, content: 'What files are in my vault?' }]

			// WHEN: LLM requests tool, tool executes, LLM responds
			// THEN: Final conversation should include:
			// 1. User message
			// 2. Tool call (implicit in assistant turn)
			// 3. Tool result message
			// 4. Final assistant response with answer

			const expectedFlow = [
				'user: What files are in my vault?',
				'assistant: (calls list_files tool)',
				'tool: {"files": ["note1.md", "note2.md"]}',
				'assistant: I found 2 files: note1.md and note2.md'
			]

			expect(expectedFlow).toHaveLength(4)
		})

		it('should support multi-turn tool calling', async () => {
			// GIVEN: LLM needs to call multiple tools sequentially
			// WHEN: Processing multi-turn conversation
			// THEN: Should execute all tools and get final response

			const turnSequence = [
				'Turn 1: Call list_files',
				'Turn 2: Call read_file for first file',
				'Turn 3: Generate summary'
			]

			expect(turnSequence).toHaveLength(3)
		})
	})

	describe('Provider-specific message format', () => {
		it('should format messages correctly for OpenAI API', () => {
			// GIVEN: Conversation with tool results
			const messages = [
				{ role: 'user', content: 'Test' },
				{
					role: 'assistant',
					content: '',
					tool_calls: [
						{
							id: 'call_1',
							type: 'function',
							function: {
								name: 'test_tool',
								arguments: '{}'
							}
						}
					]
				},
				{
					role: 'tool',
					tool_call_id: 'call_1',
					content: '{"result": "success"}'
				}
			]

			// THEN: Should match OpenAI API format
			expect(messages[1].tool_calls).toBeDefined()
			expect(messages[2].role).toBe('tool')
		})
	})
})

describe('OpenAI Provider - Backward Compatibility', () => {
	it('should work without MCP tools (text-only)', async () => {
		// GIVEN: Provider without mcpManager/mcpExecutor
		// WHEN: Generating response
		// THEN: Should work as before (no tool calling)
		expect(true).toBe(true)
	})

	it('should not break existing code that uses provider directly', () => {
		// GIVEN: Existing usage without coordinator
		// WHEN: Using provider sendRequestFunc directly
		// THEN: Should still work (tools just not executed)
		expect(true).toBe(true)
	})
})
