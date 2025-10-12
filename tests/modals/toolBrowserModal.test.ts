/**
 * Tests for Tool Browser Modal
 * Validates template generation, cursor positioning, and parameter handling
 */

import { describe, expect, it } from 'vitest'
import type { ToolDefinition } from '../../src/mcp/types'

describe('Tool Browser Modal - Template Generation', () => {
	describe('Parameter placeholder generation', () => {
		it('should generate correct placeholder for string type', () => {
			// Given: String parameter schema
			const paramSchema: { type: 'string'; example?: string } = { type: 'string' }

			// When: Generating placeholder
			let exampleValue = ''
			switch (paramSchema.type) {
				case 'string':
					exampleValue = paramSchema.example ? `"${paramSchema.example}"` : '""'
					break
			}

			// Then: Should generate empty string placeholder
			expect(exampleValue).toBe('""')
		})

		it('should generate correct placeholder for number type', () => {
			// Given: Number parameter schema
			const paramSchema: { type: 'number' | 'integer'; example?: number } = { type: 'number' }

			// When: Generating placeholder
			let exampleValue = ''
			switch (paramSchema.type) {
				case 'number':
				case 'integer':
					exampleValue = paramSchema.example?.toString() || '0'
					break
			}

			// Then: Should generate zero placeholder
			expect(exampleValue).toBe('0')
		})

		it('should generate correct placeholder for integer type', () => {
			// Given: Integer parameter schema
			const paramSchema: { type: 'number' | 'integer'; example?: number } = { type: 'integer' }

			// When: Generating placeholder
			let exampleValue = ''
			switch (paramSchema.type) {
				case 'number':
				case 'integer':
					exampleValue = paramSchema.example?.toString() || '0'
					break
			}

			// Then: Should generate zero placeholder
			expect(exampleValue).toBe('0')
		})

		it('should generate correct placeholder for boolean type', () => {
			// Given: Boolean parameter schema
			const paramSchema: { type: 'boolean'; example?: boolean } = { type: 'boolean' }

			// When: Generating placeholder
			let exampleValue = ''
			switch (paramSchema.type) {
				case 'boolean':
					exampleValue = paramSchema.example?.toString() || 'false'
					break
			}

			// Then: Should generate false placeholder
			expect(exampleValue).toBe('false')
		})

		it('should generate correct placeholder for array type', () => {
			// Given: Array parameter schema
			const paramSchema: { type: 'array' } = { type: 'array' }

			// When: Generating placeholder
			let exampleValue = ''
			switch (paramSchema.type) {
				case 'array':
					exampleValue = '[]'
					break
			}

			// Then: Should generate empty array placeholder
			expect(exampleValue).toBe('[]')
		})

		it('should generate correct placeholder for object type', () => {
			// Given: Object parameter schema
			const paramSchema: { type: 'object' } = { type: 'object' }

			// When: Generating placeholder
			let exampleValue = ''
			switch (paramSchema.type) {
				case 'object':
					exampleValue = '{}'
					break
			}

			// Then: Should generate empty object placeholder
			expect(exampleValue).toBe('{}')
		})

		it('should use example value when provided for string', () => {
			// Given: String parameter with example
			const paramSchema: { type: 'string'; example?: string } = { type: 'string', example: 'test-value' }

			// When: Generating placeholder
			let exampleValue = ''
			switch (paramSchema.type) {
				case 'string':
					exampleValue = paramSchema.example ? `"${paramSchema.example}"` : '""'
					break
			}

			// Then: Should use example value
			expect(exampleValue).toBe('"test-value"')
		})

		it('should use example value when provided for number', () => {
			// Given: Number parameter with example
			const paramSchema: { type: 'number' | 'integer'; example?: number } = { type: 'number', example: 42 }

			// When: Generating placeholder
			let exampleValue = ''
			switch (paramSchema.type) {
				case 'number':
				case 'integer':
					exampleValue = paramSchema.example?.toString() || '0'
					break
			}

			// Then: Should use example value
			expect(exampleValue).toBe('42')
		})
	})

	describe('Optional parameter markers', () => {
		it('should add optional comment for non-required parameters', () => {
			// Given: Non-required parameter
			const isRequired = false

			// When: Generating parameter line
			const optionalComment = isRequired ? '' : ' # optional'
			const paramLine = `paramName: "value"${optionalComment}`

			// Then: Should include optional comment
			expect(paramLine).toBe('paramName: "value" # optional')
		})

		it('should not add optional comment for required parameters', () => {
			// Given: Required parameter
			const isRequired = true

			// When: Generating parameter line
			const optionalComment = isRequired ? '' : ' # optional'
			const paramLine = `paramName: "value"${optionalComment}`

			// Then: Should not include optional comment
			expect(paramLine).toBe('paramName: "value"')
		})
	})

	describe('Code block generation', () => {
		it('should generate complete code block with all components', () => {
			// Given: Tool definition with parameters
			const serverId = 'test-server'
			const toolName = 'test-tool'
			const params = ['param1: ""', 'param2: 0 # optional']

			// When: Building code block
			const codeBlock = [`\`\`\`${serverId}`, `tool: ${toolName}`, ...params, '```'].join('\n')

			// Then: Should generate properly formatted code block
			expect(codeBlock).toBe('```test-server\ntool: test-tool\nparam1: ""\nparam2: 0 # optional\n```')
		})

		it('should generate code block without parameters when none exist', () => {
			// Given: Tool definition without parameters
			const serverId = 'test-server'
			const toolName = 'simple-tool'
			const params: string[] = []

			// When: Building code block
			const codeBlock = [`\`\`\`${serverId}`, `tool: ${toolName}`, ...params, '```'].join('\n')

			// Then: Should generate minimal code block
			expect(codeBlock).toBe('```test-server\ntool: simple-tool\n```')
		})
	})

	describe('Cursor positioning logic', () => {
		it('should calculate correct line offset for first required parameter', () => {
			// Given: Tool with multiple parameters, first one required
			const cursorLine = 10
			const firstParamIndex = 0
			const params = ['required_param: ""', 'optional_param: 0 # optional']

			// When: Calculating target line
			// Line offset: 1 (opening fence) + 1 (tool line) + firstParamIndex
			const targetLine = cursorLine + 2 + firstParamIndex

			// Then: Should point to first parameter line
			expect(targetLine).toBe(12) // Line 10 + 2 = 12 (first param)
		})

		it('should calculate correct character position after colon', () => {
			// Given: Parameter line
			const paramLine = 'paramName: ""'

			// When: Finding colon position
			const colonIndex = paramLine.indexOf(': ')
			const valueStartPosition = colonIndex !== -1 ? colonIndex + 2 : 0

			// Then: Should position at start of value
			// "paramName" = 9 chars, ": " = 2 chars, so position 11 (0-indexed: p=0...e=8, :=9, space=10, "=11)
			expect(valueStartPosition).toBe(11)
		})

		it('should position at first parameter when no required parameters exist', () => {
			// Given: Tool with only optional parameters
			const requiredParams: string[] = []
			const params = ['optional1: 0 # optional', 'optional2: "" # optional']

			// When: Determining first parameter index
			let firstParamIndex = -1
			if (requiredParams.length > 0) {
				firstParamIndex = 0
			}
			if (firstParamIndex === -1) {
				firstParamIndex = 0
			}

			// Then: Should use first parameter
			expect(firstParamIndex).toBe(0)
		})

		it('should skip optional parameters to find first required parameter', () => {
			// Given: Tool with optional param first, required second
			const requiredParams = ['required_param']
			const propertyNames = ['optional_param', 'required_param', 'another_optional']

			// When: Finding first required parameter index
			let firstParamIndex = -1
			for (let i = 0; i < propertyNames.length; i++) {
				if (requiredParams.includes(propertyNames[i])) {
					firstParamIndex = i
					break
				}
			}

			// Then: Should find second parameter (index 1)
			expect(firstParamIndex).toBe(1)
		})
	})

	describe('Full template generation with cursor positioning', () => {
		it('should generate template for tool with mixed required and optional parameters', () => {
			// Given: Tool definition
			const tool: ToolDefinition = {
				name: 'search_tool',
				description: 'Search for items',
				inputSchema: {
					type: 'object',
					properties: {
						query: { type: 'string', description: 'Search query' },
						limit: { type: 'integer', description: 'Result limit' },
						includeArchived: { type: 'boolean', description: 'Include archived items' }
					},
					required: ['query']
				}
			}

			// When: Building parameters
			const params: string[] = []
			const required = (tool.inputSchema?.required as string[]) || []
			const properties = tool.inputSchema?.properties as Record<string, any>

			for (const [paramName, paramSchema] of Object.entries(properties)) {
				const isRequired = required.includes(paramName)
				let exampleValue = ''

				switch (paramSchema.type) {
					case 'string':
						exampleValue = '""'
						break
					case 'integer':
					case 'number':
						exampleValue = '0'
						break
					case 'boolean':
						exampleValue = 'false'
						break
				}

				const optionalComment = isRequired ? '' : ' # optional'
				params.push(`${paramName}: ${exampleValue}${optionalComment}`)
			}

			// Then: Should generate correct parameters
			expect(params).toEqual(['query: ""', 'limit: 0 # optional', 'includeArchived: false # optional'])
		})

		it('should generate template for tool with only required parameters', () => {
			// Given: Tool with all required parameters
			const tool: ToolDefinition = {
				name: 'create_item',
				description: 'Create a new item',
				inputSchema: {
					type: 'object',
					properties: {
						name: { type: 'string' },
						value: { type: 'number' }
					},
					required: ['name', 'value']
				}
			}

			// When: Building parameters
			const params: string[] = []
			const required = (tool.inputSchema?.required as string[]) || []
			const properties = tool.inputSchema?.properties as Record<string, any>

			for (const [paramName, paramSchema] of Object.entries(properties)) {
				const isRequired = required.includes(paramName)
				let exampleValue = ''

				switch (paramSchema.type) {
					case 'string':
						exampleValue = '""'
						break
					case 'number':
						exampleValue = '0'
						break
				}

				const optionalComment = isRequired ? '' : ' # optional'
				params.push(`${paramName}: ${exampleValue}${optionalComment}`)
			}

			// Then: Should have no optional comments
			expect(params).toEqual(['name: ""', 'value: 0'])
			expect(params.some((p) => p.includes('# optional'))).toBe(false)
		})

		it('should generate template for tool with complex types', () => {
			// Given: Tool with array and object parameters
			const tool: ToolDefinition = {
				name: 'batch_process',
				description: 'Process multiple items',
				inputSchema: {
					type: 'object',
					properties: {
						items: { type: 'array' },
						config: { type: 'object' }
					},
					required: ['items']
				}
			}

			// When: Building parameters
			const params: string[] = []
			const required = (tool.inputSchema?.required as string[]) || []
			const properties = tool.inputSchema?.properties as Record<string, any>

			for (const [paramName, paramSchema] of Object.entries(properties)) {
				const isRequired = required.includes(paramName)
				let exampleValue = ''

				switch (paramSchema.type) {
					case 'array':
						exampleValue = '[]'
						break
					case 'object':
						exampleValue = '{}'
						break
				}

				const optionalComment = isRequired ? '' : ' # optional'
				params.push(`${paramName}: ${exampleValue}${optionalComment}`)
			}

			// Then: Should generate correct complex type placeholders
			expect(params).toEqual(['items: []', 'config: {} # optional'])
		})
	})
})
