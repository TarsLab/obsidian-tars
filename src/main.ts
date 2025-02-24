import { Plugin } from 'obsidian'
import { exportCmd } from './commands/export'
import { replaceCmd } from './commands/replaceTag'
import { selectMsgAtCursorCmd } from './commands/select'
import { answerCmd, qaCmd, questionCmd, viewPromptTemplatesCmd } from './qa'
import { TarsSettingTab } from './settingTab'
import { DEFAULT_SETTINGS, PluginSettings } from './settings'
import { TagEditorSuggest } from './suggest'

export default class TarsPlugin extends Plugin {
	settings: PluginSettings
	statusBarItem: HTMLElement

	async onload() {
		await this.loadSettings()

		console.debug('loading Tars plugin...')

		this.statusBarItem = this.addStatusBarItem()
		this.statusBarItem.setText('Tars')
		this.registerEditorSuggest(new TagEditorSuggest(this.app, this.settings, this.statusBarItem))

		this.addCommand(questionCmd(this.app, this.settings, () => this.saveSettings()))
		this.addCommand(answerCmd(this.app, this.settings, this.statusBarItem, () => this.saveSettings()))
		this.addCommand(qaCmd(this.app, this.settings, this.statusBarItem, () => this.saveSettings()))

		this.addCommand(selectMsgAtCursorCmd(this.app, this.settings))
		this.addCommand(viewPromptTemplatesCmd(this.app))
		this.addCommand(replaceCmd(this.app))
		this.addCommand(exportCmd(this.app, this.settings))

		this.addSettingTab(new TarsSettingTab(this.app, this))
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}
}
