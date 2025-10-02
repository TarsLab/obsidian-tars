/**
 * Tool Calling Coordinator
 *
 * Orchestrates the multi-turn conversation loop for autonomous tool calling:
 * 1. Send messages to LLM
 * 2. Parse streaming response for tool calls
 * 3. Execute tools via ToolExecutor
 * 4. Inject results back into conversation
 * 5. Continue until LLM generates final text response
 */

import type { ToolExecutor } from './executor'
import type { ToolCall, ToolResponseParser } from './toolResponseParser'

// ============================================================================
// Types
// ============================================================================

export interface Message {
	role: 'system' | 'user' | 'assistant' | 'tool'
	content: string
	tool_call_id?: string
	tool_calls?: ToolCall[]
}

export interface ToolExecutionRequest {
	serverId: string
	toolName: string
	parameters: Record<string, unknown>
	source: 'user-codeblock' | 'ai-autonomous'
	documentPath: string
}

export interface ToolExecutionResult {
	content: unknown
	contentType: 'text' | 'json' | 'markdown' | 'image'
	executionDuration: number
}

/**
 * Provider Adapter
 *
 * Abstracts provider-specific details (OpenAI, Claude, etc.)
 * Each provider implements this interface
 */
export interface ProviderAdapter<TChunk = unknown> {
	/**
	 * Send request and stream response
	 */
	sendRequest(messages: Message[]): AsyncGenerator<TChunk>

	/**
	 * Get tool response parser for this provider
	 */
	getParser(): ToolResponseParser<TChunk>

	/**
	 * Find which server provides a tool
	 */
	findServerId(toolName: string): string | null

	/**
	 * Format tool result as message for this provider
	 */
	formatToolResult(toolCallId: string, result: ToolExecutionResult): Message
}

export interface GenerateOptions {
	maxTurns?: number
	documentPath?: string
	onToolCall?: (toolName: string) => void
	onToolResult?: (toolName: string, duration: number) => void
}

// ============================================================================
// Tool Calling Coordinator
// ============================================================================

export class ToolCallingCoordinator {
	/**
	 * Generate response with automatic tool calling
	 *
	 * This is the main entry point for LLM generation with tool support.
	 * It handles the multi-turn conversation loop automatically.
	 */
	async *generateWithTools<TChunk = unknown>(
		messages: Message[],
		adapter: ProviderAdapter<TChunk>,
		executor: ToolExecutor,
		options: GenerateOptions = {}
	): AsyncGenerator<string> {
		const { maxTurns = 10, documentPath = '', onToolCall, onToolResult } = options

		let conversation = [...messages]

		for (let turn = 0; turn < maxTurns; turn++) {
			const parser = adapter.getParser()
			parser.reset()

			let hasTextOutput = false

			// Stream response and parse for tool calls
			for await (const chunk of adapter.sendRequest(conversation)) {
				const parsed = parser.parseChunk(chunk)

				if (parsed?.type === 'text') {
					hasTextOutput = true
					yield parsed.content
				}
			}

			// Check if LLM wants to call tools
			if (parser.hasCompleteToolCalls()) {
				const toolCalls = parser.getToolCalls()

				// Execute each tool call
				for (const toolCall of toolCalls) {
					const serverId = adapter.findServerId(toolCall.name)
					if (!serverId) {
						console.warn(`No server found for tool: ${toolCall.name}`)
						continue
					}

					// Notify about tool execution
					onToolCall?.(toolCall.name)

					try {
						// Execute the tool
						const result = await executor.executeTool({
							serverId,
							toolName: toolCall.name,
							parameters: toolCall.arguments,
							source: 'ai-autonomous',
							documentPath
						})

						// Notify about tool result
						onToolResult?.(toolCall.name, result.executionDuration)

						// Add tool result to conversation
						const toolMessage = adapter.formatToolResult(toolCall.id, result)
						conversation.push(toolMessage)
					} catch (error) {
						console.error(`Tool execution failed for ${toolCall.name}:`, error)
						// Add error message to conversation so LLM knows tool failed
						const errorMessage = adapter.formatToolResult(
							toolCall.id,
							{
								content: { error: error instanceof Error ? error.message : String(error) },
								contentType: 'json',
								executionDuration: 0
							}
						)
						conversation.push(errorMessage)
					}
				}

				// Continue loop - LLM will see tool results and generate final response
				continue
			}

			// No tool calls - if we have text, we're done
			if (hasTextOutput) {
				break
			}

			// No text and no tool calls - something wrong, stop
			break
		}
	}
}

/**
 * Create a tool calling coordinator instance
 */
export function createToolCallingCoordinator(): ToolCallingCoordinator {
	return new ToolCallingCoordinator()
}
