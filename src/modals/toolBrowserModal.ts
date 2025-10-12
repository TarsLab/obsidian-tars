/**
 * Tool Browser Modal
 * Allows users to browse all available MCP tools across servers
 * with search, filtering, and code block insertion capabilities
 */

import { type App, type Editor, Modal } from 'obsidian'
import { createLogger } from '../logger'
import type { MCPServerManager } from '../mcp/managerMCPUse'
import type { ToolDefinition } from '../mcp/types'

const logger = createLogger('modal:tool-browser')

interface ToolWithServer {
	tool: ToolDefinition
	serverId: string
	serverName: string
}

export class ToolBrowserModal extends Modal {
	private mcpManager: MCPServerManager
	private editor?: Editor
	private tools: ToolWithServer[] = []
	private filteredTools: ToolWithServer[] = []
	private selectedServerId: string = 'all'
	private searchQuery: string = ''

	constructor(app: App, mcpManager: MCPServerManager, editor?: Editor) {
		super(app)
		this.mcpManager = mcpManager
		this.editor = editor
	}

	async onOpen() {
		const { contentEl } = this
		contentEl.empty()
		contentEl.addClass('mcp-tool-browser-modal')

		// Header
		contentEl.createEl('h2', { text: 'Browse MCP Tools' })

		// Load tools from all servers
		await this.loadTools()

		// Filter controls container
		const filterContainer = contentEl.createDiv({ cls: 'mcp-tool-browser-filters' })

		// Search input
		const searchContainer = filterContainer.createDiv({ cls: 'mcp-search-container' })
		searchContainer.createEl('label', { text: 'Search:', cls: 'mcp-search-label' })
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: 'Search tools by name or description...',
			cls: 'mcp-search-input'
		})
		searchInput.addEventListener('input', (e) => {
			this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase()
			this.filterAndRenderTools(contentEl)
		})

		// Server filter dropdown
		const serverContainer = filterContainer.createDiv({ cls: 'mcp-server-filter-container' })
		serverContainer.createEl('label', { text: 'Server:', cls: 'mcp-server-filter-label' })
		const serverSelect = serverContainer.createEl('select', { cls: 'mcp-server-filter' })

		// Add "All Servers" option
		const allOption = serverSelect.createEl('option', { value: 'all', text: 'All Servers' })
		allOption.selected = true

		// Add server options
		const servers = this.mcpManager.listServers()
		for (const server of servers) {
			serverSelect.createEl('option', {
				value: server.id,
				text: `${server.name} (${this.tools.filter((t) => t.serverId === server.id).length} tools)`
			})
		}

		serverSelect.addEventListener('change', (e) => {
			this.selectedServerId = (e.target as HTMLSelectElement).value
			this.filterAndRenderTools(contentEl)
		})

		// Tool count
		const countDiv = filterContainer.createDiv({ cls: 'mcp-tool-count' })
		countDiv.setText(`Showing ${this.tools.length} tools`)

		// Tools container
		const toolsContainer = contentEl.createDiv({ cls: 'mcp-tools-container' })

		// Initial render
		this.filteredTools = [...this.tools]
		this.renderTools(toolsContainer, countDiv)
	}

	private async loadTools() {
		this.tools = []
		const servers = this.mcpManager.listServers()

		for (const server of servers) {
			if (!server.enabled) continue

			try {
				const client = this.mcpManager.getClient(server.id)
				if (!client || !client.isConnected()) continue

				const serverTools = await client.listTools()
				for (const tool of serverTools) {
					this.tools.push({
						tool,
						serverId: server.id,
						serverName: server.name
					})
				}
			} catch (error) {
				logger.warn('failed to load tools from server', { server: server.name, error })
			}
		}
	}

	private filterAndRenderTools(contentEl: HTMLElement) {
		// Apply filters
		this.filteredTools = this.tools.filter((toolWithServer) => {
			// Server filter
			if (this.selectedServerId !== 'all' && toolWithServer.serverId !== this.selectedServerId) {
				return false
			}

			// Search filter
			if (this.searchQuery) {
				const toolName = toolWithServer.tool.name.toLowerCase()
				const toolDesc = (toolWithServer.tool.description || '').toLowerCase()
				const serverName = toolWithServer.serverName.toLowerCase()

				if (
					!toolName.includes(this.searchQuery) &&
					!toolDesc.includes(this.searchQuery) &&
					!serverName.includes(this.searchQuery)
				) {
					return false
				}
			}

			return true
		})

		// Update count
		const countDiv = contentEl.querySelector('.mcp-tool-count')
		if (countDiv) {
			countDiv.setText(`Showing ${this.filteredTools.length} of ${this.tools.length} tools`)
		}

		// Re-render tools
		const toolsContainer = contentEl.querySelector('.mcp-tools-container')
		if (toolsContainer) {
			toolsContainer.empty()
			this.renderTools(toolsContainer as HTMLElement, countDiv as HTMLElement)
		}
	}

	private renderTools(container: HTMLElement, _countDiv: HTMLElement) {
		if (this.filteredTools.length === 0) {
			container.createEl('p', {
				text:
					this.tools.length === 0
						? 'No tools available. Make sure MCP servers are running and connected.'
						: 'No tools match your search criteria.',
				cls: 'mcp-no-tools'
			})
			return
		}

		for (const toolWithServer of this.filteredTools) {
			this.renderToolCard(container, toolWithServer)
		}
	}

	private renderToolCard(container: HTMLElement, toolWithServer: ToolWithServer) {
		const { tool, serverName, serverId } = toolWithServer

		const card = container.createDiv({ cls: 'mcp-tool-card' })

		// Tool header
		const header = card.createDiv({ cls: 'mcp-tool-header' })
		header.createEl('h3', { text: tool.name, cls: 'mcp-tool-name' })
		header.createEl('span', { text: serverName, cls: 'mcp-tool-server-badge' })

		// Tool description
		if (tool.description) {
			card.createEl('p', { text: tool.description, cls: 'mcp-tool-description' })
		}

		// Parameters section
		if (tool.inputSchema?.properties) {
			const paramsDetails = card.createEl('details', { cls: 'mcp-tool-params' })
			const paramsSummary = paramsDetails.createEl('summary')
			paramsSummary.setText('Parameters')

			const paramsList = paramsDetails.createEl('ul', { cls: 'mcp-params-list' })

			const properties = tool.inputSchema.properties as Record<string, any>
			const required = (tool.inputSchema.required as string[]) || []

			for (const [paramName, paramSchema] of Object.entries(properties)) {
				const isRequired = required.includes(paramName)
				const paramType = paramSchema.type || 'any'
				const paramDesc = paramSchema.description || ''

				const paramItem = paramsList.createEl('li', { cls: 'mcp-param-item' })
				const paramNameEl = paramItem.createEl('strong', { text: paramName })
				if (isRequired) {
					paramNameEl.addClass('mcp-param-required')
				}

				const paramDetails = paramItem.createSpan({ cls: 'mcp-param-details' })
				paramDetails.setText(` (${paramType}${isRequired ? ', required' : ''})`)

				if (paramDesc) {
					paramItem.createEl('div', { text: paramDesc, cls: 'mcp-param-description' })
				}
			}
		}

		// Insert button
		if (this.editor) {
			const insertBtn = card.createEl('button', {
				text: 'Insert Code Block',
				cls: 'mod-cta mcp-insert-btn'
			})

			insertBtn.addEventListener('click', () => {
				this.insertToolCodeBlock(serverId, tool)
				this.close()
			})
		}
	}

	private insertToolCodeBlock(serverId: string, tool: ToolDefinition) {
		if (!this.editor) return

		// Generate parameter template
		const params: string[] = []
		const required = (tool.inputSchema?.required as string[]) || []

		if (tool.inputSchema?.properties) {
			const properties = tool.inputSchema.properties as Record<string, any>
			for (const [paramName, paramSchema] of Object.entries(properties)) {
				const isRequired = required.includes(paramName)

				// Add example value based on type
				let exampleValue = ''
				switch (paramSchema.type) {
					case 'string':
						exampleValue = paramSchema.example ? `"${paramSchema.example}"` : '""'
						break
					case 'number':
					case 'integer':
						exampleValue = paramSchema.example?.toString() || '0'
						break
					case 'boolean':
						exampleValue = paramSchema.example?.toString() || 'false'
						break
					case 'array':
						exampleValue = '[]'
						break
					case 'object':
						exampleValue = '{}'
						break
					default:
						exampleValue = '""'
				}

				// Add optional comment for non-required parameters
				const optionalComment = isRequired ? '' : ' # optional'
				params.push(`${paramName}: ${exampleValue}${optionalComment}`)
			}
		}

		// Build code block
		const codeBlock = [`\`\`\`${serverId}`, `tool: ${tool.name}`, ...params, '```'].join('\n')

		// Insert at cursor
		const cursor = this.editor.getCursor()
		this.editor.replaceRange(`${codeBlock}\n`, cursor)

		// Position cursor at first required parameter value (or first parameter if no required ones)
		if (params.length > 0) {
			// Find the first required parameter, or use first parameter if none are required
			let firstParamIndex = -1
			const requiredParams = (tool.inputSchema?.required as string[]) || []

			if (requiredParams.length > 0 && tool.inputSchema?.properties) {
				const properties = tool.inputSchema.properties as Record<string, any>
				const propertyNames = Object.keys(properties)
				for (let i = 0; i < propertyNames.length; i++) {
					if (requiredParams.includes(propertyNames[i])) {
						firstParamIndex = i
						break
					}
				}
			}

			// If no required params found, use first parameter
			if (firstParamIndex === -1) {
				firstParamIndex = 0
			}

			// Calculate cursor position
			// Line offset: 1 (opening fence) + 1 (tool line) + firstParamIndex
			const targetLine = cursor.line + 2 + firstParamIndex
			const paramLine = params[firstParamIndex]

			// Find the position after the colon and space (e.g., "paramName: " -> position after ": ")
			const colonIndex = paramLine.indexOf(': ')
			if (colonIndex !== -1) {
				// Position cursor at the start of the value
				this.editor.setCursor({ line: targetLine, ch: colonIndex + 2 })
			}
		}
	}

	onClose() {
		const { contentEl } = this
		contentEl.empty()
	}
}
