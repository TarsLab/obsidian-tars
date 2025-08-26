import { App, TFile, TFolder } from 'obsidian'
import { RunEnv } from 'src/environment'
import { Tool, ToolFunction, ToolRegistry, ToolResponse } from './index'

// Text Editor Tool - 符合 Anthropic text_editor_20250728 规范
// 支持 view, str_replace, create, insert 命令

// 获取文件对象的辅助函数
const getFileFromPath = (app: App, path: string): { file?: TFile; folder?: TFolder; error?: string } => {
	try {
		const activeFile = app.workspace.getActiveFile()
		if (!activeFile) return { error: 'No active file' }

		const isRoot = activeFile.parent?.isRoot()
		const parentPath = activeFile.parent?.path || app.vault.getRoot().path

		// 处理特殊路径
		if (path === '.') {
			const folder = app.vault.getAbstractFileByPath(parentPath)
			return folder instanceof TFolder ? { folder } : { error: 'Parent is not a folder' }
		}

		// 处理相对路径, obsidian vault 不支持相对格式
		if (path.startsWith('./')) {
			path = `${path.slice(2)}`
		}

		// 构建候选路径（按优先级排序）
		const candidates = []
		if (!path.includes('/') && !isRoot) {
			// 纯文件名：优先父目录，后根目录
			candidates.push(`${parentPath}/${path}`, path)
		} else {
			// 带路径：直接使用
			candidates.push(path)
		}

		// 对每个候选路径，先尝试原始名称，再尝试.md扩展名
		for (const candidate of candidates) {
			// 尝试原始路径
			let found = app.vault.getAbstractFileByPath(candidate)
			if (found) {
				if (found instanceof TFile) return { file: found }
				if (found instanceof TFolder) return { folder: found }
			}

			// 尝试添加.md（仅当没有扩展名时）
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

// view 命令功能实现
const viewFunction: ToolFunction = async (env: RunEnv, parameters: Record<string, unknown>): Promise<ToolResponse> => {
	const { app } = env
	const { path, view_range } = parameters

	const { file, folder, error } = getFileFromPath(app, path as string)

	if (error) {
		return {
			content: [{ type: 'text', text: error }],
			isError: true
		}
	}

	try {
		if (file) {
			// 查看文件内容
			const content = await app.vault.cachedRead(file)
			const lines = content.split('\n')

			if (view_range && Array.isArray(view_range) && view_range.length === 2) {
				const [startLine, endLine] = view_range as [number, number]
				const start = Math.max(1, startLine) - 1 // 转换为0索引
				const end = endLine === -1 ? lines.length : Math.min(lines.length, endLine)

				const selectedLines = lines.slice(start, end)
				const numberedLines = selectedLines.map((line, index) => `${start + index + 1}: ${line}`)

				return {
					content: [
						{
							type: 'text',
							text: `File: ${file.path} (lines ${start + 1}-${end})\n\n${numberedLines.join('\n')}`
						}
					]
				}
			} else {
				// 使用默认行数限制
				const defaultLines = env.options.textEditorDefaultViewLines
				const shouldTruncate = lines.length > defaultLines
				const displayLines = shouldTruncate ? lines.slice(0, defaultLines) : lines

				// 显示文件，添加行号
				const numberedLines = displayLines.map((line, index) => `${index + 1}: ${line}`)
				const truncateMessage = shouldTruncate
					? `\n\n[... ${lines.length - defaultLines} more lines. Use view_range to see specific sections.]`
					: ''

				return {
					content: [
						{
							type: 'text',
							text: `File: ${file.path} (${lines.length} lines total${shouldTruncate ? `, showing first ${defaultLines}` : ''})\n\n${numberedLines.join('\n')}${truncateMessage}`
						}
					]
				}
			}
		} else if (folder) {
			// 列出目录内容 - 只显示路径
			const items = folder.children.map((child) => child.path)
			console.debug('Directory contents:', items)

			return {
				content: [
					{
						type: 'text',
						text: `Directory: ${path}\n\n${items.join('\n')}`
					}
				]
			}
		}

		return {
			content: [{ type: 'text', text: `Unknown error viewing: ${path}` }],
			isError: true
		}
	} catch (error) {
		return {
			content: [{ type: 'text', text: `Failed to read: ${error.message}` }],
			isError: true
		}
	}
}

// str_replace 命令功能实现
const strReplaceFunction: ToolFunction = async (
	env: RunEnv,
	parameters: Record<string, unknown>
): Promise<ToolResponse> => {
	const { app } = env
	const { path, old_str, new_str } = parameters

	if (typeof old_str !== 'string' || typeof new_str !== 'string') {
		return {
			content: [{ type: 'text', text: 'old_str and new_str must be strings' }],
			isError: true
		}
	}

	const { file, error } = getFileFromPath(app, path as string)

	if (error || !file) {
		return {
			content: [{ type: 'text', text: error || `File not found: ${path}` }],
			isError: true
		}
	}

	try {
		const content = await app.vault.read(file)

		// 检查 old_str 是否存在
		if (!content.includes(old_str)) {
			return {
				content: [{ type: 'text', text: `String not found in file: ${old_str}` }],
				isError: true
			}
		}

		// 检查是否有多个匹配
		const matches = content.split(old_str).length - 1
		if (matches > 1) {
			return {
				content: [
					{
						type: 'text',
						text: `Multiple matches found (${matches}). Please provide a more specific string that matches exactly once.`
					}
				],
				isError: true
			}
		}

		// 执行替换
		const newContent = content.replace(old_str, new_str)
		await app.vault.modify(file, newContent)

		return {
			content: [{ type: 'text', text: `Successfully replaced text in ${path}` }]
		}
	} catch (error) {
		return {
			content: [{ type: 'text', text: `Failed to replace text: ${error.message}` }],
			isError: true
		}
	}
}

// create 命令功能实现
const createFunction: ToolFunction = async (
	env: RunEnv,
	parameters: Record<string, unknown>
): Promise<ToolResponse> => {
	const { app } = env
	const { path, file_text } = parameters

	if (typeof file_text !== 'string') {
		return {
			content: [{ type: 'text', text: 'file_text must be a string' }],
			isError: true
		}
	}

	try {
		// 检查文件是否已存在
		const existingFile = app.vault.getAbstractFileByPath(path as string)
		if (existingFile) {
			return {
				content: [{ type: 'text', text: `File already exists: ${path}` }],
				isError: true
			}
		}

		// 创建新文件
		await app.vault.create(path as string, file_text)

		return {
			content: [{ type: 'text', text: `Successfully created file: ${path}` }]
		}
	} catch (error) {
		return {
			content: [{ type: 'text', text: `Failed to create file: ${error.message}` }],
			isError: true
		}
	}
}

// insert 命令功能实现
const insertFunction: ToolFunction = async (
	env: RunEnv,
	parameters: Record<string, unknown>
): Promise<ToolResponse> => {
	const { app } = env
	const { path, insert_line, new_str } = parameters

	if (typeof new_str !== 'string' || typeof insert_line !== 'number') {
		return {
			content: [{ type: 'text', text: 'new_str must be a string and insert_line must be a number' }],
			isError: true
		}
	}

	const { file, error } = getFileFromPath(app, path as string)

	if (error || !file) {
		return {
			content: [{ type: 'text', text: error || `File not found: ${path}` }],
			isError: true
		}
	}

	try {
		const content = await app.vault.read(file)
		const lines = content.split('\n')

		// 验证行号
		if (insert_line < 0 || insert_line > lines.length) {
			return {
				content: [{ type: 'text', text: `Invalid line number: ${insert_line}. File has ${lines.length} lines.` }],
				isError: true
			}
		}

		// 插入文本
		lines.splice(insert_line, 0, new_str)
		const newContent = lines.join('\n')

		await app.vault.modify(file, newContent)

		return {
			content: [{ type: 'text', text: `Successfully inserted text at line ${insert_line} in ${path}` }]
		}
	} catch (error) {
		return {
			content: [{ type: 'text', text: `Failed to insert text: ${error.message}` }],
			isError: true
		}
	}
}

// 统一的文本编辑器工具
const textEditorTool: Tool = {
	name: 'str_replace_based_edit_tool',
	description:
		'A comprehensive text editor tool supporting view, str_replace, create, and insert commands for file manipulation. Automatically resolves .md files when extension is omitted.',
	input_schema: {
		type: 'object',
		properties: {
			command: {
				type: 'string',
				enum: ['view', 'str_replace', 'create', 'insert'],
				description:
					'The command to execute: view (read file/directory), str_replace (replace text), create (new file), insert (insert at line)'
			},
			path: {
				type: 'string',
				description: 'The path to the file or directory. For markdown files, .md extension can be omitted.'
			},
			view_range: {
				type: 'array',
				items: { type: 'integer' },
				minItems: 2,
				maxItems: 2,
				description: 'For view command: [start_line, end_line] range. Use -1 for end_line to read to end.'
			},
			old_str: {
				type: 'string',
				description: 'For str_replace command: the exact string to replace'
			},
			new_str: {
				type: 'string',
				description: 'For str_replace/insert command: the new text content'
			},
			file_text: {
				type: 'string',
				description: 'For create command: the initial file content'
			},
			insert_line: {
				type: 'integer',
				description: 'For insert command: line number to insert after (0 for beginning)'
			}
		},
		required: ['command', 'path']
	}
}

const textEditorFunction: ToolFunction = async (
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
				content: [{ type: 'text', text: `Unknown command: ${command}` }],
				isError: true
			}
	}
}

// 注册文本编辑器工具
export function registerTextEditorTool(toolRegistry: ToolRegistry) {
	toolRegistry.register(textEditorTool, textEditorFunction)
}
