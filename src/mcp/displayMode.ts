import type { MCPServerConfig, ConfigDisplayMode } from './types'
import { parseConfigInput } from './config'

export const CommandDisplayMode = {
	Simple: 'simple' as ConfigDisplayMode,
	Command: 'command' as ConfigDisplayMode
} as const

export type CommandDisplayModeValue = (typeof CommandDisplayMode)[keyof typeof CommandDisplayMode]

const REMOTE_COMMAND_PATTERN = /^(?:\s*)(?:npx|bunx|uvx)\s+(?:(?:-y|--yes)\s+)?mcp-remote\s+(\S+)(?:\s*)$/i

export type ConversionFormat = 'json' | 'url' | 'shell'

export interface ConversionCapability {
	canShowAsJson: boolean
	canShowAsUrl: boolean
	canShowAsShell: boolean
	currentFormat: ConversionFormat
	mcpRemoteCompatible: boolean
}

export function normalizeDisplayMode(value: unknown): CommandDisplayModeValue {
	if (typeof value === 'string') {
		const lowerValue = value.toLowerCase()
		if (lowerValue === CommandDisplayMode.Simple) {
			return CommandDisplayMode.Simple
		}
		if (lowerValue === CommandDisplayMode.Command) {
			return CommandDisplayMode.Command
		}
	}

	return CommandDisplayMode.Command
}

export function remoteUrlToCommand(url: string): string {
	const trimmed = url.trim()
	return `npx -y mcp-remote ${trimmed}`
}

export function commandToRemoteUrl(command: string): string | null {
	const match = REMOTE_COMMAND_PATTERN.exec(command)
	if (!match) {
		return null
	}

	const url = match[1]?.trim()
	if (!url) {
		return null
	}

	return url
}

export function isValidRemoteUrl(value: string): boolean {
	try {
		const parsed = new URL(value.trim())
		return parsed.protocol === 'http:' || parsed.protocol === 'https:'
	} catch (error) {
		return false
	}
}

export function detectConversionCapability(config: MCPServerConfig): ConversionCapability {
	const parsed = parseConfigInput(config.configInput || '')

	if (!parsed) {
		return {
			canShowAsJson: false,
			canShowAsUrl: false,
			canShowAsShell: true,
			currentFormat: 'shell',
			mcpRemoteCompatible: false
		}
	}

	const isRemoteCommand = isMcpRemoteCommand(parsed.mcpUseConfig)

	if (parsed.type === 'url') {
		return {
			canShowAsJson: false,
			canShowAsUrl: true,
			canShowAsShell: true,
			currentFormat: 'url',
			mcpRemoteCompatible: true
		}
	}

	if (parsed.type === 'json') {
		return {
			canShowAsJson: true,
			canShowAsUrl: isRemoteCommand,
			canShowAsShell: true,
			currentFormat: 'json',
			mcpRemoteCompatible: isRemoteCommand
		}
	}

	const hasRemoteUrl = commandToRemoteUrl(config.configInput || '') !== null

	return {
		canShowAsJson: false,
		canShowAsUrl: hasRemoteUrl,
		canShowAsShell: true,
		currentFormat: 'shell',
		mcpRemoteCompatible: hasRemoteUrl || isRemoteCommand
	}
}

function isMcpRemoteCommand(
	config: { command: string; args: string[]; env?: Record<string, string> } | null | undefined
): boolean {
	if (!config) {
		return false
	}

	const command = config.command.trim().toLowerCase()
	if (command === 'mcp-remote') {
		return true
	}

	if (command === 'npx' || command === 'uvx' || command === 'bunx') {
		return config.args.some((arg) => arg.toLowerCase() === 'mcp-remote')
	}

	return false
}
