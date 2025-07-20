import { App, FuzzyMatch, FuzzySuggestModal, Modal, Notice, Platform } from 'obsidian'
import { t } from 'src/lang/helper'
import { Vendor } from './providers'
import { getCapabilityEmoji } from './providers/utils'

export class SelectModelModal extends FuzzySuggestModal<string> {
	models: string[]
	onChoose: (result: string) => void

	constructor(app: App, models: string[], onChoose: (result: string) => void) {
		super(app)
		this.models = models
		this.onChoose = onChoose
	}

	getItems(): string[] {
		return this.models
	}

	getItemText(item: string): string {
		return item
	}

	renderSuggestion(template: FuzzyMatch<string>, el: HTMLElement) {
		const title = template.item
		let lastIndex = 0

		const div = el.createEl('div')

		for (const match of template.match.matches) {
			const before = title.slice(lastIndex, match[0])
			const matched = title.slice(match[0], match[0] + match[1])
			div.createEl('span', { text: before })
			div.createEl('span', { text: matched, cls: 'fuzzy-match-highlight' })
			lastIndex = match[0] + match[1]
		}

		// Add the remaining text after the last match
		div.createEl('span', { text: title.slice(lastIndex) })
	}

	onChooseItem(model: string, _evt: MouseEvent | KeyboardEvent) {
		this.onChoose(model)
	}
}

export class SelectVendorModal extends FuzzySuggestModal<Vendor> {
	vendors: Vendor[]
	onChoose: (result: Vendor) => void

	constructor(app: App, vendors: Vendor[], onChoose: (vendor: Vendor) => void) {
		super(app)
		this.vendors = vendors
		this.onChoose = onChoose
	}

	getItems(): Vendor[] {
		return this.vendors
	}

	getItemText(item: Vendor): string {
		return item.name
	}

	renderSuggestion(template: FuzzyMatch<Vendor>, el: HTMLElement) {
		const title = template.item.name
		let lastIndex = 0

		const div = el.createEl('div')

		for (const match of template.match.matches) {
			const before = title.slice(lastIndex, match[0])
			const matched = title.slice(match[0], match[0] + match[1])
			div.createEl('span', { text: before })
			div.createEl('span', { text: matched, cls: 'fuzzy-match-highlight' })
			lastIndex = match[0] + match[1]
		}

		// Add the remaining text after the last match
		div.createEl('span', { text: title.slice(lastIndex) })

		const tagsContainer = el.createEl('div', { cls: 'capability-tags-container' })

		template.item.capabilities.forEach((capability) => {
			tagsContainer.createEl('span', {
				text: `${getCapabilityEmoji(capability)} ${t(capability)}`,
				cls: 'capability-tag'
			})
		})
	}

	onChooseItem(vendor: Vendor, _evt: MouseEvent | KeyboardEvent) {
		this.onChoose(vendor)
	}
}

export interface ErrorInfo {
	message: string
	name?: string
	stack?: string
	timestamp: Date
}

export class ErrorDetailModal extends Modal {
	constructor(
		app: App,
		private error: Error | ErrorInfo
	) {
		super(app)
	}

	onOpen() {
		const { contentEl } = this
		contentEl.createEl('h2', { text: '错误详情' })

		const errorContainer = contentEl.createDiv({ cls: 'error-details' })

		const errorInfo = this.error as ErrorInfo

		errorContainer.createEl('p', { text: `错误类型: ${errorInfo.name || 'Unknown Error'}` })
		errorContainer.createEl('p', { text: `错误信息: ${errorInfo.message}` })
		errorContainer.createEl('p', {
			text: `发生时间: ${errorInfo.timestamp?.toLocaleString() || new Date().toLocaleString()}`
		})

		if (errorInfo.stack) {
			const stackSection = errorContainer.createDiv({ cls: 'stack-trace' })
			stackSection.createEl('h3', { text: '堆栈跟踪' })
			const stackPre = stackSection.createEl('pre')
			stackPre.style.background = 'var(--background-secondary)'
			stackPre.style.padding = 'var(--size-4-2)'
			stackPre.style.borderRadius = 'var(--radius-s)'
			stackPre.style.fontSize = 'var(--font-ui-smaller)'
			stackPre.style.overflow = 'auto'
			stackPre.style.maxHeight = '200px'
			stackPre.textContent = errorInfo.stack
		}

		const buttonContainer = contentEl.createDiv({ cls: 'error-modal-buttons' })
		const closeBtn = buttonContainer.createEl('button', { text: '关闭' })
		closeBtn.onclick = () => this.close()

		if (Platform.isDesktopApp) {
			const copyBtn = buttonContainer.createEl('button', { text: '复制错误信息' })
			copyBtn.onclick = () => {
				navigator.clipboard.writeText(JSON.stringify(errorInfo, null, 2))
				new Notice('错误信息已复制到剪贴板')
			}
		}
	}

	onClose() {
		const { contentEl } = this
		contentEl.empty()
	}
}

export interface GenerationStats {
	round: number
	characters: number
	duration: string
	model: string
	startTime: Date
	endTime: Date
	tokenUsage?: {
		promptTokens?: number
		completionTokens?: number
		totalTokens?: number
	}
}

export class GenerationStatsModal extends Modal {
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

		if (this.stats.tokenUsage) {
			const tokenSection = statsContainer.createDiv({ cls: 'token-usage' })
			tokenSection.createEl('h3', { text: 'Token 使用情况' })

			if (this.stats.tokenUsage.promptTokens) {
				tokenSection.createEl('p', { text: `提示 Tokens: ${this.stats.tokenUsage.promptTokens}` })
			}
			if (this.stats.tokenUsage.completionTokens) {
				tokenSection.createEl('p', { text: `生成 Tokens: ${this.stats.tokenUsage.completionTokens}` })
			}
			if (this.stats.tokenUsage.totalTokens) {
				tokenSection.createEl('p', { text: `总 Tokens: ${this.stats.tokenUsage.totalTokens}` })
			}
		}

		const closeBtn = contentEl.createEl('button', { text: '关闭' })
		closeBtn.onclick = () => this.close()
	}

	onClose() {
		const { contentEl } = this
		contentEl.empty()
	}
}
