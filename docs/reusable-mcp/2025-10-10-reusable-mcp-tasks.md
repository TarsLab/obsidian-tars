@@ -1,1199 +0,0 @@
# Reusable MCP Library - Detailed Task Breakdown

**Generated from**: `docs/2025-10-10-143926-plan-reusable-mcp.md`
**Timestamp**: 2025-10-10-143926
**Purpose**: Detailed Epic/Feature/UserStory/Task breakdown for MCP library extraction

---

## 📋 Summary

- **Total Story Points**: 50 SP
- **Epics**: 4 (Setup, Core, Adapters, Integration)
- **Timeline**: 4 weeks
- **Risk Level**: Medium
- **Dependencies**: Completion of existing MCP implementation (Epics 100-400)

---

## Epic-800: Monorepo Setup & Foundation

**Priority**: P0
**Story Points**: 12
**Status**: Not Started
**Description**: Establish monorepo structure, extract core types, and setup build/test infrastructure for the reusable library.
**Dependencies**: None
**Risk**: Low - Foundational work with clear requirements

### Feature-800-10: Monorepo Infrastructure

**Priority**: P0
**Story Points**: 5
**Description**: Setup pnpm workspace, TypeScript project references, and build configuration.

#### UserStory-800-10-5: Initialize Workspace Structure

**Priority**: P0
**Story Points**: 5
**Description**: Create monorepo structure with pnpm workspaces and configure builds.

##### Task-800-10-5-1: Create pnpm workspace configuration

**Story Points**: 1
**Priority**: P0
**Files**: `pnpm-workspace.yaml`, `package.json`
**Acceptance Criteria**:
- Given: Root project directory
- When: Creating workspace config
- Then: `pnpm-workspace.yaml` defines packages directory
- And: Root `package.json` has workspace configuration
- And: `pnpm install` correctly links workspace packages

**Implementation Notes**:
```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

##### Task-800-10-5-2: Create library package structure

**Story Points**: 2
**Priority**: P0
**Files**: `packages/mcp-manager/package.json`, `packages/mcp-manager/tsconfig.json`
**Acceptance Criteria**:
- Given: Workspace configuration
- When: Creating library package
- Then: Directory structure matches planned layout
- And: `package.json` has correct name, version, exports
- And: `tsconfig.json` configured for library build
- And: Entry point `src/index.ts` exists

**Directory Structure**:
```
packages/mcp-manager/
├── src/
│   ├── core/
│   ├── adapters/
│   ├── caching/
│   ├── utils/
│   └── index.ts
├── tests/
├── package.json
├── tsconfig.json
└── README.md
```

##### Task-800-10-5-3: Configure TypeScript project references

**Story Points**: 1
**Priority**: P0
**Files**: Root `tsconfig.json`, `packages/mcp-manager/tsconfig.json`, `src/tsconfig.json`
**Acceptance Criteria**:
- Given: Multi-package structure
- When: Configuring TypeScript
- Then: Project references enable incremental builds
- And: Plugin can import from library
- And: Type checking works across packages

##### Task-800-10-5-4: Setup build scripts and test infrastructure

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/package.json`, `vitest.config.ts`
**Acceptance Criteria**:
- Given: Library package
- When: Running `pnpm build`
- Then: Outputs ESM and CJS builds
- And: Type declarations generated
- When: Running `pnpm test`
- Then: Vitest executes library tests
- And: Coverage reports generated

### Feature-800-20: Type System Foundation

**Priority**: P0
**Story Points**: 4
**Description**: Extract and refactor core types, removing Obsidian-specific dependencies.

#### UserStory-800-20-5: Extract Core Types

**Priority**: P0
**Story Points**: 4
**Description**: Move and refactor `types.ts` into library, removing Obsidian dependencies.

##### Task-800-20-5-1: Create core type definitions

**Story Points**: 2
**Priority**: P0
**Files**: `packages/mcp-manager/src/core/types.ts`
**Acceptance Criteria**:
- Given: Existing `src/mcp/types.ts`
- When: Extracting to library
- Then: All MCP-related types preserved
- And: Obsidian-specific types removed
- And: Type guards still work
- And: Documentation comments preserved

**Types to Extract**:
- `MCPServerConfig`
- `ToolExecutionResult`
- `ToolDefinition`
- `ExecutionTracker`
- `ServerHealthStatus`
- `RetryPolicy`
- `ConnectionState`
- `ExecutionStatus`
- All type guards

##### Task-800-20-5-2: Create abstraction interfaces

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/src/utils/logging.ts`, `packages/mcp-manager/src/utils/errors.ts`
**Acceptance Criteria**:
- Given: Need for platform-agnostic interfaces
- When: Defining abstractions
- Then: `LoggerAdapter` interface defined
- And: `ErrorReporter` interface defined
- And: Default console implementations provided
- And: Documentation includes usage examples

**Interface Definitions**:
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

export const consoleLogger: LoggerAdapter = {
  debug: (msg, ctx) => console.debug(msg, ctx),
  info: (msg, ctx) => console.info(msg, ctx),
  warn: (msg, ctx) => console.warn(msg, ctx),
  error: (msg, err, ctx) => console.error(msg, err, ctx)
}
```

##### Task-800-20-5-3: Add comprehensive type tests

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/tests/types.test.ts`
**Acceptance Criteria**:
- Given: Extracted types
- When: Running type tests
- Then: Type guards work correctly
- And: Type inference works as expected
- And: No compilation errors
- And: Runtime validation matches types

### Feature-800-30: Initial Library Exports

**Priority**: P0
**Story Points**: 3
**Description**: Setup public API exports and documentation structure.

#### UserStory-800-30-5: Define Public API

**Priority**: P0
**Story Points**: 3
**Description**: Create index file with organized exports and documentation.

##### Task-800-30-5-1: Create main index file

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/src/index.ts`
**Acceptance Criteria**:
- Given: Library structure
- When: Creating exports
- Then: All public APIs exported
- And: Organized by category
- And: Re-exports work correctly
- And: No internal APIs leaked

##### Task-800-30-5-2: Write README and initial documentation

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/README.md`
**Acceptance Criteria**:
- Given: Library package
- When: Writing README
- Then: Installation instructions provided
- And: Quick start example included
- And: API overview documented
- And: Links to detailed docs

##### Task-800-30-5-3: Setup API documentation generation

**Story Points**: 1
**Priority**: P0
**Files**: `typedoc.json`, `package.json`
**Acceptance Criteria**:
- Given: TypeScript source with JSDoc
- When: Running `pnpm docs`
- Then: TypeDoc generates API documentation
- And: Output is readable and complete
- And: Examples are included

---

## Epic-810: Core Component Extraction

**Priority**: P0
**Story Points**: 16
**Status**: Not Started
**Description**: Extract server manager and tool executor from plugin to library, removing Obsidian dependencies.
**Dependencies**: Epic-800 (Foundation)
**Risk**: Medium - Complex refactoring with careful testing required

### Feature-810-10: Server Manager Extraction

**Priority**: P0
**Story Points**: 8
**Description**: Extract `managerMCPUse.ts` to library, replacing dependencies with injected abstractions.

#### UserStory-810-10-5: Refactor Manager for Platform Independence

**Priority**: P0
**Story Points**: 8
**Description**: Move manager to library, replace Node.js EventEmitter with EventTarget, inject logger.

##### Task-810-10-5-1: Create base manager class

**Story Points**: 2
**Priority**: P0
**Files**: `packages/mcp-manager/src/core/manager.ts`
**Acceptance Criteria**:
- Given: Existing `src/mcp/managerMCPUse.ts`
- When: Copying to library
- Then: File structure matches library conventions
- And: Imports reference library paths
- And: Class extends EventTarget (not EventEmitter)
- And: Constructor accepts LoggerAdapter
- And: Constructor accepts ErrorReporter

**Key Changes**:
```typescript
// Before
import { EventEmitter } from 'node:events'
import { createLogger } from '../logger'
const logger = createLogger('mcp:manager')
export class MCPServerManager extends EventEmitter {}

// After
import type { LoggerAdapter, ErrorReporter } from '../utils'
import { consoleLogger } from '../utils'
export class MCPServerManager extends EventTarget {
  constructor(
    private logger: LoggerAdapter = consoleLogger,
    private errorReporter?: ErrorReporter
  ) {
    super()
  }
}
```

##### Task-810-10-5-2: Replace EventEmitter with EventTarget

**Story Points**: 2
**Priority**: P0
**Files**: `packages/mcp-manager/src/core/manager.ts`
**Acceptance Criteria**:
- Given: Manager class
- When: Replacing event system
- Then: `this.emit()` becomes `this.dispatchEvent()`
- And: Events use CustomEvent with detail
- And: Event types remain the same
- And: Type safety preserved

**Event Migration**:
```typescript
// Before
this.emit('server-started', serverId)

// After
this.dispatchEvent(new CustomEvent('server-started', {
  detail: { serverId }
}))
```

##### Task-810-10-5-3: Replace logger calls with injected logger

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/src/core/manager.ts`
**Acceptance Criteria**:
- Given: Manager with logger import
- When: Refactoring
- Then: `logger.info()` becomes `this.logger.info()`
- And: All log statements use injected logger
- And: Test environment can pass no-op logger

##### Task-810-10-5-4: Replace StatusBarManager with ErrorReporter

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/src/core/manager.ts`
**Acceptance Criteria**:
- Given: Manager with statusBarManager dependency
- When: Refactoring
- Then: `this.statusBarManager?.logError()` becomes `this.errorReporter?.report()`
- And: Error reporting is optional
- And: Context is preserved

##### Task-810-10-5-5: Migrate manager tests to library

**Story Points**: 2
**Priority**: P0
**Files**: `packages/mcp-manager/tests/manager.test.ts`
**Acceptance Criteria**:
- Given: Existing `tests/mcp/managerMCPUse.test.ts`
- When: Migrating to library
- Then: All tests pass with library imports
- And: Mock logger injected in tests
- And: EventTarget events properly tested
- And: Coverage remains ≥80%

### Feature-810-20: Tool Executor Extraction

**Priority**: P0
**Story Points**: 8
**Description**: Extract `executor.ts` to library, removing document session logic and injecting dependencies.

#### UserStory-810-20-5: Refactor Executor for Generic Sessions

**Priority**: P0
**Story Points**: 8
**Description**: Move executor to library with generic session API, remove document-specific logic.

##### Task-810-20-5-1: Create base executor class

**Story Points**: 2
**Priority**: P0
**Files**: `packages/mcp-manager/src/core/executor.ts`
**Acceptance Criteria**:
- Given: Existing `src/mcp/executor.ts`
- When: Copying to library
- Then: File uses library imports
- And: Constructor accepts LoggerAdapter
- And: Constructor accepts ErrorReporter
- And: Document session logic removed

**Key Changes**:
```typescript
// Remove from library
private readonly documentSessions = new Map<string, DocumentSessionState>()

// Keep generic session API
createSession(sessionId: string): void
switchSession(sessionId: string): void
getSessionStats(sessionId: string): SessionStats
```

##### Task-810-20-5-2: Implement generic session API

**Story Points**: 2
**Priority**: P0
**Files**: `packages/mcp-manager/src/core/executor.ts`
**Acceptance Criteria**:
- Given: Need for session tracking
- When: Implementing generic API
- Then: `createSession(id)` creates new session
- And: `switchSession(id)` changes active session
- And: `getSessionStats(id)` returns execution counts
- And: Sessions can be any string identifier

##### Task-810-20-5-3: Remove Obsidian-specific notifications

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/src/core/executor.ts`
**Acceptance Criteria**:
- Given: Executor with Notice usage
- When: Refactoring
- Then: Notifications removed from library
- And: Callback pattern added for limit events
- And: `onLimitReached` callback optional
- And: `onSessionReset` callback optional

**Callback Interface**:
```typescript
export interface ExecutorCallbacks {
  onLimitReached?: (sessionId: string, current: number, limit: number)
    => Promise<'continue' | 'cancel'>
  onSessionReset?: (sessionId: string) => void
}
```

##### Task-810-20-5-4: Replace status bar dependency

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/src/core/executor.ts`
**Acceptance Criteria**:
- Given: Executor with statusBarManager
- When: Refactoring
- Then: Uses injected ErrorReporter
- And: Error logging calls updated
- And: Optional reporter handled gracefully

##### Task-810-20-5-5: Migrate executor tests to library

**Story Points**: 2
**Priority**: P0
**Files**: `packages/mcp-manager/tests/executor.test.ts`
**Acceptance Criteria**:
- Given: Existing `tests/mcp/executor.test.ts`
- When: Migrating to library
- Then: Tests use generic session API
- And: Callback mocks injected
- And: Document-specific tests moved to plugin
- And: Coverage remains ≥80%

---

## Epic-820: Orchestration & Provider Adapters

**Priority**: P0
**Story Points**: 14
**Status**: Not Started
**Description**: Extract multi-turn coordinator, response parsers, and provider adapters to library.
**Dependencies**: Epic-810 (Core Components)
**Risk**: Low - Components already generic

### Feature-820-10: Coordinator Extraction

**Priority**: P0
**Story Points**: 6
**Description**: Extract `toolCallingCoordinator.ts` to library with callback-based UI integration.

#### UserStory-820-10-5: Refactor Coordinator for Callback Pattern

**Priority**: P0
**Story Points**: 6
**Description**: Move coordinator to library, replace Editor manipulation with callbacks.

##### Task-820-10-5-1: Create base coordinator class

**Story Points**: 2
**Priority**: P0
**Files**: `packages/mcp-manager/src/core/coordinator.ts`
**Acceptance Criteria**:
- Given: Existing `src/mcp/toolCallingCoordinator.ts`
- When: Copying to library
- Then: File uses library imports
- And: Class structure preserved
- And: Core orchestration logic intact

##### Task-820-10-5-2: Replace Editor with callbacks

**Story Points**: 2
**Priority**: P0
**Files**: `packages/mcp-manager/src/core/coordinator.ts`
**Acceptance Criteria**:
- Given: Coordinator with Editor parameter
- When: Refactoring
- Then: `editor` parameter removed from options
- And: `onToolCall` callback added to options
- And: `onToolResult` callback added to options
- And: Callbacks receive tool name and data
- And: Markdown insertion removed from library

**Options Interface**:
```typescript
export interface GenerateOptions {
  maxTurns?: number
  onToolCall?: (toolName: string, server: ToolServerInfo, parameters: any) => void
  onToolResult?: (toolName: string, result: ToolExecutionResult) => void
  onPromptCachedResult?: (toolName: string, cached: any) => Promise<'re-execute' | 'use-cached' | 'cancel'>
  autoUseDocumentCache?: boolean
}
```

##### Task-820-10-5-3: Remove markdown insertion functions

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/src/core/coordinator.ts`
**Acceptance Criteria**:
- Given: Coordinator with markdown functions
- When: Refactoring
- Then: `insertToolCallMarkdown()` removed
- And: `insertToolResultMarkdown()` removed
- And: `formatResultContent()` kept as utility
- And: Callbacks invoked at insertion points

##### Task-820-10-5-4: Migrate coordinator tests

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/tests/coordinator.test.ts`
**Acceptance Criteria**:
- Given: Existing coordinator tests
- When: Migrating to library
- Then: Tests use callback mocks
- And: Multi-turn flows tested
- And: Tool execution verified
- And: Coverage ≥80%

### Feature-820-20: Response Parser Extraction

**Priority**: P0
**Story Points**: 3
**Description**: Extract `toolResponseParser.ts` to library (already generic).

#### UserStory-820-20-5: Move Parsers to Library

**Priority**: P0
**Story Points**: 3
**Description**: Copy parser implementations to library with minimal changes.

##### Task-820-20-5-1: Move parser implementations

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/src/adapters/providers/parsers.ts`
**Acceptance Criteria**:
- Given: Existing `src/mcp/toolResponseParser.ts`
- When: Copying to library
- Then: All parser classes preserved
- And: `OpenAIToolResponseParser` works
- And: `ClaudeToolResponseParser` works
- And: `OllamaToolResponseParser` works
- And: Imports updated to library paths

##### Task-820-20-5-2: Migrate parser tests

**Story Points**: 2
**Priority**: P0
**Files**: `packages/mcp-manager/tests/parsers.test.ts`
**Acceptance Criteria**:
- Given: Existing parser tests
- When: Migrating to library
- Then: All tests pass
- And: Coverage includes all parser types
- And: Edge cases covered

### Feature-820-30: Provider Adapter Extraction

**Priority**: P0
**Story Points**: 5
**Description**: Extract Claude, OpenAI, and Ollama provider adapters to library.

#### UserStory-820-30-5: Move Provider Adapters to Library

**Priority**: P0
**Story Points**: 5
**Description**: Copy provider adapter implementations (already generic).

##### Task-820-30-5-1: Move Claude adapter

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/src/adapters/providers/claude.ts`
**Acceptance Criteria**:
- Given: Existing `src/mcp/adapters/ClaudeProviderAdapter.ts`
- When: Copying to library
- Then: Adapter works identically
- And: Imports updated
- And: Tests pass

##### Task-820-30-5-2: Move OpenAI adapter

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/src/adapters/providers/openai.ts`
**Acceptance Criteria**:
- Given: Existing `src/mcp/adapters/OpenAIProviderAdapter.ts`
- When: Copying to library
- Then: Adapter works identically
- And: Factory functions included
- And: Tests pass

##### Task-820-30-5-3: Move Ollama adapter

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/src/adapters/providers/ollama.ts`
**Acceptance Criteria**:
- Given: Existing `src/mcp/adapters/OllamaProviderAdapter.ts`
- When: Copying to library
- Then: Adapter works identically
- And: Tests pass

##### Task-820-30-5-4: Move provider integration utilities

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/src/adapters/providers/integration.ts`
**Acceptance Criteria**:
- Given: Existing `src/mcp/providerIntegration.ts` and `src/mcp/providerToolIntegration.ts`
- When: Copying to library
- Then: Tool format conversion works
- And: Schema builders work
- And: Tests pass

##### Task-820-30-5-5: Create provider adapter exports

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/src/adapters/providers/index.ts`, `packages/mcp-manager/src/index.ts`
**Acceptance Criteria**:
- Given: Copied adapters
- When: Setting up exports
- Then: All adapters exported from library
- And: Base interface exported
- And: Factory functions exported
- And: Documentation includes examples

---

## Epic-830: Configuration & Utilities

**Priority**: P0
**Story Points**: 8
**Status**: Not Started
**Description**: Extract configuration parsing, migration utilities, caching, and helper functions to library.
**Dependencies**: Epic-820 (Adapters)
**Risk**: Low - Utilities are already generic

### Feature-830-10: Configuration Utilities

**Priority**: P0
**Story Points**: 4
**Description**: Extract config parsing, mcp-use adapter, and migration utilities.

#### UserStory-830-10-5: Move Configuration System to Library

**Priority**: P0
**Story Points**: 4
**Description**: Copy config utilities to library (already generic).

##### Task-830-10-5-1: Move config parser

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/src/adapters/config/parser.ts`
**Acceptance Criteria**:
- Given: Existing `src/mcp/config.ts`
- When: Copying to library
- Then: URL parsing works
- And: JSON parsing works
- And: Shell command parsing works
- And: Validation logic intact
- And: Tests pass

##### Task-830-10-5-2: Move mcp-use adapter

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/src/adapters/config/converter.ts`
**Acceptance Criteria**:
- Given: Existing `src/mcp/mcpUseAdapter.ts`
- When: Copying to library
- Then: Config conversion works
- And: mcp-use format correct
- And: Tests pass

##### Task-830-10-5-3: Move migration utilities

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/src/adapters/config/migration.ts`
**Acceptance Criteria**:
- Given: Existing `src/mcp/migration.ts`
- When: Copying to library
- Then: Config migration works
- And: Version detection works
- And: Tests pass

##### Task-830-10-5-4: Migrate config tests

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/tests/config.test.ts`
**Acceptance Criteria**:
- Given: Existing config tests
- When: Migrating to library
- Then: All tests pass
- And: Edge cases covered
- And: Coverage ≥80%

### Feature-830-20: Caching & Retry Utilities

**Priority**: P0
**Story Points**: 4
**Description**: Extract tool discovery cache, retry logic, and error utilities.

#### UserStory-830-20-5: Move Utilities to Library

**Priority**: P0
**Story Points**: 4
**Description**: Copy utility modules to library (already generic).

##### Task-830-20-5-1: Move tool discovery cache

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/src/caching/toolDiscovery.ts`
**Acceptance Criteria**:
- Given: Existing `src/mcp/toolDiscoveryCache.ts`
- When: Copying to library
- Then: Cache functionality works
- And: Invalidation works
- And: Metrics tracking works
- And: Tests pass

##### Task-830-20-5-2: Move retry utilities

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/src/utils/retry.ts`
**Acceptance Criteria**:
- Given: Existing `src/mcp/retryUtils.ts`
- When: Copying to library
- Then: Exponential backoff works
- And: Jitter works
- And: Retry policies work
- And: Tests pass

##### Task-830-20-5-3: Move error classes

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/src/utils/errors.ts`
**Acceptance Criteria**:
- Given: Existing `src/mcp/errors.ts`
- When: Copying to library
- Then: All error classes preserved
- And: Error context preserved
- And: Tests pass

##### Task-830-20-5-4: Move validation utilities

**Story Points**: 1
**Priority**: P0
**Files**: `packages/mcp-manager/src/utils/validation.ts`
**Acceptance Criteria**:
- Given: Existing type guards from `src/mcp/types.ts`
- When: Extracting to utility module
- Then: Type guards work
- And: Runtime validation works
- And: Tests pass

---

## Epic-840: Plugin Integration & Testing

**Priority**: P0
**Story Points**: 8
**Status**: Not Started
**Description**: Update plugin to use library, implement Obsidian-specific adapters, and comprehensive testing.
**Dependencies**: Epic-830 (Utilities)
**Risk**: Medium - Integration requires careful verification

### Feature-840-10: Plugin Refactoring

**Priority**: P0
**Story Points**: 5
**Description**: Update plugin to import from library and implement adapters.

#### UserStory-840-10-5: Update Plugin Imports and Dependencies

**Priority**: P0
**Story Points**: 5
**Description**: Replace local imports with library imports throughout plugin.

##### Task-840-10-5-1: Add library dependency to plugin

**Story Points**: 1
**Priority**: P0
**Files**: `package.json`
**Acceptance Criteria**:
- Given: Plugin package.json
- When: Adding dependency
- Then: `@tars/mcp-manager: workspace:*` added
- And: `pnpm install` links correctly
- And: Plugin can import from library

##### Task-840-10-5-2: Implement LoggerAdapter for Obsidian

**Story Points**: 1
**Priority**: P0
**Files**: `src/mcp/adapters/obsidianLogger.ts`
**Acceptance Criteria**:
- Given: Library LoggerAdapter interface
- When: Implementing adapter
- Then: Wraps Obsidian's createLogger
- And: Log levels map correctly
- And: Context serialization works

**Implementation**:
```typescript
import { createLogger } from '../logger'
import type { LoggerAdapter } from '@tars/mcp-manager'

export function createObsidianLoggerAdapter(namespace: string): LoggerAdapter {
  const logger = createLogger(namespace)
  return {
    debug: (msg, ctx) => logger.debug(msg, ctx),
    info: (msg, ctx) => logger.info(msg, ctx),
    warn: (msg, ctx) => logger.warn(msg, ctx),
    error: (msg, err, ctx) => logger.error(msg, err, ctx)
  }
}
```

##### Task-840-10-5-3: Implement ErrorReporter for StatusBar

**Story Points**: 1
**Priority**: P0
**Files**: `src/mcp/adapters/statusBarErrorReporter.ts`
**Acceptance Criteria**:
- Given: Library ErrorReporter interface
- When: Implementing adapter
- Then: Wraps StatusBarManager.logError
- And: Context passed correctly
- And: Error formatting preserved

##### Task-840-10-5-4: Update all plugin imports

**Story Points**: 2
**Priority**: P0
**Files**: All `src/**/*.ts` files referencing `src/mcp/`
**Acceptance Criteria**:
- Given: Plugin files importing from local mcp
- When: Updating imports
- Then: Library components imported from `@tars/mcp-manager`
- And: Plugin-specific code imports from local
- And: No broken imports
- And: TypeScript compiles successfully

**Migration Pattern**:
```typescript
// Before
import { MCPServerManager, ToolExecutor } from './mcp'

// After
import { MCPServerManager, ToolExecutor } from '@tars/mcp-manager'
import { CodeBlockProcessor } from './mcp/codeBlockProcessor'
```

### Feature-840-20: Document Session Integration

**Priority**: P0
**Story Points**: 3
**Description**: Implement document-to-session mapping using library's generic session API.

#### UserStory-840-20-5: Wire Document Handlers to Session API

**Priority**: P0
**Story Points**: 3
**Description**: Update document session handlers to use library's session primitives.

##### Task-840-20-5-1: Update document session handler

**Story Points**: 1
**Priority**: P0
**Files**: `src/mcp/documentSessionHandlers.ts`
**Acceptance Criteria**:
- Given: Document lifecycle events
- When: Handling active-leaf-change
- Then: Calls `executor.switchSession(file.path)`
- And: Session created if not exists
- And: Previous session preserved

##### Task-840-20-5-2: Implement session notification handlers

**Story Points**: 1
**Priority**: P0
**Files**: `src/mcp/documentSessionHandlers.ts`
**Acceptance Criteria**:
- Given: Executor callbacks
- When: Session limit reached
- Then: Shows Obsidian Notice
- And: User can continue or cancel
- When: Session reset occurs
- Then: Shows informative Notice

**Implementation**:
```typescript
const sessionNotifications: SessionNotificationHandlers = {
  onLimitReached: async (sessionId, current, limit) => {
    return new Promise((resolve) => {
      const notice = new Notice('Session limit reached', 0)
      // Add buttons, resolve 'continue' or 'cancel'
    })
  },
  onSessionReset: (sessionId) => {
    new Notice(`Session reset for ${sessionId}`)
  }
}
```

##### Task-840-20-5-3: Update main plugin initialization

**Story Points**: 1
**Priority**: P0
**Files**: `src/main.ts`
**Acceptance Criteria**:
- Given: Plugin onload
- When: Initializing MCP
- Then: Creates manager with logger adapter
- And: Creates executor with callbacks
- And: Registers document handlers
- And: Wires everything together

---

## Epic-850: Testing & Documentation

**Priority**: P1
**Story Points**: 8
**Status**: Not Started
**Description**: Comprehensive end-to-end testing and complete documentation.
**Dependencies**: Epic-840 (Integration)
**Risk**: Low - Validation and documentation

### Feature-850-10: End-to-End Testing

**Priority**: P1
**Story Points**: 5
**Description**: Test all provider flows, error scenarios, and performance.

#### UserStory-850-10-5: Comprehensive Integration Testing

**Priority**: P1
**Story Points**: 5
**Description**: Verify library works correctly in isolation and integrated with plugin.

##### Task-850-10-5-1: Library standalone tests

**Story Points**: 2
**Priority**: P1
**Files**: `packages/mcp-manager/tests/integration/standalone.test.ts`
**Acceptance Criteria**:
- Given: Library in isolation
- When: Running integration tests
- Then: Manager initializes correctly
- And: Executor executes tools
- And: Coordinator orchestrates multi-turn
- And: All providers work
- And: No Obsidian dependencies needed

##### Task-850-10-5-2: Plugin integration tests

**Story Points**: 2
**Priority**: P1
**Files**: `tests/integration/libraryIntegration.test.ts`
**Acceptance Criteria**:
- Given: Plugin using library
- When: Running integration tests
- Then: All existing tests pass
- And: New library integration tests pass
- And: Document sessions work
- And: Error reporting works
- And: Performance acceptable

##### Task-850-10-5-3: Error scenario testing

**Story Points**: 1
**Priority**: P1
**Files**: `packages/mcp-manager/tests/integration/errorScenarios.test.ts`
**Acceptance Criteria**:
- Given: Various error conditions
- When: Testing error handling
- Then: Server failures handled
- And: Tool errors handled
- And: Network timeouts handled
- And: Invalid configs handled
- And: Retry logic works
- And: Auto-disable works

### Feature-850-20: Documentation

**Priority**: P1
**Story Points**: 3
**Description**: Complete API documentation, usage guides, and migration documentation.

#### UserStory-850-20-5: Comprehensive Documentation

**Priority**: P1
**Story Points**: 3
**Description**: Write complete documentation for library users.

##### Task-850-20-5-1: API documentation

**Story Points**: 1
**Priority**: P1
**Files**: `packages/mcp-manager/docs/api.md`, generated TypeDoc
**Acceptance Criteria**:
- Given: Library source code
- When: Generating documentation
- Then: All public APIs documented
- And: Parameter descriptions complete
- And: Return types explained
- And: Examples included
- And: TypeDoc output readable

##### Task-850-20-5-2: Usage guides

**Story Points**: 1
**Priority**: P1
**Files**: `packages/mcp-manager/docs/guides/`
**Acceptance Criteria**:
- Given: Library users
- When: Reading guides
- Then: Quick start guide exists
- And: Provider integration guide exists
- And: Configuration guide exists
- And: Error handling guide exists
- And: Examples are runnable

##### Task-850-20-5-3: Migration documentation

**Story Points**: 1
**Priority**: P1
**Files**: `docs/MCP_LIBRARY_MIGRATION.md`
**Acceptance Criteria**:
- Given: Existing plugin implementation
- When: Reading migration doc
- Then: Architecture changes explained
- And: Import changes documented
- And: Breaking changes listed
- And: Migration steps clear
- And: Troubleshooting section included

---

## 🎯 Implementation Order

### Week 1: Foundation
1. Epic-800-10 (Monorepo setup) - **Days 1-2**
2. Epic-800-20 (Type extraction) - **Days 3-4**
3. Epic-800-30 (Initial exports) - **Day 5**

### Week 2: Core Components
4. Epic-810-10 (Manager extraction) - **Days 1-3**
5. Epic-810-20 (Executor extraction) - **Days 3-5**

### Week 3: Adapters & Config
6. Epic-820-10 (Coordinator) - **Days 1-2**
7. Epic-820-20 (Parsers) - **Day 2**
8. Epic-820-30 (Provider adapters) - **Day 3**
9. Epic-830-10 (Config utilities) - **Day 4**
10. Epic-830-20 (Cache & retry) - **Day 5**

### Week 4: Integration & Testing
11. Epic-840-10 (Plugin refactor) - **Days 1-2**
12. Epic-840-20 (Document sessions) - **Day 2**
13. Epic-850-10 (Testing) - **Days 3-4**
14. Epic-850-20 (Documentation) - **Day 5**

---

## 📊 Progress Tracking

### Completion Criteria

**Epic-800** ✅:
- [ ] Monorepo structure created
- [ ] Library builds successfully
- [ ] Types extracted
- [ ] Tests run

**Epic-810** ✅:
- [ ] Manager in library
- [ ] Executor in library
- [ ] EventTarget working
- [ ] Tests passing

**Epic-820** ✅:
- [ ] Coordinator in library
- [ ] Parsers in library
- [ ] Adapters in library
- [ ] Tests passing

**Epic-830** ✅:
- [ ] Config utilities in library
- [ ] Cache in library
- [ ] Retry logic in library
- [ ] Tests passing

**Epic-840** ✅:
- [ ] Plugin uses library
- [ ] All imports updated
- [ ] Document sessions working
- [ ] Tests passing

**Epic-850** ✅:
- [ ] E2E tests passing
- [ ] Documentation complete
- [ ] Ready for use

---

## 🚨 Risk Mitigation

### High-Risk Areas

1. **EventEmitter → EventTarget Migration**
   - **Risk**: Event listener API differences
   - **Mitigation**: Comprehensive event tests, gradual migration
   - **Rollback**: Keep wrapper for EventEmitter compatibility

2. **Plugin Integration**
   - **Risk**: Breaking changes to plugin
   - **Mitigation**: Feature flag, extensive testing
   - **Rollback**: Git revert, version pinning

3. **Performance Regression**
   - **Risk**: Additional abstraction overhead
   - **Mitigation**: Benchmarking, profiling
   - **Rollback**: Optimize hot paths, inline critical code

### Testing Strategy

**Unit Tests**: Each component tested in isolation
**Integration Tests**: Components work together
**E2E Tests**: Full workflows (plugin using library)
**Performance Tests**: Latency and memory benchmarks
**Regression Tests**: Existing functionality preserved

---

## 📝 Notes

### Code Quality Standards

- **TypeScript Strict Mode**: Enabled
- **Test Coverage**: ≥80% for library
- **Documentation**: JSDoc on all public APIs
- **Linting**: Biome configuration applied
- **Formatting**: Consistent style

### Version Strategy

- **Library**: Start at 1.0.0
- **Plugin**: Bump minor version (3.6.0)
- **Lock-step**: Initially yes, independent later

### Future Enhancements

1. **Result Cache in Library** - Extract with document parser abstraction
2. **Browser Compatibility** - Test and support browser environments
3. **Additional Providers** - Gemini, Anthropic API v2, etc.
4. **Performance Optimizations** - Request batching, connection pooling
5. **Monitoring & Observability** - Metrics, tracing, health endpoints

---

**End of Task Breakdown**
