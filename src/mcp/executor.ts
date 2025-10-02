/**
 * Tool Executor
 * Coordinates tool execution with tracking, limits, and error handling
 */

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
}

export class ToolExecutor {
	private readonly manager: MCPServerManager
	private readonly tracker: ExecutionTracker

	constructor(manager: MCPServerManager, tracker: ExecutionTracker) {
		this.manager = manager
		this.tracker = tracker
	}

	/**
	 * Execute a tool request with all checks and tracking
	 */
	async executeTool(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
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

		try {
			// Update tracker
			this.tracker.activeExecutions.add(executionRecord.requestId)

			// Execute tool
			const result = await client.callTool(
				request.toolName,
				request.parameters,
				30000 // 30 second timeout
			)

			// Update record with success
			executionRecord.duration = Date.now() - executionRecord.timestamp
			executionRecord.status = 'success'

			return result
		} catch (error) {
			// Update record with failure
			executionRecord.duration = Date.now() - executionRecord.timestamp
			executionRecord.status = 'error'
			executionRecord.errorMessage = error instanceof Error ? error.message : String(error)

			throw error
		} finally {
			// Clean up
			this.tracker.activeExecutions.delete(executionRecord.requestId)
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
	 * Cancel a pending execution (if supported by underlying client)
	 */
	async cancelExecution(requestId: string): Promise<void> {
		// For now, just remove from active executions
		// In future, could implement proper cancellation tokens
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
