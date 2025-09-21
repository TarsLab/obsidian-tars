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
	'Cancel generation': 'Cancel generation',

	// commands/asstTag.ts
	'Regenerate?': 'Regenerate?',
	'This will delete the current response content. You can configure this in settings to not require confirmation.':
		'This will delete the current response content. You can configure this in settings to not require confirmation.',
	Yes: 'Yes',

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
	'API key may be incorrect. Please check your API key.': 'API key may be incorrect. Please check your API key.',
	'Access denied. Please check your API permissions.': 'Access denied. Please check your API permissions.',
	'Text Generation': 'Text Generation',
	'Image Vision': 'Image Vision',
	'PDF Vision': 'PDF Vision',
	'Image Generation': 'Image Generation',
	'Image Editing': 'Image Editing',
	'Web Search': 'Web Search',
	Reasoning: 'Reasoning',
	'Only PNG, JPEG, GIF, and WebP images are supported.': 'Only PNG, JPEG, GIF, and WebP images are supported.',
	'Only PNG, JPEG, GIF, WebP, and PDF files are supported.': 'Only PNG, JPEG, GIF, WebP, and PDF files are supported.',

	// providers/gptImage.ts
	'Only the last user message is used for image generation. Other messages are ignored.':
		'Only the last user message is used for image generation. Other messages are ignored.',
	'Multiple embeds found, only the first one will be used': 'Multiple embeds found, only the first one will be used',
	'Only PNG, JPEG, and WebP images are supported for editing.':
		'Only PNG, JPEG, and WebP images are supported for editing.',
	'Embed data is empty or invalid': 'Embed data is empty or invalid',
	'Failed to generate image. no data received from API': 'Failed to generate image. no data received from API',

	// prompt
	'Load template file: ': 'Load template file: ',
	'Templates have been updated: ': 'Templates have been updated: ',
	'Syntax Error Report': 'Syntax Error Report',
	'Create prompt template file': 'Create prompt template file',
	'Expected at least 2 sections, heading and content': 'Expected at least 2 sections, heading and content',
	'Expected heading': 'Expected heading',
	'Duplicate title:': 'Duplicate title:',

	// editor.ts
	'Please add a user message first, or wait for the user message to be parsed.':
		'Please add a user message first, or wait for the user message to be parsed.',
	'Waiting for metadata to be ready. Please try again.': 'Waiting for metadata to be ready. Please try again.',
	'No text generated': 'No text generated',
	characters: 'characters',

	// main.ts
	'Removed commands': 'Removed commands',
	'Added commands': 'Added commands',
	'No active generation to cancel': 'No active generation to cancel',
	'Generation already cancelled': 'Generation already cancelled',
	'Generation cancelled': 'Generation cancelled',

	// settingTab.ts
	'Restore default': 'Restore default',
	'AI assistants': 'AI assistants',
	'New AI assistant': 'New AI assistant',
	'For those compatible with the OpenAI protocol, you can select OpenAI.':
		'For those compatible with the OpenAI protocol, you can select OpenAI.',
	'Add AI Provider': 'Add AI Provider',
	'Please add at least one AI assistant to start using the plugin.':
		'Please add at least one AI assistant to start using the plugin.',
	'Message tags': 'Message tags',
	'Keywords for tags in the text box are separated by spaces':
		'Keywords for tags in the text box are separated by spaces',
	'New chat tags': 'New chat tags',
	'User message tags': 'User message tags',
	'System message tags': 'System message tags',
	'At least one tag is required': 'At least one tag is required',
	'Assistant message tag': 'Assistant message tag',
	'Tag used to trigger AI text generation': 'Tag used to trigger AI text generation',
	'Obtain key from ': 'Obtain key from ',
	'Web search': 'Web search',
	'Enable web search for AI': 'Enable web search for AI',
	'API key (required)': 'API key (required)',
	'Default:': 'Default:',
	'Refer to the technical documentation': 'Refer to the technical documentation',
	'Keyword for tag must not contain #': 'Keyword for tag must not contain #',
	'Keyword for tag must not contain space': 'Keyword for tag must not contain space',
	'Keyword for tag must be unique': 'Keyword for tag must be unique',
	Model: 'Model',
	'Supported features': 'Supported features',
	'Select the model to use': 'Select the model to use',
	'Please input API key first': 'Please input API key first',
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
	'Internal links': 'Internal links',
	'Internal links in user and system messages will be replaced with their referenced content. When disabled, only the original text of the links will be used.':
		'Internal links in user and system messages will be replaced with their referenced content. When disabled, only the original text of the links will be used.',

	// Advanced settings
	'Internal links for assistant messages': 'Internal links for assistant messages',
	'Replace internal links in assistant messages with their referenced content. Note: This feature is generally not recommended as assistant-generated content may contain non-existent links.':
		'Replace internal links in assistant messages with their referenced content. Note: This feature is generally not recommended as assistant-generated content may contain non-existent links.',
	'System message': 'System message',
	'Enable default system message': 'Enable default system message',
	'Automatically add a system message when none exists in the conversation':
		'Automatically add a system message when none exists in the conversation',
	'Default system message': 'Default system message',
	Advanced: 'Advanced',
	'Delay before answer (Seconds)': 'Delay before answer (Seconds)',
	'If you encounter errors with missing user messages when executing assistant commands on selected text, it may be due to the need for more time to parse the messages. Please slightly increase the delay time.':
		'If you encounter errors with missing user messages when executing assistant commands on selected text, it may be due to the need for more time to parse the messages. Please slightly increase the delay time.',
	'Replace tag Command': 'Replace tag Command',
	'Export to JSONL Command': 'Export to JSONL Command',
	'Tag suggest': 'Tag suggest',
	'If you only use commands without needing tag suggestions, you can disable this feature. Changes will take effect after restarting the plugin.':
		'If you only use commands without needing tag suggestions, you can disable this feature. Changes will take effect after restarting the plugin.',

	// gpt image settings
	'Image Display Width': 'Image Display Width',
	'Example: 400px width would output as ![[image.jpg|400]]': 'Example: 400px width would output as ![[image.jpg|400]]',
	'Number of images': 'Number of images',
	'Number of images to generate (1-5)': 'Number of images to generate (1-5)',
	'Image size': 'Image size',
	landscape: 'landscape',
	portrait: 'portrait',
	'Output format': 'Output format',
	Quality: 'Quality',
	'Quality level for generated images. default: Auto': 'Quality level for generated images. default: Auto',
	Auto: 'Auto',
	High: 'High',
	Medium: 'Medium',
	Low: 'Low',
	Background: 'Background',
	'Background of the generated image. default: Auto': 'Background of the generated image. default: Auto',
	Transparent: 'Transparent',
	Opaque: 'Opaque',
	'Output compression': 'Output compression',
	'Compression level of the output image, 10% - 100%. Only for webp or jpeg output format':
		'Compression level of the output image, 10% - 100%. Only for webp or jpeg output format',

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

`,

	// Claude thinking settings
	Thinking: 'Thinking',
	'When enabled, Claude will show its reasoning process before giving the final answer.':
		'When enabled, Claude will show its reasoning process before giving the final answer.',
	'Budget tokens for thinking': 'Budget tokens for thinking',
	'Must be ≥1024 and less than max_tokens': 'Must be ≥1024 and less than max_tokens',
	'Minimum value is 1024': 'Minimum value is 1024',

	// statusBarManager.ts
	'AI Generation Details': 'AI Generation Details',
	Round: 'Round',
	Duration: 'Duration',
	'Start Time': 'Start Time',
	'End Time': 'End Time',
	'Error Details': 'Error Details',
	'Error Type': 'Error Type',
	'Error Message': 'Error Message',
	'Occurrence Time': 'Occurrence Time',
	'Stack Trace': 'Stack Trace',
	'Copy Error Info': 'Copy Error Info',
	'Error info copied to clipboard': 'Error info copied to clipboard',
	'Unknown Error': 'Unknown Error',
	'Tars AI assistant is ready': 'Tars AI assistant is ready',
	'Generating round': 'Generating round',
	'answer...': 'answer...',
	'Generating...': 'Generating...',
	'Click status bar for error details. ': 'Click status bar for error details. ',
	Vendor: 'Vendor',
	Characters: 'Characters'
}
