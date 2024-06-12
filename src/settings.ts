import { ProviderSettings, Vendor } from './providers'
import { kimiVendor } from './providers/kimi'
import { openAIVendor } from './providers/openAI'
import { zhipuVendor } from './providers/zhipu'

export interface PluginSettings {
	providers: ProviderSettings[]
	ignoreSectionTypes: string[]
	systemTags: string[]
	newChatTags: string[]
	userTags: string[]
}

export const DEFAULT_SETTINGS: PluginSettings = {
	providers: [],
	ignoreSectionTypes: ['blockquote', 'callout'],
	systemTags: ['System', '系统'],
	newChatTags: ['NewChat', '新对话'],
	userTags: ['我', 'User']
}

export const availableVendors: Vendor[] = [kimiVendor, zhipuVendor, openAIVendor]
