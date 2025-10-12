# MCP Tool Error Handling Documentation

**Last Updated**: 2025-10-04
**Status**: Production Ready
**Test Coverage**: 279+ tests passing

## Overview

The MCP integration implements comprehensive error handling to ensure tool failures never block LLM responses. When tools fail, errors are caught, logged, formatted for the LLM, and the conversation continues gracefully.

## Error Flow Architecture

```
┌─────────────────┐
│ LLM Requests    │
│ Tool Execution  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ ToolCallingCoordinator.generateWithTools │
│ (src/mcp/toolCallingCoordinator.ts)     │
└────────┬────────────────────────────────┘
         │
         ▼
┌──────────────────┐
│ ToolExecutor     │◄──────┐
│ executeTool()    │       │
└────────┬─────────┘       │
         │                 │
    ┌────▼────┐            │
    │ Success │            │
    └────┬────┘            │
         │              ┌──┴───┐
         │              │ Error│
         │              └──┬───┘
         │                 │
         ▼                 ▼
┌──────────────────────────────────────┐
│ 1. Log to StatusBarManager           │
│    - Error type: 'tool'               │
│    - Context: serverId, toolName      │
│    - Sanitized params (keys only)     │
└──────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ 2. Format error for LLM              │
│    {                                  │
│      error: "error message",          │
│      contentType: "json"              │
│    }                                  │
└──────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ 3. Add to conversation history       │
│    LLM sees error in next turn       │
└──────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ 4. LLM generates response            │
│    - Acknowledges error               │
│    - Provides alternative             │
│    - Continues conversation           │
└──────────────────────────────────────┘
```

## Error Capture Points

### 1. MCP Server Errors

**Location**: [`src/mcp/managerMCPUse.ts`](../src/mcp/managerMCPUse.ts)

**Scenarios**:
- Server fails to start during initialization (line 97-103)
- Server fails after retry attempts (line 169-178)
- Server fails to stop cleanly (line 199-205)

**Error Context Logged**:
```typescript
{
  serverId: string,
  serverName: string,
  configInput: string,
  failureCount?: number,
  maxRetries?: number
}
```

**User Impact**:
- Error logged to status bar error buffer
- Click status bar to see full error details
- Server auto-disabled after 3 failures (configurable)

### 2. Tool Execution Errors

**Location**: [`src/mcp/executor.ts`](../src/mcp/executor.ts)

**Scenarios**:
- Tool execution fails (network, timeout, invalid params)
- Server disconnects mid-execution
- Resource limits exceeded

**Error Context Logged** (line 115-125):
```typescript
{
  serverId: string,
  serverName: string,
  toolName: string,
  source: 'user-codeblock' | 'ai-autonomous',
  documentPath: string,
  parameterKeys: string[]  // SANITIZED - no values!
}
```

**Security**: Parameter values (API keys, passwords, etc.) are **NOT** logged

### 3. AI Conversation Tool Errors

**Location**: [`src/mcp/toolCallingCoordinator.ts`](../src/mcp/toolCallingCoordinator.ts)

**Scenarios**:
- Tool fails during autonomous LLM execution
- Multiple tools in sequence with failures
- Tool server unavailable

**Error Handling** (line 183-204):
1. Error caught in try-catch block
2. Logged to status bar with context
3. Formatted as tool result message
4. Added to conversation for LLM
5. **Conversation continues** - LLM sees error and responds

**Error Format for LLM**:
```typescript
{
  role: 'tool',
  content: JSON.stringify({ error: errorMessage }),
  tool_call_id: originalCallId
}
```

## Error Types and Icons

| Type | Icon | Description | Example |
|------|------|-------------|---------|
| `generation` | 🤖 | LLM API errors | Rate limit, invalid API key |
| `mcp` | 🔌 | MCP server errors | Server start failed, connection lost |
| `tool` | 🔧 | Tool execution errors | Timeout, invalid parameters |
| `system` | ⚙️ | Plugin system errors | Configuration error, initialization failure |

## Expected LLM Behavior on Tool Failure

### Scenario 1: Tool Returns Error

**What Happens**:
1. User asks: "What files are in /src?"
2. LLM calls `list_directory` tool
3. Tool fails: "Permission denied"
4. Error formatted and sent to LLM
5. LLM responds: "I couldn't access that directory due to permissions. Would you like me to try a different approach?"

**Test**: [`tests/e2e/toolFailureRecovery.test.ts:92-159`](../tests/e2e/toolFailureRecovery.test.ts#L92-L159)

### Scenario 2: Tool Times Out

**What Happens**:
1. User asks: "Search the web for latest news"
2. LLM calls `web_search` tool
3. Tool times out after 30s
4. Timeout error sent to LLM
5. LLM responds: "The search timed out. Let me provide information from my training data instead."

**Test**: [`tests/e2e/toolFailureRecovery.test.ts:92-159`](../tests/e2e/toolFailureRecovery.test.ts#L92-L159)

### Scenario 3: Server Disconnects

**What Happens**:
1. User asks: "Store this in memory"
2. LLM calls `store_memory` tool
3. Memory server crashes mid-execution
4. Disconnection error sent to LLM
5. LLM responds: "The memory server disconnected. I've noted your request but couldn't persist it. Would you like to try again?"

**Test**: [`tests/e2e/toolFailureRecovery.test.ts:161-227`](../tests/e2e/toolFailureRecovery.test.ts#L161-L227)

### Scenario 4: Invalid Parameters

**What Happens**:
1. User asks: "Read the config file"
2. LLM calls `read_file` with missing required parameter
3. Validation error sent to LLM
4. LLM calls tool again with corrected parameters
5. Tool succeeds, LLM provides answer

**Test**: [`tests/e2e/toolFailureRecovery.test.ts:229-318`](../tests/e2e/toolFailureRecovery.test.ts#L229-L318)

## User-Visible Impact

### When Tool Fails

**What User Sees**:
1. **In Document**: LLM's text response acknowledging the error
2. **In Status Bar**: Can click to see error details
3. **In Error Modal**: Full error log with stack traces

**What User Does NOT See**:
- Raw tool execution errors (hidden from conversation flow)
- Sensitive parameter values in error logs
- Technical stack traces in LLM response

### Error Recovery Flow

```markdown
#user : Can you list the files in /restricted?

#assistant : 
[🔧 Tool: list_directory](mcp://filesystem/list_directory)
```json
{
  "path": "/restricted"
}
```

**Result** (45ms):
<details>
<summary>View Result</summary>

```json
{
  "error": "Permission denied: /restricted"
}
```
</details>

I couldn't access the /restricted directory due to permission constraints. 
This directory requires elevated privileges. Would you like me to:
1. List files in a different directory
2. Help you understand the permission requirements
3. Suggest alternative approaches
```

## Testing Error Scenarios

### Unit Tests

**File**: [`tests/integration/errorLogging.test.ts`](../tests/integration/errorLogging.test.ts)

Tests verify:
- ✅ Error logging with correct context
- ✅ Parameter sanitization (no sensitive values)
- ✅ Ring buffer behavior (max 50 entries)
- ✅ All error types logged correctly

### E2E Tests

**File**: [`tests/e2e/toolFailureRecovery.test.ts`](../tests/e2e/toolFailureRecovery.test.ts)

Tests validate:
- ✅ Tool timeout → LLM continues
- ✅ Server disconnection → LLM handles gracefully
- ✅ Invalid parameters → LLM corrects and retries
- ✅ Tool unavailable → LLM works without it
- ✅ Multiple failures → Conversation never stuck

### Manual Testing Checklist

1. **Server Failure During Generation**
   - Start generation with MCP tools enabled
   - Stop MCP server during execution
   - Verify: LLM acknowledges disconnection, continues response
   - Check: Error appears in status bar log

2. **Invalid Tool Parameters**
   - Trigger LLM to call tool with missing required parameter
   - Verify: LLM sees validation error
   - Check: LLM corrects parameters and retries
   - Result: Final response includes corrected tool output

3. **Multiple Tool Failures**
   - Configure multiple MCP servers
   - Disable/crash servers during multi-tool workflow
   - Verify: LLM completes response despite failures
   - Check: All errors logged to status bar

4. **Error Log Access**
   - Trigger various errors (server start, tool execution)
   - Click status bar when in error state
   - Verify: ErrorDetailModal shows all recent errors
   - Check: "Copy All Logs" button works

5. **Parameter Sanitization**
   - Execute tool with sensitive parameters (API key, password)
   - Check error log via status bar
   - Verify: Only parameter keys shown, no values

## Implementation Details

### Error Logging

**StatusBarManager** maintains a ring buffer of errors:

```typescript
class StatusBarManager {
  private errorLog: ErrorLogEntry[] = []
  private maxErrorLogSize = 50

  logError(type: ErrorLogType, message: string, error?: Error, context?: any) {
    errorLog.unshift({  // Most recent first
      id: uniqueId,
      timestamp: new Date(),
      type,
      message,
      name: error?.name,
      stack: error?.stack,
      context
    })
    
    if (errorLog.length > 50) {
      errorLog = errorLog.slice(0, 50)  // Keep only 50 most recent
    }
  }
}
```

### Parameter Sanitization

**ToolExecutor** logs only parameter keys:

```typescript
// GOOD: Sanitized logging
this.statusBarManager?.logError('tool', `Tool execution failed: ${toolName}`, error, {
  serverId,
  toolName,
  parameterKeys: Object.keys(parameters)  // Keys only!
})

// BAD: Would expose secrets
// parameters: parameters  // ❌ Never log full parameters!
```

### Error Formatting for LLM

**ToolCallingCoordinator** formats errors as tool results:

```typescript
catch (error) {
  // Error becomes a tool result message
  const errorMessage = adapter.formatToolResult(toolCall.id, {
    content: { error: error.message },
    contentType: 'json',
    executionDuration: 0
  })
  conversation.push(errorMessage)
  // LLM sees this in next turn and can respond appropriately
}
```

## Configuration

### Retry Policy

Control how tool failures are retried:

```typescript
// Settings
mcpRetryMaxAttempts: 5      // Max retry attempts
mcpRetryInitialDelay: 1000  // Initial delay (ms)
mcpRetryMaxDelay: 30000     // Max delay (ms)
mcpRetryBackoffMultiplier: 2 // Exponential factor
mcpRetryJitter: true        // Add randomness
```

### Failure Threshold

Control when servers auto-disable:

```typescript
// Settings
mcpFailureThreshold: 3  // Auto-disable after 3 consecutive failures
```

## Debugging Production Errors

### Step 1: Access Error Log

1. Look at status bar (bottom right)
2. If error state (🔴 icon), click status bar
3. ErrorDetailModal opens with full log

### Step 2: Copy Error Details

- **Copy Current Error**: Copies just the current error
- **Copy All Logs**: Copies all 50 recent errors as JSON
- **Individual Copy**: Click copy button on specific error

### Step 3: Analyze Context

Each error includes:
- **Timestamp**: When it occurred
- **Type**: generation/mcp/tool/system
- **Message**: Human-readable description
- **Stack**: Full stack trace
- **Context**: Debugging information
  - Server IDs, tool names
  - Document paths, execution source
  - Parameter keys (never values)

### Step 4: Report Issue

Copy error log and include in bug report with:
- Steps to reproduce
- Expected vs actual behavior
- Obsidian version
- Plugin version
- MCP server configuration (sanitized)

## Security Considerations

### What Is Logged

✅ **Safe to Log**:
- Error messages and types
- Server IDs and names
- Tool names
- Parameter keys (field names)
- Document paths
- Execution metadata (duration, timestamps)

❌ **Never Logged**:
- Parameter values (may contain secrets)
- API keys, passwords, tokens
- User data in parameters
- File contents from tool results

### Example: Sanitized Logging

```typescript
// Tool called with:
{
  toolName: 'api_call',
  parameters: {
    apiKey: 'sk-secret-key-123',
    endpoint: 'https://api.example.com',
    data: { userId: 'user@email.com' }
  }
}

// Error log contains:
{
  type: 'tool',
  message: 'Tool execution failed: api_call',
  context: {
    toolName: 'api_call',
    parameterKeys: ['apiKey', 'endpoint', 'data']  // Keys only!
    // NO VALUES LOGGED
  }
}
```

## Code References

### Core Files

| File | Purpose | Error Handling |
|------|---------|----------------|
| [`toolCallingCoordinator.ts`](../src/mcp/toolCallingCoordinator.ts#L183-L204) | Orchestrates multi-turn loop | Catches tool errors, formats for LLM, continues conversation |
| [`executor.ts`](../src/mcp/executor.ts#L108-L125) | Executes tools | Logs errors with sanitized params, updates execution record |
| [`managerMCPUse.ts`](../src/mcp/managerMCPUse.ts#L97-L103) | Manages servers | Logs server failures with config context |
| [`statusBarManager.ts`](../src/mcp/statusBarManager.ts#L469-L501) | Error logging | Ring buffer, copy functionality, error modal |

### Test Files

| File | Coverage | Purpose |
|------|----------|---------|
| [`errorLogging.test.ts`](../tests/integration/errorLogging.test.ts) | 11 tests | Validates error logging with context and sanitization |
| [`toolFailureRecovery.test.ts`](../tests/e2e/toolFailureRecovery.test.ts) | 8 tests | Validates LLM continues after tool failures |
| [`cancellation.test.ts`](../tests/mcp/cancellation.test.ts) | 12 tests | Validates cancellation doesn't log as error |

## FAQ

### Q: Why don't I see tool errors in the LLM response?

**A**: Tool errors are handled transparently. The LLM receives the error and incorporates it into its response naturally. Check the status bar error log for technical details.

### Q: How do I know if a tool failed?

**A**: Look for these indicators:
1. Status bar shows error state (🔴)
2. LLM response mentions tool unavailability or errors
3. Click status bar to see error details
4. Tool result markdown shows error in `<details>` block

### Q: Can I retry a failed tool?

**A**: Yes, in two ways:
1. **Automatic**: LLM may retry with corrected parameters (e.g., validation errors)
2. **Manual**: Re-run the code block in reading mode, or ask LLM again

### Q: Will tool failures prevent my document from being generated?

**A**: No. Tool failures are gracefully handled:
- Error passed to LLM
- LLM continues and provides best response without tool
- Document generation completes normally
- User never stuck in error state

### Q: How long are errors kept in the log?

**A**: The error buffer maintains the **50 most recent errors**. Older errors are automatically removed (ring buffer behavior).

### Q: Can I see parameter values in error logs?

**A**: No, for security reasons. Only parameter keys (field names) are logged. This prevents sensitive data (API keys, passwords) from appearing in logs.

## Best Practices

### For Users

1. **Check Status Bar First**: Click status bar on error for details
2. **Copy Logs for Support**: Use "Copy All Logs" button for bug reports
3. **Enable Retry**: Configure retry attempts in settings for flaky servers
4. **Monitor Health**: Status bar shows server health (running/retrying/failed)

### For Developers

1. **Always Use StatusBarManager**: Pass through all MCP components
2. **Sanitize Parameters**: Log keys only, never values
3. **Include Context**: Add serverId, toolName, documentPath
4. **Test Error Paths**: Write tests for failure scenarios
5. **Follow Error Types**: Use correct type (generation/mcp/tool/system)

## Changelog

### 2025-10-04: Comprehensive Error Logging

- ✅ Added error log buffer to StatusBarManager
- ✅ Enhanced ErrorDetailModal with full log display
- ✅ Integrated error logging in manager, executor, coordinator
- ✅ Implemented parameter sanitization for security
- ✅ Created 19 tests for error handling validation
- ✅ All 279 tests passing

### Previously

- Error handling existed but not logged centrally
- No parameter sanitization
- Limited visibility for debugging

## Summary

The MCP error handling system ensures:

1. **Resilience**: Tool failures never block LLM responses
2. **Transparency**: All errors logged and accessible
3. **Security**: Sensitive data never logged
4. **Debuggability**: Rich context for troubleshooting
5. **User Experience**: Graceful degradation, helpful error messages

**Result**: Users get helpful responses even when tools fail, with full error visibility for debugging.


## Examples:

### Error report

```json
[
  {
    "timestamp": "2025-10-04T13:20:17.033Z",
    "type": "mcp",
    "name": "McpError",
    "message": "Failed to start MCP server: exa-search",
    "stack": "McpError: MCP error -32000: Connection closed\n    at Zu._onclose (plugin:tars:312:10767)\n    at _transport.onclose (plugin:tars:312:10296)\n    at ChildProcess.eval (plugin:tars:318:1776)\n    at ChildProcess.emit (node:events:518:28)\n    at KNe.r.emit (plugin:tars:316:29733)\n    at maybeClose (node:internal/child_process:1104:16)\n    at ChildProcess._handle.onexit (node:internal/child_process:304:5)",
    "context": {
      "serverId": "mcp-exa-1759388017498",
      "serverName": "exa-search",
      "configInput": "{\n  \"command\": \"npx\",\n  \"args\": [\n    \"-y\",\n    \"@exa/mcp-server\"\n  ],\n  \"env\": {\n    \"EXA_API_KEY\": \"{env:EXA_API_KEY}\"\n  }\n}"
    }
  }
]
```