/**
 * Tool Result Formatter
 * Provides unified formatting for tool execution results across different contexts
 */

import type { ToolExecutionResult } from './types'

export interface FormatOptions {
	/**
	 * Whether to wrap result in collapsible section
	 * @default false
	 */
	collapsible?: boolean

	/**
	 * Whether to include metadata (duration, type)
	 * @default true
	 */
	showMetadata?: boolean

	/**
	 * Format style for output
	 * - 'markdown': For callout-style markdown output (used in coordinator)
	 * - 'dom': For DOM element rendering (used in code block processor)
	 * @default 'markdown'
	 */
	format?: 'markdown' | 'dom'

	/**
	 * Include timestamp in output
	 * @default false
	 */
	includeTimestamp?: boolean
}

/**
 * Format cache age for display
 * @internal
 */
function formatCacheAge(ageMs: number): string {
	if (ageMs < 1000) {
		return 'just now'
	}
	const seconds = Math.floor(ageMs / 1000)
	if (seconds < 60) {
		return `${seconds}s ago`
	}
	const minutes = Math.floor(seconds / 60)
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

/**
 * Format tool execution result content based on content type
 */
export function formatResultContent(result: ToolExecutionResult): string {
	const { content, contentType } = result

	switch (contentType) {
		case 'json':
			// Handle special case: single text object in array
			if (Array.isArray(content) && content.length === 1 && 'type' in content[0] && content[0].type === 'text') {
				const escapedContent = String(content[0].text)
				// Convert escaped newlines to actual newlines
				const formattedContent = escapedContent.replace(/\\n/g, '\n').trim()
				return `${formattedContent}\n\n`
			}

			return `\`\`\`json\n${JSON.stringify(content, null, 2)}\n\`\`\``

		case 'markdown':
			return typeof content === 'string' ? content : String(content)

		case 'image':
			return typeof content === 'string' ? `![Tool Result](${content})` : String(content)

		default:
			// text or unknown
			return `\`\`\`text\n${String(content)}\n\`\`\``
	}
}

/**
 * Format tool execution result as markdown
 * Used for inserting results into documents as callouts
 */
export function formatToolResultAsMarkdown(result: ToolExecutionResult, options: FormatOptions = {}): string {
	const { collapsible = false, showMetadata = true, includeTimestamp = false } = options

	const formattedContent = formatResultContent(result)
	const bodyLines = formattedContent.split('\n')

	// Build metadata line
	const metadataParts: string[] = []
	metadataParts.push(`Duration: ${result.executionDuration}ms`)
	if (result.tokensUsed) {
		metadataParts.push(`Tokens: ${result.tokensUsed}`)
	}
	metadataParts.push(`Type: ${result.contentType}`)

	// Add cache indicator to metadata (Task-500-20-10-1)
	if (result.cached) {
		if (result.cacheAge !== undefined) {
			metadataParts.push(`Cached (${formatCacheAge(result.cacheAge)})`)
		} else {
			metadataParts.push('Cached')
		}
	}

	const metadataLine = metadataParts.join(', ')

	// Build callout
	const calloutSymbol = collapsible ? '-' : '+'
	const cacheIndicator = result.cached ? ' 📦' : ''
	const calloutLines: string[] = [`> [!tool]${calloutSymbol} Tool Result (${result.executionDuration}ms)${cacheIndicator}`]

	if (showMetadata) {
		calloutLines.push(`> ${metadataLine}`)
	}

	if (includeTimestamp) {
		const executedAtIso = new Date().toISOString()
		calloutLines.push(`> Executed: ${executedAtIso}`)
	}

	// Add content lines
	calloutLines.push(...bodyLines.map((line) => `> ${line}`))

	return `\n${calloutLines.join('\n')}\n`
}

/**
 * Render tool execution result to DOM element
 * Used for code block rendering
 */
export function renderToolResultToDOM(
	container: HTMLElement,
	result: ToolExecutionResult,
	options: FormatOptions = {}
): void {
	const { collapsible = false, showMetadata = true } = options

	// Clear existing content
	container.empty()

	// Create result container
	const resultContainer = container.createDiv({ cls: 'mcp-tool-result' })

	// Add metadata if requested
	if (showMetadata) {
		const metadata = resultContainer.createDiv({ cls: 'mcp-metadata' })

		// Build metadata text with cache indicator (Task-500-20-10-1)
		let metadataText = `Duration: ${result.executionDuration}ms, Type: ${result.contentType}`
		if (result.cached) {
			if (result.cacheAge !== undefined) {
				metadataText += `, Cached (${formatCacheAge(result.cacheAge)})`
			} else {
				metadataText += ', Cached'
			}
		}

		metadata.createSpan({
			text: metadataText,
			cls: 'mcp-duration'
		})

		if (result.tokensUsed) {
			metadata.createSpan({
				text: `Tokens: ${result.tokensUsed}`,
				cls: 'mcp-tokens'
			})
		}
	}

	// Create content container
	let contentContainer: HTMLElement

	if (collapsible && result.contentType === 'json') {
		// Collapsible JSON result
		const details = resultContainer.createEl('details', { cls: 'mcp-collapsible' })
		details.createEl('summary', { text: 'Tool Result (click to expand)' })
		contentContainer = details.createEl('pre', { cls: 'mcp-content' })
	} else {
		// Direct content display
		contentContainer = resultContainer.createEl('pre', { cls: 'mcp-content' })
	}

	// Render content based on type
	switch (result.contentType) {
		case 'json':
			contentContainer.textContent = JSON.stringify(result.content, null, 2)
			break
		case 'markdown':
			// For markdown, render as text (caller can process markdown separately if needed)
			contentContainer.textContent = String(result.content)
			break
		default:
			contentContainer.textContent = String(result.content)
			break
	}

	// Add status indicator with cache indicator (Task-500-20-10-1)
	const statusIndicator = resultContainer.createDiv({ cls: 'mcp-status' })
	const statusText = result.cached ? '✅ Success 📦 Cached' : '✅ Success'
	statusIndicator.createSpan({
		text: statusText,
		cls: 'mcp-status-success'
	})
}

/**
 * Format tool execution result based on format type
 *
 * This is the main exported function that routes to the appropriate formatter
 */
export function formatToolResult(
	result: ToolExecutionResult,
	containerOrOptions?: HTMLElement | FormatOptions,
	options?: FormatOptions
): string | void {
	// Handle overloaded parameters
	if (containerOrOptions instanceof HTMLElement) {
		// DOM rendering mode
		renderToolResultToDOM(containerOrOptions, result, options)
		return
	}

	// Markdown mode
	const mergedOptions = containerOrOptions || {}
	return formatToolResultAsMarkdown(result, mergedOptions)
}
