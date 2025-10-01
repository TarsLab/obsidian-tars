# Tasks: MCP Server Integration for LLM Tool Execution

**Feature**: 001-integrate-mcp-servers  
**Branch**: `001-integrate-mcp-servers`  
**Input**: Design documents from `/mnt/workspace/obsidian-tars/specs/001-integrate-mcp-servers/`  
**Prerequisites**: plan.md (✅), research.md (✅), data-model.md (✅), contracts/ (✅), quickstart.md (✅)

## Task Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions
- Follow TDD: Tests BEFORE implementation

---

## Phase 3.1: Setup

- [X] **T001** Create `src/mcp/` directory structure with subdirectories for module organization
- [X] **T002** [P] Verify `@modelcontextprotocol/sdk` dependency in package.json (already present in node_modules)
- [ ] **T003** [P] Configure vitest for MCP tests if not already configured (check for vitest.config.ts)

---

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**
**GIVEN/WHEN/THEN format with clear comments required**

### Contract Tests [P] - All can run in parallel

- [X] **T004** [P] **Contract test: MCPClient stdio transport** in `tests/mcp/client-stdio.test.ts`
  ```typescript
  // TEST: MCPClient connects via stdio transport
  // GIVEN: Docker container with MCP server running
  // WHEN: Client connects using stdio transport
  // THEN: Connection established and tools can be listed
  
  // TEST: MCPClient executes tool via stdio
  // GIVEN: Connected stdio client
  // WHEN: callTool() invoked with valid parameters
  // THEN: Tool result returned within timeout
  
  // TEST: MCPClient handles stdio connection failure
  // GIVEN: Invalid Docker container configuration
  // WHEN: Connection attempted
  // THEN: ConnectionError thrown with descriptive message
  ```

- [X] **T005** [P] **Contract test: MCPClient SSE transport** in `tests/mcp/client-sse.test.ts`
  ```typescript
  // TEST: MCPClient connects via SSE transport
  // GIVEN: Remote SSE server URL
  // WHEN: Client connects using SSE transport
  // THEN: Connection established via EventSource
  
  // TEST: MCPClient executes tool via SSE
  // GIVEN: Connected SSE client
  // WHEN: callTool() invoked
  // THEN: Tool result streamed back successfully
  
  // TEST: MCPClient handles SSE connection timeout
  // GIVEN: Unreachable SSE URL
  // WHEN: Connection attempted with timeout
  // THEN: TimeoutError thrown after specified duration
  ```

- [X] **T006** [P] **Contract test: MCPServerManager lifecycle** in `tests/mcp/manager.test.ts`
  ```typescript
  // TEST: Manager initializes with multiple server configs
  // GIVEN: Array of MCPServerConfig (Docker + remote)
  // WHEN: initialize() called
  // THEN: All enabled servers started, disabled servers skipped
  
  // TEST: Manager starts Docker server successfully
  // GIVEN: Docker server configuration
  // WHEN: startServer() called
  // THEN: Docker container created and started, client connected
  
  // TEST: Manager stops Docker server gracefully
  // GIVEN: Running Docker server
  // WHEN: stopServer() called
  // THEN: Container stopped and removed, client disconnected
  
  // TEST: Manager re-enables auto-disabled server
  // GIVEN: Server with autoDisabled=true
  // WHEN: reenableServer() called
  // THEN: Failure count reset, retry state cleared, server started
  ```

- [X] **T007** [P] **Contract test: ToolExecutor limits** in `tests/mcp/executor.test.ts`
  ```typescript
  // TEST: Executor enforces concurrent execution limit
  // GIVEN: Concurrent limit set to 2
  // WHEN: 4 tool requests submitted simultaneously
  // THEN: Only 2 execute concurrently, others queue
  
  // TEST: Executor enforces session execution limit
  // GIVEN: Session limit set to 5
  // WHEN: 6 tool requests submitted sequentially
  // THEN: First 5 succeed, 6th throws ExecutionLimitError
  
  // TEST: Executor stops all executions when stop() called
  // GIVEN: Active executions in progress
  // WHEN: stop() called
  // THEN: No new executions allowed, canExecute() returns false
  
  // TEST: Executor tracks execution history
  // GIVEN: Multiple tool executions completed
  // WHEN: getHistory() called
  // THEN: All executions logged with timestamps and status
  ```

- [X] **T008** [P] **Contract test: Docker integration** in `tests/mcp/docker.test.ts`
  ```typescript
  // TEST: Docker client creates container
  // GIVEN: Docker image name and configuration
  // WHEN: createContainer() called
  // THEN: Container created with correct settings
  
  // TEST: Docker client starts container
  // GIVEN: Created container ID
  // WHEN: startContainer() called
  // THEN: Container status becomes "running"
  
  // TEST: Docker client detects port conflict
  // GIVEN: Port already in use by another container
  // WHEN: Container start attempted
  // THEN: Specific error about port conflict returned
  
  // TEST: Docker client retrieves container health
  // GIVEN: Running container
  // WHEN: getContainerStatus() called
  // THEN: Health status returned (running/exited/unhealthy)
  ```

- [X] **T009** [P] **Contract test: HealthMonitor retry logic** in `tests/mcp/healthMonitor.test.ts`
  ```typescript
  // TEST: Health monitor performs periodic checks
  // GIVEN: Connected servers
  // WHEN: 30 seconds elapsed
  // THEN: Health check executed on all servers
  
  // TEST: Health monitor implements exponential backoff
  // GIVEN: Server connection failure
  // WHEN: Retry attempted
  // THEN: Delays follow 1s, 5s, 15s pattern with jitter
  
  // TEST: Health monitor auto-disables after 3 failures
  // GIVEN: Server failed 3 consecutive retry cycles
  // WHEN: Final retry fails
  // THEN: Server auto-disabled, user notified via Notice
  
  // TEST: Health monitor resets failure count on success
  // GIVEN: Server with 2 consecutive failures
  // WHEN: Next health check succeeds
  // THEN: Failure count reset to 0, retry state cleared
  ```

- [X] **T010** [P] **Contract test: CodeBlockProcessor parsing** in `tests/mcp/codeBlockProcessor.test.ts`
  ```typescript
  // TEST: Processor parses tool invocation from code block
  // GIVEN: Code block with "tool: echo" and YAML parameters
  // WHEN: parseToolInvocation() called
  // THEN: ToolInvocation object returned with serverId, toolName, parameters
  
  // TEST: Processor handles invalid YAML gracefully
  // GIVEN: Code block with malformed YAML
  // WHEN: parseYAMLParameters() called
  // THEN: YAMLParseError thrown with line number
  
  // TEST: Processor renders success result
  // GIVEN: ToolExecutionResult with text content
  // WHEN: renderResult() called with DOM element
  // THEN: Result displayed with metadata (duration, status)
  
  // TEST: Processor renders error state
  // GIVEN: ErrorInfo with error message
  // WHEN: renderError() called
  // THEN: User-friendly error displayed in code block
  ```

### Provider Integration Tests [P]

- [X] **T011** [P] **Provider tool context test** in `tests/providers/toolContext.test.ts`
  ```typescript
  // TEST: Tool context includes enabled server tools
  // GIVEN: 2 enabled MCP servers with 3 tools each
  // WHEN: buildToolContext() called
  // THEN: AIToolContext contains 6 tools with schemas
  
  // TEST: Tool context respects section binding
  // GIVEN: Section bound to specific server
  // WHEN: buildToolContext() called for that section
  // THEN: Only bound server's tools included
  
  // TEST: Tool execution callback works
  // GIVEN: AIToolContext with executeTool callback
  // WHEN: AI requests tool execution
  // THEN: Tool executed, result returned to AI
  ```

---

## Phase 3.3: Type Definitions (ONLY after tests are failing)

- [X] **T012** [P] **Define core types** in `src/mcp/types.ts`
  - Export interfaces: MCPServerConfig, SectionBinding, ToolInvocationRequest, ToolExecutionResult, ServerHealthStatus, ExecutionTracker, AIToolContext
  - Add type guards for validation (e.g., `isMCPServerConfig()`)
  - Export enums: ConnectionState, ExecutionStatus, DeploymentType, TransportProtocol

- [X] **T013** [P] **Define error types** in `src/mcp/errors.ts`
  - Export custom errors: ConnectionError, ToolNotFoundError, ValidationError, TimeoutError, ExecutionLimitError, DockerError, ServerNotAvailableError, ToolExecutionError
  - Each error includes message, cause, and relevant context

---

## Phase 3.4: Core Implementation (Make tests pass)

### MCP Client Layer

- [X] **T014** **Implement MCPClient base** in `src/mcp/client.ts`
  - Implement connect(), disconnect(), isConnected()
  - Handle transport abstraction (stdio vs SSE)
  - Implement listTools() using MCP SDK
  - Implement callTool() with timeout enforcement
  - Add connection state tracking

- [X] **T015** **Implement stdio transport** in `src/mcp/client.ts` (continued)
  - Use StdioClientTransport from @modelcontextprotocol/sdk
  - Configure Docker exec command for stdio communication
  - Handle stdin/stdout piping

- [X] **T016** **Implement SSE transport** in `src/mcp/client.ts` (continued)
  - Use SSEClientTransport from @modelcontextprotocol/sdk
  - Configure EventSource for remote servers
  - Handle SSE connection lifecycle

### Docker Integration Layer

- [X] **T017** [P] **Implement Docker API client** in `src/mcp/docker.ts`
  - Implement createContainer() using Docker HTTP API
  - Implement startContainer(), stopContainer(), removeContainer()
  - Implement getContainerStatus() for health checks
  - Handle Unix socket (Linux/Mac) and HTTP (Windows) connections
  - Parse Docker API errors (port conflicts, image not found, etc.)

### Health Monitoring Layer

- [X] **T018** **Implement retry strategy** in `src/mcp/healthMonitor.ts`
  - Implement RetryStrategy class with exponential backoff (1s, 5s, 15s)
  - Add jitter (±1s) to prevent thundering herd
  - Track retry attempt count per server

- [X] **T019** **Implement health monitoring** in `src/mcp/healthMonitor.ts` (continued)
  - Start 30s interval health check loop
  - Ping each connected server
  - On failure: increment failure count, schedule retry
  - On success: reset failure count
  - On 3 failures: auto-disable server, emit event

### Server Manager Layer

- [X] **T020** **Implement MCPServerManager** in `src/mcp/manager.ts`
  - Implement initialize() to start enabled servers
  - Implement startServer() with Docker/remote branching logic
  - Implement stopServer() with cleanup
  - Implement getClient() to return connected MCPClient
  - Maintain map of serverId → MCPClient

- [X] **T021** **Integrate health monitor** in `src/mcp/manager.ts` (continued)
  - Initialize HealthMonitor for all servers
  - Subscribe to health events (failure, auto-disable)
  - Update server state based on health events
  - Implement reenableServer() to reset health state

- [X] **T022** **Add event emitter** in `src/mcp/manager.ts` (continued)
  - Emit events: 'server-started', 'server-stopped', 'server-failed', 'server-auto-disabled'
  - Allow subscribers via on() method

### Tool Executor Layer

- [X] **T023** **Implement ExecutionTracker** in `src/mcp/executor.ts`
  - Track active executions Set<requestId>
  - Implement canExecute() checking stopped, concurrent limit, session limit
  - Implement increment(), stop(), reset()
  - Maintain execution history array

- [X] **T024** **Implement ToolExecutor** in `src/mcp/executor.ts` (continued)
  - Implement executeTool() main flow:
    1. Check canExecute()
    2. Get MCPClient from manager
    3. Create ToolInvocationRequest
    4. Call client.callTool() with timeout
    5. Update execution tracker
    6. Return ToolExecutionResult
  - Handle retry on transient failures
  - Implement cancelExecution()

### Code Block Processor Layer

- [X] **T025** **Implement YAML parsing** in `src/mcp/codeBlockProcessor.ts`
  - Implement parseYAMLParameters() using yaml library
  - Handle parse errors gracefully
  - Validate parameter structure

- [X] **T026** **Implement tool invocation parsing** in `src/mcp/codeBlockProcessor.ts` (continued)
  - Implement parseToolInvocation()
  - Extract "tool: name" line
  - Parse remaining lines as YAML
  - Resolve server name to serverId

- [X] **T027** **Implement result rendering** in `src/mcp/codeBlockProcessor.ts` (continued)
  - Implement renderResult() for success
  - Implement renderError() for failures
  - Implement renderStatus() for pending/executing
  - Format output based on contentType (text/json/markdown)

### Module Exports

- [X] **T028** [P] **Create public API** in `src/mcp/index.ts`
  - Export MCPClient, MCPServerManager, ToolExecutor, CodeBlockProcessor
  - Export all types from types.ts
  - Export utility functions if any

---

## Phase 3.5: Integration

### Settings Integration

- [X] **T029** **Extend PluginSettings** in `src/settings.ts`
  - Add `mcpServers: MCPServerConfig[]`
  - Add `mcpGlobalTimeout: number` (default 30000)
  - Add `mcpConcurrentLimit: number` (default 25)
  - Add `mcpSessionLimit: number` (default 25)
  - Update DEFAULT_SETTINGS object

- [ ] **T030** **Add MCP settings UI** in `src/settingTab.ts`
  - Add "MCP Servers" section header
  - Add global settings inputs (timeout, concurrent limit, session limit)
  - Add server list display with enable/disable toggles
  - Add "Add Server" button → modal for server configuration
  - Add "Test Connection" button per server
  - Add "Delete Server" button per server
  - Show connection status (connected/disconnected/error)
  - Show last connection timestamp

### Plugin Lifecycle Integration

- [X] **T031** **Initialize MCP in plugin** in `src/main.ts`
  - Import MCPServerManager, ToolExecutor, CodeBlockProcessor
  - Create manager instance in onload()
  - Initialize manager with settings.mcpServers
  - Store manager in plugin class property

- [X] **T032** **Register code block processor** in `src/main.ts` (continued)
  - Use registerMarkdownCodeBlockProcessor() for each server name
  - Hook to CodeBlockProcessor.parseToolInvocation()
  - Execute tool via ToolExecutor
  - Render result via CodeBlockProcessor

- [X] **T033** **Add shutdown cleanup** in `src/main.ts` (continued)
  - Call manager.shutdown() in onunload()
  - Stop all active tool executions
  - Cleanup Docker containers if managed

### Command Integration

- [X] **T034** [P] **Add MCP commands** in `src/commands/mcpCommands.ts`
  - Command: "MCP: Stop Executions" → call executor.stop()
  - Command: "MCP: Show Execution History" → display history in modal
  - Command: "MCP: Reset Session Limits" → call executor.reset()
  - Export command definitions

- [X] **T035** **Register MCP commands** in `src/main.ts` (continued)
  - Import MCP commands from mcpCommands.ts
  - Register each command in onload()

### Provider Integration

- [ ] **T036** **Extend provider message formatting** in `src/providers/index.ts`
  - Add buildAIToolContext() helper function
  - Filter tools by enabled servers
  - Apply section bindings if applicable
  - Export for use in providers

- [ ] **T037** **Integrate tools with Claude provider** in `src/providers/claude.ts`
  - Import buildAIToolContext()
  - Inject tool descriptions into system message
  - Parse Claude tool_use responses
  - Execute tools via ToolExecutor
  - Inject results back into conversation

---

## Phase 3.6: Integration Tests [P]

- [ ] **T038** [P] **End-to-end lifecycle test** in `tests/integration/mcpLifecycle.test.ts`
  ```typescript
  // TEST: Full lifecycle - start, health check, stop
  // GIVEN: Complete plugin setup with test MCP server
  // WHEN: Plugin loads, server enabled, server disabled, plugin unloads
  // THEN: Docker container lifecycle matches, no resource leaks
  ```

- [ ] **T039** [P] **End-to-end tool execution test** in `tests/integration/toolExecution.test.ts`
  ```typescript
  // TEST: User code block → tool execution → result rendering
  // GIVEN: Code block in document with tool invocation
  // WHEN: Code block processed
  // THEN: Tool executed, result rendered in document
  
  // TEST: AI requests tool → execution → result injection
  // GIVEN: AI conversation with available tools
  // WHEN: AI requests tool execution
  // THEN: Tool executed, result injected into context, AI responds
  ```

---

## Phase 3.7: Polish

- [ ] **T040** [P] **Unit tests for edge cases** in `tests/mcp/` (various files)
  - Test invalid server configurations
  - Test tool parameter validation
  - Test timeout edge cases
  - Test concurrent execution edge cases

- [ ] **T041** **Verify npm run lint passes** (zero warnings)
  - Fix any linting errors in MCP module
  - Ensure no unused imports
  - Verify TypeScript strict mode compliance

- [ ] **T042** **Manual quickstart validation**
  - Execute all 7 scenarios from quickstart.md
  - Verify each success criteria
  - Document any issues found

- [ ] **T043** [P] **Update README.md** with MCP documentation
  - Add MCP Servers section
  - Document configuration steps
  - Provide example code blocks
  - List supported transports (stdio, SSE)

- [ ] **T044** **Remove code duplication**
  - Extract common patterns from client.ts
  - Consolidate error handling
  - Refactor repeated validation logic

- [ ] **T045** **Performance validation**
  - Measure tool execution latency (<30s timeout)
  - Verify concurrent execution handling (25 default)
  - Test health check overhead (<100ms per server)

---

## Dependencies

### Critical Path
```
Setup (T001-T003)
  ↓
Tests (T004-T011) [All must be written and failing]
  ↓
Types (T012-T013) [P]
  ↓
Client (T014-T016)
  ↓
Docker (T017) [P] + HealthMonitor (T018-T019) [P]
  ↓
Manager (T020-T022)
  ↓
Executor (T023-T024) + CodeBlockProcessor (T025-T027) [P]
  ↓
Module Exports (T028)
  ↓
Settings (T029-T030)
  ↓
Plugin Integration (T031-T033)
  ↓
Commands (T034-T035) [P] + Provider Integration (T036-T037) [P]
  ↓
Integration Tests (T038-T039) [P]
  ↓
Polish (T040-T045) [mostly P]
```

### Parallel Opportunities
- **T002, T003**: Setup tasks (different files)
- **T004-T011**: All test files (different files)
- **T012, T013**: Type definitions (different files)
- **T017**: Docker layer can develop in parallel with T018-T019 (HealthMonitor)
- **T023-T024, T025-T027**: Executor and CodeBlockProcessor (different files)
- **T034-T035, T036-T037**: Commands and Provider integration (different concerns)
- **T038-T039**: Integration tests (different files)
- **T040, T043, T044**: Polish tasks (different files)

---

## Parallel Execution Examples

### Example 1: Launch all contract tests together (T004-T010)
```
Task: "Contract test: MCPClient stdio transport in tests/mcp/client-stdio.test.ts"
Task: "Contract test: MCPClient SSE transport in tests/mcp/client-sse.test.ts"
Task: "Contract test: MCPServerManager lifecycle in tests/mcp/manager.test.ts"
Task: "Contract test: ToolExecutor limits in tests/mcp/executor.test.ts"
Task: "Contract test: Docker integration in tests/mcp/docker.test.ts"
Task: "Contract test: HealthMonitor retry logic in tests/mcp/healthMonitor.test.ts"
Task: "Contract test: CodeBlockProcessor parsing in tests/mcp/codeBlockProcessor.test.ts"
```

### Example 2: Parallel type definitions (T012-T013)
```
Task: "Define core types in src/mcp/types.ts"
Task: "Define error types in src/mcp/errors.ts"
```

### Example 3: Parallel integration tasks (T034-T037)
```
Task: "Add MCP commands in src/commands/mcpCommands.ts"
Task: "Extend provider message formatting in src/providers/index.ts"
```

---

## Notes

- **[P] tasks** = different files, no dependencies, can run in parallel
- **Verify tests fail** before implementing (Red phase of TDD)
- **Run `npm run lint`** after each implementation task
- **Commit after each task** with descriptive message
- **GIVEN/WHEN/THEN** format mandatory for all tests
- **TypeScript strict mode** compliance required throughout
- **No `any` types** without justification
- Avoid: vague tasks, same file conflicts, skipping tests

---

## Validation Checklist (Pre-Merge)

### TDD Compliance
- [ ] All tests written before implementation
- [ ] All tests initially failed (Red)
- [ ] All tests now pass (Green)
- [ ] Code refactored for clarity (Refactor)

### Constitution Compliance
- [ ] GIVEN/WHEN/THEN format used in all tests
- [ ] Business purpose explained in test comments
- [ ] TypeScript strict mode enforced
- [ ] No unused variables (except `_` prefixed)
- [ ] `npm run lint` passes with zero warnings

### Functional Coverage
- [ ] All 42 functional requirements testable
- [ ] All 7 quickstart scenarios pass
- [ ] All edge cases from spec covered

### Integration
- [ ] Settings UI functional
- [ ] Code block processing works
- [ ] AI tool execution works
- [ ] Docker lifecycle works
- [ ] Health monitoring works
- [ ] Execution limits enforced

---

**Total Tasks**: 45 (Setup: 3, Tests: 8, Types: 2, Implementation: 17, Integration: 9, Polish: 6)

**Estimated Effort**: 15-20 development days (with TDD discipline)

**Ready for execution** - Follow task order, maintain TDD discipline, commit frequently.
