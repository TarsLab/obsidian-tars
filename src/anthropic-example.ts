// Anthropic工具使用的典型历史记录示例
// 展示tool_use和tool_result的关联性以及在toolStorage中的体现

import { Vault } from 'obsidian'
import { ToolInteraction, readToolInteraction, saveToolInteraction } from './toolStorage'

/**
 * Anthropic典型对话的工具使用流程示例
 *
 * 对话流程：
 * 1. user: "今天北京的天气怎么样？"
 * 2. assistant: [text + tool_use]
 * 3. user: [tool_result]
 * 4. assistant: [text with final answer]
 */

// 示例：保存完整的工具交互记录
export const saveWeatherToolInteraction = async (vault: Vault) => {
	const interaction: ToolInteraction = {
		timestamp: new Date().toISOString(),
		conversation_id: 'conv_20250813_001', // 可选：关联到具体对话

		// tool_use 部分（来自 assistant 消息）
		tool_use: {
			id: 'toolu_01A09q90qw90lq917835lq9', // Claude生成的唯一ID
			name: 'get_weather', // 工具名称
			input: {
				// 工具输入参数
				location: '北京',
				unit: 'celsius',
				include_forecast: true
			}
		},

		// tool_result 部分（来自 user 消息）
		tool_result: {
			type: 'tool_result',
			tool_use_id: 'toolu_01A09q90qw90lq917835lq9', // 必须匹配tool_use.id
			content: '北京今日天气：晴，气温 15-25°C，东北风 3-4级。明日多云，16-24°C。',
			is_error: false
		},

		// 额外元数据
		execution_time_ms: 1250,
		model: 'claude-3-5-sonnet-20241022'
	}

	// 保存并获取引用
	const reference = await saveToolInteraction(vault, interaction)
	console.log('工具交互已保存，引用:', reference)
	// 输出: tool://2025-08-13.jsonl:1#get_weather

	return reference
}

// 示例：并行工具使用的记录
export const saveParallelToolsInteraction = async (vault: Vault) => {
	// 在同一个assistant消息中，Claude可能会同时调用多个工具
	// 这种情况下需要分别保存每个工具的交互记录

	const interactions: ToolInteraction[] = [
		{
			timestamp: new Date().toISOString(),
			conversation_id: 'conv_20250813_002',
			tool_use: {
				id: 'toolu_weather_001',
				name: 'get_weather',
				input: { location: '北京' }
			},
			tool_result: {
				type: 'tool_result',
				tool_use_id: 'toolu_weather_001',
				content: '北京：晴，15-25°C',
				is_error: false
			},
			execution_time_ms: 800
		},
		{
			timestamp: new Date().toISOString(),
			conversation_id: 'conv_20250813_002', // 同一对话
			tool_use: {
				id: 'toolu_time_001',
				name: 'get_time',
				input: { timezone: 'Asia/Shanghai' }
			},
			tool_result: {
				type: 'tool_result',
				tool_use_id: 'toolu_time_001',
				content: '2025-08-13 14:30:00 CST',
				is_error: false
			},
			execution_time_ms: 200
		}
	]

	const references = []
	for (const interaction of interactions) {
		const ref = await saveToolInteraction(vault, interaction)
		references.push(ref)
	}

	console.log('并行工具交互已保存:', references)
	return references
}

// 示例：工具执行失败的记录
export const saveFailedToolInteraction = async (vault: Vault) => {
	const interaction: ToolInteraction = {
		timestamp: new Date().toISOString(),
		tool_use: {
			id: 'toolu_fail_001',
			name: 'invalid_tool',
			input: { param: 'test' }
		},
		tool_result: {
			type: 'tool_result',
			tool_use_id: 'toolu_fail_001',
			content: 'Error: Tool "invalid_tool" not found',
			is_error: true // 标记为错误
		},
		execution_time_ms: 50
	}

	const reference = await saveToolInteraction(vault, interaction)
	console.log('失败的工具交互已保存:', reference)
	return reference
}

// 示例：读取和分析工具交互
export const analyzeToolInteraction = async (vault: Vault, reference: string) => {
	const interaction = await readToolInteraction(vault, reference)

	if (!interaction) {
		console.log('工具交互记录未找到')
		return
	}

	console.log('=== 工具交互分析 ===')
	console.log('时间:', interaction.timestamp)
	console.log('对话ID:', interaction.conversation_id || '未指定')

	console.log('\n--- tool_use (assistant消息) ---')
	console.log('工具ID:', interaction.tool_use.id)
	console.log('工具名称:', interaction.tool_use.name)
	console.log('输入参数:', JSON.stringify(interaction.tool_use.input, null, 2))

	console.log('\n--- tool_result (user消息) ---')
	console.log('关联ID:', interaction.tool_result.tool_use_id)
	console.log('执行结果:', interaction.tool_result.content)
	console.log('是否出错:', interaction.tool_result.is_error)

	if (interaction.execution_time_ms) {
		console.log('执行耗时:', interaction.execution_time_ms + 'ms')
	}

	// 验证ID关联性
	const isLinked = interaction.tool_use.id === interaction.tool_result.tool_use_id
	console.log('\nID关联性检查:', isLinked ? '✅ 正确' : '❌ 不匹配')
}

// 示例：模拟Anthropic的完整消息历史结构
export const getAnthropicMessageHistory = () => {
	return [
		{
			role: 'user',
			content: '今天北京和上海的天气怎么样？'
		},
		{
			role: 'assistant',
			content: [
				{
					type: 'text',
					text: '我来为您查询北京和上海的天气信息。'
				},
				{
					type: 'tool_use',
					id: 'toolu_beijing_001',
					name: 'get_weather',
					input: { location: '北京' }
				},
				{
					type: 'tool_use',
					id: 'toolu_shanghai_001',
					name: 'get_weather',
					input: { location: '上海' }
				}
			]
		},
		{
			role: 'user',
			content: [
				{
					type: 'tool_result',
					tool_use_id: 'toolu_beijing_001',
					content: '北京：晴，15-25°C，东北风3-4级',
					is_error: false
				},
				{
					type: 'tool_result',
					tool_use_id: 'toolu_shanghai_001',
					content: '上海：多云，18-28°C，南风2-3级',
					is_error: false
				}
			]
		},
		{
			role: 'assistant',
			content: [
				{
					type: 'text',
					text: '根据查询结果：\n\n**北京**：晴天，气温15-25°C，东北风3-4级\n**上海**：多云，气温18-28°C，南风2-3级\n\n两地天气都不错，适合外出活动！'
				}
			]
		}
	]
}
