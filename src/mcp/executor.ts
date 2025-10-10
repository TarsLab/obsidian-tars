/**
 * Tool Executor
 * Coordinates tool execution with tracking, limits, and error handling
 */

import type { StatusBarManager } from '../statusBarManager'
import { ExecutionLimitError } from './errors'
import type { MCPServerManager } from './managerMCPUse'
import type { ExecutionHistoryEntry, ExecutionTracker, ToolExecutionResult } from './types'

export interface DocumentSessionState {
	documentPath: string
	totalSessionCount: number
	lastAccessed: number
}

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

export interface SessionNotificationHandlers {
	onLimitReached: (documentPath: string, limit: number, current: number) => Promise<'continue' | 'cancel'>
	onSessionReset: (documentPath: string) => void
}

function createDefaultSessionNotifications(): SessionNotificationHandlers {
	return {
		onLimitReached: async () => 'cancel',
		onSessionReset: () => {}
	}
}

export interface ToolExecutorOptions {
	timeout?: number
	sessionNotifications?: SessionNotificationHandlers
}

export class ToolExecutor {
	private readonly manager: MCPServerManager
	private readonly tracker: ExecutionTracker
	private readonly options: ToolExecutorOptions
	private readonly activeControllers: Map<string, AbortController> = new Map()
	private statusBarManager?: StatusBarManager
	private readonly documentSessions = new Map<string, DocumentSessionState>()
	private currentDocumentPath?: string
	private readonly sessionNotifications: SessionNotificationHandlers
	private readonly documentsPendingResetNotice = new Set<string>()

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
		this.sessionNotifications = options.sessionNotifications ?? createDefaultSessionNotifications()
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
		const documentPath = this.normalizeDocumentPath(request.documentPath)
		let documentState = this.setCurrentDocument(documentPath)

		// Ensure execution is allowed for this document, prompting user when limit reached
		if (!this.canExecute(documentPath)) {
			if (this.isSessionLimitReached(documentPath)) {
				const decision = await this.sessionNotifications.onLimitReached(
					documentPath,
					this.tracker.sessionLimit,
					documentState.totalSessionCount
				)

				if (decision === 'continue') {
					this.resetDocumentSession(documentPath, { emitNotice: true })
					documentState = this.setCurrentDocument(documentPath)
				} else {
					throw new ExecutionLimitError('session', documentState.totalSessionCount, this.tracker.sessionLimit, {
						documentPath
					})
				}
			}

			if (!this.canExecute(documentPath)) {
				throw new ExecutionLimitError('session', documentState.totalSessionCount, this.tracker.sessionLimit, {
					documentPath
				})
			}
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
			const updatedCount = this.incrementSessionCount(documentPath)
			this.tracker.totalExecuted = updatedCount
			this.tracker.executionHistory.push(executionRecord)
		}
	}

	/**
	 * Check if tool execution is currently allowed
	 */
	canExecute(documentPath?: string): boolean {
		if (this.tracker.stopped) {
			return false
		}

		// Check concurrent limit
		if (this.tracker.activeExecutions.size >= this.tracker.concurrentLimit) {
			return false
		}

		// Check session limit
		if (!this.hasSessionCapacityFor(documentPath ?? this.currentDocumentPath)) {
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
		currentDocumentPath?: string
		documentSessions: DocumentSessionState[]
	} {
		return {
			activeExecutions: this.tracker.activeExecutions.size,
			totalExecuted: this.tracker.totalExecuted,
			sessionLimit: this.tracker.sessionLimit,
			concurrentLimit: this.tracker.concurrentLimit,
			stopped: this.tracker.stopped,
			currentDocumentPath: this.currentDocumentPath,
			documentSessions: Array.from(this.documentSessions.values()).map((session) => ({ ...session }))
		}
	}

	/**
	 * Update execution limits in response to settings changes
	 */
	updateLimits(limits: { concurrentLimit?: number; sessionLimit?: number }): void {
		if (
			typeof limits.concurrentLimit === 'number' &&
			Number.isFinite(limits.concurrentLimit) &&
			limits.concurrentLimit > 0
		) {
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
		this.documentSessions.clear()
		this.currentDocumentPath = undefined
		this.documentsPendingResetNotice.clear()
	}

	/**
	 * Get execution history
	 */
	getHistory(): ExecutionHistoryEntry[] {
		return [...this.tracker.executionHistory]
	}

	private hasSessionCapacityFor(documentPath?: string): boolean {
		if (this.tracker.sessionLimit === -1) {
			return true
		}

		if (!documentPath) {
			return this.tracker.totalExecuted < this.tracker.sessionLimit
		}

		return this.getDocumentSessionCount(documentPath) < this.tracker.sessionLimit
	}

	private isSessionLimitReached(documentPath: string): boolean {
		if (this.tracker.sessionLimit === -1) {
			return false
		}

		return this.getDocumentSessionCount(documentPath) >= this.tracker.sessionLimit
	}

	/**
	 * Get the session count for a specific document (Feature-900-50-5-1)
	 */
	getDocumentSessionCount(documentPath: string): number {
		const docState = this.documentSessions.get(documentPath)
		return docState?.totalSessionCount ?? 0
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

	private normalizeDocumentPath(documentPath: string): string {
		return documentPath && documentPath.trim().length > 0 ? documentPath : '__untitled__'
	}

	private ensureDocumentSession(documentPath: string): DocumentSessionState {
		let docState = this.documentSessions.get(documentPath)
		if (!docState) {
			docState = {
				documentPath,
				totalSessionCount: 0,
				lastAccessed: Date.now()
			}
			this.documentSessions.set(documentPath, docState)
		}
		docState.lastAccessed = Date.now()
		return docState
	}

	private setCurrentDocument(documentPath: string): DocumentSessionState {
		const existed = this.documentSessions.has(documentPath)
		const docState = this.ensureDocumentSession(documentPath)
		this.currentDocumentPath = documentPath
		this.tracker.totalExecuted = docState.totalSessionCount
		if (!existed && this.documentsPendingResetNotice.delete(documentPath)) {
			this.sessionNotifications.onSessionReset(documentPath)
		}
		return docState
	}

	private incrementSessionCount(documentPath: string): number {
		const docState = this.ensureDocumentSession(documentPath)
		docState.totalSessionCount += 1
		if (this.currentDocumentPath === documentPath) {
			this.tracker.totalExecuted = docState.totalSessionCount
		}
		return docState.totalSessionCount
	}

	private resetDocumentSession(documentPath: string, options: { emitNotice?: boolean } = {}): void {
		const docState = this.documentSessions.get(documentPath)
		if (docState) {
			docState.totalSessionCount = 0
			docState.lastAccessed = Date.now()
		}
		this.documentsPendingResetNotice.delete(documentPath)
		if (options.emitNotice) {
			this.sessionNotifications.onSessionReset(documentPath)
		}
		if (this.currentDocumentPath === documentPath) {
			this.tracker.totalExecuted = docState?.totalSessionCount ?? 0
		}
	}

	private removeDocumentSession(documentPath: string, options: { scheduleNotice?: boolean } = {}): void {
		const existed = this.documentSessions.delete(documentPath)
		if (options.scheduleNotice && existed) {
			this.documentsPendingResetNotice.add(documentPath)
		}
		if (this.currentDocumentPath === documentPath) {
			this.currentDocumentPath = undefined
			this.tracker.totalExecuted = 0
		}
	}

	// Public API for document session management (used by plugin lifecycle)
	public switchDocument(documentPath: string): void {
		const normalized = this.normalizeDocumentPath(documentPath)
		this.setCurrentDocument(normalized)
	}

	public clearDocumentSession(documentPath: string): void {
		const normalized = this.normalizeDocumentPath(documentPath)
		this.removeDocumentSession(normalized, { scheduleNotice: true })
	}

	public resetSessionCount(documentPath: string): void {
		const normalized = this.normalizeDocumentPath(documentPath)
		this.resetDocumentSession(normalized, { emitNotice: true })
	}

	public getTotalSessionCount(documentPath: string): number {
		const normalized = this.normalizeDocumentPath(documentPath)
		return this.documentSessions.get(normalized)?.totalSessionCount ?? 0
	}
}
