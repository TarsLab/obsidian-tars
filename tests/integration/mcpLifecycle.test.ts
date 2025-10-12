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
			const serverConfigs = [
				{
					id: 'test-docker-server',
					name: 'test-docker',
					configInput: 'docker run -i --rm mcp-test/echo:latest',
					enabled: true,
					failureCount: 0,
					autoDisabled: false
				},
				{
					id: 'test-npx-server',
					name: 'test-memory',
					configInput: 'npx -y @modelcontextprotocol/server-memory',
					enabled: true,
					failureCount: 0,
					autoDisabled: false
				}
			]

			// WHEN: Manager initializes with server configs
			await manager.initialize(serverConfigs)

			// THEN: Manager is ready and servers are listed
			const servers = manager.listServers()
			expect(servers).toHaveLength(2)
			expect(servers[0].name).toBe('test-docker')
			expect(servers[1].name).toBe('test-memory')
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
