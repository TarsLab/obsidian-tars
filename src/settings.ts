import { ProviderSettings, Vendor } from './providers'
import { deepSeekVendor } from './providers/deepSeek'
import { doubaoVendor } from './providers/doubao'
import { kimiVendor } from './providers/kimi'
import { openAIVendor } from './providers/openAI'
import { qianFanVendor } from './providers/qianFan'
import { qwenVendor } from './providers/qwen'
import { zhipuVendor } from './providers/zhipu'
import { claudeVendor } from './providers/claude'

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
	userTags: ['User', '我']
}

export const availableVendors: Vendor[] = [
	doubaoVendor,
	kimiVendor,
	openAIVendor,
	qianFanVendor,
	qwenVendor,
	zhipuVendor,
	deepSeekVendor,
	claudeVendor
]
