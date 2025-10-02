/**
 * MCP Utility Functions
 * Common helpers and patterns used across MCP modules
 */

import type { MCPServerConfig } from './types'
import { TransportProtocol } from './types'

/**
 * Extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message
	}
	return String(error)
}

/**
 * Format error with context for logging
 */
export function formatErrorWithContext(context: string, error: unknown): string {
	return `${context}: ${getErrorMessage(error)}`
}

/**
 * Safe async operation wrapper that logs errors but doesn't throw
 */
export async function safeAsync<T>(operation: () => Promise<T>, fallback: T, errorMessage: string): Promise<T> {
	try {
		return await operation()
	} catch (error) {
		console.warn(formatErrorWithContext(errorMessage, error))
		return fallback
	}
}

/**
 * Log error with context
 */
export function logError(context: string, error: unknown): void {
	console.error(formatErrorWithContext(context, error))
}

/**
 * Log warning with context
 */
export function logWarning(context: string, error: unknown): void {
	console.warn(formatErrorWithContext(context, error))
}

/**
 * Parse executionCommand to extract command, args, and env
 * Supports: 1) Plain shell command, 2) VS Code MCP JSON format, 3) URL for remote server
 *
 * Returns parsed command structure or null if invalid
 */
export function parseExecutionCommand(cmd: string): {
	command: string
	args: string[]
	env?: Record<string, string>
	url?: string
} | null {
	const trimmed = cmd?.trim()

	if (!trimmed) {
		return null
	}

	// Check if it's a URL (for SSE transport)
	if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
		return {
			command: '',
			args: [],
			url: trimmed
		}
	}

	// Try to parse as JSON first (VS Code MCP format)
	if (trimmed.startsWith('{')) {
		try {
			const jsonConfig = JSON.parse(trimmed)

			// Check if it's a VS Code MCP JSON config
			if (jsonConfig.command) {
				return {
					command: jsonConfig.command,
					args: jsonConfig.args || [],
					env: jsonConfig.env
				}
			}
		} catch (e) {
			// Not valid JSON, fall through to try other parsing methods
			console.debug('Failed to parse as JSON:', e)
		}
	}

	// Parse as plain shell command
	const parts = trimmed.split(/\s+/)
	if (parts.length === 0) {
		return null
	}

	return {
		command: parts[0],
		args: parts.slice(1)
	}
}
