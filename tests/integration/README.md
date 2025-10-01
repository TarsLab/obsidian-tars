# MCP Integration Tests

This directory contains integration tests for the MCP (Model Context Protocol) server integration feature.

## Test Types

### Unit/Mock Tests
- **mcpLifecycle.test.ts**: Lifecycle management with mocked Docker and MCP SDK
- **toolExecution.test.ts**: Tool execution flow with mocked components

### E2E Tests (Real MCP Server)
- **mcpMemoryServer.test.ts**: End-to-end tests using the real `mcp/memory` Docker container
  - **Powered by**: [Testcontainers](https://node.testcontainers.org/) for reliable Docker management

## Running Tests

### Run All Tests (Unit + E2E)
```bash
npm test
```

### Run Only Unit Tests (Fast, No Docker Required)
```bash
npm run test:unit
```

### Run Only E2E Tests (Requires Docker)
```bash
npm run test:e2e
```

## E2E Test Requirements

The E2E tests use:
- **Testcontainers**: Manages Docker containers automatically during tests
- **MCP Memory Server**: Official `mcp/memory:latest` image from Docker Hub
  - **Documentation**: https://mcpservers.org/servers/modelcontextprotocol/memory
  - **Docker Hub**: https://hub.docker.com/r/mcp/memory

### Prerequisites
1. **Install testcontainers**
   ```bash
   npm install --save-dev testcontainers
   ```

2. **Docker installed and running**
   ```bash
   docker --version
   # Docker version 20.10+ required
   ```

3. **Docker daemon accessible**
   - Linux/Mac: Docker socket at `/var/run/docker.sock`
   - Windows: Docker Desktop running

4. **Internet connection** (for pulling `mcp/memory` image on first run)

### Benefits of Testcontainers
- ✅ Automatic container lifecycle management
- ✅ Automatic cleanup (no leftover containers)
- ✅ Better reliability and error handling
- ✅ Works seamlessly in CI/CD
- ✅ Industry-standard solution

### Skipping E2E Tests

E2E tests are automatically skipped if:
- `CI=true` environment variable is set
- `SKIP_DOCKER_TESTS=true` environment variable is set

To manually skip E2E tests:
```bash
SKIP_DOCKER_TESTS=true npm test
```

## What E2E Tests Validate

The `mcpMemoryServer.test.ts` suite tests the complete Tars plugin flow:

1. **Server Lifecycle**
   - Docker container creation and startup
   - Server initialization and shutdown
   - Connection management

2. **Tool Discovery**
   - Listing tools from real MCP server
   - Tool schema validation
   - Tool metadata extraction

3. **Tool Execution**
   - Code block parsing
   - Parameter extraction
   - Tool execution via MCP protocol
   - Result handling

4. **Execution Limits**
   - Concurrent execution limits
   - Session limits
   - Execution tracking

5. **Integration Flow**
   - User writes code block → Parser → Executor → MCP Server → Result
   - Complete positive path validation

## Test Coverage

### Smoke Test
The main smoke test validates the complete positive path:
- ✅ Manager initializes with server config
- ✅ Server starts (Docker container)
- ✅ Client connects via stdio transport
- ✅ Tools are discovered (`store_memory`, `retrieve_memory`, `delete_memory`)
- ✅ Tool schema validation
- ✅ Tool execution with parameters
- ✅ Result returned successfully

### Memory Server Tools
The `mcp/memory` server provides these tools:
- **store_memory**: Store a key-value pair in memory
- **retrieve_memory**: Retrieve stored values by key
- **delete_memory**: Delete stored memories

## Troubleshooting

### Docker Not Found
```
Error: Docker daemon not accessible
```
**Solution**: Start Docker daemon or Docker Desktop

### Permission Denied (Linux)
```
Error: Permission denied while trying to connect to Docker
```
**Solution**: Add user to docker group or use sudo
```bash
sudo usermod -aG docker $USER
# Then log out and back in
```

### Container Already Exists
```
Error: Container name already in use
```
**Solution**: Remove existing test container
```bash
docker rm -f tars-test-memory-mcp
```

### Test Timeout
```
Error: Test timed out in 45000ms
```
**Causes**:
- Docker pulling image for first time (slow connection)
- Docker daemon slow/overloaded
- MCP server startup issues

**Solution**: 
- Wait for image pull to complete
- Increase test timeout
- Check Docker logs: `docker logs tars-test-memory-mcp`

## CI/CD Integration

For CI/CD pipelines, you have two options:

### Option 1: Skip E2E Tests
```yaml
test:
  script:
    - CI=true npm test  # Auto-skips E2E tests
```

### Option 2: Run E2E Tests with Docker
```yaml
test:
  services:
    - docker:dind
  script:
    - npm test  # Runs all tests including E2E
```

## Development Workflow

1. **During Development**: Run unit tests (fast feedback)
   ```bash
   npm run test:unit
   ```

2. **Before Commit**: Run all tests including E2E
   ```bash
   npm test
   ```

3. **Manual Testing**: Run only E2E tests
   ```bash
   npm run test:e2e
   ```

## Adding New E2E Tests

When adding new E2E test cases:

1. Use the `mcpMemoryServer.test.ts` pattern
2. Set appropriate timeouts (45s+ for network operations)
3. Clean up resources in `afterAll` hook
4. Use descriptive GIVEN/WHEN/THEN structure
5. Test both success and error paths

Example:
```typescript
it('should handle new scenario', async () => {
  // GIVEN: Setup state
  await manager.initialize([serverConfig]);
  
  // WHEN: Perform action
  const result = await toolExecutor.executeTool({
    serverId: serverConfig.id,
    toolName: 'store_memory',
    parameters: { key: 'test', value: 'data' },
    source: 'user-codeblock',
    documentPath: 'test.md'
  });
  
  // THEN: Verify outcome
  expect(result).toBeDefined();
}, 45000); // Timeout in ms
```
