import { Notice, Platform, Plugin } from 'obsidian'
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
import {
	fetchOrCreateTemplates,
	getTitleFromCmdId,
	loadTemplateFileCommand,
	promptTemplateCmd,
	templateToCmdId
} from './prompt'
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
		await this.loadTemplateFile(true)

		this.addCommand(selectMsgAtCursorCmd(this.app, this.settings))
		this.addCommand(loadTemplateFileCommand(this.app, () => this.loadTemplateFile()))

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

	buildTagCommands(quiet: boolean = false) {
		const newTagCmdIds = getTagCmdIdsFromSettings(this.settings)

		const toRemove = this.tagCmdIds.filter((cmdId) => !newTagCmdIds.includes(cmdId))
		toRemove.forEach((cmdId) => this.removeCommand(cmdId))

		const toAdd = newTagCmdIds.filter((cmdId) => !this.tagCmdIds.includes(cmdId))
		toAdd.forEach((cmdId) => this.addTagCommand(cmdId))

		if (!quiet) {
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

		this.tagCmdIds = newTagCmdIds
	}

	async loadTemplateFile(quiet: boolean = false): Promise<string[] | undefined> {
		try {
			const { isCreated, promptTemplates, reporter } = await fetchOrCreateTemplates(this.app)
			if (isCreated) {
				new Notice(`File was just created. Please run 'Load template file' command later`)
				return undefined
			}

			const newPromptCmdIds = promptTemplates.map(templateToCmdId)
			const toRemove = this.promptCmdIds.filter((cmdId) => !newPromptCmdIds.includes(cmdId))
			toRemove.forEach((cmdId) => {
				this.removeCommand(cmdId)
				this.promptCmdIds.remove(cmdId)
			})

			const toAdd = newPromptCmdIds.filter((cmdId) => !this.promptCmdIds.includes(cmdId))
			toAdd.forEach((cmdId) => {
				const template = promptTemplates.find((t) => templateToCmdId(t) === cmdId)
				if (template) {
					this.addCommand(promptTemplateCmd({ id: cmdId, ...template }, this.app))
					this.promptCmdIds.push(cmdId)
				} else {
					console.error('Template not found', cmdId)
					new Notice(`🔴 Template not found: ${cmdId}`)
				}
			})

			if (!quiet) {
				const removedTitles = toRemove.map((cmdId) => getTitleFromCmdId(cmdId))
				if (removedTitles.length > 0) {
					console.debug('Removed commands', removedTitles)
					new Notice(`${t('Removed commands')}: ${removedTitles.join(', ')}`)
				}
				const addedTitles = toAdd.map((cmdId) => getTitleFromCmdId(cmdId))
				if (addedTitles.length > 0) {
					console.debug('Added commands', addedTitles)
					new Notice(`${t('Added commands')}: ${addedTitles.join(', ')}`)
				}
			}

			return reporter
		} catch (error) {
			console.error(error)
			new Notice(
				`🔴 ${Platform.isDesktopApp ? t('Check the developer console for error details. ') : ''}${error}`,
				10 * 1000
			)
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}
}
