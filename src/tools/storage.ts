import { normalizePath, Vault } from 'obsidian'
import { RunEnv } from 'src/environment'
import { ToolExecution, ToolResult, ToolUse } from '.'
import { TOOLS_DIRECTORY } from '../settings'

// 计算内容的行数
const getContentLineCount = (content: string): number => {
	if (content.length === 0) {
		return 0
	}

	// 使用正则表达式快速计数换行符
	const matches = content.match(/\n/g)
	const lineCount = matches ? matches.length : 0

	// 如果文件不以换行符结尾，最后一行也要计数
	return content.endsWith('\n') ? lineCount : lineCount + 1
}

export const ensureToolsDirectory = async (vault: Vault): Promise<void> => {
	const tools_directory_path = normalizePath(TOOLS_DIRECTORY)
	if (!vault.getFolderByPath(tools_directory_path)) {
		await vault.createFolder(tools_directory_path)
	}
}

export const formatToday = () => {
	const now = new Date()
	const year = now.getUTCFullYear().toString().slice(-2) // 取年份后两位 "25"
	const month = (now.getUTCMonth() + 1).toString().padStart(2, '0') // "08"
	const day = now.getUTCDate().toString().padStart(2, '0') // "14"
	const today = `${year}${month}${day}` // "250814"
	return today
}

export const storeToolExecution = async (
	env: RunEnv,
	toolUses: ToolUse[],
	toolResults: ToolResult[]
): Promise<ToolExecution> => {
	// 这里的时间格式, 参与逻辑判断. 固定时区 UTC. 即使用户修改电脑时区, 不受影响.
	const today = formatToday()
	const jsonlFile = `${today}.jsonl`
	const jsonlPath = normalizePath(`${TOOLS_DIRECTORY}/${jsonlFile}`)
	const { vault } = env
	// 确保目录存在
	await ensureToolsDirectory(vault)

	const desc = toolResults.map((r) => r.desc).join('; ')
	const data = {
		desc,
		tool_uses: toolUses,
		tool_results: toolResults
	}
	const jsonlContent = JSON.stringify(data) + '\n'
	const tFile = vault.getFileByPath(jsonlPath)
	console.debug(`Tool result JSONL path: ${jsonlPath}`)
	let lineNumber = 1

	if (tFile) {
		await vault.process(tFile, (fileText) => {
			lineNumber = getContentLineCount(fileText) + 1
			console.debug(`Appending to existing file: ${jsonlPath}, line number: ${lineNumber}`)
			return fileText + jsonlContent
		})
	} else {
		console.debug(`Creating new file: ${jsonlPath}`)
		await vault.create(jsonlPath, jsonlContent)
	}

	const reference = today + lineNumber.toString().padStart(3, '0')
	return { type: 'tool_execution', reference, toolUses, toolResults }
}

// 按文件分组的引用信息
interface FileReferences {
	filePath: string
	dateStr: string
	lineNumbers: Array<{ reference: string; lineNumber: number }>
}

// 批量读取工具执行结果
export const readToolExecutions = async (vault: Vault, references: string[]): Promise<Map<string, ToolExecution>> => {
	if (references.length === 0) {
		return new Map()
	}

	// 1. 解析和分组 references
	const fileGroups = new Map<string, FileReferences>()

	for (const reference of references) {
		// 解析 reference: 前6位是日期(YYMMDD)，后3位是行号(001, 002, ...)
		if (reference.length < 9) {
			throw new Error(`Invalid reference format: ${reference}. Expected format: YYMMDDNNN`)
		}

		const dateStr = reference.slice(0, 6) // 前6位：日期
		const lineNumberStr = reference.slice(6) // 行号
		const lineNumber = parseInt(lineNumberStr, 10)

		if (isNaN(lineNumber) || lineNumber < 1) {
			throw new Error(`Invalid line number in reference: ${reference}`)
		}

		const jsonlFile = `${dateStr}.jsonl`
		const filePath = normalizePath(`${TOOLS_DIRECTORY}/${jsonlFile}`)

		if (!fileGroups.has(filePath)) {
			fileGroups.set(filePath, {
				filePath,
				dateStr,
				lineNumbers: []
			})
		}

		fileGroups.get(filePath)!.lineNumbers.push({ reference, lineNumber })
	}

	const fileContents = new Map<string, string[]>()
	const fileReads = Array.from(fileGroups.keys()).map(async (filePath) => {
		// const content = await vault.adapter.read(filePath)
		const file = vault.getFileByPath(filePath)
		if (!file) {
			throw new Error(`Tool execution file not found: ${filePath}`)
		}
		const content = await vault.cachedRead(file)
		const lines = content.split('\n').filter((line) => line.trim().length > 0)
		return { filePath, lines }
	})
	const fileResults = await Promise.all(fileReads)

	for (const { filePath, lines } of fileResults) {
		fileContents.set(filePath, lines)
	}

	// 批量解析数据
	const results = new Map<string, ToolExecution>()

	for (const { filePath, lineNumbers } of fileGroups.values()) {
		const lines = fileContents.get(filePath)!

		for (const { reference, lineNumber } of lineNumbers) {
			// 检查行号是否有效
			if (lineNumber > lines.length) {
				throw new Error(`Line number ${lineNumber} exceeds file length ${lines.length} in ${filePath}`)
			}

			// 获取指定行的内容（行号从1开始，数组索引从0开始）
			const targetLine = lines[lineNumber - 1]

			try {
				const data = JSON.parse(targetLine)

				// 验证数据格式
				if (!data.tool_uses || !data.tool_results) {
					throw new Error(`Invalid data format in ${filePath} at line ${lineNumber}`)
				}

				results.set(reference, {
					type: 'tool_execution',
					reference,
					toolUses: data.tool_uses,
					toolResults: data.tool_results
				})
			} catch (parseError) {
				throw new Error(`Failed to parse JSON in ${filePath} at line ${lineNumber}: ${parseError.message}`)
			}
		}
	}

	return results
}
