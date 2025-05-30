import { App, Notice, PluginSettingTab, Setting } from 'obsidian'
import { exportCmd, replaceCmd, replaceCmdId } from './commands'
import { exportCmdId } from './commands/export'
import { t } from './lang/helper'
import TarsPlugin from './main'
import { SelectModelModal } from './modal'
import { BaseOptions, Optional, ProviderSettings } from './providers'
import { GptImageOptions, gptImageVendor } from './providers/gptImage'
import { ollamaVendor } from './providers/ollama'
import { fetchOpenRouterModels, openRouterVendor } from './providers/openRouter'
import { fetchModels, siliconFlowVendor } from './providers/siliconflow'
import { ZhipuOptions, zhipuVendor } from './providers/zhipu'
import { DEFAULT_SETTINGS, availableVendors } from './settings'

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

		const vendorNames = availableVendors.map((v) => v.name)
		let vendorToCreate = vendorNames[0]

		new Setting(containerEl).setName(t('AI assistants')).setHeading()

		new Setting(containerEl)
			.setName(t('New AI assistant'))
			.setDesc(
				t(
					"Select assistant from dropdown and click 'Add'. For those compatible with the OpenAI protocol, you can select OpenAI."
				)
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(
						vendorNames.reduce((acc: Record<string, string>, cur: string) => {
							acc[cur] = cur
							return acc
						}, {})
					)
					.setValue(vendorNames[0])
					.onChange(async (value) => {
						vendorToCreate = value
					})
			)
			.addButton((button) => {
				button.setButtonText(t('Add')).onClick(async () => {
					const options = availableVendors.find((v) => v.name === vendorToCreate)?.defaultOptions
					if (!options) {
						throw new Error('No default options found for ' + vendorToCreate)
					}

					const isTagDuplicate = this.plugin.settings.providers.map((e) => e.tag).includes(vendorToCreate)
					const newTag = isTagDuplicate ? '' : vendorToCreate
					const deepCopiedOptions = JSON.parse(JSON.stringify(options))
					this.plugin.settings.providers.push({
						tag: newTag,
						vendor: vendorToCreate,
						options: deepCopiedOptions
					})
					// Initially, vendor and tag might be the same, but vendor is read-only to mark vendor type, while tag can be modified by users
					await this.plugin.saveSettings()
					this.display(true)
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

		new Setting(containerEl)
			.setName(this.plugin.settings.roleEmojis.newChat + ' ' + t('New chat tags'))
			.addExtraButton((btn) => {
				btn
					.setIcon('reset')
					.setTooltip(t('Restore default'))
					.onClick(async () => {
						this.plugin.settings.newChatTags = DEFAULT_SETTINGS.newChatTags
						await this.plugin.saveSettings()
						this.display()
					})
			})
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.newChatTags.join(' '))
					.setValue(this.plugin.settings.newChatTags.join(' '))
					.onChange(async (value) => {
						const tags = value.split(' ').filter((e) => e.length > 0)
						if (!validateTagList(tags)) return
						this.plugin.settings.newChatTags = tags
						await this.plugin.saveSettings()
					})
			)

		new Setting(containerEl)
			.setName(this.plugin.settings.roleEmojis.user + ' ' + t('User message tags'))
			.addExtraButton((btn) => {
				btn
					.setIcon('reset')
					.setTooltip(t('Restore default'))
					.onClick(async () => {
						this.plugin.settings.userTags = DEFAULT_SETTINGS.userTags
						await this.plugin.saveSettings()
						this.display()
					})
			})
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.userTags.join(' '))
					.setValue(this.plugin.settings.userTags.join(' '))
					.onChange(async (value) => {
						const tags = value.split(' ').filter((e) => e.length > 0)
						if (!validateTagList(tags)) return
						this.plugin.settings.userTags = tags
						await this.plugin.saveSettings()
					})
			)

		new Setting(containerEl)
			.setName(this.plugin.settings.roleEmojis.system + ' ' + t('System message tags'))
			.addExtraButton((btn) => {
				btn
					.setIcon('reset')
					.setTooltip(t('Restore default'))
					.onClick(async () => {
						this.plugin.settings.systemTags = DEFAULT_SETTINGS.systemTags
						await this.plugin.saveSettings()
						this.display()
					})
			})
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.systemTags.join(' '))
					.setValue(this.plugin.settings.systemTags.join(' '))
					.onChange(async (value) => {
						const tags = value.split(' ').filter((e) => e.length > 0)
						if (!validateTagList(tags)) return
						this.plugin.settings.systemTags = tags
						await this.plugin.saveSettings()
					})
			)

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
					'Internal links in messages will be replaced with their referenced content. When disabled, only the original text of the links will be used.'
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
						this.display()
					})
			})
			.addSlider((slider) =>
				slider
					.setLimits(1.5, 4, 0.5)
					.setValue(this.plugin.settings.answerDelayInMilliseconds / 1000)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.answerDelayInMilliseconds = Math.round(value * 1000)
						await this.plugin.saveSettings()
					})
			)

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
	}

	createProviderSetting = (index: number, settings: ProviderSettings, isOpen: boolean = false) => {
		const vendor = availableVendors.find((v) => v.name === settings.vendor)
		if (!vendor) throw new Error('No vendor found ' + settings.vendor)
		const { containerEl } = this
		const details = containerEl.createEl('details')
		details.createEl('summary', { text: getSummary(settings.tag, vendor.name), cls: 'tars-setting-h4' })
		details.open = isOpen

		this.addTagSection(details, settings, index, vendor.name)
		if (vendor.name !== ollamaVendor.name) {
			this.addAPIkeySection(
				details,
				settings.options,
				vendor.websiteToObtainKey ? t('Obtain key from ') + vendor.websiteToObtainKey : ''
			)
		}

		if ('apiSecret' in settings.options)
			this.addAPISecretOptional(details, settings.options as BaseOptions & Pick<Optional, 'apiSecret'>)

		// model setting
		if (vendor.name === siliconFlowVendor.name) {
			new Setting(details)
				.setName(t('Model'))
				.setDesc(t('Select the model to use'))
				.addButton((btn) => {
					btn
						.setButtonText(settings.options.model ? settings.options.model : t('Select the model to use'))
						.onClick(async () => {
							if (!settings.options.apiKey) {
								new Notice(t('Please input API key first'))
								return
							}
							try {
								const models = await fetchModels(settings.options.apiKey)
								const onChoose = async (selectedModel: string) => {
									settings.options.model = selectedModel
									await this.plugin.saveSettings()
									btn.setButtonText(selectedModel)
								}
								new SelectModelModal(this.app, models, onChoose).open()
							} catch (error) {
								new Notice('🔴' + error)
							}
						})
				})
		} else if (vendor.name === openRouterVendor.name) {
			new Setting(details)
				.setName(t('Model'))
				.setDesc(t('Select the model to use'))
				.addButton((btn) => {
					btn
						.setButtonText(settings.options.model ? settings.options.model : t('Select the model to use'))
						.onClick(async () => {
							try {
								const models = await fetchOpenRouterModels()
								const onChoose = async (selectedModel: string) => {
									settings.options.model = selectedModel
									await this.plugin.saveSettings()
									btn.setButtonText(selectedModel)
								}
								new SelectModelModal(this.app, models, onChoose).open()
							} catch (error) {
								new Notice('🔴' + error)
							}
						})
				})
		} else if (vendor.models.length > 0) {
			this.addModelDropDownSection(details, settings.options, vendor.models)
		} else {
			this.addModelTextSection(details, settings.options)
		}

		if (vendor.name === zhipuVendor.name) {
			new Setting(details)
				.setName(t('Web search'))
				.setDesc(t('Enable web search for AI'))
				.addToggle((toggle) =>
					toggle.setValue((settings.options as ZhipuOptions).enableWebSearch).onChange(async (value) => {
						;(settings.options as ZhipuOptions).enableWebSearch = value
						await this.plugin.saveSettings()
					})
				)
		}

		if (vendor.name === gptImageVendor.name) {
			this.addGptImageSections(details, settings.options as GptImageOptions)
		}

		this.addBaseURLSection(details, settings.options as BaseOptions, vendor.defaultOptions.baseURL)

		if ('max_tokens' in settings.options)
			this.addMaxTokensOptional(details, settings.options as BaseOptions & Pick<Optional, 'max_tokens'>)

		if ('endpoint' in settings.options)
			this.addEndpointOptional(details, settings.options as BaseOptions & Pick<Optional, 'endpoint'>)

		if ('apiVersion' in settings.options)
			this.addApiVersionOptional(details, settings.options as BaseOptions & Pick<Optional, 'apiVersion'>)

		this.addParametersSection(details, settings.options)

		new Setting(details).setName(t('Remove') + ' ' + vendor.name).addButton((btn) => {
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
			.setName('✨ ' + t('Assistant message tag'))
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
							.filter((e, i) => i !== index)
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

	addBaseURLSection = (details: HTMLDetailsElement, options: BaseOptions, defaultValue: string) =>
		new Setting(details)
			.setName('baseURL')
			.setDesc(t('Default:') + ' ' + defaultValue)
			.addExtraButton((btn) => {
				btn
					.setIcon('reset')
					.setTooltip(t('Restore default'))
					.onClick(async () => {
						options.baseURL = defaultValue
						await this.plugin.saveSettings()
						this.display()
					})
			})
			.addText((text) =>
				text.setValue(options.baseURL).onChange(async (value) => {
					options.baseURL = value
					await this.plugin.saveSettings()
				})
			)

	addAPIkeySection = (details: HTMLDetailsElement, options: BaseOptions, desc: string = '') =>
		new Setting(details)
			.setName('API key')
			.setDesc(desc)
			.addText((text) =>
				text
					.setPlaceholder(t('Enter your key'))
					.setValue(options.apiKey)
					.onChange(async (value) => {
						options.apiKey = value
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
						options.apiSecret = value
						await this.plugin.saveSettings()
					})
			)

	addModelDropDownSection = (details: HTMLDetailsElement, options: BaseOptions, models: string[]) =>
		new Setting(details)
			.setName(t('Model'))
			.setDesc(t('Select the model to use'))
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

	addModelTextSection = (details: HTMLDetailsElement, options: BaseOptions) =>
		new Setting(details)
			.setName(t('Model'))
			.setDesc(t('Input the model to use'))
			.addText((text) =>
				text
					.setPlaceholder('')
					.setValue(options.model)
					.onChange(async (value) => {
						options.model = value
						await this.plugin.saveSettings()
					})
			)

	addMaxTokensOptional = (details: HTMLDetailsElement, options: BaseOptions & Pick<Optional, 'max_tokens'>) =>
		new Setting(details)
			.setName('Max tokens')
			.setDesc(t('Refer to the technical documentation'))
			.addText((text) =>
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
						options.apiVersion = value
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
							options.parameters = JSON.parse(value)
							await this.plugin.saveSettings()
						} catch (_error) {
							// This is difficult to handle properly - onChange triggers quickly, and users might receive frequent error messages before they finish typing, which is annoying
							return
						}
					})
			)

	addGptImageSections = (details: HTMLDetailsElement, options: GptImageOptions) => {
		new Setting(details)
			.setName('Display width')
			.setDesc('Width of the generated image in pixels')
			.addSlider((slider) =>
				slider
					.setLimits(100, 1600, 100)
					.setValue(options.displayWidth)
					.setDynamicTooltip()
					.onChange(async (value) => {
						options.displayWidth = value
						await this.plugin.saveSettings()
					})
			)
		new Setting(details)
			.setName('Number of images')
			.setDesc('Number of images to generate')
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
		new Setting(details)
			.setName('Size')
			.setDesc('Size of the generated image')
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						auto: 'Auto',
						'1024x1024': '1024x1024',
						'1536x1024': '1536x1024 (landscape)',
						'1024x1536': '1024x1536 (portrait)'
					})
					.setValue(options.size)
					.onChange(async (value) => {
						options.size = value as GptImageOptions['size']
						await this.plugin.saveSettings()
					})
			)
		new Setting(details)
			.setName('Output format')
			.setDesc('Format of the generated image')
			.addDropdown((dropdown) =>
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
			.setName('Quality')
			.setDesc('Quality of the generated image')
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						auto: 'Auto',
						high: 'High',
						medium: 'Medium',
						low: 'Low'
					})
					.setValue(options.quality)
					.onChange(async (value) => {
						options.quality = value as GptImageOptions['quality']
						await this.plugin.saveSettings()
					})
			)
		new Setting(details)
			.setName('Background')
			.setDesc('Background of the generated image')
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						auto: 'Auto',
						transparent: 'Transparent',
						opaque: 'Opaque'
					})
					.setValue(options.background)
					.onChange(async (value) => {
						options.background = value as GptImageOptions['background']
						await this.plugin.saveSettings()
					})
			)
		new Setting(details)
			.setName('Output compression')
			.setDesc('Compression level of the output image, 10-100')
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
	} catch (_error) {
		return false
	}
}
