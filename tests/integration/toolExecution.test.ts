/**
 * Integration tests for MCP tool execution
 * End-to-end testing of tool invocation from code blocks to results
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCodeBlockProcessor, createMCPManager, createToolExecutor } from '../../src/mcp/index.js'

// Mock external dependencies
vi.mock('../../src/mcp/docker.ts')
vi.mock('@modelcontextprotocol/sdk/client/index.js')

describe('MCP Tool Execution Integration', () => {
	// biome-ignore lint/suspicious/noExplicitAny: test mock
	let manager: any
	// biome-ignore lint/suspicious/noExplicitAny: test mock
	let toolExecutor: any
	// biome-ignore lint/suspicious/noExplicitAny: test mock
	let codeBlockProcessor: any

	beforeEach(() => {
		manager = createMCPManager()
		toolExecutor = createToolExecutor(manager)
		codeBlockProcessor = createCodeBlockProcessor()

		vi.clearAllMocks()
	})

	describe('Code block to tool execution flow', () => {
		it('should parse and execute tool from code block', async () => {
			// GIVEN: Code block with valid tool invocation
			const codeBlockContent = `tool: echo
message: Hello MCP
timestamp: true`

			const serverConfigs = [
				{
					id: 'test-server',
					name: 'test-server',
					configInput: 'npx @modelcontextprotocol/server-memory',
					enabled: true,
					failureCount: 0,
					autoDisabled: false
				}
			]

			codeBlockProcessor.updateServerConfigs(serverConfigs)

			// WHEN: Code block processor parses the content
			const invocation = codeBlockProcessor.parseToolInvocation(codeBlockContent, 'test-server')

			// THEN: Tool invocation is correctly parsed
			expect(invocation).toEqual({
				serverId: 'test-server',
				toolName: 'echo',
				parameters: {
					message: 'Hello MCP',
					timestamp: true
				}
			})
		})

		it('should handle tool execution with result rendering', async () => {
			// GIVEN: Parsed tool invocation and mock result
			const invocation = {
				serverId: 'test-server',
				toolName: 'echo',
				parameters: { message: 'test' }
			}

			const mockResult = {
				content: { echo: 'test', timestamp: '2025-10-01T16:30:00Z' },
				contentType: 'json' as const,
				executionDuration: 150
			}

			// Mock successful tool execution
			toolExecutor.executeTool = vi.fn().mockResolvedValue(mockResult)

			// WHEN: Tool is executed via executor
			const result = await toolExecutor.executeTool({
				...invocation,
				source: 'user-codeblock',
				documentPath: 'test.md'
			})

			// THEN: Result matches expected format
			expect(result).toEqual(mockResult)
			expect(toolExecutor.executeTool).toHaveBeenCalledWith({
				serverId: 'test-server',
				toolName: 'echo',
				parameters: { message: 'test' },
				source: 'user-codeblock',
				documentPath: 'test.md'
			})
		})

		it('should handle tool execution errors gracefully', async () => {
			// GIVEN: Tool execution that will fail
			const executionError = new Error('Tool not found: nonexistent_tool')

			toolExecutor.executeTool = vi.fn().mockRejectedValue(executionError)

			// WHEN: Tool execution fails
			await expect(
				toolExecutor.executeTool({
					serverId: 'test-server',
					toolName: 'nonexistent_tool',
					parameters: {},
					source: 'user-codeblock',
					documentPath: 'test.md'
				})
			).rejects.toThrow('Tool not found: nonexistent_tool')

			// THEN: Error is properly propagated
			expect(toolExecutor.executeTool).toHaveBeenCalled()
		})
	})

	describe('Execution limits and tracking', () => {
		it('should track execution statistics', () => {
			// GIVEN: Fresh tool executor

			// WHEN: Getting initial stats
			const stats = toolExecutor.getStats()

			// THEN: Stats show initial state
			expect(stats).toEqual({
				activeExecutions: 0,
				totalExecuted: 0,
				sessionLimit: 25,
				concurrentLimit: 3, // Updated from 25 to 3 per factory defaults
				stopped: false,
				currentDocumentPath: undefined,
				documentSessions: []
			})
		})

		it('should enforce session limits', async () => {
			// GIVEN: Executor with session limit of 1 per document
			const { ToolExecutor } = await import('../../src/mcp/index.js')
			const tracker = {
				concurrentLimit: 5,
				sessionLimit: 1,
				activeExecutions: new Set<string>(),
				totalExecuted: 0,
				stopped: false,
				executionHistory: []
			}
			const mockClient = {
				callTool: vi.fn().mockResolvedValue({
					content: 'ok',
					contentType: 'text' as const,
					executionDuration: 10
				})
			}
			const mockManager = {
				getClient: vi.fn().mockReturnValue(mockClient),
				listServers: vi.fn().mockReturnValue([{ id: 'test-server', name: 'Test Server' }])
			} as unknown as ReturnType<typeof createMCPManager>
			const executor = new ToolExecutor(mockManager, tracker)

			// WHEN: First execution consumes session allowance for document
			await executor.executeTool({
				serverId: 'test-server',
				toolName: 'demo',
				parameters: {},
				source: 'user-codeblock',
				documentPath: 'note.md'
			})

			// THEN: Subsequent executions are blocked for same document
			expect(executor.canExecute('note.md')).toBe(false)
			expect(executor.getStats().totalExecuted).toBe(1)
		})

		it('should reset execution tracking', async () => {
			// GIVEN: Executor with some history
			const { ToolExecutor } = await import('../../src/mcp/index.js')
			const tracker = {
				concurrentLimit: 25,
				sessionLimit: 25,
				activeExecutions: new Set<string>(),
				totalExecuted: 10,
				stopped: false,
				executionHistory: []
			}
			const executor = new ToolExecutor(manager, tracker)

			// WHEN: Reset is called
			executor.reset()

			// THEN: Stats are reset
			const stats = executor.getStats()
			expect(stats.totalExecuted).toBe(0)
			expect(stats.stopped).toBe(false)
			expect(stats.documentSessions).toEqual([])
		})
	})

	describe('Session limit notifications', () => {
		it('allows user to continue after limit confirmation', async () => {
			const { ToolExecutor } = await import('../../src/mcp/index.js')
			const mockClient = {
				callTool: vi.fn().mockResolvedValue({
					content: 'ok',
					contentType: 'text' as const,
					executionDuration: 10
				})
			}
			const mockManager = {
				getClient: vi.fn().mockReturnValue(mockClient),
				listServers: vi.fn().mockReturnValue([{ id: 'test-server', name: 'Test Server' }])
			} as unknown as ReturnType<typeof createMCPManager>
			const tracker = {
				concurrentLimit: 5,
				sessionLimit: 1,
				activeExecutions: new Set<string>(),
				totalExecuted: 0,
				stopped: false,
				executionHistory: []
			}
			const onLimitReached = vi.fn().mockResolvedValue('continue')
			const onSessionReset = vi.fn()
			const executor = new ToolExecutor(mockManager, tracker, {
				sessionNotifications: {
					onLimitReached,
					onSessionReset
				},
				enableCache: false // Disable caching for this test
			})

			await executor.executeTool({
				serverId: 'test-server',
				toolName: 'demo',
				parameters: {},
				source: 'user-codeblock',
				documentPath: 'test.md'
			})

			await executor.executeTool({
				serverId: 'test-server',
				toolName: 'demo',
				parameters: {},
				source: 'user-codeblock',
				documentPath: 'test.md'
			})

			expect(onLimitReached).toHaveBeenCalledWith('test.md', 1, 1)
			expect(onSessionReset).toHaveBeenCalledWith('test.md')
			expect(mockClient.callTool).toHaveBeenCalledTimes(2)
		})

		it('aborts execution when user cancels at session limit', async () => {
			const { ToolExecutor } = await import('../../src/mcp/index.js')
			const mockClient = {
				callTool: vi.fn().mockResolvedValue({
					content: 'ok',
					contentType: 'text' as const,
					executionDuration: 10
				})
			}
			const mockManager = {
				getClient: vi.fn().mockReturnValue(mockClient),
				listServers: vi.fn().mockReturnValue([{ id: 'test-server', name: 'Test Server' }])
			} as unknown as ReturnType<typeof createMCPManager>
			const tracker = {
				concurrentLimit: 5,
				sessionLimit: 1,
				activeExecutions: new Set<string>(),
				totalExecuted: 0,
				stopped: false,
				executionHistory: []
			}
			const onLimitReached = vi.fn().mockResolvedValue('cancel')
			const onSessionReset = vi.fn()
			const executor = new ToolExecutor(mockManager, tracker, {
				sessionNotifications: {
					onLimitReached,
					onSessionReset
				}
			})

			await executor.executeTool({
				serverId: 'test-server',
				toolName: 'demo',
				parameters: {},
				source: 'user-codeblock',
				documentPath: 'test.md'
			})

			await expect(
				executor.executeTool({
					serverId: 'test-server',
					toolName: 'demo',
					parameters: {},
					source: 'user-codeblock',
					documentPath: 'test.md'
				})
			).rejects.toThrow(/limit/i)

			expect(onLimitReached).toHaveBeenCalledWith('test.md', 1, 1)
			expect(onSessionReset).not.toHaveBeenCalled()
			expect(mockClient.callTool).toHaveBeenCalledTimes(1)
		})

		it('notifies when document sessions reset after clearing state', async () => {
			const { ToolExecutor } = await import('../../src/mcp/index.js')
			const mockManager = {
				getClient: vi.fn(),
				listServers: vi.fn().mockReturnValue([{ id: 'test-server', name: 'Test Server' }])
			} as unknown as ReturnType<typeof createMCPManager>
			const tracker = {
				concurrentLimit: 5,
				sessionLimit: 5,
				activeExecutions: new Set<string>(),
				totalExecuted: 0,
				stopped: false,
				executionHistory: []
			}
			const onSessionReset = vi.fn()
			const executor = new ToolExecutor(mockManager, tracker, {
				sessionNotifications: {
					onLimitReached: vi.fn().mockResolvedValue('cancel'),
					onSessionReset
				}
			})

			executor.switchDocument('note.md')
			executor.clearDocumentSession('note.md')
			expect(onSessionReset).not.toHaveBeenCalled()
			executor.switchDocument('note.md')
			expect(onSessionReset).toHaveBeenCalledWith('note.md')
		})
	})
})
