import { Vault } from 'obsidian'
import { TOOLS_DIRECTORY } from '../settings'

export interface ToolResult {
	timestamp: string
	tool_use_id: string
	tool_name: string
	input: Record<string, unknown>
	result: {
		type: 'tool_result'
		tool_use_id: string
		content: string | Array<{ text: string }>
		is_error: boolean
	}
}

// 确保工具目录存在
export const ensureToolsDirectory = async (vault: Vault): Promise<void> => {
	if (!(await vault.adapter.exists(TOOLS_DIRECTORY))) {
		await vault.adapter.mkdir(TOOLS_DIRECTORY)
	}
}

// 追加到 JSONL 文件
export const appendToJsonl = async (vault: Vault, filePath: string, toolResult: ToolResult): Promise<number> => {
	const line = JSON.stringify(toolResult)
	const exists = await vault.adapter.exists(filePath)

	if (!exists) {
		await vault.adapter.write(filePath, line)
		return 1
	} else {
		const content = await vault.adapter.read(filePath)
		const lines = content.split('\n').filter((l) => l.trim())
		const newContent = content + '\n' + line
		await vault.adapter.write(filePath, newContent)
		return lines.length + 1
	}
}

// 保存工具结果并返回引用
export const saveToolResult = async (vault: Vault, toolResult: ToolResult): Promise<string> => {
	const today = new Date().toISOString().split('T')[0] // 2025-08-13
	const jsonlFile = `${today}.jsonl`
	const jsonlPath = `${TOOLS_DIRECTORY}/${jsonlFile}`

	// 确保目录存在
	await ensureToolsDirectory(vault)

	// 追加到 JSONL 文件并获取行号
	const lineNumber = await appendToJsonl(vault, jsonlPath, toolResult)

	// 生成引用标记
	return `tool://${jsonlFile}:${lineNumber}`
}

// 读取单个工具结果
export const readToolResult = async (vault: Vault, reference: string): Promise<ToolResult | null> => {
	try {
		const [fileName, lineNumStr] = reference.replace('tool://', '').split(':')
		const lineNumber = parseInt(lineNumStr)

		const filePath = `${TOOLS_DIRECTORY}/${fileName}`

		if (!(await vault.adapter.exists(filePath))) {
			return null
		}

		const content = await vault.adapter.read(filePath)
		const lines = content.split('\n').filter((l) => l.trim())

		if (lineNumber > lines.length) {
			return null
		}

		return JSON.parse(lines[lineNumber - 1])
	} catch (error) {
		console.error('Failed to read tool result:', error)
		return null
	}
}

// 读取指定文件的指定行
export const readJsonlLines = async (vault: Vault, fileName: string, lineNumbers: number[]): Promise<ToolResult[]> => {
	const filePath = `${TOOLS_DIRECTORY}/${fileName}`

	if (!(await vault.adapter.exists(filePath))) {
		return []
	}

	const content = await vault.adapter.read(filePath)
	const lines = content.split('\n').filter((l) => l.trim())

	return lineNumbers
		.filter((num) => num > 0 && num <= lines.length)
		.map((num) => {
			try {
				return JSON.parse(lines[num - 1])
			} catch (error) {
				console.error(`Failed to parse line ${num} in ${fileName}:`, error)
				return null
			}
		})
		.filter(Boolean) as ToolResult[]
}

// 批量读取工具结果
export const readToolResults = async (vault: Vault, references: string[]): Promise<ToolResult[]> => {
	const fileGroups = new Map<string, number[]>()

	// 按文件分组
	references.forEach((ref) => {
		const [fileName, lineNumStr] = ref.replace('tool://', '').split(':')
		const lineNumber = parseInt(lineNumStr)

		if (!fileGroups.has(fileName)) {
			fileGroups.set(fileName, [])
		}
		fileGroups.get(fileName)!.push(lineNumber)
	})

	const results: ToolResult[] = []

	// 批量读取每个文件
	for (const [fileName, lineNumbers] of fileGroups) {
		const fileResults = await readJsonlLines(vault, fileName, lineNumbers)
		results.push(...fileResults)
	}

	return results
}
