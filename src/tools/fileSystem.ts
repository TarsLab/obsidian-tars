import { TFolder } from 'obsidian'
import { RunEnv } from 'src/environment'
import { Tool, ToolFunction, ToolRegistry, ToolResponse } from './index'
import { findFileOrFolder, resolveAbstractPath, resolveFilePath } from './utils'

// 文件系统相关工具

// 读取文件工具
const readFileTool: Tool = {
	name: 'read_file',
	description: 'Read the contents of a file in the vault with smart path resolution and optional line range',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'The path to the file to read.'
			},
			view_range: {
				type: 'array',
				items: { type: 'number' },
				minItems: 2,
				maxItems: 2,
				description: 'Optional line range to read [startLine, endLine]. Use -1 for endLine to read to end of file.'
			}
		},
		required: ['path']
	}
}

const readFileFunction: ToolFunction = async (
	env: RunEnv,
	parameters: Record<string, unknown>
): Promise<ToolResponse> => {
	const { app } = env
	const { path, view_range } = parameters

	const desc =
		`Reading file: ${path}` +
		(view_range && Array.isArray(view_range) && view_range.length === 2
			? ` (lines ${view_range[0]} to ${view_range[1]})`
			: '')

	if (typeof path !== 'string') {
		return {
			desc,
			content: [{ type: 'text', text: 'Invalid path parameter' }],
			isError: true
		}
	}

	// 使用智能路径解析
	const { file, folder, error } = findFileOrFolder(app, path as string)

	if (error) {
		return {
			desc,
			content: [{ type: 'text', text: error }],
			isError: true
		}
	}

	// 如果是文件夹，报错
	if (folder) {
		return {
			desc,
			content: [{ type: 'text', text: `Error: ${path} is a directory, not a file` }],
			isError: true
		}
	}

	// 如果没有找到文件
	if (!file) {
		return {
			desc,
			content: [{ type: 'text', text: `File not found: ${path}` }],
			isError: true
		}
	}

	try {
		const content = await app.vault.cachedRead(file)
		const lines = content.split('\n')

		if (view_range && Array.isArray(view_range) && view_range.length === 2) {
			// 范围读取
			const [startLine, endLine] = view_range as [number, number]
			const start = Math.max(1, startLine) - 1 // Convert to 0-based index
			const end = endLine === -1 ? lines.length : Math.min(lines.length, endLine)

			if (start >= lines.length) {
				return {
					desc,
					content: [{ type: 'text', text: `Start line ${startLine} exceeds file length (${lines.length} lines)` }],
					isError: true
				}
			}

			const selectedLines = lines.slice(start, end)
			const numberedLines = selectedLines.map((line, index) => `${start + index + 1}: ${line}`)

			return {
				desc,
				content: [
					{
						type: 'text',
						text: `File: ${file.path} (lines ${start + 1}-${end} of ${lines.length} total)\n\n${numberedLines.join('\n')}`
					}
				]
			}
		} else {
			// 默认行数限制
			const defaultLines = env.options.textEditorDefaultViewLines
			const shouldTruncate = lines.length > defaultLines
			const displayLines = shouldTruncate ? lines.slice(0, defaultLines) : lines

			// 显示带行号的文件内容
			const numberedLines = displayLines.map((line, index) => `${index + 1}: ${line}`)
			const truncateMessage = shouldTruncate
				? `\n\n[... ${lines.length - defaultLines} more lines. Use view_range parameter to see specific sections.]`
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
	} catch (error) {
		return {
			desc,
			content: [{ type: 'text', text: `Failed to read file: ${error.message}` }],
			isError: true
		}
	}
}

// 创建文件工具
const createFileTool: Tool = {
	name: 'create_file',
	description: 'Create a new file in the vault',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'The path to the file to create'
			},
			content: {
				type: 'string',
				description: 'The content to write to the new file'
			}
		},
		required: ['path', 'content']
	}
}

const createFileFunction: ToolFunction = async (
	env: RunEnv,
	parameters: Record<string, unknown>
): Promise<ToolResponse> => {
	const { app } = env
	const { path, content } = parameters

	// 使用智能路径解析
	const basePath = resolveAbstractPath(app, path as string)
	const finalPath = resolveFilePath(basePath)

	// 检查文件扩展名
	const lastSlashIndex = finalPath.lastIndexOf('/')
	const filename = lastSlashIndex === -1 ? finalPath : finalPath.substring(lastSlashIndex + 1)

	const desc = `Creating file: ${finalPath}`

	if (!filename.includes('.')) {
		return {
			desc,
			content: [{ type: 'text', text: `Invalid file path: ${finalPath} has no file extension` }],
			isError: true
		}
	}

	if (typeof content !== 'string') {
		return {
			desc,
			content: [{ type: 'text', text: 'content must be a string' }],
			isError: true
		}
	}

	try {
		// 检查文件是否已存在
		const existingFile = app.vault.getAbstractFileByPath(finalPath)
		if (existingFile) {
			return {
				desc,
				content: [{ type: 'text', text: `File already exists: ${finalPath}` }],
				isError: true
			}
		}

		// 创建新文件
		await app.vault.create(finalPath, content)

		return {
			desc,
			content: [{ type: 'text', text: `Successfully created file: ${finalPath}` }]
		}
	} catch (error) {
		return {
			desc,
			content: [{ type: 'text', text: `Failed to create file: ${error.message}` }],
			isError: true
		}
	}
}

const listDirectoryTool: Tool = {
	name: 'list_directory',
	description: 'List the contents of a directory in the vault',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description:
					'The path to the directory to list (supports relative paths, use "." for current directory based on active file)',
				default: '.'
			}
		}
	}
}

const listDirectoryFunction: ToolFunction = async (
	env: RunEnv,
	parameters: Record<string, unknown>
): Promise<ToolResponse> => {
	const { app } = env
	const { path = '.' } = parameters // 默认使用当前目录

	const desc = `Listing directory: ${path}`

	if (typeof path !== 'string') {
		return {
			desc,
			content: [{ type: 'text', text: 'Invalid path parameter' }],
			isError: true
		}
	}

	// 使用智能路径解析
	const { file, folder, error } = findFileOrFolder(app, path)

	if (error) {
		return {
			desc,
			content: [{ type: 'text', text: error }],
			isError: true
		}
	}

	// 如果是文件，报错
	if (file) {
		return {
			desc,
			content: [{ type: 'text', text: `Error: ${path} is a file, not a directory` }],
			isError: true
		}
	}

	// 如果没有找到文件夹
	if (!folder) {
		return {
			desc,
			content: [{ type: 'text', text: `Directory not found: ${path}` }],
			isError: true
		}
	}

	try {
		const items = folder.children.map((child) => (child instanceof TFolder ? `${child.path}/` : child.path))

		return {
			desc,
			content: [
				{
					type: 'text',
					text: `Directory: ${folder.path}\n\n${items.join('\n')}`
				}
			]
		}
	} catch (error) {
		return {
			desc,
			content: [{ type: 'text', text: `Failed to list directory: ${error.message}` }],
			isError: true
		}
	}
}

// 删除文件工具
const deleteFileTool: Tool = {
	name: 'delete_file',
	description: 'Delete a file from the vault',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'The path to the file to delete'
			}
		},
		required: ['path']
	}
}

const deleteFileFunction: ToolFunction = async (
	env: RunEnv,
	parameters: Record<string, unknown>
): Promise<ToolResponse> => {
	const { app } = env
	const { path } = parameters
	const desc = `Deleting file: ${path}`

	if (typeof path !== 'string') {
		return {
			desc,
			content: [{ type: 'text', text: 'Invalid path parameter' }],
			isError: true
		}
	}

	try {
		const file = app.vault.getAbstractFileByPath(path)
		if (!file) {
			return {
				desc,
				content: [{ type: 'text', text: `File not found: ${path}` }],
				isError: true
			}
		}

		await app.vault.trash(file, false)
		return {
			desc,
			content: [{ type: 'text', text: `File deleted successfully: ${path}` }]
		}
	} catch (error) {
		return {
			desc,
			content: [{ type: 'text', text: `Failed to delete file: ${error.message}` }],
			isError: true
		}
	}
}

// 注册文件系统工具
export function registerFileSystemTools(toolRegistry: ToolRegistry) {
	toolRegistry.register(readFileTool, readFileFunction)
	toolRegistry.register(createFileTool, createFileFunction)
	toolRegistry.register(listDirectoryTool, listDirectoryFunction)
	toolRegistry.register(deleteFileTool, deleteFileFunction)
}
