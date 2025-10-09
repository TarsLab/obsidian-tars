import { Editor, Notice, Plugin } from 'obsidian'
import { createLogger } from './logger'

const logger = createLogger('plugin')

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
import {
	CodeBlockProcessor,
	createToolExecutor,
	HEALTH_CHECK_INTERVAL,
	MCPServerManager,
	migrateServerConfigs,
	type ToolExecutor,
	type SessionNotificationHandlers
} from './mcp'
import { registerDocumentSessionHandlers } from './mcp/documentSessionHandlers'
import { getTitleFromCmdId, loadTemplateFileCommand, promptTemplateCmd, templateToCmdId } from './prompt'
import { DEFAULT_SETTINGS, type PluginSettings } from './settings'
import { TarsSettingTab } from './settingTab'
import { StatusBarManager } from './statusBarManager'
import { getMaxTriggerLineLength, TagEditorSuggest, type TagEntry } from './suggest'
import { MCPParameterSuggest } from './suggests/mcpParameterSuggest'
import { MCPToolSuggest } from './suggests/mcpToolSuggest'

function createNoticeSessionNotifications(): SessionNotificationHandlers {
	return {
		onLimitReached: async (documentPath: string, limit: number, current: number) => {
			return new Promise((resolve) => {
				try {
					const notice: any = new Notice('', 0)
					const root = notice?.noticeEl?.createDiv?.({ cls: 'mcp-session-notice' }) ?? null
					const container = root ?? notice?.noticeEl
					if (!container) {
						resolve('cancel')
						return
					}

					if (typeof container.empty === 'function') {
						container.empty()
					} else {
						if ('innerHTML' in container) {
							;(container as HTMLElement).innerHTML = ''
						}
						if ('textContent' in container) {
							container.textContent = ''
						}
					}

					container.createEl?.('p', {
						text: `Session limit reached for this document (total across all servers).`
					})
					container.createEl?.('p', {
						cls: 'mcp-session-limit-meta',
						text: `Document: ${documentPath} — ${current}/${limit}`
					})

					const actions = container.createDiv?.({ cls: 'mcp-session-actions' }) ?? container

					const cleanup = (result: 'continue' | 'cancel') => {
						if (typeof notice?.hide === 'function') {
							notice.hide()
						}
						resolve(result)
					}

					const continueBtn = actions.createEl?.('button', {
						cls: 'mod-cta',
						text: 'Continue'
					})
					continueBtn?.addEventListener('click', () => cleanup('continue'))

					const cancelBtn = actions.createEl?.('button', { text: 'Cancel' })
					cancelBtn?.addEventListener('click', () => cleanup('cancel'))
				} catch {
					resolve('cancel')
				}
			})
		},
		onSessionReset: (documentPath: string) => {
			try {
				new Notice(`Session counter reset for ${documentPath}`, 4000)
			} catch {
				// Ignore notice failures in environments without UI
			}
		}
	}
}

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

		logger.info('loading tars plugin')

		// Initialize StatusBar early so MCP components can log errors
		const statusBarItem = this.addStatusBarItem()
		this.statusBarManager = new StatusBarManager(this.app, statusBarItem)

		// Initialize MCP Server Manager (non-blocking)
		if (this.settings.mcpServers && this.settings.mcpServers.length > 0) {
			this.mcpManager = new MCPServerManager()

			// Setup real-time status updates from MCP events (Feature-400-30)
			this.mcpManager.on('server-started', () => this.updateMCPStatus())
			this.mcpManager.on('server-stopped', () => this.updateMCPStatus())
			this.mcpManager.on('server-failed', () => this.updateMCPStatus())
			this.mcpManager.on('server-auto-disabled', () => this.updateMCPStatus())
			this.mcpManager.on('server-retry', () => this.updateMCPStatus())

			// Create tool executor with settings
				this.mcpExecutor = createToolExecutor(this.mcpManager, {
					timeout: this.settings.mcpGlobalTimeout,
					concurrentLimit: this.settings.mcpConcurrentLimit,
					sessionLimit: this.settings.mcpSessionLimit,
					statusBarManager: this.statusBarManager,
					sessionNotifications: createNoticeSessionNotifications()
				})

			// Create code block processor
			this.mcpCodeBlockProcessor = new CodeBlockProcessor()
			this.mcpCodeBlockProcessor.updateServerConfigs(this.settings.mcpServers)

			registerDocumentSessionHandlers(this.app, this.mcpExecutor, (ref) => this.registerEvent(ref))

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

					// Create execution request
					const request = {
						serverId: invocation.serverId,
						toolName: invocation.toolName,
						parameters: invocation.parameters,
						source: 'user-codeblock' as const,
						documentPath: ctx.sourcePath
					}

					// Show executing status with cancel button
					let currentRequestId: string | null = null
					this.mcpCodeBlockProcessor.renderStatus(el, 'executing', async () => {
						if (currentRequestId && this.mcpExecutor) {
							await this.mcpExecutor.cancelExecution(currentRequestId)
							// Update status to show cancelled
							if (this.mcpCodeBlockProcessor) {
								this.mcpCodeBlockProcessor.renderError(el, {
									message: 'Tool execution was cancelled by user',
									timestamp: Date.now()
								})
							}
						}
					})

					try {
						// Execute tool and capture request ID for cancellation
						const resultWithId = await this.mcpExecutor.executeToolWithId(request)
						currentRequestId = resultWithId.requestId

						// Render result
						if (this.mcpCodeBlockProcessor) {
							this.mcpCodeBlockProcessor.renderResult(el, resultWithId, {
								showMetadata: true,
								collapsible: resultWithId.contentType === 'json'
							})
						}
					} catch (error) {
						currentRequestId = null // Clear on error
						// Render error
						if (this.mcpCodeBlockProcessor) {
							this.mcpCodeBlockProcessor.renderError(el, {
								message: error instanceof Error ? error.message : String(error),
								timestamp: Date.now()
							})
						}
					}
				})
			})

			// Register MCP commands
			const mcpCommands = getMCPCommands(this.mcpExecutor)
			mcpCommands.forEach((cmd) => this.addCommand(cmd))

			// Register Tool Browser command
			this.addCommand({
				id: 'browse-mcp-tools',
				name: 'Browse MCP Tools',
				editorCallback: (editor) => {
					const { ToolBrowserModal } = require('./modals/toolBrowserModal')
					new ToolBrowserModal(this.app, this.mcpManager, editor).open()
				}
			})

			// Register Insert MCP Tool Call command (Feature-400-40)
			this.addCommand({
				id: 'insert-mcp-tool-call',
				name: 'Insert MCP Tool Call Template',
				editorCallback: async (editor) => {
					await this.insertToolCallTemplate(editor)
				}
			})

			// Start health check timer
			this.mcpHealthCheckInterval = setInterval(async () => {
				if (this.mcpManager) {
					try {
						await this.mcpManager.performHealthCheck()
						this.updateMCPStatus()
					} catch (error) {
						logger.warn('mcp health check failed', error)
					}
				}
			}, HEALTH_CHECK_INTERVAL)

			// Start initialization in background - don't block plugin activation
			this.mcpManager.initialize(this.settings.mcpServers, {
				failureThreshold: this.settings.mcpFailureThreshold,
				retryPolicy: {
					maxAttempts: this.settings.mcpRetryMaxAttempts,
					initialDelay: this.settings.mcpRetryInitialDelay,
					maxDelay: this.settings.mcpRetryMaxDelay,
					backoffMultiplier: this.settings.mcpRetryBackoffMultiplier,
					jitter: this.settings.mcpRetryJitter,
					transientErrorCodes: [
						'ECONNREFUSED',
						'ECONNRESET',
						'ETIMEDOUT',
						'ENOTFOUND',
						'ECONNABORTED',
						'EPIPE',
						'ECONNREFUSED',
						'ENETUNREACH',
						'EHOSTUNREACH'
					]
				},
				statusBarManager: this.statusBarManager
			}).catch(error => {
				logger.error('mcp initialization failed (background)', error)
				new Notice('Some MCP servers failed to start. Check console for details.')
			})

			logger.info('mcp integration setup complete, initializing servers in background', { serverCount: this.settings.mcpServers.length })
		}

		// Update MCP status in status bar if MCP manager is initialized
		if (this.mcpManager) {
			// Set refresh callback for modal (Feature-400-30-10)
			this.statusBarManager.setRefreshCallback(async () => {
				await this.updateMCPStatus()
			})
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

		if (this.mcpManager && this.settings.mcpServers.length > 0) {
			const getServerConfigs = () => this.settings.mcpServers
			this.registerEditorSuggest(new MCPToolSuggest(this.app, this.mcpManager, getServerConfigs))
			this.registerEditorSuggest(new MCPParameterSuggest(this.app, this.mcpManager, getServerConfigs))
		}

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
				logger.info('mcp integration shutdown complete')
			} catch (error) {
				logger.error('error shutting down mcp integration', error)
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
					asstTagCmd(
						tagCmdMeta,
						this.app,
						this.settings,
						this.statusBarManager,
						this.getRequestController(),
						this.mcpManager,
						this.mcpExecutor
					)
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
			logger.info('removed tag commands', { tags: removedTags })
			new Notice(`${t('Removed commands')}: ${removedTags.join(', ')}`)
		}
		const addedTags = toAdd.map((cmdId) => getMeta(cmdId).tag)
		if (addedTags.length > 0) {
			logger.info('added tag commands', { tags: addedTags })
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
			logger.info('removed prompt commands', { titles: removedTitles })
			new Notice(`${t('Removed commands')}: ${removedTitles.join(', ')}`)
		}
		const addedTitles = toAdd.map((t) => t.title)
		if (addedTitles.length > 0) {
			logger.info('added prompt commands', { titles: addedTitles })
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
		this.settings.uiState = {
			...DEFAULT_SETTINGS.uiState,
			...this.settings.uiState
		}

		// Migrate legacy MCP server configs (dockerConfig/deploymentType → executionCommand)
		if (this.settings.mcpServers && this.settings.mcpServers.length > 0) {
			const migratedServers = migrateServerConfigs(this.settings.mcpServers)
			const needsSave = JSON.stringify(migratedServers) !== JSON.stringify(this.settings.mcpServers)

			if (needsSave) {
				this.settings.mcpServers = migratedServers
				await this.saveSettings()
				logger.info('migrated mcp server configs to executionCommand format')
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
			const healthStatus = this.mcpManager?.getHealthStatus(server.id)

			let toolCount = 0
			if (isConnected && client) {
				try {
					const tools = await client.listTools()
					toolCount = tools.length
				} catch (error) {
					logger.debug('could not list tools for server', { serverId: server.id, error })
				}
			}

			return {
				id: server.id,
				name: server.name,
				enabled: server.enabled,
				isConnected,
				toolCount,
				isRetrying: healthStatus?.retryState?.isRetrying ?? false,
				retryAttempt: healthStatus?.retryState?.currentAttempt ?? 0,
				nextRetryAt: healthStatus?.retryState?.nextRetryAt
			}
		})

		const serverDetails = await Promise.all(serverDetailsPromises)

		const runningServers = serverDetails.filter((s) => s.isConnected).length
		const totalServers = servers.length
		const availableTools = serverDetails.reduce((sum, s) => sum + s.toolCount, 0)
		const retryingServers = serverDetails.filter((s) => s.isRetrying).length
		const failedServers = serverDetails.filter((s) => s.enabled && !s.isConnected && !s.isRetrying).length

		// Get active execution count from executor
		const activeExecutions = this.mcpExecutor?.getStats().activeExecutions ?? 0

		this.statusBarManager.setMCPStatus({
			runningServers,
			totalServers,
			availableTools,
			retryingServers,
			failedServers,
			activeExecutions,
			servers: serverDetails
		})
	}

	/**
	 * Insert MCP tool call template (Feature-400-40)
	 */
	private async insertToolCallTemplate(editor: Editor) {
		if (!this.mcpManager) {
			new Notice('MCP is not initialized')
			return
		}

		try {
			// Get all available tools from all servers
			const snapshot = await this.mcpManager.getToolDiscoveryCache().getSnapshot()
			const allTools: Array<{ server: string; serverId: string; tool: any }> = []

			for (const serverEntry of snapshot.servers) {
				for (const tool of serverEntry.tools) {
					allTools.push({
						server: serverEntry.serverName,
						serverId: serverEntry.serverId,
						tool
					})
				}
			}

			if (allTools.length === 0) {
				new Notice('No MCP tools available')
				return
			}

			// Create suggester to pick a tool
			const { SuggestModal } = require('obsidian')

			class ToolPickerModal extends SuggestModal<{ server: string; serverId: string; tool: any }> {
				constructor(
					app: any,
					private tools: Array<{ server: string; serverId: string; tool: any }>,
					private onSelect: (item: { server: string; serverId: string; tool: any }) => void
				) {
					super(app)
					this.setPlaceholder('Select a tool to insert...')
				}

				getSuggestions(query: string) {
					const lowerQuery = query.toLowerCase()
					return this.tools.filter(
						(item) =>
							item.tool.name.toLowerCase().includes(lowerQuery) ||
							item.server.toLowerCase().includes(lowerQuery) ||
							(item.tool.description && item.tool.description.toLowerCase().includes(lowerQuery))
					)
				}

				renderSuggestion(item: { server: string; serverId: string; tool: any }, el: HTMLElement) {
					el.createDiv({ text: `${item.tool.name}`, cls: 'suggestion-title' })
					el.createDiv({ text: `${item.server}${item.tool.description ? ` - ${item.tool.description}` : ''}`, cls: 'suggestion-note' })
				}

				onChooseSuggestion(item: { server: string; serverId: string; tool: any }) {
					this.onSelect(item)
				}
			}

			new ToolPickerModal(this.app, allTools, (selected) => {
				this.generateAndInsertTemplate(editor, selected.server, selected.tool)
			}).open()
		} catch (error) {
			logger.error('failed to insert tool call template', error)
			new Notice('Failed to insert tool call template')
		}
	}

	/**
	 * Generate and insert tool call template with parameter placeholders
	 */
	private generateAndInsertTemplate(editor: Editor, serverName: string, tool: any) {
		const { buildParameterPlaceholder } = require('./suggests/mcpToolSuggestHelpers')

		// Build template lines
		const lines: string[] = [`\`\`\`${serverName}`, `tool: ${tool.name}`]

		// Extract parameters from inputSchema
		const inputSchema = tool.inputSchema || {}
		const properties = inputSchema.properties || {}
		const required = inputSchema.required || []

		// Generate parameter lines with placeholders
		const parameters = Object.keys(properties).map((name) => {
			const property = properties[name]
			return {
				name,
				type: property.type || 'any',
				description: property.description || '',
				required: required.includes(name),
				example: property.example
			}
		})

		// Add required parameters first, then optional ones
		const sortedParams = parameters.sort((a, b) => {
			if (a.required && !b.required) return -1
			if (!a.required && b.required) return 1
			return 0
		})

		for (const param of sortedParams) {
			const placeholder = buildParameterPlaceholder(param)
			const comment = param.required ? '' : ' # optional'
			lines.push(`${param.name}: ${placeholder}${comment}`)
		}

		lines.push('```')

		// Insert template at cursor
		const cursor = editor.getCursor()
		const template = lines.join('\n')
		editor.replaceRange(template, cursor)

		// Move cursor to first parameter value position (after "tool: ")
		editor.setCursor({
			line: cursor.line + 2,
			ch: `${sortedParams[0]?.name || 'tool'}: `.length
		})
	}
}
