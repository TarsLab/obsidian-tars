/**
 * Tool Response Parser
 *
 * Abstraction layer for parsing tool calls from LLM streaming responses.
 * Each provider has different formats, so we provide parser implementations
 * for OpenAI, Claude, Ollama, etc.
 */

import OpenAI from 'openai'

// ============================================================================
// Common Types
// ============================================================================

export interface ToolCall {
	id: string
	name: string
	arguments: Record<string, unknown>
}

export interface TextChunk {
	type: 'text'
	content: string
}

export interface ToolCallChunk {
	type: 'tool_call'
	id: string
	name?: string
	arguments?: string
	index?: number
}

export type StreamChunk = TextChunk | ToolCallChunk

// ============================================================================
// Parser Interface
// ============================================================================

export interface ToolResponseParser<TProviderChunk = unknown> {
	/**
	 * Parse a streaming chunk from the provider
	 * Returns either text content or tool call information
	 */
	parseChunk(chunk: TProviderChunk): StreamChunk | null

	/**
	 * Check if we have complete tool calls accumulated
	 */
	hasCompleteToolCalls(): boolean

	/**
	 * Get accumulated tool calls
	 */
	getToolCalls(): ToolCall[]

	/**
	 * Reset parser state
	 */
	reset(): void
}

// ============================================================================
// OpenAI Tool Response Parser
// ============================================================================

interface OpenAIChunk {
	choices: Array<{
		delta?: {
			content?: string | null
			tool_calls?: Array<{
				index: number
				id?: string
				type?: 'function'
				function?: {
					name?: string
					arguments?: string
				}
			}>
		}
		finish_reason?: string | null
	}>
}

interface AccumulatedToolCall {
	id: string
	name: string
	arguments: string
}

export class OpenAIToolResponseParser implements ToolResponseParser<OpenAI.ChatCompletionChunk> {
	private toolCalls: Map<number, AccumulatedToolCall> = new Map()
	private finishedToolCalls: ToolCall[] = []

	parseChunk(chunk: OpenAI.ChatCompletionChunk): StreamChunk | null {
		const choice = chunk.choices?.[0]
		if (!choice?.delta) {
			return null
		}

		const { content, tool_calls } = choice.delta

		// Handle text content
		if (content !== undefined && content !== null) {
			return {
				type: 'text',
				content
			}
		}

		// Handle tool calls
		if (tool_calls && tool_calls.length > 0) {
			for (const toolCall of tool_calls) {
				const { index, id, function: func } = toolCall

				// Get or create accumulated tool call
				let accumulated = this.toolCalls.get(index)

				// Initialize with id if this is the first chunk for this index
				if (!accumulated) {
					if (!id) {
						// Skip if we don't have an id yet
						continue
					}
					accumulated = {
						id,
						name: '',
						arguments: ''
					}
					this.toolCalls.set(index, accumulated)
				}

				// Accumulate function name
				if (func?.name) {
					accumulated.name = func.name
				}

				// Accumulate arguments (they come in chunks)
				if (func?.arguments) {
					accumulated.arguments += func.arguments
				}

				// Return tool call chunk
				return {
					type: 'tool_call',
					id: accumulated.id,
					name: func?.name,
					arguments: func?.arguments,
					index
				}
			}
		}

		// Check if stream finished - finalize tool calls
		if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
			this.finalizeToolCalls()
		}

		return null
	}

	hasCompleteToolCalls(): boolean {
		return this.finishedToolCalls.length > 0
	}

	getToolCalls(): ToolCall[] {
		return [...this.finishedToolCalls]
	}

	reset(): void {
		this.toolCalls.clear()
		this.finishedToolCalls = []
	}

	private finalizeToolCalls(): void {
		for (const accumulated of this.toolCalls.values()) {
			if (accumulated.id && accumulated.name && accumulated.arguments) {
				try {
					const parsedArgs = JSON.parse(accumulated.arguments)
					this.finishedToolCalls.push({
						id: accumulated.id,
						name: accumulated.name,
						arguments: parsedArgs
					})
				} catch (error) {
					console.error(`Failed to parse tool call arguments: ${accumulated.arguments}`, error)
					// Still add the tool call with raw string arguments
					this.finishedToolCalls.push({
						id: accumulated.id,
						name: accumulated.name,
						arguments: { _raw: accumulated.arguments }
					})
				}
			}
		}
	}
}

// ============================================================================
// Claude Tool Response Parser
// ============================================================================

type ClaudeStreamEvent =
	| {
			type: 'content_block_start'
			index: number
			content_block:
				| { type: 'text'; text: string }
				| { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
	  }
	| {
			type: 'content_block_delta'
			index: number
			delta:
				| { type: 'text_delta'; text: string }
				| { type: 'input_json_delta'; partial_json: string }
	  }
	| {
			type: 'content_block_stop'
			index: number
	  }
	| {
			type: 'message_delta'
			delta: {
				stop_reason?: string
			}
	  }

interface ClaudeAccumulatedToolCall {
	id: string
	name: string
	inputJson: string
}

export class ClaudeToolResponseParser implements ToolResponseParser<ClaudeStreamEvent> {
	private toolCalls: Map<number, ClaudeAccumulatedToolCall> = new Map()
	private finishedToolCalls: ToolCall[] = []
	private currentBlockIndex = -1

	parseChunk(event: ClaudeStreamEvent): StreamChunk | null {
		switch (event.type) {
			case 'content_block_start': {
				this.currentBlockIndex = event.index
				if (event.content_block.type === 'tool_use') {
					const { id, name } = event.content_block
					this.toolCalls.set(event.index, {
						id,
						name,
						inputJson: ''
					})
					return {
						type: 'tool_call',
						id,
						name
					}
				}
				if (event.content_block.type === 'text') {
					return {
						type: 'text',
						content: event.content_block.text
					}
				}
				return null
			}

			case 'content_block_delta': {
				if (event.delta.type === 'text_delta') {
					return {
						type: 'text',
						content: event.delta.text
					}
				}
				if (event.delta.type === 'input_json_delta') {
					const accumulated = this.toolCalls.get(event.index)
					if (accumulated) {
						accumulated.inputJson += event.delta.partial_json
					}
				}
				return null
			}

			case 'content_block_stop': {
				// Finalize the tool call at this index
				const accumulated = this.toolCalls.get(event.index)
				if (accumulated && accumulated.inputJson) {
					try {
						const parsedInput = JSON.parse(accumulated.inputJson)
						this.finishedToolCalls.push({
							id: accumulated.id,
							name: accumulated.name,
							arguments: parsedInput
						})
					} catch (error) {
						console.error(`Failed to parse Claude tool input: ${accumulated.inputJson}`, error)
					}
				}
				return null
			}

			case 'message_delta': {
				// Message finished
				return null
			}

			default:
				return null
		}
	}

	hasCompleteToolCalls(): boolean {
		return this.finishedToolCalls.length > 0
	}

	getToolCalls(): ToolCall[] {
		return [...this.finishedToolCalls]
	}

	reset(): void {
		this.toolCalls.clear()
		this.finishedToolCalls = []
		this.currentBlockIndex = -1
	}
}

// ============================================================================
// Ollama Tool Response Parser
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

export class OllamaToolResponseParser implements ToolResponseParser<OllamaChunk> {
	private toolCalls: ToolCall[] = []

	parseChunk(chunk: OllamaChunk): StreamChunk | null {
		console.debug('[Ollama Tool Parser] Received chunk:', {
			hasMessage: !!chunk.message,
			contentPreview: chunk.message?.content?.slice(0, 80) ?? null,
			hasToolCalls: !!chunk.message?.tool_calls?.length,
			done: chunk.done
		})
		// Handle text content
		if (chunk.message?.content) {
			console.debug('[Ollama Tool Parser] Emitting text chunk', {
				length: chunk.message.content.length
			})
			return {
				type: 'text',
				content: chunk.message.content
			}
		}

		// Handle tool calls
		// Note: Ollama sends complete tool calls, not streamed
		if (chunk.message?.tool_calls && chunk.message.tool_calls.length > 0) {
			for (const toolCall of chunk.message.tool_calls) {
				console.debug('[Ollama Tool Parser] Processing tool call', {
					name: toolCall.function.name,
					argumentKeys: Object.keys(toolCall.function.arguments || {})
				})
				this.toolCalls.push({
					id: `ollama_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
					name: toolCall.function.name,
					arguments: this.normalizeArguments(toolCall.function.arguments)
				})
			}
		}

		if (!chunk.message && chunk.done) {
			console.debug('[Ollama Tool Parser] Chunk indicates done without message content')
		}

		return null
	}

	hasCompleteToolCalls(): boolean {
		return this.toolCalls.length > 0
	}

	getToolCalls(): ToolCall[] {
		return [...this.toolCalls]
	}

	reset(): void {
		this.toolCalls = []
	}

	private normalizeArguments(args: Record<string, unknown>): Record<string, unknown> {
		const normalized: Record<string, unknown> = {}
		for (const [key, value] of Object.entries(args)) {
			normalized[key] = this.normalizeValue(value)
		}
		return normalized
	}

	private normalizeValue(value: unknown): unknown {
		if (typeof value === 'string') {
			const trimmed = value.trim()
			if (trimmed === '') {
				return value
			}
			if (trimmed === 'true') return true
			if (trimmed === 'false') return false
			if (trimmed === 'null') return null
			if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
				return trimmed.includes('.') ? parseFloat(trimmed) : Number(trimmed)
			}
			return value
		}

		if (Array.isArray(value)) {
			return value.map((item) => this.normalizeValue(item))
		}

		if (value && typeof value === 'object') {
			return this.normalizeArguments(value as Record<string, unknown>)
		}

		return value
	}
}
