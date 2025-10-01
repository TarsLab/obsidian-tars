# Migration to mcp-use-ts

## Why Migrate?

We're replacing our custom MCP server management with `mcp-use-ts` because:
- ✅ **Battle-tested**: Production-ready server lifecycle management
- ✅ **Maintains compatibility**: Follows official MCP SDK patterns  
- ✅ **Reduces complexity**: ~500 lines of custom code → simple wrapper
- ✅ **Better error handling**: Built-in retry logic, health checks
- ✅ **Active maintenance**: Updated when MCP protocol changes

## Architecture Changes

### What We're Replacing

```
OLD:
MCPServerManager (custom) → MCPClient (custom wrapper) → MCP SDK
  ↓                            ↓
DockerClient (custom)    HealthMonitor (custom)
```

```
NEW:
MCPServerManager (thin wrapper) → MCPClient (from mcp-use) → MCP SDK
  ↓
All process/Docker management handled by mcp-use
```

### What We're Keeping

- ✅ **ToolExecutor**: Execution limits, tracking, history
- ✅ **CodeBlockProcessor**: Markdown code block parsing
- ✅ **providerIntegration**: AI tool context formatting
- ✅ **Settings UI**: Obsidian-specific configuration
- ✅ **Plugin integration**: Obsidian lifecycle hooks

## Migration Plan

### Phase 1: Update Dependencies ✅
- Add `mcp-use` package
- Keep `@modelcontextprotocol/sdk` (still needed)

### Phase 2: Refactor MCPServerManager
- Replace custom server management with `MCPClient` from mcp-use
- Keep same public API for backward compatibility
- Map our config format to mcp-use format

### Phase 3: Remove Obsolete Code
- Delete `src/mcp/client.ts` (replaced by mcp-use)
- Delete `src/mcp/docker.ts` (handled by mcp-use)
- Delete `src/mcp/healthMonitor.ts` (handled by mcp-use)
- Keep types, errors, utils

### Phase 4: Update Tests
- Mock `mcp-use` instead of MCP SDK
- Keep integration test patterns
- Simplify test setup

## API Mapping

### Our Config → mcp-use Config

**Our format**:
```typescript
{
  id: 'weather',
  name: 'Weather Server',
  transport: 'stdio',
  deploymentType: 'managed',
  dockerConfig: {
    image: 'mcp/weather:latest',
    containerName: 'tars-weather'
  }
}
```

**mcp-use format**:
```typescript
{
  mcpServers: {
    weather: {
      command: 'docker',
      args: ['run', '-i', '--rm', 'mcp/weather:latest']
    }
  }
}
```

### Conversion Logic

```typescript
function toMCPUseConfig(config: MCPServerConfig) {
  if (config.transport === 'stdio' && config.deploymentType === 'managed') {
    return {
      command: 'docker',
      args: ['run', '-i', '--rm', '--name', config.dockerConfig.containerName, config.dockerConfig.image]
    };
  }
  // Handle other cases...
}
```

## New MCPServerManager API

### Before (Custom)
```typescript
const manager = new MCPServerManager();
await manager.initialize([serverConfig]);
const client = manager.getClient(serverId);
const tools = await client.listTools();
```

### After (with mcp-use)
```typescript
const manager = new MCPServerManager();
await manager.initialize([serverConfig]);
// Internally uses MCPClient from mcp-use
const tools = await manager.listTools(serverId);
const result = await manager.callTool(serverId, toolName, params);
```

## Implementation Steps

### 1. Create Config Converter

```typescript
// src/mcp/mcpUseAdapter.ts
import { MCPServerConfig } from './types';

export function toMCPUseServerConfig(config: MCPServerConfig) {
  const serverName = config.id;
  
  if (config.transport === 'stdio') {
    if (config.deploymentType === 'managed') {
      // Docker managed server
      return {
        [serverName]: {
          command: 'docker',
          args: [
            'run', '-i', '--rm',
            '--name', config.dockerConfig!.containerName,
            config.dockerConfig!.image
          ]
        }
      };
    } else {
      // External docker container  
      return {
        [serverName]: {
          command: 'docker',
          args: ['exec', '-i', config.dockerConfig!.containerName]
            .concat(config.dockerConfig!.command || [])
        }
      };
    }
  } else if (config.transport === 'sse') {
    // SSE transport - mcp-use might not support this yet
    // May need to keep custom SSE handling
    throw new Error('SSE transport not yet supported with mcp-use');
  }
}
```

### 2. Refactor MCPServerManager

```typescript
// src/mcp/manager.ts
import { MCPClient } from 'mcp-use';
import { toMCPUseServerConfig } from './mcpUseAdapter';

export class MCPServerManager {
  private mcpClient: MCPClient | null = null;
  private serverConfigs: Map<string, MCPServerConfig> = new Map();

  async initialize(configs: MCPServerConfig[]): Promise<void> {
    // Convert our configs to mcp-use format
    const mcpUseConfig = {
      mcpServers: {}
    };
    
    for (const config of configs) {
      if (config.enabled) {
        this.serverConfigs.set(config.id, config);
        Object.assign(
          mcpUseConfig.mcpServers,
          toMCPUseServerConfig(config)
        );
      }
    }
    
    // Create mcp-use client with all servers
    this.mcpClient = MCPClient.fromDict(mcpUseConfig);
  }

  async listTools(serverId: string): Promise<ToolDefinition[]> {
    if (!this.mcpClient) {
      throw new Error('Manager not initialized');
    }
    
    // Get tools for specific server
    const tools = await this.mcpClient.listTools(serverId);
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
  }

  async callTool(
    serverId: string,
    toolName: string,
    parameters: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    if (!this.mcpClient) {
      throw new Error('Manager not initialized');
    }
    
    const result = await this.mcpClient.callTool(serverId, {
      name: toolName,
      arguments: parameters
    });
    
    return {
      content: result.content,
      contentType: 'json',
      executionDuration: 0 // mcp-use doesn't provide this
    };
  }

  listServers(): MCPServerConfig[] {
    return Array.from(this.serverConfigs.values());
  }

  async shutdown(): Promise<void> {
    if (this.mcpClient) {
      await this.mcpClient.close();
      this.mcpClient = null;
    }
    this.serverConfigs.clear();
  }
}
```

### 3. Update ToolExecutor

Minimal changes needed - just ensure it works with new manager API:

```typescript
// src/mcp/executor.ts
// No changes needed! Executor calls manager.callTool() which we've preserved
```

### 4. Update Tests

```typescript
// tests/mcp/manager.test.ts
import { vi } from 'vitest';

// Mock mcp-use instead of MCP SDK
vi.mock('mcp-use', () => ({
  MCPClient: {
    fromDict: vi.fn(() => ({
      listTools: vi.fn().mockResolvedValue([
        { name: 'tool1', description: 'Test tool' }
      ]),
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }]
      }),
      close: vi.fn().mockResolvedValue(undefined)
    }))
  }
}));
```

## Benefits

### Code Reduction
- **Before**: ~2,600 lines (including client.ts, docker.ts, healthMonitor.ts)
- **After**: ~500 lines (thin wrapper + adapter)
- **Reduction**: ~80% less code to maintain

### Reliability
- ✅ Process lifecycle handled by mcp-use
- ✅ Better error recovery
- ✅ Connection pooling
- ✅ Automatic retries

### Future-Proof
- ✅ Updates when MCP protocol changes
- ✅ Community bug fixes
- ✅ New features (SSE support, etc.)

## Risks & Mitigations

### Risk 1: SSE Transport Not Supported
**Mitigation**: Keep our custom SSE handling for now, migrate later

### Risk 2: Breaking Changes in mcp-use
**Mitigation**: Pin to specific version, test before upgrading

### Risk 3: Lost Custom Features
**Mitigation**: Audit what we lose, implement adapters if needed

## Timeline

1. **Phase 1**: Install & study mcp-use (30min) ✅
2. **Phase 2**: Create adapter layer (1hr)
3. **Phase 3**: Refactor manager (2hr)
4. **Phase 4**: Update tests (1hr)  
5. **Phase 5**: Integration testing (1hr)
6. **Phase 6**: Remove old code (30min)

**Total**: ~6 hours for migration

## Success Criteria

- ✅ All existing tests pass
- ✅ Code reduction of 70%+
- ✅ Same public API (no breaking changes)
- ✅ All features still work (execution limits, tracking, etc.)
- ✅ Better error messages
