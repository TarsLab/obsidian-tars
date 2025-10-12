# Data Model: MCP Server Integration

**Feature**: 001-integrate-mcp-servers  
**Phase**: 1 - Design & Contracts  
**Date**: 2025-10-01

## Entity Definitions

### 1. MCPServerConfig

**Purpose**: Represents a registered MCP server configuration persisted in plugin settings.

**Attributes**:
```typescript
interface MCPServerConfig {
  // Identity
  id: string;                    // Unique identifier (UUID)
  name: string;                  // User-friendly name (unique)
  
  // Connection
  transport: 'stdio' | 'sse';    // Transport protocol
  deploymentType: 'managed' | 'external';  // Managed=Docker, External=Remote
  
  // Docker-specific (managed only)
  dockerConfig?: {
    image: string;               // Docker image name
    containerName: string;       // Container name
    command?: string[];          // Optional command override
    ports?: { [key: string]: number };  // Port mappings
  };
  
  // SSE-specific (external only)
  sseConfig?: {
    url: string;                 // SSE endpoint URL
  };
  
  // State
  enabled: boolean;              // User enable/disable toggle
  
  // Health tracking
  lastConnectedAt?: number;      // Timestamp of last successful connection
  failureCount: number;          // Consecutive failure count
  autoDisabled: boolean;         // Auto-disabled by failure threshold
  
  // Section associations
  sectionBindings: SectionBinding[];  // Document section -> server mappings
}
```

**Validation Rules**:
- `name` must be unique across all servers
- `transport='stdio'` requires `deploymentType='managed'` and `dockerConfig`
- `transport='sse'` with `deploymentType='external'` requires `sseConfig.url`
- `failureCount` resets to 0 on successful connection

**State Transitions**:
```
[Created] → enabled=false, failureCount=0
[Enabled by user] → enabled=true, attempt connection
[Connected] → lastConnectedAt=now, failureCount=0
[Connection failed] → failureCount++, retry with backoff
[Failure threshold reached] → autoDisabled=true, enabled=false
[Re-enabled by user] → autoDisabled=false, failureCount=0
```

---

### 2. SectionBinding

**Purpose**: Associates document sections with specific MCP servers.

**Attributes**:
```typescript
interface SectionBinding {
  // Section identification
  sectionType: 'heading' | 'block' | 'range';
  
  // Heading-based
  headingText?: string;          // Heading content (e.g., "## Tools")
  
  // Block-based
  blockId?: string;              // Block ^id
  
  // Range-based
  startLine?: number;
  endLine?: number;
  
  // Server reference
  serverId: string;              // References MCPServerConfig.id
  
  // Inheritance
  inheritToChildren: boolean;    // Apply to nested sections
}
```

**Validation Rules**:
- Exactly one of `headingText`, `blockId`, or `startLine/endLine` must be set
- `serverId` must reference existing server
- Section ranges must be valid (startLine < endLine)

**Inheritance Rules**:
- Child sections inherit parent binding if `inheritToChildren=true`
- Explicit binding on child overrides parent
- No binding = use first enabled server (default behavior)

---

### 3. ToolInvocationRequest

**Purpose**: Represents a single tool execution request from user or AI.

**Attributes**:
```typescript
interface ToolInvocationRequest {
  // Identity
  id: string;                    // Unique request ID (UUID)
  
  // Target
  serverId: string;              // MCP server to execute on
  toolName: string;              // Tool identifier
  
  // Input
  parameters: Record<string, unknown>;  // YAML-parsed parameters
  
  // Context
  source: 'user-codeblock' | 'ai-autonomous';
  documentPath: string;          // Document where requested
  sectionLine?: number;          // Line number of code block/request
  
  // Execution
  status: 'pending' | 'executing' | 'success' | 'error' | 'timeout' | 'cancelled';
  submittedAt: number;           // Timestamp
  startedAt?: number;
  completedAt?: number;
  
  // Retry tracking
  retryAttempt: number;          // Current attempt (0 = first)
  maxRetries: number;            // From retry strategy
  
  // Result
  result?: ToolExecutionResult;
  error?: ErrorInfo;
}
```

**Validation Rules**:
- `serverId` must reference enabled server
- `toolName` must exist on target server (verified at execution)
- `parameters` must match tool's input schema
- `status` transitions: pending → executing → (success|error|timeout)

**State Transitions**:
```
[Created] → status='pending', retryAttempt=0
[Execution starts] → status='executing', startedAt=now
[Success] → status='success', completedAt=now, result=data
[Failure] → if retryAttempt < maxRetries: status='pending', retryAttempt++
           else: status='error', error=details
[Timeout] → status='timeout', error={message: 'Execution exceeded 30s'}
[User cancels] → status='cancelled'
```

---

### 4. ToolExecutionResult

**Purpose**: Contains output from successful tool execution.

**Attributes**:
```typescript
interface ToolExecutionResult {
  // Output
  content: unknown;              // Tool output (any JSON-serializable)
  contentType: 'text' | 'json' | 'markdown' | 'image';
  
  // Metadata
  executionDuration: number;     // Milliseconds
  tokensUsed?: number;           // If tool reports usage
  
  // Rendering hints
  displayFormat?: 'inline' | 'block' | 'collapsed';
}
```

**Validation Rules**:
- `content` must be serializable to JSON
- `executionDuration` must be positive
- `contentType` determines rendering strategy

---

### 5. ServerHealthStatus

**Purpose**: Tracks real-time health state of an MCP server.

**Attributes**:
```typescript
interface ServerHealthStatus {
  serverId: string;              // References MCPServerConfig.id
  
  // Connection state
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  
  // Health metrics
  lastPingAt?: number;           // Last successful health check
  pingLatency?: number;          // Milliseconds
  consecutiveFailures: number;   // Failure count
  
  // Retry state
  retryState: {
    isRetrying: boolean;
    currentAttempt: number;      // 0, 1, 2 (max 3)
    nextRetryAt?: number;        // Scheduled retry timestamp
    backoffIntervals: number[];  // [1000, 5000, 15000]
  };
  
  // Auto-disable flag
  autoDisabledAt?: number;       // Timestamp when auto-disabled
}
```

**Validation Rules**:
- `consecutiveFailures` increments on each failure, resets on success
- `retryState.currentAttempt` max value is 3
- Auto-disable triggered when `currentAttempt` reaches 3

**State Transitions**:
```
[Initial] → connectionState='disconnected'
[Connect attempt] → connectionState='connecting'
[Connected] → connectionState='connected', consecutiveFailures=0
[Ping success] → lastPingAt=now, pingLatency=measured
[Connection lost] → connectionState='error', consecutiveFailures++
[Retry scheduled] → isRetrying=true, nextRetryAt=now+backoff
[Max retries] → auto-disable server, notify user
```

---

### 6. ExecutionTracker (Session State)

**Purpose**: Tracks global execution limits and user stop requests during plugin session.

**Attributes**:
```typescript
interface ExecutionTracker {
  // Limits
  concurrentLimit: number;       // Max concurrent executions (from settings)
  sessionLimit: number;          // Total executions per session (-1 = unlimited)
  
  // State
  activeExecutions: Set<string>; // Request IDs currently executing
  totalExecuted: number;         // Count since plugin load
  stopped: boolean;              // User requested stop
  
  // History
  executionHistory: {
    requestId: string;
    serverId: string;
    toolName: string;
    timestamp: number;
    duration: number;
    status: 'success' | 'error';
  }[];
}
```

**Validation Rules**:
- `activeExecutions.size` must not exceed `concurrentLimit`
- `totalExecuted` must not exceed `sessionLimit` (if not -1)
- `stopped=true` blocks all new executions

**Business Logic**:
```typescript
canExecute(): boolean {
  if (this.stopped) return false;
  if (this.sessionLimit !== -1 && this.totalExecuted >= this.sessionLimit) return false;
  if (this.activeExecutions.size >= this.concurrentLimit) return false;
  return true;
}
```

---

### 7. AIToolContext (Provider Integration)

**Purpose**: Represents available MCP tools exposed to AI assistant for autonomous use.

**Attributes**:
```typescript
interface AIToolContext {
  // Available tools
  tools: {
    serverId: string;
    serverName: string;
    toolName: string;
    description: string;
    inputSchema: JSONSchema;     // Tool parameter schema
  }[];
  
  // Execution callback
  executeTool: (serverId: string, toolName: string, params: Record<string, unknown>) => Promise<ToolExecutionResult>;
  
  // Constraints
  enabledServers: string[];      // Only these servers' tools are available
  sectionBinding?: string;       // Current section's bound server (if any)
}
```

**Validation Rules**:
- `tools` only includes tools from enabled servers
- If `sectionBinding` exists, only that server's tools are available
- `inputSchema` must be valid JSON Schema

---

## Relationships

```
MCPServerConfig (1) ──< (N) SectionBinding
                (1) ──< (N) ToolInvocationRequest
                (1) ─── (1) ServerHealthStatus

ToolInvocationRequest (1) ─── (0..1) ToolExecutionResult

ExecutionTracker (1) ──< (N) ToolInvocationRequest (active)

AIToolContext references MCPServerConfig (enabled)
```

---

## Storage Strategy

### Plugin Settings (Persistent)
- `MCPServerConfig[]` - persisted via `loadData()`/`saveData()`
- Settings structure:
```typescript
interface PluginSettings {
  // ... existing settings
  mcpServers: MCPServerConfig[];
  mcpGlobalTimeout: number;        // Default 30000ms
  mcpConcurrentLimit: number;      // Default 25
  mcpSessionLimit: number;         // Default 25, -1=unlimited
}
```

### Session State (In-Memory)
- `ExecutionTracker` - reset on plugin load
- `ServerHealthStatus[]` - rebuilt on plugin load
- `ToolInvocationRequest[]` - active requests only

### Document State (Transient)
- `SectionBinding[]` - stored in settings but applied per-document
- Code block parsing - on-demand from editor

---

## Data Flow

### User-Initiated Tool Execution
```
1. User writes code block: ```servername\ntool: weather\ncity: London```
2. Code block processor parses → ToolInvocationRequest
3. ExecutionTracker.canExecute() checks limits
4. MCPExecutor sends to MCPClient
5. MCPClient routes to server (stdio or SSE)
6. Result → ToolExecutionResult
7. Code block processor renders result in document
```

### AI-Initiated Tool Execution
```
1. Provider builds AIToolContext from enabled servers
2. System message includes tool descriptions
3. AI response includes tool request
4. Provider parser extracts → ToolInvocationRequest
5. ExecutionTracker checks limits
6. MCPExecutor executes tool
7. Result injected back into conversation context
8. AI generates final response with tool data
```

### Health Monitoring Loop
```
1. MCPManager starts with all enabled servers
2. Every 30s: ping each connected server
3. Failure → ServerHealthStatus.consecutiveFailures++
4. Trigger retry with backoff (1s, 5s, 15s)
5. After 3 failures → auto-disable, notify user
```

---

## Validation Summary

| Entity | Validation Points | Enforced By |
|--------|------------------|-------------|
| MCPServerConfig | Unique name, required config per transport | Settings save |
| SectionBinding | Valid section reference, existing server | Document parse |
| ToolInvocationRequest | Enabled server, valid tool, schema match | Executor pre-check |
| ToolExecutionResult | Serializable content | Client wrapper |
| ServerHealthStatus | Failure count <= 3 | Health monitor |
| ExecutionTracker | Concurrent/session limits | Executor gate |
| AIToolContext | Enabled servers only | Provider builder |

---

**Phase 1 Data Model Complete** - Ready for contract generation.
