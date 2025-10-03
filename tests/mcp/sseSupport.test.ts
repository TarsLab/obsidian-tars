/**
 * Tests for SSE/URL support via mcp-remote bridge
 * Feature-200-40: SSE Support via mcp-remote
 */

import { describe, expect, it } from 'vitest'
import { parseConfigInput, toMCPUseFormat } from '../../src/mcp/config'
import type { MCPServerConfig } from '../../src/mcp/types'

describe('SSE/URL Support via mcp-remote', () => {
	describe('URL to mcp-remote Conversion', () => {
		it('should convert HTTP URL to mcp-remote command', () => {
			const input = 'http://localhost:3000'
			const result = parseConfigInput(input)

			expect(result).toBeDefined()
			expect(result?.type).toBe('url')
			expect(result?.mcpUseConfig).toBeDefined()
			expect(result?.mcpUseConfig?.command).toBe('npx')
			expect(result?.mcpUseConfig?.args).toEqual(['-y', 'mcp-remote', 'http://localhost:3000'])
		})

		it('should convert HTTPS URL to mcp-remote command', () => {
			const input = 'https://mcp.example.com/api'
			const result = parseConfigInput(input)

			expect(result).toBeDefined()
			expect(result?.type).toBe('url')
			expect(result?.mcpUseConfig).toBeDefined()
			expect(result?.mcpUseConfig?.command).toBe('npx')
			expect(result?.mcpUseConfig?.args).toEqual(['-y', 'mcp-remote', 'https://mcp.example.com/api'])
		})

		it('should extract server name from URL hostname', () => {
			const input = 'https://mcp.example.com:8080/path'
			const result = parseConfigInput(input)

			expect(result?.serverName).toBe('mcp-example-com')
		})

		it('should handle URL with query parameters', () => {
			const input = 'http://localhost:3000/mcp?token=abc123'
			const result = parseConfigInput(input)

			expect(result?.type).toBe('url')
			expect(result?.mcpUseConfig?.args).toContain('http://localhost:3000/mcp?token=abc123')
		})
	})

	describe('toMCPUseFormat with URLs', () => {
		it('should successfully convert URL config to mcp-use format', () => {
			const config: MCPServerConfig = {
				id: 'remote-server',
				name: 'Remote MCP Server',
				configInput: 'https://mcp.example.com',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			}

			const result = toMCPUseFormat(config)

			expect(result).not.toBeNull()
			expect(result?.command).toBe('npx')
			expect(result?.args).toEqual(['-y', 'mcp-remote', 'https://mcp.example.com'])
		})

		it('should use config name over parsed hostname', () => {
			const config: MCPServerConfig = {
				id: 'custom-server',
				name: 'My Custom Server',
				configInput: 'http://api.service.com',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			}

			const result = toMCPUseFormat(config)

			expect(result?.serverName).toBe('My Custom Server')
		})
	})

	describe('Integration with Manager', () => {
		it('should allow URL configs to be used alongside command configs', () => {
			const urlConfig: MCPServerConfig = {
				id: 'remote-1',
				name: 'Remote Server',
				configInput: 'https://mcp.remote.com',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			}

			const cmdConfig: MCPServerConfig = {
				id: 'local-1',
				name: 'Local Server',
				configInput: 'npx @modelcontextprotocol/server-memory',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			}

			const urlResult = toMCPUseFormat(urlConfig)
			const cmdResult = toMCPUseFormat(cmdConfig)

			// Both should convert successfully
			expect(urlResult).not.toBeNull()
			expect(cmdResult).not.toBeNull()

			// URL uses mcp-remote
			expect(urlResult?.command).toBe('npx')
			expect(urlResult?.args[1]).toBe('mcp-remote')

			// Command uses direct execution
			expect(cmdResult?.command).toBe('npx')
			expect(cmdResult?.args[0]).toBe('@modelcontextprotocol/server-memory')
		})
	})

	describe('Error Handling', () => {
		it('should not error on URL configs anymore', () => {
			const input = 'https://mcp.example.com'
			const result = parseConfigInput(input)

			// Should not have error field
			expect(result?.error).toBeUndefined()
		})

		it('should preserve original URL in result', () => {
			const input = 'https://api.example.com:9000/mcp/v1'
			const result = parseConfigInput(input)

			expect(result?.url).toBe('https://api.example.com:9000/mcp/v1')
		})
	})
})
