// 简体中文

export default {
	// Common
	Error: '异常',

	// commands/export.ts
	'Export conversations to JSONL': '导出对话到 JSONL',
	'No conversation found': '没有找到对话',
	'Exported to the same directory, Obsidian does not display the JSONL format. Please open with another software.':
		'已经导出到同一目录，obsidian 不显示 jsonl 格式，请用其他软件打开',

	// commands/replaceTag.ts
	'Replace speaker with tag': '把说话者替换为标签',
	'No speaker found': '没有找到说话者',
	'Replace the names of the two most frequently occurring speakers with tag format.':
		'用标签格式替换两个最常出现的说话者的名字',
	Replace: '替换',

	// providers
	'API key is required': '请配置对应的 API key',
	'API secret is required': '请配置对应的 API secret',
	'Model is required': '请配置对应的模型',

	// settingTab.ts
	'AI assistants': 'AI 助手',
	'New AI assistant': '新的AI助手',
	"Select assistant from dropdown and click 'Add'.": '从下拉框选择助手类型，点击新增按钮',
	Add: '新增',
	'Message tags': '消息标签',
	'Keywords for tags in the text box are separated by spaces': '在文本框中的标签关键字用空格分隔',
	'New chat tags': '新对话的标签',
	'User message tags': '用户消息的标签',
	'System message tags': '系统消息的标签',
	'At least one tag is required': '至少需要一个标签',
	tag: '标签',
	'Trigger AI generation': '触发AI生成',
	'Obtain key from ': '获取 key 网站 ',
	'Enter your key': '输入你的 key',
	'Keyword for tag must not contain #': '标签关键字不能包含#',
	'Keyword for tag must not contain space': '标签关键字不能包含空格',
	'Keyword for tag must be unique': '标签关键字必须唯一',
	Model: '模型',
	'Select the model to use': '选择要使用的模型',
	'Input the model to use': '输入要使用的模型',
	'Override input parameters': '覆盖输入参数',
	'Developer feature, in JSON format, for example, {"model": "gptX"} can override the model input parameter.':
		'开发者功能，json格式, 比如{"model": "gptX"}可以覆盖model输入参数，如果model下拉框没有对应的模型，想要使用新的模型，可以在这里输入',
	'Remove AI assistant': '移除 AI 助手',
	Remove: '移除',

	// suggest.ts
	'AI generate': 'AI 生成',
	'Text generated successfully': '文本生成成功'
}
