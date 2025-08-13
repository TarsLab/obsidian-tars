import { Vault } from 'obsidian'

// 完整的工具交互记录 - 体现Anthropic的消息结构特点
export interface ToolInteraction {
	timestamp: string
	conversation_id?: string // 可选：关联到具体对话

	// tool_use 部分（来自 assistant 消息）
	tool_use: {
		id: string // 唯一标识符，用于关联 tool_result
		name: string // 工具名称
		input: Record<string, unknown> // 工具输入参数
	}

	// tool_result 部分（来自 user 消息）
	tool_result: {
		type: 'tool_result'
		tool_use_id: string // 必须匹配 tool_use.id
		content: string | Array<{ text: string }> // 工具执行结果
		is_error: boolean // 是否执行出错
	}

	// 额外元数据
	execution_time_ms?: number // 工具执行耗时
	model?: string // 使用的模型
}

// 向后兼容的简化接口
export interface ToolResult {
	timestamp: string
	tool_use_id: string
	tool_name: string
	input: Record<string, unknown>
	result: {
		type: 'tool_result'
		tool_use_id: string
		content: string | Array<{ text: string }>
		is_error?: boolean
	}
}

export interface ToolStorageConfig {
	retentionDays: number // 文件保留天数（默认 30）
	toolsDirectory: string // 存储目录名（默认 '.tars-tools'）
}

// 确保工具目录存在
export const ensureToolsDirectory = async (vault: Vault, toolsDir: string): Promise<void> => {
	if (!(await vault.adapter.exists(toolsDir))) {
		await vault.adapter.mkdir(toolsDir)
	}
}

// 追加到 JSONL 文件 - 支持两种数据类型
export const appendToJsonl = async (
	vault: Vault,
	filePath: string,
	data: ToolResult | ToolInteraction
): Promise<number> => {
	const line = JSON.stringify(data)
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

// 保存完整的工具交互记录
export const saveToolInteraction = async (
	vault: Vault,
	interaction: ToolInteraction,
	toolsDir: string = '.tars-tools'
): Promise<string> => {
	const today = new Date().toISOString().split('T')[0] // 2025-08-13
	const jsonlFile = `${today}.jsonl`
	const jsonlPath = `${toolsDir}/${jsonlFile}`

	// 确保目录存在
	await ensureToolsDirectory(vault, toolsDir)

	// 追加到 JSONL 文件并获取行号
	const lineNumber = await appendToJsonl(vault, jsonlPath, interaction)

	// 生成引用标记，使用工具名称使引用更具可读性
	return `tool://${jsonlFile}:${lineNumber}#${interaction.tool_use.name}`
}

// 保存工具结果并返回引用（向后兼容）
export const saveToolResult = async (
	vault: Vault,
	toolResult: ToolResult,
	toolsDir: string = '.tars-tools'
): Promise<string> => {
	// 转换为新格式
	const interaction: ToolInteraction = {
		timestamp: toolResult.timestamp,
		tool_use: {
			id: toolResult.tool_use_id,
			name: toolResult.tool_name,
			input: toolResult.input
		},
		tool_result: {
			type: toolResult.result.type,
			tool_use_id: toolResult.result.tool_use_id,
			content: toolResult.result.content,
			is_error: toolResult.result.is_error ?? false
		}
	}

	return saveToolInteraction(vault, interaction, toolsDir)
}

// 读取完整的工具交互记录
export const readToolInteraction = async (
	vault: Vault,
	reference: string,
	toolsDir: string = '.tars-tools'
): Promise<ToolInteraction | null> => {
	try {
		// 解析引用格式：tool://2025-08-13.jsonl:1#get_weather
		const [baseRef] = reference.split('#')
		const [fileName, lineNumStr] = baseRef.replace('tool://', '').split(':')
		const lineNumber = parseInt(lineNumStr)

		const filePath = `${toolsDir}/${fileName}`

		if (!(await vault.adapter.exists(filePath))) {
			return null
		}

		const content = await vault.adapter.read(filePath)
		const lines = content.split('\n').filter((l) => l.trim())

		if (lineNumber > lines.length) {
			return null
		}

		const data = JSON.parse(lines[lineNumber - 1])

		// 检查是否是新格式的ToolInteraction
		if (data.tool_use && data.tool_result) {
			return data as ToolInteraction
		}

		// 兼容旧格式ToolResult，转换为ToolInteraction
		const oldData = data as ToolResult
		return {
			timestamp: oldData.timestamp,
			tool_use: {
				id: oldData.tool_use_id,
				name: oldData.tool_name,
				input: oldData.input
			},
			tool_result: oldData.result
		} as ToolInteraction
	} catch (error) {
		console.error('Failed to read tool interaction:', error)
		return null
	}
}

// 读取单个工具结果（向后兼容）
export const readToolResult = async (
	vault: Vault,
	reference: string,
	toolsDir: string = '.tars-tools'
): Promise<ToolResult | null> => {
	const interaction = await readToolInteraction(vault, reference, toolsDir)
	if (!interaction) return null

	// 转换回旧格式
	return {
		timestamp: interaction.timestamp,
		tool_use_id: interaction.tool_use.id,
		tool_name: interaction.tool_use.name,
		input: interaction.tool_use.input,
		result: interaction.tool_result
	}
}

// 读取指定文件的指定行
export const readJsonlLines = async (
	vault: Vault,
	fileName: string,
	lineNumbers: number[],
	toolsDir: string = '.tars-tools'
): Promise<ToolResult[]> => {
	const filePath = `${toolsDir}/${fileName}`

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
export const readToolResults = async (
	vault: Vault,
	references: string[],
	toolsDir: string = '.tars-tools'
): Promise<ToolResult[]> => {
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
		const fileResults = await readJsonlLines(vault, fileName, lineNumbers, toolsDir)
		results.push(...fileResults)
	}

	return results
}
