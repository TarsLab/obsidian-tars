import { App, TFile, TFolder } from 'obsidian'
import { RunEnv } from 'src/environment'
import { t } from 'src/lang/helper'
import { ToolFunction, ToolResponse } from './index'

// Text Editor Tool - Compliant with Anthropic text_editor_20250728 specification
// Supports view, str_replace, create, insert commands

// Helper function to get file object from path
export const getFileFromPath = (app: App, path: string): { file?: TFile; folder?: TFolder; error?: string } => {
	try {
		const activeFile = app.workspace.getActiveFile()
		if (!activeFile) return { error: 'No active file' }

		const isRoot = activeFile.parent?.isRoot()
		const parentPath = activeFile.parent?.path || app.vault.getRoot().path

		// Handle special paths
		if (path === '.') {
			const folder = app.vault.getAbstractFileByPath(parentPath)
			return folder instanceof TFolder ? { folder } : { error: 'Parent is not a folder' }
		}

		// Handle relative paths, obsidian vault doesn't support relative format
		if (path.startsWith('./')) {
			path = `${path.slice(2)}`
		}

		// Build candidate paths (sorted by priority)
		const candidates = []
		if (!path.includes('/') && !isRoot) {
			// Plain filename: prioritize parent directory, then root directory
			candidates.push(`${parentPath}/${path}`, path)
		} else {
			// With path: use directly
			candidates.push(path)
		}

		// For each candidate path, try original name first, then try .md extension
		for (const candidate of candidates) {
			// Try original path
			let found = app.vault.getAbstractFileByPath(candidate)
			if (found) {
				if (found instanceof TFile) return { file: found }
				if (found instanceof TFolder) return { folder: found }
			}

			// Try adding .md (only when there's no extension)
			if (!candidate.includes('.') || candidate.endsWith('.')) {
				found = app.vault.getAbstractFileByPath(`${candidate}.md`)
				if (found) {
					console.debug(`Auto-resolved ${path} to ${candidate}.md`)
					if (found instanceof TFile) return { file: found }
					if (found instanceof TFolder) return { folder: found }
				}
			}
		}

		return { error: `File or directory not found: ${path}` }
	} catch (error) {
		return { error: `Failed to access path: ${error.message}` }
	}
}

export const viewFunction: ToolFunction = async (
	env: RunEnv,
	parameters: Record<string, unknown>
): Promise<ToolResponse> => {
	const { app } = env
	const { path, view_range } = parameters

	const { file, folder, error } = getFileFromPath(app, path as string)
	const desc =
		`${t('Read')} \`${file?.path || folder?.path}\`` +
		(view_range && Array.isArray(view_range) && view_range.length === 2
			? ` ${t('lines')} ${view_range[0]} ${t('to')} ${view_range[1]}`
			: '')
	if (error) {
		return {
			desc,
			content: [{ type: 'text', text: error }],
			isError: true
		}
	}

	try {
		if (file) {
			const content = await app.vault.cachedRead(file)
			const lines = content.split('\n')

			if (view_range && Array.isArray(view_range) && view_range.length === 2) {
				const [startLine, endLine] = view_range as [number, number]
				const start = Math.max(1, startLine) - 1 // Convert to 0-based index
				const end = endLine === -1 ? lines.length : Math.min(lines.length, endLine)

				const selectedLines = lines.slice(start, end)
				const numberedLines = selectedLines.map((line, index) => `${start + index + 1}: ${line}`)

				return {
					desc,
					content: [
						{
							type: 'text',
							text: `File: ${file.path} (lines ${start + 1}-${end})\n\n${numberedLines.join('\n')}`
						}
					]
				}
			} else {
				// Use default line limit
				const defaultLines = env.options.textEditorDefaultViewLines
				const shouldTruncate = lines.length > defaultLines
				const displayLines = shouldTruncate ? lines.slice(0, defaultLines) : lines

				// Display file with line numbers
				const numberedLines = displayLines.map((line, index) => `${index + 1}: ${line}`)
				const truncateMessage = shouldTruncate
					? `\n\n[... ${lines.length - defaultLines} more lines. Use view_range to see specific sections.]`
					: ''

				return {
					desc,
					content: [
						{
							type: 'text',
							text: `File: ${file.path} (${lines.length} lines total${shouldTruncate ? `, showing first ${defaultLines}` : ''})\n\n${numberedLines.join('\n')}${truncateMessage}`
						}
					]
				}
			}
		} else if (folder) {
			// List directory contents - show paths only
			const items = folder.children.map((child) => child.path)
			console.debug('Directory contents:', items)

			return {
				desc,
				content: [
					{
						type: 'text',
						text: `Directory: ${path}\n\n${items.join('\n')}`
					}
				]
			}
		}

		return {
			desc,
			content: [{ type: 'text', text: `Unknown error viewing: ${path}` }],
			isError: true
		}
	} catch (error) {
		return {
			desc,
			content: [{ type: 'text', text: `Failed to read: ${error.message}` }],
			isError: true
		}
	}
}

const strReplaceFunction: ToolFunction = async (
	env: RunEnv,
	parameters: Record<string, unknown>
): Promise<ToolResponse> => {
	const { app } = env
	const { path, old_str, new_str } = parameters

	const desc = `${t('Edited')} \`${path}\``
	if (typeof old_str !== 'string' || typeof new_str !== 'string') {
		return {
			desc,
			content: [{ type: 'text', text: 'old_str and new_str must be strings' }],
			isError: true
		}
	}

	const { file, error } = getFileFromPath(app, path as string)

	if (error || !file) {
		return {
			desc,
			content: [{ type: 'text', text: error || `File not found: ${path}` }],
			isError: true
		}
	}

	try {
		await app.vault.process(file, (content) => {
			if (!content.includes(old_str)) {
				throw new Error(`String not found in file: ${old_str}`)
			}

			const matches = content.split(old_str).length - 1
			if (matches > 1) {
				throw new Error(
					`Multiple matches found (${matches}). Please provide a more specific string that matches exactly once.`
				)
			}

			return content.replace(old_str, new_str)
		})

		return {
			desc,
			content: [{ type: 'text', text: `Successfully replaced text in ${path}` }]
		}
	} catch (error) {
		const errorMessage = error.message || 'Unknown error occurred'

		if (errorMessage.includes('String not found') || errorMessage.includes('Multiple matches found')) {
			return {
				desc,
				content: [{ type: 'text', text: errorMessage }],
				isError: true
			}
		}

		return {
			desc,
			content: [{ type: 'text', text: `Failed to replace text: ${errorMessage}` }],
			isError: true
		}
	}
}

const createFunction: ToolFunction = async (
	env: RunEnv,
	parameters: Record<string, unknown>
): Promise<ToolResponse> => {
	const { app } = env
	const { path, file_text } = parameters

	const desc = `${t('Created')} \`${path}\``
	if (typeof file_text !== 'string') {
		return {
			desc,
			content: [{ type: 'text', text: 'file_text must be a string' }],
			isError: true
		}
	}

	try {
		const existingFile = app.vault.getAbstractFileByPath(path as string)
		if (existingFile) {
			return {
				desc,
				content: [{ type: 'text', text: `File already exists: ${path}` }],
				isError: true
			}
		}

		await app.vault.create(path as string, file_text)

		return {
			desc,
			content: [{ type: 'text', text: `Successfully created file: ${path}` }]
		}
	} catch (error) {
		return {
			desc,
			content: [{ type: 'text', text: `Failed to create file: ${error.message}` }],
			isError: true
		}
	}
}

const insertFunction: ToolFunction = async (
	env: RunEnv,
	parameters: Record<string, unknown>
): Promise<ToolResponse> => {
	const { app } = env
	const { path, insert_line, insert_text } = parameters

	const desc = `${t('Inserted text at line')} ${insert_line} ${t('in')} \`${path}\``
	if (typeof insert_text !== 'string' || typeof insert_line !== 'number') {
		return {
			desc,
			content: [{ type: 'text', text: 'insert_text must be a string and insert_line must be a number' }],
			isError: true
		}
	}

	const { file, error } = getFileFromPath(app, path as string)

	if (error || !file) {
		return {
			desc,
			content: [{ type: 'text', text: error || `File not found: ${path}` }],
			isError: true
		}
	}

	try {
		await app.vault.process(file, (content) => {
			const lines = content.split('\n')

			if (insert_line < 0 || insert_line > lines.length) {
				throw new Error(`Invalid line number: ${insert_line}. File has ${lines.length} lines.`)
			}

			lines.splice(insert_line, 0, insert_text)
			return lines.join('\n')
		})

		return {
			desc,
			content: [{ type: 'text', text: `Successfully inserted text at line ${insert_line} in ${path}` }]
		}
	} catch (error) {
		const errorMessage = error.message || 'Unknown error occurred'

		if (errorMessage.includes('Invalid line number')) {
			return {
				desc,
				content: [{ type: 'text', text: errorMessage }],
				isError: true
			}
		}

		return {
			desc,
			content: [{ type: 'text', text: `Failed to insert text: ${errorMessage}` }],
			isError: true
		}
	}
}

export const textEditorFunction: ToolFunction = async (
	env: RunEnv,
	parameters: Record<string, unknown>
): Promise<ToolResponse> => {
	const { command } = parameters

	switch (command) {
		case 'view':
			return viewFunction(env, parameters)
		case 'str_replace':
			return strReplaceFunction(env, parameters)
		case 'create':
			return createFunction(env, parameters)
		case 'insert':
			return insertFunction(env, parameters)
		default:
			return {
				desc: `Unknown command: ${command}`,
				content: [{ type: 'text', text: `Unknown command: ${command}` }],
				isError: true
			}
	}
}
