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
import { RequestController } from './editor'
import { t } from './lang/helper'
import { MCPManager, TagToolMapper } from './mcp'
import { getTitleFromCmdId, loadTemplateFileCommand, promptTemplateCmd, templateToCmdId } from './prompt'
import { TarsSettingTab } from './settingTab'
import { DEFAULT_SETTINGS, PluginSettings } from './settings'
import { StatusBarManager } from './statusBarManager'
import { getMaxTriggerLineLength, TagEditorSuggest, TagEntry } from './suggest'

export default class TarsPlugin extends Plugin {
	settings: PluginSettings
	statusBarManager: StatusBarManager
	tagCmdIds: string[] = []
	promptCmdIds: string[] = []
	tagLowerCaseMap: Map<string, Omit<TagEntry, 'replacement'>> = new Map()
	aborterInstance: AbortController | null = null
	mcpManager: MCPManager | null = null
	tagToolMapper: TagToolMapper | null = null

	async onload() {
		await this.loadSettings()

		console.debug('loading Tars plugin...')

		const statusBarItem = this.addStatusBarItem()
		this.statusBarManager = new StatusBarManager(this.app, statusBarItem)

		// Initialize MCP integration if enabled
		if (this.settings.enableMCPIntegration) {
			await this.initializeMCPIntegration()
		}

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

		this.settings.editorStatus = { isTextInserting: false }

		if (this.settings.enableTagSuggest)
			this.registerEditorSuggest(
				new TagEditorSuggest(
					this.app,
					this.settings,
					this.tagLowerCaseMap,
					this.statusBarManager,
					this.getRequestController()
				)
			)

		this.addCommand({
			id: 'cancelGeneration',
			name: t('Cancel generation'),
			callback: async () => {
				this.settings.editorStatus.isTextInserting = false

				if (this.aborterInstance === null) {
					new Notice(t('No active generation to cancel'))
					return
				}
				if (this.aborterInstance.signal.aborted) {
					new Notice(t('Generation already cancelled'))
					return
				}

				this.aborterInstance.abort()
			}
		})

		if (this.settings.enableReplaceTag) this.addCommand(replaceCmd(this.app))
		if (this.settings.enableExportToJSONL) this.addCommand(exportCmd(this.app, this.settings))

		this.addSettingTab(new TarsSettingTab(this.app, this))
	}

	async onunload() {
		this.statusBarManager?.dispose()
		
		// Cleanup MCP connections
		if (this.mcpManager) {
			await this.mcpManager.disconnectAll()
		}
	}

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
				this.addCommand(
					asstTagCmd(tagCmdMeta, this.app, this.settings, this.statusBarManager, this.getRequestController(), this.tagToolMapper)
				)
				break
			default:
				throw new Error('Unknown tag role')
		}
	}

	buildTagCommands(suppressNotifications: boolean = false) {
		this.settings.tagSuggestMaxLineLength = getMaxTriggerLineLength(this.settings)

		const newTagCmdIds = getTagCmdIdsFromSettings(this.settings)

		const toRemove = this.tagCmdIds.filter((cmdId) => !newTagCmdIds.includes(cmdId))
		toRemove.forEach((cmdId) => {
			this.removeCommand(cmdId)
			const { tag } = getMeta(cmdId)
			this.tagLowerCaseMap.delete(tag.toLowerCase())
		})

		const toAdd = newTagCmdIds.filter((cmdId) => !this.tagCmdIds.includes(cmdId))
		toAdd.forEach((cmdId) => {
			this.addTagCommand(cmdId)
			const { role, tag } = getMeta(cmdId)
			this.tagLowerCaseMap.set(tag.toLowerCase(), { role, tag })
		})

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

	getRequestController(): RequestController {
		return {
			getController: () => {
				if (!this.aborterInstance) {
					this.aborterInstance = new AbortController()
				}
				return this.aborterInstance
			},
			cleanup: () => {
				{
					this.settings.editorStatus.isTextInserting = false
					this.aborterInstance = null
				}
			}
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}

	async initializeMCPIntegration() {
		try {
			console.log('Initializing MCP integration...')
			
			this.mcpManager = new MCPManager()
			this.tagToolMapper = new TagToolMapper(this.mcpManager)

			let connectedServers = 0
			let totalServers = this.settings.mcpServers.filter(s => s.enabled).length

			if (totalServers === 0) {
				console.log('No MCP servers configured or enabled')
				return
			}

			// Connect to configured MCP servers
			for (const serverConfig of this.settings.mcpServers) {
				if (serverConfig.enabled) {
					try {
						await this.mcpManager.connectToServer(serverConfig)
						connectedServers++
						console.log(`Connected to MCP server: ${serverConfig.name}`)
					} catch (error) {
						console.warn(`Failed to connect to MCP server ${serverConfig.name}:`, error)
						new Notice(`Failed to connect to MCP server "${serverConfig.name}": ${error.message}`, 5000)
					}
				}
			}

			// Load custom tag-tool mappings
			let loadedMappings = 0
			for (const mapping of this.settings.tagToolMappings) {
				try {
					this.tagToolMapper.addMapping(mapping)
					loadedMappings++
				} catch (error) {
					console.warn(`Failed to load tag-tool mapping for pattern "${mapping.tagPattern}":`, error)
				}
			}

			if (connectedServers > 0) {
				console.log(`MCP integration initialized: ${connectedServers}/${totalServers} servers connected, ${loadedMappings} mappings loaded`)
				new Notice(`MCP integration ready: ${connectedServers} server(s) connected`, 3000)
			} else {
				console.warn('MCP integration initialized but no servers connected')
				new Notice('MCP integration enabled but no servers are connected. Check your server configurations.', 5000)
			}
		} catch (error) {
			console.error('Failed to initialize MCP integration:', error)
			new Notice(`Failed to initialize MCP integration: ${error.message}`, 5000)
			
			// Clean up partial initialization
			if (this.mcpManager) {
				await this.mcpManager.disconnectAll()
				this.mcpManager = null
			}
			this.tagToolMapper = null
		}
	}

	async toggleMCPIntegration(enabled: boolean) {
		if (enabled && !this.mcpManager) {
			await this.initializeMCPIntegration()
		} else if (!enabled && this.mcpManager) {
			await this.mcpManager.disconnectAll()
			this.mcpManager = null
			this.tagToolMapper = null
		}
	}

	getMCPManager(): MCPManager | null {
		return this.mcpManager
	}

	getTagToolMapper(): TagToolMapper | null {
		return this.tagToolMapper
	}
}
