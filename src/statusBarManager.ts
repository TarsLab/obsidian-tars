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
		contentEl.createEl('h2', { text: 'AI 生成详情' })

		const statsContainer = contentEl.createDiv({ cls: 'generation-stats' })

		statsContainer.createEl('p', { text: `回合: ${this.stats.round}` })
		statsContainer.createEl('p', { text: `模型: ${this.stats.model}` })
		statsContainer.createEl('p', { text: `字符数: ${this.stats.characters}` })
		statsContainer.createEl('p', { text: `用时: ${this.stats.duration}` })
		statsContainer.createEl('p', { text: `开始时间: ${this.stats.startTime.toLocaleTimeString()}` })
		statsContainer.createEl('p', { text: `结束时间: ${this.stats.endTime.toLocaleTimeString()}` })
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
		contentEl.createEl('h2', { text: '错误详情' })

		const errorContainer = contentEl.createDiv({ cls: 'error-details' })

		errorContainer.createEl('p', { text: `错误类型: ${this.error.name || 'Unknown Error'}` })
		errorContainer.createEl('p', { text: `错误信息: ${this.error.message}` })
		errorContainer.createEl('p', { text: `发生时间: ${this.error.timestamp.toLocaleString()}` })

		if (this.error.stack) {
			const stackSection = errorContainer.createDiv({ cls: 'stack-trace' })
			stackSection.createEl('h3', { text: '堆栈跟踪' })
			const stackPre = stackSection.createEl('pre')
			stackPre.style.background = 'var(--background-secondary)'
			stackPre.style.padding = 'var(--size-4-2)'
			stackPre.style.borderRadius = 'var(--radius-s)'
			stackPre.style.fontSize = 'var(--font-ui-smaller)'
			stackPre.style.overflow = 'auto'
			stackPre.style.maxHeight = '200px'
			stackPre.textContent = this.error.stack
		}

		if (Platform.isDesktopApp) {
			const buttonContainer = contentEl.createDiv({ cls: 'error-modal-buttons' })
			const copyBtn = buttonContainer.createEl('button', { text: '复制错误信息' })
			copyBtn.onclick = () => {
				navigator.clipboard.writeText(JSON.stringify(this.error, null, 2))
				new Notice('错误信息已复制到剪贴板')
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
				tooltip: 'Tars AI 助手已就绪'
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

		// 添加基础样式
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

		// 更新文本
		this.statusBarItem.setText(content.text)

		// 更新属性
		this.statusBarItem.setAttribute('title', content.tooltip)
	}

	// 公共方法 - 设置生成中状态
	setGeneratingStatus(round: number) {
		// 清除自动隐藏定时器
		if (this.autoHideTimer) {
			clearTimeout(this.autoHideTimer)
			this.autoHideTimer = null
		}

		this.updateState({
			type: 'generating',
			content: {
				text: `Round ${round}...`,
				tooltip: `正在生成第 ${round} 轮回答...`
			},
			data: undefined
		})
	}

	// 公共方法 - 更新生成进度
	updateGeneratingProgress(characters: number) {
		if (this.state.type !== 'generating') return

		this.updateState({
			content: {
				text: `Tars: ${characters}${t('characters')}`,
				tooltip: `正在生成... ${characters} 字符`
			}
		})
	}

	// 公共方法 - 设置成功状态
	setSuccessStatus(stats: GenerationStats) {
		// 清除自动隐藏定时器
		if (this.autoHideTimer) {
			clearTimeout(this.autoHideTimer)
			this.autoHideTimer = null
		}

		this.updateState({
			type: 'success',
			content: {
				text: `Tars: ${stats.characters}${t('characters')} ${stats.duration}`,
				tooltip: `Round ${stats.round} | ${stats.characters}字符 | ${stats.duration} | ${stats.model}`
			},
			data: stats
		})
	}

	// 公共方法 - 设置错误状态
	setErrorStatus(error: Error) {
		// 清除自动隐藏定时器
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
				tooltip: `错误: ${error.message}`
			},
			data: errorInfo
		})

		// 2分钟后自动清除错误状态
		this.autoHideTimer = setTimeout(() => this.clearStatus(), 1000 * 60 * 2)
	}

	// 公共方法 - 设置取消状态
	setCancelledStatus() {
		// 清除自动隐藏定时器
		if (this.autoHideTimer) {
			clearTimeout(this.autoHideTimer)
			this.autoHideTimer = null
		}

		this.updateState({
			type: 'idle',
			content: {
				text: `❌ ${t('Generation cancelled')}`,
				tooltip: `生成已取消`
			},
			data: undefined
		})

		// 1分钟后自动清除
		this.autoHideTimer = setTimeout(() => this.clearStatus(), 1000 * 60 * 1)
	}

	// 公共方法 - 清除状态
	clearStatus() {
		// 清除自动隐藏定时器
		if (this.autoHideTimer) {
			clearTimeout(this.autoHideTimer)
			this.autoHideTimer = null
		}

		this.updateState({
			type: 'idle',
			content: {
				text: 'Tars',
				tooltip: 'Tars AI 助手已就绪'
			},
			data: undefined
		})
	}

	// 公共方法 - 获取当前状态（只读）
	getState(): Readonly<StatusBarState> {
		return { ...this.state }
	}

	// 清理资源
	dispose() {
		if (this.autoHideTimer) {
			clearTimeout(this.autoHideTimer)
			this.autoHideTimer = null
		}
	}
}
