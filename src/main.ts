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
import { t } from './lang/helper'
import { getTitleFromCmdId, loadTemplateFileCommand, promptTemplateCmd, templateToCmdId } from './prompt'
import { TarsSettingTab } from './settingTab'
import { DEFAULT_SETTINGS, PluginSettings } from './settings'
import { TagEditorSuggest } from './suggest'

export default class TarsPlugin extends Plugin {
	settings: PluginSettings
	statusBarItem: HTMLElement
	tagCmdIds: string[] = []
	promptCmdIds: string[] = []

	async onload() {
		await this.loadSettings()

		console.debug('loading Tars plugin...')

		this.statusBarItem = this.addStatusBarItem()
		this.statusBarItem.setText('Tars')
		this.registerEditorSuggest(new TagEditorSuggest(this.app, this.settings, this.statusBarItem))

		this.buildTagCommands(true)
		this.buildPromptCommands(true)

		this.addCommand(selectMsgAtCursorCmd(this.app, this.settings))
		this.addCommand(
			loadTemplateFileCommand(
				this.app,
				this.settings,
				() => this.saveSettings(),
				() => this.buildPromptCommands()
			)
		)

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
				this.addCommand(systemTagCmd(tagCmdMeta, this.app, this.settings))
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

	buildTagCommands(suppressNotifications: boolean = false) {
		const newTagCmdIds = getTagCmdIdsFromSettings(this.settings)

		const toRemove = this.tagCmdIds.filter((cmdId) => !newTagCmdIds.includes(cmdId))
		toRemove.forEach((cmdId) => this.removeCommand(cmdId))

		const toAdd = newTagCmdIds.filter((cmdId) => !this.tagCmdIds.includes(cmdId))
		toAdd.forEach((cmdId) => this.addTagCommand(cmdId))

		this.tagCmdIds = newTagCmdIds
		if (suppressNotifications) return

		const removedTags = toRemove.map((cmdId) => getMeta(cmdId).tag)
		if (removedTags.length > 0) {
			console.debug('Removed commands', removedTags)
			new Notice(`${t('Removed commands')}: ${removedTags.join(', ')}`)
		}
		const addedTags = toAdd.map((cmdId) => getMeta(cmdId).tag)
		if (addedTags.length > 0) {
			console.debug('Added commands', addedTags)
			new Notice(`${t('Added commands')}: ${addedTags.join(', ')}`)
		}
	}

	buildPromptCommands(suppressNotifications: boolean = false) {
		const newPromptCmdIds = this.settings.promptTemplates.map(templateToCmdId)

		const toRemove = this.promptCmdIds.filter((cmdId) => !newPromptCmdIds.includes(cmdId))
		toRemove.forEach((cmdId) => this.removeCommand(cmdId))

		const toAdd = this.settings.promptTemplates.filter((t) => !this.promptCmdIds.includes(templateToCmdId(t)))
		toAdd.forEach((t) => {
			this.addCommand(promptTemplateCmd(templateToCmdId(t), t.title, this.app, this.settings))
		})

		this.promptCmdIds = newPromptCmdIds
		if (suppressNotifications) return

		const removedTitles = toRemove.map((cmdId) => getTitleFromCmdId(cmdId))
		if (removedTitles.length > 0) {
			console.debug('Removed commands', removedTitles)
			new Notice(`${t('Removed commands')}: ${removedTitles.join(', ')}`)
		}
		const addedTitles = toAdd.map((t) => t.title)
		if (addedTitles.length > 0) {
			console.debug('Added commands', addedTitles)
			new Notice(`${t('Added commands')}: ${addedTitles.join(', ')}`)
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}
}
