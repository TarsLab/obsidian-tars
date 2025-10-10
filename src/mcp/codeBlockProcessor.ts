/**
 * Code Block Processor
 * Handles parsing and rendering of MCP tool invocation code blocks
 */

import { parse as parseYAML } from 'yaml'

import { createLogger } from '../logger'
import { YAMLParseError } from './errors'
import type { ErrorInfo, MCPServerConfig, ToolExecutionResult, ToolInvocation } from './types'
import { logError } from './utils'

const logger = createLogger('mcp:code-block-processor')

export class CodeBlockProcessor {
	private serverConfigs: MCPServerConfig[] = []

	/**
	 * Update server configurations
	 */
	updateServerConfigs(configs: MCPServerConfig[]): void {
		this.serverConfigs = configs
	}

	/**
	 * Parse code block content to extract tool invocation
	 */
	parseToolInvocation(source: string, language: string): ToolInvocation | null {
		try {
			// Check if language matches a server name
			const serverConfig = this.getServerByName(language)
			if (!serverConfig) {
				return null // Not an MCP code block
			}

			const lines = source.trim().split('\n')
			if (lines.length === 0) {
				return null
			}

			// Find tool line (format: tool: tool_name)
			const toolLine = lines.find((line) => line.trim().startsWith('tool:'))
			if (!toolLine) {
				return null
			}

			const toolMatch = toolLine.trim().match(/^tool:\s*(.+)$/)
			if (!toolMatch) {
				return null
			}

			const toolName = toolMatch[1].trim()

			// Parse remaining lines as YAML parameters
			const yamlLines = lines.filter((line) => !line.trim().startsWith('tool:'))
			const parameters = this.parseYAMLParameters(yamlLines)

			return {
				serverId: serverConfig.id,
				toolName,
				parameters
			}
		} catch (error) {
			logError('Failed to parse tool invocation', error)
			return null
		}
	}

	/**
	 * Render tool execution result in code block element
	 */
	renderResult(
		el: HTMLElement,
		result: ToolExecutionResult,
		options: {
			collapsible?: boolean
			showMetadata?: boolean
		} = {}
	): void {
		// Clear existing content
		el.empty()

		// Create result container
		const container = el.createDiv({ cls: 'mcp-tool-result' })

		// Add metadata if requested
		if (options.showMetadata) {
			const metadata = container.createDiv({ cls: 'mcp-metadata' })
			metadata.createSpan({
				text: `Duration: ${result.executionDuration}ms`,
				cls: 'mcp-duration'
			})

			if (result.tokensUsed) {
				metadata.createSpan({
					text: `Tokens: ${result.tokensUsed}`,
					cls: 'mcp-tokens'
				})
			}

			metadata.createSpan({
				text: `Type: ${result.contentType}`,
				cls: 'mcp-content-type'
			})
		}

		// Create content container
		let contentContainer: HTMLElement

		if (options.collapsible && result.contentType === 'json') {
			// Collapsible JSON result
			const details = container.createEl('details', { cls: 'mcp-collapsible' })
			details.createEl('summary', { text: 'Tool Result (click to expand)' })
			contentContainer = details.createEl('pre', { cls: 'mcp-content' })
		} else {
			// Direct content display
			contentContainer = container.createEl('pre', { cls: 'mcp-content' })
		}

		// Render content based on type
		switch (result.contentType) {
			case 'json':
				contentContainer.textContent = JSON.stringify(result.content, null, 2)
				break
			case 'markdown':
				// For markdown, we'd need to render it, but for now just show as text
				contentContainer.textContent = String(result.content)
				break
			default:
				contentContainer.textContent = String(result.content)
				break
		}

		// Add status indicator
		const statusIndicator = container.createDiv({ cls: 'mcp-status' })
		statusIndicator.createSpan({
			text: '✅ Success',
			cls: 'mcp-status-success'
		})
	}

	/**
	 * Render error state in code block element
	 */
	renderError(el: HTMLElement, error: ErrorInfo): void {
		el.empty()

		const container = el.createDiv({ cls: 'mcp-tool-error' })

		// Error header
		const header = container.createDiv({ cls: 'mcp-error-header' })
		header.createSpan({
			text: '❌ Tool Execution Failed',
			cls: 'mcp-error-title'
		})

		// Error message
		const message = container.createDiv({ cls: 'mcp-error-message' })
		message.textContent = error.message

		// Error details (if available)
		if (error.details) {
			const details = container.createDiv({ cls: 'mcp-error-details' })
			details.createEl('pre').textContent = JSON.stringify(error.details, null, 2)
		}

		// Timestamp
		const timestamp = container.createDiv({ cls: 'mcp-error-timestamp' })
		timestamp.textContent = `Error occurred at ${new Date(error.timestamp).toLocaleString()}`
	}

	/**
	 * Render pending/executing state in code block element
	 */
	renderStatus(el: HTMLElement, status: 'pending' | 'executing', onCancel?: () => void): void {
		el.empty()

		const container = el.createDiv({ cls: 'mcp-tool-status' })

		const indicator = status === 'pending' ? '⏳' : '⚙️'
		const message = status === 'pending' ? 'Tool execution queued...' : 'Executing tool...'

		container.createSpan({
			text: `${indicator} ${message}`,
			cls: 'mcp-status-indicator'
		})

		// Add cancel button for executing tools
		if (status === 'executing' && onCancel) {
			const cancelButton = container.createEl('button', {
				text: 'Cancel',
				cls: 'mcp-cancel-button'
			})
			cancelButton.addEventListener('click', (event) => {
				event.preventDefault()
				event.stopPropagation()
				onCancel()
			})
		}
	}

	/**
	 * Parse YAML parameters from code block lines
	 */
	parseYAMLParameters(lines: string[]): Record<string, unknown> {
		if (lines.length === 0) {
			return {}
		}

		const source = lines.join('\n')

		try {
			const parsed = parseYAML(source)
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>
			}
			if (parsed === null || parsed === undefined) {
				return {}
			}
			logger.debug('unexpected yaml root type for tool parameters, falling back', {
				rootType: typeof parsed
			})
		} catch (yamlError) {
			logger.debug('yaml parsing failed for tool parameters, falling back to manual parser', yamlError)
		}

		// Fallback: simple key-value parser (legacy behaviour)
		try {
			const params: Record<string, unknown> = {}
			let currentKey = ''
			let currentValue: string[] = []

			for (const line of lines) {
				const trimmed = line.trim()
				if (trimmed === '') {
					continue
				}

				const keyValueMatch = trimmed.match(/^([^:]+):\s*(.*)$/)
				const leadingWhitespace = line.match(/^\s*/)?.[0]?.length ?? 0
				const isRootLevel = leadingWhitespace === 0

				if (keyValueMatch && isRootLevel) {
					if (currentKey) {
						params[currentKey] = this.parseYAMLValue(currentValue.join('\n'))
					}

					currentKey = keyValueMatch[1].trim()
					currentValue = [keyValueMatch[2].trim()]
				} else {
					currentValue.push(trimmed)
				}
			}

			if (currentKey) {
				params[currentKey] = this.parseYAMLValue(currentValue.join('\n'))
			}

			return params
		} catch (error) {
			throw new YAMLParseError(undefined, error instanceof Error ? error.message : String(error))
		}
	}

	/**
	 * Parse individual YAML value
	 */
	private parseYAMLValue(value: string): unknown {
		const trimmed = value.trim()

		// Handle empty/null values
		if (trimmed === '' || trimmed === 'null') {
			return null
		}

		// Handle boolean values
		if (trimmed === 'true') return true
		if (trimmed === 'false') return false

		// Handle numeric values
		if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
			return parseFloat(trimmed)
		}

		// Handle JSON-like arrays/objects (e.g., [] or {})
		if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
			try {
				return JSON.parse(trimmed)
			} catch (error) {
				logger.debug('failed to parse json-like parameter value', error)
			}
		}

		// Handle quoted strings (remove quotes)
		if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
			return trimmed.slice(1, -1)
		}

		// Default to string
		return trimmed
	}

	/**
	 * Get server configuration by name
	 */
	getServerByName(serverName: string): MCPServerConfig | undefined {
		return this.serverConfigs.find((config) => config.name === serverName)
	}
}
