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

	// prompt
	'Generate from the selected text / current line': 'Generate from the selected text / current line',
	'Cannot find prompt template file.': 'Cannot find prompt template file.',
	'Last used': 'Last used',
	'Create tars folder': 'Create tars folder',
	'Create template file': 'Create template file',

	// providers
	'API key is required': 'API key is required',
	'API secret is required': 'API secret is required',
	'Model is required': 'Model is required',
	'API URL is required': 'API URL is required',

	// settingTab.ts
	'AI assistants': 'AI assistants',
	'New AI assistant': 'New AI assistant',
	"Select assistant from dropdown and click 'Add'. For those compatible with the OpenAI protocol, you can select OpenAI.":
		"Select assistant from dropdown and click 'Add'. For those compatible with the OpenAI protocol, you can select OpenAI.",
	Add: 'Add',
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
	'Developer feature, in JSON format. e.g. {"model": "your model", "baseURL": "your url"}':
		'Developer feature, in JSON format. e.g. {"model": "your model", "baseURL": "your url"}',
	'Remove AI assistant': 'Remove AI assistant',
	Remove: 'Remove',
	Endpoint: 'Endpoint',
	'API version': 'API version',

	// suggest.ts
	'AI generate': 'AI generate',
	'Text generated successfully': 'Text generated successfully',
	'No text generated': 'No text generated',
	'Check the developer console for error details. ': 'Check the developer console for error details. ',
	'This is a non-streaming request, please wait...': 'This is a non-streaming request, please wait...',

	promptFileName: 'prompt.en',
	PRESET_PROMPT_TEMPLATES: `
# 说明

- If you wish to use English prompts, please adjust the settings accordingly.
- 本文件按照 obsidian 的幻灯片格式，用“---”来分隔每一页的内容
- 第一页是说明，后面的每一页都是一个提示词模板
- \`#\` 是标题。当启动命令“生成内容”，标题显示在弹窗列表中。插件会把 \`{{s}}\`替换为选中的文本，得到最终的提示词。开头的\`{{s}}\`可以省略。
---

# 生成

{{s}} 

---

# 翻译

把以下内容翻译为中文：{{s}}

---

# 总结

总结以下内容：{{s}}

`
}
