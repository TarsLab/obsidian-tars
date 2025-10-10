/**
 * Tests for Tool Result Formatter
 * Validates unified formatting of tool execution results
 */

import { describe, expect, it } from 'vitest'
import {
	formatResultContent,
	formatToolResultAsMarkdown,
	type FormatOptions
} from '../../src/mcp/toolResultFormatter'
import type { ToolExecutionResult } from '../../src/mcp/toolCallingCoordinator'

describe('Tool Result Formatter', () => {
	describe('formatResultContent', () => {
		it('should format JSON content as code block', () => {
			// Given: Tool result with JSON content
			const result: ToolExecutionResult = {
				content: { temperature: 72, condition: 'sunny' },
				contentType: 'json',
				executionDuration: 100
			}

			// When: Formatting content
			const formatted = formatResultContent(result)

			// Then: Should produce JSON code block
			expect(formatted).toContain('```json')
			expect(formatted).toContain('"temperature": 72')
			expect(formatted).toContain('"condition": "sunny"')
		})

		it('should format text content as code block', () => {
			// Given: Tool result with text content
			const result: ToolExecutionResult = {
				content: 'Plain text result',
				contentType: 'text',
				executionDuration: 50
			}

			// When: Formatting content
			const formatted = formatResultContent(result)

			// Then: Should produce text code block
			expect(formatted).toContain('```text')
			expect(formatted).toContain('Plain text result')
		})

		it('should format markdown content as plain text', () => {
			// Given: Tool result with markdown content
			const result: ToolExecutionResult = {
				content: '# Heading\n\n**Bold text**',
				contentType: 'markdown',
				executionDuration: 75
			}

			// When: Formatting content
			const formatted = formatResultContent(result)

			// Then: Should preserve markdown formatting
			expect(formatted).toBe('# Heading\n\n**Bold text**')
		})

		it('should handle special case: single text object in array', () => {
			// Given: Tool result with array containing single text object
			const result: ToolExecutionResult = {
				content: [{ type: 'text', text: 'Line 1\\nLine 2\\nLine 3' }],
				contentType: 'json',
				executionDuration: 100
			}

			// When: Formatting content
			const formatted = formatResultContent(result)

			// Then: Should extract text and convert escaped newlines
			expect(formatted).toBe('Line 1\nLine 2\nLine 3\n\n')
			expect(formatted).not.toContain('```json')
		})

		it('should format image content as markdown image', () => {
			// Given: Tool result with image URL
			const result: ToolExecutionResult = {
				content: 'https://example.com/image.png',
				contentType: 'image',
				executionDuration: 200
			}

			// When: Formatting content
			const formatted = formatResultContent(result)

			// Then: Should produce markdown image syntax
			expect(formatted).toBe('![Tool Result](https://example.com/image.png)')
		})

		it('should handle unknown content types as text', () => {
			// Given: Tool result with unknown content type
			const result = {
				content: 'Unknown type content',
				contentType: 'unknown' as any,
				executionDuration: 50
			}

			// When: Formatting content
			const formatted = formatResultContent(result)

			// Then: Should fall back to text code block
			expect(formatted).toContain('```text')
			expect(formatted).toContain('Unknown type content')
		})
	})

	describe('formatToolResultAsMarkdown', () => {
		it('should format basic tool result as callout', () => {
			// Given: Tool result
			const result: ToolExecutionResult = {
				content: { status: 'success' },
				contentType: 'json',
				executionDuration: 150
			}

			// When: Formatting as markdown
			const markdown = formatToolResultAsMarkdown(result)

			// Then: Should produce callout structure
			expect(markdown).toContain('> [!tool]+ Tool Result (150ms)')
			expect(markdown).toContain('> Duration: 150ms, Type: json')
			expect(markdown).toContain('> ```json')
		})

		it('should format collapsible tool result', () => {
			// Given: Tool result with collapsible option
			const result: ToolExecutionResult = {
				content: 'Large result content',
				contentType: 'text',
				executionDuration: 200
			}
			const options: FormatOptions = { collapsible: true }

			// When: Formatting as markdown
			const markdown = formatToolResultAsMarkdown(result, options)

			// Then: Should use collapsible callout symbol
			expect(markdown).toContain('> [!tool]- Tool Result (200ms)')
		})

		it('should hide metadata when showMetadata is false', () => {
			// Given: Tool result with showMetadata option
			const result: ToolExecutionResult = {
				content: 'Result',
				contentType: 'text',
				executionDuration: 100
			}
			const options: FormatOptions = { showMetadata: false }

			// When: Formatting as markdown
			const markdown = formatToolResultAsMarkdown(result, options)

			// Then: Should not include metadata line
			expect(markdown).not.toContain('> Duration:')
			expect(markdown).not.toContain('> Type:')
		})

		it('should include timestamp when requested', () => {
			// Given: Tool result with timestamp option
			const result: ToolExecutionResult = {
				content: 'Result',
				contentType: 'text',
				executionDuration: 100
			}
			const options: FormatOptions = { includeTimestamp: true }

			// When: Formatting as markdown
			const markdown = formatToolResultAsMarkdown(result, options)

			// Then: Should include executed timestamp
			expect(markdown).toContain('> Executed:')
			expect(markdown).toMatch(/> Executed: \d{4}-\d{2}-\d{2}T/)
		})

		it('should include tokens in metadata when provided', () => {
			// Given: Tool result with tokens
			const result = {
				content: 'Result',
				contentType: 'text' as const,
				executionDuration: 100,
				tokensUsed: 250
			}

			// When: Formatting as markdown
			const markdown = formatToolResultAsMarkdown(result)

			// Then: Should include token count
			expect(markdown).toContain('> Duration: 100ms, Tokens: 250, Type: text')
		})

		it('should handle multi-line content correctly', () => {
			// Given: Tool result with multi-line content
			const result: ToolExecutionResult = {
				content: 'Line 1\nLine 2\nLine 3',
				contentType: 'text',
				executionDuration: 50
			}

			// When: Formatting as markdown
			const markdown = formatToolResultAsMarkdown(result)

			// Then: Should prefix all content lines with >
			const lines = markdown.split('\n')
			const contentLines = lines.filter((line) => line.includes('Line'))
			expect(contentLines.every((line) => line.startsWith('> '))).toBe(true)
		})

		it('should format with all options combined', () => {
			// Given: Tool result with all options
			const result = {
				content: { data: [1, 2, 3] },
				contentType: 'json' as const,
				executionDuration: 175,
				tokensUsed: 300
			}
			const options: FormatOptions = {
				collapsible: true,
				showMetadata: true,
				includeTimestamp: true
			}

			// When: Formatting as markdown
			const markdown = formatToolResultAsMarkdown(result, options)

			// Then: Should include all components
			expect(markdown).toContain('> [!tool]- Tool Result (175ms)') // Collapsible
			expect(markdown).toContain('> Duration: 175ms, Tokens: 300, Type: json') // Metadata with tokens
			expect(markdown).toContain('> Executed:') // Timestamp
			expect(markdown).toContain('> ```json') // Content
		})

		it('should wrap result in newlines', () => {
			// Given: Tool result
			const result: ToolExecutionResult = {
				content: 'Test',
				contentType: 'text',
				executionDuration: 50
			}

			// When: Formatting as markdown
			const markdown = formatToolResultAsMarkdown(result)

			// Then: Should start and end with newline
			expect(markdown.startsWith('\n')).toBe(true)
			expect(markdown.endsWith('\n')).toBe(true)
		})
	})

	describe('Unified formatting consistency', () => {
		it('should produce consistent output for same result', () => {
			// Given: Same tool result used twice
			const result: ToolExecutionResult = {
				content: { value: 42 },
				contentType: 'json',
				executionDuration: 100
			}

			// When: Formatting twice
			const markdown1 = formatToolResultAsMarkdown(result)
			const markdown2 = formatToolResultAsMarkdown(result)

			// Then: Should produce identical output
			expect(markdown1).toBe(markdown2)
		})

		it('should maintain format across different content types', () => {
			// Given: Multiple results with different content types
			const results: ToolExecutionResult[] = [
				{ content: 'text', contentType: 'text', executionDuration: 50 },
				{ content: { json: true }, contentType: 'json', executionDuration: 75 },
				{ content: '# markdown', contentType: 'markdown', executionDuration: 60 }
			]

			// When: Formatting all results
			const markdowns = results.map((r) => formatToolResultAsMarkdown(r))

			// Then: All should use callout structure
			for (const markdown of markdowns) {
				expect(markdown).toContain('> [!tool]+')
				expect(markdown).toContain('> Duration:')
				expect(markdown).toMatch(/> Duration: \d+ms, Type: (text|json|markdown)/)
			}
		})
	})
})
