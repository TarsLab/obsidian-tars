/**
 * Adapter layer to convert Tars MCP configs to mcp-use format
 *
 * This adapter bridges our Obsidian-specific configuration format
 * with the mcp-use library's expected format.
 */

import { parseConfigInput, toMCPUseFormat } from './config'
import type { MCPServerConfig } from './types'

/**
 * mcp-use server configuration format
 */
export interface MCPUseServerConfig {
	command: string
	args: string[]
	env?: Record<string, string>
}

/**
 * mcp-use full configuration format
 */
export interface MCPUseConfig {
	mcpServers: Record<string, MCPUseServerConfig>
}

/**
 * Convert a single Tars MCPServerConfig to mcp-use format
 */
export function toMCPUseServerConfig(config: MCPServerConfig): Record<string, MCPUseServerConfig> {
	const mcpUse = toMCPUseFormat(config)

	if (!mcpUse) {
		const parsed = parseConfigInput(config.configInput)
		throw new Error(
			(parsed?.error) || `Could not convert server ${config.id} to mcp-use format`
		)
	}

	// Use config.name as server key (fallback to parsed name)
	const serverKey = config.name || mcpUse.serverName

	return {
		[serverKey]: {
			command: mcpUse.command,
			args: mcpUse.args,
			env: mcpUse.env
		}
	}
}

/**
 * Convert array of Tars configs to full mcp-use config
 */
export function toMCPUseConfig(configs: MCPServerConfig[]): MCPUseConfig {
	const mcpServers: Record<string, MCPUseServerConfig> = {}

	for (const config of configs) {
		if (config.enabled) {
			try {
				const serverConfig = toMCPUseServerConfig(config)
				Object.assign(mcpServers, serverConfig)
			} catch (error) {
				console.warn(`Skipping server ${config.id}:`, error)
			}
		}
	}

	return { mcpServers }
}

/**
 * Validate that a config can be converted to mcp-use format
 */
export function canUseMCPUse(config: MCPServerConfig): boolean {
	const mcpUse = toMCPUseFormat(config)
	return mcpUse !== null
}

/**
 * Get list of configs that can/cannot use mcp-use
 */
export function partitionConfigs(configs: MCPServerConfig[]): {
	mcpUseConfigs: MCPServerConfig[]
	customConfigs: MCPServerConfig[]
} {
	const mcpUseConfigs: MCPServerConfig[] = []
	const customConfigs: MCPServerConfig[] = []

	for (const config of configs) {
		if (config.enabled) {
			if (canUseMCPUse(config)) {
				mcpUseConfigs.push(config)
			} else {
				customConfigs.push(config)
			}
		}
	}

	return { mcpUseConfigs, customConfigs }
}
