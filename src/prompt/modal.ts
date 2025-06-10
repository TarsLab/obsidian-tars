import { App, Modal } from 'obsidian'
import { t } from 'src/lang/helper'

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
			cls: 'syntax-error-textarea',
			attr: {
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
