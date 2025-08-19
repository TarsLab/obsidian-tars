import { RunEnv } from 'src/environment'

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

// 工具注册表
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
				const toolInfo = this.tools.get(toolUse.name)
				if (!toolInfo) {
					throw new Error(`Tool not found: ${toolUse.name}`)
				}
				const result = await toolInfo.execute(env, toolUse.input)

				results.push({
					type: 'tool_result',
					tool_use_id: toolUse.id,
					content: result.content,
					is_error: result.isError
				})
			} catch (error) {
				results.push({
					type: 'tool_result',
					tool_use_id: toolUse.id,
					content: [{ type: 'text', text: `Tool execution failed: ${error.message}` }],
					is_error: true
				})
			}
		}

		return results
	}

	has(name: string): boolean {
		return this.tools.has(name)
	}
}
