/**
 * MCP Configuration Migration
 * Migrates all legacy formats to new simplified configInput format
 */

import type { MCPServerConfig } from './types'

function buildDockerRunCommand(config: {
	image?: string
	containerName?: string
	command?: string[]
	env?: Record<string, string>
}): string | null {
	const { image, containerName, command = [], env = {} } = config
	if (!image) {
		return null
	}

	const args: string[] = ['docker', 'run', '-i', '--rm']

	if (containerName) {
		args.push('--name', containerName)
	}

	for (const [key, value] of Object.entries(env)) {
		if (value === undefined) {
			continue
		}
		const needsQuoting = /\s/.test(value)
		const formattedValue = needsQuoting ? `"${value.replace(/"/g, '\\"')}"` : value
		args.push('-e', `${key}=${formattedValue}`)
	}

	args.push(image)
	args.push(...command)

	return args.join(' ')
}

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
			displayMode: 'command',
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
			displayMode: 'command',
			enabled: config.enabled,
			failureCount: config.failureCount || 0,
			autoDisabled: config.autoDisabled || false,
			lastConnectedAt: config.lastConnectedAt
		}
	}

	// Migrate from dockerConfig (old format 2)
	if (config.dockerConfig) {
		const dockerCommand = buildDockerRunCommand(
			config.dockerConfig as {
				image?: string
				containerName?: string
				command?: string[]
				env?: Record<string, string>
			}
		)

		if (dockerCommand) {
			return {
				id: config.id,
				name: config.name,
				configInput: dockerCommand,
				displayMode: 'command',
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
			displayMode: 'simple',
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
		displayMode: 'command',
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
