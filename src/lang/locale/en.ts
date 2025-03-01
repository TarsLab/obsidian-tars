// English

export default {
	// Common
	Error: 'Error',
	user: 'user',
	system: 'system',
	assistant: 'assistant',
	newChat: 'newChat',
	'Conversion failed. Selected sections is a': 'Conversion failed. Selected sections is a',
	message: 'message',
	'Check the developer console for error details. ': 'Check the developer console for error details. ',

	// commands/asstTag.ts
	'Regenerate?': 'Regenerate?',
	'This will delete the current response content. You can configure this in settings to not require confirmation.':
		'This will delete the current response content. You can configure this in settings to not require confirmation.',

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

	// prompt
	'Load template file: ': 'Load template file: ',
	'Templates have been updated: ': 'Templates have been updated: ',
	'Syntax Error Report': 'Syntax Error Report',
	'Create prompt template file': 'Create prompt template file',
	'Expected at least 2 sections, heading and content': 'Expected at least 2 sections, heading and content',
	'Expected heading': 'Expected heading',
	'Duplicate title:': 'Duplicate title:',

	// editor.ts
	'Please add a user message before generating AI response': 'Please add a user message before generating AI response',
	'Waiting for metadata to be ready. Please try again.': 'Waiting for metadata to be ready. Please try again.',
	'No text generated': 'No text generated',
	characters: 'characters',

	// main.ts
	'Removed commands': 'Removed commands',
	'Added commands': 'Added commands',

	// settingTab.ts
	'Restore default': 'Restore default',
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
	'Default:': 'Default:',
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
	'Invalid URL': 'Invalid URL',
	'Override input parameters': 'Override input parameters',
	'Developer feature, in JSON format. For example, if the model list doesn\'t have the model you want, enter {"model": "your desired model"}':
		'Developer feature, in JSON format. For example, if the model list doesn\'t have the model you want, enter {"model": "your desired model"}',
	'Remove AI assistant': 'Remove AI assistant',
	Remove: 'Remove',
	Endpoint: 'Endpoint',
	'API version': 'API version',
	'Select assistant': 'Select assistant',

	'Confirm before regeneration': 'Confirm before regeneration',
	'Confirm before replacing existing assistant responses when using assistant commands':
		'Confirm before replacing existing assistant responses when using assistant commands',
	Advanced: 'Advanced',
	'Delay before answer (Seconds)': 'Delay before answer (Seconds)',
	'If you encounter errors with missing user messages, it may be due to the need for more time to parse the messages. Please slightly increase the answer delay time.':
		'If you encounter errors with missing user messages, it may be due to the need for more time to parse the messages. Please slightly increase the answer delay time.',
	'Replace tag Command': 'Replace tag Command',
	'Export to JSONL Command': 'Export to JSONL Command',

	// suggest.ts
	'AI generate': 'AI generate',
	'Text generated successfully': 'Text generated successfully',
	'This is a non-streaming request, please wait...': 'This is a non-streaming request, please wait...',

	promptFileName: 'prompt.en',
	PRESET_PROMPT_TEMPLATES: `# Instructions

- Collect your commonly used prompts here for use with the Tars plugin commands.
- This file follows Obsidian's slide format, using \`---\` to separate each page.
- The first page contains instructions, and each subsequent page is a prompt template.
- Each template starts with a title in Markdown heading format, titles cannot be repeated. This is followed by the template content. Both title and content are required.
- If the content contains \`{{s}}\`, it will be replaced with your selected text.
- If there's no \`{{s}}\`, the selected text will be appended.
- If no text is selected, the template content will be used as is.
- If a page contains syntax errors, it won't appear in the command list.
- If you've edited this file, to load the updated templates into commands, please ==run the 'Load template file' command==, which will also check for syntax errors and display them in a popup.

---

# Prompt example

Tell me a joke

---

# Translation

Translate the following content into English：{{s}}

---

# One-sentence summary

{{s}} Summarize the above content in one sentence

`
}
