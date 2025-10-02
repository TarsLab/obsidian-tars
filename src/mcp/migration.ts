/**
 * MCP Configuration Migration
 * Migrates all legacy formats to new simplified configInput format
 */

import type { MCPServerConfig } from './types'

/**
 * Legacy config interface (supports all old formats)
 */
interface LegacyMCPServerConfig {
	id: string
	name: string
	enabled: boolean
	failureCount: number
	autoDisabled: boolean
	lastConnectedAt?: number
	// Old formats
	configInput?: string
	executionCommand?: string
	transport?: string
	dockerConfig?: Record<string, unknown>
	sseConfig?: { url: string }
	deploymentType?: string
	sectionBindings?: unknown[]
}

/**
 * Migrate a single server config to new configInput format
 */
export function migrateServerConfig(config: LegacyMCPServerConfig): MCPServerConfig {
	// Already has configInput - return cleaned version
	if (config.configInput) {
		return {
			id: config.id,
			name: config.name,
			configInput: config.configInput,
			enabled: config.enabled,
			failureCount: config.failureCount || 0,
			autoDisabled: config.autoDisabled || false,
			lastConnectedAt: config.lastConnectedAt
		}
	}

	// Migrate from executionCommand (old format 1)
	if (config.executionCommand) {
		return {
			id: config.id,
			name: config.name,
			configInput: config.executionCommand,
			enabled: config.enabled,
			failureCount: config.failureCount || 0,
			autoDisabled: config.autoDisabled || false,
			lastConnectedAt: config.lastConnectedAt
		}
	}

	// Migrate from dockerConfig (old format 2)
	if (config.dockerConfig) {
		const { image, containerName, command = [], env = {} } = config.dockerConfig as {
			image?: string
			containerName?: string
			command?: string[]
			env?: Record<string, string>
		}

		if (image) {
			// Simple command format
			const cmd = image.startsWith('npx') || image.startsWith('uvx')
				? `${image} ${command.join(' ')}`.trim()
				: image

			return {
				id: config.id,
				name: config.name,
				configInput: cmd,
				enabled: config.enabled,
				failureCount: config.failureCount || 0,
				autoDisabled: config.autoDisabled || false,
				lastConnectedAt: config.lastConnectedAt
			}
		}
	}

	// Migrate from SSE config (old format 3)
	if (config.sseConfig?.url) {
		return {
			id: config.id,
			name: config.name,
			configInput: config.sseConfig.url,
			enabled: config.enabled,
			failureCount: config.failureCount || 0,
			autoDisabled: config.autoDisabled || false,
			lastConnectedAt: config.lastConnectedAt
		}
	}

	// Fallback: create empty config
	return {
		id: config.id,
		name: config.name,
		configInput: '',
		enabled: false,
		failureCount: 0,
		autoDisabled: false
	}
}

/**
 * Migrate array of server configs
 */
export function migrateServerConfigs(configs: LegacyMCPServerConfig[]): MCPServerConfig[] {
	return configs.map(migrateServerConfig)
}

/**
 * Check if a config needs migration
 */
export function needsMigration(config: unknown): boolean {
	if (typeof config !== 'object' || config === null) {
		return false
	}

	const cfg = config as Record<string, unknown>

	// Needs migration if has old fields but missing configInput
	const hasConfigInput = 'configInput' in cfg && typeof cfg.configInput === 'string'
	const hasOldFields =
		'executionCommand' in cfg ||
		'dockerConfig' in cfg ||
		'sseConfig' in cfg ||
		'transport' in cfg ||
		'deploymentType' in cfg ||
		'sectionBindings' in cfg

	return hasOldFields && !hasConfigInput
}
