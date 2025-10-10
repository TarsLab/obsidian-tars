import { type App, Modal, Notice, Platform } from 'obsidian'
import { t } from './lang/helper'

export type StatusBarType = 'idle' | 'generating' | 'success' | 'error'

export interface StatusBarContent {
	text: string
	tooltip: string
}

export interface StatusBarState {
	type: StatusBarType
	content: StatusBarContent
	data?: GenerationStats | ErrorInfo
	mcpStatus?: MCPStatusInfo
	timestamp: Date
}

export interface GenerationStats {
	round: number
	characters: number
	duration: string
	model: string
	vendor: string
	startTime: Date
	endTime: Date
}

export interface ErrorInfo {
	message: string
	name?: string
	stack?: string
	timestamp: Date
}

export type ErrorLogType = 'generation' | 'mcp' | 'tool' | 'system'

export interface ErrorLogEntry {
	id: string
	timestamp: Date
	type: ErrorLogType
	message: string
	name?: string
	stack?: string
	context?: Record<string, any>
}

export interface MCPStatusInfo {
	runningServers: number
	totalServers: number
	availableTools: number
	retryingServers: number
	failedServers?: number
	activeExecutions?: number
	currentDocumentSessions?: number
	sessionLimit?: number
	servers: Array<{
		id: string
		name: string
		enabled: boolean
		isConnected: boolean
		toolCount: number
		isRetrying?: boolean
		retryAttempt?: number
		nextRetryAt?: number
	}>
}

class MCPStatusModal extends Modal {
	private readonly tabButtons: Partial<Record<'mcp' | 'errors', HTMLButtonElement>> = {}
	private readonly panels: Partial<Record<'mcp' | 'errors', HTMLElement>> = {}
	private activeTab: 'mcp' | 'errors'

	constructor(
		app: App,
		private mcpStatus: MCPStatusInfo,
		private errorLog: ErrorLogEntry[] = [],
		private onClearLogs?: () => void,
		private onRemoveLog?: (id: string) => void,
		private currentError?: ErrorInfo,
		private onRefresh?: (updateStatus: (message: string) => void) => Promise<void>
	) {
		super(app)
		this.activeTab = currentError ? 'errors' : 'mcp'
	}

	onOpen() {
		const { contentEl } = this
		contentEl.empty()
		contentEl.addClass('diagnostics-modal')
		contentEl.addClass('mcp-status-modal')

		const hasErrorData = this.errorLog.length > 0 || !!this.currentError

		if (hasErrorData) {
			this.renderTabButtons(contentEl)
		} else {
			contentEl.createEl('h2', { text: 'MCP Server Status' })
		}

		const panelsContainer = contentEl.createDiv({ cls: 'diagnostics-panels' })
		this.panels.mcp = panelsContainer.createDiv({
			cls: 'diagnostics-panel',
			attr: { 'data-panel': 'mcp' }
		})
		this.renderMcpPanel(this.panels.mcp)

		if (hasErrorData) {
			this.panels.errors = panelsContainer.createDiv({
				cls: 'diagnostics-panel',
				attr: { 'data-panel': 'errors' }
			})
			new ErrorDetailView(this.panels.errors, {
				currentError: this.currentError,
				errorLog: this.errorLog,
				onClearLogs: () => this.handleClearLogs(),
				onRemoveLog: (id) => this.handleRemoveLog(id)
			})
		}

		this.setActiveTab(hasErrorData ? this.activeTab : 'mcp')
	}

	private renderTabButtons(container: HTMLElement) {
		const tabBar = container.createDiv({ cls: 'diagnostics-tab-bar' })
		this.tabButtons.mcp = tabBar.createEl('button', {
			text: 'MCP Server Status',
			cls: 'diagnostics-tab-button'
		})
		this.tabButtons.mcp.onclick = () => this.setActiveTab('mcp')

		this.tabButtons.errors = tabBar.createEl('button', {
			text: 'Error Details',
			cls: 'diagnostics-tab-button'
		})
		this.tabButtons.errors.onclick = () => this.setActiveTab('errors')
	}

	private renderMcpPanel(panel?: HTMLElement) {
		if (!panel) return

		// Add header with refresh button (Feature-400-30-10, Feature-900-50-5-2)
		const header = panel.createDiv({ cls: 'mcp-panel-header' })
		header.createEl('h2', { text: 'MCP Server Status' })
		if (this.onRefresh) {
			const refreshBtn = header.createEl('button', {
				text: '🔄 Refresh',
				cls: 'mcp-refresh-button'
			})

			// Status indicator for multi-phase restart (Feature-900-50-5-2)
			const statusIndicator = header.createDiv({ cls: 'mcp-refresh-status' })
			statusIndicator.style.display = 'none'

			refreshBtn.onclick = async () => {
				refreshBtn.disabled = true
				statusIndicator.style.display = ''
				try {
					// Pass status update callback to refresh handler
					await this.onRefresh?.((message: string) => {
						statusIndicator.textContent = message
					})
					// Re-render the panel with updated data
					panel.empty()
					this.renderMcpPanel(panel)
				} catch (error) {
					statusIndicator.textContent = `❌ Error: ${error instanceof Error ? error.message : String(error)}`
					statusIndicator.classList.add('mcp-refresh-error')
					setTimeout(() => {
						statusIndicator.style.display = 'none'
						statusIndicator.classList.remove('mcp-refresh-error')
					}, 3000)
				} finally {
					refreshBtn.disabled = false
					if (!statusIndicator.classList.contains('mcp-refresh-error')) {
						statusIndicator.style.display = 'none'
					}
				}
			}
		}

		const statusContainer = panel.createDiv({ cls: 'mcp-status-modal' })

		// Summary with execution statistics (Feature-400-30-10)
		const summary = statusContainer.createDiv({ cls: 'mcp-summary' })
		summary.createEl('p', {
			text: `Running: ${this.mcpStatus.runningServers} / ${this.mcpStatus.totalServers} servers`
		})
		if (this.mcpStatus.activeExecutions !== undefined && this.mcpStatus.activeExecutions > 0) {
			summary.createEl('p', {
				text: `Active Executions: ${this.mcpStatus.activeExecutions}`,
				cls: 'mcp-active'
			})
		}
		// Document session count display (Feature-900-50-5-1)
		if (
			this.mcpStatus.currentDocumentSessions !== undefined &&
			this.mcpStatus.sessionLimit !== undefined &&
			this.mcpStatus.sessionLimit > 0
		) {
			const sessions = this.mcpStatus.currentDocumentSessions
			const limit = this.mcpStatus.sessionLimit
			const percentage = (sessions / limit) * 100
			let cls = 'mcp-sessions'
			let icon = '📊'
			if (percentage >= 100) {
				cls = 'mcp-sessions-critical'
				icon = '🔴'
			} else if (percentage >= 80) {
				cls = 'mcp-sessions-warning'
				icon = '⚠️'
			}
			summary.createEl('p', {
				text: `${icon} Document Sessions: ${sessions} / ${limit}`,
				cls
			})
		}
		if (this.mcpStatus.retryingServers > 0) {
			summary.createEl('p', {
				text: `Retrying: ${this.mcpStatus.retryingServers} servers`,
				cls: 'mcp-retrying'
			})
		}
		if (this.mcpStatus.failedServers !== undefined && this.mcpStatus.failedServers > 0) {
			summary.createEl('p', {
				text: `Failed: ${this.mcpStatus.failedServers} servers`,
				cls: 'mcp-failed'
			})
		}
		summary.createEl('p', {
			text: `Available Tools: ${this.mcpStatus.availableTools}`
		})

		if (this.mcpStatus.servers.length > 0) {
			statusContainer.createEl('h3', { text: 'Servers', cls: 'mcp-servers-heading' })
			const serverList = statusContainer.createDiv({ cls: 'mcp-server-list' })
			for (const server of this.mcpStatus.servers) {
				const serverItem = serverList.createDiv({ cls: 'mcp-server-item' })

				let statusIcon = server.isConnected ? '✅' : server.enabled ? '🔴' : '⚪'
				let statusText = server.isConnected ? 'Connected' : server.enabled ? 'Disconnected' : 'Disabled'

				if (server.isRetrying) {
					statusIcon = '🔄'
					statusText = `Retrying (attempt ${server.retryAttempt || 0})`
					if (server.nextRetryAt) {
						const nextRetryIn = Math.max(0, Math.round((server.nextRetryAt - Date.now()) / 1000))
						statusText += ` in ${nextRetryIn}s`
					}
				}

				serverItem.createEl('div', {
					text: `${statusIcon} ${server.name} | Tools: ${server.toolCount} | Status: ${statusText}`,
					cls: 'mcp-server-name'
				})
			}
		}
	}

	private setActiveTab(tab: 'mcp' | 'errors') {
		this.activeTab = tab
		for (const key of ['mcp', 'errors'] as const) {
			const button = this.tabButtons[key]
			const panel = this.panels[key]
			if (button) {
				button.classList.toggle('is-active', key === tab)
			}
			if (panel) {
				panel.style.display = key === tab ? '' : 'none'
			}
		}
	}

	private handleClearLogs() {
		this.onClearLogs?.()
		this.errorLog = []
	}

	private handleRemoveLog(logId: string) {
		this.errorLog = this.errorLog.filter((entry) => entry.id !== logId)
		this.onRemoveLog?.(logId)
	}

	onClose() {
		const { contentEl } = this
		contentEl.empty()
	}
}

class GenerationStatsModal extends Modal {
	constructor(
		app: App,
		private stats: GenerationStats,
		private errorLog: ErrorLogEntry[] = [],
		private onClearLogs?: () => void,
		private onRemoveLog?: (id: string) => void
	) {
		super(app)
	}

	onOpen() {
		const { contentEl } = this
		contentEl.createEl('h2', { text: t('AI Generation Details') })

		// Action buttons at top
		if (this.errorLog.length > 0) {
			const actionButtons = contentEl.createDiv({ cls: 'modal-action-buttons' })
			const viewLogsBtn = actionButtons.createEl('button', {
				text: `View ${this.errorLog.length} Error Log${this.errorLog.length === 1 ? '' : 's'}`,
				cls: 'mod-warning'
			})
			viewLogsBtn.onclick = () => {
				this.close()
				const currentError = {
					message: this.errorLog[0]?.message || 'No current error',
					name: this.errorLog[0]?.name,
					stack: this.errorLog[0]?.stack,
					timestamp: this.errorLog[0]?.timestamp || new Date()
				}
				new ErrorDetailModal(this.app, currentError, this.errorLog, this.onClearLogs, this.onRemoveLog).open()
			}
		}

		const statsContainer = contentEl.createDiv({ cls: 'generation-stats' })

		statsContainer.createEl('p', { text: `${t('Round')}: ${this.stats.round}` })
		statsContainer.createEl('p', { text: `${t('Model')}: ${this.stats.model}` })
		statsContainer.createEl('p', { text: `${t('Vendor')}: ${this.stats.vendor}` })
		statsContainer.createEl('p', { text: `${t('Characters')}: ${this.stats.characters}` })
		statsContainer.createEl('p', { text: `${t('Duration')}: ${this.stats.duration}` })
		statsContainer.createEl('p', { text: `${t('Start Time')}: ${this.stats.startTime.toLocaleTimeString()}` })
		statsContainer.createEl('p', { text: `${t('End Time')}: ${this.stats.endTime.toLocaleTimeString()}` })
	}

	onClose() {
		const { contentEl } = this
		contentEl.empty()
	}
}

class ErrorDetailView {
	private container: HTMLElement
	private currentError?: ErrorInfo
	private errorLog: ErrorLogEntry[]
	private readonly onClearLogs?: () => void
	private readonly onRemoveLog?: (id: string) => void
	private recentErrorsSummary?: HTMLElement
	private recentErrorsContainer?: HTMLElement
	private recentErrorsDetails?: HTMLDetailsElement
	private clearAllButton?: HTMLButtonElement
	private copyAllButton?: HTMLButtonElement

	constructor(
		container: HTMLElement,
		options: {
			currentError?: ErrorInfo
			errorLog?: ErrorLogEntry[]
			onClearLogs?: () => void
			onRemoveLog?: (id: string) => void
		}
	) {
		this.container = container
		this.currentError = options.currentError
		this.errorLog = [...(options.errorLog ?? [])]
		this.onClearLogs = options.onClearLogs
		this.onRemoveLog = options.onRemoveLog

		if (!this.currentError && this.errorLog.length > 0) {
			const [first] = this.errorLog
			this.currentError = {
				message: first.message,
				name: first.name,
				stack: first.stack,
				timestamp: first.timestamp
			}
		}

		this.render()
	}

	private render() {
		this.container.empty()
		this.container.addClass('error-detail-modal')
		this.container.createEl('h2', { text: t('Error Details') })

		if (Platform.isDesktopApp) {
			this.renderTopButtons()
		}

		this.renderCurrentErrorSection()
		this.renderRecentErrorsSection()
	}

	private renderTopButtons() {
		const topButtons = this.container.createDiv({ cls: 'error-modal-top-buttons' })

		const copyCurrentBtn = topButtons.createEl('button', {
			text: 'Copy Current Error',
			cls: 'mod-cta'
		})

		if (!this.currentError) {
			copyCurrentBtn.disabled = true
		} else {
			copyCurrentBtn.onclick = () => {
				navigator.clipboard.writeText(JSON.stringify(this.currentError, null, 2))
				new Notice('Current error copied to clipboard')
			}
		}

		this.copyAllButton = topButtons.createEl('button', {
			text: 'Copy All Logs',
			cls: 'mod-warning'
		})
		this.copyAllButton.disabled = this.errorLog.length === 0
		this.copyAllButton.onclick = () => {
			if (this.errorLog.length === 0) return
			const allErrors = this.errorLog.map((e) => ({
				timestamp: e.timestamp.toISOString(),
				type: e.type,
				name: e.name || 'Error',
				message: e.message,
				stack: e.stack,
				context: e.context
			}))
			navigator.clipboard.writeText(JSON.stringify(allErrors, null, 2))
			new Notice(`Copied ${allErrors.length} errors to clipboard`)
		}
	}

	private renderCurrentErrorSection() {
		const currentSection = this.container.createDiv({ cls: 'error-current-section' })
		currentSection.createEl('h3', { text: 'Current Error' })

		if (!this.currentError) {
			currentSection.createEl('p', { text: t('No current error') })
			return
		}

		const errorContainer = currentSection.createDiv({ cls: 'error-details' })
		errorContainer.createEl('p', {
			text: `${t('Error Type')}: ${this.currentError.name || t('Unknown Error')}`
		})
		errorContainer.createEl('p', {
			text: `${t('Error Message')}: ${this.currentError.message}`
		})
		errorContainer.createEl('p', {
			text: `${t('Occurrence Time')}: ${this.currentError.timestamp.toLocaleString()}`
		})

		if (this.currentError.stack) {
			const stackDetails = errorContainer.createEl('details', {
				cls: 'stack-trace',
				attr: { open: 'open' }
			}) as HTMLDetailsElement
			stackDetails.createEl('summary', { text: t('Stack Trace') })
			const stackPre = stackDetails.createEl('pre', { cls: 'stack-trace-pre' })
			stackPre.textContent = this.currentError.stack
		}
	}

	private renderRecentErrorsSection() {
		const logSection = this.container.createDiv({ cls: 'error-log-section' })

		this.recentErrorsDetails = logSection.createEl('details', {
			cls: 'error-log-details',
			attr: this.errorLog.length > 0 ? { open: 'open' } : undefined
		}) as HTMLDetailsElement

		const summary = this.recentErrorsDetails.createEl('summary')
		this.recentErrorsSummary = summary.createSpan({
			text: `Recent Errors (${this.errorLog.length})`,
			cls: 'error-log-summary'
		})

		this.recentErrorsContainer = this.recentErrorsDetails.createDiv({ cls: 'error-log-container' })

		if (this.errorLog.length === 0) {
			this.renderEmptyLogState(this.recentErrorsContainer)
		} else {
			for (const error of this.errorLog) {
				this.renderErrorLogItem(error)
			}
		}

		const actions = this.recentErrorsDetails.createDiv({ cls: 'error-log-actions' })
		this.clearAllButton = actions.createEl('button', {
			text: 'Clear All Logs',
			cls: 'mod-destructive'
		})
		this.clearAllButton.disabled = this.errorLog.length === 0
		this.clearAllButton.onclick = () => {
			if (this.errorLog.length === 0) return
			this.onClearLogs?.()
			this.errorLog = []
			this.recentErrorsContainer?.empty()
			this.renderEmptyLogState(this.recentErrorsContainer!)
			this.updateRecentErrorsSummary()
			new Notice('Error log cleared')
		}
	}

	private renderErrorLogItem(error: ErrorLogEntry) {
		if (!this.recentErrorsContainer) return

		const errorItem = this.recentErrorsContainer.createDiv({ cls: 'error-log-item' })
		errorItem.setAttribute('data-error-type', error.type)

		const errorHeader = errorItem.createDiv({ cls: 'error-log-header' })

		const typeIcon = this.getErrorTypeIcon(error.type)
		errorHeader.createSpan({ text: typeIcon, cls: 'error-type-icon' })
		errorHeader.createSpan({ text: error.name || 'Error', cls: 'error-name' })
		errorHeader.createSpan({
			text: error.timestamp.toLocaleString(),
			cls: 'error-timestamp'
		})

		const dismissBtn = errorHeader.createEl('button', {
			text: '×',
			cls: 'error-dismiss-btn',
			attr: { 'aria-label': 'Dismiss error' }
		})
		dismissBtn.onclick = () => this.handleRemoveLog(error.id, errorItem)

		const errorMessage = errorItem.createDiv({ cls: 'error-message' })
		errorMessage.textContent = error.message

		if (error.context) {
			const contextDetails = errorItem.createEl('details', { cls: 'error-context' })
			contextDetails.createEl('summary', { text: 'Context' })
			const contextPre = contextDetails.createEl('pre')
			contextPre.textContent = JSON.stringify(error.context, null, 2)
		}

		if (error.stack) {
			const stackDetails = errorItem.createEl('details', { cls: 'error-stack' })
			stackDetails.createEl('summary', { text: t('Stack Trace') })
			const stackPre = stackDetails.createEl('pre')
			stackPre.textContent = error.stack
		}

		if (Platform.isDesktopApp) {
			const copyBtn = errorItem.createEl('button', {
				text: 'Copy',
				cls: 'error-copy-btn'
			})
			copyBtn.onclick = () => {
				navigator.clipboard.writeText(
					JSON.stringify(
						{
							timestamp: error.timestamp.toISOString(),
							type: error.type,
							name: error.name,
							message: error.message,
							stack: error.stack,
							context: error.context
						},
						null,
						2
					)
				)
				new Notice('Error copied to clipboard')
			}
		}
	}

	private handleRemoveLog(logId: string, element: HTMLElement) {
		element.remove()
		this.errorLog = this.errorLog.filter((entry) => entry.id !== logId)
		this.onRemoveLog?.(logId)
		this.updateRecentErrorsSummary()

		if (this.recentErrorsContainer && !this.recentErrorsContainer.querySelector('.error-log-item')) {
			this.renderEmptyLogState(this.recentErrorsContainer)
		}
	}

	private updateRecentErrorsSummary() {
		if (this.recentErrorsSummary) {
			this.recentErrorsSummary.textContent = `Recent Errors (${this.errorLog.length})`
		}
		if (this.recentErrorsDetails) {
			this.recentErrorsDetails.open = this.errorLog.length > 0
		}
		if (this.clearAllButton) {
			this.clearAllButton.disabled = this.errorLog.length === 0
		}
		if (this.copyAllButton) {
			this.copyAllButton.disabled = this.errorLog.length === 0
		}
	}

	private renderEmptyLogState(container: HTMLElement) {
		container.empty()
		container.createDiv({
			cls: 'error-log-empty',
			text: t('No recent errors')
		})
	}

	private getErrorTypeIcon(type: ErrorLogType): string {
		switch (type) {
			case 'generation':
				return '🤖'
			case 'mcp':
				return '🔌'
			case 'tool':
				return '🔧'
			case 'system':
				return '⚙️'
			default:
				return '❌'
		}
	}
}

class ErrorDetailModal extends Modal {
	constructor(
		app: App,
		private currentError: ErrorInfo,
		private errorLog: ErrorLogEntry[] = [],
		private onClearLogs?: () => void,
		private onRemoveLog?: (id: string) => void
	) {
		super(app)
	}

	onOpen() {
		const { contentEl } = this
		new ErrorDetailView(contentEl, {
			currentError: this.currentError,
			errorLog: this.errorLog,
			onClearLogs: () => {
				this.onClearLogs?.()
				this.close()
			},
			onRemoveLog: (id) => this.onRemoveLog?.(id)
		})
	}

	onClose() {
		const { contentEl } = this
		contentEl.empty()
	}
}

export class StatusBarManager {
	private state: StatusBarState
	private autoHideTimer: NodeJS.Timeout | null = null
	private errorLog: ErrorLogEntry[] = []
	private readonly maxErrorLogSize = 50
	private onRefreshMCPStatus?: (updateStatus: (message: string) => void) => Promise<void>

	constructor(
		private app: App,
		private statusBarItem: HTMLElement
	) {
		this.state = {
			type: 'idle',
			content: {
				text: 'Tars',
				tooltip: t('Tars AI assistant is ready')
			},
			timestamp: new Date()
		}

		this.setupClickHandler()
		this.refreshStatusBar()
	}

	/**
	 * Set the refresh callback for MCP status (Feature-400-30-10, Feature-900-50-5-2)
	 */
	setRefreshCallback(callback: (updateStatus: (message: string) => void) => Promise<void>) {
		this.onRefreshMCPStatus = callback
	}

	private setupClickHandler() {
		this.statusBarItem.addEventListener('click', () => {
			// MCP status takes priority
			if (this.state.mcpStatus) {
				const currentErrorInfo = this.state.type === 'error' ? (this.state.data as ErrorInfo) : undefined
				new MCPStatusModal(
					this.app,
					this.state.mcpStatus,
					this.getErrorLog(),
					() => this.clearErrorLog(),
					(id) => this.removeErrorLogEntry(id),
					currentErrorInfo,
					this.onRefreshMCPStatus
				).open()
				return
			}

			if (!this.state.data) {
				// Show error log if available even when idle
				if (this.errorLog.length > 0) {
					const currentError = {
						message: 'No active generation',
						timestamp: new Date()
					}
					new ErrorDetailModal(
						this.app,
						currentError,
						this.getErrorLog(),
						() => this.clearErrorLog(),
						(id) => this.removeErrorLogEntry(id)
					).open()
				}
				return
			}

			if (this.state.type === 'error') {
				new ErrorDetailModal(
					this.app,
					this.state.data as ErrorInfo,
					this.getErrorLog(),
					() => this.clearErrorLog(),
					(id) => this.removeErrorLogEntry(id)
				).open()
			} else if (this.state.type === 'success') {
				new GenerationStatsModal(
					this.app,
					this.state.data as GenerationStats,
					this.getErrorLog(),
					() => this.clearErrorLog(),
					(id) => this.removeErrorLogEntry(id)
				).open()
			}
		})

		this.statusBarItem.style.cursor = 'pointer'
		this.statusBarItem.style.transition = 'opacity 0.2s ease'
	}

	private updateState(newState: Partial<StatusBarState>) {
		this.state = {
			...this.state,
			...newState,
			timestamp: new Date()
		}
		this.refreshStatusBar()
	}

	private refreshStatusBar() {
		const { content } = this.state

		this.statusBarItem.setText(content.text)

		this.statusBarItem.setAttribute('title', content.tooltip)
	}

	setGeneratingStatus(round: number) {
		if (this.autoHideTimer) {
			clearTimeout(this.autoHideTimer)
			this.autoHideTimer = null
		}

		this.updateState({
			type: 'generating',
			content: {
				text: `Round ${round}...`,
				tooltip: `${t('Generating round')} ${round} ${t('answer...')}`
			},
			data: undefined
		})
	}

	updateGeneratingProgress(characters: number) {
		if (this.state.type !== 'generating') return

		this.updateState({
			content: {
				text: `Tars: ${characters}${t('characters')}`,
				tooltip: `${t('Generating...')} ${characters} ${t('characters')}`
			}
		})
	}

	setSuccessStatus(stats: GenerationStats) {
		if (this.autoHideTimer) {
			clearTimeout(this.autoHideTimer)
			this.autoHideTimer = null
		}

		this.updateState({
			type: 'success',
			content: {
				text: `Tars: ${stats.characters}${t('characters')} ${stats.duration}`,
				tooltip: `${t('Round')} ${stats.round} | ${stats.characters}${t('characters')} | ${stats.duration} | ${stats.model}`
			},
			data: stats
		})
	}

	setMCPStatus(mcpStatus: MCPStatusInfo) {
		// Update the base text to include MCP info (Feature-400-30)
		let baseText = 'Tars'
		if (mcpStatus.totalServers > 0) {
			baseText += ` | MCP: ${mcpStatus.runningServers}/${mcpStatus.totalServers}`

			// Show active executions if any
			if (mcpStatus.activeExecutions && mcpStatus.activeExecutions > 0) {
				baseText += ` (${mcpStatus.activeExecutions} active)`
			}
			// Show retrying status
			else if (mcpStatus.retryingServers && mcpStatus.retryingServers > 0) {
				baseText += ` (${mcpStatus.retryingServers} retrying)`
			}
			// Show available tools
			else if (mcpStatus.availableTools > 0) {
				baseText += ` (${mcpStatus.availableTools} tools)`
			}

			// Add error indicator if there are failed servers
			if (mcpStatus.failedServers && mcpStatus.failedServers > 0) {
				baseText += ` ⚠️`
			}
		}

		let tooltip = t('Tars AI assistant is ready')
		if (mcpStatus.totalServers > 0) {
			tooltip = `MCP: ${mcpStatus.runningServers} of ${mcpStatus.totalServers} servers running`

			if (mcpStatus.activeExecutions && mcpStatus.activeExecutions > 0) {
				tooltip += `, ${mcpStatus.activeExecutions} tool${mcpStatus.activeExecutions === 1 ? '' : 's'} executing`
			}
			if (mcpStatus.retryingServers && mcpStatus.retryingServers > 0) {
				tooltip += `, ${mcpStatus.retryingServers} retrying`
			}
			if (mcpStatus.failedServers && mcpStatus.failedServers > 0) {
				tooltip += `, ${mcpStatus.failedServers} failed`
			}
			if (mcpStatus.availableTools > 0) {
				tooltip += `, ${mcpStatus.availableTools} tools available`
			}
			tooltip += '. Click for details.'
		}

		this.updateState({
			content: {
				text: baseText,
				tooltip
			},
			mcpStatus
		})
	}

	setErrorStatus(error: Error) {
		if (this.autoHideTimer) {
			clearTimeout(this.autoHideTimer)
			this.autoHideTimer = null
		}

		const errorInfo: ErrorInfo = {
			message: error.message,
			name: error.name,
			stack: error.stack,
			timestamp: new Date()
		}

		// Log to error buffer
		this.logError('generation', error.message, error)

		this.updateState({
			type: 'error',
			content: {
				text: `🔴 Tars: ${t('Error')}`,
				tooltip: `${t('Error')}: ${error.message}`
			},
			data: errorInfo
		})

		// 2 minutes later, automatically clear the error status
		this.autoHideTimer = setTimeout(() => this.clearStatus(), 1000 * 60 * 2)
	}

	/**
	 * Log an error to the error buffer (ring buffer with max 50 entries)
	 */
	logError(type: ErrorLogType, message: string, error?: Error, context?: Record<string, any>) {
		const logEntry: ErrorLogEntry = {
			id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			timestamp: new Date(),
			type,
			message,
			name: error?.name,
			stack: error?.stack,
			context
		}

		// Add to log
		this.errorLog.unshift(logEntry)

		// Maintain max size (ring buffer)
		if (this.errorLog.length > this.maxErrorLogSize) {
			this.errorLog = this.errorLog.slice(0, this.maxErrorLogSize)
		}
	}

	/**
	 * Get all logged errors
	 */
	getErrorLog(): ErrorLogEntry[] {
		return [...this.errorLog]
	}

	/**
	 * Clear error log
	 */
	clearErrorLog() {
		this.errorLog = []
	}

	private removeErrorLogEntry(logId: string) {
		this.errorLog = this.errorLog.filter((entry) => entry.id !== logId)
	}

	setCancelledStatus() {
		if (this.autoHideTimer) {
			clearTimeout(this.autoHideTimer)
			this.autoHideTimer = null
		}

		this.updateState({
			type: 'idle',
			content: {
				text: `⚠️ Tars: ${t('Generation cancelled')}`,
				tooltip: t('Generation cancelled')
			},
			data: undefined
		})

		// 1 minute later, automatically clear the status
		this.autoHideTimer = setTimeout(() => this.clearStatus(), 1000 * 60 * 1)
	}

	clearStatus() {
		if (this.autoHideTimer) {
			clearTimeout(this.autoHideTimer)
			this.autoHideTimer = null
		}

		this.updateState({
			type: 'idle',
			content: {
				text: 'Tars',
				tooltip: t('Tars AI assistant is ready')
			},
			data: undefined
		})
	}

	getState(): Readonly<StatusBarState> {
		return { ...this.state }
	}

	dispose() {
		if (this.autoHideTimer) {
			clearTimeout(this.autoHideTimer)
			this.autoHideTimer = null
		}
	}
}
