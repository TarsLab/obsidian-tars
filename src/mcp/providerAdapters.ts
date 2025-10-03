/**
 * Provider Adapters
 * Factory functions to create ProviderAdapter instances for each LLM provider.
 * These adapters bridge the gap between provider-specific APIs and the
 * generic ToolCallingCoordinator.
 */

export { buildToolServerMapping } from './adapters/toolMapping'
export { ClaudeProviderAdapter, type ClaudeAdapterConfig } from './adapters/ClaudeProviderAdapter'
export {
	createOpenAIAdapter,
	createOpenAIAdapterWithMapping,
	type OpenAIAdapterConfigSimple
} from './adapters/OpenAIAdapterFactory'
export { type OllamaAdapterConfig, OllamaProviderAdapter } from './adapters/OllamaProviderAdapter'
export { type OpenAIAdapterConfig, OpenAIProviderAdapter } from './adapters/OpenAIProviderAdapter'
