/**
 * Tests for MCP Use Adapter functions
 */

import { describe, expect, it } from 'vitest'
import { canUseMCPUse, partitionConfigs, toMCPUseConfig, toMCPUseServerConfig } from '../../src/mcp/mcpUseAdapter'
import type { MCPServerConfig } from '../../src/mcp/types'

describe('toMCPUseServerConfig', () => {
	it('should use config.id as server key', () => {
		const config: MCPServerConfig = {
			id: 'test-server-123',
			name: 'Test Server',
			configInput: 'npx @modelcontextprotocol/server-memory',
			enabled: true,
			failureCount: 0,
			autoDisabled: false
		}

		const result = toMCPUseServerConfig(config)

		expect(result).toHaveProperty('test-server-123')
		expect(result['test-server-123']).toBeDefined()
		expect(result['test-server-123'].command).toBe('npx')
	})

	it('should handle config with different id and name', () => {
		const config: MCPServerConfig = {
			id: 'unique-id-456',
			name: 'Display Name',
			configInput: 'docker run mcp/memory:latest',
			enabled: true,
			failureCount: 0,
			autoDisabled: false
		}

		const result = toMCPUseServerConfig(config)

		expect(result).toHaveProperty('unique-id-456')
		expect(result).not.toHaveProperty('Display Name')
		expect(result['unique-id-456'].command).toBe('docker')
	})
})

describe('toMCPUseConfig', () => {
	it('should convert multiple configs using their ids as keys', () => {
		const configs: MCPServerConfig[] = [
			{
				id: 'server1',
				name: 'Server One',
				configInput: 'npx @modelcontextprotocol/server-memory',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			},
			{
				id: 'server2',
				name: 'Server Two',
				configInput: 'docker run mcp/filesystem:latest',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			}
		]

		const result = toMCPUseConfig(configs)

		expect(result.mcpServers).toHaveProperty('server1')
		expect(result.mcpServers).toHaveProperty('server2')
		expect(result.mcpServers).not.toHaveProperty('Server One')
		expect(result.mcpServers).not.toHaveProperty('Server Two')
	})

	it('should skip disabled configs', () => {
		const configs: MCPServerConfig[] = [
			{
				id: 'enabled-server',
				name: 'Enabled Server',
				configInput: 'npx @modelcontextprotocol/server-memory',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			},
			{
				id: 'disabled-server',
				name: 'Disabled Server',
				configInput: 'docker run mcp/filesystem:latest',
				enabled: false,
				failureCount: 0,
				autoDisabled: false
			}
		]

		const result = toMCPUseConfig(configs)

		expect(result.mcpServers).toHaveProperty('enabled-server')
		expect(result.mcpServers).not.toHaveProperty('disabled-server')
	})
})

describe('canUseMCPUse', () => {
	it('should return true for valid mcp-use configs', () => {
		const config: MCPServerConfig = {
			id: 'test-server',
			name: 'Test Server',
			configInput: 'npx @modelcontextprotocol/server-memory',
			enabled: true,
			failureCount: 0,
			autoDisabled: false
		}

		expect(canUseMCPUse(config)).toBe(true)
	})

	it('should return true for remote URL configs via mcp-remote bridge', () => {
		const config: MCPServerConfig = {
			id: 'test-server',
			name: 'Test Server',
			configInput: 'http://localhost:3000/sse',
			enabled: true,
			failureCount: 0,
			autoDisabled: false
		}

		expect(canUseMCPUse(config)).toBe(true)
	})

	it('should return false for invalid configs', () => {
		const config: MCPServerConfig = {
			id: 'invalid-config',
			name: 'Invalid Config',
			configInput: '',
			enabled: true,
			failureCount: 0,
			autoDisabled: false
		}

		expect(canUseMCPUse(config)).toBe(false)
	})
})

describe('partitionConfigs', () => {
	it('should partition configs correctly', () => {
		const configs: MCPServerConfig[] = [
			{
				id: 'mcp-use-server',
				name: 'MCP Use Server',
				configInput: 'npx @modelcontextprotocol/server-memory',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			},
			{
				id: 'custom-server',
				name: 'Custom Server',
				configInput: 'http://localhost:3000/sse',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			},
			{
				id: 'disabled-server',
				name: 'Disabled Server',
				configInput: 'npx @modelcontextprotocol/server-filesystem',
				enabled: false,
				failureCount: 0,
				autoDisabled: false
			}
		]

		const result = partitionConfigs(configs)

		expect(result.mcpUseConfigs).toHaveLength(2)
		expect(result.mcpUseConfigs.find((cfg) => cfg.id === 'mcp-use-server')).toBeDefined()
		expect(result.mcpUseConfigs.find((cfg) => cfg.id === 'custom-server')).toBeDefined()
		expect(result.customConfigs).toHaveLength(0)
	})
})
