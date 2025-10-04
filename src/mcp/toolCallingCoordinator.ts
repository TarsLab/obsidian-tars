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

import type { Editor } from 'obsidian'
import type { StatusBarManager } from '../statusBarManager'
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
	editor?: Editor
	statusBarManager?: StatusBarManager
}

function insertToolCallMarkdown(
	editor: Editor,
	toolName: string,
	serverId: string,
	parameters: Record<string, unknown>
): void {
	const markdown = `\n\n[🔧 Tool: ${toolName}](mcp://${serverId}/${toolName})\n\`\`\`json\n${JSON.stringify(parameters, null, 2)}\n\`\`\`\n`
	editor.replaceRange(markdown, editor.getCursor())
}

function formatResultContent(result: ToolExecutionResult): string {
	const { content, contentType } = result
	switch (contentType) {
		case 'json':
			return `\`\`\`json\n${JSON.stringify(content, null, 2)}\n\`\`\``
		case 'markdown':
			return typeof content === 'string' ? content : String(content)
		case 'image':
			return typeof content === 'string' ? `![Tool Result](${content})` : String(content)
		default:
			return `\`\`\`text\n${String(content)}\n\`\`\``
	}
}

function insertToolResultMarkdown(editor: Editor, result: ToolExecutionResult): void {
	const formattedContent = formatResultContent(result)
	const markdown = `\n**Result** (${result.executionDuration}ms):\n<details>\n<summary>View Result</summary>\n\n${formattedContent}\n</details>\n`
	editor.replaceRange(markdown, editor.getCursor())
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
		const { maxTurns = 10, documentPath = '', onToolCall, onToolResult, editor, statusBarManager } = options

		const conversation = [...messages]

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
					if (editor) {
						insertToolCallMarkdown(editor, toolCall.name, serverId, toolCall.arguments)
					}

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
						if (editor) {
							insertToolResultMarkdown(editor, result)
						}

						// Add tool result to conversation
						const toolMessage = adapter.formatToolResult(toolCall.id, result)
						conversation.push(toolMessage)
					} catch (error) {
						// Log to status bar error buffer
						statusBarManager?.logError(
							'tool',
							`Tool execution failed in AI conversation: ${toolCall.name}`,
							error as Error,
							{
								toolName: toolCall.name,
								serverId,
								documentPath,
								source: 'ai-autonomous'
							}
						)

						// Add error message to conversation so LLM knows tool failed
						const errorMessage = adapter.formatToolResult(toolCall.id, {
							content: { error: error instanceof Error ? error.message : String(error) },
							contentType: 'json',
							executionDuration: 0
						})
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
