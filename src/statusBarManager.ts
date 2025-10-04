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
	constructor(
		app: App,
		private mcpStatus: MCPStatusInfo
	) {
		super(app)
	}

	onOpen() {
		const { contentEl } = this
		contentEl.createEl('h2', { text: 'MCP Server Status' })

		const statusContainer = contentEl.createDiv({ cls: 'mcp-status-modal' })

		// Summary
		const summary = statusContainer.createDiv({ cls: 'mcp-summary' })
		summary.createEl('p', {
			text: `Running: ${this.mcpStatus.runningServers} / ${this.mcpStatus.totalServers} servers`
		})
		if (this.mcpStatus.retryingServers > 0) {
			summary.createEl('p', {
				text: `Retrying: ${this.mcpStatus.retryingServers} servers`,
				cls: 'mcp-retrying'
			})
		}
		summary.createEl('p', {
			text: `Available Tools: ${this.mcpStatus.availableTools}`
		})

		// Server list
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
					text: `${statusIcon} ${server.name}`,
					cls: 'mcp-server-name'
				})
				serverItem.createEl('div', {
					text: `Status: ${statusText} | Tools: ${server.toolCount}`,
					cls: 'mcp-server-details'
				})
			}
		}
	}

	onClose() {
		const { contentEl } = this
		contentEl.empty()
	}
}

class GenerationStatsModal extends Modal {
	constructor(
		app: App,
		private stats: GenerationStats
	) {
		super(app)
	}

	onOpen() {
		const { contentEl } = this
		contentEl.createEl('h2', { text: t('AI Generation Details') })

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

class ErrorDetailModal extends Modal {
	constructor(
		app: App,
		private currentError: ErrorInfo,
		private errorLog: ErrorLogEntry[] = []
	) {
		super(app)
	}

	onOpen() {
		const { contentEl } = this
		contentEl.addClass('error-detail-modal')
		contentEl.createEl('h2', { text: t('Error Details') })

		// Button container at top
		if (Platform.isDesktopApp) {
			const topButtons = contentEl.createDiv({ cls: 'error-modal-top-buttons' })

			const copyCurrentBtn = topButtons.createEl('button', {
				text: 'Copy Current Error',
				cls: 'mod-cta'
			})
			copyCurrentBtn.onclick = () => {
				navigator.clipboard.writeText(JSON.stringify(this.currentError, null, 2))
				new Notice('Current error copied to clipboard')
			}

			if (this.errorLog.length > 0) {
				const copyAllBtn = topButtons.createEl('button', {
					text: 'Copy All Logs',
					cls: 'mod-warning'
				})
				copyAllBtn.onclick = () => {
					const allErrors = this.errorLog.map(e => ({
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
		}

		// Current error section
		const currentSection = contentEl.createDiv({ cls: 'error-current-section' })
		currentSection.createEl('h3', { text: 'Current Error' })

		const errorContainer = currentSection.createDiv({ cls: 'error-details' })
		errorContainer.createEl('p', { text: `${t('Error Type')}: ${this.currentError.name || t('Unknown Error')}` })
		errorContainer.createEl('p', { text: `${t('Error Message')}: ${this.currentError.message}` })
		errorContainer.createEl('p', { text: `${t('Occurrence Time')}: ${this.currentError.timestamp.toLocaleString()}` })

		if (this.currentError.stack) {
			const stackSection = errorContainer.createDiv({ cls: 'stack-trace' })
			stackSection.createEl('h3', { text: t('Stack Trace') })
			const stackPre = stackSection.createEl('pre', { cls: 'stack-trace-pre' })
			stackPre.textContent = this.currentError.stack
		}

		// Error log section
		if (this.errorLog.length > 0) {
			const logSection = contentEl.createDiv({ cls: 'error-log-section' })
			logSection.createEl('h3', { text: `Recent Errors (${this.errorLog.length})` })

			const logContainer = logSection.createDiv({ cls: 'error-log-container' })

			for (const error of this.errorLog) {
				const errorItem = logContainer.createDiv({ cls: 'error-log-item' })
				errorItem.setAttribute('data-error-type', error.type)

				const errorHeader = errorItem.createDiv({ cls: 'error-log-header' })

				const typeIcon = this.getErrorTypeIcon(error.type)
				errorHeader.createSpan({ text: typeIcon, cls: 'error-type-icon' })
				errorHeader.createSpan({ text: error.name || 'Error', cls: 'error-name' })
				errorHeader.createSpan({
					text: error.timestamp.toLocaleString(),
					cls: 'error-timestamp'
				})

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
						navigator.clipboard.writeText(JSON.stringify({
							timestamp: error.timestamp.toISOString(),
							type: error.type,
							name: error.name,
							message: error.message,
							stack: error.stack,
							context: error.context
						}, null, 2))
						new Notice('Error copied to clipboard')
					}
				}
			}
		}
	}

	private getErrorTypeIcon(type: ErrorLogType): string {
		switch (type) {
			case 'generation': return '🤖'
			case 'mcp': return '🔌'
			case 'tool': return '🔧'
			case 'system': return '⚙️'
			default: return '❌'
		}
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

	private setupClickHandler() {
		this.statusBarItem.addEventListener('click', () => {
			// MCP status takes priority
			if (this.state.mcpStatus) {
				new MCPStatusModal(this.app, this.state.mcpStatus).open()
				return
			}

			if (!this.state.data) return

			if (this.state.type === 'error') {
				new ErrorDetailModal(this.app, this.state.data as ErrorInfo, this.errorLog).open()
			} else if (this.state.type === 'success') {
				new GenerationStatsModal(this.app, this.state.data as GenerationStats).open()
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
		// Update the base text to include MCP info
		let baseText = 'Tars'
		if (mcpStatus.totalServers > 0) {
			baseText += ` | MCP: ${mcpStatus.runningServers}/${mcpStatus.totalServers}`
			if (mcpStatus.retryingServers > 0) {
				baseText += ` (${mcpStatus.retryingServers} retrying)`
			} else if (mcpStatus.availableTools > 0) {
				baseText += ` (${mcpStatus.availableTools} tools)`
			}
		}

		let tooltip = t('Tars AI assistant is ready')
		if (mcpStatus.totalServers > 0) {
			tooltip = `MCP: ${mcpStatus.runningServers} of ${mcpStatus.totalServers} servers running`
			if (mcpStatus.retryingServers > 0) {
				tooltip += `, ${mcpStatus.retryingServers} retrying`
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
