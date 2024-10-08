import { Plugin } from 'obsidian'
import { exportCmd } from './commands/export'
import { replaceCmd } from './commands/replaceTag'
import { selectMsgAtCursorCmd } from './commands/select'
import { TarsSettingTab } from './settingTab'
import { DEFAULT_SETTINGS, PluginSettings } from './settings'
import { TagEditorSuggest } from './suggest'

export default class TarsPlugin extends Plugin {
	settings: PluginSettings

	async onload() {
		await this.loadSettings()

		console.debug('loading Tars plugin...')

		this.registerEditorSuggest(new TagEditorSuggest(this.app, this.settings))

		this.addCommand(replaceCmd(this.app))
		this.addCommand(exportCmd(this.app, this.settings))
		this.addCommand(selectMsgAtCursorCmd(this.app, this.settings))

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
