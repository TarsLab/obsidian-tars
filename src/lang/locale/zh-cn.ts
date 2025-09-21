// 简体中文

export default {
	// Common
	Error: '异常',
	user: '用户',
	system: '系统',
	assistant: '助手',
	newChat: '新对话',
	'Conversion failed. Selected sections is a': '转换失败。选中的段落是',
	message: '消息',
	'Check the developer console for error details. ': '查看开发者控制台了解错误详情。',
	'Cancel generation': '取消生成',

	// commands/asstTag.ts
	'Regenerate?': '重新生成?',
	'This will delete the current response content. You can configure this in settings to not require confirmation.':
		'这会删掉当前的回答内容。你可以在设置里配置不需要弹窗确认。',
	Yes: '是',

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

	// commands/select.ts
	'Select message at cursor': '选择光标处的消息',
	'No message found at cursor': '光标处没有找到消息',

	// providers
	'API key is required': '请配置对应的 API key',
	'API secret is required': '请配置对应的 API secret',
	'Model is required': '请配置对应的模型',
	'API URL is required': '请配置对应的 API URL',
	'API key may be incorrect. Please check your API key.': 'API key 可能不正确，请检查您的 API key。',
	'Access denied. Please check your API permissions.': '访问被拒绝，请检查您的 API 权限。',
	'Text Generation': '文本生成',
	'Image Vision': '图像视觉',
	'PDF Vision': 'PDF视觉',
	'Image Generation': '图像生成',
	'Image Editing': '图像编辑',
	'Web Search': '网络搜索',
	Reasoning: '推理',
	'Only PNG, JPEG, GIF, and WebP images are supported.': '仅支持 PNG、JPEG、GIF 和 WebP 格式的图片。',
	'Only PNG, JPEG, GIF, WebP, and PDF files are supported.': '仅支持 PNG、JPEG、GIF、WebP 和 PDF 文件。',

	// providers/gptImage.ts
	'Only the last user message is used for image generation. Other messages are ignored.':
		'仅使用最后一条用户消息进行图片生成，其他消息将被忽略。',
	'Multiple embeds found, only the first one will be used': '发现多个嵌入内容，仅使用第一个',
	'Only PNG, JPEG, and WebP images are supported for editing.': '仅支持 PNG、JPEG 和 WebP 格式的图片进行编辑',
	'Embed data is empty or invalid': '嵌入数据为空或无效',
	'Failed to generate image. no data received from API': '生成图片失败。没有从 API 接收到数据',

	// prompt
	'Load template file: ': '加载模板文件: ',
	'Templates have been updated: ': '模板已更新: ',
	'Syntax Error Report': '语法错误报告',
	'Create prompt template file': '创建提示词模板文件',
	'Expected at least 2 sections, heading and content': '至少需要 2 个部分，标题和内容',
	'Expected heading': '需要标题',
	'Duplicate title:': '重复的标题:',

	// editor.ts
	'Please add a user message first, or wait for the user message to be parsed.':
		'请先添加用户消息，或者稍等用户消息解析完成',
	'Waiting for metadata to be ready. Please try again.': '正在等待元数据准备就绪。请重试。',
	'No text generated': '没有生成文本',
	characters: '个字符',

	// main.ts
	'Removed commands': '已移除命令',
	'Added commands': '已添加命令',
	'No active generation to cancel': '没有正在进行的生成可取消',
	'Generation already cancelled': '生成已经取消',
	'Generation cancelled': '已取消生成',

	// settingTab.ts
	'Restore default': '恢复默认',
	'AI assistants': 'AI 助手',
	'New AI assistant': '新的 AI 助手',
	'For those compatible with the OpenAI protocol, you can select OpenAI.': '对于兼容 OpenAI 协议的，可以选择 OpenAI.',
	'Add AI Provider': '添加 AI 服务商',
	'Please add at least one AI assistant to start using the plugin.': '请至少添加一个 AI 助手，以便开始使用插件',
	'Message tags': '消息标签',
	'Keywords for tags in the text box are separated by spaces': '在文本框中的标签关键字用空格分隔',
	'New chat tags': '新对话的标签',
	'User message tags': '用户消息的标签',
	'System message tags': '系统消息的标签',
	'At least one tag is required': '至少需要一个标签',
	'Assistant message tag': '助手消息的标签',
	'Tag used to trigger AI text generation': '用于触发 AI 文本生成的标签',
	'Obtain key from ': '获取 key 网站 ',
	'Web search': '网络搜索',
	'Enable web search for AI': '为当前 AI 启用网络搜索',
	'API key (required)': 'API Key (必填)',
	'Default:': '默认:',
	'Refer to the technical documentation': '参考技术文档',
	'Keyword for tag must not contain #': '标签关键字不能包含 #',
	'Keyword for tag must not contain space': '标签关键字不能包含空格',
	'Keyword for tag must be unique': '标签关键字必须唯一',
	Model: '模型',
	'Supported features': '支持功能',
	'Select the model to use': '选择要使用的模型',
	'Please input API key first': '请先输入 API key',
	'Please enter a number': '请输入一个数字',
	'Minimum value is 256': '最小值是256',
	'Invalid URL': '无效的 URL',
	'Override input parameters': '覆盖输入参数',
	'Developer feature, in JSON format. For example, if the model list doesn\'t have the model you want, enter {"model": "your desired model"}':
		'开发者功能，以 JSON 格式。例如: 模型列表中没有你需要的模型时，可以填入 {"model": "你想要的model"}',
	'Remove AI assistant': '移除 AI 助手',
	Remove: '移除',
	Endpoint: '终结点',
	'API version': 'API 版本',
	'Select assistant': '选择助手',

	'Confirm before regeneration': '重新生成前是否需要确认',
	'Confirm before replacing existing assistant responses when using assistant commands':
		'在使用助手标签命令时，替换旧的助手消息，是否需要弹窗确认',
	'Internal links': '内部链接',

	'Internal links in user and system messages will be replaced with their referenced content. When disabled, only the original text of the links will be used.':
		'用户和系统消息中的内部链接将被替换为其引用的内容。禁用时，仅使用链接的原始文本。',

	// Advanced settings
	'Internal links for assistant messages': '助手消息的内部链接',
	'Replace internal links in assistant messages with their referenced content. Note: This feature is generally not recommended as assistant-generated content may contain non-existent links.':
		'助手消息中的内部链接替换为其引用的内容。注意：通常情况下不建议启用此功能，因为助手生成的内容可能包含不存在的链接。',
	'System message': '系统消息',
	'Enable default system message': '启用默认系统消息',
	'Automatically add a system message when none exists in the conversation':
		'当对话中没有系统消息时，自动添加自定义的默认的系统消息',
	'Default system message': '默认系统消息',
	Advanced: '高级',
	'Delay before answer (Seconds)': '回答前的延迟（秒）',
	'If you encounter errors with missing user messages when executing assistant commands on selected text, it may be due to the need for more time to parse the messages. Please slightly increase the delay time.':
		'在选中文本执行助手命令的时候，如果遇到缺少用户消息的错误，可能是需要更多时间来解析消息，请稍微增加延迟',
	'Replace tag Command': '替换标签命令',
	'Export to JSONL Command': '导出到 JSONL 命令',
	'Tag suggest': '标签建议',
	'If you only use commands without needing tag suggestions, you can disable this feature. Changes will take effect after restarting the plugin.':
		'如果你只使用命令而不需要标签建议，可以禁用此功能。更改将在重新启动插件后生效。',

	// gpt image settings
	'Image Display Width': '图片显示宽度',
	'Example: 400px width would output as ![[image.jpg|400]]': '例如: 400px 宽度会输出为 ![[image.jpg|400]]',
	'Number of images': '图片数量',
	'Number of images to generate (1-5)': '生成的图片数量 (1-5)',
	'Image size': '图片尺寸',
	landscape: '横向',
	portrait: '纵向',
	'Output format': '输出格式',
	Quality: '质量',
	'Quality level for generated images. default: Auto': '生成图片的质量等级。默认: 自动',
	Auto: '自动',
	High: '高',
	Medium: '中',
	Low: '低',
	Background: '背景',
	'Background of the generated image. default: Auto': '生成图片的背景。默认: 自动',
	Transparent: '透明',
	Opaque: '不透明',
	'Output compression': '输出压缩',
	'Compression level of the output image, 10% - 100%. Only for webp or jpeg output format':
		'输出图片的压缩级别，10% - 100%。仅适用于 webp 或 jpeg 输出格式',

	// suggest.ts
	'AI generate': 'AI 生成',
	'Text generated successfully': '文本生成成功',
	'This is a non-streaming request, please wait...': '这是一个非流式请求，请稍候...',

	promptFileName: 'prompt.zh',
	PRESET_PROMPT_TEMPLATES: `# 使用说明

- 把你的常用提示词收集到这里，以便在Tars插件的命令中使用。
- 本文件按照 obsidian 的幻灯片格式，用\`---\`来分隔每一页
- 第一页是说明，后面的每一页都是一个提示词模板
- 首先是模板的标题, 以markdown的标题格式, 标题不能重复。接下来都是模板的内容。标题和内容都不可缺少。
- 如果内容有 \`{{s}}\`，会把 \`{{s}}\`替换为选中的文本
- 如果没有 \`{{s}}\`，则追加
- 如果没有选中的文本，则直接使用模板的内容
- 如果某一页有语法错误，则不会出现在命令中
- 如果你编辑了该文件，要把更新后的模板加载到命令中，==执行命令“加载模板文件”==，该命令同时会检查语法错误并弹窗显示。

---

# 提示词例子

给我讲个笑话

---

# 翻译

把以下内容翻译为中文：{{s}}

---

# 一句话总结

{{s}} 用一句话总结以上内容

`,

	// Claude thinking settings
	Thinking: '思考',
	'When enabled, Claude will show its reasoning process before giving the final answer.':
		'启用后，Claude 将在给出最终答案前展示其推理过程',
	'Budget tokens for thinking': '思考令牌预算',
	'Must be ≥1024 and less than max_tokens': '必须 ≥1024 且小于 max_tokens',
	'Minimum value is 1024': '最小值为 1024',

	// statusBarManager.ts
	'AI Generation Details': 'AI 生成详情',
	Round: '回合',
	Duration: '用时',
	'Start Time': '开始时间',
	'End Time': '结束时间',
	'Error Details': '错误详情',
	'Error Type': '错误类型',
	'Error Message': '错误信息',
	'Occurrence Time': '发生时间',
	'Stack Trace': '堆栈跟踪',
	'Copy Error Info': '复制错误信息',
	'Error info copied to clipboard': '错误信息已复制到剪贴板',
	'Unknown Error': '未知错误',
	'Tars AI assistant is ready': 'Tars AI 助手已就绪',
	'Generating round': '正在生成第',
	'answer...': '轮回答...',
	'Generating...': '正在生成...',
	'Click status bar for error details. ': '点击状态栏查看错误详情。',
	Vendor: '服务商',
	Characters: '字符数'
}
