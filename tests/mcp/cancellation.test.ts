/**
 * Cancellation Support Tests
 *
 * Tests for tool execution cancellation functionality including:
 * - AbortController integration
 * - UI cancel button
 * - Proper cleanup on cancellation
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolExecutor } from '../../src/mcp/executor'
import type { MCPServerManager } from '../../src/mcp/managerMCPUse'
import type { ExecutionTracker } from '../../src/mcp/types'

// Mock the MCP client
const mockClient = {
	callTool: vi.fn(),
	isConnected: vi.fn().mockReturnValue(true)
}

const mockManager = {
	getClient: vi.fn().mockReturnValue(mockClient),
	listServers: vi.fn().mockReturnValue([])
} as unknown as MCPServerManager

const mockTracker: ExecutionTracker = {
	concurrentLimit: 3,
	sessionLimit: 25,
	activeExecutions: new Set(),
	totalExecuted: 0,
	stopped: false,
	executionHistory: []
}

describe('Tool Execution Cancellation', () => {
	let executor: ToolExecutor

	beforeEach(() => {
		vi.clearAllMocks()
		mockTracker.activeExecutions.clear()
		mockTracker.totalExecuted = 0
		mockTracker.executionHistory = []
		executor = new ToolExecutor(mockManager, mockTracker)
	})

	describe('AbortController Integration', () => {
		it('should accept AbortSignal in request', async () => {
			// Given: An AbortController and request with signal
			const controller = new AbortController()
			const request = {
				serverId: 'test-server',
				toolName: 'test-tool',
				parameters: {},
				source: 'user-codeblock' as const,
				documentPath: 'test.md',
				signal: controller.signal
			}

			// Given: Mock tool call resolves successfully
			mockClient.callTool.mockResolvedValue({
				content: 'success',
				contentType: 'text' as const,
				executionDuration: 100
			})

			// When: Tool is executed
			const result = await executor.executeTool(request)

			// Then: Result is returned successfully
			expect(result.content).toBe('success')
			expect(mockClient.callTool).toHaveBeenCalledWith('test-tool', {}, 30000)
		})

		it('should create AbortController when no signal provided', async () => {
			// Given: A request without an AbortSignal
			const request = {
				serverId: 'test-server',
				toolName: 'test-tool',
				parameters: {},
				source: 'user-codeblock' as const,
				documentPath: 'test.md'
			}

			// Given: Mock tool call resolves successfully
			mockClient.callTool.mockResolvedValue({
				content: 'success',
				contentType: 'text' as const,
				executionDuration: 100
			})

			// When: Tool is executed
			const result = await executor.executeTool(request)

			// Then: Result is returned successfully
			expect(result.content).toBe('success')
		})

		it('should abort execution when signal is aborted before call', async () => {
			// Given: An already aborted AbortController
			const controller = new AbortController()
			controller.abort() // Abort immediately

			const request = {
				serverId: 'test-server',
				toolName: 'test-tool',
				parameters: {},
				source: 'user-codeblock' as const,
				documentPath: 'test.md',
				signal: controller.signal
			}

			// When: Tool execution is attempted
			// Then: Execution should be cancelled immediately
			await expect(executor.executeTool(request)).rejects.toThrow('Tool execution was cancelled')

			// Then: Tool should not be called
			expect(mockClient.callTool).not.toHaveBeenCalled()
		})

		it('should abort execution when signal is aborted during call', async () => {
			// Given: An AbortController
			const controller = new AbortController()

			// Given: A mock tool call that can be aborted
			mockClient.callTool.mockImplementation(() => {
				return new Promise((resolve, reject) => {
					const timeout = setTimeout(
						() =>
							resolve({
								content: 'success',
								contentType: 'text' as const,
								executionDuration: 100
							}),
						100
					)

					controller.signal.addEventListener('abort', () => {
						clearTimeout(timeout)
						reject(new Error('Aborted'))
					})
				})
			})

			const request = {
				serverId: 'test-server',
				toolName: 'test-tool',
				parameters: {},
				source: 'user-codeblock' as const,
				documentPath: 'test.md',
				signal: controller.signal
			}

			// When: Tool execution is started
			const promise = executor.executeTool(request)

			// When: Signal is aborted after a short delay
			setTimeout(() => controller.abort(), 10)

			// Then: Execution should be cancelled
			await expect(promise).rejects.toThrow('Tool execution was cancelled')

			// Then: Execution record shows cancelled status
			const history = executor.getHistory()
			expect(history).toHaveLength(1)
			expect(history[0].status).toBe('cancelled')
			expect(history[0].errorMessage).toBe('Tool execution was cancelled')
		})
	})

	describe('cancelExecution Method', () => {
		it('should abort active execution', async () => {
			// Given: A mock tool call that never resolves (simulating long-running operation)
			mockClient.callTool.mockImplementation(() => {
				return new Promise(() => {
					// Never resolves - will be cancelled
				})
			})

			const request = {
				serverId: 'test-server',
				toolName: 'test-tool',
				parameters: {},
				source: 'user-codeblock' as const,
				documentPath: 'test.md'
				// No signal provided - executor will create its own controller
			}

			// When: Tool execution is started
			const promise = executor.executeTool(request)

			// When: Execution is cancelled after starting
			await new Promise((resolve) => setTimeout(resolve, 5))
			const activeIds = Array.from(mockTracker.activeExecutions)
			expect(activeIds).toHaveLength(1)

			const requestId = activeIds[0]
			await executor.cancelExecution(requestId)

			// Then: Execution should be cancelled
			await expect(promise).rejects.toThrow('Tool execution was cancelled')
		})

		it('should handle cancellation of non-existent execution', async () => {
			// Given: A non-existent request ID
			const nonExistentId = 'non-existent'

			// When: Cancellation is attempted
			// Then: Should not throw for non-existent request ID
			await expect(executor.cancelExecution(nonExistentId)).resolves.toBeUndefined()
		})

		it('should clean up controller after cancellation', async () => {
			// Given: A completed tool execution
			const request = {
				serverId: 'test-server',
				toolName: 'test-tool',
				parameters: {},
				source: 'user-codeblock' as const,
				documentPath: 'test.md'
			}

			mockClient.callTool.mockResolvedValue({
				content: 'success',
				contentType: 'text' as const,
				executionDuration: 100
			})

			// When: Tool is executed successfully
			await executor.executeTool(request)

			// When: Cancellation is attempted on completed execution
			const history = executor.getHistory()
			expect(history).toHaveLength(1)
			const requestId = history[0].requestId
			await executor.cancelExecution(requestId)

			// Then: Controller should be cleaned up
			expect(mockTracker.activeExecutions.size).toBe(0)
		})
	})

	describe('executeToolWithId Method', () => {
		it('should return result with requestId', async () => {
			// Given: A tool execution request
			const request = {
				serverId: 'test-server',
				toolName: 'test-tool',
				parameters: {},
				source: 'user-codeblock' as const,
				documentPath: 'test.md'
			}

			// Given: Mock tool call resolves successfully
			mockClient.callTool.mockResolvedValue({
				content: 'success',
				contentType: 'text' as const,
				executionDuration: 100
			})

			// When: Tool is executed with ID
			const result = await executor.executeToolWithId(request)

			// Then: Result includes content and requestId
			expect(result.content).toBe('success')
			expect(result.requestId).toBeDefined()
			expect(typeof result.requestId).toBe('string')
			expect(result.requestId.length).toBeGreaterThan(0)
		})

		it('should handle cancellation in executeToolWithId', async () => {
			// Given: An already aborted AbortController
			const controller = new AbortController()
			controller.abort() // Abort immediately

			const request = {
				serverId: 'test-server',
				toolName: 'test-tool',
				parameters: {},
				source: 'user-codeblock' as const,
				documentPath: 'test.md',
				signal: controller.signal
			}

			// When: Tool execution with ID is attempted
			// Then: Execution should be cancelled
			await expect(executor.executeToolWithId(request)).rejects.toThrow('Tool execution was cancelled')
		})
	})

	describe('Cleanup and Error Handling', () => {
		it('should clean up controllers on successful execution', async () => {
			// Given: A tool execution request
			const request = {
				serverId: 'test-server',
				toolName: 'test-tool',
				parameters: {},
				source: 'user-codeblock' as const,
				documentPath: 'test.md'
			}

			// Given: Mock tool call resolves successfully
			mockClient.callTool.mockResolvedValue({
				content: 'success',
				contentType: 'text' as const,
				executionDuration: 100
			})

			// When: Tool is executed successfully
			await executor.executeTool(request)

			// Then: Controllers should be cleaned up
			expect(mockTracker.activeExecutions.size).toBe(0)
		})

		it('should clean up controllers on error', async () => {
			// Given: A tool execution request
			const request = {
				serverId: 'test-server',
				toolName: 'test-tool',
				parameters: {},
				source: 'user-codeblock' as const,
				documentPath: 'test.md'
			}

			// Given: Mock tool call rejects with error
			mockClient.callTool.mockRejectedValue(new Error('Tool failed'))

			// When: Tool execution fails
			await expect(executor.executeTool(request)).rejects.toThrow('Tool failed')

			// Then: Controllers should be cleaned up even on error
			expect(mockTracker.activeExecutions.size).toBe(0)
		})

		it('should clean up controllers on cancellation', async () => {
			// Given: A mock tool call that never resolves (simulating long-running operation)
			mockClient.callTool.mockImplementation(() => {
				return new Promise(() => {
					// Never resolves - will be cancelled
				})
			})

			const request = {
				serverId: 'test-server',
				toolName: 'test-tool',
				parameters: {},
				source: 'user-codeblock' as const,
				documentPath: 'test.md'
				// No signal provided - executor will create its own controller
			}

			// When: Tool execution is started
			const promise = executor.executeTool(request)

			// When: Execution is cancelled after starting
			await new Promise((resolve) => setTimeout(resolve, 5))
			const activeIds = Array.from(mockTracker.activeExecutions)
			await executor.cancelExecution(activeIds[0])

			// Then: Execution should be cancelled
			await expect(promise).rejects.toThrow('Tool execution was cancelled')

			// Then: Controllers should be cleaned up
			expect(mockTracker.activeExecutions.size).toBe(0)
		})
	})
})
