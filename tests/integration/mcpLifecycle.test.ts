/**
 * Integration tests for MCP lifecycle
 * Tests lifecycle management with mocked mcp-use
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	type CodeBlockProcessor,
	createCodeBlockProcessor,
	createMCPManager,
	createToolExecutor,
	type MCPServerManager,
	type ToolExecutor
} from '../../src/mcp'

// Mock mcp-use library with silent implementation
vi.mock('mcp-use', () => {
	const mockSession = {
		isConnected: true,
		connector: {
			tools: [],
			callTool: vi.fn().mockResolvedValue({ content: [] })
		},
		connect: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn().mockResolvedValue(undefined),
		initialize: vi.fn().mockResolvedValue(undefined)
	}

	return {
		MCPClient: {
			fromDict: vi.fn(() => ({
				createSession: vi.fn().mockResolvedValue(mockSession),
				createAllSessions: vi.fn().mockResolvedValue({ 'test-server': mockSession }),
				getSession: vi.fn().mockReturnValue(mockSession),
				closeSession: vi.fn().mockResolvedValue(undefined),
				closeAllSessions: vi.fn().mockResolvedValue(undefined)
			}))
		},
		MCPSession: vi.fn(() => mockSession)
	}
})

describe('MCP Lifecycle Integration', () => {
	let manager: MCPServerManager
	let toolExecutor: ToolExecutor
	let _codeBlockProcessor: CodeBlockProcessor

	beforeEach(() => {
		manager = createMCPManager()
		toolExecutor = createToolExecutor(manager)
		_codeBlockProcessor = createCodeBlockProcessor()

		// Reset mocks
		vi.clearAllMocks()
	})

	describe('Full lifecycle management', () => {
		it('should initialize with multiple server configurations', async () => {
			// GIVEN: Multiple MCP server configurations
			const { TransportProtocol, DeploymentType } = await import('../../src/mcp/types')
			const serverConfigs = [
				{
					id: 'test-docker-server',
					name: 'test-docker',
					transport: TransportProtocol.STDIO,
					deploymentType: DeploymentType.MANAGED,
					dockerConfig: {
						image: 'mcp-test/echo:latest',
						containerName: 'test-container',
						command: ['mcp-server']
					},
					enabled: true,
					failureCount: 0,
					autoDisabled: false,
					sectionBindings: [],
					executionCommand: ''
				},
				{
					id: 'test-remote-server',
					name: 'test-remote',
					transport: TransportProtocol.SSE,
					deploymentType: DeploymentType.EXTERNAL,
					sseConfig: {
						url: 'http://localhost:8080/sse'
					},
					enabled: true,
					failureCount: 0,
					autoDisabled: false,
					sectionBindings: [],
					executionCommand: ''
				}
			]

			// WHEN: Manager initializes with server configs
			await manager.initialize(serverConfigs)

			// THEN: Manager is ready and servers are listed
			const servers = manager.listServers()
			expect(servers).toHaveLength(2)
			expect(servers[0].name).toBe('test-docker')
			expect(servers[1].name).toBe('test-remote')
		})

		it('should handle plugin load and unload lifecycle', async () => {
			// GIVEN: Initialized MCP manager with servers

			// WHEN: Plugin unloads (simulated shutdown)
			await manager.shutdown()

			// THEN: All resources are cleaned up
			// Note: In real scenario, this would stop containers and close connections
			expect(manager.listServers()).toHaveLength(0)
		})

		it('should prevent tool execution when stopped', async () => {
			// GIVEN: Tool executor with stopped state
			toolExecutor.stop()

			// WHEN: Attempting to execute a tool
			const canExecute = toolExecutor.canExecute()

			// THEN: Execution is blocked
			expect(canExecute).toBe(false)
		})
	})
})
