// English

export default {
	// Common
	Error: 'Error',

	// commands/export.ts
	'Export conversations to JSONL': 'Export conversations to JSONL',
	'No conversation found': 'No conversation found',
	'Exported to the same directory, Obsidian does not display the JSONL format. Please open with another software.':
		'Exported to the same directory, Obsidian does not display the JSONL format. Please open with another software.',

	// commands/replaceTag.ts
	'Replace speaker with tag': 'Replace speaker with tag',
	'No speaker found': 'No speaker found',
	'Replace the names of the two most frequently occurring speakers with tag format.':
		'Replace the names of the two most frequently occurring speakers with tag format.',
	Replace: 'Replace',

	// commands/select.ts
	'Select message at cursor': 'Select message at cursor',
	'No message found at cursor': 'No message found at cursor',

	// providers
	'API key is required': 'API key is required',
	'API secret is required': 'API secret is required',
	'Model is required': 'Model is required',
	'API URL is required': 'API URL is required',

	// qa/answer.ts
	'Answer: Select assistant': 'Answer: Select assistant',
	'Please add one assistant in the settings first': 'Please add one assistant in the settings first',
	'Regenerate Answer': 'Regenerate Answer',

	// qa/combine.ts
	'Question & Answer: Recently used template and assistant': 'Question & Answer: Recently used template and assistant',
	'At least one user tag is required': 'At least one user tag is required',

	// qa/modal.ts
	'Syntax Error Report': 'Syntax Error Report',

	// qa/promptTemplate.ts
	BASIC_PROMPT_TEMPLATE: '✨ (Original) ✨',
	'View prompt templates: check syntax': 'View prompt templates: check syntax',
	'Prompt template file is syntactically correct': 'Prompt template file is syntactically correct',
	'Create tars folder': 'Create tars folder',
	'Create prompt template file': 'Create prompt template file',
	'Expected at least 2 sections, heading and content': 'Expected at least 2 sections, heading and content',
	'Expected heading': 'Expected heading',

	// qa/question.ts
	'Question: selected sections / current section at cursor': 'Question: selected sections / current section at cursor',

	// editor.ts
	'Please add a user message before generating AI response': 'Please add a user message before generating AI response',
	'No text generated': 'No text generated',
	characters: 'characters',

	// settingTab.ts
	'AI assistants': 'AI assistants',
	'New AI assistant': 'New AI assistant',
	"Select assistant from dropdown and click 'Add'. For those compatible with the OpenAI protocol, you can select OpenAI.":
		"Select assistant from dropdown and click 'Add'. For those compatible with the OpenAI protocol, you can select OpenAI.",
	Add: 'Add',
	'Please add at least one AI assistant to start using the plugin.':
		'Please add at least one AI assistant to start using the plugin.',
	'Message tags': 'Message tags',
	'Keywords for tags in the text box are separated by spaces':
		'Keywords for tags in the text box are separated by spaces',
	'New chat tags': 'New chat tags',
	'User message tags': 'User message tags',
	'System message tags': 'System message tags',
	'At least one tag is required': 'At least one tag is required',
	tag: 'tag',
	'Trigger AI generation': 'Trigger AI generation',
	'Obtain key from ': 'Obtain key from ',
	'Web search': 'Web search',
	'Enable web search for AI': 'Enable web search for AI',
	'Enter your key': 'Enter your key',
	'Refer to the technical documentation': 'Refer to the technical documentation',
	'Keyword for tag must not contain #': 'Keyword for tag must not contain #',
	'Keyword for tag must not contain space': 'Keyword for tag must not contain space',
	'Keyword for tag must be unique': 'Keyword for tag must be unique',
	Model: 'Model',
	'Select the model to use': 'Select the model to use',
	'Please input API key first': 'Please input API key first',
	'Input the model to use': 'Input the model to use',
	'Please enter a number': 'Please enter a number',
	'Minimum value is 256': 'Minimum value is 256',
	'Proxy URL': 'Proxy URL',
	'Invalid URL': 'Invalid URL',
	'Override input parameters': 'Override input parameters',
	'Developer feature, in JSON format. For example, if the model list doesn\'t have the model you want, enter {"model": "your desired model"}':
		'Developer feature, in JSON format. For example, if the model list doesn\'t have the model you want, enter {"model": "your desired model"}',
	'Remove AI assistant': 'Remove AI assistant',
	Remove: 'Remove',
	Endpoint: 'Endpoint',
	'API version': 'API version',
	'Select assistant': 'Select assistant',

	'Question & Answer': 'Question & Answer',
	'The question and answer command will directly select the most recently used prompt template and assistant.':
		'The question and answer command will directly select the most recently used prompt template and assistant.',
	'Recently used prompt template': 'Recently used prompt template',
	"When using the 'Question' command, it will automatically update.":
		"When using the 'Question' command, it will automatically update.",
	'Recently used assistant tag': 'Recently used assistant tag',
	"When using the 'Answer' command, it will automatically update.":
		"When using the 'Answer' command, it will automatically update.",
	'Delay before answer (Seconds)': 'Delay before answer (Seconds)',
	'If you encounter errors with missing user messages, it may be due to the need for more time to parse the messages. Please slightly increase the answer delay time.':
		'If you encounter errors with missing user messages, it may be due to the need for more time to parse the messages. Please slightly increase the answer delay time.',

	// suggest.ts
	'AI generate': 'AI generate',
	'Text generated successfully': 'Text generated successfully',
	'Check the developer console for error details. ': 'Check the developer console for error details. ',
	'This is a non-streaming request, please wait...': 'This is a non-streaming request, please wait...',

	promptFileName: 'prompt.en',
	PRESET_PROMPT_TEMPLATES: `
# 使用说明

- 把你的常用提示词收集到这里，以便在Tars插件的“提问”命令中使用。
- 本文件按照 obsidian 的幻灯片格式，用“---”来分隔每一页的内容
- 第一页是说明，后面的每一页都是一个提示词模板
- 首先是模板的标题, 以markdown的标题格式。接下来都是模板的内容。标题和内容都不可缺少。
- 如果内容有 \`{{s}}\`，会把 \`{{s}}\`替换为选中的文本
- 如果没有 \`{{s}}\`，则追加
- 如果没有选中的文本，那么会直接使用模板的内容
- 如果某一页有语法错误，则不会出现在“提问”命令的弹窗列表中
- 如果要检查有没有语法错误，执行命令“查看提示词模板: 检查语法”

---

# 提示词例子

给我讲个笑话

---

# 翻译

把以下内容翻译为中文：{{s}}

---

# 总结

总结以下内容：{{s}}

`
}
