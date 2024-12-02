import { ProviderSettings, Vendor } from './providers'
import { azureVendor } from './providers/azure'
import { claudeVendor } from './providers/claude'
import { deepSeekVendor } from './providers/deepSeek'
import { doubaoVendor } from './providers/doubao'
import { kimiVendor } from './providers/kimi'
import { ollamaVendor } from './providers/ollama'
import { openAIVendor } from './providers/openAI'
import { qianFanVendor } from './providers/qianFan'
import { qwenVendor } from './providers/qwen'
import { zhipuVendor } from './providers/zhipu'

export interface PluginSettings {
	providers: ProviderSettings[]
	systemTags: string[]
	newChatTags: string[]
	userTags: string[]
}

export const DEFAULT_SETTINGS: PluginSettings = {
	providers: [],
	systemTags: ['System', '系统'],
	newChatTags: ['NewChat', '新对话'],
	userTags: ['User', '我']
}

export const availableVendors: Vendor[] = [
	openAIVendor,
	doubaoVendor,
	kimiVendor,
	qianFanVendor,
	qwenVendor,
	zhipuVendor,
	deepSeekVendor,
	claudeVendor,
	ollamaVendor,
	azureVendor
]
