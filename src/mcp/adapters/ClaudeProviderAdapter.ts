import type Anthropic from '@anthropic-ai/sdk'
import type {
	ContentBlockParam as AnthropicContentBlockParam,
	MessageParam as AnthropicMessageParam,
	Tool as AnthropicTool,
	ToolResultBlockParam,
	ToolUseBlockParam
} from '@anthropic-ai/sdk/resources/messages/messages'
import type { MCPServerManager } from '../managerMCPUse'
import type { Message, ProviderAdapter } from '../toolCallingCoordinator'
import type { ToolDiscoveryCache } from '../toolDiscoveryCache'
import { ClaudeToolResponseParser } from '../toolResponseParser'
import type { ToolExecutionResult, ToolServerInfo } from '../types'

export interface ClaudeAdapterConfig {
	mcpManager: MCPServerManager
	anthropicClient: Anthropic
	controller: AbortController
	model: string
	maxTokens: number
	system?: string
}

type ClaudeStreamEvent = Parameters<ClaudeToolResponseParser['parseChunk']>[0]

export class ClaudeProviderAdapter implements ProviderAdapter<ClaudeStreamEvent> {
	private readonly mcpManager: MCPServerManager
	private readonly client: Anthropic
	private readonly controller: AbortController
	private readonly model: string
	private readonly maxTokens: number
	private readonly system?: string
	private readonly toolDiscoveryCache: ToolDiscoveryCache
	private toolMapping: Map<string, ToolServerInfo> | null = null
	private cachedTools: AnthropicTool[] | null = null
	private readonly parser = new ClaudeToolResponseParser()

	constructor(config: ClaudeAdapterConfig) {
		this.mcpManager = config.mcpManager
		this.client = config.anthropicClient
		this.controller = config.controller
		this.model = config.model
		this.maxTokens = config.maxTokens
		this.system = config.system
		this.toolDiscoveryCache = this.mcpManager.getToolDiscoveryCache()

		this.mcpManager.on('server-started', () => this.invalidateCache())
		this.mcpManager.on('server-stopped', () => this.invalidateCache())
		this.mcpManager.on('server-failed', () => this.invalidateCache())
	}

	async initialize(options?: { preloadTools?: boolean }): Promise<void> {
		if (options?.preloadTools === false) {
			this.toolMapping = this.toolDiscoveryCache.getCachedMapping()
			this.cachedTools = null
			return
		}

		this.cachedTools = await this.buildTools()
	}

	private invalidateCache(): void {
		this.toolMapping = null
		this.cachedTools = null
	}

	getParser(): ClaudeToolResponseParser {
		return this.parser
	}

	findServer(toolName: string): ToolServerInfo | null {
		if (!this.toolMapping) {
			const cached = this.toolDiscoveryCache.getCachedMapping()
			if (cached) {
				this.toolMapping = cached
			} else {
				throw new Error('ClaudeProviderAdapter tool mapping not initialized - call initialize() first')
			}
		}
		return this.toolMapping.get(toolName) ?? null
	}

	async *sendRequest(messages: Message[]): AsyncGenerator<ClaudeStreamEvent> {
		const tools = await this.buildTools()
		const { systemPrompt, conversation } = this.extractSystemPrompt(messages)
		const formattedMessages = this.formatMessages(conversation)

		const stream = await this.client.messages.create(
			{
				model: this.model,
				max_tokens: this.maxTokens,
				messages: formattedMessages,
				stream: true,
				tools: tools.length > 0 ? tools : undefined,
				system: systemPrompt ?? this.system
			},
			{ signal: this.controller.signal }
		)

		for await (const event of stream) {
			if (this.controller.signal.aborted) {
				break
			}
			yield event as ClaudeStreamEvent
		}
	}

	formatToolResult(toolCallId: string, result: ToolExecutionResult): Message {
		return {
			role: 'tool',
			tool_call_id: toolCallId,
			content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
		}
	}

	private async buildTools(): Promise<AnthropicTool[]> {
		if (this.cachedTools) {
			return this.cachedTools
		}

		const snapshot = await this.toolDiscoveryCache.getSnapshot()
		this.toolMapping = snapshot.mapping

		const tools: AnthropicTool[] = snapshot.servers.flatMap((server) =>
			server.tools.map((tool) => ({
				name: tool.name,
				description: tool.description ?? '',
				input_schema: tool.inputSchema as AnthropicTool['input_schema']
			}))
		)

		this.cachedTools = tools
		return tools
	}

	private formatMessages(messages: Message[]): AnthropicMessageParam[] {
		const formatted: AnthropicMessageParam[] = []

		for (const message of messages) {
			if (message.role === 'system') {
				continue
			}

			if (message.role === 'tool') {
				if (!message.tool_call_id) {
					continue
				}
				const toolResult: ToolResultBlockParam = {
					type: 'tool_result',
					tool_use_id: message.tool_call_id,
					content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
				}
				formatted.push({ role: 'user', content: [toolResult] })
				continue
			}

			const contentBlocks: AnthropicContentBlockParam[] = []
			const textContent = message.content?.trim() ?? ''
			if (textContent.length > 0) {
				contentBlocks.push({ type: 'text', text: textContent })
			}

			if (message.tool_calls && message.tool_calls.length > 0) {
				for (const toolCall of message.tool_calls) {
					const block: ToolUseBlockParam = {
						type: 'tool_use',
						id: toolCall.id,
						name: toolCall.name,
						input: toolCall.arguments
					}
					contentBlocks.push(block)
				}
			}

			if (contentBlocks.length === 0) {
				contentBlocks.push({ type: 'text', text: '' })
			}

			formatted.push({
				role: message.role === 'assistant' ? 'assistant' : 'user',
				content: contentBlocks
			})
		}

		return formatted
	}

	private extractSystemPrompt(messages: Message[]): { systemPrompt?: string; conversation: Message[] } {
		if (messages.length > 0 && messages[0].role === 'system') {
			const [, ...rest] = messages
			return {
				systemPrompt: messages[0].content,
				conversation: rest
			}
		}

		return { conversation: messages }
	}
}
