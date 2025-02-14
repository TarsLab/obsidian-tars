import { App, Notice, PluginSettingTab, Setting } from 'obsidian'
import { t } from './lang/helper'
import TarsPlugin from './main'
import { BaseOptions, Optional, ProviderSettings } from './providers'
import { ZhipuOptions } from './providers/zhipu'
import { DEFAULT_SETTINGS, availableVendors } from './settings'

export class TarsSettingTab extends PluginSettingTab {
	plugin: TarsPlugin

	constructor(app: App, plugin: TarsPlugin) {
		super(app, plugin)
		this.plugin = plugin
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
					// 初始时，vendor和tag可能是一样的, 但是vendor只读，标记vendor类型，而tag是用户可以修改的
					await this.plugin.saveSettings()
					this.display(true)
				})
			})

		for (const [index, provider] of this.plugin.settings.providers.entries()) {
			const isLast = index === this.plugin.settings.providers.length - 1
			this.createProviderSetting(index, provider, isLast && expandLastProvider)
		}

		containerEl.createEl('br')
		new Setting(containerEl)
			.setName(t('Message tags'))
			.setDesc(t('Keywords for tags in the text box are separated by spaces'))
			.setHeading()

		new Setting(containerEl).setName(t('New chat tags')).addText((text) =>
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

		new Setting(containerEl).setName(t('User message tags')).addText((text) =>
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

		new Setting(containerEl).setName(t('System message tags')).addText((text) =>
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
	}

	createProviderSetting = (index: number, settings: ProviderSettings, isOpen: boolean = false) => {
		const vendor = availableVendors.find((v) => v.name === settings.vendor)
		if (!vendor) throw new Error('No vendor found ' + settings.vendor)
		const { containerEl } = this
		const details = containerEl.createEl('details')
		details.createEl('summary', { text: getSummary(settings.tag, vendor.name), cls: 'tars-setting-h4' })
		details.open = isOpen

		this.addTagSection(details, settings, index, vendor.name)
		if (settings.vendor !== 'Ollama') {
			this.addAPIkeySection(
				details,
				settings.options,
				vendor.websiteToObtainKey ? t('Obtain key from ') + vendor.websiteToObtainKey : ''
			)
		}

		if ('apiSecret' in settings.options)
			this.addAPISecretOptional(details, settings.options as BaseOptions & Pick<Optional, 'apiSecret'>)

		if (vendor.models.length > 0) {
			this.addModelDropDownSection(details, settings.options, vendor.models, index)
		} else {
			this.addModelTextSection(details, settings.options, index)
		}

		if (settings.vendor === 'Zhipu') {
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

		this.addBaseURLSection(details, settings.options as BaseOptions, 'e.g. ' + vendor.defaultOptions.baseURL)

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
			.setName(t('tag'))
			.setDesc(t('Trigger AI generation'))
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

	addBaseURLSection = (details: HTMLDetailsElement, options: BaseOptions, desc: string = '') =>
		new Setting(details)
			.setName('baseURL')
			.setDesc(desc)
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

	addModelDropDownSection = (details: HTMLDetailsElement, options: BaseOptions, models: string[], index: number) =>
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

	addModelTextSection = (details: HTMLDetailsElement, options: BaseOptions, index: number) =>
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
							// 空字符串是合法的，清空endpoint
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
			.setDesc(t('Developer feature, in JSON format. e.g. {"model": "your model", "baseURL": "your url"}'))
			.addTextArea((text) =>
				text
					.setPlaceholder('{}')
					.setValue(JSON.stringify(options.parameters))
					.onChange(async (value) => {
						try {
							options.parameters = JSON.parse(value)
							await this.plugin.saveSettings()
						} catch (_error) {
							// 这里不好处理，onChange触发很快，用户输入的时候可能还没输入完，频繁报错让用户很烦
							return
						}
					})
			)
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
