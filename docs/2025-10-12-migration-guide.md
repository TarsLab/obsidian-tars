# Migration Guide: v3.4.x → v3.5.0

**Target Audience**: Users upgrading from TARS v3.4.x to v3.5.0
**Migration Difficulty**: ✅ Easy (No breaking changes)
**Estimated Time**: 5-15 minutes (basic) to 1 hour (full MCP setup)

---

## Table of Contents

- [Overview](#overview)
- [Pre-Migration Checklist](#pre-migration-checklist)
- [Step 1: Backup Your Configuration](#step-1-backup-your-configuration)
- [Step 2: Upgrade the Plugin](#step-2-upgrade-the-plugin)
- [Step 3: Verify the Upgrade](#step-3-verify-the-upgrade)
- [Step 4: Optional - Configure MCP Servers](#step-4-optional---configure-mcp-servers)
- [Step 5: Optional - Enable Advanced Features](#step-5-optional---enable-advanced-features)
- [Configuration Changes](#configuration-changes)
- [Feature Migration](#feature-migration)
- [Troubleshooting](#troubleshooting)
- [Rollback Instructions](#rollback-instructions)

---

## Overview

### What's Changing?

Version 3.5.0 introduces **Model Context Protocol (MCP) support** as the major new feature. However, **no breaking changes** were introduced—all existing functionality continues to work exactly as before.

**✅ Good News**:
- Your existing settings are preserved
- Tag-based conversations work unchanged
- All AI providers (Claude, OpenAI, Ollama, etc.) continue working
- No manual configuration updates required

**🆕 What's New** (all optional):
- MCP server integration for AI tool calling
- Parallel tool execution
- Smart caching
- Enhanced error handling
- Document-scoped sessions
- Improved UX (tool browser, auto-completion, status display)

**Migration Philosophy**: **Opt-in, not opt-out.** New features are disabled by default. You choose when and how to adopt them.

---

## Pre-Migration Checklist

Before upgrading, verify these prerequisites:

- [ ] **Obsidian Version**: v1.4.0 or later (v1.5.0+ recommended)
- [ ] **Current TARS Version**: v3.4.x (check Settings → Community Plugins → TARS)
- [ ] **Backup Vault**: Create a vault backup (File → Backup vault or manual copy)
- [ ] **Close Open Notes**: Save all open notes
- [ ] **Review Settings**: Take screenshot of TARS settings for reference
- [ ] **Check API Keys**: Ensure AI provider API keys are saved (you'll need them after upgrade)

**Time Estimate**: 2 minutes

---

## Step 1: Backup Your Configuration

### Why Backup?

While v3.5.0 maintains full compatibility, it's always wise to backup settings before any upgrade.

### Backup Methods

#### Method A: Automatic (Recommended)

Obsidian automatically backs up plugin data. No manual action needed.

**Backup Location**: `.obsidian/plugins/obsidian-tars/data.json`

#### Method B: Manual Backup

1. Navigate to your vault folder
2. Open `.obsidian/plugins/obsidian-tars/`
3. Copy `data.json` to a safe location (e.g., Desktop, Dropbox)
4. Rename copy: `data.json.backup.2025-10-12`

**Time Estimate**: 1 minute

---

## Step 2: Upgrade the Plugin

### Option A: Automatic Update (Recommended)

1. Open Obsidian
2. Go to **Settings** (⚙️ icon or `Ctrl/Cmd + ,`)
3. Navigate to **Community Plugins**
4. Click **Check for updates**
5. Find **TARS** in the update list
6. Click **Update** button
7. Wait for "Updated successfully" message
8. **Reload Obsidian**:
   - Desktop: `Ctrl/Cmd + R` or restart Obsidian
   - Mobile: Close and reopen app

**Time Estimate**: 2 minutes

### Option B: Manual Update

1. Download release from GitHub:
   - Visit https://github.com/your-repo/obsidian-tars/releases/tag/v3.5.0
   - Download `obsidian-tars-3.5.0.zip`

2. Extract files:
   - Unzip the archive
   - You should have: `main.js`, `manifest.json`, `styles.css`

3. Replace plugin files:
   - Navigate to `.obsidian/plugins/obsidian-tars/` in your vault
   - **Backup existing files** (optional: rename `main.js` → `main.js.old`)
   - Copy new files to this directory (overwrite when prompted)

4. Reload Obsidian:
   - Desktop: `Ctrl/Cmd + R` or restart Obsidian
   - Mobile: Close and reopen app

**Time Estimate**: 5 minutes

---

## Step 3: Verify the Upgrade

### Verification Checklist

After upgrading, verify everything works correctly:

- [ ] **1. Plugin Enabled**
  - Settings → Community Plugins → TARS shows **v3.5.0**
  - Toggle is **ON** (enabled)

- [ ] **2. Settings Preserved**
  - Settings → TARS
  - Verify API keys still present
  - Verify tags still configured
  - Verify system message preserved

- [ ] **3. Basic Functionality**
  - Create a new note
  - Type `#User : Hello`
  - Type your assistant tag (e.g., `#Claude :`)
  - Press space after assistant tag
  - **Expected**: AI generates response

- [ ] **4. New UI Elements**
  - Status bar at bottom shows character count (existing)
  - Status bar clickable (new: opens status modal)
  - Settings → TARS shows new "MCP Servers" section (new)

- [ ] **5. No Errors**
  - Open Developer Console: `Ctrl/Cmd + Shift + I`
  - Check Console tab for errors
  - **Expected**: No red error messages related to TARS

**Time Estimate**: 3 minutes

**Troubleshooting**: If any verification fails, see [Troubleshooting](#troubleshooting) section below.

---

## Step 4: Optional - Configure MCP Servers

**This step is entirely optional.** Skip if you don't need AI tool calling.

### What Are MCP Servers?

MCP servers provide tools your AI assistant can execute (file operations, database queries, API calls, etc.).

### Quick Start: Add Your First MCP Server

**Example: Filesystem Server** (lets AI read/write files in your vault)

#### 4.1. Install MCP Server

**Option A: Using npx** (no installation needed):
```bash
# No installation required, npx will run it on-demand
```

**Option B: Global Install**:
```bash
npm install -g @modelcontextprotocol/server-filesystem
```

#### 4.2. Add Server to TARS

1. **Open Settings**: Settings → TARS → MCP Servers
2. **Click**: "Add MCP Server" button
3. **Configure**:
   - **Server Name**: `filesystem`
   - **Config Type**: Select **"Shell Command"** from dropdown
   - **Shell Command**:
     ```bash
     npx @modelcontextprotocol/server-filesystem /path/to/your/vault
     ```
     Replace `/path/to/your/vault` with your actual vault path:
     - **macOS**: `/Users/YourName/Documents/ObsidianVault`
     - **Windows**: `C:\Users\YourName\Documents\ObsidianVault`
     - **Linux**: `/home/yourname/Documents/ObsidianVault`
   - **Enable Server**: ✓ (check the box)
4. **Click**: "Save" button

#### 4.3. Verify Server

1. **Check Status Bar**:
   - Should show 🟢 (green) indicator
   - If 🔴 (red), see [Troubleshooting](#troubleshooting)

2. **Browse Tools**:
   - Command Palette (`Ctrl/Cmd + P`) → "Browse MCP Tools"
   - Should see: `read_file`, `write_file`, `list_directory`, etc.

3. **Test with AI**:
   ```markdown
   #User : What files are in my vault's root directory?

   #Claude :
   ```
   - Press space after `#Claude :`
   - **Expected**: AI calls `list_directory` tool and shows results

**Time Estimate**: 5-10 minutes

**Common MCP Servers**: See [Changelog - Popular MCP Servers](./2025-10-12-changelog.md#popular-mcp-servers) for more options.

---

## Step 5: Optional - Enable Advanced Features

### Parallel Tool Execution

**What It Does**: Execute multiple tools simultaneously for faster responses.

**Performance Gain**: 3x speedup for independent tools (300ms vs 900ms for 3 tools).

**How to Enable**:
1. Settings → TARS → MCP Servers
2. Toggle **"Enable Parallel Tool Execution"** → ON
3. Set **"Max Parallel Tools"** → `3` (recommended: 3-5)
4. Click **Save**

**Recommendation**: Enable if you frequently use multiple tools in one AI request.

---

### Provider Connection Testing

**What It Does**: Validate AI provider configurations with "Test" button.

**How to Use**:
1. Settings → TARS → Providers
2. Find your provider (e.g., OpenAI, Claude)
3. Click **"Test"** button next to API Key field
4. **Expected Success**: "✅ Connected! X models available"
5. **Expected Failure**: "❌ Test failed: {helpful error message}"

**Use Cases**:
- Verify API key after upgrade
- Troubleshoot connection issues
- Check provider availability

**Recommendation**: Run once after upgrade to confirm providers still work.

---

### Document-Scoped Sessions

**What It Does**: Track tool execution count per document (prevents infinite loops).

**Configuration**:
1. Settings → TARS → MCP Servers
2. **"Session Limit Per Document"** → `50` (default, adjust as needed)

**Behavior**:
- Each document has independent tool execution counter
- Counter resets when you reopen the document
- Status bar shows: "Document Sessions: X/50"
- Warning at 80% (40/50), alert at 100% (50/50)

**Recommendation**: Leave at default unless you hit limits frequently.

---

### Smart Caching

**What It Does**: Cache tool results to avoid redundant executions (5-minute TTL).

**Configuration**:
- **Automatic**: No configuration needed, works out of the box
- **TTL**: 5 minutes (not configurable in v3.5.0, planned for v3.6.0)

**Management**:
- **View Stats**: Click status bar → View cache statistics
- **Clear Cache**: Command Palette → "Clear MCP Tool Result Cache"

**Cache Indicators**:
```markdown
> [!tool]- Tool Result (123ms) 📦
> Duration: 123ms, Type: json, Cached (2m ago)
```

**Recommendation**: No action needed, caching works automatically.

---

## Configuration Changes

### New Settings (with Safe Defaults)

v3.5.0 adds these settings with defaults that maintain current behavior:

| Setting | Default | Description |
|---------|---------|-------------|
| `mcpServers` | `[]` (empty) | Array of MCP server configurations |
| `mcpConcurrentLimit` | `3` | Max simultaneous tool executions |
| `mcpSessionLimit` | `50` | Max tools per document |
| `mcpToolTimeout` | `30000` | Tool execution timeout (ms) |
| `mcpParallelExecution` | `false` | Enable parallel tool execution (opt-in) |
| `mcpMaxParallelTools` | `3` | Max tools to execute in parallel |
| `uiState.mcpServersExpanded` | `false` | MCP settings section collapsed by default |
| `uiState.systemMessageExpanded` | `false` | System message section collapsed by default |

**Migration**: These settings are automatically added with defaults. No manual configuration needed.

---

### Unchanged Settings

All existing settings are preserved:

- ✅ `apiKeys` (OpenAI, Claude, Ollama, etc.)
- ✅ `userTag`, `systemTag`, `assistantTags`
- ✅ `systemMessage`
- ✅ `enableStreamLog`
- ✅ `statusBar` configuration
- ✅ Provider-specific settings (model, temperature, etc.)

**Migration**: No action needed.

---

### Removed Settings

**None.** No settings were removed in v3.5.0.

---

## Feature Migration

### Existing Features (Unchanged)

These features work exactly as before:

- ✅ **Tag-Based Conversations**: `#User :`, `#Claude :`, `#System :` syntax unchanged
- ✅ **AI Providers**: OpenAI, Claude, Ollama, DeepSeek, Gemini all work unchanged
- ✅ **Streaming**: Real-time response streaming unchanged
- ✅ **Status Bar**: Character count, model info unchanged (now clickable for details)
- ✅ **Settings UI**: Provider configuration unchanged (now with collapsible sections)

**Migration**: Continue using TARS exactly as before.

---

### New Features (Opt-In)

These features are new and entirely optional:

- 🆕 **MCP Tool Calling**: Disabled by default (no MCP servers configured)
- 🆕 **Parallel Execution**: Disabled by default (toggle to enable)
- 🆕 **Smart Caching**: Enabled automatically (no configuration needed)
- 🆕 **Document Sessions**: Enabled automatically (default limit: 50)
- 🆕 **Tool Browser**: Available via Command Palette (requires MCP servers)
- 🆕 **Auto-Completion**: Enabled automatically (requires MCP servers)
- 🆕 **Provider Testing**: Available in settings (click "Test" buttons)

**Migration**: Adopt at your own pace. Start with provider testing, then add MCP servers if needed.

---

## Troubleshooting

### Common Issues

#### Issue 1: Plugin Not Loading After Upgrade

**Symptoms**:
- TARS not visible in Community Plugins list
- Settings not accessible
- No response when using assistant tags

**Solutions**:

**A. Reload Obsidian**:
- Desktop: `Ctrl/Cmd + R` or restart Obsidian
- Mobile: Close and reopen app

**B. Re-enable Plugin**:
- Settings → Community Plugins
- Find **TARS**
- Toggle OFF, wait 2 seconds, toggle ON

**C. Check Console for Errors**:
- Open Developer Console: `Ctrl/Cmd + Shift + I`
- Look for red error messages
- Copy error message and report to GitHub Issues

**D. Reinstall Plugin** (last resort):
- Settings → Community Plugins → TARS → Uninstall
- Restart Obsidian
- Settings → Community Plugins → Browse → Search "TARS" → Install
- **Note**: Your settings are preserved in `data.json`

---

#### Issue 2: Settings Not Preserved

**Symptoms**:
- API keys missing
- Tags reset to defaults
- System message empty

**Solutions**:

**A. Check data.json**:
- Navigate to `.obsidian/plugins/obsidian-tars/`
- Open `data.json` in text editor
- Verify your settings are present

**B. Restore from Backup**:
- If you created a backup in Step 1, restore it:
  - Close Obsidian
  - Copy `data.json.backup.2025-10-12` → `data.json`
  - Open Obsidian
  - Retry upgrade (Settings → Community Plugins → Check for updates)

**C. Manual Reconfiguration**:
- If no backup available, manually re-enter settings:
  - Settings → TARS
  - Re-enter API keys (retrieve from provider dashboards)
  - Reconfigure tags if changed from defaults
  - Restore system message if customized

---

#### Issue 3: MCP Server Not Starting

**Symptoms**:
- Status bar shows 🔴 (red) indicator
- Error modal shows "Server failed to start"
- Tools not available in "Browse MCP Tools"

**Solutions**:

**A. Check Server Command**:
- Settings → TARS → MCP Servers → Click server name
- Verify command syntax:
  - **Correct**: `npx @modelcontextprotocol/server-filesystem /path/to/vault`
  - **Incorrect**: Missing path, wrong package name, typos

**B. Verify Server Installation**:
```bash
# Test if server runs manually
npx @modelcontextprotocol/server-filesystem /path/to/vault
# Should output JSON or error message
# Press Ctrl+C to stop
```

**C. Check Permissions**:
- Ensure TARS has permission to execute commands
- **macOS/Linux**: Server command may need executable permissions
- **Windows**: Antivirus may block npx/node execution

**D. Review Error Logs**:
- Click status bar (when 🔴 red)
- Click error entry to expand details
- Copy error message
- Search error message online or report to GitHub Issues

---

#### Issue 4: AI Not Calling Tools

**Symptoms**:
- MCP server is 🟢 (green) and healthy
- Tools visible in "Browse MCP Tools"
- AI does not call tools during conversations

**Solutions**:

**A. Verify Provider Supports Tool Calling**:
- **Supported**: Claude (Anthropic), OpenAI (GPT-4, GPT-3.5), Ollama (llama3.2+)
- **Not Supported**: DeepSeek, Gemini (in v3.5.0)
- If using unsupported provider, switch to Claude or OpenAI

**B. Use Clear Tool-Related Prompts**:
- **Good**: "List the files in my vault's root directory"
- **Better**: "Use the list_directory tool to show my vault's root files"
- AI needs clear indication that tool use is appropriate

**C. Check Concurrent Limits**:
- Settings → TARS → MCP Servers
- **"Concurrent Limit"** should be ≥1 (default: 3)
- If 0, tools cannot execute

**D. Check Session Limits**:
- Status bar shows "Document Sessions: X/50"
- If X=50, you've hit the limit
- Solutions:
  - Reopen document (resets counter)
  - Increase limit: Settings → TARS → MCP Servers → "Session Limit Per Document"

---

#### Issue 5: Parallel Execution Causing Errors

**Symptoms**:
- Parallel execution enabled
- Some tools fail intermittently
- Error modal shows race condition errors

**Solutions**:

**A. Disable Parallel Execution**:
- Settings → TARS → MCP Servers
- Toggle **"Enable Parallel Tool Execution"** → OFF
- Parallel mode is experimental; sequential mode is more stable

**B. Reduce Parallel Limit**:
- If some tools work in parallel but not others:
  - Settings → TARS → MCP Servers
  - **"Max Parallel Tools"** → Reduce from `3` to `2` or `1`

**C. Check Server Thread Safety**:
- Some MCP servers are not thread-safe
- Consult server documentation
- Use sequential mode for non-thread-safe servers

---

#### Issue 6: Cache Not Working

**Symptoms**:
- Tool results don't show 📦 indicator
- Same tool+parameters execute multiple times

**Solutions**:

**A. Verify Cache is Enabled**:
- Caching is automatic in v3.5.0, cannot be disabled

**B. Check Parameter Matching**:
- Cache key includes parameters
- Different parameter *values* = different cache entry
- Different parameter *order* = same cache entry (order-independent)

**C. Check TTL**:
- Cache expires after 5 minutes
- If tool was called >5 minutes ago, cache miss is expected

**D. Clear and Retry**:
- Command Palette → "Clear MCP Tool Result Cache"
- Retry tool execution
- If still no 📦 indicator after second identical execution, report issue

---

### Getting Help

If troubleshooting doesn't resolve your issue:

1. **Search Existing Issues**:
   - Visit https://github.com/your-repo/obsidian-tars/issues
   - Search for your error message or symptom

2. **Create New Issue**:
   - Include:
     - TARS version (v3.5.0)
     - Obsidian version
     - Operating system
     - Steps to reproduce
     - Error messages (copy from error modal or console)
     - Screenshots (if applicable)

3. **Join Community**:
   - Discord: https://discord.gg/your-server
   - Ask in #support channel

---

## Rollback Instructions

If you encounter critical issues and need to rollback to v3.4.x:

### Step 1: Backup Current data.json

Even when rolling back, backup your current settings in case you want to re-upgrade later:

```bash
# Navigate to plugin folder
cd .obsidian/plugins/obsidian-tars/

# Backup current settings
cp data.json data.json.v3.5.0.backup
```

### Step 2: Restore v3.4.x

**Option A: Use Backup (if available)**:

1. Close Obsidian
2. Navigate to `.obsidian/plugins/obsidian-tars/`
3. Restore files:
   - Copy your v3.4.x backup files (`main.js.old`, etc.) → replace current files
   - **OR** Copy your v3.4.x `data.json.backup` → `data.json`
4. Open Obsidian
5. Verify version: Settings → Community Plugins → TARS should show v3.4.x

**Option B: Reinstall v3.4.x**:

1. **Uninstall TARS**:
   - Settings → Community Plugins → TARS → Uninstall
2. **Download v3.4.x**:
   - Visit https://github.com/your-repo/obsidian-tars/releases/tag/v3.4.x
   - Download release files
3. **Manual Install**:
   - Extract files
   - Copy to `.obsidian/plugins/obsidian-tars/`
4. **Reload Obsidian**: `Ctrl/Cmd + R`

### Step 3: Reconfigure (if needed)

If settings were lost during rollback:

1. **Restore data.json from v3.4.x backup** (if available):
   - Copy `data.json.backup.v3.4.x` → `data.json`

2. **OR manually reconfigure**:
   - Re-enter API keys
   - Reconfigure tags (if changed from defaults)
   - Restore system message

### Step 4: Report Issue

Please report the issue that required rollback:

- GitHub Issues: https://github.com/your-repo/obsidian-tars/issues
- Include:
  - Why you rolled back
  - Error messages or symptoms
  - Steps to reproduce issue

This helps improve future releases.

---

## Migration Complete!

**Congratulations!** You've successfully upgraded to TARS v3.5.0.

### Next Steps

**Immediate**:
- [ ] Verify basic AI conversations still work
- [ ] Test provider connection buttons (optional)
- [ ] Explore new settings UI (collapsible sections)

**Short-Term** (when ready to adopt MCP):
- [ ] Read [MCP Quick Start Guide](./MCP_QUICK_START.md)
- [ ] Add your first MCP server (filesystem recommended)
- [ ] Try AI tool calling with simple prompts
- [ ] Browse available tools with "Browse MCP Tools" command

**Long-Term**:
- [ ] Explore additional MCP servers (GitHub, database, search, etc.)
- [ ] Enable parallel execution for faster responses
- [ ] Monitor cache statistics for performance insights
- [ ] Provide feedback on new features

### Learning Resources

- **Changelog**: [v3.5.0 Changelog](./2025-10-12-changelog.md)
- **MCP User Guide**: [MCP_USER_GUIDE.md](./MCP_USER_GUIDE.md)
- **MCP Quick Start**: [MCP_QUICK_START.md](./MCP_QUICK_START.md)
- **Architecture**: [MCP_ARCHITECTURE.md](./MCP_ARCHITECTURE.md)
- **Community**: [Discord](https://discord.gg/your-server)

---

## Feedback Welcome

Your feedback helps improve TARS for everyone.

**What went well?**
- Easy upgrade process?
- Features working as expected?
- Documentation helpful?

**What could be better?**
- Migration pain points?
- Confusing documentation?
- Feature requests?

**Share feedback**:
- GitHub Discussions: https://github.com/your-repo/obsidian-tars/discussions
- Discord: https://discord.gg/your-server (#feedback channel)
- Email: support@your-domain.com

---

**Thank you for using TARS! Enjoy the MCP-powered future of AI assistance in Obsidian.** 🚀

---

**Document Status**: ✅ Complete
**Target Version**: v3.5.0
**Last Updated**: 2025-10-12
