import { App, FuzzyMatch, FuzzySuggestModal } from 'obsidian'

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
			div.createEl('span', { text: matched, attr: { style: 'font-weight: bold;' } })
			lastIndex = match[0] + match[1]
		}

		// Add the remaining text after the last match
		div.createEl('span', { text: title.slice(lastIndex) })
	}

	onChooseItem(model: string, evt: MouseEvent | KeyboardEvent) {
		this.onChoose(model)
	}
}
