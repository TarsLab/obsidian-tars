# MCP (Model Context Protocol) 工具集成方案

## 概览

在 Obsidian TARS 插件中成功集成了类似 MCP (Model Context Protocol) 的工具功能，允许 Claude 直接操作 Obsidian vault 中的文件和执行各种操作。

## 技术架构

### 1. 核心组件

```
src/tools/              # 工具模块
├── index.ts            # 工具注册和管理
├── fileSystem.ts       # 文件系统工具
└── vault.ts            # Obsidian Vault 特有操作工具

src/mcp/                # MCP协议实现
└── parser.ts           # 工具调用解析器

providers/claude.ts     # 集成MCP支持
```

### 2. 工具系统设计

- **工具注册表**: 统一管理所有可用工具
- **类型安全**: 使用 TypeScript 确保参数类型安全
- **错误处理**: 完善的错误处理和反馈机制
- **扩展性**: 易于添加新的工具类型

## 已实现的工具

### 文件系统工具

1. **read_file** - 读取文件内容
2. **write_file** - 写入文件内容
3. **list_directory** - 列出目录内容
4. **delete_file** - 删除文件

### Vault 特有工具

1. **search_notes** - 搜索笔记（支持内容和文件名搜索）
2. **get_note_links** - 获取笔记中的所有链接
3. **get_note_tags** - 获取笔记中的所有标签

## 使用方法

### 1. 启用 MCP 工具

在 Claude 提供者设置中启用 "MCP Tools" 选项：

1. 打开插件设置
2. 找到 Claude 提供者配置
3. 启用 "MCP Tools" 开关

### 2. 与 AI 交互

当启用 MCP 工具后，你可以直接要求 Claude 执行文件操作：

```
用户: 请帮我在 vault 中创建一个名为 "meeting-notes.md" 的文件，内容是今天的会议纪要。

Claude: 我来为您创建这个会议纪要文件。

<tool_use name="write_file" id="create_meeting_notes">
{"path": "meeting-notes.md", "content": "# 会议纪要\n\n**日期**: 2024年X月X日\n**参与人员**: \n\n## 讨论要点\n\n## 决策事项\n\n## 行动计划\n\n"}
</tool_use>

文件已成功创建！您现在可以编辑这个文件来添加具体的会议内容。
```

### 3. 高级操作示例

```
用户: 帮我搜索包含 "项目计划" 的所有笔记，然后列出它们的链接。

Claude: 我来帮您搜索相关笔记并分析其链接。

<tool_use name="search_notes" id="search_project_notes">
{"query": "项目计划", "searchType": "both", "limit": 10}
</tool_use>

然后对找到的每个笔记分析其链接：

<tool_use name="get_note_links" id="get_links_1">
{"path": "projects/项目计划-Q1.md"}
</tool_use>
```

## 技术优势

### 1. Electron API 兼容性

- 使用 Obsidian 的 Vault API 而非 Node.js 文件系统
- 完全兼容 Electron 环境
- 支持桌面和移动端

### 2. 安全性

- 工具调用在沙箱环境中执行
- 完整的错误处理和验证
- 不直接访问系统级资源

### 3. 性能优化

- 异步执行，不阻塞 UI
- 智能缓存机制
- 批量操作支持

## 扩展指南

### 添加新工具

1. 在 `src/tools/` 下创建新的工具文件
2. 定义工具接口和执行函数
3. 在工具注册表中注册
4. 在主插件中初始化

例如，添加一个日历工具：

```typescript
// src/tools/calendar.ts
const createEventTool: Tool = {
	name: 'create_calendar_event',
	description: 'Create a calendar event in Obsidian',
	input_schema: {
		type: 'object',
		properties: {
			title: { type: 'string' },
			date: { type: 'string' },
			time: { type: 'string' }
		},
		required: ['title', 'date']
	}
}

const createEventFunction: ToolFunction = async (app, parameters) => {
	// 实现创建日历事件的逻辑
}

export function registerCalendarTools() {
	defaultToolRegistry.register(createEventTool, createEventFunction)
}
```

## 与标准 MCP 的区别

1. **协议适配**: 使用简化的工具调用格式，适配 Claude 的工具系统
2. **运行环境**: 针对 Obsidian 插件环境优化
3. **工具范围**: 专注于 Obsidian vault 操作和知识管理

## 未来发展

1. **更多工具类型**: 图像处理、数据分析、网络请求等
2. **工具链**: 支持工具之间的组合调用
3. **可视化界面**: 工具调用的可视化监控
4. **第三方集成**: 支持插件生态系统的其他工具

## 总结

此方案成功在 Obsidian 插件环境中实现了类似 MCP 的工具集成功能，为用户提供了强大的 AI 助手能力，可以直接操作和管理 Obsidian vault 中的内容。该实现具有良好的扩展性、安全性和性能表现。
