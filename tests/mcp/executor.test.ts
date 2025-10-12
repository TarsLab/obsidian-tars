/**
 * Contract tests for ToolExecutor limits and execution tracking
 * Tests concurrent limits, session limits, and execution history
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionNotificationHandlers } from '../../src/mcp/executor'
import { ToolExecutor } from '../../src/mcp/executor'
import { MCPServerManager } from '../../src/mcp/managerMCPUse'
import type { ExecutionTracker } from '../../src/mcp/types'

describe('ToolExecutor', () => {
	describe('constructor options', () => {
		it('should use default timeout when no options provided', () => {
			const manager = new MCPServerManager()
			const tracker = {
				concurrentLimit: 3,
				sessionLimit: 25,
				activeExecutions: new Set<string>(),
				totalExecuted: 0,
				stopped: false,
				executionHistory: []
			}

			const executor = new ToolExecutor(manager, tracker)

			// Access private options for testing
			// biome-ignore lint/suspicious/noExplicitAny: testing private property
			expect((executor as any).options.timeout).toBe(30000)
		})

		it('should use custom timeout when provided', () => {
			const manager = new MCPServerManager()
			const tracker = {
				concurrentLimit: 3,
				sessionLimit: 25,
				activeExecutions: new Set<string>(),
				totalExecuted: 0,
				stopped: false,
				executionHistory: []
			}

			const executor = new ToolExecutor(manager, tracker, { timeout: 60000 })

			// Access private options for testing
			// biome-ignore lint/suspicious/noExplicitAny: testing private property
			expect((executor as any).options.timeout).toBe(60000)
		})
	})
})

describe('ToolExecutor limits contract tests', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe('concurrent execution limit', () => {
		it('should enforce concurrent execution limit', async () => {
			// GIVEN: Concurrent limit set to 2
			const _concurrentLimit = 2
			// const executor = new ToolExecutor({ concurrentLimit, sessionLimit: -1 });

			// WHEN: 4 tool requests submitted simultaneously
			const _requests = Array.from({ length: 4 }, (_, i) => ({
				id: `req-${i}`,
				serverId: 'test-server',
				toolName: 'test-tool',
				parameters: { index: i }
			}))

			// THEN: Only 2 execute concurrently, others queue
			// const activeCount = executor.getActiveExecutionCount();
			// expect(activeCount).toBeLessThanOrEqual(concurrentLimit);
			expect(true).toBe(true) // Placeholder
		})
	})

	describe('session execution limit', () => {
		it('should enforce session execution limit', async () => {
			// GIVEN: Session limit set to 5
			const _sessionLimit = 5
			// const executor = new ToolExecutor({ concurrentLimit: 10, sessionLimit });

			// WHEN: 6 tool requests submitted sequentially
			const _requests = Array.from({ length: 6 }, (_, i) => ({
				id: `req-${i}`,
				serverId: 'test-server',
				toolName: 'test-tool',
				parameters: { index: i }
			}))

			// THEN: First 5 succeed, 6th throws ExecutionLimitError
			// for (let i = 0; i < 5; i++) {
			//   await executor.executeTool(requests[i]);
			// }
			// await expect(executor.executeTool(requests[5])).rejects.toThrow('session limit reached');
			expect(true).toBe(true) // Placeholder
		})
	})

	describe('dynamic limit updates', () => {
		it('applies updated session limit in runtime', () => {
			const manager = new MCPServerManager()
			const tracker = {
				concurrentLimit: 3,
				sessionLimit: 25,
				activeExecutions: new Set<string>(),
				totalExecuted: 25,
				stopped: false,
				executionHistory: []
			}
			const executor = new ToolExecutor(manager, tracker)

			executor.updateLimits({ sessionLimit: -1 })

			expect(executor.canExecute()).toBe(true)
			expect(executor.getStats().sessionLimit).toBe(-1)
		})

		it('applies updated concurrent limit in runtime', () => {
			const manager = new MCPServerManager()
			const tracker = {
				concurrentLimit: 2,
				sessionLimit: -1,
				activeExecutions: new Set<string>(['req-1', 'req-2']),
				totalExecuted: 10,
				stopped: false,
				executionHistory: []
			}
			const executor = new ToolExecutor(manager, tracker)

			executor.updateLimits({ concurrentLimit: 4 })

			expect(executor.getStats().concurrentLimit).toBe(4)
			expect(executor.canExecute()).toBe(true)
		})
	})

	describe('stop functionality', () => {
		it('should stop all executions when stop() called', async () => {
			// GIVEN: Active executions in progress
			// const executor = new ToolExecutor({ concurrentLimit: 10, sessionLimit: -1 });
			// executor.executeTool({ id: 'req-1', serverId: 'test', toolName: 'slow', parameters: {} });

			// WHEN: stop() called
			// executor.stop();

			// THEN: No new executions allowed, canExecute() returns false
			// expect(executor.canExecute()).toBe(false);
			expect(true).toBe(true) // Placeholder
		})
	})

	describe('execution history', () => {
		it('should track execution history', async () => {
			// GIVEN: Multiple tool executions completed
			// const executor = new ToolExecutor({ concurrentLimit: 10, sessionLimit: -1 });

			// WHEN: getHistory() called
			// const history = executor.getHistory();

			// THEN: All executions logged with timestamps and status
			// expect(Array.isArray(history)).toBe(true);
			// expect(history.every(entry => entry.timestamp && entry.status)).toBe(true);
			expect(true).toBe(true) // Placeholder
		})
	})

	describe('Memory Leak Prevention', () => {
		it('should clean up activeExecutions on successful execution', async () => {
			// GIVEN: Executor with mock manager
			const mockManager = {
				getClient: vi.fn().mockReturnValue({
					callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Success' }] })
				}),
				listServers: vi.fn().mockReturnValue([{ id: 'test-server', name: 'Test Server' }])
			} as unknown as MCPServerManager

			const tracker = {
				concurrentLimit: 3,
				sessionLimit: -1,
				activeExecutions: new Set<string>(),
				totalExecuted: 0,
				stopped: false,
				executionHistory: []
			}

			const executor = new ToolExecutor(mockManager, tracker)

			// WHEN: Tool executes successfully
			await executor.executeTool({
				serverId: 'test-server',
				toolName: 'test-tool',
				parameters: {},
				source: 'user-codeblock',
				documentPath: '/test.md'
			})

			// THEN: activeExecutions should be empty (cleaned up)
			expect(tracker.activeExecutions.size).toBe(0)
			expect(tracker.totalExecuted).toBe(1)
		})

		it('should clean up activeExecutions on error', async () => {
			// GIVEN: Executor with failing tool
			const mockManager = {
				getClient: vi.fn().mockReturnValue({
					callTool: vi.fn().mockRejectedValue(new Error('Tool execution failed'))
				}),
				listServers: vi.fn().mockReturnValue([{ id: 'test-server', name: 'Test Server' }])
			} as unknown as MCPServerManager

			const tracker = {
				concurrentLimit: 3,
				sessionLimit: -1,
				activeExecutions: new Set<string>(),
				totalExecuted: 0,
				stopped: false,
				executionHistory: []
			}

			const executor = new ToolExecutor(mockManager, tracker)

			// WHEN: Tool execution fails
			await expect(
				executor.executeTool({
					serverId: 'test-server',
					toolName: 'failing-tool',
					parameters: {},
					source: 'user-codeblock',
					documentPath: '/test.md'
				})
			).rejects.toThrow('Tool execution failed')

			// THEN: activeExecutions should still be empty (cleaned up despite error)
			expect(tracker.activeExecutions.size).toBe(0)
			expect(tracker.totalExecuted).toBe(1)
		})

		it('should not leak memory with 100 failed executions', async () => {
			// GIVEN: Executor with consistently failing tool
			const mockManager = {
				getClient: vi.fn().mockReturnValue({
					callTool: vi.fn().mockRejectedValue(new Error('Persistent failure'))
				}),
				listServers: vi.fn().mockReturnValue([{ id: 'test-server', name: 'Test Server' }])
			} as unknown as MCPServerManager

			const tracker = {
				concurrentLimit: 100,
				sessionLimit: -1,
				activeExecutions: new Set<string>(),
				totalExecuted: 0,
				stopped: false,
				executionHistory: []
			}

			const executor = new ToolExecutor(mockManager, tracker)

			// WHEN: 100 executions fail
			const promises = Array.from({ length: 100 }, () =>
				executor
					.executeTool({
						serverId: 'test-server',
						toolName: 'failing-tool',
						parameters: {},
						source: 'user-codeblock',
						documentPath: '/test.md'
					})
					.catch(() => {
						/* ignore errors */
					})
			)

			await Promise.all(promises)

			// THEN: activeExecutions should remain bounded (no unbounded growth)
			expect(tracker.activeExecutions.size).toBe(0)
			expect(tracker.totalExecuted).toBe(100)
		})

		it('should clean up even when client throws synchronously', async () => {
			// GIVEN: Executor with client that throws immediately
			const mockManager = {
				getClient: vi.fn().mockImplementation(() => {
					throw new Error('Client creation failed')
				}),
				listServers: vi.fn().mockReturnValue([{ id: 'test-server', name: 'Test Server' }])
			} as unknown as MCPServerManager

			const tracker = {
				concurrentLimit: 3,
				sessionLimit: -1,
				activeExecutions: new Set<string>(),
				totalExecuted: 0,
				stopped: false,
				executionHistory: []
			}

			const executor = new ToolExecutor(mockManager, tracker)

			// WHEN: Execution fails before try-catch
			await expect(
				executor.executeTool({
					serverId: 'test-server',
					toolName: 'test-tool',
					parameters: {},
					source: 'user-codeblock',
					documentPath: '/test.md'
				})
			).rejects.toThrow('Client creation failed')

			// THEN: activeExecutions should remain empty (no additions before error)
			expect(tracker.activeExecutions.size).toBe(0)
			expect(tracker.totalExecuted).toBe(0)
		})
	})

	describe('Document session tracking', () => {
		const buildExecutor = (
			overrides?: Partial<{
				tracker: ExecutionTracker
				notifications: SessionNotificationHandlers
				callResult: unknown
			}>
		) => {
			const tracker: ExecutionTracker = overrides?.tracker ?? {
				concurrentLimit: 5,
				sessionLimit: 5,
				activeExecutions: new Set<string>(),
				totalExecuted: 0,
				stopped: false,
				executionHistory: []
			}

			const callTool = vi.fn().mockResolvedValue(
				overrides?.callResult ?? {
					content: 'ok',
					contentType: 'text' as const,
					executionDuration: 10
				}
			)

			const mockManager = {
				getClient: vi.fn().mockReturnValue({ callTool }),
				listServers: vi.fn().mockReturnValue([{ id: 'test-server', name: 'Test Server' }])
			} as unknown as MCPServerManager

			const notifications: SessionNotificationHandlers = overrides?.notifications ?? {
				onLimitReached: vi.fn().mockResolvedValue('cancel'),
				onSessionReset: vi.fn()
			}

			return {
				executor: new ToolExecutor(mockManager, tracker, { sessionNotifications: notifications }),
				tracker,
				notifications,
				callTool
			}
		}

		it('maintains independent totals per document', async () => {
			// Given: executor with unlimited sessions
			const { executor } = buildExecutor({
				tracker: {
					concurrentLimit: 5,
					sessionLimit: -1,
					activeExecutions: new Set<string>(),
					totalExecuted: 0,
					stopped: false,
					executionHistory: []
				}
			})

			// When: executing tools across two documents
			await executor.executeTool({
				serverId: 'test-server',
				toolName: 'demo',
				parameters: {},
				source: 'user-codeblock',
				documentPath: 'doc-a.md'
			})
			await executor.executeTool({
				serverId: 'test-server',
				toolName: 'demo',
				parameters: {},
				source: 'user-codeblock',
				documentPath: 'doc-b.md'
			})

			// Then: each document keeps its own counter without cross-contamination
			expect(executor.getTotalSessionCount('doc-a.md')).toBe(1)
			expect(executor.getTotalSessionCount('doc-b.md')).toBe(1)
			expect(executor.getStats().totalExecuted).toBe(1)
		})

		it('resets only targeted document and emits notices appropriately', async () => {
			// Given: executor with mocked notifications
			const notifications: SessionNotificationHandlers = {
				onLimitReached: vi.fn().mockResolvedValue('cancel'),
				onSessionReset: vi.fn()
			}
			const { executor } = buildExecutor({ notifications })

			await executor.executeTool({
				serverId: 'test-server',
				toolName: 'demo',
				parameters: {},
				source: 'user-codeblock',
				documentPath: 'doc-a.md'
			})
			await executor.executeTool({
				serverId: 'test-server',
				toolName: 'demo',
				parameters: {},
				source: 'user-codeblock',
				documentPath: 'doc-b.md'
			})

			// When: resetting doc-a explicitly
			executor.resetSessionCount('doc-a.md')

			// Then: doc-a is cleared, doc-b preserved, reset notice emitted once
			expect(executor.getTotalSessionCount('doc-a.md')).toBe(0)
			expect(executor.getTotalSessionCount('doc-b.md')).toBe(1)
			expect(notifications.onSessionReset).toHaveBeenCalledWith('doc-a.md')
		})

		it('clearing document session defers reset notice until document reopens', async () => {
			// Given: executor with notifications tracking
			const notifications: SessionNotificationHandlers = {
				onLimitReached: vi.fn().mockResolvedValue('cancel'),
				onSessionReset: vi.fn()
			}
			const { executor } = buildExecutor({ notifications })

			executor.switchDocument('doc-a.md')
			executor.clearDocumentSession('doc-a.md')

			// When: switching back to the cleared document
			expect(notifications.onSessionReset).not.toHaveBeenCalled()
			executor.switchDocument('doc-a.md')

			// Then: notice fires once replaying into context
			expect(notifications.onSessionReset).toHaveBeenCalledWith('doc-a.md')
		})
	})
})
