# MCP Tool Usage Guide - Obsidian Tars

This guide explains how to use MCP (Model Context Protocol) tools in your Obsidian documents.

## 📖 Table of Contents

1. [Setup](#setup)
2. [Using Code Blocks](#using-code-blocks)
3. [Memory/Knowledge Graph Example](#memory-knowledge-graph-example)
4. [AI Autonomous Tool Calling](#ai-autonomous-tool-calling)
5. [Troubleshooting](#troubleshooting)

---

## Setup

### 1. Configure MCP Server in Settings

1. Open Obsidian Settings → **Tars** → **MCP Servers**
2. Click **"Add MCP Server"**
3. Configure your server:

**Example: Memory Server (Docker)**
```
Server Name: Memory Server
Server ID: memory-server
Transport: stdio
Deployment: managed
Docker Image: mcp/memory:latest
Container Name: obsidian-mcp-memory
```

**Example: Custom Server (Docker)**
```
Server Name: My Tools
Server ID: my-tools
Transport: stdio
Deployment: managed
Docker Image: your-docker-image:latest
Container Name: obsidian-mcp-tools
```

### 2. Enable the Server

- Toggle **"Enabled"** to ON
- The plugin will automatically start the Docker container
- Check status in the settings panel

---

## Using Code Blocks

### Basic Syntax

MCP tools are executed using **markdown code blocks** with the server name as the language:

````markdown
```server-name
tool: tool_name
parameter1: value1
parameter2: value2
```
````

### Format Breakdown

1. **Code block fence**: ` ```server-name `
   - Replace `server-name` with your **Server Name** from settings
   - Must match exactly (case-sensitive)

2. **Tool line**: `tool: tool_name`
   - Required first line
   - Specifies which tool to execute

3. **Parameters**: `key: value` format
   - YAML-style key-value pairs
   - One parameter per line
   - Supports: strings, numbers, booleans, null

4. **Close fence**: ` ``` `

### Execution Flow

1. **Write** the code block in your note
2. **Switch to Reading Mode** or **Live Preview**
3. Plugin **automatically detects** the code block
4. Tool is **executed** via the MCP server
5. **Result appears** inline, replacing the code block

---

## Memory/Knowledge Graph Example

The `mcp/memory` Docker image provides a **knowledge graph** server with these tools:

### Available Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `create_entities` | Create entities in graph | `entities`: array of entity objects |
| `create_relations` | Create relationships | `relations`: array of relation objects |
| `add_observations` | Add observations | `entityName`, `contents`: array |
| `read_graph` | Read entire graph | _(none)_ |
| `search_nodes` | Search for nodes | `query`: search string |
| `delete_entities` | Delete entities | `entityNames`: array |
| `delete_relations` | Delete relations | `relations`: array |
| `delete_observations` | Delete observations | `entityName`, `observations`: array |
| `open_nodes` | Open node details | `names`: array |

### Example 1: Store Information

````markdown
```Memory Server
tool: create_entities
entities:
  - name: "project-tars"
    entityType: "project"
    observations: ["Obsidian plugin", "Uses MCP protocol"]
```
````

**Result:** Entity created with observations

### Example 2: Add Observations

````markdown
```Memory Server
tool: add_observations
entityName: project-tars
contents:
  - "Supports tool calling"
  - "Integrated with Ollama"
```
````

**Result:** Observations added to entity

### Example 3: Read the Graph

````markdown
```Memory Server
tool: read_graph
```
````

**Result:** Complete knowledge graph in JSON format

### Example 4: Search

````markdown
```Memory Server
tool: search_nodes
query: tars
```
````

**Result:** Matching entities and relations

### Example 5: Create Relations

````markdown
```Memory Server
tool: create_relations
relations:
  - from: "project-tars"
    to: "obsidian"
    relationType: "plugin-for"
```
````

**Result:** Relationship created

---

## AI Autonomous Tool Calling

When using AI providers that support **native tool calling** (OpenAI, Claude, Ollama with llama3.2), the AI can **automatically** execute MCP tools during conversations.

### Supported Providers

- ✅ **Ollama** (llama3.2, llama3.1, mistral)
- ✅ **OpenAI** (gpt-4, gpt-4-turbo)
- ✅ **Claude** (claude-3-opus/sonnet/haiku)
- ✅ **Azure OpenAI** (all models)
- ✅ **OpenRouter**, **DeepSeek**, **Grok**, **Gemini**

### How It Works

1. Configure your AI provider in Tars settings
2. Start a conversation with an AI assistant tag (e.g., `#Ollama :`)
3. AI automatically sees available MCP tools
4. AI decides when to use tools based on context
5. Tools execute automatically
6. AI incorporates results in response

### Example Conversation

**You write:**
```markdown
#Ollama : Remember that I prefer TypeScript for coding projects. 
Also, I'm working on a plugin called "obsidian-tars".
```

**AI Response:**
```
I'll store that information for you.
[Automatically calls: create_entities with project info]
[Automatically calls: add_observations with preferences]

Got it! I've stored:
- Your preference for TypeScript
- Your current project: obsidian-tars

I'll remember this for future conversations.
```

**Later, you ask:**
```markdown
#Ollama : What was the project I mentioned?
```

**AI Response:**
```
[Automatically calls: search_nodes with query "project"]
[Reads stored entities]

You mentioned you're working on "obsidian-tars", which is 
an Obsidian plugin. You also prefer using TypeScript.
```

---

## Advanced Usage

### Multi-line Values

Use YAML multi-line format:

````markdown
```Memory Server
tool: add_observations
entityName: my-project
contents:
  - "First observation with details"
  - "Second observation"
  - "Third observation with more context"
```
````

### Complex Objects

For nested structures:

````markdown
```Memory Server
tool: create_entities
entities:
  - name: "user-alice"
    entityType: "person"
    observations: ["Software developer", "Likes TypeScript"]
  - name: "user-bob"
    entityType: "person"
    observations: ["Designer", "Uses Figma"]
```
````

### Result Rendering

Results are rendered with:
- ✅ **Success indicator**
- ⏱️ **Execution duration**
- 📊 **Content type** (text/json/markdown)
- 📝 **Formatted output**

Example result display:
```
✅ Success
Duration: 45ms
Type: json

{
  "entities": [
    { "name": "project-tars", "entityType": "project" }
  ],
  "relations": []
}
```

---

## Troubleshooting

### Code Block Not Executing

**Problem:** Code block appears as plain text

**Solutions:**
1. Check server name matches exactly (Settings → MCP Servers)
2. Switch to Reading Mode or Live Preview
3. Ensure server is enabled in settings
4. Check Docker container is running: `docker ps | grep mcp`

### Tool Execution Failed

**Problem:** Error message appears instead of result

**Solutions:**
1. Verify tool name is correct (check available tools in settings)
2. Check parameter format (YAML syntax)
3. Review Docker logs: `docker logs <container-name>`
4. Ensure required parameters are provided

### Server Not Starting

**Problem:** Container fails to start

**Solutions:**
1. Pull the image: `docker pull mcp/memory:latest`
2. Check Docker is running: `docker info`
3. Review error in settings panel
4. Check ports aren't already in use
5. Verify Docker image name is correct

### Slow Execution

**Problem:** Tools take long time to execute

**Solutions:**
1. Check concurrent execution limit (Settings → MCP Servers)
2. Docker container might be initializing (first run)
3. Network latency for remote servers (SSE transport)
4. Consider increasing timeout in settings

### AI Not Using Tools

**Problem:** AI ignores available tools

**Solutions:**
1. Verify provider supports tool calling (see supported list above)
2. Use specific prompts: "Use the available tools to..."
3. Check model supports tools:
   - Ollama: Use llama3.2:3b or newer
   - OpenAI: Use gpt-4 or gpt-4-turbo
4. Ensure MCP servers are enabled and healthy

---

## Best Practices

### 1. Organize Information
```markdown
<!-- Store project info -->
```Memory Server
tool: create_entities
entities:
  - name: "daily-notes"
    entityType: "workflow"
    observations: ["Morning routine", "Evening review"]
```

### 2. Use Descriptive Names
```markdown
<!-- Good: Descriptive entity names -->
```Memory Server
tool: create_entities
entities:
  - name: "meeting-2025-01-15-team"
    entityType: "event"
```

### 3. Search Before Creating
```markdown
<!-- Check if entity exists first -->
```Memory Server
tool: search_nodes
query: meeting-2025-01-15
```

### 4. Clean Up Regularly
```markdown
<!-- Remove outdated entities -->
```Memory Server
tool: delete_entities
entityNames: ["temp-note", "old-draft"]
```

---

## Summary

### Quick Reference

| Action | Syntax |
|--------|--------|
| Execute tool | ` ```server-name ` |
| Specify tool | `tool: tool_name` |
| Add parameter | `key: value` |
| Multi-line array | Use YAML list format |
| View result | Switch to Reading Mode |

### Key Points

- ✅ Code blocks execute in **Reading Mode** or **Live Preview**
- ✅ Server name must **match exactly** from settings
- ✅ Use `tool: tool_name` as **first line**
- ✅ Parameters in **YAML format**
- ✅ AI can **automatically use tools** in conversations
- ✅ Results appear **inline** with metadata

### Next Steps

1. **Configure** your MCP servers in settings
2. **Try** the examples in this guide
3. **Experiment** with different tools
4. **Enable** AI autonomous tool usage
5. **Build** your knowledge graph!

---

**Need Help?**
- Check [MCP Architecture](./MCP_ARCHITECTURE.md) for technical details
- See [Manual Ollama Test](./MANUAL_OLLAMA_TEST.md) for AI integration
- Review settings in Obsidian → Tars → MCP Servers

**Happy tool calling! 🚀**
