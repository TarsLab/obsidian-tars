import { Notice, Plugin } from 'obsidian'
import {
	asstTagCmd,
	exportCmd,
	getMeta,
	getTagCmdIdsFromSettings,
	newChatTagCmd,
	replaceCmd,
	selectMsgAtCursorCmd,
	systemTagCmd,
	userTagCmd
} from './commands'
import { promptTemplateCmd, viewPromptTemplatesCmd } from './prompt'
import { TarsSettingTab } from './settingTab'
import { DEFAULT_SETTINGS, PluginSettings } from './settings'
import { TagEditorSuggest } from './suggest'

export default class TarsPlugin extends Plugin {
	settings: PluginSettings
	statusBarItem: HTMLElement
	tagCmdIds: string[] = []

	async onload() {
		await this.loadSettings()

		console.debug('loading Tars plugin...')

		this.statusBarItem = this.addStatusBarItem()
		this.statusBarItem.setText('Tars')
		this.registerEditorSuggest(new TagEditorSuggest(this.app, this.settings, this.statusBarItem))

		this.buildTagCommands()
		this.addCommand(selectMsgAtCursorCmd(this.app, this.settings))

		this.addCommand(viewPromptTemplatesCmd(this.app))
		this.addCommand(promptTemplateCmd(this.app, this.settings, () => this.saveSettings()))

		if (this.settings.advancedCmd.enableReplaceTag) this.addCommand(replaceCmd(this.app))
		if (this.settings.advancedCmd.enableExportToJSONL) this.addCommand(exportCmd(this.app, this.settings))

		this.addSettingTab(new TarsSettingTab(this.app, this))
	}

	onunload() {}

	addTagCommand(cmdId: string) {
		const tagCmdMeta = getMeta(cmdId)
		switch (tagCmdMeta.role) {
			case 'newChat':
				this.addCommand(newChatTagCmd(tagCmdMeta))
				break
			case 'system':
				this.addCommand(systemTagCmd(tagCmdMeta))
				break
			case 'user':
				this.addCommand(userTagCmd(tagCmdMeta, this.app, this.settings))
				break
			case 'assistant':
				this.addCommand(asstTagCmd(tagCmdMeta, this.app, this.settings, this.statusBarItem))
				break
			default:
				throw new Error('Unknown tag role')
		}
	}

	buildTagCommands() {
		this.tagCmdIds = getTagCmdIdsFromSettings(this.settings)
		this.tagCmdIds.forEach((cmdId) => this.addTagCommand(cmdId))
		console.debug('tagCmdIds', this.tagCmdIds)
	}

	rebuildTagCommands() {
		const newTagCmdIds = getTagCmdIdsFromSettings(this.settings)

		const toRemove = this.tagCmdIds.filter((cmdId) => !newTagCmdIds.includes(cmdId))
		toRemove.forEach((cmdId) => this.removeCommand(cmdId))
		const removedTags = toRemove.map((cmdId) => getMeta(cmdId).tag)
		if (removedTags.length > 0) {
			console.debug('Removed tags', removedTags)
			new Notice(`Removed commands: ${removedTags.join(', ')}`)
		}

		const toAdd = newTagCmdIds.filter((cmdId) => !this.tagCmdIds.includes(cmdId))
		toAdd.forEach((cmdId) => this.addTagCommand(cmdId))
		const addedTags = toAdd.map((cmdId) => getMeta(cmdId).tag)
		if (addedTags.length > 0) {
			console.debug('Added tags', addedTags)
			new Notice(`Added commands: ${addedTags.join(', ')}`)
		}

		this.tagCmdIds = newTagCmdIds
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}
}
