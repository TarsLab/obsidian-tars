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

import pLimit from 'p-limit'
import type { Editor } from 'obsidian'
import { createLogger } from '../logger'
import type { StatusBarManager } from '../statusBarManager'
import type { ToolExecutor } from './executor'
import type { ToolCall, ToolResponseParser } from './toolResponseParser'
import { type CachedToolResult, DocumentToolCache } from './toolResultCache'
import { formatToolResultAsMarkdown } from './toolResultFormatter'
import type { ToolServerInfo } from './types'

const logger = createLogger('mcp:tool-coordinator')

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
	onPromptCachedResult?: (
		toolName: string,
		cached: import('./toolResultCache').CachedToolResult
	) => Promise<'re-execute' | 'use-cached' | 'cancel'>
	autoUseDocumentCache?: boolean
	parallelExecution?: boolean
	maxParallelTools?: number
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

function insertToolResultMarkdown(editor: Editor, result: ToolExecutionResult): void {
	const cursor = editor.getCursor()

	// Use shared formatter with collapsible and timestamp options
	const markdown = formatToolResultAsMarkdown(result, {
		collapsible: true,
		showMetadata: false, // Duration already shown in callout header
		includeTimestamp: true
	})

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
	 * Execute a single tool call
	 * Returns both successful results and errors
	 */
	private async executeSingleTool(
		toolCall: ToolCall,
		adapter: ProviderAdapter,
		executor: ToolExecutor,
		context: {
			turn: number
			documentPath: string
			documentCache: DocumentToolCache | null
			editor?: Editor
			onToolCall?: (toolName: string) => void
			onToolResult?: (toolName: string, duration: number) => void
			statusBarManager?: StatusBarManager
			onPromptCachedResult?: (
				toolName: string,
				cached: CachedToolResult
			) => Promise<'re-execute' | 'use-cached' | 'cancel'>
			autoUseDocumentCache: boolean
		}
	): Promise<{ toolCall: ToolCall; result?: ToolExecutionResult; error?: Error; cancelled?: boolean }> {
		const {
			turn,
			documentPath,
			documentCache,
			editor,
			onToolCall,
			onToolResult,
			statusBarManager,
			onPromptCachedResult,
			autoUseDocumentCache
		} = context

		logger.debug('preparing tool execution', {
			turn,
			tool: toolCall.name,
			argumentKeys: Object.keys(toolCall.arguments || {})
		})

		// Find server
		const serverInfo = adapter.findServer(toolCall.name)
		if (!serverInfo) {
			logger.warn('no server found for requested tool', { tool: toolCall.name })
			return { toolCall, error: new Error(`No server found for tool: ${toolCall.name}`) }
		}

		logger.debug('resolved tool server', {
			tool: toolCall.name,
			serverId: serverInfo.id,
			serverName: serverInfo.name
		})

		// Check cache
		let cachedResult: CachedToolResult | null = null
		if (documentCache && editor) {
			cachedResult = documentCache.findExistingResult(
				editor,
				serverInfo.id,
				toolCall.name,
				toolCall.arguments || {}
			)
		}

		// Handle cache decision
		let decision: 'execute' | 'use-cached' | 'cancel' = 'execute'
		if (cachedResult) {
			if (autoUseDocumentCache) {
				decision = 'use-cached'
			} else {
				const handler = onPromptCachedResult ?? promptCachedResultWithNotice
				const choice = await handler(toolCall.name, cachedResult)
				if (choice === 'use-cached') {
					decision = 'use-cached'
				} else if (choice === 'cancel') {
					decision = 'cancel'
				}
			}
		}

		if (decision === 'cancel') {
			logger.info('tool execution cancelled by user via cache decision', {
				tool: toolCall.name,
				documentPath
			})
			return { toolCall, cancelled: true }
		}

		if (decision === 'use-cached' && cachedResult) {
			logger.info('using cached tool result', {
				tool: toolCall.name,
				documentPath,
				executedAt: cachedResult.executedAt
			})
			const cachedExecution = convertCachedResultToToolExecution(cachedResult)
			onToolResult?.(toolCall.name, cachedExecution.executionDuration)
			return { toolCall, result: cachedExecution }
		}

		// Notify about tool execution
		onToolCall?.(toolCall.name)
		if (editor) {
			insertToolCallMarkdown(editor, toolCall.name, serverInfo, toolCall.arguments)
		}

		try {
			logger.debug('invoking tool executor', { tool: toolCall.name })
			// Execute the tool
			const result = await executor.executeTool({
				serverId: serverInfo.id,
				toolName: toolCall.name,
				parameters: toolCall.arguments,
				source: 'ai-autonomous',
				documentPath
			})

			logger.debug('tool execution succeeded', {
				tool: toolCall.name,
				executionDuration: result.executionDuration,
				contentType: result.contentType,
				contentLength: typeof result.content === 'string' ? result.content.length : JSON.stringify(result.content).length
			})

			// Notify about tool result
			onToolResult?.(toolCall.name, result.executionDuration)
			if (editor) {
				insertToolResultMarkdown(editor, result)
			}

			return { toolCall, result }
		} catch (error) {
			logger.error('tool execution failed', { tool: toolCall.name, error })
			// Log to status bar error buffer
			statusBarManager?.logError('tool', `Tool execution failed in AI conversation: ${toolCall.name}`, error as Error, {
				toolName: toolCall.name,
				serverId: serverInfo.id,
				serverName: serverInfo.name,
				documentPath,
				source: 'ai-autonomous'
			})

			return { toolCall, error: error as Error }
		}
	}

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
		const {
			maxTurns = 10,
			documentPath = '',
			onToolCall,
			onToolResult,
			editor,
			statusBarManager,
			onPromptCachedResult,
			autoUseDocumentCache = false,
			parallelExecution = false,
			maxParallelTools = parallelExecution ? 3 : 1
		} = options

		logger.debug('starting generation loop', {
			initialMessageCount: messages.length,
			maxTurns,
			documentPath,
			parallelExecution,
			maxParallelTools
		})

		const conversation = [...messages]
		const documentCache = editor ? new DocumentToolCache() : null

		for (let turn = 0; turn < maxTurns; turn++) {
			logger.debug('processing turn', { turn: turn + 1, maxTurns })
			const parser = adapter.getParser()
			parser.reset()

			let hasTextOutput = false
			let chunkCount = 0
			let textChunkCount = 0

			// Stream response and parse for tool calls
			try {
				for await (const chunk of adapter.sendRequest(conversation)) {
					chunkCount++
					logger.debug('processing provider chunk', { turn: turn + 1, chunk: chunkCount })

					const parsed = parser.parseChunk(chunk)
					logger.debug('parsed chunk', {
						turn: turn + 1,
						chunk: chunkCount,
						type: parsed?.type,
						contentLength: parsed?.type === 'text' ? parsed?.content?.length || 0 : 0
					})

					if (parsed?.type === 'text') {
						hasTextOutput = true
						textChunkCount++
						logger.debug('yielding text chunk', {
							turn: turn + 1,
							chunk: textChunkCount,
							contentLength: parsed.content.length
						})
						yield parsed.content
					}
				}
			} catch (error) {
				logger.error('error during streaming', { turn: turn + 1, error })
				throw error
			}

			const hasToolCalls = parser.hasCompleteToolCalls()
			logger.debug('turn complete', {
				turn: turn + 1,
				chunkCount,
				textChunkCount,
				hasTextOutput,
				hasToolCalls
			})

			// Check if LLM wants to call tools
			if (hasToolCalls) {
				const toolCalls = parser.getToolCalls()
				logger.debug('tool calls detected', {
					turn: turn + 1,
					count: toolCalls.length,
					names: toolCalls.map((tc) => tc.name)
				})

				// Record assistant tool call message for conversation history
				conversation.push({
					role: 'assistant',
					content: '',
					tool_calls: toolCalls
				})

				// Execution context for tool calls
				const execContext = {
					turn: turn + 1,
					documentPath,
					documentCache,
					editor,
					onToolCall,
					onToolResult,
					statusBarManager,
					onPromptCachedResult,
					autoUseDocumentCache
				}

				// Execute tools with controlled concurrency (1 = sequential, >1 = parallel)
				logger.debug('executing tools', {
					turn: turn + 1,
					toolCount: toolCalls.length,
					maxParallelTools,
					mode: maxParallelTools === 1 ? 'sequential' : 'parallel'
				})

				// Use p-limit to control concurrency
				const limit = pLimit(maxParallelTools)

				// Create limited execution promises
				const promises = toolCalls.map((toolCall) =>
					limit(() => this.executeSingleTool(toolCall, adapter, executor, execContext))
				)

				// Wait for all to complete (including failures)
				const execResults = await Promise.all(promises)

				logger.debug('tool execution complete', {
					turn: turn + 1,
					total: execResults.length,
					succeeded: execResults.filter((r) => r.result).length,
					failed: execResults.filter((r) => r.error).length,
					cancelled: execResults.filter((r) => r.cancelled).length
				})

				// Process results and add to conversation
				for (const { toolCall, result, error, cancelled } of execResults) {
					if (cancelled) {
						// Skip cancelled executions
						continue
					}

					if (result) {
						// Success - add result to conversation
						const toolMessage = adapter.formatToolResult(toolCall.id, result)
						conversation.push(toolMessage)
					} else if (error) {
						// Failure - add error message to conversation
						const errorMessage = adapter.formatToolResult(toolCall.id, {
							content: { error: error.message },
							contentType: 'json',
							executionDuration: 0
						})
						conversation.push(errorMessage)
					}
				}

				logger.debug('tool execution complete; continuing loop', { turn: turn + 1 })
				// Continue loop - LLM will see tool results and generate final response
				continue
			} else {
				logger.debug('no complete tool calls found', { turn: turn + 1 })
			}

			// No tool calls - if we have text, we're done
			if (hasTextOutput) {
				logger.debug('text output produced without tool calls; ending generation', { turn: turn + 1 })
				break
			}

			// No text and no tool calls - something wrong, stop
			logger.warn('no text output and no tool calls; aborting generation', { turn: turn + 1 })
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

function convertCachedResultToToolExecution(cached: CachedToolResult): ToolExecutionResult {
	return {
		content: cached.resultMarkdown,
		contentType: 'markdown',
		executionDuration: cached.durationMs ?? 0
	}
}

function promptCachedResultWithNotice(
	toolName: string,
	cached: CachedToolResult
): Promise<'re-execute' | 'use-cached' | 'cancel'> {
	return new Promise((resolve) => {
		const NoticeCtor = (globalThis as { Notice?: new (...args: any[]) => any }).Notice
		if (typeof NoticeCtor !== 'function') {
			resolve('re-execute')
			return
		}

		try {
			const notice: any = new NoticeCtor('', 0)
			const root = notice?.noticeEl?.createDiv?.({ cls: 'mcp-cache-notice' }) ?? null
			const container = root ?? notice?.noticeEl
			if (!container) {
				resolve('re-execute')
				return
			}

			if (typeof container.empty === 'function') {
				container.empty()
			} else if ('innerHTML' in container) {
				;(container as HTMLElement).innerHTML = ''
			}

			const ageLabel = cached.executedAt ? formatCacheAgeLabel(cached.executedAt) : 'previously'

			container.createEl?.('p', {
				text: `Tool "${toolName}" already has a cached result (${ageLabel}).`
			})
			container.createEl?.('p', {
				cls: 'mcp-cache-meta',
				text: 'Choose how you want to proceed.'
			})

			const actions = container.createDiv?.({ cls: 'mcp-cache-actions' }) ?? container
			const cleanup = (choice: 're-execute' | 'use-cached' | 'cancel') => {
				if (typeof notice?.hide === 'function') {
					notice.hide()
				}
				resolve(choice)
			}

			actions
				.createEl?.('button', { text: 'Use Cached', cls: 'mod-cta' })
				?.addEventListener('click', () => cleanup('use-cached'))

			actions
				.createEl?.('button', { text: 'Re-execute', cls: 'mod-warning' })
				?.addEventListener('click', () => cleanup('re-execute'))

			actions.createEl?.('button', { text: 'Cancel' })?.addEventListener('click', () => cleanup('cancel'))
		} catch {
			resolve('re-execute')
		}
	})
}

function formatCacheAgeLabel(executedAt: number): string {
	const diffMs = Date.now() - executedAt
	if (!Number.isFinite(diffMs) || diffMs < 0) {
		return 'previously'
	}
	const minutes = Math.floor(diffMs / 60000)
	if (minutes < 1) {
		return 'just now'
	}
	if (minutes < 60) {
		return `${minutes}m ago`
	}
	const hours = Math.floor(minutes / 60)
	if (hours < 24) {
		return `${hours}h ago`
	}
	const days = Math.floor(hours / 24)
	return `${days}d ago`
}
