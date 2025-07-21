import { App, FuzzyMatch, FuzzySuggestModal } from 'obsidian'
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
