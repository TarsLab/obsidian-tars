/**
 * Simplified MCP Configuration
 * Supports 3 input methods: URL, Command, or Claude-compatible JSON
 *
 * URL Support:
 * - URLs (http:// or https://) are automatically converted to use mcp-remote bridge
 * - Example: "https://mcp.example.com" → npx -y mcp-remote https://mcp.example.com
 * - This enables SSE (Server-Sent Events) transport support
 */

/**
 * MCP Server configuration (simplified)
 * Maps directly to mcp-use library format
 */
export interface MCPServerConfig {
	// Identity
	id: string
	name: string

	// Input (one of three formats)
	// 1. URL: "http://localhost:3000" or "https://mcp.example.com"
	// 2. Command: "npx @playwright/mcp@latest" or "uvx mcp-server-git"
	// 3. JSON: Claude-compatible config (see below)
	configInput: string

	// State
	enabled: boolean

	// Health tracking (internal)
	lastConnectedAt?: number
	failureCount: number
	autoDisabled: boolean
}

/**
 * Claude Desktop MCP Config format
 * Reference: https://github.com/gleanwork/mcp-config-schema
 */
export interface ClaudeDesktopMCPConfig {
	mcpServers: {
		[serverName: string]: {
			command: string
			args?: string[]
			env?: Record<string, string>
		}
	}
}

/**
 * Parse configInput to determine format and extract mcp-use config
 */
export function parseConfigInput(input: string): {
	type: 'url' | 'command' | 'json'
	serverName: string
	mcpUseConfig: {
		command: string
		args: string[]
		env?: Record<string, string>
	} | null
	url?: string
	error?: string
} | null {
	if (!input) {
		return null
	}

	const trimmed = input.trim()

	if (trimmed === '') {
		return null
	}

	// 1. URL format - use mcp-remote as bridge to SSE
	if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
		return {
			type: 'url',
			serverName: new URL(trimmed).hostname.replace(/\./g, '-'),
			mcpUseConfig: {
				command: 'npx',
				args: ['-y', 'mcp-remote', trimmed],
				env: {}
			},
			url: trimmed
		}
	}

	// 2. JSON format (Claude Desktop compatible)
	if (trimmed.startsWith('{')) {
		try {
			const parsed = JSON.parse(trimmed) as ClaudeDesktopMCPConfig

			// Check if it's Claude Desktop format
			if (parsed.mcpServers) {
				const serverNames = Object.keys(parsed.mcpServers)
				if (serverNames.length === 0) {
					return {
						type: 'json',
						serverName: '',
						mcpUseConfig: null,
						error: 'No servers defined in mcpServers'
					}
				}

				// Use first server (we'll support multi-server later)
				const serverName = serverNames[0]
				const serverConfig = parsed.mcpServers[serverName]

				return {
					type: 'json',
					serverName,
					mcpUseConfig: {
						command: serverConfig.command,
						args: serverConfig.args || [],
						env: serverConfig.env
					}
				}
			}

			// Check if it's direct mcp-use format: { command, args, env }
			if ('command' in parsed && typeof parsed.command === 'string') {
				return {
					type: 'json',
					serverName: 'mcp-server',
					mcpUseConfig: {
						command: parsed.command,
						args: (parsed as { command: string; args?: string[]; env?: Record<string, string> }).args || [],
						env: (parsed as { command: string; args?: string[]; env?: Record<string, string> }).env
					}
				}
			}

			return {
				type: 'json',
				serverName: '',
				mcpUseConfig: null,
				error: 'Invalid JSON format. Expected Claude Desktop format or { command, args, env }'
			}
		} catch (e) {
			return {
				type: 'json',
				serverName: '',
				mcpUseConfig: null,
				error: `JSON parse error: ${e instanceof Error ? e.message : String(e)}`
			}
		}
	}

	// 3. Command format (bash/shell command)
	const parts = trimmed.split(/\s+/).filter(p => p.length > 0)
	if (parts.length === 0 || !parts[0]) {
		return {
			type: 'command',
			serverName: '',
			mcpUseConfig: null,
			error: 'Empty command'
		}
	}

	const command = parts[0]
	const args = parts.slice(1)

	// Detect server name from command
	let serverName = 'mcp-server'
	if (command === 'npx' && args.length > 0) {
		// Extract package name: npx @modelcontextprotocol/server-memory → server-memory
		const pkg = args[args[0] === '-y' ? 1 : 0]
		serverName = pkg.split('/').pop()?.replace('@latest', '') || 'mcp-server'
	} else if (command === 'uvx' || command === 'bunx') {
		// uvx mcp-server-git → mcp-server-git
		serverName = args[0] || 'mcp-server'
	} else if (command === 'docker' && args[0] === 'run') {
		// docker run mcp/memory → memory
		const imageArg = args.find((arg) => !arg.startsWith('-'))
		if (imageArg) {
			serverName = imageArg.split('/').pop()?.split(':')[0] || 'mcp-server'
		}
	}

	return {
		type: 'command',
		serverName,
		mcpUseConfig: {
			command,
			args
		}
	}
}

/**
 * Convert MCPServerConfig to mcp-use format
 */
export function toMCPUseFormat(config: MCPServerConfig): {
	serverName: string
	command: string
	args: string[]
	env?: Record<string, string>
} | null {
	const parsed = parseConfigInput(config.configInput)

	if (!parsed || !parsed.mcpUseConfig) {
		return null // SSE or invalid
	}

	return {
		serverName: config.name || parsed.serverName,
		...parsed.mcpUseConfig
	}
}

/**
 * Validate configInput and return error message if invalid
 */
export function validateConfigInput(input: string): string | null {
	if (!input || input.trim() === '') {
		return 'Config input is required'
	}

	const parsed = parseConfigInput(input)

	if (!parsed) {
		return 'Could not parse config input'
	}

	if (parsed.error) {
		return parsed.error
	}

	if (parsed.type === 'url') {
		return 'SSE transport (URLs) not yet supported. Use command or JSON format.'
	}

	if (!parsed.mcpUseConfig) {
		return 'Could not parse config input'
	}

	return null
}

/**
 * Example configurations for user guidance
 */
export const MCP_CONFIG_EXAMPLES = {
	command: {
		title: 'Command Format',
		examples: [
			'npx @modelcontextprotocol/server-memory',
			'npx -y @modelcontextprotocol/server-filesystem /path/to/files',
			'uvx mcp-server-git',
			'bunx @playwright/mcp@latest',
			'docker run -i --rm mcp/memory'
		]
	},
	json: {
		title: 'Claude Desktop JSON Format',
		example: `{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your-token"
      }
    }
  }
}`
	},
	url: {
		title: 'URL Format (SSE - Coming Soon)',
		examples: ['http://localhost:3000', 'https://mcp.example.com'],
		note: 'SSE transport not yet supported by mcp-use library'
	}
}
