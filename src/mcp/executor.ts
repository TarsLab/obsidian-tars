/**
 * Tool Executor
 * Coordinates tool execution with tracking, limits, and error handling
 */

import type { StatusBarManager } from '../statusBarManager'
import { ExecutionLimitError } from './errors'
import type { MCPServerManager } from './managerMCPUse'
import type { ExecutionHistoryEntry, ExecutionTracker, ToolExecutionResult } from './types'

export interface ToolExecutionRequest {
	serverId: string
	toolName: string
	parameters: Record<string, unknown>
	source: 'user-codeblock' | 'ai-autonomous'
	documentPath: string
	sectionLine?: number
	signal?: AbortSignal
}

export interface ToolExecutionResultWithId extends ToolExecutionResult {
	requestId: string
}

export interface ToolExecutorOptions {
	timeout?: number
}

export class ToolExecutor {
	private readonly manager: MCPServerManager
	private readonly tracker: ExecutionTracker
	private readonly options: ToolExecutorOptions
	private readonly activeControllers: Map<string, AbortController> = new Map()
	private statusBarManager?: StatusBarManager

	constructor(
		manager: MCPServerManager,
		tracker: ExecutionTracker,
		options: ToolExecutorOptions = {},
		statusBarManager?: StatusBarManager
	) {
		this.manager = manager
		this.tracker = tracker
		this.options = { timeout: 30000, ...options }
		this.statusBarManager = statusBarManager
	}

	/**
	 * Execute a tool request with all checks and tracking
	 */
	async executeTool(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
		const result = await this.executeToolInternal(request)
		return result
	}

	/**
	 * Execute a tool request and return result with request ID for cancellation
	 */
	async executeToolWithId(request: ToolExecutionRequest): Promise<ToolExecutionResultWithId> {
		const result = await this.executeToolInternal(request)
		const history = this.getHistory()
		const latestEntry = history[history.length - 1]
		return {
			...result,
			requestId: latestEntry?.requestId || ''
		}
	}

	/**
	 * Internal tool execution logic
	 */
	private async executeToolInternal(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
		// Check if execution is allowed
		if (!this.canExecute()) {
			throw new ExecutionLimitError('session', this.tracker.totalExecuted, this.tracker.sessionLimit)
		}

		// Get MCP client
		const client = this.manager.getClient(request.serverId)
		if (!client) {
			throw new Error(`No client available for server ${request.serverId}`)
		}

		// Create execution record
		const executionRecord = this.createExecutionRecord(request)

		// Create AbortController if no signal provided
		const controller = request.signal ? null : new AbortController()
		const signal = request.signal || controller?.signal

		try {
			// Update tracker
			this.tracker.activeExecutions.add(executionRecord.requestId)

			// Store controller for cancellation support
			if (controller) {
				this.activeControllers.set(executionRecord.requestId, controller)
			}

			// Check for immediate cancellation
			if (signal?.aborted) {
				throw new Error('Tool execution was cancelled')
			}

			// Execute tool with abort signal support
			const result = await this.executeWithAbort(
				() => client.callTool(request.toolName, request.parameters, this.options.timeout),
				signal
			)

			// Update record with success
			executionRecord.duration = Date.now() - executionRecord.timestamp
			executionRecord.status = 'success'

			return result
		} catch (error) {
			// Handle cancellation
			if (signal?.aborted) {
				executionRecord.status = 'cancelled'
				executionRecord.errorMessage = 'Tool execution was cancelled'
			} else {
				// Update record with failure
				executionRecord.duration = Date.now() - executionRecord.timestamp
				executionRecord.status = 'error'
				executionRecord.errorMessage = error instanceof Error ? error.message : String(error)

				// Log to status bar error buffer with sanitized context
				this.statusBarManager?.logError('tool', `Tool execution failed: ${request.toolName}`, error as Error, {
					serverId: request.serverId,
					serverName: executionRecord.serverName,
					toolName: request.toolName,
					source: request.source,
					documentPath: request.documentPath,
					// Sanitize parameters - don't include sensitive data
					parameterKeys: Object.keys(request.parameters)
				})
			}

			throw error
		} finally {
			// Clean up
			this.tracker.activeExecutions.delete(executionRecord.requestId)
			this.activeControllers.delete(executionRecord.requestId)
			this.tracker.totalExecuted++
			this.tracker.executionHistory.push(executionRecord)
		}
	}

	/**
	 * Check if tool execution is currently allowed
	 */
	canExecute(): boolean {
		if (this.tracker.stopped) {
			return false
		}

		// Check concurrent limit
		if (this.tracker.activeExecutions.size >= this.tracker.concurrentLimit) {
			return false
		}

		// Check session limit
		if (this.tracker.sessionLimit !== -1 && this.tracker.totalExecuted >= this.tracker.sessionLimit) {
			return false
		}

		return true
	}

	/**
	 * Get current execution statistics
	 */
	getStats(): {
		activeExecutions: number
		totalExecuted: number
		sessionLimit: number
		concurrentLimit: number
		stopped: boolean
	} {
		return {
			activeExecutions: this.tracker.activeExecutions.size,
			totalExecuted: this.tracker.totalExecuted,
			sessionLimit: this.tracker.sessionLimit,
			concurrentLimit: this.tracker.concurrentLimit,
			stopped: this.tracker.stopped
		}
	}

	/**
	 * Update execution limits in response to settings changes
	 */
	updateLimits(limits: { concurrentLimit?: number; sessionLimit?: number }): void {
		if (typeof limits.concurrentLimit === 'number' && Number.isFinite(limits.concurrentLimit) && limits.concurrentLimit > 0) {
			this.tracker.concurrentLimit = limits.concurrentLimit
		}

		if (typeof limits.sessionLimit === 'number' && Number.isFinite(limits.sessionLimit) && limits.sessionLimit >= -1) {
			this.tracker.sessionLimit = limits.sessionLimit
		}
	}

	/**
	 * Stop all future executions
	 */
	stop(): void {
		this.tracker.stopped = true
	}

	/**
	 * Reset stopped flag and clear session counters
	 */
	reset(): void {
		this.tracker.stopped = false
		this.tracker.totalExecuted = 0
		this.tracker.executionHistory = []
	}

	/**
	 * Get execution history
	 */
	getHistory(): ExecutionHistoryEntry[] {
		return [...this.tracker.executionHistory]
	}

	/**
	 * Execute a function with abort signal support
	 */
	private async executeWithAbort<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
		if (!signal) {
			return fn()
		}

		return new Promise<T>((resolve, reject) => {
			const abortHandler = () => {
				reject(new Error('Tool execution was cancelled'))
			}

			signal.addEventListener('abort', abortHandler, { once: true })

			fn()
				.then((result) => {
					signal.removeEventListener('abort', abortHandler)
					resolve(result)
				})
				.catch((error) => {
					signal.removeEventListener('abort', abortHandler)
					reject(error)
				})
		})
	}

	/**
	 * Cancel a pending execution (if supported by underlying client)
	 */
	async cancelExecution(requestId: string): Promise<void> {
		// Abort the execution if controller exists
		const controller = this.activeControllers.get(requestId)
		if (controller) {
			controller.abort()
			this.activeControllers.delete(requestId)
		}

		// Remove from active executions
		this.tracker.activeExecutions.delete(requestId)
	}

	/**
	 * Create execution history record
	 */
	private createExecutionRecord(request: ToolExecutionRequest): ExecutionHistoryEntry {
		const serverConfig = this.manager.listServers().find((s) => s.id === request.serverId)

		return {
			requestId: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
			serverId: request.serverId,
			serverName: serverConfig?.name || 'unknown',
			toolName: request.toolName,
			timestamp: Date.now(),
			duration: 0,
			status: 'pending' as const
		}
	}
}
