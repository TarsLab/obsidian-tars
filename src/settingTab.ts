import {
	App,
	Notice,
	PluginSettingTab,
	requestUrl,
	SettingDefinitionItem,
	SettingDefinitionPage,
	SettingDefinitionRender,
	SliderComponent
} from 'obsidian'
import { exportCmd, replaceCmd, replaceCmdId } from './commands'
import { exportCmdId } from './commands/export'
import { t } from './lang/helper'
import TarsPlugin from './main'
import { SelectModelModal, SelectVendorModal } from './modal'
import { BaseOptions, Optional, ProviderSettings, Vendor } from './providers'
import { ClaudeOptions, claudeVendor } from './providers/claude'
import { deepSeekVendor } from './providers/deepSeek'
import { doubaoVendor } from './providers/doubao'
import { GptImageOptions, gptImageVendor } from './providers/gptImage'
import { geminiVendor } from './providers/gemini'
import { grokVendor } from './providers/grok'
import { kimiVendor } from './providers/kimi'
import { longCatVendor } from './providers/longcat'
import { miniMaxVendor } from './providers/minimax'
import { openAIVendor } from './providers/openAI'
import { ollamaVendor } from './providers/ollama'
import { openRouterVendor } from './providers/openRouter'
import { qwenVendor } from './providers/qwen'
import { siliconFlowVendor } from './providers/siliconflow'
import { getCapabilityEmoji } from './providers/utils'
import { zhipuVendor } from './providers/zhipu'
import { availableVendors, DEFAULT_SETTINGS } from './settings'

/** The parts of a rendered settings tab that obsidian.d.ts does not describe. */
interface SettingTabInternals {
	renderedItems?: { type?: string; children?: { settingEl?: HTMLElement }[] }[]
}

export class TarsSettingTab extends PluginSettingTab {
	plugin: TarsPlugin

	constructor(app: App, plugin: TarsPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	hide(): void {
		this.plugin.buildTagCommands()
	}

	/** The whole settings tab. Also what the app indexes for settings search. */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: 'list',
				heading: t('AI assistants'),
				emptyState: t('Please add at least one AI assistant to start using the plugin.'),
				addItem: {
					name: t('Add AI Provider'),
					action: () => this.promptForNewProvider()
				},
				onDelete: (index) => {
					this.plugin.settings.providers.splice(index, 1)
					void this.plugin.saveSettings().then(() => this.update())
				},
				items: this.plugin.settings.providers.map((provider, index) => this.providerPage(index, provider))
			},
			{
				type: 'group',
				heading: t('Message tags'),
				items: this.messageTagsDefs()
			},
			{
				type: 'group',
				heading: t('System message'),
				items: this.systemMessageDefs()
			},
			this.confirmRegenerateDef(),
			this.internalLinksDef(),
			{
				type: 'group',
				heading: t('Advanced'),
				items: this.advancedDefs()
			}
		]
	}

	/** Opens the vendor picker and appends the chosen provider. */
	promptForNewProvider = () => {
		const onChoose = async (vendor: Vendor) => {
			const deepCopiedOptions = JSON.parse(JSON.stringify(vendor.defaultOptions))
			this.plugin.settings.providers.push({
				tag: this.unusedTag(vendor.name),
				vendor: vendor.name,
				options: deepCopiedOptions
			})
			// Initially, vendor and tag might be the same, but vendor is read-only to mark vendor type, while tag can be modified by users
			await this.plugin.saveSettings()
			this.update()
			this.openProviderPage(this.plugin.settings.providers.length - 1)
		}
		new SelectVendorModal(this.app, availableVendors, onChoose).open()
	}

	/**
	 * A tag for a new provider that no other provider is already using.
	 *
	 * The tag is what triggers the assistant, so a provider without one cannot be
	 * used at all — and it is not inert while it waits to be named: an empty tag
	 * registers a command palette entry reading "# :". A second provider of the
	 * same vendor used to be saved with exactly that and left for the user to
	 * notice, so number it instead. Numbering rather than spacing because a tag
	 * may not contain a space.
	 */
	unusedTag = (vendorName: string) => {
		const taken = new Set(this.plugin.settings.providers.map((e) => e.tag.toLowerCase()))
		let tag = vendorName
		for (let n = 2; taken.has(tag.toLowerCase()); n++) tag = vendorName + n
		return tag
	}

	/**
	 * Re-render on the next tick rather than right now, so the interaction that
	 * triggered it finishes first. Dropped if the settings pane closed meanwhile.
	 */
	deferredUpdate = () => {
		window.setTimeout(() => {
			if (this.containerEl.isConnected) this.update()
		}, 0)
	}

	/**
	 * Navigate from a provider's sub-page back to the list.
	 *
	 * The settings modal's closePage() is the only way back and is not part of
	 * obsidian.d.ts, hence the narrow structural type and the optional calls: if a
	 * future release renames it the provider is still removed and the list behind
	 * still refreshes, and the user just presses back themselves.
	 */
	closeProviderPage = () => {
		const setting = (this.app as App & { setting?: { closePage?: () => void } }).setting
		setting?.closePage?.()
	}

	/**
	 * Open a provider's sub-page, the way clicking its row does.
	 *
	 * A provider that was just added does nothing until it has an API key, and its
	 * tag is a generated one that the user will usually want to replace, so staying
	 * on the list leaves both fields a click away. Land on the page instead, where
	 * they are in front of them.
	 *
	 * The settings modal's openPage() wants a page object, and one only exists
	 * once a row has been activated, so the row is the only handle there is.
	 * Neither renderedItems nor that wiring is in obsidian.d.ts, hence the
	 * structural type and the optional calls: if a future release changes either,
	 * the provider is still added and the user opens it themselves.
	 */
	openProviderPage = (index: number) => {
		const rendered = (this as SettingTabInternals).renderedItems
		const list = rendered?.find((item) => item.type === 'list')
		list?.children?.[index]?.settingEl?.click()
	}

	/** One provider rendered as a navigable sub-page. */
	providerPage = (index: number, settings: ProviderSettings): SettingDefinitionPage => {
		const vendor = availableVendors.find((v) => v.name === settings.vendor)
		if (!vendor) throw new Error('No vendor found ' + settings.vendor)
		return {
			type: 'page',
			name: getSummary(settings.tag, vendor.name),
			desc: vendor.capabilities.map((cap) => `${getCapabilityEmoji(cap)} ${t(cap)}`).join('    '),
			displayValue: () => settings.options.model || '',
			status: () => (vendor.name !== ollamaVendor.name && !settings.options.apiKey ? 'warning' : null),
			items: this.providerDefs(index, settings, vendor)
		}
	}

	messageTagsDefs = (): SettingDefinitionRender[] => {
		const tagSetting = (
			name: string,
			read: () => string[],
			write: (tags: string[]) => void,
			defaultValue: string[]
		): SettingDefinitionRender => ({
			name,
			desc: t('Keywords for tags in the text box are separated by spaces'),
			render: (setting) => {
				let input: HTMLInputElement | null = null
				setting
					.addExtraButton((btn) => {
						btn
							.setIcon('reset')
							.setTooltip(t('Restore default'))
							.onClick(async () => {
								write(defaultValue)
								await this.plugin.saveSettings()
								if (input) {
									input.value = defaultValue.join(' ')
								}
							})
					})
					.addText((text) => {
						input = text.inputEl
						text
							.setPlaceholder(defaultValue.join(' '))
							.setValue(read().join(' '))
							.onChange(async (value) => {
								const tags = value.split(' ').filter((e) => e.length > 0)
								if (!validateTagList(tags)) return
								write(tags)
								await this.plugin.saveSettings()
							})
					})
			}
		})

		const { settings } = this.plugin
		return [
			tagSetting(
				settings.roleEmojis.newChat + ' ' + t('New chat tags'),
				() => settings.newChatTags,
				(tags) => (settings.newChatTags = tags),
				DEFAULT_SETTINGS.newChatTags
			),
			tagSetting(
				settings.roleEmojis.user + ' ' + t('User message tags'),
				() => settings.userTags,
				(tags) => (settings.userTags = tags),
				DEFAULT_SETTINGS.userTags
			),
			tagSetting(
				settings.roleEmojis.system + ' ' + t('System message tags'),
				() => settings.systemTags,
				(tags) => (settings.systemTags = tags),
				DEFAULT_SETTINGS.systemTags
			)
		]
	}

	systemMessageDefs = (): SettingDefinitionRender[] => {
		// The toggle drives the textarea's disabled state, so both settings share
		// this reference the same way the original imperative code did.
		let defaultSystemMsgInput: HTMLTextAreaElement | null = null
		return [
			{
				name: t('Enable default system message'),
				desc: t('Automatically add a system message when none exists in the conversation'),
				render: (setting) => {
					setting.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.enableDefaultSystemMsg).onChange(async (value) => {
							this.plugin.settings.enableDefaultSystemMsg = value
							await this.plugin.saveSettings()
							if (defaultSystemMsgInput) {
								defaultSystemMsgInput.disabled = !value
							}
						})
					)
				}
			},
			{
				name: t('Default system message'),
				render: (setting) => {
					setting.addTextArea((textArea) => {
						defaultSystemMsgInput = textArea.inputEl
						textArea
							.setDisabled(!this.plugin.settings.enableDefaultSystemMsg)
							.setValue(this.plugin.settings.defaultSystemMsg)
							.onChange(async (value) => {
								this.plugin.settings.defaultSystemMsg = value.trim()
								await this.plugin.saveSettings()
							})
					})
				}
			}
		]
	}

	confirmRegenerateDef = (): SettingDefinitionRender => ({
		name: t('Confirm before regeneration'),
		desc: t('Confirm before replacing existing assistant responses when using assistant commands'),
		render: (setting) => {
			setting.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.confirmRegenerate).onChange(async (value) => {
					this.plugin.settings.confirmRegenerate = value
					await this.plugin.saveSettings()
				})
			)
		}
	})

	internalLinksDef = (): SettingDefinitionRender => {
		const desc = t(
			'Internal links in user and system messages will be replaced with their referenced content. When disabled, only the original text of the links will be used.'
		)
		return {
			name: t('Internal links'),
			desc,
			render: (setting) => {
				setting.addToggle((toggle) =>
					toggle.setValue(this.plugin.settings.enableInternalLink).onChange(async (value) => {
						this.plugin.settings.enableInternalLink = value
						await this.plugin.saveSettings()
					})
				)
			}
		}
	}

	advancedDefs = (): SettingDefinitionRender[] => [
		{
			name: t('Internal links for assistant messages'),
			desc: t(
				'Replace internal links in assistant messages with their referenced content. Note: This feature is generally not recommended as assistant-generated content may contain non-existent links.'
			),
			render: (setting) => {
				setting.addToggle((toggle) =>
					toggle.setValue(this.plugin.settings.enableInternalLinkForAssistantMsg ?? false).onChange(async (value) => {
						this.plugin.settings.enableInternalLinkForAssistantMsg = value
						await this.plugin.saveSettings()
					})
				)
			}
		},
		{
			name: t('Delay before answer (Seconds)'),
			desc: t(
				'If you encounter errors with missing user messages when executing assistant commands on selected text, it may be due to the need for more time to parse the messages. Please slightly increase the delay time.'
			),
			render: (setting) => {
				// Keep the component, not its sliderEl: assigning to the raw input moves
				// the handle but leaves the value Obsidian prints beside it stale.
				let answerDelaySlider: SliderComponent | null = null
				setting
					.addExtraButton((btn) => {
						btn
							.setIcon('reset')
							.setTooltip(t('Restore default'))
							.onClick(async () => {
								this.plugin.settings.answerDelayInMilliseconds = DEFAULT_SETTINGS.answerDelayInMilliseconds
								await this.plugin.saveSettings()
								answerDelaySlider?.setValue(this.plugin.settings.answerDelayInMilliseconds / 1000)
							})
					})
					.addSlider((slider) => {
						answerDelaySlider = slider
						slider
							.setLimits(1.5, 4, 0.5)
							.setValue(this.plugin.settings.answerDelayInMilliseconds / 1000)
							.onChange(async (value) => {
								this.plugin.settings.answerDelayInMilliseconds = Math.round(value * 1000)
								await this.plugin.saveSettings()
							})
					})
			}
		},
		{
			name: t('Replace tag Command'),
			desc: t('Replace the names of the two most frequently occurring speakers with tag format.'),
			render: (setting) => {
				setting.addToggle((toggle) =>
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
			}
		},
		{
			name: t('Export to JSONL Command'),
			desc: t('Export conversations to JSONL'),
			render: (setting) => {
				setting.addToggle((toggle) =>
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
			}
		},
		{
			name: t('Tag suggest'),
			desc: t(
				'If you only use commands without needing tag suggestions, you can disable this feature. Changes will take effect after restarting the plugin.'
			),
			render: (setting) => {
				setting.addToggle((toggle) =>
					toggle.setValue(this.plugin.settings.enableTagSuggest).onChange(async (value) => {
						this.plugin.settings.enableTagSuggest = value
						await this.plugin.saveSettings()
					})
				)
			}
		}
	]

	// ---------------------------------------------------------------------------
	// Setting definitions, one builder per setting.
	// ---------------------------------------------------------------------------

	tagDef = (settings: ProviderSettings, index: number, defaultTag: string): SettingDefinitionRender => ({
		name: '✨ ' + t('Assistant message tag'),
		desc: t('Tag used to trigger AI text generation'),
		aliases: [settings.tag, defaultTag],
		// The provider page is titled after the tag, but SettingDefinitionPage.name is
		// a plain string rather than a getter, so the title only changes when the tab
		// re-renders. update() rebuilds the rows of the open sub-page along with the
		// list behind it, so calling it from onChange destroys the input being typed
		// into -- which is what made the pane appear to go blank.
		//
		// The cleanup below runs as the page is being left instead, deferred a tick
		// so navigation settles first and the re-render lands on the list, where the
		// new title is what the user is looking at.
		render: (setting) => {
			let tagChanged = false

			setting.addText((text) => {
				text
					.setPlaceholder(defaultTag)
					.setValue(settings.tag)
					.onChange(async (value) => {
						const trimmed = value.trim()
						if (trimmed.length === 0) return
						if (!validateTag(trimmed)) return
						const otherTags = this.plugin.settings.providers
							.filter((e, i) => i !== index)
							.map((e) => e.tag.toLowerCase())
						if (otherTags.includes(trimmed.toLowerCase())) {
							new Notice(t('Keyword for tag must be unique'))
							return
						}

						settings.tag = trimmed
						tagChanged = true
						await this.plugin.saveSettings()
					})
			})

			return () => {
				if (!tagChanged) return
				tagChanged = false
				this.deferredUpdate()
			}
		}
	})

	modelFetchDef = (
		settings: ProviderSettings,
		modelConfig: ModelFetchConfig,
		desc: string
	): SettingDefinitionRender => ({
		name: t('Model'),
		desc,
		render: (setting) => {
			/**
			 * A button that cannot open is a dead end, and the provider behind it may
			 * be perfectly usable — SiliconFlow answers 403 here until an account is
			 * identity-verified and answers questions regardless. Hand the row over to
			 * a text field so the model stays settable.
			 *
			 * Rewriting this row rather than re-rendering the tab, for two reasons: a
			 * failed read describes the network a moment ago and has no business being
			 * remembered, and `deferredUpdate()` is dropped while a provider page is
			 * open — the tab's own containerEl is detached there. Leaving the page and
			 * returning restores the button, which is the retry.
			 */
			const fallBackToTextField = () => {
				setting.clear()
				setting.setDesc('⚠️ ' + t('Could not read the model list. Enter the model name.') + ' ' + desc)
				setting.addText((text) =>
					text
						.setPlaceholder(t('Model'))
						.setValue(settings.options.model)
						.onChange(async (value) => {
							settings.options.model = value.trim()
							await this.plugin.saveSettings()
						})
				)
			}

			setting.addButton((btn) => {
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
								modelConfig,
								settings.options.baseURL,
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
									new Notice('🔑 ' + t('API key may be incorrect. Please check your API key.'))
								} else if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
									new Notice('🚫 ' + t('Access denied. Please check your API permissions.'))
								} else {
									new Notice('🔴 ' + error.message)
								}
							} else {
								new Notice('🔴 ' + String(error))
							}
							fallBackToTextField()
						}
					})
			})
		}
	})

	modelDropDownDef = (options: BaseOptions, models: string[], desc: string): SettingDefinitionRender => ({
		name: t('Model'),
		desc,
		render: (setting) => {
			setting.addDropdown((dropdown) =>
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
		}
	})

	modelTextDef = (options: BaseOptions, desc: string): SettingDefinitionRender => ({
		name: t('Model'),
		desc,
		render: (setting) => {
			setting.addText((text) =>
				text
					.setPlaceholder('')
					.setValue(options.model)
					.onChange(async (value) => {
						options.model = value.trim()
						await this.plugin.saveSettings()
					})
			)
		}
	})

	apiKeyDef = (options: BaseOptions, desc: string = ''): SettingDefinitionRender => ({
		name: 'API key',
		desc,
		render: (setting) => {
			setting.addText((text) =>
				text
					.setPlaceholder(t('API key (required)'))
					.setValue(options.apiKey)
					.onChange(async (value) => {
						options.apiKey = value.trim()
						await this.plugin.saveSettings()
					})
			)
		}
	})

	apiSecretDef = (options: BaseOptions & Pick<Optional, 'apiSecret'>, desc: string = ''): SettingDefinitionRender => ({
		name: 'API secret',
		desc,
		render: (setting) => {
			setting.addText((text) =>
				text
					.setPlaceholder('')
					.setValue(options.apiSecret)
					.onChange(async (value) => {
						options.apiSecret = value.trim()
						await this.plugin.saveSettings()
					})
			)
		}
	})

	webSearchDef = (options: BaseOptions): SettingDefinitionRender => ({
		name: t('Web search'),
		desc: t('Enable web search for AI'),
		render: (setting) => {
			setting.addToggle((toggle) =>
				toggle.setValue(options.enableWebSearch ?? false).onChange(async (value) => {
					options.enableWebSearch = value
					await this.plugin.saveSettings()
				})
			)
		}
	})

	baseURLDef = (options: BaseOptions, defaultValue: string): SettingDefinitionRender => ({
		name: 'Base URL',
		desc: t('Default:') + ' ' + defaultValue,
		render: (setting) => {
			let textInput: HTMLInputElement | null = null
			setting
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
	})

	endpointDef = (options: BaseOptions & Pick<Optional, 'endpoint'>): SettingDefinitionRender => ({
		name: t('Endpoint'),
		desc: 'E.g. https://docs-test-001.openai.azure.com/',
		render: (setting) => {
			setting.addText((text) =>
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
		}
	})

	apiVersionDef = (options: BaseOptions & Pick<Optional, 'apiVersion'>): SettingDefinitionRender => ({
		name: t('API version'),
		desc: 'E.g. 2024-xx-xx-preview',
		render: (setting) => {
			setting.addText((text) =>
				text
					.setPlaceholder('')
					.setValue(options.apiVersion)
					.onChange(async (value) => {
						options.apiVersion = value.trim()
						await this.plugin.saveSettings()
					})
			)
		}
	})

	parametersDef = (options: BaseOptions): SettingDefinitionRender => {
		const desc = t(
			'Developer feature, in JSON format. For example, if the model list doesn\'t have the model you want, enter {"model": "your desired model"}'
		)
		return {
			name: t('Override input parameters'),
			desc,
			render: (setting) => {
				setting.addTextArea((text) =>
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
			}
		}
	}

	claudeDefs = (options: ClaudeOptions): SettingDefinitionRender[] => [
		{
			name: t('Thinking'),
			desc: t('When enabled, Claude will show its reasoning process before giving the final answer.'),
			render: (setting) => {
				setting.addToggle((toggle) =>
					toggle.setValue(options.enableThinking ?? false).onChange(async (value) => {
						options.enableThinking = value
						await this.plugin.saveSettings()
					})
				)
			}
		},
		{
			name: t('Budget tokens for thinking'),
			desc: t('Must be ≥1024 and less than max_tokens'),
			render: (setting) => {
				setting.addText((text) =>
					text
						.setPlaceholder('')
						.setValue(options.budget_tokens ? options.budget_tokens.toString() : '1600')
						.onChange(async (value) => {
							const number = parseInt(value)
							if (isNaN(number)) {
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
			}
		},
		{
			name: 'Max tokens',
			desc: t('Refer to the technical documentation'),
			render: (setting) => {
				setting.addText((text) =>
					text
						.setPlaceholder('')
						.setValue(options.max_tokens.toString())
						.onChange(async (value) => {
							const number = parseInt(value)
							if (isNaN(number)) {
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
		}
	]

	gptImageDefs = (options: GptImageOptions): SettingDefinitionRender[] => [
		{
			name: t('Image Display Width'),
			desc: t('Example: 400px width would output as ![[image.jpg|400]]'),
			render: (setting) => {
				setting.addSlider((slider) =>
					slider
						.setLimits(200, 800, 100)
						.setValue(options.displayWidth)
						.onChange(async (value) => {
							options.displayWidth = value
							await this.plugin.saveSettings()
						})
				)
			}
		},
		{
			name: t('Number of images'),
			desc: t('Number of images to generate (1-5)'),
			render: (setting) => {
				setting.addSlider((slider) =>
					slider
						.setLimits(1, 5, 1)
						.setValue(options.n)
						.onChange(async (value) => {
							options.n = value
							await this.plugin.saveSettings()
						})
				)
			}
		},
		{
			name: t('Image size'),
			render: (setting) => {
				setting.addDropdown((dropdown) =>
					dropdown
						.addOptions({
							auto: 'Auto',
							'1024x1024': '1024x1024',
							'1536x1024': '1536x1024 ' + t('landscape'),
							'1024x1536': '1024x1536 ' + t('portrait')
						})
						.setValue(options.size)
						.onChange(async (value) => {
							options.size = value as GptImageOptions['size']
							await this.plugin.saveSettings()
						})
				)
			}
		},
		{
			name: t('Output format'),
			render: (setting) => {
				setting.addDropdown((dropdown) =>
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
			}
		},
		{
			name: t('Quality'),
			desc: t('Quality level for generated images. default: Auto'),
			render: (setting) => {
				setting.addDropdown((dropdown) =>
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
			}
		},
		{
			name: t('Background'),
			desc: t('Background of the generated image. default: Auto'),
			render: (setting) => {
				setting.addDropdown((dropdown) =>
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
			}
		},
		{
			name: t('Output compression'),
			desc: t('Compression level of the output image, 10% - 100%. Only for webp or jpeg output format'),
			render: (setting) => {
				setting.addSlider((slider) =>
					slider
						.setLimits(10, 100, 10)
						.setValue(options.output_compression)
						.onChange(async (value) => {
							options.output_compression = value
							await this.plugin.saveSettings()
						})
				)
			}
		}
	]

	/** Every setting for one provider, in render order. */
	providerDefs = (index: number, settings: ProviderSettings, vendor: Vendor): SettingDefinitionRender[] => {
		const capabilities =
			t('Supported features') +
			' : ' +
			vendor.capabilities.map((cap) => `${getCapabilityEmoji(cap)} ${t(cap)}`).join('    ')

		const defs: SettingDefinitionRender[] = [this.tagDef(settings, index, vendor.name)]

		const modelConfig = MODEL_FETCH_CONFIGS[vendor.name as keyof typeof MODEL_FETCH_CONFIGS]
		if (modelConfig) {
			defs.push(this.modelFetchDef(settings, modelConfig, capabilities))
		} else if (vendor.models.length > 0) {
			defs.push(this.modelDropDownDef(settings.options, vendor.models, capabilities))
		} else {
			defs.push(this.modelTextDef(settings.options, capabilities))
		}

		if (vendor.name !== ollamaVendor.name) {
			defs.push(
				this.apiKeyDef(
					settings.options,
					vendor.websiteToObtainKey ? t('Obtain key from ') + vendor.websiteToObtainKey : ''
				)
			)
		}

		if ('apiSecret' in settings.options) {
			defs.push(this.apiSecretDef(settings.options as BaseOptions & Pick<Optional, 'apiSecret'>))
		}

		if (vendor.capabilities.includes('Web Search')) {
			defs.push(this.webSearchDef(settings.options))
		}

		if (vendor.name === claudeVendor.name) {
			defs.push(...this.claudeDefs(settings.options as ClaudeOptions))
		}

		if (vendor.name === gptImageVendor.name) {
			defs.push(...this.gptImageDefs(settings.options as GptImageOptions))
		}

		defs.push(this.baseURLDef(settings.options, vendor.defaultOptions.baseURL))

		if ('endpoint' in settings.options) {
			defs.push(this.endpointDef(settings.options as BaseOptions & Pick<Optional, 'endpoint'>))
		}

		if ('apiVersion' in settings.options) {
			defs.push(this.apiVersionDef(settings.options as BaseOptions & Pick<Optional, 'apiVersion'>))
		}

		defs.push(this.parametersDef(settings.options))
		defs.push(this.removeDef(index, vendor))

		return defs
	}

	/**
	 * Removing a provider from inside its own page. The list's onDelete renders no
	 * affordance for `page` items, and SettingPage exposes no way to navigate back,
	 * so the row lives here as it did before the declarative rewrite.
	 */
	removeDef = (index: number, vendor: Vendor): SettingDefinitionRender => ({
		name: t('Remove') + ' ' + vendor.name,
		render: (setting) => {
			setting.addButton((btn) => {
				btn
					.setDestructive()
					.setButtonText(t('Remove'))
					.onClick(async () => {
						this.plugin.settings.providers.splice(index, 1)
						await this.plugin.saveSettings()
						// Leave the page first: it belongs to the provider just deleted.
						this.closeProviderPage()
						this.update()
					})
			})
		}
	})
}

const getSummary = (tag: string, defaultTag: string) =>
	tag === defaultTag ? defaultTag : tag + ' (' + defaultTag + ')'

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

/**
 * How to ask one provider what models it has.
 *
 * Exported alongside `fetchModels` and `MODEL_FETCH_CONFIGS` so that the smoke
 * harness probes the configuration the settings tab actually uses. A harness that
 * keeps its own copy of these URLs stops testing them the moment one is edited.
 *
 * `url` may be derived from the provider's own base URL, because a provider
 * reached through a relay does not list its models at the vendor's address —
 * this vault reaches Gemini through one, and a hardcoded URL would ask the wrong
 * host. `parse` exists because not everyone answers in OpenAI's shape.
 */
export interface ModelFetchConfig {
	url: string | ((baseURL: string) => string)
	requiresApiKey: boolean
	/** Defaults to a bearer token. */
	authHeader?: string
	/** Anything the endpoint demands beyond authentication, such as an API version. */
	headers?: Record<string, string>
	/** Defaults to OpenAI's `{ data: [{ id }] }`. */
	parse?: (json: unknown) => string[]
}

export const fetchModels = async (config: ModelFetchConfig, baseURL: string, apiKey?: string): Promise<string[]> => {
	const url = typeof config.url === 'function' ? config.url(baseURL) : config.url
	const authHeader = config.authHeader ?? 'Authorization'
	const authValue = config.authHeader ? apiKey : `Bearer ${apiKey}`
	const response = await requestUrl({
		url,
		headers: {
			...(apiKey && { [authHeader]: authValue as string }),
			...config.headers,
			'Content-Type': 'application/json'
		}
	})
	if (config.parse) return config.parse(response.json)
	const result = response.json as { data: { id: string }[] }
	return result.data.map((model) => model.id)
}

// Model fetching configurations for different vendors
export const MODEL_FETCH_CONFIGS = {
	[claudeVendor.name]: {
		// The Anthropic SDK appends its own path to the base URL, so what is stored
		// in the settings may be a bare host or may already carry /v1/messages —
		// this vault's relay stores the latter. Strip whichever tail is present
		// before asking for the sibling /v1/models.
		url: (baseURL: string) =>
			baseURL
				.replace(/\/+$/, '')
				.replace(/(\/v1)?\/messages$/, '')
				.replace(/\/v1$/, '') + '/v1/models',
		requiresApiKey: true,
		authHeader: 'x-api-key',
		headers: { 'anthropic-version': '2023-06-01' }
	},
	[deepSeekVendor.name]: {
		url: (baseURL: string) => baseURL.replace(/\/+$/, '') + '/models',
		requiresApiKey: true
	},
	[qwenVendor.name]: {
		url: (baseURL: string) => baseURL.replace(/\/+$/, '') + '/models',
		requiresApiKey: true
	},
	[openAIVendor.name]: {
		url: (baseURL: string) => baseURL.replace(/\/+$/, '') + '/models',
		requiresApiKey: true
	},
	[doubaoVendor.name]: {
		// Doubao's base URL is the completions endpoint itself, not a prefix.
		url: (baseURL: string) => baseURL.replace(/\/+$/, '').replace(/\/chat\/completions$/, '') + '/models',
		requiresApiKey: true
	},
	[ollamaVendor.name]: {
		// Ollama has an OpenAI-compatible /v1/models, but /api/tags is what its own
		// documentation points at and it is the list of models actually pulled onto
		// the machine, which is the only list worth offering.
		url: (baseURL: string) => baseURL.replace(/\/+$/, '') + '/api/tags',
		requiresApiKey: false,
		parse: (json: unknown) =>
			(json as { models?: { name?: string }[] }).models?.map((model) => model.name ?? '').filter(Boolean) ?? []
	},
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
	},
	[geminiVendor.name]: {
		// Google answers `{ models: [{ name: "models/…" }] }` rather than OpenAI's
		// shape, and authenticates with its own header. The list mixes in Veo video
		// and image models, and `supportedGenerationMethods` does not separate them
		// — every entry claims generateContent, Veo included — so the names are all
		// there is to go on. Anything missed is still reachable through
		// "Override input parameters".
		url: (baseURL: string) => `${baseURL.replace(/\/+$/, '')}/v1beta/models`,
		requiresApiKey: true,
		authHeader: 'x-goog-api-key',
		parse: (json: unknown) =>
			(json as { models?: { name?: string }[] }).models
				?.map((model) => (model.name ?? '').replace(/^models\//, ''))
				.filter((id) => id && !/^veo-|image/.test(id)) ?? []
	},
	[longCatVendor.name]: {
		url: 'https://api.longcat.chat/openai/v1/models',
		requiresApiKey: true
	},
	[miniMaxVendor.name]: {
		url: 'https://api.minimaxi.com/v1/models',
		requiresApiKey: true
	},
	[zhipuVendor.name]: {
		// The raw API key works here as a bearer token; the JWT that chat requests
		// need is not required to list models.
		url: 'https://open.bigmodel.cn/api/paas/v4/models',
		requiresApiKey: true
	}
} as const
