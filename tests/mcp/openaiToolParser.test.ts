/**
 * Detailed tests for OpenAI Tool Response Parser
 * Tests with realistic streaming data from OpenAI API
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OpenAIToolResponseParser } from '../../src/mcp/toolResponseParser'

describe('OpenAIToolResponseParser - Detailed Implementation Tests', () => {
	let parser: OpenAIToolResponseParser
	beforeEach(() => {
		parser = new OpenAIToolResponseParser()
	})

	afterEach(() => {})

	describe('Text-only responses', () => {
		it('should parse simple text chunks', () => {
			// GIVEN: Streaming text response
			const chunks = [
				{ choices: [{ delta: { content: 'Hello' } }] },
				{ choices: [{ delta: { content: ' world' } }] },
				{ choices: [{ delta: { content: '!' } }] }
			]

			// WHEN: Parsing chunks
			const results = chunks.map((chunk) => parser.parseChunk(chunk))

			// THEN: Should return text chunks
			expect(results[0]).toEqual({ type: 'text', content: 'Hello' })
			expect(results[1]).toEqual({ type: 'text', content: ' world' })
			expect(results[2]).toEqual({ type: 'text', content: '!' })
			expect(parser.hasCompleteToolCalls()).toBe(false)
			expect(parser.getToolCalls()).toHaveLength(0)
		})

		it('should handle empty delta', () => {
			// GIVEN: Empty delta chunk
			const chunk = { choices: [{ delta: {} }] }

			// WHEN: Parsing
			const result = parser.parseChunk(chunk)

			// THEN: Should return null
			expect(result).toBeNull()
		})
	})

	describe('Single tool call - streamed arguments', () => {
		it('should parse complete tool call with arguments streaming in chunks', () => {
			// GIVEN: Realistic OpenAI tool call streaming sequence
			const chunks = [
				// Initial chunk with tool call start
				{
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: 'call_abc123',
										type: 'function' as const,
										function: {
											name: 'get_current_weather'
										}
									}
								]
							}
						}
					]
				},
				// Arguments streaming in parts
				{
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										function: {
											arguments: '{"loc'
										}
									}
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
									{
										index: 0,
										function: {
											arguments: 'ation": "'
										}
									}
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
									{
										index: 0,
										function: {
											arguments: 'San Francisco'
										}
									}
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
									{
										index: 0,
										function: {
											arguments: ', CA", "unit'
										}
									}
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
									{
										index: 0,
										function: {
											arguments: '": "fahrenheit"}'
										}
									}
								]
							}
						}
					]
				},
				// Final chunk with finish_reason
				{
					choices: [
						{
							delta: {},
							finish_reason: 'tool_calls'
						}
					]
				}
			]

			// WHEN: Parsing all chunks
			for (const chunk of chunks) {
				parser.parseChunk(chunk)
			}

			// THEN: Should have complete tool call with parsed arguments
			expect(parser.hasCompleteToolCalls()).toBe(true)
			const toolCalls = parser.getToolCalls()
			expect(toolCalls).toHaveLength(1)
			expect(toolCalls[0]).toEqual({
				id: 'call_abc123',
				name: 'get_current_weather',
				arguments: {
					location: 'San Francisco, CA',
					unit: 'fahrenheit'
				}
			})
		})
	})

	describe('Multiple tool calls', () => {
		it('should handle two parallel tool calls', () => {
			// GIVEN: OpenAI response with 2 tool calls
			const chunks = [
				{
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: 'call_1',
										type: 'function' as const,
										function: { name: 'get_weather' }
									}
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
									{
										index: 1,
										id: 'call_2',
										type: 'function' as const,
										function: { name: 'get_time' }
									}
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
									{
										index: 0,
										function: { arguments: '{"location": "NYC"}' }
									}
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
									{
										index: 1,
										function: { arguments: '{"timezone": "EST"}' }
									}
								]
							}
						}
					]
				},
				{
					choices: [{ delta: {}, finish_reason: 'tool_calls' }]
				}
			]

			// WHEN: Parsing all chunks
			for (const chunk of chunks) {
				parser.parseChunk(chunk)
			}

			// THEN: Should have both tool calls
			expect(parser.hasCompleteToolCalls()).toBe(true)
			const toolCalls = parser.getToolCalls()
			expect(toolCalls).toHaveLength(2)
			expect(toolCalls[0]).toEqual({
				id: 'call_1',
				name: 'get_weather',
				arguments: { location: 'NYC' }
			})
			expect(toolCalls[1]).toEqual({
				id: 'call_2',
				name: 'get_time',
				arguments: { timezone: 'EST' }
			})
		})
	})

	describe('Error handling', () => {
		const getConsoleErrors = () => globalThis.__CONSOLE_ERROR_MESSAGES__

		it('should handle malformed JSON in arguments', () => {
			// GIVEN: Tool call with invalid JSON
			const chunks = [
				{
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: 'call_bad',
										type: 'function' as const,
										function: { name: 'bad_tool' }
									}
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
									{
										index: 0,
										function: { arguments: '{invalid json' }
									}
								]
							}
						}
					]
				},
				{
					choices: [{ delta: {}, finish_reason: 'tool_calls' }]
				}
			]

			// WHEN: Parsing chunks
			for (const chunk of chunks) {
				parser.parseChunk(chunk)
			}

			// THEN: Should still return tool call with raw arguments
			const toolCalls = parser.getToolCalls()
			expect(toolCalls).toHaveLength(1)
			expect(toolCalls[0].id).toBe('call_bad')
			expect(toolCalls[0].name).toBe('bad_tool')
			expect(toolCalls[0].arguments).toEqual({ _raw: '{invalid json' })
			expect(getConsoleErrors().some((msg) => msg.includes('Failed to parse tool call arguments'))).toBe(true)
		})
	})

	describe('State management', () => {
		it('should reset state correctly', () => {
			// GIVEN: Parser with accumulated data
			const chunks = [
				{
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: 'call_1',
										type: 'function' as const,
										function: { name: 'test', arguments: '{}' }
									}
								]
							}
						}
					]
				},
				{
					choices: [{ delta: {}, finish_reason: 'tool_calls' }]
				}
			]

			for (const chunk of chunks) {
				parser.parseChunk(chunk)
			}
			expect(parser.getToolCalls()).toHaveLength(1)

			// WHEN: Resetting
			parser.reset()

			// THEN: Should clear all state
			expect(parser.hasCompleteToolCalls()).toBe(false)
			expect(parser.getToolCalls()).toHaveLength(0)
		})
	})

	describe('Mixed text and tool calls', () => {
		it('should handle text before tool call', () => {
			// GIVEN: LLM outputs text, then calls tool
			const chunks = [
				{ choices: [{ delta: { content: 'Let me check the weather.' } }] },
				{
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: 'call_1',
										type: 'function' as const,
										function: { name: 'get_weather', arguments: '{"city":"NYC"}' }
									}
								]
							}
						}
					]
				},
				{ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
			]

			// WHEN: Parsing
			const results = chunks.map((c) => parser.parseChunk(c))

			// THEN: Should have both text and tool call
			expect(results[0]).toEqual({ type: 'text', content: 'Let me check the weather.' })
			expect(results[1]?.type).toBe('tool_call')
			expect(parser.getToolCalls()).toHaveLength(1)
		})
	})

	describe('Complex arguments', () => {
		it('should handle nested objects and arrays', () => {
			// GIVEN: Tool call with complex nested structure
			const chunks = [
				{
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: 'call_complex',
										type: 'function' as const,
										function: { name: 'create_entities' }
									}
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
									{
										index: 0,
										function: {
											arguments:
												'{"entities":[{"name":"project","type":"project","observations":["In progress","High priority"]}]}'
										}
									}
								]
							}
						}
					]
				},
				{
					choices: [{ delta: {}, finish_reason: 'tool_calls' }]
				}
			]

			// WHEN: Parsing
			for (const chunk of chunks) {
				parser.parseChunk(chunk)
			}

			// THEN: Should parse complex nested structure
			const toolCalls = parser.getToolCalls()
			expect(toolCalls[0].arguments).toEqual({
				entities: [
					{
						name: 'project',
						type: 'project',
						observations: ['In progress', 'High priority']
					}
				]
			})
		})
	})
})
