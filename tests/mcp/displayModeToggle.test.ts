import { describe, expect, it } from 'vitest'

import {
	CommandDisplayMode,
	commandToRemoteUrl,
	detectConversionCapability,
	normalizeDisplayMode,
	remoteUrlToCommand
} from '../../src/mcp/displayMode'
import type { MCPServerConfig } from '../../src/mcp/types'

describe('remoteUrlToCommand', () => {
	it('converts https URL to remote command', () => {
		const url = 'https://example.com'
		expect(remoteUrlToCommand(url)).toBe('npx -y mcp-remote https://example.com')
	})

	it('converts http URL to remote command', () => {
		const url = 'http://localhost:3000'
		expect(remoteUrlToCommand(url)).toBe('npx -y mcp-remote http://localhost:3000')
	})

	it('trims whitespace before converting', () => {
		const url = '  https://example.com/path  '
		expect(remoteUrlToCommand(url)).toBe('npx -y mcp-remote https://example.com/path')
	})
})

describe('commandToRemoteUrl', () => {
	it('extracts URL from command with -y flag', () => {
		const command = 'npx -y mcp-remote https://example.com'
		expect(commandToRemoteUrl(command)).toBe('https://example.com')
	})

	it('extracts URL when -y flag omitted', () => {
		const command = 'npx mcp-remote https://remote.server/path'
		expect(commandToRemoteUrl(command)).toBe('https://remote.server/path')
	})

	it('handles extra whitespace between arguments', () => {
		const command = 'npx    -y\tmcp-remote    https://example.com  '
		expect(commandToRemoteUrl(command)).toBe('https://example.com')
	})

	it('returns null for non remote command', () => {
		const command = 'npx -y @modelcontextprotocol/server-memory'
		expect(commandToRemoteUrl(command)).toBeNull()
	})

	it('round-trips between URL and command', () => {
		const url = 'https://demo.mcp.example/api'
		const command = remoteUrlToCommand(url)
		expect(commandToRemoteUrl(command)).toBe(url)
	})
})

describe('normalizeDisplayMode', () => {
	it('defaults to command when value missing', () => {
		expect(normalizeDisplayMode(undefined)).toBe(CommandDisplayMode.Command)
	})

	it('normalizes uppercase simple', () => {
		expect(normalizeDisplayMode('SIMPLE')).toBe(CommandDisplayMode.Simple)
	})

	it('falls back to command for unknown value', () => {
		expect(normalizeDisplayMode('other' as unknown as CommandDisplayMode)).toBe(CommandDisplayMode.Command)
	})
})

describe('detectConversionCapability', () => {
	const baseConfig = {
		id: 'server-id',
		name: 'server-name',
		enabled: true,
		failureCount: 0,
		autoDisabled: false,
		displayMode: 'command' as const
	}

	const buildConfig = (configInput: string): MCPServerConfig => ({
		...baseConfig,
		configInput
	})

	it('detects capabilities for remote URL configs', () => {
		const capability = detectConversionCapability(buildConfig('https://demo.example/mcp'))
		expect(capability).toEqual({
			canShowAsJson: false,
			canShowAsUrl: true,
			canShowAsShell: true,
			currentFormat: 'url',
			mcpRemoteCompatible: true
		})
	})

	it('detects mcp-remote json configs as shell/url capable', () => {
		const jsonInput = JSON.stringify({ command: 'npx', args: ['-y', 'mcp-remote', 'https://demo'] })
		const capability = detectConversionCapability(buildConfig(jsonInput))
		expect(capability).toEqual({
			canShowAsJson: true,
			canShowAsUrl: true,
			canShowAsShell: true,
			currentFormat: 'json',
			mcpRemoteCompatible: true
		})
	})

	it('flags stdio json configs as shell-only', () => {
		const jsonInput = JSON.stringify({ command: 'node', args: ['server.js'] })
		const capability = detectConversionCapability(buildConfig(jsonInput))
		expect(capability).toEqual({
			canShowAsJson: true,
			canShowAsUrl: false,
			canShowAsShell: true,
			currentFormat: 'json',
			mcpRemoteCompatible: false
		})
	})

	it('allows remote shell commands to surface URL', () => {
		const capability = detectConversionCapability(buildConfig('npx -y mcp-remote https://demo'))
		expect(capability).toEqual({
			canShowAsJson: false,
			canShowAsUrl: true,
			canShowAsShell: true,
			currentFormat: 'shell',
			mcpRemoteCompatible: true
		})
	})

	it('treats non-remote commands as shell-only', () => {
		const capability = detectConversionCapability(buildConfig('node ./server.js'))
		expect(capability).toEqual({
			canShowAsJson: false,
			canShowAsUrl: false,
			canShowAsShell: true,
			currentFormat: 'shell',
			mcpRemoteCompatible: false
		})
	})

	it('defaults to shell format when config input missing', () => {
		const capability = detectConversionCapability(buildConfig(''))
		expect(capability).toEqual({
			canShowAsJson: false,
			canShowAsUrl: false,
			canShowAsShell: true,
			currentFormat: 'shell',
			mcpRemoteCompatible: false
		})
	})
})
