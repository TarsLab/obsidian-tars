# Testing Guide for MCP Integration

## Quick Start: Local Testing

### 1. Build the Plugin

```bash
# From the plugin root directory
npm run build
```

This compiles TypeScript and bundles everything into `main.js`.

### 2. Create a Test Vault

```bash
# Create a test vault directory
mkdir -p ~/obsidian-test-vault/.obsidian/plugins/obsidian-tars

# Copy the built files
cp main.js manifest.json styles.css ~/obsidian-test-vault/.obsidian/plugins/obsidian-tars/
```

### 3. Open in Obsidian

1. Open Obsidian
2. Click "Open another vault"
3. Select "Open folder as vault"
4. Choose `~/obsidian-test-vault`
5. Go to Settings → Community plugins
6. Enable "Tars" plugin

### 4. Configure MCP Server

Go to Settings → Tars → MCP Servers and add a test server:

**Example Docker Server:**
- Name: `test-echo`
- Transport: `stdio`
- Deployment: `Managed (Docker)`
- Docker image: `mcp-test/echo-server:latest`
- Container name: `tars-mcp-test`
- Enabled: ✓

**Example Remote SSE Server:**
- Name: `remote-api`
- Transport: `sse`
- Deployment: `External`
- SSE URL: `http://localhost:8080/sse`
- Enabled: ✓

### 5. Test Tool Execution

Create a new note and add:

````markdown
# MCP Test

```test-echo
tool: echo
message: Hello from MCP integration!
timestamp: true
count: 42
```
````

You should see the tool execute and results appear inline.

---

## Alternative: Development Mode with Hot Reload

For faster iteration during development:

### 1. Use Dev Mode

```bash
# Terminal 1: Watch mode (auto-rebuild on changes)
npm run dev
```

### 2. Create Symlink to Vault

```bash
# Create test vault if it doesn't exist
mkdir -p ~/obsidian-test-vault/.obsidian/plugins

# Symlink your plugin directory
ln -s /mnt/wsl/workspace/obsidian-tars ~/obsidian-test-vault/.obsidian/plugins/obsidian-tars
```

### 3. Reload Plugin After Changes

In Obsidian:
- Settings → Community plugins
- Toggle "Tars" off and on
- Or use the "Hot Reload" plugin for automatic reloading

---

## Test Scenarios

### Scenario 1: Basic Tool Execution

````markdown
```test-server
tool: echo
message: test
```
````

**Expected:**
- Tool executes within timeout
- Result displays with metadata
- No errors in console

### Scenario 2: Invalid Tool Name

````markdown
```test-server
tool: nonexistent
```
````

**Expected:**
- Error message: "Tool not found: nonexistent"
- User-friendly error display

### Scenario 3: YAML Parsing

````markdown
```test-server
tool: complex_tool
nested:
  key: value
  number: 42
list: [1, 2, 3]
boolean: true
```
````

**Expected:**
- YAML parsed correctly
- Complex parameters passed to tool

### Scenario 4: Server Management

**Test:**
1. Disable server in settings
2. Try to execute tool
3. Re-enable server
4. Execute tool again

**Expected:**
- Disabled server shows error
- Enabling server reinitializes connection
- Tool works after re-enabling

### Scenario 5: Concurrent Execution

**Test:**
1. Set concurrent limit to 2
2. Create 4 code blocks with slow tools
3. Execute all simultaneously

**Expected:**
- Only 2 execute at once
- Others queue
- All complete eventually

### Scenario 6: Commands

**Test:**
1. Execute some tools
2. Run command: `MCP: Show Execution History`
3. Run command: `MCP: Stop Executions`
4. Try to execute another tool

**Expected:**
- History shows all executions with timestamps
- Stop command prevents new executions
- Error message when stopped

---

## Docker Test Server Setup

If you need a test MCP server for Docker testing:

### Option 1: Use Existing MCP Server

```bash
# Example: Python echo server
docker pull mcp/python-echo:latest
```

### Option 2: Create Simple Test Server

```dockerfile
# Dockerfile for test MCP server
FROM python:3.11-slim

RUN pip install mcp

COPY echo_server.py /app/echo_server.py

WORKDIR /app

CMD ["python", "echo_server.py"]
```

```python
# echo_server.py
import sys
import json
from mcp import Server

server = Server("echo-server")

@server.tool()
def echo(message: str, timestamp: bool = False) -> dict:
    result = {"message": message}
    if timestamp:
        from datetime import datetime
        result["timestamp"] = datetime.now().isoformat()
    return result

if __name__ == "__main__":
    server.run_stdio()
```

Build and run:
```bash
docker build -t mcp-test/echo-server:latest .
docker run --name tars-mcp-test mcp-test/echo-server:latest
```

---

## SSE Test Server Setup

For testing SSE transport:

```javascript
// sse-server.js
const express = require('express');
const app = express();

app.get('/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Handle MCP protocol over SSE
  // Implementation depends on your MCP server library
});

app.listen(8080, () => {
  console.log('SSE MCP server running on port 8080');
});
```

---

## Debugging

### Enable Console Logging

Open Developer Tools in Obsidian:
- **Windows/Linux**: `Ctrl + Shift + I`
- **macOS**: `Cmd + Option + I`

Look for:
- `[MCP]` prefixed logs
- Error messages
- Execution traces

### Check Docker Status

```bash
# List running containers
docker ps | grep tars-mcp

# View container logs
docker logs tars-mcp-test

# Check container health
docker inspect tars-mcp-test | grep -A 5 State
```

### Common Issues

**Issue: "Docker not found"**
- Solution: Ensure Docker is installed and running
- Check: `docker ps` works in terminal

**Issue: "Port already in use"**
- Solution: Stop conflicting container
- Command: `docker stop $(docker ps -q --filter "publish=3000")`

**Issue: "Container not starting"**
- Check logs: `docker logs tars-mcp-test`
- Verify image exists: `docker images | grep mcp-test`

---

## Automated Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/mcp/client.test.ts

# Run with coverage
npm test -- --coverage
```

---

## Performance Testing

### Test Execution Limits

```markdown
# Set limits in settings
- Concurrent limit: 2
- Session limit: 10

# Create multiple tool calls
(Create 15 code blocks and execute them)
```

**Verify:**
- Max 2 concurrent executions
- Session limit enforced after 10
- History tracks all executions

### Test Timeout

```markdown
# Set global timeout to 5000ms

```slow-server
tool: sleep
duration: 10
```
```

**Expected:**
- Timeout error after 5 seconds
- User-friendly timeout message

---

## CI/CD Testing (Future)

```yaml
# .github/workflows/test-mcp.yml
name: Test MCP Integration

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run build
      - run: npm test
```

---

## Manual Validation Checklist

- [ ] Plugin loads without errors
- [ ] Settings UI displays MCP section
- [ ] Can add/edit/delete servers
- [ ] Enable/disable toggle works
- [ ] Code blocks execute tools
- [ ] Results render inline
- [ ] Errors display user-friendly messages
- [ ] MCP commands work (stop, history, reset)
- [ ] Docker containers start/stop correctly
- [ ] Health monitoring detects failures
- [ ] Auto-disable after 3 failures works
- [ ] Execution limits enforced
- [ ] Timeout works correctly

---

## Next Steps

1. Build the plugin: `npm run build`
2. Create test vault
3. Copy plugin files
4. Configure test MCP server
5. Execute test scenarios
6. Report any issues

For issues or questions, check the console logs and Docker status first.
