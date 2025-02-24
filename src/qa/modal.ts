import { App, FuzzyMatch, FuzzySuggestModal, Modal } from 'obsidian'
import { t } from 'src/lang/helper'
import { ProviderSettings } from 'src/providers'
import { getTemplateTitle } from './promptTemplate'
import { PromptTemplate } from './types'

const truncateString = (str: string, frontLen: number, backLen: number) => {
	if (str.length <= frontLen + backLen) {
		return str
	}
	const front = str.slice(0, frontLen)
	const back = str.slice(-backLen)
	return `${front} ... ${back}`
}

const escapeNewlines = (str: string) => str.replace(/\n/g, '\\n')

export class SelectPromptTemplateModal extends FuzzySuggestModal<PromptTemplate> {
	templates: PromptTemplate[]
	lastUsedTemplateTitle: string | null
	onChoose: (result: PromptTemplate) => void

	constructor(
		app: App,
		templates: PromptTemplate[],
		onChoose: (result: PromptTemplate) => void,
		lastUsedTemplateTitle: string | null
	) {
		super(app)
		this.templates = templates
		this.onChoose = onChoose
		this.lastUsedTemplateTitle = lastUsedTemplateTitle
	}

	getItems(): PromptTemplate[] {
		return this.templates
	}

	getItemText(template: PromptTemplate): string {
		return getTemplateTitle(template)
	}

	renderSuggestion(template: FuzzyMatch<PromptTemplate>, el: HTMLElement) {
		const title = getTemplateTitle(template.item)
		let lastIndex = 0

		const div = el.createEl('div')
		// 遍历所有的匹配项
		for (const match of template.match.matches) {
			const before = title.slice(lastIndex, match[0])
			const matched = title.slice(match[0], match[0] + match[1])
			div.createEl('span', { text: before })
			div.createEl('span', { text: matched, attr: { style: 'font-weight: bold;' } })
			lastIndex = match[0] + match[1]
		}

		// 添加最后一个匹配项后面的文本
		div.createEl('span', { text: title.slice(lastIndex) })

		const description = truncateString(escapeNewlines(template.item.template), 20, 5) // 截取前20个字符, 截取最后的5个字符

		el.createEl('small', {
			text: title === this.lastUsedTemplateTitle ? '📌 ' + description : description,
			attr: { style: 'color: #666;' } // 设置字体颜色比正常字体暗一些
		})
	}

	onChooseItem(template: PromptTemplate, evt: MouseEvent | KeyboardEvent) {
		this.onChoose(template)
	}
}

export class SelectProviderSettingModal extends FuzzySuggestModal<ProviderSettings> {
	providers: ProviderSettings[]
	lastUsedProviderTag?: string
	onChoose: (result: ProviderSettings) => void

	constructor(
		app: App,
		providers: ProviderSettings[],
		onChoose: (result: ProviderSettings) => void,
		lastUsedProviderTag?: string
	) {
		super(app)
		this.providers = providers
		this.lastUsedProviderTag = lastUsedProviderTag
		this.onChoose = onChoose
	}

	getItems(): ProviderSettings[] {
		return this.providers
	}

	getItemText(item: ProviderSettings): string {
		return item.tag
	}

	renderSuggestion(template: FuzzyMatch<ProviderSettings>, el: HTMLElement) {
		const title = template.item.tag
		let lastIndex = 0

		const div = el.createEl('div')
		// 遍历所有的匹配项
		for (const match of template.match.matches) {
			const before = title.slice(lastIndex, match[0])
			const matched = title.slice(match[0], match[0] + match[1])
			div.createEl('span', { text: before })
			div.createEl('span', { text: matched, attr: { style: 'font-weight: bold;' } })
			lastIndex = match[0] + match[1]
		}

		// 添加最后一个匹配项后面的文本
		div.createEl('span', { text: title.slice(lastIndex) })
		el.createEl('small', {
			text: title === this.lastUsedProviderTag ? '📌 ' + template.item.options.model : template.item.options.model
		})
	}

	onChooseItem(provider: ProviderSettings, evt: MouseEvent | KeyboardEvent) {
		this.onChoose(provider)
	}
}

export class ReporterModal extends Modal {
	reporter: string[]

	constructor(app: App, reporter: string[]) {
		super(app)
		this.reporter = reporter
	}

	onOpen() {
		const { contentEl } = this

		contentEl.createEl('h1', {
			text: t('Syntax Error Report')
		})

		const text = this.reporter.join('\n')
		contentEl.createEl('textarea', {
			text,
			attr: {
				style: 'width: 100%;',
				readonly: true,
				rows: 5
			}
		})
	}

	onClose() {
		const { contentEl } = this
		contentEl.empty()
	}
}
