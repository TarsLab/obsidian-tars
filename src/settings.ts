import { PromptTemplate } from './prompt'
import { ProviderSettings, Vendor } from './providers'
import { azureVendor } from './providers/azure'
import { claudeVendor } from './providers/claude'
import { deepSeekVendor } from './providers/deepSeek'
import { doubaoVendor } from './providers/doubao'
import { geminiVendor } from './providers/gemini'
import { kimiVendor } from './providers/kimi'
import { ollamaVendor } from './providers/ollama'
import { openAIVendor } from './providers/openAI'
import { openRouterVendor } from './providers/openRouter'
import { qianFanVendor } from './providers/qianFan'
import { qwenVendor } from './providers/qwen'
import { siliconFlowVendor } from './providers/siliconflow'
import { zhipuVendor } from './providers/zhipu'

export interface EditorStatus {
	isTextInserting: boolean
}

export interface PluginSettings {
	editorStatus: EditorStatus
	providers: ProviderSettings[]
	systemTags: string[]
	newChatTags: string[]
	userTags: string[]
	promptTemplates: PromptTemplate[]
	confirmRegenerate: boolean
	enableTagSuggest: boolean
	tagSuggestMaxLineLength: number
	answerDelayInMilliseconds: number
	enableExportToJSONL: boolean
	enableReplaceTag: boolean
}

export const DEFAULT_SETTINGS: PluginSettings = {
	editorStatus: { isTextInserting: false },
	providers: [],
	systemTags: ['System', '系统'],
	newChatTags: ['NewChat', '新对话'],
	userTags: ['User', '我'],
	promptTemplates: [],
	answerDelayInMilliseconds: 2000,
	confirmRegenerate: true,
	enableTagSuggest: true,
	tagSuggestMaxLineLength: 20,
	enableExportToJSONL: false,
	enableReplaceTag: false
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
	openRouterVendor,
	qianFanVendor,
	qwenVendor,
	siliconFlowVendor,
	zhipuVendor
]
