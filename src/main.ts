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
import { getMCPCommands } from './commands/mcpCommands'
import type { RequestController } from './editor'
import { t } from './lang/helper'
import { CodeBlockProcessor, createToolExecutor, HEALTH_CHECK_INTERVAL, MCPServerManager, migrateServerConfigs, type ToolExecutor } from './mcp'
import { getTitleFromCmdId, loadTemplateFileCommand, promptTemplateCmd, templateToCmdId } from './prompt'
import { DEFAULT_SETTINGS, type PluginSettings } from './settings'
import { TarsSettingTab } from './settingTab'
import { StatusBarManager } from './statusBarManager'
import { getMaxTriggerLineLength, TagEditorSuggest, type TagEntry } from './suggest'

export default class TarsPlugin extends Plugin {
	settings: PluginSettings
	statusBarManager: StatusBarManager
	tagCmdIds: string[] = []
	promptCmdIds: string[] = []
	tagLowerCaseMap: Map<string, Omit<TagEntry, 'replacement'>> = new Map()
	aborterInstance: AbortController | null = null
	// MCP Integration
	mcpManager: MCPServerManager | null = null
	mcpExecutor: ToolExecutor | null = null
	mcpCodeBlockProcessor: CodeBlockProcessor | null = null
	mcpHealthCheckInterval: NodeJS.Timeout | null = null

	async onload() {
		await this.loadSettings()

		console.debug('loading Tars plugin...')

		// Initialize MCP Server Manager
		if (this.settings.mcpServers && this.settings.mcpServers.length > 0) {
			try {
				this.mcpManager = new MCPServerManager()
				await this.mcpManager.initialize(this.settings.mcpServers)

				// Create tool executor with settings
				this.mcpExecutor = createToolExecutor(this.mcpManager, {
					timeout: this.settings.mcpGlobalTimeout,
					concurrentLimit: this.settings.mcpConcurrentLimit,
					sessionLimit: this.settings.mcpSessionLimit
				})

				// Create code block processor
				this.mcpCodeBlockProcessor = new CodeBlockProcessor()
				this.mcpCodeBlockProcessor.updateServerConfigs(this.settings.mcpServers)

				// Register code block processors for each server
				this.settings.mcpServers.forEach((server) => {
					this.registerMarkdownCodeBlockProcessor(server.name, async (source, el, ctx) => {
						if (!this.mcpExecutor || !this.mcpCodeBlockProcessor) return

						// Parse tool invocation
						const invocation = this.mcpCodeBlockProcessor.parseToolInvocation(source, server.name)
						if (!invocation) {
							el.createDiv({ text: 'Invalid tool invocation format', cls: 'mcp-error' })
							return
						}

						// Show executing status
						this.mcpCodeBlockProcessor.renderStatus(el, 'executing')

						try {
							// Execute tool
							const result = await this.mcpExecutor.executeTool({
								serverId: invocation.serverId,
								toolName: invocation.toolName,
								parameters: invocation.parameters,
								source: 'user-codeblock',
								documentPath: ctx.sourcePath
							})

							// Render result
							this.mcpCodeBlockProcessor.renderResult(el, result, {
								showMetadata: true,
								collapsible: result.contentType === 'json'
							})
						} catch (error) {
							// Render error
							this.mcpCodeBlockProcessor.renderError(el, {
								message: error instanceof Error ? error.message : String(error),
								timestamp: Date.now()
							})
						}
					})
				})

				// Register MCP commands
				const mcpCommands = getMCPCommands(this.mcpExecutor)
				mcpCommands.forEach((cmd) => this.addCommand(cmd))

				// Start health check timer
				this.mcpHealthCheckInterval = setInterval(async () => {
					if (this.mcpManager) {
						try {
							await this.mcpManager.performHealthCheck()
							this.updateMCPStatus()
						} catch (error) {
							console.debug('Health check failed:', error)
						}
					}
				}, HEALTH_CHECK_INTERVAL)

				console.debug('MCP integration initialized with', this.settings.mcpServers.length, 'servers')
			} catch (error) {
				console.error('Failed to initialize MCP integration:', error)
				new Notice('Failed to initialize MCP servers. Check console for details.')
			}
		}

		const statusBarItem = this.addStatusBarItem()
		this.statusBarManager = new StatusBarManager(this.app, statusBarItem)

		// Update MCP status in status bar if MCP manager is initialized
		if (this.mcpManager) {
			this.updateMCPStatus()
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
					this.getRequestController(),
					this.mcpManager,
					this.mcpExecutor
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

		// Clear health check timer
		if (this.mcpHealthCheckInterval) {
			clearInterval(this.mcpHealthCheckInterval)
			this.mcpHealthCheckInterval = null
		}

		// Shutdown MCP manager
		if (this.mcpManager) {
			try {
				await this.mcpManager.shutdown()
				console.debug('MCP integration shutdown complete')
			} catch (error) {
				console.error('Error shutting down MCP integration:', error)
			}
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
					asstTagCmd(tagCmdMeta, this.app, this.settings, this.statusBarManager, this.getRequestController(), this.mcpManager, this.mcpExecutor)
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
				this.settings.editorStatus.isTextInserting = false
				this.aborterInstance = null
			}
		}
	}

	async loadSettings() {
		const data = await this.loadData()
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data)

		// Migrate legacy MCP server configs (dockerConfig/deploymentType → executionCommand)
		if (this.settings.mcpServers && this.settings.mcpServers.length > 0) {
			const migratedServers = migrateServerConfigs(this.settings.mcpServers)
			const needsSave = JSON.stringify(migratedServers) !== JSON.stringify(this.settings.mcpServers)

			if (needsSave) {
				this.settings.mcpServers = migratedServers
				await this.saveSettings()
				console.log('[Tars] Migrated MCP server configs to executionCommand format')
			}
		}
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}

	async updateMCPStatus() {
		if (!this.mcpManager || !this.statusBarManager) return

		const servers = this.mcpManager.listServers()
		const serverDetailsPromises = servers.map(async (server) => {
			const client = this.mcpManager?.getClient(server.id)
			const isConnected = client?.isConnected() ?? false

			let toolCount = 0
			if (isConnected && client) {
				try {
					const tools = await client.listTools()
					toolCount = tools.length
				} catch (error) {
					console.debug(`Could not list tools for ${server.id}:`, error)
				}
			}

			return {
				id: server.id,
				name: server.name,
				enabled: server.enabled,
				isConnected,
				toolCount
			}
		})

		const serverDetails = await Promise.all(serverDetailsPromises)

		const runningServers = serverDetails.filter((s) => s.isConnected).length
		const totalServers = servers.length
		const availableTools = serverDetails.reduce((sum, s) => sum + s.toolCount, 0)

		this.statusBarManager.setMCPStatus({
			runningServers,
			totalServers,
			availableTools,
			servers: serverDetails
		})
	}
}
