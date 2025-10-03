/**
 * Provider Adapters
 *
 * Factory functions to create ProviderAdapter instances for each LLM provider.
 * These adapters bridge the gap between provider-specific APIs and the
 * generic ToolCallingCoordinator.
 */

import OpenAI from 'openai'
import type { Ollama } from 'ollama/browser'
import type { EmbedCache } from 'obsidian'
import type { ToolExecutor } from './executor'
import type { MCPServerManager } from './managerMCPUse'
import type { Message, ProviderAdapter, ToolExecutionResult } from './toolCallingCoordinator'
import { OpenAIToolResponseParser, OllamaToolResponseParser } from './toolResponseParser'

// ============================================================================
// OpenAI Provider Adapter
// ============================================================================

export interface OpenAIAdapterConfig {
	mcpManager: MCPServerManager
	mcpExecutor: ToolExecutor
	openaiClient: OpenAI
	controller: AbortController
	resolveEmbedAsBinary?: (embed: EmbedCache) => Promise<ArrayBuffer>
}

/**
 * Full OpenAI Provider Adapter
 * Implements complete ProviderAdapter interface for use with ToolCallingCoordinator
 */
export class OpenAIProviderAdapter implements ProviderAdapter<OpenAI.ChatCompletionChunk> {
	private mcpManager: MCPServerManager
	private mcpExecutor: ToolExecutor
	private client: OpenAI
	private controller: AbortController
	private toolMapping: Map<string, string> | null = null
	private cachedTools: OpenAI.ChatCompletionTool[] | null = null
	private resolveEmbedAsBinary?: (embed: EmbedCache) => Promise<ArrayBuffer>

	constructor(config: OpenAIAdapterConfig) {
		this.mcpManager = config.mcpManager
		this.mcpExecutor = config.mcpExecutor
		this.client = config.openaiClient
		this.controller = config.controller
		this.resolveEmbedAsBinary = config.resolveEmbedAsBinary

		// Listen for server changes to invalidate cache
		this.mcpManager.on('server-started', () => this.invalidateCache())
		this.mcpManager.on('server-stopped', () => this.invalidateCache())
		this.mcpManager.on('server-failed', () => this.invalidateCache())
	}

	/**
	 * Initialize adapter (build tool mapping and cache tools)
	 */
	async initialize(): Promise<void> {
		this.toolMapping = await buildToolServerMapping(this.mcpManager)
		this.cachedTools = await this.buildTools()
	}

	/**
	 * Invalidate tool cache when servers change
	 */
	private invalidateCache(): void {
		this.cachedTools = null
		this.toolMapping = null
	}

	/**
	 * Send request to OpenAI and stream response
	 */
	async *sendRequest(messages: Message[]): AsyncGenerator<OpenAI.ChatCompletionChunk> {
		// Format messages for OpenAI
		const formattedMessages = await this.formatMessages(messages)

		// Get MCP tools
		const tools = await this.buildTools()

		// Create stream
		const stream = await this.client.chat.completions.create(
			{
				messages: formattedMessages as OpenAI.ChatCompletionMessageParam[],
				tools: tools.length > 0 ? tools : undefined,
				stream: true
			} as OpenAI.ChatCompletionCreateParamsStreaming,
			{ signal: this.controller.signal }
		)

		// Yield chunks
		for await (const chunk of stream) {
			yield chunk
		}
	}

	getParser(): OpenAIToolResponseParser {
		return new OpenAIToolResponseParser()
	}

	findServerId(toolName: string): string | null {
		if (this.toolMapping) {
			return this.toolMapping.get(toolName) || null
		}

		// Fallback: search all servers (less efficient)
		const servers = this.mcpManager.listServers()
		for (const server of servers) {
			if (server.enabled && this.mcpManager.getClient(server.id)) {
				return server.id
			}
		}
		return null
	}

	formatToolResult(toolCallId: string, result: ToolExecutionResult): Message {
		return {
			role: 'tool',
			tool_call_id: toolCallId,
			content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
		}
	}

	/**
	 * Build OpenAI tools array from MCP servers (cached)
	 */
	private async buildTools(): Promise<OpenAI.ChatCompletionTool[]> {
		// Return cached tools if available
		if (this.cachedTools) {
			return this.cachedTools
		}

		const tools: OpenAI.ChatCompletionTool[] = []
		const servers = this.mcpManager.listServers()

		for (const server of servers) {
			if (!server.enabled) continue

			const client = this.mcpManager.getClient(server.id)
			if (!client) continue

			try {
				const serverTools = await client.listTools()
				for (const tool of serverTools) {
					tools.push({
						type: 'function',
						function: {
							name: tool.name,
							description: tool.description || '',
							parameters: tool.inputSchema as Record<string, unknown>
						}
					})
				}
			} catch (error) {
				console.error(`Failed to list tools for ${server.name}:`, error)
			}
		}

		return tools
	}

	/**
	 * Format messages for OpenAI API
	 */
	private async formatMessages(messages: Message[]): Promise<unknown[]> {
		const formatted: unknown[] = []

		for (const msg of messages) {
			if (msg.role === 'tool') {
				// Tool result message
				formatted.push({
					role: 'tool',
					tool_call_id: msg.tool_call_id,
					content: msg.content
				})
			} else if (msg.tool_calls) {
				// Assistant message with tool calls
				formatted.push({
					role: 'assistant',
					content: msg.content || '',
					tool_calls: msg.tool_calls.map((tc) => ({
						id: tc.id,
						type: 'function',
						function: {
							name: tc.name,
							arguments: JSON.stringify(tc.arguments)
						}
					}))
				})
			} else {
				// Regular message (potentially with embeds)
				const content: unknown[] = []

				// Handle embeds if present and resolver available
				// biome-ignore lint/suspicious/noExplicitAny: Message type from providers
				if ((msg as any).embeds && this.resolveEmbedAsBinary) {
					// Skip embeds for now - would need convertEmbedToImageUrl
				}

				if (msg.content.trim()) {
					content.push({
						type: 'text',
						text: msg.content
					})
				}

				formatted.push({
					role: msg.role,
					content: content.length > 0 ? content : msg.content
				})
			}
		}

		return formatted
	}
}

// Legacy simple adapter (partial implementation)
export interface OpenAIAdapterConfigSimple {
	mcpManager: MCPServerManager
	mcpExecutor: ToolExecutor
}

export function createOpenAIAdapter(config: OpenAIAdapterConfig): Pick<ProviderAdapter, 'getParser' | 'findServerId' | 'formatToolResult'> {
	const { mcpManager } = config

	return {
		getParser: () => new OpenAIToolResponseParser(),

		findServerId: (toolName: string): string | null => {
			// Query all servers to find which one provides this tool
			const servers = mcpManager.listServers()

			for (const server of servers) {
				if (!server.enabled) continue

				const client = mcpManager.getClient(server.id)
				if (!client) continue

				try {
					// This is sync but we need to make it work
					// For now, return first enabled server
					// TODO: Cache tool->server mapping
					return server.id
				} catch (error) {
					console.debug(`Error checking tools for ${server.id}:`, error)
				}
			}

			return null
		},

		formatToolResult: (toolCallId: string, result: ToolExecutionResult): Message => {
			// OpenAI format for tool results
			return {
				role: 'tool',
				tool_call_id: toolCallId,
				content: typeof result.content === 'string'
					? result.content
					: JSON.stringify(result.content)
			}
		}
	}
}

// ============================================================================
// Helper: Build tool name to server ID mapping
// ============================================================================

/**
 * Build a mapping of tool names to server IDs by querying all servers
 * This is async and should be called once during initialization
 */
export async function buildToolServerMapping(manager: MCPServerManager): Promise<Map<string, string>> {
	const mapping = new Map<string, string>()
	const servers = manager.listServers()

	for (const server of servers) {
		if (!server.enabled) continue

		const client = manager.getClient(server.id)
		if (!client) continue

		try {
			const tools = await client.listTools()
			for (const tool of tools) {
				// First server wins if multiple servers provide same tool
				if (!mapping.has(tool.name)) {
					mapping.set(tool.name, server.id)
				}
			}
		} catch (error) {
			console.error(`Failed to list tools for ${server.name}:`, error)
		}
	}

	return mapping
}

/**
 * Create OpenAI adapter with pre-built tool mapping (more efficient)
 */
export async function createOpenAIAdapterWithMapping(
	config: OpenAIAdapterConfig
): Promise<Pick<ProviderAdapter, 'getParser' | 'findServerId' | 'formatToolResult'>> {
	const { mcpManager } = config
	const toolMapping = await buildToolServerMapping(mcpManager)

	return {
		getParser: () => new OpenAIToolResponseParser(),

		findServerId: (toolName: string): string | null => {
			return toolMapping.get(toolName) || null
		},

		formatToolResult: (toolCallId: string, result: ToolExecutionResult): Message => {
			return {
				role: 'tool',
				tool_call_id: toolCallId,
				content: typeof result.content === 'string'
					? result.content
					: JSON.stringify(result.content)
			}
		}
	}
}

// ============================================================================
// Ollama Provider Adapter
// ============================================================================

interface OllamaChunk {
	message?: {
		content?: string
		tool_calls?: Array<{
			function: {
				name: string
				arguments: Record<string, unknown>
			}
		}>
	}
	done?: boolean
}

export interface OllamaAdapterConfig {
	mcpManager: MCPServerManager
	mcpExecutor: ToolExecutor
	ollamaClient: Ollama
	controller: AbortController
	model: string
}

/**
 * Ollama Provider Adapter
 * Implements complete ProviderAdapter interface for use with ToolCallingCoordinator
 *
 * Note: Ollama's tool calling format is simpler than OpenAI:
 * - Tool calls arrive complete (not streamed)
 * - Arguments are already parsed as objects
 * - No tool_call_id, we generate synthetic IDs
 */
export class OllamaProviderAdapter implements ProviderAdapter<OllamaChunk> {
	private mcpManager: MCPServerManager
	private mcpExecutor: ToolExecutor
	private client: Ollama
	private controller: AbortController
	private model: string
	private toolMapping: Map<string, string> | null = null
	private cachedTools: Array<{ type: 'function'; function: { name: string; description?: string; parameters?: unknown } }> | null = null
	private parser: OllamaToolResponseParser

	constructor(config: OllamaAdapterConfig) {
		this.mcpManager = config.mcpManager
		this.mcpExecutor = config.mcpExecutor
		this.client = config.ollamaClient
		this.controller = config.controller
		this.model = config.model
		this.parser = new OllamaToolResponseParser()

		// Listen for server changes to invalidate cache
		this.mcpManager.on('server-started', () => this.invalidateCache())
		this.mcpManager.on('server-stopped', () => this.invalidateCache())
		this.mcpManager.on('server-failed', () => this.invalidateCache())
	}

	async initialize(): Promise<void> {
		this.toolMapping = await buildToolServerMapping(this.mcpManager)
		this.cachedTools = await this.buildTools()
	}

	/**
	 * Invalidate tool cache when servers change
	 */
	private invalidateCache(): void {
		this.cachedTools = null
		this.toolMapping = null
	}

	getParser(): OllamaToolResponseParser {
		return this.parser
	}

	findServerId(toolName: string): string | null {
		if (!this.toolMapping) {
			throw new Error('OllamaProviderAdapter not initialized - call initialize() first')
		}
		return this.toolMapping.get(toolName) || null
	}

	async *sendRequest(messages: Message[]): AsyncGenerator<OllamaChunk> {
		// Build tools array for Ollama
		const tools = await this.buildTools()

		// Format messages for Ollama
		const formattedMessages = await this.formatMessages(messages)

		// Create request
		const requestParams = {
			model: this.model,
			messages: formattedMessages,
			stream: true,
			tools: tools.length > 0 ? tools : undefined
		}

		// biome-ignore lint/suspicious/noExplicitAny: Ollama SDK types
		const response = (await this.client.chat(requestParams as any)) as unknown as AsyncIterable<OllamaChunk>

		for await (const chunk of response) {
			if (this.controller.signal.aborted) {
				this.client.abort()
				break
			}
			yield chunk
		}
	}

	formatToolResult(_toolCallId: string, result: ToolExecutionResult): Message {
		// Ollama uses assistant role for tool results
		return {
			role: 'assistant',
			content: typeof result.content === 'string'
				? result.content
				: JSON.stringify(result.content)
		}
	}

	/**
	 * Build tools array for Ollama from MCP servers (cached)
	 */
	private async buildTools(): Promise<Array<{ type: 'function'; function: { name: string; description?: string; parameters?: unknown } }>> {
		// Return cached tools if available
		if (this.cachedTools) {
			return this.cachedTools
		}

		const tools: Array<{ type: 'function'; function: { name: string; description?: string; parameters?: unknown } }> = []

		const servers = this.mcpManager.listServers()
		for (const server of servers) {
			if (!server.enabled) continue

			const client = this.mcpManager.getClient(server.id)
			if (!client) continue

			try {
				const serverTools = await client.listTools()
				for (const tool of serverTools) {
					tools.push({
						type: 'function',
						function: {
							name: tool.name,
							description: tool.description,
							parameters: tool.inputSchema
						}
					})
				}
			} catch (error) {
				console.error(`Failed to list tools from Ollama server ${server.id}:`, error)
			}
		}

		return tools
	}

	/**
	 * Format messages for Ollama API
	 */
	private async formatMessages(messages: Message[]): Promise<Array<{ role: string; content: string }>> {
		return messages.map((msg) => ({
			role: msg.role === 'tool' ? 'assistant' : msg.role,
			content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
		}))
	}
}
