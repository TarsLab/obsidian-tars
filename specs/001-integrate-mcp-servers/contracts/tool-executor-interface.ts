/**
 * Contract: Tool Executor Interface
 *
 * Coordinates tool execution with tracking, limits, and error handling.
 * Acts as facade between code block processor / AI providers and MCP clients.
 */

export interface ToolExecutor {
	/**
	 * Execute a tool request.
	 * Enforces concurrent/session limits, creates request record, handles retries.
	 *
	 * @param request - Tool invocation request details
	 * @returns Promise resolving to execution result
	 * @throws ExecutionLimitError if concurrent or session limit reached
	 * @throws ServerNotAvailableError if target server disabled or not running
	 * @throws ToolExecutionError if execution fails after retries
	 */
	executeTool(request: {
		serverId: string
		toolName: string
		parameters: Record<string, unknown>
		source: 'user-codeblock' | 'ai-autonomous'
		documentPath: string
		sectionLine?: number
	}): Promise<ToolExecutionResult>

	/**
	 * Check if tool execution is currently allowed.
	 * Checks stopped flag, session limit, concurrent limit.
	 *
	 * @returns Boolean indicating if new execution can proceed
	 */
	canExecute(documentPath?: string): boolean

	/**
	 * Get current execution statistics.
	 */
	getStats(): {
		activeExecutions: number
		totalExecuted: number
		sessionLimit: number
		concurrentLimit: number
		stopped: boolean
		currentDocumentPath?: string
		documentSessions: {
			documentPath: string
			totalSessionCount: number
			lastAccessed: number
		}[]
	}

	/**
	 * Switch active document context (updates session counting scope).
	 */
	switchDocument(documentPath: string): void

	/**
	 * Clear session state for a document (when file deleted/closed).
	 */
	clearDocumentSession(documentPath: string): void

	/**
	 * Reset session counter for a specific document.
	 */
	resetSessionCount(documentPath: string): void

	/**
	 * Retrieve total session count for specified document.
	 */
	getTotalSessionCount(documentPath: string): number

	/**
	 * Stop all future executions until reset.
	 * User-triggered stop via command.
	 */
	stop(): void

	/**
	 * Reset stopped flag and clear session counters.
	 * Called when user manually resets or plugin reloads.
	 */
	reset(): void

	/**
	 * Get execution history for current session.
	 * Used for debugging and transparency.
	 */
	getHistory(): ExecutionHistoryEntry[]

	/**
	 * Cancel a pending or executing request.
	 *
	 * @param requestId - Request ID to cancel
	 */
	cancelExecution(requestId: string): Promise<void>
}

export interface ExecutionHistoryEntry {
	requestId: string
	serverId: string
	serverName: string
	toolName: string
	timestamp: number
	duration: number
	status: 'success' | 'error' | 'timeout' | 'cancelled'
	errorMessage?: string
}
