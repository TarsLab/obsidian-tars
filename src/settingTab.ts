import { type App, Notice, PluginSettingTab, requestUrl, Setting, setIcon } from 'obsidian'
import { exportCmd, replaceCmd, replaceCmdId } from './commands'
import { exportCmdId } from './commands/export'
import { t } from './lang/helper'
import type TarsPlugin from './main'
import { type MCPServerConfig, TransportProtocol } from './mcp/types'
import { parseExecutionCommand } from './mcp/utils'
import { SelectModelModal, SelectVendorModal } from './modal'
import type { BaseOptions, Optional, ProviderSettings, Vendor } from './providers'
import { type ClaudeOptions, claudeVendor } from './providers/claude'
import { type GptImageOptions, gptImageVendor } from './providers/gptImage'
import { grokVendor } from './providers/grok'
import { kimiVendor } from './providers/kimi'
import { ollamaVendor } from './providers/ollama'
import { openRouterVendor } from './providers/openRouter'
import { siliconFlowVendor } from './providers/siliconflow'
import { getCapabilityEmoji } from './providers/utils'
import { availableVendors, DEFAULT_SETTINGS } from './settings'

export class TarsSettingTab extends PluginSettingTab {
	plugin: TarsPlugin

	constructor(app: App, plugin: TarsPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	hide(): void {
		this.plugin.buildTagCommands()
	}

	display(expandLastProvider = false): void {
		const { containerEl } = this
		containerEl.empty()

		new Setting(containerEl).setName(t('AI assistants')).setHeading()

		new Setting(containerEl)
			.setName(t('New AI assistant'))
			.setDesc(t('For those compatible with the OpenAI protocol, you can select OpenAI.'))
			.addButton((btn) => {
				btn.setButtonText(t('Add AI Provider')).onClick(async () => {
					const onChoose = async (vendor: Vendor) => {
						const defaultTag = vendor.name
						const isTagDuplicate = this.plugin.settings.providers.map((e) => e.tag).includes(defaultTag)
						const newTag = isTagDuplicate ? '' : defaultTag

						const deepCopiedOptions = JSON.parse(JSON.stringify(vendor.defaultOptions))
						this.plugin.settings.providers.push({
							tag: newTag,
							vendor: vendor.name,
							options: deepCopiedOptions
						})
						// Initially, vendor and tag might be the same, but vendor is read-only to mark vendor type, while tag can be modified by users
						await this.plugin.saveSettings()
						this.display(true)
					}
					new SelectVendorModal(this.app, availableVendors, onChoose).open()
				})
			})

		if (!this.plugin.settings.providers.length) {
			new Setting(containerEl).setDesc(t('Please add at least one AI assistant to start using the plugin.'))
		}

		for (const [index, provider] of this.plugin.settings.providers.entries()) {
			const isLast = index === this.plugin.settings.providers.length - 1
			this.createProviderSetting(index, provider, isLast && expandLastProvider)
		}

		containerEl.createEl('br')
		new Setting(containerEl)
			.setName(t('Message tags'))
			.setDesc(t('Keywords for tags in the text box are separated by spaces'))
			.setHeading()

		let newChatTagsInput: HTMLInputElement | null = null
		new Setting(containerEl)
			.setName(`${this.plugin.settings.roleEmojis.newChat} ${t('New chat tags')}`)
			.addExtraButton((btn) => {
				btn
					.setIcon('reset')
					.setTooltip(t('Restore default'))
					.onClick(async () => {
						this.plugin.settings.newChatTags = DEFAULT_SETTINGS.newChatTags
						await this.plugin.saveSettings()
						if (newChatTagsInput) {
							newChatTagsInput.value = this.plugin.settings.newChatTags.join(' ')
						}
					})
			})
			.addText((text) => {
				newChatTagsInput = text.inputEl
				text
					.setPlaceholder(DEFAULT_SETTINGS.newChatTags.join(' '))
					.setValue(this.plugin.settings.newChatTags.join(' '))
					.onChange(async (value) => {
						const tags = value.split(' ').filter((e) => e.length > 0)
						if (!validateTagList(tags)) return
						this.plugin.settings.newChatTags = tags
						await this.plugin.saveSettings()
					})
			})

		let userTagsInput: HTMLInputElement | null = null
		new Setting(containerEl)
			.setName(`${this.plugin.settings.roleEmojis.user} ${t('User message tags')}`)
			.addExtraButton((btn) => {
				btn
					.setIcon('reset')
					.setTooltip(t('Restore default'))
					.onClick(async () => {
						this.plugin.settings.userTags = DEFAULT_SETTINGS.userTags
						await this.plugin.saveSettings()
						if (userTagsInput) {
							userTagsInput.value = this.plugin.settings.userTags.join(' ')
						}
					})
			})
			.addText((text) => {
				userTagsInput = text.inputEl
				text
					.setPlaceholder(DEFAULT_SETTINGS.userTags.join(' '))
					.setValue(this.plugin.settings.userTags.join(' '))
					.onChange(async (value) => {
						const tags = value.split(' ').filter((e) => e.length > 0)
						if (!validateTagList(tags)) return
						this.plugin.settings.userTags = tags
						await this.plugin.saveSettings()
					})
			})

		let systemTagsInput: HTMLInputElement | null = null
		new Setting(containerEl)
			.setName(`${this.plugin.settings.roleEmojis.system} ${t('System message tags')}`)
			.addExtraButton((btn) => {
				btn
					.setIcon('reset')
					.setTooltip(t('Restore default'))
					.onClick(async () => {
						this.plugin.settings.systemTags = DEFAULT_SETTINGS.systemTags
						await this.plugin.saveSettings()
						if (systemTagsInput) {
							systemTagsInput.value = this.plugin.settings.systemTags.join(' ')
						}
					})
			})
			.addText((text) => {
				systemTagsInput = text.inputEl
				text
					.setPlaceholder(DEFAULT_SETTINGS.systemTags.join(' '))
					.setValue(this.plugin.settings.systemTags.join(' '))
					.onChange(async (value) => {
						const tags = value.split(' ').filter((e) => e.length > 0)
						if (!validateTagList(tags)) return
						this.plugin.settings.systemTags = tags
						await this.plugin.saveSettings()
					})
			})

		containerEl.createEl('br')

		new Setting(containerEl).setName(t('System message')).setHeading()
		let defaultSystemMsgInput: HTMLTextAreaElement | null = null
		new Setting(containerEl)
			.setName(t('Enable default system message'))
			.setDesc(t('Automatically add a system message when none exists in the conversation'))
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableDefaultSystemMsg).onChange(async (value) => {
					this.plugin.settings.enableDefaultSystemMsg = value
					await this.plugin.saveSettings()
					if (defaultSystemMsgInput) {
						defaultSystemMsgInput.disabled = !value
					}
				})
			)

		new Setting(containerEl).setName(t('Default system message')).addTextArea((textArea) => {
			defaultSystemMsgInput = textArea.inputEl
			textArea
				.setDisabled(!this.plugin.settings.enableDefaultSystemMsg)
				.setValue(this.plugin.settings.defaultSystemMsg)
				.onChange(async (value) => {
					this.plugin.settings.defaultSystemMsg = value.trim()
					await this.plugin.saveSettings()
				})
		})

		containerEl.createEl('br')

		new Setting(containerEl)
			.setName(t('Confirm before regeneration'))
			.setDesc(t('Confirm before replacing existing assistant responses when using assistant commands'))
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.confirmRegenerate).onChange(async (value) => {
					this.plugin.settings.confirmRegenerate = value
					await this.plugin.saveSettings()
				})
			)

		new Setting(containerEl)
			.setName(t('Internal links'))
			.setDesc(
				t(
					'Internal links in user and system messages will be replaced with their referenced content. When disabled, only the original text of the links will be used.'
				)
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableInternalLink).onChange(async (value) => {
					this.plugin.settings.enableInternalLink = value
					await this.plugin.saveSettings()
				})
			)

		containerEl.createEl('br')

		const advancedSection = containerEl.createEl('details')
		advancedSection.createEl('summary', { text: t('Advanced'), cls: 'tars-setting-h4' })

		new Setting(advancedSection)
			.setName(t('Internal links for assistant messages'))
			.setDesc(
				t(
					'Replace internal links in assistant messages with their referenced content. Note: This feature is generally not recommended as assistant-generated content may contain non-existent links.'
				)
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableInternalLinkForAssistantMsg ?? false).onChange(async (value) => {
					this.plugin.settings.enableInternalLinkForAssistantMsg = value
					await this.plugin.saveSettings()
				})
			)

		let answerDelayInput: HTMLInputElement | null = null
		new Setting(advancedSection)
			.setName(t('Delay before answer (Seconds)'))
			.setDesc(
				t(
					'If you encounter errors with missing user messages when executing assistant commands on selected text, it may be due to the need for more time to parse the messages. Please slightly increase the delay time.'
				)
			)
			.addExtraButton((btn) => {
				btn
					.setIcon('reset')
					.setTooltip(t('Restore default'))
					.onClick(async () => {
						this.plugin.settings.answerDelayInMilliseconds = DEFAULT_SETTINGS.answerDelayInMilliseconds
						await this.plugin.saveSettings()
						if (answerDelayInput) {
							answerDelayInput.value = (this.plugin.settings.answerDelayInMilliseconds / 1000).toString()
						}
					})
			})
			.addSlider((slider) => {
				answerDelayInput = slider.sliderEl
				slider
					.setLimits(1.5, 4, 0.5)
					.setValue(this.plugin.settings.answerDelayInMilliseconds / 1000)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.answerDelayInMilliseconds = Math.round(value * 1000)
						await this.plugin.saveSettings()
					})
			})

		new Setting(advancedSection)
			.setName(t('Replace tag Command'))
			.setDesc(t('Replace the names of the two most frequently occurring speakers with tag format.'))
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableReplaceTag).onChange(async (value) => {
					this.plugin.settings.enableReplaceTag = value
					await this.plugin.saveSettings()
					if (value) {
						this.plugin.addCommand(replaceCmd(this.app))
					} else {
						this.plugin.removeCommand(replaceCmdId)
					}
				})
			)

		new Setting(advancedSection)
			.setName(t('Export to JSONL Command'))
			.setDesc(t('Export conversations to JSONL'))
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableExportToJSONL).onChange(async (value) => {
					this.plugin.settings.enableExportToJSONL = value
					await this.plugin.saveSettings()
					if (value) {
						this.plugin.addCommand(exportCmd(this.app, this.plugin.settings))
					} else {
						this.plugin.removeCommand(exportCmdId)
					}
				})
			)

		new Setting(advancedSection)
			.setName(t('Tag suggest'))
			.setDesc(
				t(
					'If you only use commands without needing tag suggestions, you can disable this feature. Changes will take effect after restarting the plugin.'
				)
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableTagSuggest).onChange(async (value) => {
					this.plugin.settings.enableTagSuggest = value
					await this.plugin.saveSettings()
				})
			)

		// MCP Server Integration Settings
		containerEl.createEl('br')

		// MCP Servers collapsible section
		const mcpSection = containerEl.createEl('details')
		mcpSection.createEl('summary', { text: 'MCP Servers', cls: 'tars-setting-h4' })

		// Global MCP settings
		new Setting(mcpSection)
			.setName('Global timeout (ms)')
			.setDesc('Maximum time to wait for tool execution (default: 30000ms)')
			.addText((text) =>
				text
					.setPlaceholder('30000')
					.setValue(this.plugin.settings.mcpGlobalTimeout?.toString() || '30000')
					.onChange(async (value) => {
						const timeout = parseInt(value, 10)
						if (!Number.isNaN(timeout) && timeout > 0) {
							this.plugin.settings.mcpGlobalTimeout = timeout
							await this.plugin.saveSettings()
						}
					})
			)

		new Setting(mcpSection)
			.setName('Concurrent limit')
			.setDesc('Maximum number of tools executing simultaneously (default: 25)')
			.addText((text) =>
				text
					.setPlaceholder('25')
					.setValue(this.plugin.settings.mcpConcurrentLimit?.toString() || '25')
					.onChange(async (value) => {
						const limit = parseInt(value, 10)
						if (!Number.isNaN(limit) && limit > 0) {
							this.plugin.settings.mcpConcurrentLimit = limit
							await this.plugin.saveSettings()
						}
					})
			)

		new Setting(mcpSection)
			.setName('Session limit')
			.setDesc('Maximum total tool executions per session, -1 for unlimited (default: 25)')
			.addText((text) =>
				text
					.setPlaceholder('25')
					.setValue(this.plugin.settings.mcpSessionLimit?.toString() || '25')
					.onChange(async (value) => {
						const limit = parseInt(value, 10)
						if (!Number.isNaN(limit) && limit >= -1) {
							this.plugin.settings.mcpSessionLimit = limit
							await this.plugin.saveSettings()
						}
					})
			)

		// MCP Server list
		if (this.plugin.settings.mcpServers && this.plugin.settings.mcpServers.length > 0) {
			for (const [index, server] of this.plugin.settings.mcpServers.entries()) {
				const serverSection = mcpSection.createEl('details', { cls: 'mcp-server-section' })
				
				// Determine server status and CSS class
				let statusText = ''
				let statusClass = ''
				if (server.autoDisabled) {
					statusText = '✗ Error'
					statusClass = 'mcp-status-error'
				} else if (server.enabled) {
					statusText = '✓ Enabled'
					statusClass = 'mcp-status-enabled'
				} else {
					statusText = '✗ Disabled'
					statusClass = 'mcp-status-disabled'
				}
				
				const serverSummary = serverSection.createEl('summary', { cls: 'mcp-server-summary' })
				serverSummary.createSpan({ text: server.name })
				serverSummary.createSpan({ text: ` (${statusText})`, cls: statusClass })

				// Helper function to update summary with colored status
				const updateSummary = () => {
					let statusText = ''
					let statusClass = ''
					if (server.autoDisabled) {
						statusText = '✗ Error'
						statusClass = 'mcp-status-error'
					} else if (server.enabled) {
						statusText = '✓ Enabled'
						statusClass = 'mcp-status-enabled'
					} else {
						statusText = '✗ Disabled'
						statusClass = 'mcp-status-disabled'
					}
					serverSummary.empty()
					serverSummary.createSpan({ text: server.name })
					serverSummary.createSpan({ text: ` (${statusText})`, cls: statusClass })
				}

				// First row: Enable/Disable | Test | Delete
				new Setting(serverSection)
					.setName('Controls')
					.addButton((btn) => {
						const buttonEl = btn
							.setButtonText(server.enabled ? 'Disable' : 'Enable')
							.setClass('mcp-control-button')
							.setTooltip(server.enabled ? 'Disable server' : 'Enable server')
							.onClick(async () => {
								server.enabled = !server.enabled
								await this.plugin.saveSettings()

								// Update button text and tooltip
								btn.setButtonText(server.enabled ? 'Disable' : 'Enable')
								btn.setTooltip(server.enabled ? 'Disable server' : 'Enable server')

								// Update summary with colored status
								updateSummary()

								// Reinitialize MCP manager
								if (this.plugin.mcpManager) {
									await this.plugin.mcpManager.shutdown()
									await this.plugin.mcpManager.initialize(this.plugin.settings.mcpServers)
								}
							})
						return buttonEl
					})
					.addButton((btn) =>
						btn
							.setButtonText('Test')
							.setClass('mcp-control-button')
							.setTooltip('Test server connection')
							.onClick(async () => {
								new Notice(`Testing ${server.name}...`)

								try {
									if (!this.plugin.mcpManager) {
										new Notice('❌ MCP Manager not initialized', 5000)
										return
									}

									// Try to start the server if not already started
									try {
										await this.plugin.mcpManager.startServer(server.id)
									} catch (startError) {
										// Server might already be running, that's ok
										console.debug('Server start attempt:', startError)
									}

									// Wait a moment for connection to establish
									await new Promise((resolve) => setTimeout(resolve, 1000))

									const client = this.plugin.mcpManager.getClient(server.id)

									if (client?.isConnected()) {
										const tools = await client.listTools()
										const toolCount = tools.length
										const toolNames = tools
											.slice(0, 3)
											.map((t: { name: string }) => t.name)
											.join(', ')
										const more = toolCount > 3 ? ` and ${toolCount - 3} more` : ''
										new Notice(`✅ ${server.name}: Connected!\n${toolCount} tools available: ${toolNames}${more}`, 8000)
									} else {
										const health = this.plugin.mcpManager.getHealthStatus(server.id)
										const stateStr = health?.connectionState || 'unknown'
										new Notice(
											`❌ ${server.name}: Not connected\nState: ${stateStr}\n\nCheck Docker is running and image is available:\ndocker pull mcp/memory:latest`,
											10000
										)
									}
								} catch (error) {
									const msg = error instanceof Error ? error.message : String(error)
									new Notice(`❌ Test failed: ${msg}`, 8000)
								}
							})
					)
					.addButton((btn) =>
						btn
							.setButtonText('Delete')
							.setClass('mcp-control-button')
							.setWarning()
							.setTooltip('Delete this server')
							.onClick(async () => {
								this.plugin.settings.mcpServers.splice(index, 1)
								await this.plugin.saveSettings()
								if (this.plugin.mcpManager) {
									await this.plugin.mcpManager.shutdown()
									await this.plugin.mcpManager.initialize(this.plugin.settings.mcpServers)
								}
								this.display()
							})
					)

				// Server name
				new Setting(serverSection).setName('Server name').addText((text) =>
					text
						.setPlaceholder('my-mcp-server')
						.setValue(server.name)
						.onChange(async (value) => {
							server.name = value
							await this.plugin.saveSettings()
							// Update summary with colored status
							updateSummary()
						})
				)

				// Transport
				new Setting(serverSection)
					.setName('Transport')
					.setDesc('Communication protocol (stdio for local, sse for remote)')
					.addDropdown((dropdown) =>
						dropdown
							.addOptions({ stdio: 'stdio', sse: 'SSE' })
							.setValue(server.transport)
							.onChange(async (value) => {
								server.transport = value as TransportProtocol
								await this.plugin.saveSettings()
							})
					)

				// Execution command, JSON, or URL
				new Setting(serverSection)
					.setName('Execution Command, JSON Or URL')
					.setDesc(
						'Provide one of: 1) Shell command (e.g., "docker run..."), 2) VS Code MCP JSON config, or 3) URL for remote server (e.g., "http://localhost:3000/sse")'
					)

				// Create textarea in a separate container for full-width layout
				const textareaContainer = serverSection.createDiv({ cls: 'mcp-textarea-container' })
				const textarea = textareaContainer.createEl('textarea', {
					placeholder: `Examples:

1. Command: docker run -it --rm mcp-server:latest

2. JSON (VS Code format):
{
  "command": "docker",
  "args": ["run", "--name", "mcp-server", "-it", "--rm", "mcp-server:latest"],
  "env": {
    "API_KEY": "secret123",
    "DEBUG": "mcp:*"
  }
}

3. URL: http://localhost:8080/sse`,
					cls: 'mcp-execution-textarea'
				})
				textarea.value = server.executionCommand || ''
				textarea.rows = 8
				textarea.style.width = '100%'
				textarea.style.fontFamily = 'monospace'
				textarea.style.fontSize = '13px'
				
				// Error container for validation messages
				let errorContainer: HTMLElement | null = null
				
				const validateExecutionCommand = (cmd: string): string | null => {
					if (!cmd || !cmd.trim()) {
						return null // Empty is valid
					}
					
					// Try to parse as JSON if it starts with {
					if (cmd.trim().startsWith('{')) {
						try {
							JSON.parse(cmd)
						} catch (e) {
							return `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`
						}
					}
					
					// Try parsing with the actual parser to catch any other issues
					try {
						const testConfig: MCPServerConfig = {
							...server,
							executionCommand: cmd,
							dockerConfig: undefined,
							sseConfig: undefined
						}
						parseExecutionCommand(testConfig)
					} catch (e) {
						return `Parse error: ${e instanceof Error ? e.message : String(e)}`
					}
					
					return null
				}
				
				const showError = (errorMsg: string) => {
					if (!errorContainer) {
						errorContainer = textareaContainer.createDiv({ cls: 'mcp-error-container' })
					}
					errorContainer.empty()
					
					errorContainer.createEl('pre', {
						text: errorMsg,
						cls: 'mcp-error-message'
					})
					
					const copyBtn = errorContainer.createEl('button', { cls: 'mcp-error-copy-btn' })
					setIcon(copyBtn, 'clipboard')
					copyBtn.addEventListener('click', () => {
						navigator.clipboard.writeText(errorMsg)
						new Notice('Error message copied to clipboard')
					})
				}
				
				const hideError = () => {
					if (errorContainer) {
						errorContainer.remove()
						errorContainer = null
					}
				}
				
				textarea.addEventListener('input', async (e) => {
					const target = e.target as HTMLTextAreaElement
					server.executionCommand = target.value
					await this.plugin.saveSettings()
					
					// Validate and show/hide error
					const validationError = validateExecutionCommand(target.value)
					if (validationError) {
						showError(validationError)
					} else {
						hideError()
					}
				})
				
				// Initial validation
				const initialError = validateExecutionCommand(server.executionCommand || '')
				if (initialError) {
					showError(initialError)
				}
			}
		} else {
			new Setting(mcpSection).setDesc('No MCP servers configured. Add a server to get started.')
		}

		// Promoted MCP servers
		new Setting(mcpSection)
			.setName('Promoted MCP Servers')
			.setDesc('Pre-configured popular MCP servers')
			.addButton((btn) =>
				btn.setButtonText('Add Exa Search Server').onClick(async () => {
					const exaServer: MCPServerConfig = {
						id: `mcp-exa-${Date.now()}`,
						name: 'exa-search',
						transport: TransportProtocol.STDIO,
						executionCommand: JSON.stringify({
							command: 'npx',
							args: ['-y', '@exa/mcp-server'],
							env: {
								EXA_API_KEY: 'your-exa-api-key-here'
							}
						}, null, 2),
						enabled: false,
						failureCount: 0,
						autoDisabled: false,
						sectionBindings: []
					}
					this.plugin.settings.mcpServers.push(exaServer)
					await this.plugin.saveSettings()
					new Notice('Exa Search MCP server added! Please update the EXA_API_KEY in the configuration.')
					this.display()
				})
			)

		// Add new server button
		new Setting(mcpSection).addButton((btn) =>
			btn.setButtonText('Add MCP Server').onClick(async () => {
				const newServer: MCPServerConfig = {
					id: `mcp-server-${Date.now()}`,
					name: 'new-server',
					transport: TransportProtocol.STDIO,
					executionCommand: '',
					enabled: false,
					failureCount: 0,
					autoDisabled: false,
					sectionBindings: []
				}
				this.plugin.settings.mcpServers.push(newServer)
				await this.plugin.saveSettings()
				this.display()
			})
		)
	}

	createProviderSetting = (index: number, settings: ProviderSettings, isOpen: boolean = false) => {
		const vendor = availableVendors.find((v) => v.name === settings.vendor)
		if (!vendor) throw new Error(`No vendor found ${settings.vendor}`)
		const { containerEl } = this
		const details = containerEl.createEl('details')
		details.createEl('summary', { text: getSummary(settings.tag, vendor.name), cls: 'tars-setting-h4' })
		details.open = isOpen

		const capabilities =
			t('Supported features') +
			' : ' +
			vendor.capabilities.map((cap) => `${getCapabilityEmoji(cap)} ${t(cap)}`).join('    ')

		this.addTagSection(details, settings, index, vendor.name)

		// model setting
		const modelConfig = MODEL_FETCH_CONFIGS[vendor.name as keyof typeof MODEL_FETCH_CONFIGS]
		if (modelConfig) {
			new Setting(details)
				.setName(t('Model'))
				.setDesc(capabilities)
				.addButton((btn) => {
					btn
						.setButtonText(settings.options.model ? settings.options.model : t('Select the model to use'))
						.onClick(async () => {
							// Check if API key is required but not provided
							if (modelConfig.requiresApiKey && !settings.options.apiKey) {
								new Notice(t('Please input API key first'))
								return
							}
							try {
								const models = await fetchModels(
									modelConfig.url,
									modelConfig.requiresApiKey ? settings.options.apiKey : undefined
								)
								const onChoose = async (selectedModel: string) => {
									settings.options.model = selectedModel
									await this.plugin.saveSettings()
									btn.setButtonText(selectedModel)
								}
								new SelectModelModal(this.app, models, onChoose).open()
							} catch (error) {
								if (error instanceof Error) {
									const errorMessage = error.message.toLowerCase()
									if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
										new Notice(`🔑 ${t('API key may be incorrect. Please check your API key.')}`)
									} else if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
										new Notice(`🚫 ${t('Access denied. Please check your API permissions.')}`)
									} else {
										new Notice(`🔴 ${error.message}`)
									}
								} else {
									new Notice(`🔴 ${String(error)}`)
								}
							}
						})
				})
		} else if (vendor.models.length > 0) {
			this.addModelDropDownSection(details, settings.options, vendor.models, capabilities)
		} else {
			this.addModelTextSection(details, settings.options, capabilities)
		}

		if (vendor.name !== ollamaVendor.name) {
			this.addAPIkeySection(
				details,
				settings.options,
				vendor.websiteToObtainKey ? t('Obtain key from ') + vendor.websiteToObtainKey : ''
			)
		}

		if ('apiSecret' in settings.options)
			this.addAPISecretOptional(details, settings.options as BaseOptions & Pick<Optional, 'apiSecret'>)

		if (vendor.capabilities.includes('Web Search')) {
			new Setting(details)
				.setName(t('Web search'))
				.setDesc(t('Enable web search for AI'))
				.addToggle((toggle) =>
					toggle.setValue(settings.options.enableWebSearch ?? false).onChange(async (value) => {
						settings.options.enableWebSearch = value
						await this.plugin.saveSettings()
					})
				)
		}

		if (vendor.name === claudeVendor.name) {
			this.addClaudeSections(details, settings.options as ClaudeOptions)
		}

		if (vendor.name === gptImageVendor.name) {
			this.addGptImageSections(details, settings.options as GptImageOptions)
		}

		this.addBaseURLSection(details, settings.options, vendor.defaultOptions.baseURL)

		if ('endpoint' in settings.options)
			this.addEndpointOptional(details, settings.options as BaseOptions & Pick<Optional, 'endpoint'>)

		if ('apiVersion' in settings.options)
			this.addApiVersionOptional(details, settings.options as BaseOptions & Pick<Optional, 'apiVersion'>)

		this.addParametersSection(details, settings.options)

		new Setting(details).setName(`${t('Remove')} ${vendor.name}`).addButton((btn) => {
			btn
				.setWarning()
				.setButtonText(t('Remove'))
				.onClick(async () => {
					this.plugin.settings.providers.splice(index, 1)
					await this.plugin.saveSettings()
					this.display()
				})
		})
	}

	addTagSection = (details: HTMLDetailsElement, settings: ProviderSettings, index: number, defaultTag: string) =>
		new Setting(details)
			.setName(`✨ ${t('Assistant message tag')}`)
			.setDesc(t('Tag used to trigger AI text generation'))
			.addText((text) =>
				text
					.setPlaceholder(defaultTag)
					.setValue(settings.tag)
					.onChange(async (value) => {
						const trimmed = value.trim()
						// console.debug('trimmed', trimmed)
						if (trimmed.length === 0) return
						if (!validateTag(trimmed)) return
						const otherTags = this.plugin.settings.providers
							.filter((_e, i) => i !== index)
							.map((e) => e.tag.toLowerCase())
						if (otherTags.includes(trimmed.toLowerCase())) {
							new Notice(t('Keyword for tag must be unique'))
							return
						}

						settings.tag = trimmed
						const summaryElement = details.querySelector('summary')
						if (summaryElement != null) summaryElement.textContent = getSummary(settings.tag, defaultTag) // 更新summary
						await this.plugin.saveSettings()
					})
			)

	addBaseURLSection = (details: HTMLDetailsElement, options: BaseOptions, defaultValue: string) => {
		let textInput: HTMLInputElement | null = null
		new Setting(details)
			.setName('baseURL')
			.setDesc(`${t('Default:')} ${defaultValue}`)
			.addExtraButton((btn) => {
				btn
					.setIcon('reset')
					.setTooltip(t('Restore default'))
					.onClick(async () => {
						options.baseURL = defaultValue
						await this.plugin.saveSettings()
						if (textInput) {
							textInput.value = defaultValue
						}
					})
			})
			.addText((text) => {
				textInput = text.inputEl
				text.setValue(options.baseURL).onChange(async (value) => {
					options.baseURL = value.trim()
					await this.plugin.saveSettings()
				})
			})
	}

	addAPIkeySection = (details: HTMLDetailsElement, options: BaseOptions, desc: string = '') =>
		new Setting(details)
			.setName('API key')
			.setDesc(desc)
			.addText((text) =>
				text
					.setPlaceholder(t('API key (required)'))
					.setValue(options.apiKey)
					.onChange(async (value) => {
						options.apiKey = value.trim()
						await this.plugin.saveSettings()
					})
			)

	addAPISecretOptional = (
		details: HTMLDetailsElement,
		options: BaseOptions & Pick<Optional, 'apiSecret'>,
		desc: string = ''
	) =>
		new Setting(details)
			.setName('API Secret')
			.setDesc(desc)
			.addText((text) =>
				text
					.setPlaceholder('')
					.setValue(options.apiSecret)
					.onChange(async (value) => {
						options.apiSecret = value.trim()
						await this.plugin.saveSettings()
					})
			)

	addModelDropDownSection = (details: HTMLDetailsElement, options: BaseOptions, models: string[], desc: string) =>
		new Setting(details)
			.setName(t('Model'))
			.setDesc(desc)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(
						models.reduce((acc: Record<string, string>, cur: string) => {
							acc[cur] = cur
							return acc
						}, {})
					)
					.setValue(options.model)
					.onChange(async (value) => {
						options.model = value
						await this.plugin.saveSettings()
					})
			)

	addModelTextSection = (details: HTMLDetailsElement, options: BaseOptions, desc: string) =>
		new Setting(details)
			.setName(t('Model'))
			.setDesc(desc)
			.addText((text) =>
				text
					.setPlaceholder('')
					.setValue(options.model)
					.onChange(async (value) => {
						options.model = value.trim()
						await this.plugin.saveSettings()
					})
			)

	addClaudeSections = (details: HTMLDetailsElement, options: ClaudeOptions) => {
		new Setting(details)
			.setName(t('Thinking'))
			.setDesc(t('When enabled, Claude will show its reasoning process before giving the final answer.'))
			.addToggle((toggle) =>
				toggle.setValue(options.enableThinking ?? false).onChange(async (value) => {
					options.enableThinking = value
					await this.plugin.saveSettings()
				})
			)

		new Setting(details)
			.setName(t('Budget tokens for thinking'))
			.setDesc(t('Must be ≥1024 and less than max_tokens'))
			.addText((text) =>
				text
					.setPlaceholder('')
					.setValue(options.budget_tokens ? options.budget_tokens.toString() : '1600')
					.onChange(async (value) => {
						const number = parseInt(value, 10)
						if (Number.isNaN(number)) {
							new Notice(t('Please enter a number'))
							return
						}
						if (number < 1024) {
							new Notice(t('Minimum value is 1024'))
							return
						}
						options.budget_tokens = number
						await this.plugin.saveSettings()
					})
			)

		new Setting(details)
			.setName('Max tokens')
			.setDesc(t('Refer to the technical documentation'))
			.addText((text) =>
				text
					.setPlaceholder('')
					.setValue(options.max_tokens.toString())
					.onChange(async (value) => {
						const number = parseInt(value, 10)
						if (Number.isNaN(number)) {
							new Notice(t('Please enter a number'))
							return
						}
						if (number < 256) {
							new Notice(t('Minimum value is 256'))
							return
						}
						options.max_tokens = number
						await this.plugin.saveSettings()
					})
			)
	}

	addEndpointOptional = (details: HTMLDetailsElement, options: BaseOptions & Pick<Optional, 'endpoint'>) =>
		new Setting(details)
			.setName(t('Endpoint'))
			.setDesc('e.g. https://docs-test-001.openai.azure.com/')
			.addText((text) =>
				text
					.setPlaceholder('')
					.setValue(options.endpoint)
					.onChange(async (value) => {
						const url = value.trim()
						if (url.length === 0) {
							// Empty string is valid, clearing endpoint
							options.endpoint = ''
							await this.plugin.saveSettings()
						} else if (!isValidUrl(url)) {
							new Notice(t('Invalid URL'))
							return
						} else {
							options.endpoint = url
							await this.plugin.saveSettings()
						}
					})
			)

	addApiVersionOptional = (details: HTMLDetailsElement, options: BaseOptions & Pick<Optional, 'apiVersion'>) =>
		new Setting(details)
			.setName(t('API version'))
			.setDesc('e.g. 2024-xx-xx-preview')
			.addText((text) =>
				text
					.setPlaceholder('')
					.setValue(options.apiVersion)
					.onChange(async (value) => {
						options.apiVersion = value.trim()
						await this.plugin.saveSettings()
					})
			)

	addParametersSection = (details: HTMLDetailsElement, options: BaseOptions) =>
		new Setting(details)
			.setName(t('Override input parameters'))
			.setDesc(
				t(
					'Developer feature, in JSON format. For example, if the model list doesn\'t have the model you want, enter {"model": "your desired model"}'
				)
			)
			.addTextArea((text) =>
				text
					.setPlaceholder('{}')
					.setValue(JSON.stringify(options.parameters))
					.onChange(async (value) => {
						try {
							const trimmed = value.trim()
							if (trimmed === '') {
								// Empty string is valid, clearing parameters
								options.parameters = {}
								await this.plugin.saveSettings()
								return
							}
							options.parameters = JSON.parse(trimmed)
							await this.plugin.saveSettings()
						} catch {
							// This is difficult to handle properly - onChange triggers quickly, and users might receive frequent error messages before they finish typing, which is annoying
							return
						}
					})
			)

	addGptImageSections = (details: HTMLDetailsElement, options: GptImageOptions) => {
		new Setting(details)
			.setName(t('Image Display Width'))
			.setDesc(t('Example: 400px width would output as ![[image.jpg|400]]'))
			.addSlider((slider) =>
				slider
					.setLimits(200, 800, 100)
					.setValue(options.displayWidth)
					.setDynamicTooltip()
					.onChange(async (value) => {
						options.displayWidth = value
						await this.plugin.saveSettings()
					})
			)
		new Setting(details)
			.setName(t('Number of images'))
			.setDesc(t('Number of images to generate (1-5)'))
			.addSlider((slider) =>
				slider
					.setLimits(1, 5, 1)
					.setValue(options.n)
					.setDynamicTooltip()
					.onChange(async (value) => {
						options.n = value
						await this.plugin.saveSettings()
					})
			)
		new Setting(details).setName(t('Image size')).addDropdown((dropdown) =>
			dropdown
				.addOptions({
					auto: 'Auto',
					'1024x1024': '1024x1024',
					'1536x1024': `1536x1024 ${t('landscape')}`,
					'1024x1536': `1024x1536 ${t('portrait')}`
				})
				.setValue(options.size)
				.onChange(async (value) => {
					options.size = value as GptImageOptions['size']
					await this.plugin.saveSettings()
				})
		)
		new Setting(details).setName(t('Output format')).addDropdown((dropdown) =>
			dropdown
				.addOptions({
					png: 'PNG',
					jpeg: 'JPEG',
					webp: 'WEBP'
				})
				.setValue(options.output_format)
				.onChange(async (value) => {
					options.output_format = value as GptImageOptions['output_format']
					await this.plugin.saveSettings()
				})
		)
		new Setting(details)
			.setName(t('Quality'))
			.setDesc(t('Quality level for generated images. default: Auto'))
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						auto: t('Auto'),
						high: t('High'),
						medium: t('Medium'),
						low: t('Low')
					})
					.setValue(options.quality)
					.onChange(async (value) => {
						options.quality = value as GptImageOptions['quality']
						await this.plugin.saveSettings()
					})
			)
		new Setting(details)
			.setName(t('Background'))
			.setDesc(t('Background of the generated image. default: Auto'))
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						auto: t('Auto'),
						transparent: t('Transparent'),
						opaque: t('Opaque')
					})
					.setValue(options.background)
					.onChange(async (value) => {
						options.background = value as GptImageOptions['background']
						await this.plugin.saveSettings()
					})
			)
		new Setting(details)
			.setName(t('Output compression'))
			.setDesc(t('Compression level of the output image, 10% - 100%. Only for webp or jpeg output format'))
			.addSlider((slider) =>
				slider
					.setLimits(10, 100, 10)
					.setValue(options.output_compression)
					.setDynamicTooltip()
					.onChange(async (value) => {
						options.output_compression = value
						await this.plugin.saveSettings()
					})
			)
	}
}

const getSummary = (tag: string, defaultTag: string) => (tag === defaultTag ? defaultTag : `${tag} (${defaultTag})`)

const validateTag = (tag: string) => {
	if (tag.includes('#')) {
		new Notice(t('Keyword for tag must not contain #'))
		return false
	}
	if (tag.includes(' ')) {
		new Notice(t('Keyword for tag must not contain space'))
		return false
	}
	return true
}

const validateTagList = (tags: string[]) => {
	if (tags.length === 0) {
		new Notice(t('At least one tag is required'))
		return false
	}
	for (const tag of tags) {
		if (!validateTag(tag)) return false
	}
	return true
}

const isValidUrl = (url: string) => {
	try {
		new URL(url)
		return true
	} catch {
		return false
	}
}

const fetchModels = async (url: string, apiKey?: string): Promise<string[]> => {
	const response = await requestUrl({
		url,
		headers: {
			...(apiKey && { Authorization: `Bearer ${apiKey}` }),
			'Content-Type': 'application/json'
		}
	})
	const result = response.json
	return result.data.map((model: { id: string }) => model.id)
}

// Model fetching configurations for different vendors
const MODEL_FETCH_CONFIGS = {
	[siliconFlowVendor.name]: {
		url: 'https://api.siliconflow.cn/v1/models?type=text&sub_type=chat',
		requiresApiKey: true
	},
	[openRouterVendor.name]: {
		url: 'https://openrouter.ai/api/v1/models',
		requiresApiKey: false
	},
	[kimiVendor.name]: {
		url: 'https://api.moonshot.cn/v1/models',
		requiresApiKey: true
	},
	[grokVendor.name]: {
		url: 'https://api.x.ai/v1/models',
		requiresApiKey: true
	}
} as const
