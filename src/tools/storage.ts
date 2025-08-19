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

// 批量读取工具事件
// export const readToolEvents = async (_vault: Vault, _references: string[]): Promise<ToolBlock[]> => {
// 	const events: ToolBlock[] = []
// 	// TODO
// 	return events
// }

// export const extractToolBlock = (line: string): ToolBlock | null => {
// 	const parsed = JSON.parse(line) as ToolBlock
// 	return parsed.type === 'tool_use' || parsed.type === 'tool_result' ? parsed : null
// }
