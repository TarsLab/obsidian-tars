# Quickstart: MCP Server Integration

**Feature**: 001-integrate-mcp-servers  
**Purpose**: Manual testing scenarios to validate MCP integration functionality  
**Prerequisites**: Docker installed, MCP test server image available

---

## Test Environment Setup

### 1. Prepare Test MCP Server (Docker)

```bash
# Pull or build a test MCP server image
# Example: Simple echo server for testing
docker pull mcp-test/echo-server:latest

# Verify image exists
docker images | grep mcp-test
```

### 2. Configure Obsidian Tars Plugin

1. Open Obsidian settings → Tars plugin
2. Navigate to new "MCP Servers" section
3. Click "Add Server"
4. Fill in:
   - **Name**: `test-echo`
   - **Transport**: `stdio`
   - **Deployment Type**: `managed` (Docker)
   - **Docker Image**: `mcp-test/echo-server:latest`
   - **Container Name**: `tars-mcp-echo`
5. Click "Test Connection" (should show "Connected")
6. Enable server toggle

---

## Scenario 1: User-Initiated Tool Execution (Code Block)

**Objective**: Verify tool execution from markdown code block

### Steps:

1. Create new note in Obsidian
2. Insert code block:
   ````markdown
   ```test-echo
   tool: echo
   message: Hello from Tars MCP!
   timestamp: true
   ```
   ````

3. **Expected Behavior**:
   - Code block shows "Executing..." status
   - After <2s, result appears below:
     ```
     Echo result:
     message: Hello from Tars MCP!
     timestamp: 2025-10-01T16:30:00Z
     ```
   - Original code block preserved above result

### Success Criteria:
- [ ] Code block parsed correctly
- [ ] Tool executed within timeout
- [ ] Result rendered in document
- [ ] No errors in console

---

## Scenario 2: AI-Initiated Tool Execution

**Objective**: Verify AI can autonomously request tool execution

### Steps:

1. In same or new note, start conversation:
   ```markdown
   #User : Check if the echo server is working by sending a test message
   
   #Claude :
   ```

2. Trigger Claude response (command palette or space after tag)

3. **Expected Behavior**:
   - Claude recognizes available `test-echo` server tools
   - Claude response includes tool execution:
     ```
     I'll test the echo server for you.
     
     [Tool: test-echo/echo executed]
     Result: Echo successful - message confirmed
     
     The echo server is working correctly!
     ```

### Success Criteria:
- [ ] AI knows about available tools
- [ ] AI autonomously calls tool
- [ ] Tool result injected into AI context
- [ ] AI response references tool output
- [ ] Tool execution logged in history

---

## Scenario 3: Server Lifecycle Management

**Objective**: Verify Docker container start/stop/health monitoring

### Steps:

1. **Start Test**:
   - Disable `test-echo` server in settings
   - Check Docker: `docker ps` (container should stop)
   - Re-enable server
   - Check Docker: `docker ps` (container should start)

2. **Health Monitoring Test**:
   - Manually stop container: `docker stop tars-mcp-echo`
   - Wait 10-15 seconds
   - **Expected**: Obsidian notice "MCP server test-echo disconnected, retrying..."
   - Container should auto-restart (1s wait)

3. **Auto-Disable Test**:
   - Stop container: `docker stop tars-mcp-echo`
   - Prevent restart: `docker rm tars-mcp-echo`
   - Wait for 3 retry cycles (~20s)
   - **Expected**: Notice "MCP server test-echo auto-disabled after 3 failures"
   - Server toggle in settings should be disabled

### Success Criteria:
- [ ] Container lifecycle matches enable/disable
- [ ] Health check detects failures
- [ ] Retry with exponential backoff (1s, 5s, 15s)
- [ ] Auto-disable after 3 failures
- [ ] User notified via Obsidian notice

---

## Scenario 4: Execution Limits

**Objective**: Verify concurrent and session limits enforced

### Steps:

1. **Setup Limits**:
   - Settings → MCP → Global Settings
   - Set Concurrent Limit: `2`
   - Set Session Limit: `5`

2. **Concurrent Limit Test**:
   - Create 4 code blocks with slow tool (e.g., sleep 5s):
     ````markdown
     ```test-echo
     tool: sleep_echo
     duration: 5
     ```
     ````
   - Trigger all 4 simultaneously (click/process rapidly)
   - **Expected**: Only 2 execute at once, others queue

3. **Session Limit Test**:
   - Execute 5 quick tool calls successfully
   - Attempt 6th execution
   - **Expected**: Error notice "Session execution limit reached (5)"

4. **Stop Test**:
   - Command palette → "MCP: Stop Executions"
   - Attempt any tool execution
   - **Expected**: Error notice "Execution stopped by user"

### Success Criteria:
- [ ] Concurrent limit enforced (max 2 active)
- [ ] Session limit enforced (max 5 total)
- [ ] Stop command blocks future executions
- [ ] Limits reset on plugin reload

---

## Scenario 5: Remote SSE Server

**Objective**: Verify external SSE server connection

### Steps:

1. **Setup External Server**:
   - Run test SSE server externally:
     ```bash
     # Example: Node.js SSE server on port 8080
     node test-servers/sse-server.js
     ```

2. **Configure in Tars**:
   - Add Server:
     - **Name**: `remote-sse`
     - **Transport**: `sse`
     - **Deployment Type**: `external`
     - **SSE URL**: `http://localhost:8080/sse`
   - Enable server

3. **Test Connection**:
   - Click "Test Connection"
   - **Expected**: "Connected" (no Docker container created)

4. **Execute Tool**:
   ````markdown
   ```remote-sse
   tool: test_tool
   param: value
   ```
   ````

### Success Criteria:
- [ ] SSE connection established (no Docker)
- [ ] Health check verifies URL reachable
- [ ] Tool execution via SSE works
- [ ] No container lifecycle management attempted

---

## Scenario 6: Section-Based Server Binding

**Objective**: Verify document sections can have designated servers

### Steps:

1. **Configure Binding**:
   - Settings → MCP Servers → `test-echo`
   - Add Section Binding:
     - Type: `heading`
     - Heading Text: `## Echo Tools`
     - Inherit to Children: `true`

2. **Create Document**:
   ```markdown
   ## Echo Tools
   
   ```test-echo
   tool: echo
   message: Section-bound tool
   ```
   
   ## Other Section
   
   ```test-echo
   tool: echo
   message: Should work (no binding = use enabled)
   ```
   ```

3. **Test AI with Sections**:
   - Under `## Echo Tools`: Ask Claude to echo something
   - **Expected**: Claude uses test-echo server

### Success Criteria:
- [ ] Section binding restricts tool access
- [ ] Inheritance works for nested headings
- [ ] No binding = all enabled servers available
- [ ] AI respects section bindings

---

## Scenario 7: Error Handling

**Objective**: Verify graceful error handling

### Test Cases:

1. **Invalid Tool Name**:
   ````markdown
   ```test-echo
   tool: nonexistent_tool
   ```
   ````
   - **Expected**: Error message "Tool not found: nonexistent_tool"

2. **Invalid Parameters**:
   ````markdown
   ```test-echo
   tool: echo
   invalid_yaml: [unclosed
   ```
   ````
   - **Expected**: Error message "YAML parsing failed"

3. **Timeout**:
   - Configure timeout: 5s
   - Execute slow tool (>5s)
   - **Expected**: "Execution timeout after 5000ms"

4. **Server Disabled**:
   - Disable server
   - Execute tool
   - **Expected**: "Server test-echo is disabled"

5. **Docker Port Conflict**:
   - Manually run container on same port
   - Enable server in Tars
   - **Expected**: "Port already in use" error, server auto-disabled

### Success Criteria:
- [ ] All errors show user-friendly messages
- [ ] Errors logged to console for debugging
- [ ] No plugin crashes or uncaught exceptions
- [ ] Document remains editable after errors

---

## Validation Checklist

### Core Functionality
- [ ] User code block execution works
- [ ] AI autonomous tool execution works
- [ ] Docker lifecycle management works
- [ ] SSE remote server connection works

### Limits & Controls
- [ ] Concurrent limit enforced
- [ ] Session limit enforced
- [ ] User stop command works
- [ ] Timeout enforced

### Error Handling
- [ ] Invalid tool names handled
- [ ] Invalid YAML handled
- [ ] Server failures handled
- [ ] Port conflicts handled

### Health & Monitoring
- [ ] Health checks run periodically
- [ ] Failures trigger retry with backoff
- [ ] Auto-disable after 3 failures
- [ ] User notifications appear

### Integration
- [ ] Settings UI functional
- [ ] Section bindings work
- [ ] Provider tool context injection works
- [ ] Execution history tracked

---

## Debugging Commands

```bash
# Check Docker containers
docker ps -a | grep tars-mcp

# View container logs
docker logs tars-mcp-echo

# Check Obsidian console
# Windows: Ctrl+Shift+I
# macOS: Cmd+Option+I
# Linux: Ctrl+Shift+I

# View execution history (in plugin)
# Command palette → "MCP: Show Execution History"
```

---

## Performance Benchmarks

Expected performance targets:

- **Tool execution start**: <500ms (from code block to "Executing" status)
- **Simple tool (echo)**: <2s total (including Docker overhead)
- **Health check cycle**: 30s interval, <100ms per server
- **Container startup**: <5s (Docker-dependent)
- **SSE connection**: <1s (network-dependent)

---

**Quickstart complete**. All scenarios should pass before merging to main.
