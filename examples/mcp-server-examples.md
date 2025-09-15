# MCP Server Examples for TARS Integration

This document provides working examples of MCP servers that can be used with the Obsidian TARS plugin.

## 1. Memory Server (STDIO Protocol)

The simplest MCP server for testing basic functionality.

### Quick Test

```bash
# Test the memory server directly
npx -y @modelcontextprotocol/server-memory
```

### TARS Configuration

```json
{
  "id": "memory-server",
  "name": "Memory Server",
  "dockerImage": "node:18-alpine",
  "port": 3001,
  "protocol": "STDIO",
  "command": "npx -y @modelcontextprotocol/server-memory",
  "enabled": true
}
```

### Tag Mapping

```json
{
  "tagPattern": "memory|remember|note",
  "toolNames": ["create_memory", "search_memories", "list_memories"],
  "serverId": "memory-server"
}
```

### Usage Example

```markdown
# Project Meeting Notes #memory

Remember these key decisions:
- Budget approved for Q2: $50k
- New team member starts March 1st
- Code review process updated

#Claude: Summarize the key decisions and create action items
```

## 2. Filesystem Server (SSE Protocol via Supergateway)

Provides file system operations through SSE protocol.

### Quick Test

```bash
# Run filesystem server with SSE conversion
docker run -it --rm -p 8000:8000 supergateway \
  --stdio "npx -y @modelcontextprotocol/server-filesystem /tmp"

# Test SSE endpoint
curl http://localhost:8000/sse
```

### TARS Configuration

```json
{
  "id": "filesystem-server",
  "name": "Filesystem Server",
  "dockerImage": "supergateway:latest",
  "port": 8000,
  "protocol": "SSE",
  "command": "--stdio \"npx -y @modelcontextprotocol/server-filesystem /tmp\"",
  "endpoint": "http://localhost:8000/sse",
  "enabled": true
}
```

### Tag Mapping

```json
{
  "tagPattern": "file|filesystem|read|write|config",
  "toolNames": ["read_file", "write_file", "list_directory"],
  "serverId": "filesystem-server"
}
```

### Usage Example

```markdown
# Configuration Review #file #config

Analyze the project configuration files:
- package.json dependencies
- tsconfig.json settings
- .env.example variables

#Claude: Review the configuration files and suggest improvements
```

## 3. Alternative Servers for Testing

### Simple Database Server

```bash
# Example SQLite MCP server
docker run -p 3003:3003 example-mcp-server-sse
```

Configuration:
```json
{
  "id": "database-server",
  "name": "SQLite Database Server",
  "dockerImage": "example-mcp-server-sse:latest",
  "port": 3003,
  "protocol": "SSE",
  "endpoint": "http://localhost:3003/sse"
}
```

Tag Mapping:
```json
{
  "tagPattern": "database|sql|query|data",
  "toolNames": ["query_database", "list_tables", "get_schema"],
  "serverId": "database-server"
}
```

## Testing Your Setup

### 1. Verify Server Connection

1. Start your MCP server
2. Check TARS settings for connection status
3. Look for "Connected" status and available tools list

### 2. Test Tool Discovery

Create a test note:
```markdown
# MCP Integration Test #memory

This is a test note to verify MCP integration is working.

#Claude: Test the MCP integration by creating a memory entry
```

### 3. Monitor Logs

Check for successful operations:
- TARS plugin console logs
- Docker container logs: `docker logs <container-id>`
- No error messages in Obsidian developer console

## Troubleshooting

### Common Issues

1. **Server won't start**: Check Docker image availability and port conflicts
2. **Tools not found**: Verify tag patterns match exactly (case-sensitive)
3. **Connection timeouts**: Increase retry configuration in TARS settings
4. **Permission errors**: Ensure Docker has proper permissions

### Debug Commands

```bash
# Check Docker status
docker ps
docker logs <container-id>

# Test network connectivity
curl http://localhost:3001/health
telnet localhost 3001

# Check port availability
netstat -an | grep :3001
lsof -i :3001
```

## Next Steps

1. Start with the memory server for basic testing
2. Add the filesystem server for file operations
3. Explore community MCP servers for specific integrations
4. Create custom MCP servers for your workflow needs

## Resources

- [MCP Official Documentation](https://modelcontextprotocol.io/)
- [MCP Server Registry](https://mcp-get.com/)
- [Supergateway Repository](https://github.com/supercorp-ai/supergateway)
- [MCP Inspector Tool](https://github.com/modelcontextprotocol/inspector)