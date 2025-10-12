/**
 * Provider Adapters
 * Factory functions to create ProviderAdapter instances for each LLM provider.
 * These adapters bridge the gap between provider-specific APIs and the
 * generic ToolCallingCoordinator.
 */

export { type ClaudeAdapterConfig, ClaudeProviderAdapter } from './adapters/ClaudeProviderAdapter'
export { type OllamaAdapterConfig, OllamaProviderAdapter } from './adapters/OllamaProviderAdapter'
export {
	createOpenAIAdapter,
	createOpenAIAdapterWithMapping,
	type OpenAIAdapterConfigSimple
} from './adapters/OpenAIAdapterFactory'
export { type OpenAIAdapterConfig, OpenAIProviderAdapter } from './adapters/OpenAIProviderAdapter'
export { buildToolServerMapping } from './adapters/toolMapping'
