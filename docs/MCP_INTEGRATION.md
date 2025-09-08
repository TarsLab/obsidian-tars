# MCP Integration Guide for Obsidian TARS

This guide explains how to set up and use Model Context Protocol (MCP) servers with the Obsidian TARS plugin to enhance AI text generation with external data sources.

## Overview

The MCP integration allows TARS to connect to external tools and data sources through Docker-containerized MCP servers. When you use specific tags in your notes, TARS automatically invokes relevant tools and includes their results in the AI generation context.

## Architecture

```
User Note with Tags → Tag Analysis → MCP Tool Selection → Docker MCP Server → External APIs/Data → Enhanced AI Generation
```

## Prerequisites

- Docker installed and running
- Obsidian TARS plugin v3.4.3+
- Basic understanding of Docker containers

## Quick Start with Simple MCP Servers

We'll demonstrate two common MCP server setups using the simplest available servers for testing:

### 1. STDIO Protocol Server (Memory Server)

The memory server is the simplest MCP server for testing - it provides basic memory/note-taking functionality.

#### Setup Memory Server

1. **Test the server locally first**:
   ```bash
   # Install and test the memory server
   npx -y @modelcontextprotocol/server-memory
   ```

2. **Configure in TARS Settings**:
   - Open Obsidian Settings → TARS → MCP Integration
   - Add MCP Server:
     - Server ID: `memory-server`
     - Name: `Memory Server`
     - Docker Image: `node:18-alpine`
     - Port: `3001`
     - Command: `npx -y @modelcontextprotocol/server-memory`
     - Protocol: `STDIO`

3. **Add Tag Mapping**:
   - Tag Pattern: `memory|note|remember`
   - Tool Names: `["create_memory", "search_memories", "list_memories"]`
   - Server ID: `memory-server`

#### Usage Example

```markdown
# Meeting Notes #memory #project

Remember the key decisions from today's meeting:
- Budget approved for Q2
- New hire starting next month
- Migration scheduled for March

<!-- TARS will use memory tools to store and retrieve information -->
```

### 2. SSE Protocol Server (Filesystem Server)

The filesystem server provides file operations and is commonly used for testing SSE connections.

#### Setup Filesystem Server with SSE

1. **Run filesystem server with SSE using Supergateway**:
   ```bash
   # Using Docker with Supergateway to convert STDIO to SSE
   docker run -it --rm -p 8000:8000 supergateway \
     --stdio "npx -y @modelcontextprotocol/server-filesystem /tmp"
   ```

2. **Configure in TARS Settings**:
   - Add MCP Server:
     - Server ID: `filesystem-server`
     - Name: `Filesystem Server`
     - Docker Image: `supergateway:latest`
     - Port: `8000`
     - Command: `--stdio "npx -y @modelcontextprotocol/server-filesystem /tmp"`
     - Protocol: `SSE`
     - Endpoint: `http://localhost:8000/sse`

3. **Add Tag Mapping**:
   - Tag Pattern: `file|filesystem|read|write`
   - Tool Names: `["read_file", "write_file", "list_directory"]`
   - Server ID: `filesystem-server`

#### Usage Example

```markdown
# Code Review Notes #file #development

Analyze the configuration files in the project:
- Check database settings
- Review API endpoints
- Validate environment variables

<!-- TARS will use filesystem tools to read and analyze files -->
```

## Step-by-Step Setup Guide

### Step 1: Start Docker

Ensure Docker is running on your system:

```bash
# Check Docker status
docker --version
docker ps

# If Docker isn't running, start it
sudo systemctl start docker  # Linux
# or use Docker Desktop on Windows/Mac
```

### Step 2: Test MCP Servers Manually

Before configuring in TARS, test the servers work:

#### Test Memory Server (STDIO)
```bash
# Run memory server directly
npx -y @modelcontextprotocol/server-memory

# Test with MCP inspector (optional)
npx @modelcontextprotocol/inspector npx @modelcontextprotocol/server-memory
```

#### Test Filesystem Server (SSE)
```bash
# Run filesystem server with SSE gateway
docker run -it --rm -p 8000:8000 supergateway \
  --stdio "npx -y @modelcontextprotocol/server-filesystem /tmp"

# Test SSE endpoint
curl http://localhost:8000/sse
```

### Step 3: Configure TARS Plugin

1. Open Obsidian Settings
2. Navigate to TARS → MCP Integration
3. Add the servers using configurations above
4. Create tag mappings for your use cases
5. Test with a simple note

### Step 4: Create Test Notes

Create notes with the configured tags and generate content to verify the integration works.

## Alternative Simple Servers for Testing

### Database Server (SQLite)

Simple database operations for testing:

```bash
# Run a simple SQLite MCP server
docker run -p 3003:3003 example-mcp-server-sse
```

Configuration:
- Server ID: `database-server`
- Tools: `["query_database", "list_tables", "get_schema"]`
- Tag Pattern: `database|sql|query`

### Web Scraper Server

For testing web content extraction:

```bash
# Using a simple web scraper MCP server
docker run -p 3004:3004 -e MAX_REQUESTS=5 simple-web-scraper-mcp
```

Configuration:
- Server ID: `web-scraper`
- Tools: `["scrape_url", "extract_text"]`
- Tag Pattern: `web|scrape|url`

## Verification Steps

### 1. Check Server Connection

In TARS settings, verify:
- ✅ Server status shows "Connected"
- ✅ Available tools are listed
- ✅ No connection errors in logs

### 2. Test Tool Discovery

Create a test note:
```markdown
# Test MCP Integration #memory

Generate a simple note to test MCP integration.
```

Verify:
- ✅ Tag is recognized
- ✅ Tools are invoked during generation
- ✅ Results are included in generated content

### 3. Monitor Logs

Check for successful tool calls:
- TARS plugin logs show MCP tool invocations
- Docker container logs show successful requests
- No error messages in Obsidian console

## Troubleshooting Common Issues

### Server Won't Start

1. **Check Docker image availability**:
   ```bash
   docker pull node:18-alpine
   docker images
   ```

2. **Verify port availability**:
   ```bash
   netstat -an | grep :3001
   lsof -i :3001
   ```

3. **Check container logs**:
   ```bash
   docker ps
   docker logs <container-id>
   ```

### Tools Not Available

1. **Verify server is fully started** (wait 10-15 seconds)
2. **Check tag patterns match exactly**
3. **Ensure tool names are correct** (case-sensitive)
4. **Review MCP server documentation** for available tools

### Connection Timeouts

1. **Increase retry configuration**:
   ```json
   {
     "retryConfig": {
       "maxRetries": 5,
       "initialDelay": 2000,
       "maxDelay": 15000,
       "backoffMultiplier": 2
     }
   }
   ```

2. **Check network connectivity**:
   ```bash
   curl http://localhost:3001/health
   telnet localhost 3001
   ```

## Next Steps

Once you have the basic servers working:

1. **Explore More Servers**: Try GitHub, Jira, or database connectors
2. **Create Custom Mappings**: Design tag patterns for your workflow
3. **Build Custom Servers**: Develop MCP servers for your specific needs
4. **Share Configurations**: Document successful setups for your team

## Resources

- [MCP Official Examples](https://modelcontextprotocol.io/examples)
- [MCP Server Registry](https://mcp-get.com/)
- [Supergateway for Protocol Conversion](https://github.com/supercorp-ai/supergateway)
- [MCP Inspector for Testing](https://github.com/modelcontextprotocol/inspector)

## Support

For issues and questions:
1. Check the [troubleshooting section](#troubleshooting-common-issues)
2. Review Docker and MCP server logs
3. Test servers independently before TARS integration
4. Open an issue on the [TARS GitHub repository](https://github.com/TarsLab/obsidian-tars/issues)