import { PromptTemplate } from './prompt'
import { ProviderSettings, Vendor } from './providers'
import { azureVendor } from './providers/azure'
import { claudeVendor } from './providers/claude'
import { deepSeekVendor } from './providers/deepSeek'
import { doubaoVendor } from './providers/doubao'
import { geminiVendor } from './providers/gemini'
import { gptImageVendor } from './providers/gptImage'
import { grokVendor } from './providers/grok'
import { kimiVendor } from './providers/kimi'
import { ollamaVendor } from './providers/ollama'
import { openAIVendor } from './providers/openAI'
import { openRouterVendor } from './providers/openRouter'
import { qianFanVendor } from './providers/qianFan'
import { qwenVendor } from './providers/qwen'
import { siliconFlowVendor } from './providers/siliconflow'
import { zhipuVendor } from './providers/zhipu'

export const APP_FOLDER = 'Tars'

export interface EditorStatus {
	isTextInserting: boolean
}

export interface PluginSettings {
	editorStatus: EditorStatus
	providers: ProviderSettings[]
	systemTags: string[]
	newChatTags: string[]
	userTags: string[]
	roleEmojis: {
		assistant: string
		system: string
		newChat: string
		user: string
	}
	promptTemplates: PromptTemplate[]
	enableInternalLink: boolean // For user messages and system messages
	enableInternalLinkForAssistantMsg: boolean
	confirmRegenerate: boolean
	enableTagSuggest: boolean
	tagSuggestMaxLineLength: number
	answerDelayInMilliseconds: number
	enableExportToJSONL: boolean
	enableReplaceTag: boolean
	enableDefaultSystemMsg: boolean
	defaultSystemMsg: string
	enableStreamLog: boolean
}

export const DEFAULT_SETTINGS: PluginSettings = {
	editorStatus: { isTextInserting: false },
	providers: [],
	systemTags: ['System', '系统'],
	newChatTags: ['NewChat', '新对话'],
	userTags: ['User', '我'],
	roleEmojis: {
		assistant: '✨',
		system: '🔧',
		newChat: '🚀',
		user: '💬'
	},
	promptTemplates: [],
	enableInternalLink: true,
	enableInternalLinkForAssistantMsg: false,
	answerDelayInMilliseconds: 2000,
	confirmRegenerate: true,
	enableTagSuggest: true,
	tagSuggestMaxLineLength: 20,
	enableExportToJSONL: false,
	enableReplaceTag: false,
	enableDefaultSystemMsg: false,
	defaultSystemMsg: '',
	enableStreamLog: false
}

export const availableVendors: Vendor[] = [
	openAIVendor,
	// The following are arranged in alphabetical order
	azureVendor,
	claudeVendor,
	deepSeekVendor,
	doubaoVendor,
	geminiVendor,
	gptImageVendor,
	grokVendor,
	kimiVendor,
	ollamaVendor,
	openRouterVendor,
	qianFanVendor,
	qwenVendor,
	siliconFlowVendor,
	zhipuVendor
]
