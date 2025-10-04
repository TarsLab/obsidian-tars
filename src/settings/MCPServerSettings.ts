import { type App, Notice, Setting, setIcon } from 'obsidian'
import type TarsPlugin from '../main'
import { MCP_CONFIG_EXAMPLES, parseConfigInput, validateConfigInput } from '../mcp/config'
import type { CommandDisplayModeValue } from '../mcp/displayMode'
import {
	CommandDisplayMode,
	commandToRemoteUrl,
	isValidRemoteUrl,
	normalizeDisplayMode,
	remoteUrlToCommand
} from '../mcp/displayMode'
import type { MCPServerConfig } from '../mcp/types'

export class MCPServerSettings {
	private plugin: TarsPlugin
	private onSettingsChanged?: () => void

	constructor(_app: App, plugin: TarsPlugin, onSettingsChanged?: () => void) {
		this.plugin = plugin
		this.onSettingsChanged = onSettingsChanged
	}

	// Helper: Generate unique server name
	private generateUniqueName(baseName: string): string {
		const existingNames = this.plugin.settings.mcpServers.map((s) => s.name)

		// If base name is unique, use it
		if (!existingNames.includes(baseName)) {
			return baseName
		}

		// Otherwise, append number
		let counter = 2
		while (existingNames.includes(`${baseName}-${counter}`)) {
			counter++
		}
		return `${baseName}-${counter}`
	}

	// Main render method for MCP settings section
	render(containerEl: HTMLElement): void {
		// MCP Servers collapsible section
		const mcpSection = containerEl.createEl('details')
		mcpSection.createEl('summary', { text: 'MCP Servers', cls: 'tars-setting-h4' })
		// Keep MCP section open by default for better UX
		mcpSection.setAttribute('open', 'true')

		this.renderGlobalSettings(mcpSection)
		this.renderServerList(mcpSection)
		this.renderQuickAddButtons(mcpSection)
		this.renderAddNewServerButton(mcpSection)
	}

	private renderGlobalSettings(containerEl: HTMLElement): void {
		// Global MCP settings
		new Setting(containerEl)
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

		new Setting(containerEl)
			.setName('Concurrent limit')
			.setDesc('Maximum number of tools executing simultaneously (default: 3)')
			.addText((text) =>
				text
					.setPlaceholder('3')
					.setValue(this.plugin.settings.mcpConcurrentLimit?.toString() || '3')
					.onChange(async (value) => {
						const limit = parseInt(value, 10)
						if (!Number.isNaN(limit) && limit > 0) {
							this.plugin.settings.mcpConcurrentLimit = limit
							await this.plugin.saveSettings()
						}
					})
			)

		new Setting(containerEl)
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
	}

	private renderServerList(containerEl: HTMLElement): void {
		// MCP Server list
		if (this.plugin.settings.mcpServers && this.plugin.settings.mcpServers.length > 0) {
			for (const [index, server] of this.plugin.settings.mcpServers.entries()) {
				this.renderServerSection(containerEl, server, index)
			}
		} else {
			new Setting(containerEl).setDesc('No MCP servers configured. Add a server to get started.')
		}
	}

	private renderServerSection(containerEl: HTMLElement, server: MCPServerConfig, index: number): void {
		const serverSection = containerEl.createEl('details', { cls: 'mcp-server-section' })

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

		this.renderServerControls(serverSection, server, index, updateSummary)
		this.renderServerNameInput(serverSection, server, updateSummary)
		this.renderConfigurationSection(serverSection, server)
	}

	private renderServerControls(
		containerEl: HTMLElement,
		server: MCPServerConfig,
		index: number,
		updateSummary: () => void
	): void {
		// First row: Enable/Disable | Test | Delete
		new Setting(containerEl)
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
						// Disable button and show loading state
						btn.setDisabled(true)
						const originalText = btn.buttonEl.textContent || 'Test'
						btn.setButtonText('Testing...')
						new Notice(`Testing ${server.name}...`, 2000)

						try {
							// Validate configuration first
							const validationError = validateConfigInput(server.configInput)
							if (validationError) {
								new Notice(`❌ ${server.name}: Invalid configuration\n${validationError}`, 8000)
								return
							}

							// Parse and convert config to mcp-use format
							const parsed = parseConfigInput(server.configInput)
							if (!parsed || !parsed.mcpUseConfig) {
								new Notice(`❌ ${server.name}: Could not parse configuration`, 5000)
								return
							}

							// Create a temporary test client using mcp-use directly
							const { MCPClient } = await import('mcp-use')
							const testConfig = {
								mcpServers: {
									[server.id]: {
										command: parsed.mcpUseConfig.command,
										args: parsed.mcpUseConfig.args || [],
										env: parsed.mcpUseConfig.env
									}
								}
							}
							const testClient = MCPClient.fromDict(testConfig)

							// Create session and connect
							const session = await testClient.createSession(server.id, true)

							// Get tools from the connector
							// biome-ignore lint/suspicious/noExplicitAny: mcp-use connector type not exported
							const tools = (session.connector as any).tools || []
							const toolCount = tools.length
							const toolNames = tools
								.slice(0, 3)
								// biome-ignore lint/suspicious/noExplicitAny: tool type not exported
								.map((t: any) => t.name)
								.join(', ')
							const more = toolCount > 3 ? ` and ${toolCount - 3} more` : ''

							new Notice(`✅ ${server.name}: Connected!\n${toolCount} tools: ${toolNames}${more}`, 8000)

							// Cleanup test client
							try {
								await session.disconnect()
							} catch (e) {
								console.debug('Error closing test session:', e)
							}
						} catch (error) {
							const msg = error instanceof Error ? error.message : String(error)

							// Build helpful error message based on config
							let helpText = ''
							if (server.configInput.includes('docker')) {
								helpText = '\nTip: Make sure Docker is running'
							} else if (server.configInput.includes('npx') || server.configInput.includes('uvx')) {
								helpText = '\nTip: Check package is installed and env vars are set'
							}

							new Notice(`❌ ${server.name}: Test failed\n${msg}${helpText}`, 10000)
						} finally {
							// Re-enable button and restore original text
							btn.setDisabled(false)
							btn.setButtonText(originalText)
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
						// Re-render the entire settings tab
						this.onSettingsChanged?.()
					})
			)
	}

	private renderServerNameInput(containerEl: HTMLElement, server: MCPServerConfig, updateSummary: () => void): void {
		// Server name with uniqueness validation
		let nameErrorContainer: HTMLElement | null = null
		const showNameError = (message: string) => {
			if (!nameErrorContainer) {
				nameErrorContainer = containerEl.createDiv({ cls: 'mcp-name-error' })
				nameErrorContainer.style.color = 'var(--text-error)'
				nameErrorContainer.style.fontSize = '12px'
				nameErrorContainer.style.marginTop = '4px'
			}
			nameErrorContainer.setText(`⚠️ ${message}`)
		}

		const hideNameError = () => {
			if (nameErrorContainer) {
				nameErrorContainer.remove()
				nameErrorContainer = null
			}
		}

		const isNameUnique = (name: string, currentServerId: string): boolean => {
			return !this.plugin.settings.mcpServers.some((s) => s.id !== currentServerId && s.name === name)
		}

		new Setting(containerEl).setName('Server name').addText((text) => {
			const textInput = text
				.setPlaceholder('my-mcp-server')
				.setValue(server.name)
				.onChange(async (value) => {
					const trimmedName = value.trim()

					// Check if name is unique
					if (!isNameUnique(trimmedName, server.id)) {
						showNameError('Server name must be unique')
						text.inputEl.style.borderColor = 'var(--text-error)'
						return
					}

					hideNameError()
					text.inputEl.style.borderColor = ''
					server.name = trimmedName
					await this.plugin.saveSettings()
					// Update summary with colored status
					updateSummary()
				})

			// Initial validation
			if (!isNameUnique(server.name, server.id)) {
				showNameError('Server name must be unique')
				text.inputEl.style.borderColor = 'var(--text-error)'
			}

			return textInput
		})
	}

	private renderConfigurationSection(containerEl: HTMLElement, server: MCPServerConfig): void {
		// Configuration Input (3 formats)
		new Setting(containerEl).setName('Configuration').setDesc('Supports 3 formats: Command, Claude JSON, or URL')

		const configContainer = containerEl.createDiv({ cls: 'mcp-config-container' })

		const simpleContainer = configContainer.createDiv({ cls: 'mcp-config-simple' })
		const simpleInputId = `mcp-config-simple-${server.id}`
		const simpleLabel = simpleContainer.createEl('label', {
			text: 'Remote URL',
			cls: 'mcp-config-simple-label'
		})
		simpleLabel.setAttr('for', simpleInputId)
		const simpleInput = simpleContainer.createEl('input', {
			type: 'text',
			cls: 'mcp-config-simple-input',
			placeholder: 'https://mcp.example.com'
		}) as HTMLInputElement
		simpleInput.id = simpleInputId
		simpleInput.style.width = '100%'
		simpleInput.style.boxSizing = 'border-box'
		simpleInput.style.marginBottom = '8px'

		const textareaContainer = configContainer.createDiv({ cls: 'mcp-textarea-container' })
		const textarea = textareaContainer.createEl('textarea', {
			placeholder: `${MCP_CONFIG_EXAMPLES.command.examples.join('\n\n')}\n\nOr:\n\n${MCP_CONFIG_EXAMPLES.json.example}`,
			cls: 'mcp-execution-textarea'
		}) as HTMLTextAreaElement
		textarea.rows = 10
		textarea.style.width = '100%'
		textarea.style.fontFamily = 'monospace'
		textarea.style.fontSize = '13px'

		const previewContainer = configContainer.createDiv({ cls: 'mcp-conversion-preview' })
		previewContainer.style.marginTop = '8px'
		previewContainer.style.fontFamily = 'monospace'
		previewContainer.style.fontSize = '12px'
		previewContainer.style.whiteSpace = 'pre-wrap'
		previewContainer.style.display = 'none'

		const feedbackContainer = configContainer.createDiv({ cls: 'mcp-config-feedback' })

		let errorContainer: HTMLElement | null = null
		const showError = (errorMsg: string) => {
			if (!errorContainer) {
				errorContainer = feedbackContainer.createDiv({ cls: 'mcp-error-container' })
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

		let formatInfoContainer: HTMLElement | null = null
		const showFormatInfo = (input: string) => {
			const parsed = parseConfigInput(input)
			if (!formatInfoContainer) {
				formatInfoContainer = feedbackContainer.createDiv({ cls: 'mcp-format-info' })
				formatInfoContainer.style.marginTop = '8px'
				formatInfoContainer.style.fontSize = '12px'
				formatInfoContainer.style.color = 'var(--text-muted)'
			}
			formatInfoContainer.empty()
			if (!parsed) {
				formatInfoContainer.setText('❌ Could not parse config')
				return
			}
			if (parsed.error) {
				formatInfoContainer.setText(`❌ ${parsed.error}`)
				return
			}
			formatInfoContainer.setText(
				`✓ Detected: ${parsed.type.toUpperCase()} format | Server: ${parsed.serverName || 'N/A'}`
			)
		}

		const hideFormatInfo = () => {
			if (formatInfoContainer) {
				formatInfoContainer.remove()
				formatInfoContainer = null
			}
		}

		const updatePreviewFromUrl = (value: string) => {
			const trimmed = value.trim()
			previewContainer.empty()
			if (!trimmed) {
				previewContainer.setText('Enter a URL to preview the generated command.')
				return
			}
			if (!isValidRemoteUrl(trimmed)) {
				previewContainer.setText('Waiting for a valid http(s) URL to generate the command preview.')
				return
			}
			previewContainer.createEl('pre', {
				text: remoteUrlToCommand(trimmed),
				cls: 'mcp-command-preview'
			})
		}

		const setSimpleViewFromCommand = () => {
			const derivedUrl = commandToRemoteUrl(server.configInput || '')
			simpleInput.value = derivedUrl || ''
		}

		const setDisplayModeVisibility = (mode: CommandDisplayModeValue) => {
			if (mode === CommandDisplayMode.Simple) {
				simpleContainer.style.display = ''
				textareaContainer.style.display = 'none'
				previewContainer.style.display = ''
				updatePreviewFromUrl(simpleInput.value)
			} else {
				simpleContainer.style.display = 'none'
				textareaContainer.style.display = ''
				previewContainer.style.display = 'none'
			}
		}

		textarea.value = server.configInput || ''
		setSimpleViewFromCommand()
		let currentMode = normalizeDisplayMode(server.displayMode)
		server.displayMode = currentMode
		setDisplayModeVisibility(currentMode)

		simpleInput.addEventListener('input', async (event) => {
			const target = event.target as HTMLInputElement
			const value = target.value
			updatePreviewFromUrl(value)
			const trimmed = value.trim()
			if (!trimmed) {
				hideError()
				hideFormatInfo()
				server.configInput = ''
				textarea.value = ''
				await this.plugin.saveSettings()
				return
			}
			if (!isValidRemoteUrl(trimmed)) {
				showError('URL must start with http:// or https://')
				hideFormatInfo()
				return
			}

			hideError()
			const commandValue = remoteUrlToCommand(trimmed)
			server.configInput = commandValue
			textarea.value = commandValue
			await this.plugin.saveSettings()

			const validationError = validateConfigInput(commandValue)
			if (validationError) {
				showError(validationError)
				hideFormatInfo()
				return
			}

			hideError()
			showFormatInfo(commandValue)
		})

		textarea.addEventListener('input', async (e) => {
			const target = e.target as HTMLTextAreaElement
			server.configInput = target.value
			await this.plugin.saveSettings()

			const validationError = validateConfigInput(target.value)
			if (validationError) {
				showError(validationError)
				hideFormatInfo()
			} else {
				hideError()
				if (target.value.trim()) {
					showFormatInfo(target.value)
				} else {
					hideFormatInfo()
				}
			}

			setSimpleViewFromCommand()
			if (normalizeDisplayMode(server.displayMode) === CommandDisplayMode.Simple) {
				updatePreviewFromUrl(simpleInput.value)
			}
		})

		const displayModeSetting = new Setting(containerEl)
			.setName('Show as command')
			.setDesc('Toggle between simple URL and command views')
			.addToggle((toggle) => {
				toggle.setValue(currentMode === CommandDisplayMode.Command)
				toggle.onChange(async (value) => {
					currentMode = value ? CommandDisplayMode.Command : CommandDisplayMode.Simple
					server.displayMode = currentMode
					await this.plugin.saveSettings()
					if (currentMode === CommandDisplayMode.Simple) {
						setSimpleViewFromCommand()
					}
					setDisplayModeVisibility(currentMode)
				})
			})

		containerEl.insertBefore(displayModeSetting.settingEl, configContainer)

		const initialError = validateConfigInput(server.configInput || '')
		if (initialError) {
			showError(initialError)
		} else if (server.configInput) {
			showFormatInfo(server.configInput)
			if (currentMode === CommandDisplayMode.Simple) {
				updatePreviewFromUrl(simpleInput.value)
			}
		}
	}

	private renderQuickAddButtons(containerEl: HTMLElement): void {
		// Promoted MCP servers
		new Setting(containerEl)
			.setName('Quick Add Popular Servers')
			.setDesc('One-click add pre-configured MCP servers')
			.addButton((btn) =>
				btn.setButtonText('+ Exa Search').onClick(async () => {
					const server: MCPServerConfig = {
						id: `mcp-exa-${Date.now()}`,
						name: this.generateUniqueName('exa'),
						configInput: JSON.stringify(
							{
								mcpServers: {
									exa: {
										command: 'npx',
										args: ['-y', 'exa-mcp-server'],
										env: {
											EXA_API_KEY: '{env:EXA_API_KEY}'
										}
									}
								}
							},
							null,
							2
						),
						displayMode: 'command',
						enabled: false,
						failureCount: 0,
						autoDisabled: false
					}
					this.plugin.settings.mcpServers.push(server)
					await this.plugin.saveSettings()
					new Notice('Exa Search MCP server added! Set EXA_API_KEY environment variable and enable the server.')
					// Re-render the entire settings tab
					this.onSettingsChanged?.()
				})
			)
			.addButton((btn) =>
				btn.setButtonText('+ Filesystem Server').onClick(async () => {
					const server: MCPServerConfig = {
						id: `mcp-filesystem-${Date.now()}`,
						name: this.generateUniqueName('filesystem'),
						configInput: 'npx -y @modelcontextprotocol/server-filesystem /path/to/files',
						displayMode: 'command',
						enabled: false,
						failureCount: 0,
						autoDisabled: false
					}
					this.plugin.settings.mcpServers.push(server)
					await this.plugin.saveSettings()
					new Notice('Filesystem MCP server added! Update the path in configuration.')
					// Re-render the entire settings tab
					this.onSettingsChanged?.()
				})
			)
	}

	private renderAddNewServerButton(containerEl: HTMLElement): void {
		// Add new server button
		new Setting(containerEl).addButton((btn) =>
			btn.setButtonText('Add Custom MCP Server').onClick(async () => {
				const newServer: MCPServerConfig = {
					id: `mcp-server-${Date.now()}`,
					name: this.generateUniqueName('my-server'),
					configInput: '',
					displayMode: 'command',
					enabled: false,
					failureCount: 0,
					autoDisabled: false
				}
				this.plugin.settings.mcpServers.push(newServer)
				await this.plugin.saveSettings()
				// Re-render the entire settings tab
				this.onSettingsChanged?.()
			})
		)
	}
}
