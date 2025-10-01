
# Implementation Plan: MCP Server Integration for LLM Tool Execution

**Branch**: `001-integrate-mcp-servers` | **Date**: 2025-10-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/mnt/workspace/obsidian-tars/specs/001-integrate-mcp-servers/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from file system structure or context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Fill the Constitution Check section based on the content of the constitution document.
4. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
5. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, `GEMINI.md` for Gemini CLI, `QWEN.md` for Qwen Code or `AGENTS.md` for opencode).
7. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary

Integrate Model Context Protocol (MCP) servers into the Tars Obsidian plugin to extend AI assistant capabilities with external tools. Users can register multiple MCP servers (Docker-hosted or remote), invoke tools via markdown code blocks with YAML parameters, and enable AI assistants to autonomously execute tools. Plugin manages full lifecycle for Docker servers (stdio/SSE protocols) with health monitoring, exponential backoff retry, and auto-disable on repeated failures. No authentication required (trust local network). Tool results are always fresh (no caching), with configurable timeouts (30s default) and concurrent execution limits (25 default).

## Technical Context
**Language/Version**: TypeScript 5.5.2 (ES6 target, NodeNext module resolution)  
**Primary Dependencies**: @modelcontextprotocol/sdk (already in node_modules), Dockerode or Docker Engine API client, Obsidian Plugin API 1.5.8+  
**Storage**: Plugin settings via Obsidian's `loadData()`/`saveData()` for MCP server configurations, session state for execution tracking  
**Testing**: TypeScript test framework (vitest present in node_modules), GIVEN/WHEN/THEN pattern mandatory  
**Target Platform**: Obsidian desktop (Electron-based), Windows/macOS/Linux
**Project Type**: Single Obsidian plugin (extends existing Tars architecture)  
**Performance Goals**: <30s tool execution timeout (configurable), handle 25 concurrent tool executions, exponential backoff retry (1s/5s/15s)  
**Constraints**: Obsidian plugin architecture (no Node.js child_process from renderer), Docker API accessible from plugin context, stdio/SSE protocol support required  
**Scale/Scope**: Multiple MCP servers per user, unlimited tools per server, document section-based server associations

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Test-Driven Development (NON-NEGOTIABLE)
- [x] Tests will be written BEFORE implementation
- [x] GIVEN/WHEN/THEN pattern will be used with clear comments
- [x] All tests will explain business purpose and scenario

### Upstream Compatibility
- [x] Changes preserve existing plugin architecture (new mcp/ module, extends settings)
- [x] TypeScript config and ESLint rules are maintained
- [⚠️] Deviations: New MCP integration does not exist upstream (justification: extends plugin capabilities without breaking existing features)

### Plugin Architecture Modularity
- [x] New `src/mcp/` module for MCP-specific logic (isolated from providers)
- [x] Settings extended in `src/settings.ts` for MCP server configurations
- [⚠️] Not using provider pattern: MCP tools are orthogonal to AI providers (justification: tools augment providers, not replace them)
- [x] Tag-based interaction model preserved (AI can request tools during conversation)

### TypeScript Type Safety
- [x] `noImplicitAny: true` and `strictNullChecks: true` enforced
- [x] All public interfaces explicitly typed (MCPServerConfig, ToolInvocation, etc.)
- [⚠️] MCP interfaces extend new base, not BaseOptions (justification: tools != AI providers)
- [x] No `any` types without justification

### Code Quality & Linting
- [x] Code passes `npm run lint` without warnings
- [x] No unused variables (except `_` prefixed)
- [x] No `@ts-ignore` without explicit justification

**Initial Constitution Check: ✅ PASS** (3 deviations justified: new feature domain, extends without breaking)

## Project Structure

### Documentation (this feature)
```
specs/[###-feature]/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
src/
├── mcp/                          # NEW: MCP integration module
│   ├── index.ts                  # Public API exports
│   ├── types.ts                  # MCPServerConfig, ToolInvocation, etc.
│   ├── client.ts                 # MCP protocol client (stdio/SSE)
│   ├── manager.ts                # Server lifecycle management
│   ├── docker.ts                 # Docker API integration
│   ├── executor.ts               # Tool execution coordinator
│   ├── codeBlockProcessor.ts    # Parse/render code blocks
│   └── healthMonitor.ts          # Health checks, retry logic
├── providers/                    # EXISTING: AI provider implementations
│   ├── index.ts                  # MODIFIED: Inject MCP tool context
│   └── [existing providers]      # MODIFIED: Support tool execution hooks
├── commands/                     # EXISTING: Plugin commands
│   └── mcpCommands.ts            # NEW: MCP-specific commands
├── settings.ts                   # MODIFIED: Add MCP server configs
├── settingTab.ts                 # MODIFIED: MCP settings UI
├── editor.ts                     # MODIFIED: Code block processing hook
└── main.ts                       # MODIFIED: Register MCP lifecycle

tests/
├── mcp/                          # NEW: MCP-specific tests
│   ├── client.test.ts
│   ├── manager.test.ts
│   ├── docker.test.ts
│   ├── executor.test.ts
│   ├── codeBlockProcessor.test.ts
│   └── healthMonitor.test.ts
├── integration/                  # NEW: End-to-end tests
│   ├── mcpLifecycle.test.ts
│   └── toolExecution.test.ts
└── providers/                    # MODIFIED: Test tool injection
    └── toolContext.test.ts
```

**Structure Decision**: Single project structure with new `src/mcp/` module isolated from existing code. MCP integration extends existing architecture without replacing provider/command patterns. Tests follow TDD with GIVEN/WHEN/THEN format in dedicated `tests/mcp/` directory.

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:
   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts ✅
*Prerequisites: research.md complete*

### Completed Artifacts:

1. **data-model.md** ✅
   - 7 core entities defined: MCPServerConfig, SectionBinding, ToolInvocationRequest, ToolExecutionResult, ServerHealthStatus, ExecutionTracker, AIToolContext
   - Validation rules for each entity
   - State transition diagrams
   - Storage strategy (persistent vs session)

2. **contracts/** ✅
   - `mcp-client-interface.ts`: MCP protocol client contract
   - `mcp-manager-interface.ts`: Server lifecycle management contract
   - `tool-executor-interface.ts`: Tool execution coordinator contract
   - `code-block-processor-interface.ts`: Markdown code block handling contract
   - `provider-integration-interface.ts`: AI provider tool support contract

3. **quickstart.md** ✅
   - 7 manual test scenarios
   - Covers: code block execution, AI autonomous calls, lifecycle, limits, SSE, section bindings, error handling
   - Validation checklist with success criteria
   - Performance benchmarks

4. **Agent file update**: Deferred (no `.specify/scripts/bash/update-agent-context.sh` found)

**Phase 1 Output Summary**:
- Entity model covers all 42 functional requirements
- 5 TypeScript interface contracts define clean APIs
- Quickstart provides comprehensive manual testing path
- Ready for task generation

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
1. Setup tasks (1-3):
   - Create `src/mcp/` module structure
   - Add MCP dependencies to package.json (if needed)
   - Configure vitest for MCP tests

2. Contract test tasks (4-13) [P]:
   - `tests/mcp/client.test.ts` - MCPClient interface (stdio, SSE, tool calls)
   - `tests/mcp/manager.test.ts` - MCPServerManager lifecycle
   - `tests/mcp/executor.test.ts` - ToolExecutor limits and tracking
   - `tests/mcp/docker.test.ts` - Docker API integration
   - `tests/mcp/healthMonitor.test.ts` - Health checks and retry logic
   - `tests/mcp/codeBlockProcessor.test.ts` - Code block parsing/rendering
   - **All tests MUST fail initially (no implementation)**

3. Entity/Type definition tasks (14-16) [P]:
   - `src/mcp/types.ts` - All interfaces from data-model.md
   - Validation rules as type guards

4. Core implementation tasks (17-30):
   - `src/mcp/client.ts` - MCP SDK wrapper (stdio + SSE)
   - `src/mcp/docker.ts` - Docker HTTP API client
   - `src/mcp/healthMonitor.ts` - Health checks with exponential backoff
   - `src/mcp/manager.ts` - Server lifecycle orchestration
   - `src/mcp/executor.ts` - Tool execution with limits
   - `src/mcp/codeBlockProcessor.ts` - Parse YAML, render results
   - `src/mcp/index.ts` - Public API exports

5. Integration tasks (31-38):
   - Extend `src/settings.ts` with MCPServerConfig[]
   - Extend `src/settingTab.ts` with MCP UI (server list, add/edit/delete)
   - Hook `src/main.ts` to initialize MCPServerManager
   - Register code block processor in `src/main.ts`
   - Inject tool context into `src/providers/index.ts`
   - Add `src/commands/mcpCommands.ts` (stop execution, show history)

6. AI provider integration tasks (39-42) [P]:
   - `src/providers/claude.ts` - Tool context injection
   - Test file: `tests/providers/toolContext.test.ts`

7. Integration tests (43-46) [P]:
   - `tests/integration/mcpLifecycle.test.ts` - End-to-end server management
   - `tests/integration/toolExecution.test.ts` - Full tool execution flow

8. Polish tasks (47-50):
   - Verify all quickstart scenarios pass
   - Run `npm run lint` (fix warnings)
   - Update README.md with MCP documentation
   - Remove code duplication

**Ordering Strategy**:
- Setup (T001-T003) → Tests (T004-T013) → Types (T014-T016) → Implementation (T017-T030) → Integration (T031-T046) → Polish (T047-T050)
- Mark [P] for tasks in different files (can run parallel)
- TDD: All tests fail before implementation begins

**Estimated Output**: ~50 numbered tasks in dependency order

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New `src/mcp/` module (not provider) | MCP tools augment AI providers, not replace them | Forcing into provider pattern would conflate tool execution with LLM communication |
| Docker API integration | Required for managed server lifecycle (FR-036) | Manual Docker management defeats automated lifecycle purpose |
| Multiple transport protocols (stdio + SSE) | Requirement FR-033 mandates both | Single protocol insufficient for Docker local + remote cloud servers |

**Justification**: All deviations necessary to meet functional requirements. Complexity justified by feature scope.


## Progress Tracking

**Phase Status**:
- [x] Phase 0: Research complete (/plan command) ✅
  - research.md: 7 technical areas researched with decisions
- [x] Phase 1: Design complete (/plan command) ✅
  - data-model.md: 7 entities with validation rules
  - contracts/: 5 TypeScript interface contracts
  - quickstart.md: 7 test scenarios
- [x] Phase 2: Task planning approach documented (/plan command - describe only) ✅
  - ~50 tasks outlined in 8 phases
  - TDD ordering specified
- [ ] Phase 3: Tasks generated (/tasks command) - **Next Step**
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: ✅ PASS (3 justified deviations)
- [x] Post-Design Constitution Check: ✅ PASS (no new violations)
- [x] All NEEDS CLARIFICATION resolved (FR-031 to FR-042)
- [x] Complexity deviations documented (see table above)

**Artifacts Generated**:
- `/specs/001-integrate-mcp-servers/plan.md` (this file)
- `/specs/001-integrate-mcp-servers/research.md` (Phase 0)
- `/specs/001-integrate-mcp-servers/data-model.md` (Phase 1)
- `/specs/001-integrate-mcp-servers/contracts/*.ts` (5 files, Phase 1)
- `/specs/001-integrate-mcp-servers/quickstart.md` (Phase 1)

**Ready for**: `/tasks` command to generate executable task list

---
*Based on Tars Plugin Constitution v1.0.0 - See `.specify/memory/constitution.md`*
