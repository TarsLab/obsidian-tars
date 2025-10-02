# MCP Test Button Fix

**Date**: 2025-10-02
**Status**: ✅ Fixed

---

## Problem

The Test button was showing incorrect error messages that didn't match the server being tested.

**Example Issue**:
- User tests "exa-search" server
- Notification shows: "Check Docker is running and image is available: docker pull mcp/memory:latest"
- This is completely wrong - exa-search doesn't use Docker or memory server!

**Root Cause**:
The Test button implementation had hardcoded error messages from an old implementation that assumed all servers used Docker and the memory server.

---

## Solution

Completely rewrote the Test button to create an **independent test client** for each server.

### New Implementation

**File**: [src/settingTab.ts:454-530](src/settingTab.ts#L454)

#### Key Changes:

1. **Validate Configuration First**
   - Checks if `configInput` is valid before attempting connection
   - Shows clear validation errors immediately

2. **Create Isolated Test Client**
   - Uses `MCPClient.fromDict()` to create a temporary client
   - **Only** includes the server being tested
   - No interference from other configured servers

3. **Direct Session Creation**
   - Creates session with `testClient.createSession(server.id, true)`
   - Auto-connects by passing `true` as second parameter
   - Accesses tools directly from `session.connector.tools`

4. **Dynamic Error Messages**
   - Analyzes server configuration to provide context-aware help
   - For Docker configs: "Make sure Docker is running"
   - For npx/uvx configs: "Check package is installed and env vars are set"
   - Shows server name and config preview

5. **Proper Cleanup**
   - Disconnects test session after use
   - No lingering connections or resources

---

## Implementation Details

### Before (Broken):
```typescript
// Tried to use global MCP manager
await this.plugin.mcpManager.startServer(server.id)
const client = this.plugin.mcpManager.getClient(server.id)

// Hardcoded error message
new Notice(
  `❌ ${server.name}: Not connected\n` +
  `Check Docker is running and image is available:\n` +
  `docker pull mcp/memory:latest`,  // WRONG!
  10000
)
```

**Problems**:
- Depended on server being enabled
- Could return wrong client if IDs mismatched
- Hardcoded Docker/memory error message
- Didn't clean up after test

### After (Fixed):
```typescript
// Create independent test client
const { MCPClient } = await import('mcp-use')
const testConfig = {
  mcpServers: {
    [server.id]: {
      command: parsed.mcpUseConfig.command,
      args: parsed.mcpUseConfig.args || [],
      env: parsed.mcpUseConfig.env
    }
  }
}
const testClient = MCPClient.fromDict(testConfig)

// Create and connect session
const session = await testClient.createSession(server.id, true)

// Get tools directly
const tools = (session.connector as any).tools || []
const toolCount = tools.length
const toolNames = tools.slice(0, 3).map((t: any) => t.name).join(', ')

new Notice(
  `✅ ${server.name}: Connected!\n${toolCount} tools: ${toolNames}...`,
  8000
)

// Cleanup
await session.disconnect()
```

**Benefits**:
✅ Independent test (no cross-server interference)
✅ Works regardless of enabled/disabled state
✅ Shows actual server name and tool count
✅ Dynamic, context-aware error messages
✅ Proper cleanup

---

## Error Message Improvements

### Dynamic Help Text Logic:

```typescript
let helpText = ''
if (server.configInput.includes('docker')) {
  helpText = '\nTip: Make sure Docker is running'
} else if (server.configInput.includes('npx') || server.configInput.includes('uvx')) {
  helpText = '\nTip: Check package is installed and env vars are set'
}

new Notice(
  `❌ ${server.name}: Test failed\n${msg}${helpText}`,
  10000
)
```

### Example Outputs:

**Docker-based server fails**:
```
❌ filesystem: Test failed
Error: spawn docker ENOENT
Tip: Make sure Docker is running
```

**npx-based server fails**:
```
❌ exa-search: Test failed
Error: ECONNREFUSED
Tip: Check package is installed and env vars are set
```

**Invalid configuration**:
```
❌ my-server: Invalid configuration
SSE transport (URLs) not yet supported. Use command or JSON format.
```

---

## Testing

### Manual Test Scenarios

1. **Test exa-search server**
   - Should show: "Testing exa-search..."
   - On success: "✅ exa-search: Connected! 5 tools: search, find_similar, get_contents..."
   - On failure: Error specific to exa-search config

2. **Test filesystem server**
   - Should show: "Testing filesystem..."
   - On success: "✅ filesystem: Connected! 8 tools: read_file, write_file, list_directory..."
   - On failure: Error specific to filesystem config

3. **Test disabled server**
   - Should still work! (doesn't require server to be enabled)
   - Creates temporary client just for the test

4. **Test invalid configuration**
   - Shows validation error immediately
   - Doesn't attempt connection

### Automated Tests
```
✅ 11 test files passed
✅ 88 tests passed
✅ Build: Clean (1.8M)
```

---

## User Experience Improvements

### Before ❌
- Confusing error messages
- Wrong server names in errors
- Hardcoded assumptions about Docker/memory
- No way to test disabled servers
- No validation feedback

### After ✅
- Clear, server-specific messages
- Correct server names always shown
- Context-aware help text
- Can test any server (enabled or not)
- Immediate validation feedback

---

## Technical Notes

### Why Independent Test Client?

The original implementation tried to use the global `MCPServerManager`, which:
- Requires servers to be enabled
- Shares state across all servers
- Could mix up server IDs
- Doesn't isolate test failures

The new implementation creates a **disposable test client** that:
- Only knows about the server being tested
- Doesn't affect global state
- Can't mix up server IDs
- Properly cleans up after itself

### MCP-Use API Usage

Correct pattern for testing:
```typescript
// 1. Create client with config dictionary
const client = MCPClient.fromDict({
  mcpServers: {
    [serverId]: { command, args, env }
  }
})

// 2. Create session (auto-connect = true)
const session = await client.createSession(serverId, true)

// 3. Access tools via connector
const tools = session.connector.tools

// 4. Cleanup
await session.disconnect()
```

---

## Files Modified

1. **[src/settingTab.ts](src/settingTab.ts)** (lines 454-530)
   - Rewrote Test button onClick handler
   - Added validation before test
   - Create independent test client
   - Dynamic error messages
   - Proper cleanup

---

## Summary

**Problem**: Test button showed wrong error messages and tested wrong servers

**Solution**: Create independent test client for each server

**Impact**:
- ✅ Accurate error messages
- ✅ Correct server always tested
- ✅ Works for disabled servers
- ✅ Better user feedback
- ✅ Proper resource cleanup

**Status**: ✅ Fixed, tested, and deployed

🎉 **Test button now works correctly!**
