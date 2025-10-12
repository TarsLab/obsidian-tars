# MCP Tools - Quick Start Guide

## 🚀 5-Minute Setup

### 1. Add Server (Settings → Tars → MCP Servers)

```
Server Name: Memory Server
Server ID: memory-server
Transport: stdio
Deployment: managed
Docker Image: mcp/memory:latest
✅ Enabled: ON
```

### 2. Use in Document

````markdown
```Memory Server
tool: create_entities
entities:
  - name: "my-first-note"
    entityType: "note"
    observations: ["Testing MCP tools"]
```
````

### 3. Switch to Reading Mode

Result appears automatically! ✨

---

## 📝 Common Tools (mcp/memory)

### Store Information
````markdown
```Memory Server
tool: create_entities
entities:
  - name: "project-name"
    entityType: "project"
    observations: ["Details here"]
```
````

### Read Everything
````markdown
```Memory Server
tool: read_graph
```
````

### Search
````markdown
```Memory Server
tool: search_nodes
query: project
```
````

### Add Notes
````markdown
```Memory Server
tool: add_observations
entityName: project-name
contents:
  - "New information"
  - "More details"
```
````

---

## 🤖 AI Auto-Tools

**With Ollama (llama3.2) / OpenAI / Claude:**

```markdown
#Ollama : Remember I'm working on obsidian-tars project
```

AI automatically stores it using MCP tools! 🎉

Later:
```markdown
#Ollama : What project am I working on?
```

AI retrieves from memory! 🧠

---

## ✅ Checklist

- [ ] Docker installed and running
- [ ] `docker pull mcp/memory:latest`
- [ ] Server configured in Tars settings
- [ ] Server enabled (toggle ON)
- [ ] Container running: `docker ps`
- [ ] Try example in Reading Mode

---

## 🆘 Quick Fixes

**Not working?**
1. Server name must match exactly
2. Switch to Reading Mode
3. Check: `docker ps | grep memory`
4. Review Settings → MCP Servers → Status

**Full guide:** [MCP_USER_GUIDE.md](./MCP_USER_GUIDE.md)
