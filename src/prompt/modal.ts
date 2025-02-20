import { App, FuzzyMatch, FuzzySuggestModal } from 'obsidian'
import { t } from '../lang/helper'
import { PromptTemplate, Provider } from './types'

export class SelectPromptTemplateModal extends FuzzySuggestModal<PromptTemplate> {
	templates: PromptTemplate[]
	lastUsedTemplateTitle?: string
	onChoose: (result: PromptTemplate) => void

	constructor(
		app: App,
		templates: PromptTemplate[],
		onChoose: (result: PromptTemplate) => void,
		lastUsedTemplateTitle?: string
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
		return template.title
	}

	renderSuggestion(template: FuzzyMatch<PromptTemplate>, el: HTMLElement) {
		const title = template.item.title
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

		if (title === this.lastUsedTemplateTitle) {
			el.createEl('small', {
				text: t('Last used')
			})
		}
	}

	onChooseItem(template: PromptTemplate, evt: MouseEvent | KeyboardEvent) {
		this.onChoose(template)
	}
}

export class SelectProviderModal extends FuzzySuggestModal<Provider> {
	providers: Provider[]
	lastUsedProviderTag?: string
	onChoose: (result: Provider) => void

	constructor(app: App, providers: Provider[], onChoose: (result: Provider) => void, lastUsedProviderTag?: string) {
		super(app)
		this.providers = providers
		this.lastUsedProviderTag = lastUsedProviderTag
		this.onChoose = onChoose
	}

	getItems(): Provider[] {
		return this.providers
	}

	getItemText(item: Provider): string {
		return item.tag
	}

	renderSuggestion(template: FuzzyMatch<Provider>, el: HTMLElement) {
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
		const prefix = title === this.lastUsedProviderTag ? t('Last used') : ''
		el.createEl('small', {
			text: prefix + template.item.description
		})
	}

	onChooseItem(provider: Provider, evt: MouseEvent | KeyboardEvent) {
		this.onChoose(provider)
	}
}
