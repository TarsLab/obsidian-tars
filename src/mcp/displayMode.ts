import type { ConfigDisplayMode } from './types'

export const CommandDisplayMode = {
	Simple: 'simple' as ConfigDisplayMode,
	Command: 'command' as ConfigDisplayMode
} as const

export type CommandDisplayModeValue = (typeof CommandDisplayMode)[keyof typeof CommandDisplayMode]

const REMOTE_COMMAND_PATTERN = /^(?:\s*)(?:npx|bunx|uvx)\s+(?:(?:-y|--yes)\s+)?mcp-remote\s+(\S+)(?:\s*)$/i

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
