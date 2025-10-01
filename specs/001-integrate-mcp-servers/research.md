# Research: MCP Server Integration

**Feature**: 001-integrate-mcp-servers  
**Phase**: 0 - Outline & Research  
**Date**: 2025-10-01

## Research Objectives

Investigate technical approaches for integrating Model Context Protocol (MCP) servers into the Obsidian Tars plugin, with focus on:
1. MCP SDK usage patterns for stdio and SSE transports
2. Docker API integration from Electron/Obsidian context
3. Code block processing within Obsidian's editor
4. Tool context injection into AI provider message flows

---

## 1. MCP SDK Integration (@modelcontextprotocol/sdk)

### Decision: Use @modelcontextprotocol/sdk for protocol implementation

**Rationale**:
- Already present in `node_modules/@modelcontextprotocol/sdk`
- Provides TypeScript types for MCP protocol
- Supports both stdio and SSE transports
- Maintained by Anthropic (protocol creators)

### Key Findings:

**Transport Types**:
- **stdio**: Communicates via stdin/stdout (requires child_process)
- **SSE (Server-Sent Events)**: HTTP-based streaming (EventSource API)

**Client Usage Pattern** (from SDK documentation):
```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// Stdio transport (for Docker local containers)
const stdioTransport = new StdioClientTransport({
  command: 'docker',
  args: ['exec', '-i', containerName, 'mcp-server']
});

// SSE transport (for remote servers)
const sseTransport = new SSEClientTransport({
  url: 'http://localhost:3000/sse'
});

const client = new Client({
  name: 'tars-obsidian',
  version: '1.0.0'
}, {
  capabilities: {}
});

await client.connect(transport);
```

**Tool Invocation Pattern**:
```typescript
// List available tools
const toolsResult = await client.listTools();

// Execute tool
const result = await client.callTool({
  name: 'tool_name',
  arguments: { param1: 'value1' }
});
```

**Alternatives Considered**:
- Direct WebSocket implementation (rejected: reinventing protocol, no type safety)
- HTTP REST calls (rejected: MCP is not REST-based, lacks streaming)

---

## 2. Docker API Integration

### Decision: Use electron's Node.js APIs with Dockerode library

**Rationale**:
- Obsidian runs on Electron (Node.js APIs available in main process)
- Dockerode is mature Docker Engine API client for Node.js
- Provides TypeScript types
- Handles Unix socket and HTTP connections

**Key Findings**:

**Docker API Access in Obsidian**:
- Obsidian plugin runs in renderer process (limited Node.js)
- Must use Electron remote/IPC to access Node APIs from main process
- Alternative: Use Docker HTTP API directly (no native dependencies)

**Recommended Approach**: HTTP API directly (avoid Electron IPC complexity)
```typescript
// Docker Engine API via HTTP
const dockerHost = process.platform === 'win32' 
  ? 'http://localhost:2375'  // Windows
  : 'http://unix:/var/run/docker.sock';  // Unix/macOS

async function startContainer(image: string, name: string) {
  const response = await fetch(`${dockerHost}/containers/create`, {
    method: 'POST',
    body: JSON.stringify({
      Image: image,
      name: name,
      ExposedPorts: { '3000/tcp': {} }
    })
  });
  const { Id } = await response.json();
  
  // Start container
  await fetch(`${dockerHost}/containers/${Id}/start`, { method: 'POST' });
  return Id;
}
```

**Health Monitoring**:
```typescript
async function getContainerStatus(containerId: string) {
  const response = await fetch(`${dockerHost}/containers/${containerId}/json`);
  const data = await response.json();
  return data.State.Status; // "running", "exited", etc.
}
```

**Alternatives Considered**:
- Dockerode library (rejected: requires Node.js child_process, complex in Obsidian)
- Docker CLI via exec (rejected: platform-specific, no structured output)

---

## 3. Code Block Processing in Obsidian

### Decision: Hook into editor events and parse code blocks with metadata cache

**Rationale**:
- Obsidian provides `MetadataCache` with code block positions
- Can register custom code block processors via `registerMarkdownCodeBlockProcessor`
- Supports live preview and source mode

**Key Findings**:

**Code Block Detection**:
```typescript
// Obsidian's CodeBlockInfo from MetadataCache
interface SectionCache {
  type: 'code';
  position: { start: EditorPosition; end: EditorPosition };
}

// Custom processor registration
this.registerMarkdownCodeBlockProcessor('servername', async (source, el, ctx) => {
  // Parse YAML parameters from source
  const params = parseYAML(source);
  
  // Execute tool
  const result = await mcpExecutor.executeTool(
    'servername',
    params.tool,
    params
  );
  
  // Render result
  el.createDiv({ text: result });
});
```

**YAML Parsing** (for tool parameters):
```typescript
function parseToolInvocation(codeBlockContent: string): ToolInvocation {
  const lines = codeBlockContent.split('\n');
  const toolLine = lines.find(l => l.startsWith('tool:'));
  const toolName = toolLine?.split(':')[1]?.trim();
  
  // Parse remaining lines as YAML
  const yamlContent = lines.filter(l => !l.startsWith('tool:')).join('\n');
  const params = yaml.parse(yamlContent);
  
  return { toolName, parameters: params };
}
```

**Alternatives Considered**:
- Custom markdown syntax plugin (rejected: too invasive, breaks portability)
- Command palette only (rejected: no inline visual feedback)

---

## 4. AI Provider Tool Context Injection

### Decision: Extend provider message formatting to include MCP tool descriptions

**Rationale**:
- Providers already format messages before sending to AI
- Can inject tool schemas into system message or context
- Supports AI autonomous tool requests

**Key Findings**:

**Claude Tool Use Pattern** (reference for other providers):
```typescript
// System message with tools
const systemMessage = {
  role: 'system',
  content: `Available tools:\n${mcpTools.map(t => 
    `- ${t.name}: ${t.description}\n  Parameters: ${JSON.stringify(t.inputSchema)}`
  ).join('\n')}`
};

// AI response parsing for tool requests
if (aiResponse.includes('TOOL_CALL:')) {
  const toolCall = parseToolCallFromResponse(aiResponse);
  const result = await mcpExecutor.executeTool(
    toolCall.server,
    toolCall.tool,
    toolCall.params
  );
  
  // Inject result back into conversation
  messages.push({
    role: 'user',
    content: `Tool result: ${JSON.stringify(result)}`
  });
}
```

**Provider Modification Points**:
- `src/providers/claude.ts`: Anthropic native tool use API
- `src/providers/openAI.ts`: OpenAI function calling
- `src/providers/gemini.ts`: Google function declarations
- Other providers: System message injection (fallback)

**Alternatives Considered**:
- Separate MCP<->AI middleware layer (rejected: adds complexity, latency)
- Post-process AI responses only (rejected: misses autonomous tool use)

---

## 5. Exponential Backoff Retry Strategy

### Decision: Implement exponential backoff with jitter for connection failures

**Rationale**:
- Standard practice for distributed systems
- Prevents thundering herd on server recovery
- Configurable per requirements (1s, 5s, 15s)

**Key Findings**:

**Implementation Pattern**:
```typescript
class RetryStrategy {
  private readonly intervals = [1000, 5000, 15000]; // ms
  private attempt = 0;
  
  async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    while (this.attempt < this.intervals.length) {
      try {
        return await fn();
      } catch (error) {
        this.attempt++;
        if (this.attempt >= this.intervals.length) {
          throw new Error('Max retries exceeded');
        }
        
        const delay = this.intervals[this.attempt - 1];
        const jitter = Math.random() * 1000; // ±1s jitter
        await sleep(delay + jitter);
      }
    }
    throw new Error('Retry failed');
  }
  
  reset() {
    this.attempt = 0;
  }
}
```

**Alternatives Considered**:
- Linear backoff (rejected: can overwhelm recovering servers)
- Fixed retry interval (rejected: doesn't adapt to failure patterns)

---

## 6. Session Execution Tracking

### Decision: In-memory counter with configurable limits and user stop capability

**Rationale**:
- Simple implementation (no persistence needed)
- Aligns with requirement FR-032 (25 default, -1 unlimited)
- User control via command/UI

**Key Findings**:

**Execution Counter Pattern**:
```typescript
class ExecutionTracker {
  private executionCount = 0;
  private readonly limit: number; // from settings
  private stopped = false;
  
  canExecute(): boolean {
    if (this.stopped) return false;
    if (this.limit === -1) return true;
    return this.executionCount < this.limit;
  }
  
  increment() {
    this.executionCount++;
  }
  
  stop() {
    this.stopped = true;
    new Notice('MCP tool execution stopped by user');
  }
  
  reset() {
    this.executionCount = 0;
    this.stopped = false;
  }
}
```

**Alternatives Considered**:
- Per-document tracking (rejected: adds complexity, unclear reset semantics)
- Persistent tracking (rejected: not required, session-based is clearer)

---

## 7. Security Model (Trust-Based)

### Decision: No authentication, trust local network and Docker isolation

**Rationale**:
- Aligns with clarification FR-033 (no auth required)
- Docker provides process isolation
- User controls security via enable/disable

**Key Findings**:

**Security Boundaries**:
- MCP servers run in separate Docker containers (process isolation)
- Network communication localhost-only by default
- User explicitly enables each server (explicit trust)
- Tool execution logged for audit trail

**Risk Mitigation**:
- Auto-disable on repeated failures prevents runaway processes
- Execution limits prevent resource exhaustion
- User notification on errors provides transparency

**Alternatives Considered**:
- API key authentication (rejected: overhead for local trust model)
- OAuth (rejected: unnecessary for local containers)

---

## Research Summary

| Area | Decision | Complexity | Risk |
|------|----------|------------|------|
| MCP SDK | Use @modelcontextprotocol/sdk | Low | Low (maintained library) |
| Docker API | HTTP API directly | Medium | Medium (platform-specific sockets) |
| Code Blocks | registerMarkdownCodeBlockProcessor | Low | Low (Obsidian native API) |
| AI Integration | Provider message formatting hooks | Medium | Medium (provider-specific patterns) |
| Retry Logic | Exponential backoff with jitter | Low | Low (standard pattern) |
| Execution Tracking | In-memory counter | Low | Low (simple state) |
| Security | Trust-based, no auth | Low | Medium (user responsibility) |

**Overall Risk Assessment**: Medium (Docker integration and AI provider hooks are main complexity points)

**Recommended MVP Scope**:
1. MCP client with stdio transport only (simplify to one protocol first)
2. Code block processor for user-initiated tool calls
3. Basic health monitoring without auto-disable (manual control initially)
4. Single AI provider integration (Claude as reference)

**Phase 1 Ready**: All unknowns resolved, proceed to design phase.
