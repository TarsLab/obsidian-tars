# Reusable MCP Server Management Library - Extraction Plan

**Created**: 2025-10-10-143926
**Status**: Planning
**Total Story Points**: 50
**Estimated Timeline**: 4 weeks

---

## Executive Summary

This document outlines the strategy for extracting MCP server management functionality from the obsidian-tars plugin into a reusable, platform-agnostic library. The goal is to create a standalone package that can be used in any Node.js/TypeScript project while maintaining 100% backward compatibility with the existing plugin.

---

## Table of Contents

1. [Current Architecture Analysis](#current-architecture-analysis)
2. [Extraction Strategy](#extraction-strategy)
3. [Library Design](#library-design)
4. [Migration Approach](#migration-approach)
5. [Success Criteria](#success-criteria)
6. [Risk Analysis](#risk-analysis)
7. [Timeline](#timeline)
8. [Decision Log](#decision-log)

---

## Current Architecture Analysis

### Overview

The obsidian-tars plugin contains a well-architected MCP integration spanning **~25 TypeScript files** in `/src/mcp/` with **143 story points** of completed implementation work (Epics 100-400).

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Obsidian Integration                      │
│  (UI, Commands, Settings, Document Handlers, Code Blocks)   │
├─────────────────────────────────────────────────────────────┤
│                   Provider Integration                       │
│      (Claude, OpenAI, Ollama Adapters & Parsers)           │
├─────────────────────────────────────────────────────────────┤
│                  Tool Execution Engine                       │
│   (Concurrent Limits, Tracking, History, Cancellation)     │
├─────────────────────────────────────────────────────────────┤
│                 Multi-Turn Orchestration                     │
│    (Streaming Parser, Tool Call Detection, LLM Loop)       │
├─────────────────────────────────────────────────────────────┤
│                  Server Management Core                      │
│  (Lifecycle, Health, Retry, Configuration, mcp-use)        │
├─────────────────────────────────────────────────────────────┤
│                   Utilities & Types                          │
│    (Errors, Logging, Validation, Type Guards, Cache)       │
└─────────────────────────────────────────────────────────────┘
```

### Existing File Structure

**Core Server Management** (Library Candidates):
- `managerMCPUse.ts` (503 lines) - Server lifecycle, health, sessions
- `mcpUseAdapter.ts` (105 lines) - Config format conversion
- `config.ts` (~150 lines) - Configuration parsing
- `migration.ts` (~100 lines) - Config version migration

**Tool Execution** (Library Candidates):
- `executor.ts` (457 lines) - Execution engine with limits & tracking
- `toolCallingCoordinator.ts` (509 lines) - Multi-turn LLM orchestration
- `toolDiscoveryCache.ts` (~150 lines) - Tool discovery caching

**Provider Integration** (Library Candidates):
- `adapters/ClaudeProviderAdapter.ts` (~150 lines)
- `adapters/OpenAIProviderAdapter.ts` (~150 lines)
- `adapters/OllamaProviderAdapter.ts` (~180 lines)
- `toolResponseParser.ts` (~300 lines) - Streaming parsers
- `providerIntegration.ts` (~120 lines)
- `providerToolIntegration.ts` (~150 lines)

**Support Utilities** (Library Candidates):
- `types.ts` (269 lines) - Core type definitions
- `errors.ts` (~100 lines) - Custom error classes
- `retryUtils.ts` (~120 lines) - Exponential backoff
- `utils.ts` (~80 lines) - Logging and utilities

**Obsidian-Specific** (Keep in Plugin):
- `codeBlockProcessor.ts` (235 lines) - Markdown code block processing
- `documentSessionHandlers.ts` (~50 lines) - Obsidian lifecycle hooks
- `toolResultCache.ts` (~190 lines) - Document-aware result caching

### Dependencies

**External Libraries**:
- `mcp-use` (v0.1.0) - Core MCP protocol implementation
- `@modelcontextprotocol/sdk` (v1.18.2) - MCP protocol types

**Obsidian APIs Used** (to be abstracted):
- `Editor` - Text manipulation
- `Notice` - User notifications
- `StatusBarManager` - Error logging
- Logger (`createLogger`)

---

## Extraction Strategy

### Guiding Principles

1. **Zero Breaking Changes** - Plugin functionality must remain identical
2. **Platform Agnostic** - Library has no Obsidian dependencies
3. **Dependency Injection** - Platform-specific features are injected
4. **Event-Driven** - Library emits events, consumers react
5. **Web Standards** - Prefer Web APIs over Node.js-specific APIs
6. **Testability** - Library is fully testable in isolation

### What Gets Extracted

#### ✅ **Core Library Components**

```
@tars/mcp-manager/
├── src/
│   ├── core/
│   │   ├── manager.ts              # Server lifecycle management
│   │   ├── executor.ts             # Tool execution engine
│   │   ├── coordinator.ts          # Multi-turn conversation orchestrator
│   │   └── types.ts                # Core type definitions
│   │
│   ├── adapters/
│   │   ├── config/
│   │   │   ├── parser.ts           # Parse URL/JSON/Shell configs
│   │   │   ├── converter.ts        # Convert to mcp-use format
│   │   │   └── migration.ts        # Version migration utilities
│   │   │
│   │   └── providers/
│   │       ├── base.ts             # ProviderAdapter interface
│   │       ├── claude.ts           # Claude provider adapter
│   │       ├── openai.ts           # OpenAI provider adapter
│   │       ├── ollama.ts           # Ollama provider adapter
│   │       └── parsers.ts          # Streaming response parsers
│   │
│   ├── caching/
│   │   └── toolDiscovery.ts        # Tool-to-server mapping cache
│   │
│   ├── utils/
│   │   ├── errors.ts               # Custom error classes
│   │   ├── retry.ts                # Exponential backoff with jitter
│   │   ├── logging.ts              # Logger abstraction
│   │   └── validation.ts           # Type guards
│   │
│   └── index.ts                    # Public API exports
│
├── tests/                          # Comprehensive test suite
├── package.json
├── tsconfig.json
└── README.md
```

#### ❌ **Keep in Plugin (Obsidian-Specific)**

```
src/
├── mcp/
│   ├── codeBlockProcessor.ts         # Markdown ```mcp-tool parsing
│   ├── documentSessionHandlers.ts    # active-leaf-change, vault.delete hooks
│   └── toolResultCache.ts            # Document-aware caching (uses Editor API)
│
├── modals/
│   ├── toolBrowserModal.ts           # UI for browsing tools
│   └── mcpStatusModal.ts             # Server status modal
│
├── suggests/
│   ├── mcpToolSuggest.ts             # Tool name auto-completion
│   └── mcpParameterSuggest.ts        # Parameter auto-completion
│
├── commands/
│   └── mcpCommands.ts                # Obsidian command palette integration
│
├── settings/
│   └── MCPServerSettings.ts          # Settings UI
│
└── statusBarManager.ts               # Status bar integration
```

### Abstraction Points

#### **1. Logging Abstraction**

**Current** (Obsidian-specific):
```typescript
import { createLogger } from '../logger'
const logger = createLogger('mcp:manager')
```

**New** (Injected):
```typescript
interface LoggerAdapter {
  debug(message: string, context?: any): void
  info(message: string, context?: any): void
  warn(message: string, context?: any): void
  error(message: string, error?: Error, context?: any): void
}

class MCPServerManager {
  constructor(private logger: LoggerAdapter = consoleLogger) {}
}
```

#### **2. Error Reporting Abstraction**

**Current** (Obsidian-specific):
```typescript
this.statusBarManager?.logError('mcp', message, error, context)
```

**New** (Injected):
```typescript
interface ErrorReporter {
  report(category: string, message: string, error: Error, context: any): void
}

class ToolExecutor {
  constructor(
    private manager: MCPServerManager,
    private errorReporter?: ErrorReporter
  ) {}
}
```

#### **3. Event System**

**Current** (Node.js EventEmitter):
```typescript
import { EventEmitter } from 'node:events'
class MCPServerManager extends EventEmitter {}
```

**New** (Web EventTarget - platform agnostic):
```typescript
class MCPServerManager extends EventTarget {
  // Works in browser and Node.js
  dispatchEvent(new CustomEvent('server-started', { detail: { serverId } }))
}
```

#### **4. UI Callbacks**

**Current** (Direct Editor manipulation):
```typescript
function insertToolCallMarkdown(editor: Editor, toolName: string) {
  editor.replaceRange(markdown, cursor)
}
```

**New** (Callback pattern):
```typescript
interface ToolCoordinatorCallbacks {
  onToolCall?: (toolName: string, server: ToolServerInfo, params: any) => void
  onToolResult?: (toolName: string, result: ToolExecutionResult) => void
}

coordinator.generateWithTools(messages, adapter, executor, {
  onToolCall: (name, server, params) => {
    // Plugin inserts markdown
  }
})
```

#### **5. Document Sessions**

**Current** (Plugin manages document-scoped sessions):
```typescript
// Plugin layer
function onActiveLeafChange(leaf: WorkspaceLeaf) {
  const documentPath = leaf.view.file?.path
  executor.switchDocument(documentPath)
}
```

**Library** (Generic session API):
```typescript
// Library provides session primitives
executor.createSession(sessionId: string)
executor.switchSession(sessionId: string)
executor.getSessionStats(sessionId: string)
```

---

## Library Design

### Public API

```typescript
// ============================================================================
// Core Exports
// ============================================================================

export {
  // Core Classes
  MCPServerManager,
  ToolExecutor,
  ToolCallingCoordinator,

  // Provider Adapters
  ClaudeProviderAdapter,
  OpenAIProviderAdapter,
  OllamaProviderAdapter,
  ProviderAdapter, // Interface

  // Configuration
  parseConfigInput,
  toMCPUseFormat,
  migrateServerConfigs,
  needsMigration,

  // Types
  MCPServerConfig,
  ToolExecutionResult,
  ToolExecutionRequest,
  ExecutionTracker,
  ServerHealthStatus,
  ConnectionState,
  RetryPolicy,

  // Utilities
  DEFAULT_RETRY_POLICY,
  withRetry,

  // Errors
  ServerNotAvailableError,
  ExecutionLimitError,
  ServerConnectionError,
  ToolExecutionError,

  // Abstractions (for dependency injection)
  LoggerAdapter,
  ErrorReporter
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createManager(options?: {
  logger?: LoggerAdapter
  errorReporter?: ErrorReporter
  failureThreshold?: number
  retryPolicy?: RetryPolicy
}): MCPServerManager

export function createExecutor(
  manager: MCPServerManager,
  options?: {
    timeout?: number
    concurrentLimit?: number
    sessionLimit?: number
    logger?: LoggerAdapter
    errorReporter?: ErrorReporter
  }
): ToolExecutor

export function createCoordinator(): ToolCallingCoordinator

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_MCP_TIMEOUT = 30000
export const DEFAULT_CONCURRENT_LIMIT = 3
export const DEFAULT_SESSION_LIMIT = 25
export const HEALTH_CHECK_INTERVAL = 30000
```

### Usage Example

```typescript
import {
  createManager,
  createExecutor,
  createCoordinator,
  ClaudeProviderAdapter
} from '@tars/mcp-manager'

// 1. Setup with custom logger
const manager = createManager({
  logger: {
    debug: (msg, ctx) => console.debug(msg, ctx),
    info: (msg, ctx) => console.info(msg, ctx),
    warn: (msg, ctx) => console.warn(msg, ctx),
    error: (msg, err, ctx) => console.error(msg, err, ctx)
  }
})

// 2. Initialize servers
await manager.initialize([
  {
    id: 'memory',
    name: 'Memory Server',
    configInput: 'npx @modelcontextprotocol/server-memory',
    enabled: true,
    failureCount: 0,
    autoDisabled: false
  }
])

// 3. Create executor
const executor = createExecutor(manager, {
  sessionLimit: 50,
  concurrentLimit: 5
})

// 4. Execute a tool
const result = await executor.executeTool({
  serverId: 'memory',
  toolName: 'store_memory',
  parameters: { key: 'user_name', value: 'Alice' },
  source: 'user-codeblock',
  documentPath: '/notes/test.md'
})

// 5. Multi-turn conversation with Claude
const coordinator = createCoordinator()
const adapter = new ClaudeProviderAdapter({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-5-sonnet-20241022',
  manager,
  executor
})

const messages = [
  { role: 'user', content: 'Remember my name is Alice' }
]

for await (const chunk of coordinator.generateWithTools(
  messages,
  adapter,
  executor,
  {
    maxTurns: 10,
    documentPath: '/notes/test.md',
    onToolCall: (toolName) => console.log(`Calling: ${toolName}`),
    onToolResult: (toolName, duration) => console.log(`${toolName}: ${duration}ms`)
  }
)) {
  process.stdout.write(chunk)
}
```

### Key Features

1. **Server Management**
   - Start/stop/restart servers
   - Health monitoring with exponential backoff retry
   - Auto-disable after repeated failures
   - Connection state tracking
   - Session management via `mcp-use`

2. **Tool Execution**
   - Concurrent execution limits
   - Per-session execution limits (global or per-document)
   - Execution history tracking
   - Timeout handling
   - Cancellation support via AbortSignal
   - Error tracking and reporting

3. **Multi-Turn Orchestration**
   - Parse streaming LLM responses
   - Extract tool calls from various formats
   - Execute tools automatically
   - Inject results back into conversation
   - Continue until final text response

4. **Provider Adapters**
   - Abstract interface for LLM providers
   - Built-in support for Claude, OpenAI, Ollama
   - Streaming response parsing
   - Tool schema conversion (provider-specific)
   - Result formatting

5. **Configuration Management**
   - Parse command strings, JSON configs, URLs
   - Convert to `mcp-use` format
   - Version migration utilities
   - Validation and error reporting

6. **Caching**
   - Tool discovery cache (avoid repeated lookups)
   - Invalidation on server changes
   - Metrics tracking

7. **Error Handling**
   - Custom error classes
   - Exponential backoff with jitter
   - Retry policies
   - Detailed error context

---

## Migration Approach

### Phase 1: Setup & Foundation (Week 1)

**Goals**:
- Establish monorepo structure
- Extract core types
- Setup build & test infrastructure

**Tasks**:
1. Initialize pnpm workspace
2. Create `packages/mcp-manager/` structure
3. Configure TypeScript project references
4. Setup Jest/Vitest for library tests
5. Extract and refactor `types.ts`
6. Create abstraction interfaces (Logger, ErrorReporter)

### Phase 2: Core Components (Week 2)

**Goals**:
- Extract server management
- Extract execution engine
- Maintain test coverage

**Tasks**:
1. Extract `managerMCPUse.ts` → `core/manager.ts`
2. Remove logger dependency, add injection
3. Replace Node.js EventEmitter with EventTarget
4. Extract `executor.ts` → `core/executor.ts`
5. Remove document session logic (keep session API)
6. Add ErrorReporter injection
7. Migrate and update tests

### Phase 3: Orchestration & Adapters (Week 2-3)

**Goals**:
- Extract multi-turn coordinator
- Extract provider adapters
- Extract configuration utilities

**Tasks**:
1. Extract `toolCallingCoordinator.ts` → `core/coordinator.ts`
2. Remove Editor parameter, add callback pattern
3. Extract `toolResponseParser.ts` → `adapters/providers/parsers.ts`
4. Extract provider adapters → `adapters/providers/`
5. Extract config utilities → `adapters/config/`
6. Migrate all tests

### Phase 4: Integration & Testing (Week 3-4)

**Goals**:
- Update plugin to use library
- Comprehensive end-to-end testing
- Documentation

**Tasks**:
1. Install library as plugin dependency
2. Wire up dependency injection
3. Update all plugin imports
4. Implement Obsidian-specific adapters
5. Test all provider flows
6. Test error scenarios
7. Performance benchmarking
8. Write API documentation
9. Create migration guide
10. Add usage examples

### Rollback Plan

If critical issues arise:
1. **Revert commits** - Git history preserved at each phase
2. **Feature flag** - Toggle library vs. old code
3. **Gradual migration** - Migrate one component at a time

---

## Success Criteria

### Functional Requirements

- ✅ All existing plugin functionality works identically
- ✅ All existing tests pass
- ✅ Library can be imported in vanilla Node.js/TypeScript projects
- ✅ Zero Obsidian API dependencies in library code
- ✅ Provider adapters work with all supported LLMs

### Non-Functional Requirements

- ✅ Performance is equal or better (target: within 5%)
- ✅ Bundle size increase is minimal (<50KB)
- ✅ Test coverage maintained at ≥80%
- ✅ Documentation is comprehensive
- ✅ Type safety is preserved
- ✅ No memory leaks

### Acceptance Tests

1. **Library Independence Test**
   - Create standalone Node.js script
   - Import library
   - Initialize manager
   - Execute tool
   - Verify no Obsidian imports

2. **Plugin Compatibility Test**
   - Run full plugin test suite
   - All tests pass
   - Manual testing checklist complete

3. **Provider Integration Test**
   - Test Claude provider end-to-end
   - Test OpenAI provider end-to-end
   - Test Ollama provider end-to-end
   - Verify tool calling works in each

4. **Error Handling Test**
   - Simulate server failures
   - Verify retry logic
   - Verify auto-disable
   - Verify error reporting

5. **Performance Test**
   - Benchmark tool execution latency
   - Benchmark memory usage
   - Compare with baseline
   - Verify within acceptable range

---

## Risk Analysis

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Breaking changes to plugin | Medium | High | Comprehensive test suite, gradual migration |
| Performance degradation | Low | Medium | Benchmarking at each phase, profiling |
| Type safety issues | Low | Medium | Strict TypeScript, extensive type tests |
| Memory leaks | Low | High | Memory profiling, leak detection tests |
| mcp-use compatibility | Low | High | Version pinning, integration tests |

### Process Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Timeline overrun | Medium | Low | Phased approach, clear milestones |
| Scope creep | Medium | Medium | Strict scope definition, defer enhancements |
| Testing gaps | Low | High | Test migration checklist, coverage metrics |
| Documentation lag | Medium | Low | Write docs during implementation |

### Dependency Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| mcp-use breaking changes | Low | High | Pin version, monitor releases |
| Node.js version compatibility | Low | Medium | Test on multiple Node versions |
| TypeScript version issues | Low | Low | Use compatible TS features |

---

## Timeline

### Week 1: Setup & Foundation (12 SP)
- **Days 1-2**: Monorepo setup, type extraction
- **Days 3-5**: Abstraction interfaces, build config

### Week 2: Core Extraction (16 SP)
- **Days 1-3**: Manager + Executor extraction
- **Days 4-5**: Test migration, bug fixes

### Week 3: Adapters & Config (14 SP)
- **Days 1-2**: Coordinator extraction
- **Days 3-4**: Provider adapters
- **Day 5**: Config utilities

### Week 4: Integration & Polish (8 SP)
- **Days 1-2**: Plugin integration
- **Days 3-4**: Testing & documentation
- **Day 5**: Final review, release prep

**Total**: 50 Story Points over 4 weeks

---

## Decision Log

### 1. Monorepo Tool: pnpm Workspaces ✅

**Options Considered**:
- pnpm workspaces (chosen)
- Turborepo
- Yarn workspaces
- Lerna

**Decision**: pnpm workspaces

**Rationale**:
- Simple setup for smaller monorepos
- Good TypeScript project references support
- No additional tooling complexity
- Fast installation and linking
- Already using pnpm in project

**Trade-offs**:
- No build caching (Turborepo feature)
- Manual build orchestration
- Acceptable for 2-package monorepo

### 2. Event System: EventTarget ✅

**Options Considered**:
- Node.js EventEmitter (current)
- Web EventTarget (chosen)
- Custom event system

**Decision**: Web EventTarget

**Rationale**:
- Platform agnostic (works in browser and Node.js)
- Web standard API
- Better TypeScript support
- No polyfill needed for Node 15+

**Trade-offs**:
- Slightly more verbose API
- Less familiar to Node.js developers
- Better long-term portability

### 3. Tool Result Cache: Keep in Plugin ✅

**Options Considered**:
- Keep in plugin (chosen)
- Extract with document parser abstraction
- Split into generic + plugin-specific

**Decision**: Keep in plugin

**Rationale**:
- Tightly coupled to Obsidian Editor API
- Document parsing is non-trivial to abstract
- Not critical for library reusability
- Plugin can still use library for execution

**Trade-offs**:
- Can't reuse cache in other projects
- Acceptable for v1.0
- Can revisit in future if needed

### 4. Document Sessions: Generic Session API ✅

**Options Considered**:
- Keep document sessions in plugin (full)
- Extract with abstraction (chosen)
- Duplicate logic

**Decision**: Generic session API in library

**Rationale**:
- Library provides session primitives
- Plugin maps documents to sessions
- Reusable for other use cases (e.g., user-based sessions)

**Implementation**:
```typescript
// Library
executor.createSession(sessionId: string)
executor.switchSession(sessionId: string)

// Plugin
const sessionId = activeFile.path
executor.switchSession(sessionId)
```

### 5. Logger Injection: Required Parameter ❌ → Optional with Default

**Options Considered**:
- Required injection
- Optional with no-op default
- Optional with console default (chosen)

**Decision**: Optional with console logger default

**Rationale**:
- Easier to get started
- Production apps can inject custom logger
- Console output useful for debugging

**Implementation**:
```typescript
const consoleLogger: LoggerAdapter = {
  debug: (msg, ctx) => console.debug(msg, ctx),
  info: (msg, ctx) => console.info(msg, ctx),
  warn: (msg, ctx) => console.warn(msg, ctx),
  error: (msg, err, ctx) => console.error(msg, err, ctx)
}

class MCPServerManager {
  constructor(private logger: LoggerAdapter = consoleLogger) {}
}
```

### 6. Package Naming: @tars/mcp-manager ✅ (Tentative)

**Options Considered**:
- `@tars/mcp-manager` (chosen)
- `@obsidian-tars/mcp-sdk`
- `mcp-coordination` (generic)

**Decision**: `@tars/mcp-manager` (pending confirmation)

**Rationale**:
- Clear namespace
- Descriptive name
- Room for other @tars packages
- Can change before publishing

### 7. Testing Strategy: Migrate Tests to Library

**Decision**: Copy tests to library, update plugin tests

**Rationale**:
- Library needs comprehensive test suite
- Plugin tests verify integration
- Avoid duplication by testing at right level

**Implementation**:
- Unit tests → Library
- Integration tests → Split (library + plugin)
- E2E tests → Plugin

---

## Open Questions

1. **Package Name**: Confirm `@tars/mcp-manager` or suggest alternative?

2. **Publishing Strategy**:
   - Private monorepo package only?
   - Publish to npm publicly?
   - Publish under @tars organization?

3. **Versioning**:
   - Independent versioning (library vs plugin)?
   - Lock-step versioning?

4. **Priority**:
   - Start extraction immediately?
   - Complete remaining Epics (500, 600, 900, 1000) first?

5. **Scope**:
   - Extract everything possible in v1.0?
   - Start with core essentials, iterate later?

6. **Documentation**:
   - Generate API docs automatically (TypeDoc)?
   - Write manual documentation?
   - Both?

---

## Next Steps

1. **Confirm Decisions**: Review open questions, finalize choices
2. **Create Task Breakdown**: Generate detailed Epic/Feature/Story/Task structure
3. **Setup Repository**: Initialize monorepo structure
4. **Begin Phase 1**: Start with foundation work

---

## References

- [MCP Integration Review](./2025-10-03-mcp-integration-review.md)
- [MCP Planning v2](./2025-10-03-planning-v2.md)
- [MCP Tasks Trimmed](./2025-10-07-075907-tasks-trimmed.md)
- [mcp-use Documentation](https://github.com/wong2/mcp-use)
- [Model Context Protocol Spec](https://spec.modelcontextprotocol.io/)

---

## Appendix A: File Extraction Matrix

| Current File | Target Location | Obsidian Deps | Changes Required |
|--------------|----------------|---------------|------------------|
| `managerMCPUse.ts` | `core/manager.ts` | Logger | Remove, inject |
| `executor.ts` | `core/executor.ts` | Logger, StatusBar | Remove, inject |
| `toolCallingCoordinator.ts` | `core/coordinator.ts` | Editor | Remove, callbacks |
| `toolResponseParser.ts` | `adapters/providers/parsers.ts` | None | None |
| `ClaudeProviderAdapter.ts` | `adapters/providers/claude.ts` | None | None |
| `OpenAIProviderAdapter.ts` | `adapters/providers/openai.ts` | None | None |
| `OllamaProviderAdapter.ts` | `adapters/providers/ollama.ts` | None | None |
| `config.ts` | `adapters/config/parser.ts` | None | None |
| `mcpUseAdapter.ts` | `adapters/config/converter.ts` | None | None |
| `migration.ts` | `adapters/config/migration.ts` | None | None |
| `toolDiscoveryCache.ts` | `caching/toolDiscovery.ts` | None | None |
| `types.ts` | `core/types.ts` | None | Remove Obsidian types |
| `errors.ts` | `utils/errors.ts` | None | None |
| `retryUtils.ts` | `utils/retry.ts` | None | None |
| `utils.ts` | `utils/logging.ts` | Logger | Extract abstraction |
| `codeBlockProcessor.ts` | **KEEP IN PLUGIN** | Editor, Plugin | N/A |
| `documentSessionHandlers.ts` | **KEEP IN PLUGIN** | Workspace, Vault | N/A |
| `toolResultCache.ts` | **KEEP IN PLUGIN** | Editor | N/A |

---

## Appendix B: Dependency Injection Examples

### Before (Obsidian-specific)

```typescript
import { EventEmitter } from 'node:events'
import { createLogger } from '../logger'
import type { StatusBarManager } from '../statusBarManager'

const logger = createLogger('mcp:manager')

export class MCPServerManager extends EventEmitter {
  constructor(private statusBarManager?: StatusBarManager) {
    super()
  }

  async startServer(serverId: string) {
    logger.info('starting server', { serverId })
    try {
      // ...
    } catch (error) {
      logger.error('failed to start', error)
      this.statusBarManager?.logError('mcp', 'Failed to start', error)
    }
  }
}
```

### After (Platform-agnostic)

```typescript
export interface LoggerAdapter {
  debug(message: string, context?: any): void
  info(message: string, context?: any): void
  warn(message: string, context?: any): void
  error(message: string, error?: Error, context?: any): void
}

export interface ErrorReporter {
  report(category: string, message: string, error: Error, context: any): void
}

const consoleLogger: LoggerAdapter = {
  debug: (msg, ctx) => console.debug(msg, ctx),
  info: (msg, ctx) => console.info(msg, ctx),
  warn: (msg, ctx) => console.warn(msg, ctx),
  error: (msg, err, ctx) => console.error(msg, err, ctx)
}

export class MCPServerManager extends EventTarget {
  constructor(
    private logger: LoggerAdapter = consoleLogger,
    private errorReporter?: ErrorReporter
  ) {
    super()
  }

  async startServer(serverId: string) {
    this.logger.info('starting server', { serverId })
    try {
      // ...
    } catch (error) {
      this.logger.error('failed to start', error as Error)
      this.errorReporter?.report('mcp', 'Failed to start', error as Error, {})
    }
  }
}
```

---

**End of Plan Document**
