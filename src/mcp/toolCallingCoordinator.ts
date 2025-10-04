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
import type { ToolServerInfo } from './types'

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
	findServer(toolName: string): ToolServerInfo | null

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
	server: ToolServerInfo,
	parameters: Record<string, unknown>
): void {
	const cursor = editor.getCursor()
	const paramsJson = JSON.stringify(parameters, null, 2)
	const bodyLines = [
		`Tool: ${toolName}`,
		`Server Name: ${server.name}`,
		`Server ID: ${server.id}`,
		'```json',
		...paramsJson.split('\n'),
		'```'
	]
	const calloutLines = [`> [!tool]- Tool Call (${server.name}: ${toolName})`, ...bodyLines.map((line) => `> ${line}`)]
	const markdown = `\n${calloutLines.join('\n')}\n`
	editor.replaceRange(markdown, cursor)

	const lines = markdown.split('\n')
	const newCursor = {
		line: cursor.line + lines.length - 1,
		ch: lines.length === 1 ? cursor.ch + markdown.length : lines[lines.length - 1].length
	}
	editor.setCursor(newCursor)
}

function formatResultContent(result: ToolExecutionResult): string {
	const { content, contentType } = result
	switch (contentType) {
		case 'json':
			if (Array.isArray(content) && content.length === 1 && 'type' in content[0] && 'text' === content[0].type) {
				/**
				 * We converting this to markdown
				 * [
				 *  {
				 * 	"type": "text",
				 * 	"text": "## TypeScript vs JavaScript: The ONLY Guide You Need!\n\nhttps://dev.to/codeparrot/typescript-vs-javascript-the-only-guide-you-need-1pi\n\n```\ninterface Product {\n id: number;\n"
				 * 	}
				 * ]
				 */
				const escapedContent = String(content[0].text)
				// conver \n to \n
				const formattedContent = escapedContent.replace(/\\n/g, '\n').trim()
				return `${formattedContent}\n\n`
			}

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
	const cursor = editor.getCursor()
	const formattedContent = formatResultContent(result)
	const bodyLines = formattedContent.split('\n')
	const calloutLines = [
		`> [!tool]- Tool Result (${result.executionDuration}ms)`,
		...bodyLines.map((line) => `> ${line}`)
	]
	const markdown = `\n${calloutLines.join('\n')}\n`
	editor.replaceRange(markdown, cursor)

	const lines = markdown.split('\n')
	const newCursor = {
		line: cursor.line + lines.length - 1,
		ch: lines.length === 1 ? cursor.ch + markdown.length : lines[lines.length - 1].length
	}
	editor.setCursor(newCursor)
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

		console.debug(`[Tool Coordinator] Starting generation with ${messages.length} messages`)
		console.debug(`[Tool Coordinator] Max turns: ${maxTurns}, Document: ${documentPath}`)

		const conversation = [...messages]

		for (let turn = 0; turn < maxTurns; turn++) {
			console.debug(`[Tool Coordinator] Turn ${turn + 1}/${maxTurns}`)
			const parser = adapter.getParser()
			parser.reset()

			let hasTextOutput = false
			let chunkCount = 0
			let textChunkCount = 0

			// Stream response and parse for tool calls
			try {
				for await (const chunk of adapter.sendRequest(conversation)) {
					chunkCount++
					console.debug(`[Tool Coordinator] Processing chunk ${chunkCount}`)

					const parsed = parser.parseChunk(chunk)
					console.debug(`[Tool Coordinator] Parsed chunk ${chunkCount}:`, {
						type: parsed?.type,
						hasContent: parsed?.type === 'text' && !!parsed?.content,
						contentLength: parsed?.type === 'text' ? parsed?.content?.length || 0 : 0
					})

					if (parsed?.type === 'text') {
						hasTextOutput = true
						textChunkCount++
						console.debug(`[Tool Coordinator] Yielding text chunk ${textChunkCount}:`, {
							contentLength: parsed.content.length,
							contentPreview: parsed.content.substring(0, 100)
						})
						yield parsed.content
					}
				}
			} catch (error) {
				console.error(`[Tool Coordinator] Error during streaming on turn ${turn + 1}:`, error)
				throw error
			}

			const hasToolCalls = parser.hasCompleteToolCalls()
			console.debug(`[Tool Coordinator] Turn ${turn + 1} complete:`, {
				chunkCount,
				textChunkCount,
				hasTextOutput,
				hasToolCalls
			})

			// Check if LLM wants to call tools
			if (hasToolCalls) {
				const toolCalls = parser.getToolCalls()
				console.debug(
					`[Tool Coordinator] Found ${toolCalls.length} complete tool calls:`,
					toolCalls.map((tc) => tc.name)
				)

				// Record assistant tool call message for conversation history
				conversation.push({
					role: 'assistant',
					content: '',
					tool_calls: toolCalls
				})

				// Execute each tool call
				for (const toolCall of toolCalls) {
					console.debug(`[Tool Coordinator] Executing tool: ${toolCall.name}`, toolCall.arguments)
					const serverInfo = adapter.findServer(toolCall.name)
					if (!serverInfo) {
						console.warn(`[Tool Coordinator] No server found for tool: ${toolCall.name}`)
						continue
					}

					console.debug(
						`[Tool Coordinator] Found server for tool ${toolCall.name}: ${serverInfo.id} (${serverInfo.name})`
					)

					// Notify about tool execution
					onToolCall?.(toolCall.name)
					if (editor) {
						insertToolCallMarkdown(editor, toolCall.name, serverInfo, toolCall.arguments)
					}

					try {
						console.debug(`[Tool Coordinator] Calling executor for tool ${toolCall.name}...`)
						// Execute the tool
						const result = await executor.executeTool({
							serverId: serverInfo.id,
							toolName: toolCall.name,
							parameters: toolCall.arguments,
							source: 'ai-autonomous',
							documentPath
						})

						console.debug(`[Tool Coordinator] Tool ${toolCall.name} executed successfully:`, {
							executionDuration: result.executionDuration,
							contentType: result.contentType,
							contentLength:
								typeof result.content === 'string' ? result.content.length : JSON.stringify(result.content).length
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
						console.error(`[Tool Coordinator] Tool execution failed for ${toolCall.name}:`, error)
						// Log to status bar error buffer
						statusBarManager?.logError(
							'tool',
							`Tool execution failed in AI conversation: ${toolCall.name}`,
							error as Error,
							{
								toolName: toolCall.name,
								serverId: serverInfo.id,
								serverName: serverInfo.name,
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

				console.debug(`[Tool Coordinator] Tool execution complete, continuing conversation loop`)
				// Continue loop - LLM will see tool results and generate final response
				continue
			} else {
				console.debug(`[Tool Coordinator] No complete tool calls found`)
			}

			// No tool calls - if we have text, we're done
			if (hasTextOutput) {
				console.debug(`[Tool Coordinator] No tool calls, but we have text output - ending generation`)
				break
			}

			// No text and no tool calls - something wrong, stop
			console.warn(`[Tool Coordinator] No text output and no tool calls - ending generation after ${turn + 1} turns`)
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
