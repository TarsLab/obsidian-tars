/**
 * Tests for MCP utility functions, specifically config parsing
 */

import { describe, expect, it } from 'vitest'
import { parseConfigInput } from '../../src/mcp/config'

describe('parseConfigInput', () => {
	it('should parse VS Code MCP JSON format with docker run', () => {
		const input = JSON.stringify({
			command: 'docker',
			args: ['run', '-i', '--rm', 'mcp/memory:latest'],
			env: {}
		})

		const result = parseConfigInput(input)
		expect(result).not.toBeNull()
		const parsed = result!

		expect(parsed.type).toBe('json')
		expect(parsed.mcpUseConfig).toBeDefined()
		expect(parsed.mcpUseConfig?.command).toBe('docker')
		expect(parsed.mcpUseConfig?.args).toContain('run')
		expect(parsed.mcpUseConfig?.args).toContain('mcp/memory:latest')
	})

	it('should parse Claude Desktop JSON format', () => {
		const input = JSON.stringify({
			mcpServers: {
				memory: {
					command: 'npx',
					args: ['-y', '@modelcontextprotocol/server-memory'],
					env: {}
				}
			}
		})

		const result = parseConfigInput(input)
		expect(result).not.toBeNull()
		const parsed = result!

		expect(parsed.type).toBe('json')
		expect(parsed.serverName).toBe('memory')
		expect(parsed.mcpUseConfig).toBeDefined()
		expect(parsed.mcpUseConfig?.command).toBe('npx')
		expect(parsed.mcpUseConfig?.args).toContain('-y')
	})

	it('should parse plain docker run command', () => {
		const input = 'docker run -i --rm mcp/memory:latest'

		const result = parseConfigInput(input)
		expect(result).not.toBeNull()
		const parsed = result!

		expect(parsed.type).toBe('command')
		expect(parsed.mcpUseConfig).toBeDefined()
		expect(parsed.mcpUseConfig?.command).toBe('docker')
		expect(parsed.mcpUseConfig?.args).toContain('run')
		expect(parsed.mcpUseConfig?.args).toContain('mcp/memory:latest')
	})

	it('should parse URL for SSE transport', () => {
		const input = 'http://localhost:3000/sse'

		const result = parseConfigInput(input)
		expect(result).not.toBeNull()
		const parsed = result!

		expect(parsed.type).toBe('url')
		expect(parsed.url).toBe('http://localhost:3000/sse')
		expect(parsed.error).toBeUndefined()
		expect(parsed.mcpUseConfig).toBeDefined()
	})

	it('should parse npx command', () => {
		const input = 'npx @modelcontextprotocol/server-memory'

		const result = parseConfigInput(input)
		expect(result).not.toBeNull()
		const parsed = result!

		expect(parsed.type).toBe('command')
		expect(parsed.mcpUseConfig).toBeDefined()
		expect(parsed.mcpUseConfig?.command).toBe('npx')
		expect(parsed.mcpUseConfig?.args).toContain('@modelcontextprotocol/server-memory')
		expect(parsed.serverName).toBe('server-memory')
	})

	it('should parse uvx command', () => {
		const input = 'uvx mcp-server-git'

		const result = parseConfigInput(input)
		expect(result).not.toBeNull()
		const parsed = result!

		expect(parsed.type).toBe('command')
		expect(parsed.mcpUseConfig).toBeDefined()
		expect(parsed.mcpUseConfig?.command).toBe('uvx')
		expect(parsed.mcpUseConfig?.args).toContain('mcp-server-git')
		expect(parsed.serverName).toBe('mcp-server-git')
	})

	it('should handle invalid JSON gracefully', () => {
		const input = '{ invalid json'

		const result = parseConfigInput(input)
		expect(result).not.toBeNull()
		const parsed = result!

		expect(parsed.type).toBe('json')
		expect(parsed.error).toBeDefined()
		expect(parsed.mcpUseConfig).toBeNull()
	})

	it('should handle empty input', () => {
		const input = ''

		const result = parseConfigInput(input)

		expect(result).toBeNull()
	})
})
