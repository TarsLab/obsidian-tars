/**
 * Tests for MCP utility functions, specifically executionCommand parsing
 */

import { describe, expect, it } from 'vitest'
import { DeploymentType, type MCPServerConfig, TransportProtocol } from '../../src/mcp/types'
import { parseExecutionCommand } from '../../src/mcp/utils'

describe('parseExecutionCommand', () => {
	it('should parse VS Code MCP JSON format with docker run', () => {
		const config: MCPServerConfig = {
			id: 'test-1',
			name: 'memory-server',
			transport: TransportProtocol.STDIO,
			executionCommand: JSON.stringify({
				command: 'docker',
				args: ['run', '-i', '--rm', 'mcp/memory:latest'],
				env: {}
			}),
			enabled: true,
			failureCount: 0,
			autoDisabled: false,
			sectionBindings: []
		}

		parseExecutionCommand(config)

		expect(config.deploymentType).toBe(DeploymentType.MANAGED)
		expect(config.dockerConfig).toBeDefined()
		expect(config.dockerConfig?.image).toBe('mcp/memory:latest')
		expect(config.dockerConfig?.containerName).toBe('memory-server')
	})

	it('should parse plain docker run command', () => {
		const config: MCPServerConfig = {
			id: 'test-2',
			name: 'test-server',
			transport: TransportProtocol.STDIO,
			executionCommand: 'docker run -i --rm mcp/memory:latest',
			enabled: true,
			failureCount: 0,
			autoDisabled: false,
			sectionBindings: []
		}

		parseExecutionCommand(config)

		expect(config.deploymentType).toBe(DeploymentType.MANAGED)
		expect(config.dockerConfig).toBeDefined()
		expect(config.dockerConfig?.image).toBe('mcp/memory:latest')
	})

	it('should parse URL for SSE transport', () => {
		const config: MCPServerConfig = {
			id: 'test-3',
			name: 'remote-server',
			transport: TransportProtocol.STDIO,
			executionCommand: 'http://localhost:3000/sse',
			enabled: true,
			failureCount: 0,
			autoDisabled: false,
			sectionBindings: []
		}

		parseExecutionCommand(config)

		expect(config.deploymentType).toBe(DeploymentType.EXTERNAL)
		expect(config.sseConfig).toBeDefined()
		expect(config.sseConfig?.url).toBe('http://localhost:3000/sse')
		expect(config.transport).toBe(TransportProtocol.SSE)
	})

	it('should parse npx command', () => {
		const config: MCPServerConfig = {
			id: 'test-4',
			name: 'npx-server',
			transport: TransportProtocol.STDIO,
			executionCommand: 'npx @modelcontextprotocol/server-memory',
			enabled: true,
			failureCount: 0,
			autoDisabled: false,
			sectionBindings: []
		}

		parseExecutionCommand(config)

		expect(config.deploymentType).toBe(DeploymentType.MANAGED)
		expect(config.dockerConfig).toBeDefined()
		expect(config.dockerConfig?.image).toBe('npx')
		expect(config.dockerConfig?.command).toContain('@modelcontextprotocol/server-memory')
	})

	it('should skip parsing if dockerConfig already exists', () => {
		const existingConfig = {
			image: 'existing:image',
			containerName: 'existing-container',
			command: ['test']
		}

		const config: MCPServerConfig = {
			id: 'test-5',
			name: 'existing',
			transport: TransportProtocol.STDIO,
			executionCommand: 'docker run -i --rm new-image:latest',
			enabled: true,
			failureCount: 0,
			autoDisabled: false,
			sectionBindings: [],
			dockerConfig: existingConfig
		}

		parseExecutionCommand(config)

		// Should not change existing config
		expect(config.dockerConfig).toBe(existingConfig)
		expect(config.dockerConfig?.image).toBe('existing:image')
	})
})
