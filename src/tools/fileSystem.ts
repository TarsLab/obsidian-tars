import { TFile, TFolder } from 'obsidian'
import { RunEnv } from 'src/environment'
import { Tool, ToolFunction, ToolRegistry, ToolResponse } from './index'

// 文件系统相关工具

// 读取文件工具
const readFileTool: Tool = {
	name: 'read_file',
	description: 'Read the contents of a file in the vault',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'The path to the file to read'
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
	const { path } = parameters
	const desc = `Reading file: ${path}`
	if (typeof path !== 'string') {
		return {
			desc,
			content: [{ type: 'text', text: 'Invalid path parameter' }],
			isError: true
		}
	}

	try {
		const file = app.vault.getAbstractFileByPath(path)
		if (!file || !(file instanceof TFile)) {
			return {
				desc,
				content: [{ type: 'text', text: `File not found: ${path}` }],
				isError: true
			}
		}

		const content = await app.vault.read(file)
		return {
			desc,
			content: [{ type: 'text', text: `File contents of ${path}:\n\n${content}` }]
		}
	} catch (error) {
		return {
			desc,
			content: [{ type: 'text', text: `Failed to read file: ${error.message}` }],
			isError: true
		}
	}
}

// 写入文件工具
const writeFileTool: Tool = {
	name: 'write_file',
	description: 'Write content to a file in the vault',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'The path to the file to write'
			},
			content: {
				type: 'string',
				description: 'The content to write to the file'
			},
			createIfNotExists: {
				type: 'boolean',
				description: 'Whether to create the file if it does not exist',
				default: true
			}
		},
		required: ['path', 'content']
	}
}

const writeFileFunction: ToolFunction = async (
	env: RunEnv,
	parameters: Record<string, unknown>
): Promise<ToolResponse> => {
	const { app } = env
	const { path, content, createIfNotExists = true } = parameters
	const desc = `Writing to file: ${path}`

	if (typeof path !== 'string' || typeof content !== 'string') {
		return {
			desc,
			content: [{ type: 'text', text: 'Invalid path or content parameter' }],
			isError: true
		}
	}

	try {
		const file = app.vault.getAbstractFileByPath(path)

		if (!file && createIfNotExists) {
			// Create new file
			await app.vault.create(path, content)
			return {
				desc,
				content: [{ type: 'text', text: `File created successfully: ${path}` }]
			}
		} else if (file instanceof TFile) {
			// Update existing file
			await app.vault.modify(file, content)
			return {
				desc,
				content: [{ type: 'text', text: `File updated successfully: ${path}` }]
			}
		} else {
			return {
				desc,
				content: [{ type: 'text', text: `File not found and createIfNotExists is false: ${path}` }],
				isError: true
			}
		}
	} catch (error) {
		return {
			desc,
			content: [{ type: 'text', text: `Failed to write file: ${error.message}` }],
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
				description: 'The path to the directory to list (empty string for root)',
				default: ''
			}
		}
	}
}

const listDirectoryFunction: ToolFunction = async (
	env: RunEnv,
	parameters: Record<string, unknown>
): Promise<ToolResponse> => {
	const { app } = env
	const { path = '' } = parameters
	const desc = `Listing directory: ${path || 'root'}`

	if (typeof path !== 'string') {
		return {
			desc,
			content: [{ type: 'text', text: 'Invalid path parameter' }],
			isError: true
		}
	}

	try {
		const activeFile = app.workspace.getActiveFile()
		if (!activeFile)
			return {
				desc,
				content: [{ type: 'text', text: 'No active file' }],
				isError: true
			}

		const rootPath = app.vault.getRoot().path
		const parentPath = activeFile.parent?.path || rootPath

		let folderPath = null
		if (path === '') {
			folderPath = rootPath
		} else if (path === '.') {
			folderPath = parentPath
		} else {
			folderPath = path
		}

		const folder = app.vault.getFolderByPath(folderPath)
		if (!folder || !(folder instanceof TFolder)) {
			console.error(`Directory not found: ${path || 'root'}`)
			return {
				desc,
				content: [{ type: 'text', text: `Directory not found: ${path || 'root'}` }],
				isError: true
			}
		}

		const items = folder.children.map((child) => child.path)

		return {
			desc,
			content: [
				{
					type: 'text',
					text: `Directory: ${folderPath}\n\n${items.join('\n')}`
				}
			]
		}
	} catch (error) {
		console.error(error)
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

		await app.vault.delete(file)
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
	toolRegistry.register(writeFileTool, writeFileFunction)
	toolRegistry.register(listDirectoryTool, listDirectoryFunction)
	toolRegistry.register(deleteFileTool, deleteFileFunction)
}
