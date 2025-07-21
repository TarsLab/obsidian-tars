import { App, Modal, Notice, Platform } from 'obsidian'
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
		private error: ErrorInfo
	) {
		super(app)
	}

	onOpen() {
		const { contentEl } = this
		contentEl.createEl('h2', { text: t('Error Details') })

		const errorContainer = contentEl.createDiv({ cls: 'error-details' })

		errorContainer.createEl('p', { text: `${t('Error Type')}: ${this.error.name || t('Unknown Error')}` })
		errorContainer.createEl('p', { text: `${t('Error Message')}: ${this.error.message}` })
		errorContainer.createEl('p', { text: `${t('Occurrence Time')}: ${this.error.timestamp.toLocaleString()}` })

		if (this.error.stack) {
			const stackSection = errorContainer.createDiv({ cls: 'stack-trace' })
			stackSection.createEl('h3', { text: t('Stack Trace') })
			const stackPre = stackSection.createEl('pre', { cls: 'stack-trace-pre' })
			stackPre.textContent = this.error.stack
		}

		if (Platform.isDesktopApp) {
			const buttonContainer = contentEl.createDiv({ cls: 'error-modal-buttons' })
			const copyBtn = buttonContainer.createEl('button', { text: t('Copy Error Info') })
			copyBtn.onclick = () => {
				navigator.clipboard.writeText(JSON.stringify(this.error, null, 2))
				new Notice(t('Error info copied to clipboard'))
			}
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
			if (!this.state.data) return

			if (this.state.type === 'error') {
				new ErrorDetailModal(this.app, this.state.data as ErrorInfo).open()
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
