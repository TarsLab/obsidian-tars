# MCP Server Integration Architecture

## Overview

This document explains how the Tars plugin manages MCP servers and their lifecycle.

## Server Deployment Types

### 1. Managed Servers (Docker)
Servers whose lifecycle is managed by Tars. The plugin controls starting/stopping the Docker container.

### 2. External Servers
Servers that are already running elsewhere. Tars only connects to them.

## Transport Types

### 1. Stdio Transport
Communication via standard input/output streams. Used primarily with Docker containers.

### 2. SSE Transport  
Communication via Server-Sent Events over HTTP. Used for remote servers.

## Architecture by Combination

### Managed + Stdio (Docker-based MCP servers)

**How it works:**
```
User configures server → MCPServerManager.startServer() → MCPClientImpl.connect()
→ StdioClientTransport spawns: docker run -i --rm <image>
→ MCP server runs in container, communicates via stdin/stdout
```

**Key points:**
- ✅ Container is **spawned by StdioClientTransport**, not pre-created
- ✅ Uses `docker run -i` to start container in interactive mode
- ✅ Container runs the image's default entrypoint (e.g., `node dist/index.js`)
- ✅ `--rm` flag ensures container is removed when transport closes
- ✅ Stdin/stdout are piped between Tars and MCP server

**Example:**
```typescript
{
  deploymentType: 'managed',
  transport: 'stdio',
  dockerConfig: {
    image: 'mcp/memory:latest',
    containerName: 'tars-memory-server'
  }
}

// Spawns: docker run -i --rm --name tars-memory-server mcp/memory:latest
```

### Managed + SSE (Web-based MCP servers)

**How it works:**
```
User configures server → MCPServerManager.startServer()
→ MCPServerManager.startManagedServer() creates Docker container
→ Container starts web server on specific port
→ MCPClientImpl.connect() → SSEClientTransport connects to http://localhost:port
```

**Key points:**
- ✅ Container is **pre-created** by MCPServerManager
- ✅ Container runs a web server that speaks MCP over SSE
- ✅ Port mapping configured in dockerConfig
- ✅ Container stays running until explicitly stopped

**Example:**
```typescript
{
  deploymentType: 'managed',
  transport: 'sse',
  dockerConfig: {
    image: 'mcp-web-server:latest',
    containerName: 'tars-web-server',
    portBindings: { '8080/tcp': 8080 }
  },
  sseConfig: {
    url: 'http://localhost:8080/sse'
  }
}
```

### External + Stdio (Pre-existing Docker containers)

**How it works:**
```
User starts container manually → configures Tars with container name
→ MCPClientImpl.connect() → StdioClientTransport execs into container
→ Runs MCP server command inside container
```

**Key points:**
- ✅ Container must already be running
- ✅ Uses `docker exec -i <container> <command>` to run MCP server
- ✅ Container lifecycle managed externally
- ✅ Requires specifying the MCP server command

**Example:**
```bash
# User starts container
docker run -d --name my-mcp-server alpine:latest sleep infinity
```

```typescript
{
  deploymentType: 'external',
  transport: 'stdio',
  dockerConfig: {
    containerName: 'my-mcp-server',
    command: ['node', '/app/mcp-server.js']  // Command to run MCP server
  }
}

// Executes: docker exec -i my-mcp-server node /app/mcp-server.js
```

### External + SSE (Remote MCP servers)

**How it works:**
```
Remote server running → User configures URL → SSEClientTransport connects
```

**Key points:**
- ✅ Server runs on different machine/network
- ✅ Simple URL-based connection
- ✅ No Docker involved

**Example:**
```typescript
{
  deploymentType: 'external',
  transport: 'sse',
  sseConfig: {
    url: 'https://remote-mcp-server.com/sse'
  }
}
```

## Why This Design?

### Problem with Previous Approach

❌ **Old design (INCORRECT)**:
```
Manager: create container → start container
Client: docker exec -i <container> mcp-server  // ❌ Command doesn't exist!
```

This failed because:
1. MCP server images don't have an `mcp-server` command
2. The server's entrypoint is already configured in the Dockerfile
3. `docker exec` can't access the container's stdio for MCP protocol

### Current Approach

✅ **New design (CORRECT)**:
```
Stdio + Managed: docker run -i <image>  // ✅ Runs entrypoint directly!
Stdio + External: docker exec -i <container> <command>  // ✅ Known command
```

This works because:
1. `docker run -i` executes the image's entrypoint (e.g., `node dist/index.js`)
2. The entrypoint is already the MCP server
3. Interactive mode (`-i`) keeps stdin/stdout open for MCP protocol
4. `--rm` ensures cleanup when connection closes

## Implementation Details

### MCPServerManager.startServer()

```typescript
if (config.deploymentType === "managed") {
  // For stdio: container spawned by transport, skip Docker creation
  // For SSE: need to pre-create container (web server)
  if (config.transport === "sse") {
    await this.startManagedServer(config);
  }
}

// Create client (will spawn container for stdio)
const client = new MCPClientImpl();
await client.connect(config);
```

### MCPClientImpl.connect()

```typescript
if (config.transport === 'stdio') {
  if (config.deploymentType === 'managed') {
    // Spawn container - it runs and is auto-removed
    this.transport = new StdioClientTransport({
      command: 'docker',
      args: ['run', '-i', '--rm', '--name', containerName, image]
    });
  } else {
    // Exec into existing container
    this.transport = new StdioClientTransport({
      command: 'docker',
      args: ['exec', '-i', containerName, ...command]
    });
  }
}
```

## Example: mcp/memory Server

**Dockerfile** (from modelcontextprotocol/servers):
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build
CMD ["node", "dist/index.js"]  # ← This is the MCP server!
```

**When we run**:
```bash
docker run -i --rm mcp/memory:latest
```

**What happens**:
1. Docker starts container
2. Runs `CMD ["node", "dist/index.js"]` (the MCP server)
3. MCP server listens on stdin, writes to stdout
4. Tars reads/writes via StdioClientTransport
5. When transport closes, `--rm` removes container

## Testing Strategy

### Integration Tests (Current)
- Mock MCP SDK and Docker client
- Test component integration (Manager ↔ Executor ↔ CodeBlockProcessor)
- Fast, reliable, no external dependencies

### Manual E2E Tests (Future)
- Use real MCP servers (mcp/memory, etc.)
- Test actual Docker integration
- Validate real protocol communication
- Document in quickstart.md

## Configuration Examples

### Weather Server (Managed + Stdio)
```typescript
{
  id: 'weather',
  name: 'Weather Service',
  deploymentType: 'managed',
  transport: 'stdio',
  dockerConfig: {
    image: 'mcp/weather:latest',
    containerName: 'tars-weather'
  },
  enabled: true
}
```

### Search Server (External + SSE)
```typescript
{
  id: 'search',
  name: 'Search Service',
  deploymentType: 'external',
  transport: 'sse',
  sseConfig: {
    url: 'https://search-api.example.com/mcp'
  },
  enabled: true
}
```

## Troubleshooting

### "Failed to connect to MCP server"

**For Managed + Stdio**:
- Check Docker is running: `docker ps`
- Verify image exists: `docker images | grep mcp`
- Test manually: `docker run -i --rm <image>`
- Check container logs: `docker logs <container-name>`

**For External + Stdio**:
- Verify container is running: `docker ps | grep <container-name>`
- Check the command is correct
- Test exec manually: `docker exec -i <container> <command>`

**For SSE**:
- Check URL is accessible: `curl <sse-url>`
- Verify server is running
- Check network connectivity

### Container name conflicts

If you see "container name already in use":
```bash
docker rm -f <container-name>
```

This can happen if a previous connection didn't clean up properly.

## Future Enhancements

1. **Connection pooling**: Reuse containers across multiple tool calls
2. **Health monitoring**: Detect when containers die and restart them
3. **Resource limits**: Set CPU/memory limits for containers
4. **Multi-container servers**: Support servers that need multiple containers
5. **Authentication**: Support authenticated MCP connections
