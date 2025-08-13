import { App } from 'obsidian'

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
export interface ToolResult {
	content: Array<{
		type: 'text'
		text: string
	}>
	isError?: boolean
}

export interface ToolEnv {
	app: App
}

// 工具执行函数类型
export type ToolFunction = (env: ToolEnv, parameters: Record<string, unknown>) => Promise<ToolResult>

// 工具注册表
export class ToolRegistry {
	private tools: Map<string, { tool: Tool; execute: ToolFunction }> = new Map()
	public env: ToolEnv

	constructor(env: ToolEnv) {
		this.env = env
	}

	register(tool: Tool, execute: ToolFunction) {
		this.tools.set(tool.name, { tool, execute })
	}

	getTools(): Tool[] {
		return Array.from(this.tools.values()).map(({ tool }) => tool)
	}

	async execute(name: string, parameters: Record<string, unknown>): Promise<ToolResult> {
		if (!this.env) {
			return {
				content: [{ type: 'text', text: `Tool environment is not set` }],
				isError: true
			}
		}
		const toolInfo = this.tools.get(name)
		if (!toolInfo) {
			return {
				content: [{ type: 'text', text: `Tool "${name}" not found` }],
				isError: true
			}
		}

		try {
			return await toolInfo.execute(this.env, parameters)
		} catch (error) {
			return {
				content: [{ type: 'text', text: `Tool execution failed: ${error.message}` }],
				isError: true
			}
		}
	}

	has(name: string): boolean {
		return this.tools.has(name)
	}
}
