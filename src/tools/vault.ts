import { App, TFile } from 'obsidian'
import { Tool, ToolFunction, ToolResult, defaultToolRegistry } from './index'

// Obsidian Vault 特有操作工具

// 搜索笔记工具
const searchNotesTool: Tool = {
	name: 'search_notes',
	description: 'Search for notes in the vault by content or filename',
	input_schema: {
		type: 'object',
		properties: {
			query: {
				type: 'string',
				description: 'The search query'
			},
			searchType: {
				type: 'string',
				enum: ['content', 'filename', 'both'],
				description: 'Whether to search in content, filename, or both',
				default: 'both'
			},
			limit: {
				type: 'number',
				description: 'Maximum number of results to return',
				default: 10
			}
		},
		required: ['query']
	}
}

const searchNotesFunction: ToolFunction = async (
	app: App,
	parameters: Record<string, unknown>
): Promise<ToolResult> => {
	const { query, searchType = 'both', limit = 10 } = parameters

	if (typeof query !== 'string') {
		return {
			content: [{ type: 'text', text: 'Invalid query parameter' }],
			isError: true
		}
	}

	try {
		const files = app.vault.getMarkdownFiles()
		const results: { file: TFile; score: number; reason: string }[] = []

		for (const file of files) {
			let score = 0
			const reasons: string[] = []

			// Search in filename
			if (searchType === 'filename' || searchType === 'both') {
				if (file.name.toLowerCase().includes(query.toLowerCase())) {
					score += 10
					reasons.push('filename match')
				}
			}

			// Search in content
			if (searchType === 'content' || searchType === 'both') {
				try {
					const content = await app.vault.read(file)
					const matches = content.toLowerCase().match(new RegExp(query.toLowerCase(), 'g'))
					if (matches) {
						score += matches.length
						reasons.push(`${matches.length} content matches`)
					}
				} catch {
					// Skip files that can't be read
					continue
				}
			}

			if (score > 0) {
				results.push({ file, score, reason: reasons.join(', ') })
			}
		}

		// Sort by score and limit results
		results.sort((a, b) => b.score - a.score)
		const limitedResults = results.slice(0, Number(limit))

		if (limitedResults.length === 0) {
			return {
				content: [{ type: 'text', text: `No notes found matching: ${query}` }]
			}
		}

		const resultText = limitedResults
			.map(({ file, score, reason }) => `- ${file.path} (score: ${score}, ${reason})`)
			.join('\n')

		return {
			content: [
				{
					type: 'text',
					text: `Found ${limitedResults.length} notes matching "${query}":\n${resultText}`
				}
			]
		}
	} catch (error) {
		return {
			content: [{ type: 'text', text: `Search failed: ${error.message}` }],
			isError: true
		}
	}
}

// 获取笔记链接工具
const getNoteLinksTool: Tool = {
	name: 'get_note_links',
	description: 'Get all outgoing links from a note',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'The path to the note'
			}
		},
		required: ['path']
	}
}

const getNoteLinksFunction: ToolFunction = async (
	app: App,
	parameters: Record<string, unknown>
): Promise<ToolResult> => {
	const { path } = parameters

	if (typeof path !== 'string') {
		return {
			content: [{ type: 'text', text: 'Invalid path parameter' }],
			isError: true
		}
	}

	try {
		const file = app.vault.getAbstractFileByPath(path)
		if (!file || !(file instanceof TFile)) {
			return {
				content: [{ type: 'text', text: `File not found: ${path}` }],
				isError: true
			}
		}

		const fileCache = app.metadataCache.getFileCache(file)
		if (!fileCache) {
			return {
				content: [{ type: 'text', text: `No metadata found for file: ${path}` }],
				isError: true
			}
		}

		const links = fileCache.links || []
		const embeds = fileCache.embeds || []

		const allLinks = [...links, ...embeds]

		if (allLinks.length === 0) {
			return {
				content: [{ type: 'text', text: `No links found in: ${path}` }]
			}
		}

		const linkList = allLinks.map((link) => `- ${link.link} (${link.original})`).join('\n')

		return {
			content: [
				{
					type: 'text',
					text: `Links in ${path}:\n${linkList}`
				}
			]
		}
	} catch (error) {
		return {
			content: [{ type: 'text', text: `Failed to get links: ${error.message}` }],
			isError: true
		}
	}
}

// 获取笔记标签工具
const getNoteTagsTool: Tool = {
	name: 'get_note_tags',
	description: 'Get all tags from a note',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'The path to the note'
			}
		},
		required: ['path']
	}
}

const getNoteTagsFunction: ToolFunction = async (
	app: App,
	parameters: Record<string, unknown>
): Promise<ToolResult> => {
	const { path } = parameters

	if (typeof path !== 'string') {
		return {
			content: [{ type: 'text', text: 'Invalid path parameter' }],
			isError: true
		}
	}

	try {
		const file = app.vault.getAbstractFileByPath(path)
		if (!file || !(file instanceof TFile)) {
			return {
				content: [{ type: 'text', text: `File not found: ${path}` }],
				isError: true
			}
		}

		const fileCache = app.metadataCache.getFileCache(file)
		if (!fileCache) {
			return {
				content: [{ type: 'text', text: `No metadata found for file: ${path}` }],
				isError: true
			}
		}

		const tags = fileCache.tags || []

		if (tags.length === 0) {
			return {
				content: [{ type: 'text', text: `No tags found in: ${path}` }]
			}
		}

		const tagList = tags.map((tag) => `- ${tag.tag}`).join('\n')

		return {
			content: [
				{
					type: 'text',
					text: `Tags in ${path}:\n${tagList}`
				}
			]
		}
	} catch (error) {
		return {
			content: [{ type: 'text', text: `Failed to get tags: ${error.message}` }],
			isError: true
		}
	}
}

// 注册 Vault 操作工具
export function registerVaultTools() {
	defaultToolRegistry.register(searchNotesTool, searchNotesFunction)
	defaultToolRegistry.register(getNoteLinksTool, getNoteLinksFunction)
	defaultToolRegistry.register(getNoteTagsTool, getNoteTagsFunction)
}
