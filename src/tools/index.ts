import { RunEnv } from 'src/environment'
import { textEditorFunction } from './textEditor'

// 工具接口定义
export interface Tool {
	name: string
	description: string
	input_schema: {
		type: 'object'
		properties: Record<string, unknown>
		required?: string[]
	}
}

// 工具执行结果
export interface ToolResponse {
	desc: string
	content: Array<{
		type: 'text'
		text: string
	}>
	isError?: boolean
}

export interface ToolUse {
	type: 'tool_use'
	id: string
	name: string
	input: Record<string, unknown> // 工具输入参数（已解析为对象）
}

// export interface ToolResultBlockParam {	// anthropic
//   tool_use_id: string;
//   type: 'tool_result';

//   cache_control?: CacheControlEphemeral | null;
//   content?: string | Array<TextBlockParam | ImageBlockParam | SearchResultBlockParam>;
//   is_error?: boolean;
// }

export interface ToolResult {
	type: 'tool_result'
	tool_use_id: string // 关联的工具调用ID

	content: unknown
	is_error?: boolean
	desc: string
	// error_message?: string
	// timestamp: string。// 放到额外消息
}

// 工具执行会话块 - 包含完整的工具调用和结果
export interface ToolExecution {
	type: 'tool_execution'
	reference: string
	toolUses: ToolUse[]
	toolResults: ToolResult[]
}

// 工具执行函数类型
export type ToolFunction = (env: RunEnv, parameters: Record<string, unknown>) => Promise<ToolResponse>

// 工具注册表, 内置了 str_replace_based_edit_tool
export class ToolRegistry {
	private tools: Map<string, { tool: Tool; execute: ToolFunction }> = new Map()

	register(tool: Tool, execute: ToolFunction) {
		this.tools.set(tool.name, { tool, execute })
	}

	getTools(): Tool[] {
		return Array.from(this.tools.values()).map(({ tool }) => tool)
	}

	async execute(env: RunEnv, toolUses: ToolUse[]): Promise<ToolResult[]> {
		const results: ToolResult[] = []

		for (const toolUse of toolUses) {
			try {
				let result: ToolResponse | null = null
				if (toolUse.name === 'str_replace_based_edit_tool') {
					result = await textEditorFunction(env, toolUse.input)
				} else {
					const toolInfo = this.tools.get(toolUse.name)
					if (!toolInfo) {
						throw new Error(`Tool not found: ${toolUse.name}`)
					}
					result = await toolInfo.execute(env, toolUse.input)
				}

				if (result.isError) {
					console.error(`Tool ${toolUse.name} execution error:`, result.content)
				}
				results.push({
					type: 'tool_result',
					tool_use_id: toolUse.id,
					content: result.content,
					is_error: result.isError,
					desc: result.desc
				})
			} catch (error) {
				console.error(`Tool ${toolUse.name} execution failed:`, error)
				results.push({
					type: 'tool_result',
					tool_use_id: toolUse.id,
					content: [{ type: 'text', text: `Tool execution failed: ${error.message}` }],
					is_error: true,
					desc: `Tool ${toolUse.name} execution failed: ${error.message}`
				})
			}
		}

		return results
	}

	has(name: string): boolean {
		return this.tools.has(name)
	}
}

export const formatToolExecution = (execution: ToolExecution): string => {
	const { reference, toolResults } = execution
	const descriptions = toolResults.map((result) => ` ${result.desc} `).join('; ')

	const status = toolResults.every((result) => !result.is_error) ? '✔️' : '❌'
	return `${status} ${descriptions}%%${reference}%%`
}

export const parseReferenceFromFormattedExecution = (formattedString: string): string | null => {
	// 格式: "✔️ description1; description2%%reference%%"
	// 使用正则表达式匹配最后一个 %%...%% 部分
	const match = formattedString.match(/%%([^%]+)%%$/)
	return match ? match[1] : null
}
