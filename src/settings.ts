import { PromptTemplate } from './prompt'
import { ProviderSettings, Vendor } from './providers'
import { azureVendor } from './providers/azure'
import { claudeVendor } from './providers/claude'
import { customVendor } from './providers/custom'
import { deepSeekVendor } from './providers/deepSeek'
import { doubaoVendor } from './providers/doubao'
import { geminiVendor } from './providers/gemini'
import { gptImageVendor } from './providers/gptImage'
import { grokVendor } from './providers/grok'
import { kimiVendor } from './providers/kimi'
import { longCatVendor } from './providers/longcat'
import { miniMaxVendor } from './providers/minimax'
import { ollamaVendor } from './providers/ollama'
import { openAIVendor } from './providers/openAI'
import { openRouterVendor } from './providers/openRouter'
import { qianFanVendor } from './providers/qianFan'
import { qwenVendor } from './providers/qwen'
import { siliconFlowVendor } from './providers/siliconflow'
import { zhipuVendor } from './providers/zhipu'

export const APP_FOLDER = 'Tars'

/**
 * A tag none of `taken` is already using, numbered when the plain name is.
 *
 * Numbering rather than spacing because a tag may not contain a space, and
 * case-insensitively because that is how the tag field's own uniqueness check
 * compares. Lives here rather than in the settings tab so that the repair on
 * load names a provider exactly as adding one would have.
 */
export const unusedTag = (vendorName: string, taken: Iterable<string>) => {
	const used = new Set([...taken].map((tag) => tag.toLowerCase()))
	let tag = vendorName
	for (let n = 2; used.has(tag.toLowerCase()); n++) tag = vendorName + n
	return tag
}

/**
 * Gives a tag to any provider saved without one, and reports what it named.
 *
 * A provider with no tag cannot be triggered at all — there is no way to type an
 * empty tag into a note — but it is not inert either: it registers a command
 * palette entry reading "# : ", and shows in the settings list as a row with no
 * name. Adding a second provider of a vendor already in the list stored exactly
 * that, from the mobile-adaptation release until it was fixed, so vaults still
 * carry them and nothing would ever have cleared them.
 */
export const nameUntaggedProviders = (providers: ProviderSettings[]) => {
	const named: string[] = []
	for (const provider of providers) {
		if (provider.tag.trim()) continue
		provider.tag = unusedTag(
			provider.vendor,
			providers.map((e) => e.tag)
		)
		named.push(provider.tag)
	}
	return named
}

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
	// First, and the only one out of order: it is the entry for a provider that
	// is not in this list, and it is no use to someone who has already scrolled
	// past where theirs would have been.
	customVendor,
	// The rest in alphabetical order, OpenAI among them rather than ahead of them
	azureVendor,
	claudeVendor,
	deepSeekVendor,
	doubaoVendor,
	geminiVendor,
	gptImageVendor,
	grokVendor,
	kimiVendor,
	longCatVendor,
	miniMaxVendor,
	ollamaVendor,
	openAIVendor,
	openRouterVendor,
	qianFanVendor,
	qwenVendor,
	siliconFlowVendor,
	zhipuVendor
]
