import { App, Notice, PluginSettingTab, Setting } from 'obsidian'
import { t } from './lang/helper'
import TarsPlugin from './main'
import { BaseOptions, ProviderSettings, SecretOptions } from './providers'
import { DEFAULT_SETTINGS, availableVendors } from './settings'

export class TarsSettingTab extends PluginSettingTab {
	plugin: TarsPlugin

	constructor(app: App, plugin: TarsPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this
		containerEl.empty()

		const vendorNames = availableVendors.map((v) => v.name)
		let vendorToCreate = vendorNames[0]

		new Setting(containerEl).setName(t('AI assistants')).setHeading()

		new Setting(containerEl)
			.setName(t('New AI assistant'))
			.setDesc(t("Select assistant from dropdown and click 'Add'."))
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
					this.plugin.settings.providers.push({
						tag: vendorToCreate,
						vendor: vendorToCreate,
						options: options
					})
					// 初始时，vendor和tag是一样的, 但是vendor只读，标记vendor类型，而tag是用户可以修改的
					// TODO, tag 可能会重复，需要检查
					await this.plugin.saveSettings()
					this.display()
				})
			})

		for (const [index, provider] of this.plugin.settings.providers.entries()) {
			this.createProviderSetting(index, provider)
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

	createProviderSetting = (index: number, settings: ProviderSettings) => {
		const vendor = availableVendors.find((v) => v.name === settings.vendor)
		if (!vendor) throw new Error('No vendor found ' + settings.vendor)
		const { containerEl } = this
		const details = containerEl.createEl('details')
		details.createEl('summary', { text: vendor.name, cls: 'tars-setting-h4' })

		this.addTagSection(details, settings, index, vendor.name)
		this.addAPIkeySection(
			details,
			settings.options,
			vendor.websiteToObtainKey ? t('Obtain key from ') + vendor.websiteToObtainKey : ''
		)

		if ('apiSecret' in settings.options) {
			this.addAPISecretSection(details, settings.options as SecretOptions)
		}
		if (vendor.models.length > 0) {
			this.addModelDropDownSection(details, settings.options, vendor.models)
		} else {
			this.addModelTextSection(details, settings.options)
		}
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
						console.debug('trimmed', trimmed)
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

	addAPISecretSection = (details: HTMLDetailsElement, options: SecretOptions, desc: string = '') =>
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

	addParametersSection = (details: HTMLDetailsElement, options: BaseOptions) =>
		new Setting(details)
			.setName(t('Override input parameters'))
			.setDesc(
				t('Developer feature, in JSON format, for example, {"model": "gptX"} can override the model input parameter.')
			)
			.addTextArea((text) =>
				text
					.setPlaceholder('{}')
					.setValue(JSON.stringify(options.parameters))
					.onChange(async (value) => {
						try {
							options.parameters = JSON.parse(value)
							await this.plugin.saveSettings()
						} catch (error) {
							// 这里不好处理，onChange触发很快，用户输入的时候可能还没输入完，频繁报错让用户很烦
							return
						}
					})
			)
}

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
