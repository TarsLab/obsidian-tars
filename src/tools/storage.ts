import { normalizePath, Vault } from 'obsidian'
import { RunEnv } from 'src/environment'
import { ToolExecution, ToolResult, ToolUse } from '.'
import { TOOLS_DIRECTORY } from '../settings'

// 快速获取 JSONL 文件行数（内存友好）
export const getJsonlLineCount = async (vault: Vault, filePath: string): Promise<number> => {
	if (!(await vault.adapter.exists(filePath))) {
		return 0
	}

	const content = await vault.adapter.read(filePath)
	return getContentLineCount(content)
}

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
	if (!(await vault.adapter.exists(tools_directory_path))) {
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

	const data = {
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

export const readToolExecution = async (vault: Vault, reference: string): Promise<ToolExecution> => {
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
	const jsonlPath = normalizePath(`${TOOLS_DIRECTORY}/${jsonlFile}`)

	// 检查文件是否存在
	if (!(await vault.adapter.exists(jsonlPath))) {
		throw new Error(`Tool execution file not found: ${jsonlPath}`)
	}

	// 读取文件内容
	const content = await vault.adapter.read(jsonlPath)
	const lines = content.split('\n').filter((line) => line.trim().length > 0)

	// 检查行号是否有效
	if (lineNumber > lines.length) {
		throw new Error(`Line number ${lineNumber} exceeds file length ${lines.length} in ${jsonlPath}`)
	}

	// 获取指定行的内容（行号从1开始，数组索引从0开始）
	const targetLine = lines[lineNumber - 1]
	const data = JSON.parse(targetLine)

	// 验证数据格式
	if (!data.tool_uses || !data.tool_results) {
		throw new Error(`Invalid data format in ${jsonlPath} at line ${lineNumber}`)
	}

	return {
		type: 'tool_execution',
		reference,
		toolUses: data.tool_uses,
		toolResults: data.tool_results
	}
}
