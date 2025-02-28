import { ProviderSettings, Vendor } from './providers'
import { azureVendor } from './providers/azure'
import { claudeVendor } from './providers/claude'
import { deepSeekVendor } from './providers/deepSeek'
import { doubaoVendor } from './providers/doubao'
import { geminiVendor } from './providers/gemini'
import { kimiVendor } from './providers/kimi'
import { ollamaVendor } from './providers/ollama'
import { openAIVendor } from './providers/openAI'
import { qianFanVendor } from './providers/qianFan'
import { qwenVendor } from './providers/qwen'
import { siliconFlowVendor } from './providers/siliconflow'
import { zhipuVendor } from './providers/zhipu'

export interface PluginSettings {
	providers: ProviderSettings[]
	systemTags: string[]
	newChatTags: string[]
	userTags: string[]
	confirmRegenerate: boolean
	answerDelayInMilliseconds: number
	advancedCmd: AdvancedCmdFlags
}

export interface AdvancedCmdFlags {
	enableExportToJSONL: boolean
	enableReplaceTag: boolean
}

export const DEFAULT_SETTINGS: PluginSettings = {
	providers: [],
	systemTags: ['System', '系统'],
	newChatTags: ['NewChat', '新对话'],
	userTags: ['User', '我'],
	answerDelayInMilliseconds: 2000,
	confirmRegenerate: true,
	advancedCmd: {
		enableExportToJSONL: false,
		enableReplaceTag: false
	}
}

export const availableVendors: Vendor[] = [
	openAIVendor,
	// 以下是按照字母顺序排列的
	azureVendor,
	claudeVendor,
	deepSeekVendor,
	doubaoVendor,
	geminiVendor,
	kimiVendor,
	ollamaVendor,
	qianFanVendor,
	qwenVendor,
	siliconFlowVendor,
	zhipuVendor
]
