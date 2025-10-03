import { describe, expect, it } from 'vitest'

import {
	CommandDisplayMode,
	commandToRemoteUrl,
	normalizeDisplayMode,
	remoteUrlToCommand
} from '../../src/mcp/displayMode'

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
