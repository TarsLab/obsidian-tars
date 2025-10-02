# MCP Tools Not Visible - Troubleshooting Guide

## Problem
Ollama doesn't see MCP tools even after integration fix.

## Root Cause
**MCP servers must be ENABLED and CONNECTED** for tools to be visible to LLMs.

---

## Diagnostic Checklist

### 1. Check Server Status
Open MCP Server Status modal (click status bar) and verify:

- [ ] **Running servers > 0**
  - Current: 0 / 2 servers ❌
  - Expected: At least 1 server running ✅

- [ ] **Available Tools > 0**
  - Current: 0 tools ❌
  - Expected: 5+ tools for exa-search ✅

- [ ] **Server Status**
  - ❌ RED dot = Disconnected/Failed
  - ⚪ WHITE dot = Disabled
  - ✅ GREEN checkmark = Connected

### 2. Server Must Be Enabled

**Critical**: In settings, toggle the server to **Enabled**:

```
Settings > MCP Servers > exa-search
┌──────────────────────────────┐
│ Controls                      │
│ [Disable] [Test] [Delete]    │ ← Must show "Disable" (currently enabled)
└──────────────────────────────┘
```

If button shows "Enable", click it to enable the server.

### 3. Code Flow

```
Plugin Load
  └→ initialize(this.settings.mcpServers)
      └→ partitionConfigs(configs)
          └→ if (config.enabled) { ← FILTER HERE!
                 mcpUseConfigs.push(config)
             }
      └→ for (config of mcpUseConfigs) { ← Only enabled servers
             createSession(config.id)    ← Start server
         }
```

**Result**: Only **enabled** servers are started during initialization.

---

## Solution Steps

### Step 1: Enable the Server

1. Open Obsidian Settings
2. Navigate to Community Plugins → Tars → MCP Servers
3. Find "exa-search" server
4. Click **Enable** button (changes to "Disable")

### Step 2: Test Connection

Click **Test** button for exa-search:
- ✅ Success: "Connected! 5 tools: search, find_similar, ..."
- ❌ Failure: Check error message (API key, network, etc.)

### Step 3: Reload Plugin (If Needed)

If server was just enabled, MCP manager might need restart:

**Option A: Restart Obsidian** (safest)
- Close and reopen Obsidian
- Servers will initialize on plugin load

**Option B: Reload Plugin** (if supported)
- Cmd/Ctrl + P → "Reload app without saving"

### Step 4: Verify in Status Bar

Click Tars status bar to see:
```
Running: 1 / 2 servers  ← Should be > 0
Available Tools: 5      ← Should be > 0
```

### Step 5: Test with Ollama

```markdown
#User : How many tools do you have?

#Ollama :
```

Expected response: Lists MCP tools (search, find_similar, etc.)

---

## Common Issues

### Issue 1: Server Enabled But Still Disconnected

**Symptoms:**
- Server shows as "Enabled" but red dot (disconnected)
- Test button shows error

**Causes:**
- Missing API key (for exa-search: `EXA_API_KEY`)
- Package not installed
- Network issues
- Invalid configuration

**Fix:**
1. Check error in Test button output
2. Set environment variable if needed:
   ```bash
   # For exa-search
   export EXA_API_KEY=your_api_key_here
   ```
3. Restart Obsidian after setting env vars

### Issue 2: Filesystem Server Disabled

**Symptoms:**
- Shows white dot (disabled)

**Fix:**
1. Enable the server
2. Update path: `npx -y @modelcontextprotocol/server-filesystem /path/to/allowed/folder`
3. Test connection

### Issue 3: Tools Still Not Visible After Enabling

**Symptoms:**
- Server shows connected
- Status bar shows "Available Tools: 5"
- But Ollama still doesn't see them

**Possible Causes:**
1. **Plugin not reloaded** - Restart Obsidian
2. **Old editor instance** - Create new note or reload
3. **Cache issue** - Clear and rebuild

**Fix:**
1. Restart Obsidian completely
2. Open a fresh note
3. Test again

---

## Debug Information

### Check Console Logs

Open Developer Tools (Cmd/Ctrl + Shift + I) → Console:

**Good indicators:**
```
MCP integration initialized with 2 servers
[MCP Manager] Server exa-search started successfully
```

**Bad indicators:**
```
Failed to initialize MCP integration: ...
[MCP Manager] Server exa-search failed: ...
```

### Check MCP Manager State

In console, type:
```javascript
app.plugins.plugins['obsidian-tars'].mcpManager.listServers()
```

Should return enabled servers with their configs.

### Check Tools Available

In console:
```javascript
const manager = app.plugins.plugins['obsidian-tars'].mcpManager
const client = manager.getClient('mcp-exa-...')
const tools = await client.listTools()
console.log(tools)
```

Should show array of tool objects.

---

## Architecture Notes

### When Servers Start

```
1. Plugin.onload()
   └→ if (settings.mcpServers.length > 0)
       └→ mcpManager.initialize(settings.mcpServers)
           └→ partitionConfigs(servers)
               └→ Filter: only enabled servers
           └→ Create MCPClient with enabled servers
           └→ Create sessions for each enabled server
```

### When Tools Are Injected

```
1. User types #Ollama : <message>
   └→ generate(..., mcpManager, mcpExecutor)
       └→ provider.options.mcpManager = mcpManager
       └→ vendor.sendRequestFunc(provider.options)
           └→ Ollama provider:
               └→ injectMCPTools(params, 'Ollama', manager, executor)
                   └→ buildToolsForProvider('Ollama', manager, executor)
                       └→ Get all running servers
                       └→ Get tools from each server
                       └→ Format for Ollama
                       └→ Inject into request
```

**Critical**: If no servers are running, `buildToolsForProvider()` returns empty array!

---

## Quick Checklist

Before reporting "tools not visible":

- [ ] Server is **enabled** (not disabled)
- [ ] Server is **connected** (green checkmark, not red dot)
- [ ] Status bar shows **Available Tools > 0**
- [ ] **Restarted Obsidian** after enabling server
- [ ] Environment variables set (if needed)
- [ ] Test button succeeds
- [ ] Fresh note (not old editor instance)

---

## Summary

**The #1 Cause**: Servers not enabled in settings!

**Solution**:
1. Enable the server
2. Test connection
3. Restart Obsidian
4. Verify tools in status bar
5. Test with Ollama

🎯 **Next Steps**: Enable exa-search server and test connection!
