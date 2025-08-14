import { normalizePath, Vault } from 'obsidian'
import { TOOLS_DIRECTORY } from '../settings'

// export interface ToolUseBlock {	// anthropic
// 	id: string
// 	input: unknown
// 	name: string
// 	type: 'tool_use'
// }

export interface ToolUseMsg {
	type: 'tool_use'
	id: string
	name: string
	input: Record<string, unknown> // 工具输入参数（已解析为对象）
	timestamp: string
}

// export interface ToolResultBlockParam {	// anthropic
//   tool_use_id: string;
//   type: 'tool_result';

//   cache_control?: CacheControlEphemeral | null;
//   content?: string | Array<TextBlockParam | ImageBlockParam | SearchResultBlockParam>;
//   is_error?: boolean;
// }

export interface ToolResultMsg {
	type: 'tool_result'
	tool_use_id: string // 关联的工具调用ID

	content: string | Array<{ text: string }>
	is_error?: boolean
	error_message?: string
	timestamp: string
}

export type ToolEventMsg = ToolUseMsg | ToolResultMsg

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

// 保存工具调用记录
export const storeToolEvent = async (vault: Vault, toolEvent: ToolEventMsg): Promise<string> => {
	// 这里的时间格式, 参与逻辑判断. 固定时区 UTC. 即使用户修改电脑时区, 不受影响.
	const today = formatToday()
	const jsonlFile = `${today}.jsonl`
	const jsonlPath = normalizePath(`${TOOLS_DIRECTORY}/${jsonlFile}`)

	// 确保目录存在
	await ensureToolsDirectory(vault)

	const jsonlContent = JSON.stringify(toolEvent) + '\n'
	const tFile = vault.getFileByPath(jsonlPath)
	console.debug(`Tool event JSONL path: ${jsonlPath}`)
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
	return reference
}

// 批量读取工具事件
export const readToolEvents = async (_vault: Vault, _references: string[]): Promise<ToolEventMsg[]> => {
	const events: ToolEventMsg[] = []
	// TODO
	return events
}
