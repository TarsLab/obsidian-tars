import { ToolRegistry, ToolResult } from '../tools'

// MCP工具调用解析器
export interface ToolUseBlock {
	type: 'tool_use'
	id: string
	name: string
	input: Record<string, unknown>
}

export interface ToolResultBlock {
	type: 'tool_result'
	tool_use_id: string
	content: Array<{
		type: 'text'
		text: string
	}>
	is_error?: boolean
}

// 解析Claude的工具调用请求
export function parseToolUse(content: string): ToolUseBlock[] {
	const toolUseBlocks: ToolUseBlock[] = []

	// 简单的正则匹配工具调用格式
	// 格式: <tool_use name="tool_name" id="some_id">{"param": "value"}</tool_use>
	const toolUseRegex = /<tool_use\s+name="([^"]+)"\s+id="([^"]+)">(.*?)<\/tool_use>/g

	let match
	while ((match = toolUseRegex.exec(content)) !== null) {
		const [, name, id, inputJson] = match
		try {
			const input = JSON.parse(inputJson)
			toolUseBlocks.push({
				type: 'tool_use',
				id,
				name,
				input
			})
		} catch (error) {
			console.error('Failed to parse tool use input:', error)
		}
	}

	return toolUseBlocks
}

// 执行工具并生成结果
export async function executeTools(toolRegistry: ToolRegistry, toolUses: ToolUseBlock[]): Promise<ToolResultBlock[]> {
	const results: ToolResultBlock[] = []

	for (const toolUse of toolUses) {
		try {
			let result: ToolResult

			if (toolRegistry.has(toolUse.name)) {
				result = await toolRegistry.execute(toolUse.name, toolUse.input)
			} else {
				result = {
					content: [{ type: 'text', text: `Unknown tool: ${toolUse.name}` }],
					isError: true
				}
			}

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

// 格式化工具结果为文本
export function formatToolResults(results: ToolResultBlock[]): string {
	return results
		.map((result) => {
			const status = result.is_error ? '❌ Error' : '✅ Success'
			const content = result.content.map((c) => c.text).join('\n')
			return `${status} (Tool ID: ${result.tool_use_id}):\n${content}`
		})
		.join('\n\n')
}
