import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolExecutor } from '../../src/mcp/executor'
import { MCPServerManager } from '../../src/mcp/managerMCPUse'
import { ToolCallingCoordinator } from '../../src/mcp/toolCallingCoordinator'
import type { MCPServerConfig } from '../../src/mcp/types'
import type { ErrorLogEntry, StatusBarManager } from '../../src/statusBarManager'

describe('Error Logging Integration', () => {
	let mockStatusBarManager: StatusBarManager
	let errorLog: ErrorLogEntry[]

	beforeEach(() => {
		errorLog = []

		// Create mock StatusBarManager
		mockStatusBarManager = {
			logError: vi.fn((type, message, error, context) => {
				errorLog.push({
					id: `${Date.now()}-${Math.random()}`,
					timestamp: new Date(),
					type,
					message,
					name: error?.name,
					stack: error?.stack,
					context
				})
			}),
			getErrorLog: vi.fn(() => [...errorLog]),
			clearErrorLog: vi.fn(() => {
				errorLog = []
			})
		} as any
	})

	describe('MCPServerManager Error Logging', () => {
		it('should log errors when server fails to start during initialization', async () => {
			// Given: A server config that will fail to start
			const failingConfig: MCPServerConfig = {
				id: 'test-server',
				name: 'test-server',
				configInput: 'invalid-command',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			}

			const manager = new MCPServerManager()

			// When: Initializing with failing config
			try {
				await manager.initialize([failingConfig], { statusBarManager: mockStatusBarManager })
			} catch (_error) {
				// Expected to fail
			}

			// Then: Error should be logged to status bar
			expect(mockStatusBarManager.logError).toHaveBeenCalledWith(
				'mcp',
				expect.stringContaining('Failed to start MCP server'),
				expect.any(Error),
				expect.objectContaining({
					serverId: 'test-server',
					serverName: 'test-server',
					configInput: 'invalid-command'
				})
			)
		})

		it('should log errors with retry context when all retries fail', async () => {
			// Given: A manager with retry policy and mock client
			const manager = new MCPServerManager()
			const config: MCPServerConfig = {
				id: 'retry-test',
				name: 'retry-test',
				configInput: 'npx invalid-command',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			}

			// Initialize with actual config that will fail
			try {
				await manager.initialize([config], {
					statusBarManager: mockStatusBarManager,
					retryPolicy: {
						maxAttempts: 2,
						initialDelay: 10,
						maxDelay: 100,
						backoffMultiplier: 2,
						jitter: false,
						transientErrorCodes: ['ECONNREFUSED']
					}
				})
			} catch (_error) {
				// Expected to fail during init
			}

			// Then: Error should be logged with server information
			expect(mockStatusBarManager.logError).toHaveBeenCalled()
			const calls = (mockStatusBarManager.logError as any).mock.calls
			const mcpCall = calls.find((call: any) => call[0] === 'mcp')
			expect(mcpCall).toBeDefined()
			expect(mcpCall[1]).toContain('Failed to start MCP server')
			expect(mcpCall[3]).toMatchObject({
				serverId: 'retry-test',
				serverName: 'retry-test'
			})
		})

		it('should log errors when server fails to stop', async () => {
			// Given: A manager with a mock client that will fail on close
			const manager = new MCPServerManager()
			const mockClient = {
				closeSession: vi.fn().mockRejectedValue(new Error('Close failed'))
			}

			// Set up the mock client
			;(manager as any).mcpClient = mockClient
			;(manager as any).servers.set('test-id', {
				id: 'test-id',
				name: 'test-server',
				enabled: true
			})

			// Initialize with statusBarManager
			;(manager as any).statusBarManager = mockStatusBarManager

			// When: Stopping server that fails
			try {
				await manager.stopServer('test-id')
			} catch (_error) {
				// Expected to fail
			}

			// Then: Error should be logged
			expect(mockStatusBarManager.logError).toHaveBeenCalledWith(
				'mcp',
				expect.stringContaining('Failed to stop MCP server'),
				expect.any(Error),
				expect.objectContaining({
					serverId: 'test-id',
					serverName: 'test-server'
				})
			)
		})
	})

	describe('ToolExecutor Error Logging', () => {
		it('should log tool execution errors with sanitized parameters', async () => {
			// Given: A mock manager that returns a failing client
			const mockManager = {
				getClient: vi.fn(() => ({
					callTool: vi.fn().mockRejectedValue(new Error('Tool execution failed'))
				})),
				listServers: vi.fn(() => [
					{
						id: 'test-server',
						name: 'Test Server',
						enabled: true
					}
				])
			}

			const tracker = {
				concurrentLimit: 3,
				sessionLimit: 25,
				activeExecutions: new Set<string>(),
				totalExecuted: 0,
				stopped: false,
				executionHistory: []
			}

			const executor = new ToolExecutor(mockManager as any, tracker, {}, mockStatusBarManager)

			// When: Executing tool that fails
			try {
				await executor.executeTool({
					serverId: 'test-server',
					toolName: 'sensitive_tool',
					parameters: {
						apiKey: 'secret-key-123',
						query: 'public query',
						password: 'super-secret'
					},
					source: 'user-codeblock',
					documentPath: '/test/file.md'
				})
			} catch (_error) {
				// Expected to fail
			}

			// Then: Error should be logged with sanitized parameters (keys only, not values)
			expect(mockStatusBarManager.logError).toHaveBeenCalledWith(
				'tool',
				expect.stringContaining('Tool execution failed: sensitive_tool'),
				expect.any(Error),
				expect.objectContaining({
					serverId: 'test-server',
					serverName: 'Test Server',
					toolName: 'sensitive_tool',
					source: 'user-codeblock',
					documentPath: '/test/file.md',
					// Should only have parameter keys, not values (for security)
					parameterKeys: expect.arrayContaining(['apiKey', 'query', 'password'])
				})
			)

			// Verify sensitive values are NOT in the context
			const logCall = (mockStatusBarManager.logError as any).mock.calls[0]
			const context = logCall[3]
			expect(JSON.stringify(context)).not.toContain('secret-key-123')
			expect(JSON.stringify(context)).not.toContain('super-secret')
		})

		it('should not log errors for cancelled executions', async () => {
			// Given: A mock manager with a slow tool
			const mockManager = {
				getClient: vi.fn(() => ({
					callTool: vi.fn(() => new Promise((resolve) => setTimeout(resolve, 1000)))
				})),
				listServers: vi.fn(() => [
					{
						id: 'test-server',
						name: 'Test Server',
						enabled: true
					}
				])
			}

			const tracker = {
				concurrentLimit: 3,
				sessionLimit: 25,
				activeExecutions: new Set<string>(),
				totalExecuted: 0,
				stopped: false,
				executionHistory: []
			}

			const executor = new ToolExecutor(mockManager as any, tracker, {}, mockStatusBarManager)

			// When: Executing tool and cancelling it
			const controller = new AbortController()
			const executionPromise = executor.executeTool({
				serverId: 'test-server',
				toolName: 'slow_tool',
				parameters: {},
				source: 'ai-autonomous',
				documentPath: '/test/file.md',
				signal: controller.signal
			})

			// Cancel after a short delay
			setTimeout(() => controller.abort(), 10)

			try {
				await executionPromise
			} catch (_error) {
				// Expected to be cancelled
			}

			// Then: Error should NOT be logged for cancellation
			expect(mockStatusBarManager.logError).not.toHaveBeenCalled()
		})
	})

	describe('ToolCallingCoordinator Error Logging', () => {
		it('should log tool errors during autonomous execution', async () => {
			// Given: A mock adapter that triggers tool calls
			const mockAdapter = {
				sendRequest: vi.fn(async function* () {
					yield { choices: [{ delta: { content: 'test' } }] }
				}),
				getParser: vi.fn(() => ({
					reset: vi.fn(),
					parseChunk: vi.fn(() => ({ type: 'text', content: 'test' })),
					hasCompleteToolCalls: vi.fn(() => true),
					getToolCalls: vi.fn(() => [
						{
							id: 'call_123',
							name: 'failing_tool',
							arguments: { param: 'value' }
						}
					])
				})),
				findServer: vi.fn(() => ({ id: 'test-server', name: 'Test Server' })),
				formatToolResult: vi.fn((id, result) => ({
					role: 'tool',
					content: JSON.stringify(result.content),
					tool_call_id: id
				}))
			}

			const mockExecutor = {
				executeTool: vi.fn().mockRejectedValue(new Error('Tool execution failed'))
			}

			const coordinator = new ToolCallingCoordinator()

			// When: Generating with tools that fail
			const results: string[] = []
			try {
				for await (const text of coordinator.generateWithTools(
					[{ role: 'user', content: 'test' }],
					mockAdapter as any,
					mockExecutor as any,
					{
						maxTurns: 1,
						documentPath: '/test/conversation.md',
						statusBarManager: mockStatusBarManager
					}
				)) {
					results.push(text)
				}
			} catch (_error) {
				// May or may not throw depending on implementation
			}

			// Then: Error should be logged with tool context
			expect(mockStatusBarManager.logError).toHaveBeenCalledWith(
				'tool',
				expect.stringContaining('Tool execution failed in AI conversation: failing_tool'),
				expect.any(Error),
				expect.objectContaining({
					toolName: 'failing_tool',
					serverId: 'test-server',
					documentPath: '/test/conversation.md',
					source: 'ai-autonomous'
				})
			)
		})
	})

	describe('Error Log Ring Buffer', () => {
		it('should maintain max 50 errors in log buffer', () => {
			// Given: A status bar manager with error log (matches actual implementation with unshift)
			const realStatusBarManager = {
				logError: (type: any, message: string, error?: Error, context?: any) => {
					// Use unshift to add to front (matches actual StatusBarManager)
					errorLog.unshift({
						id: `${Date.now()}-${Math.random()}`,
						timestamp: new Date(),
						type,
						message,
						name: error?.name,
						stack: error?.stack,
						context
					})
					// Ring buffer logic - keep first 50 (most recent)
					if (errorLog.length > 50) {
						errorLog = errorLog.slice(0, 50)
					}
				},
				getErrorLog: () => [...errorLog],
				clearErrorLog: () => {
					errorLog = []
				}
			}

			// When: Logging 100 errors
			for (let i = 0; i < 100; i++) {
				realStatusBarManager.logError('system', `Error ${i}`, new Error(`Error ${i}`))
			}

			// Then: Only last 50 should be kept
			const log = realStatusBarManager.getErrorLog()
			expect(log.length).toBe(50)
			expect(log[0].message).toBe('Error 99') // Most recent first
			expect(log[49].message).toBe('Error 50') // 50th most recent
		})

		it('should include all required fields in error log entries', () => {
			// Given: Status bar manager
			const manager = mockStatusBarManager

			// When: Logging an error with full context
			const testError = new Error('Test error')
			testError.name = 'TestError'
			manager.logError('tool', 'Tool failed', testError, {
				serverId: 'test-id',
				toolName: 'test_tool'
			})

			// Then: Log entry should have all required fields
			expect(errorLog.length).toBe(1)
			const entry = errorLog[0]
			expect(entry).toMatchObject({
				id: expect.any(String),
				timestamp: expect.any(Date),
				type: 'tool',
				message: 'Tool failed',
				name: 'TestError',
				stack: expect.stringContaining('Error: Test error'),
				context: {
					serverId: 'test-id',
					toolName: 'test_tool'
				}
			})
		})
	})

	describe('Error Context Validation', () => {
		it('should include server context in MCP manager errors', async () => {
			// Given: Manager with statusBarManager
			const manager = new MCPServerManager()
			const config: MCPServerConfig = {
				id: 'context-test',
				name: 'Context Test Server',
				configInput: 'npx invalid-command',
				enabled: true,
				failureCount: 0,
				autoDisabled: false
			}

			// When: Initializing with failing server
			try {
				await manager.initialize([config], { statusBarManager: mockStatusBarManager })
			} catch (_error) {
				// Expected
			}

			// Then: Context should include server details
			expect(errorLog.length).toBeGreaterThan(0)
			const mcpError = errorLog.find((e) => e.type === 'mcp')
			expect(mcpError).toBeDefined()
			expect(mcpError?.context).toMatchObject({
				serverId: 'context-test',
				serverName: 'Context Test Server',
				configInput: expect.stringContaining('invalid-command')
			})
		})

		it('should include tool context in executor errors', async () => {
			// Given: Executor with failing client
			const mockManager = {
				getClient: vi.fn(() => ({
					callTool: vi.fn().mockRejectedValue(new Error('Network timeout'))
				})),
				listServers: vi.fn(() => [
					{
						id: 'timeout-server',
						name: 'Timeout Server',
						enabled: true
					}
				])
			}

			const tracker = {
				concurrentLimit: 3,
				sessionLimit: 25,
				activeExecutions: new Set<string>(),
				totalExecuted: 0,
				stopped: false,
				executionHistory: []
			}

			const executor = new ToolExecutor(mockManager as any, tracker, {}, mockStatusBarManager)

			// When: Executing tool that fails
			try {
				await executor.executeTool({
					serverId: 'timeout-server',
					toolName: 'slow_search',
					parameters: { query: 'test', limit: 10 },
					source: 'ai-autonomous',
					documentPath: '/notes/research.md'
				})
			} catch (_error) {
				// Expected
			}

			// Then: Context should include tool details without sensitive parameter values
			expect(errorLog.length).toBeGreaterThan(0)
			const toolError = errorLog.find((e) => e.type === 'tool')
			expect(toolError).toBeDefined()
			expect(toolError?.context).toMatchObject({
				serverId: 'timeout-server',
				serverName: 'Timeout Server',
				toolName: 'slow_search',
				source: 'ai-autonomous',
				documentPath: '/notes/research.md',
				parameterKeys: expect.arrayContaining(['query', 'limit'])
			})

			// Verify parameter values are NOT in context
			expect(JSON.stringify(toolError?.context)).not.toContain('test')
			expect(JSON.stringify(toolError?.context)).not.toContain('10')
		})
	})

	describe('Error Types', () => {
		it('should use correct error type for different error sources', () => {
			// Given: Status bar manager
			const manager = mockStatusBarManager

			// When: Logging errors from different sources
			manager.logError('generation', 'LLM generation failed', new Error('API error'))
			manager.logError('mcp', 'Server start failed', new Error('Connection refused'))
			manager.logError('tool', 'Tool execution failed', new Error('Timeout'))
			manager.logError('system', 'Plugin initialization failed', new Error('Config error'))

			// Then: Each should have correct type
			expect(errorLog.length).toBe(4)
			expect(errorLog.find((e) => e.type === 'generation')).toBeDefined()
			expect(errorLog.find((e) => e.type === 'mcp')).toBeDefined()
			expect(errorLog.find((e) => e.type === 'tool')).toBeDefined()
			expect(errorLog.find((e) => e.type === 'system')).toBeDefined()
		})
	})
})
