<!--
Constitution Sync Impact Report:
Version: 1.0.0 (Initial)
Modified principles: N/A (Initial creation)
Added sections: Core Principles, Plugin Architecture Standards, Code Quality & Testing, TypeScript Standards, AI Provider Integration, Governance
Removed sections: N/A
Templates requiring updates:
  ✅ .specify/templates/plan-template.md (updated - Constitution Check section added)
  ✅ .specify/templates/spec-template.md (updated - Tars Plugin Specific checklist added)
  ✅ .specify/templates/tasks-template.md (updated - TypeScript/Obsidian specific tasks)
Follow-up TODOs: None - all templates synchronized
-->

# Tars Plugin Constitution

**Obsidian AI Integration Plugin - Fork Development Standards**

## Core Principles

### I. Test-Driven Development (NON-NEGOTIABLE)

**All code changes MUST follow strict TDD workflow:**
- Write tests FIRST before implementation
- Use GIVEN/WHEN/THEN pattern with clear comments
- Each test section MUST be separated by blank lines
- Test comments MUST explain business purpose and scenario
- Red-Green-Refactor cycle is mandatory
- Tag tests with clear messages using comments

**Rationale**: TDD ensures correctness, prevents regressions, and serves as living documentation. This is particularly critical for AI integration where edge cases and provider-specific behavior must be explicitly validated.

### II. Upstream Compatibility

**Maintain compatibility with upstream TarsLab/obsidian-tars:**
- Follow upstream coding conventions and patterns
- Preserve existing plugin architecture (commands, providers, settings, suggest)
- Match TypeScript configuration and ESLint rules
- Keep PR-ready state for potential upstream contributions
- Document all deviations from upstream with clear rationale

**Rationale**: As a fork, we must respect the original project's design decisions while enabling innovation. This ensures we can contribute improvements back and benefit from upstream updates.

### III. Plugin Architecture Modularity

**Obsidian plugin structure MUST be maintained:**
- Provider implementations are isolated in `src/providers/`
- Commands are separated in `src/commands/`
- Editor logic centralized in `src/editor.ts`
- Settings management isolated in `src/settingTab.ts` and `src/settings.ts`
- Each provider MUST implement standard interfaces: `SendRequest`, `BaseOptions`, `Vendor`
- Tag-based interaction model is preserved

**Rationale**: Obsidian plugins have specific architectural requirements. Modularity enables independent testing and makes AI provider integration straightforward.

### IV. TypeScript Type Safety

**Strict TypeScript discipline:**
- `noImplicitAny: true` and `strictNullChecks: true` MUST be enforced
- All public interfaces MUST be explicitly typed
- Use `interface` for extensible contracts, `type` for composition
- Provider options MUST extend `BaseOptions`
- Avoid `any` except when interfacing with untyped third-party APIs

**Rationale**: Type safety catches errors at compile time, improves IDE experience, and serves as inline documentation. Critical for AI integrations where message formats vary by provider.

### V. Code Quality & Linting

**Quality gates before all commits:**
- Code MUST pass `eslint .` without warnings
- Prefer `prettier --write src/` for formatting
- No unused variables (except those prefixed with `_`)
- No `@ts-ignore` comments without explicit justification
- Console logs: `console.debug` for development, structured logging for production

**Rationale**: Consistent code quality reduces cognitive load, prevents bugs, and maintains professional standards expected in the Obsidian plugin ecosystem.

## Plugin Architecture Standards

### Provider Integration Pattern

**All AI providers MUST:**
1. Export an interface extending `BaseOptions` with provider-specific settings
2. Implement `sendRequestFunc(settings): SendRequest` as an async generator
3. Handle streaming responses via `yield` with token-by-token delivery
4. Support `AbortController` for cancellation
5. Handle multimodal content (text, images, documents) per provider capabilities
6. Return capability emoji via `getCapabilityEmoji()`

### Tag-Based Interaction Model

**Preserve tag-driven UX:**
- Tags define message roles: `#User :`, `#Assistant :`, `#System :`, `#NewChat`
- Tag commands MUST be dynamically built from settings
- Support both command palette and inline tag triggers
- Respect conversation order: System → User ↔ Assistant
- Blank lines separate messages; callouts are ignored

### Settings Architecture

**Settings MUST:**
- Use `PluginSettings` interface for all configuration
- Persist via `loadData()`/`saveData()` Obsidian APIs
- Support JSON override parameters for advanced users
- Validate provider credentials before use
- Provide sensible defaults in `DEFAULT_SETTINGS`

## Code Quality & Testing

### Test Structure (GIVEN/WHEN/THEN)

**Example test pattern:**
```typescript
// TEST: User message parsing with embedded images
test('parseUserMessage handles image embeds', () => {
  // GIVEN: A user message with embedded image reference
  const messageText = "Analyze this image: ![[example.jpg]]"
  const embeds = [{ link: 'example.jpg', position: {...} }]

  // WHEN: Parsing the message
  const result = parseMessage(messageText, embeds)

  // THEN: Message includes embed metadata
  expect(result.embeds).toHaveLength(1)
  // AND: Embed has correct MIME type
  expect(result.embeds[0].mimeType).toBe('image/jpeg')
})
```

### Test Coverage Requirements

**MUST test:**
- Provider message formatting for each AI service
- Tag parsing and role assignment
- Multimodal content handling (images, PDFs)
- Stream cancellation and error handling
- Settings persistence and validation
- Command registration and tag suggestions

**MAY skip integration tests for:**
- Third-party API calls (use mocks/stubs)
- Obsidian internal APIs (assume correct)
- UI rendering (manual verification acceptable)

## TypeScript Standards

### Module Structure

**Follow existing patterns:**
- ES6 module syntax: `import`/`export`
- Target: ES6, Module: NodeNext
- Inline source maps for debugging
- External dependencies: `obsidian`, `electron`, `@codemirror/*`

### Naming Conventions

**Observed upstream patterns:**
- `PascalCase`: Classes, interfaces, types (`TarsPlugin`, `ClaudeOptions`)
- `camelCase`: Functions, variables, properties (`buildRunEnv`, `sendRequest`)
- `UPPER_SNAKE_CASE`: Constants (`DEFAULT_SETTINGS`, `APP_FOLDER`)
- Prefix interfaces with purpose, not `I` (`BaseOptions`, not `IOptions`)

## AI Provider Integration

### Required Capabilities

**Each provider implementation MUST support:**
- Streaming text generation (async generators)
- Error handling with user-friendly notices
- API key validation
- Base URL configuration for custom endpoints
- Model selection with parameter overrides

**MAY support (provider-dependent):**
- Multimodal input (images via `resolveEmbedAsBinary`)
- Web search (Claude, Zhipu)
- Extended thinking (Claude)
- Document interpretation (PDF)

### Error Handling

**Provider errors MUST:**
- Use Obsidian `Notice` for user-facing errors
- Log full errors to console for debugging
- Translate HTTP status codes (401, 404, 429) to helpful messages
- Respect internationalization via `t()` helper

## Governance

### Amendment Process

**Constitution changes require:**
1. Clear documentation of motivation and impact
2. Update sync impact report (HTML comment header)
3. Version bump following semantic versioning:
   - **MAJOR**: Breaking changes to principles or architecture
   - **MINOR**: New principles or substantial expansions
   - **PATCH**: Clarifications, typos, non-semantic fixes
4. Propagate changes to all template files

### Compliance Enforcement

**All code contributions MUST:**
- Pass TDD workflow validation (tests before code)
- Pass linting (`npm run lint`)
- Maintain TypeScript strict mode compliance
- Include test coverage for new functionality
- Document provider-specific behavior

### Development Guidance

**For runtime assistance:**
- Use this constitution as primary reference
- Consult upstream repository for architectural decisions
- Reference Obsidian API docs for plugin APIs
- Test against real Obsidian environment for UX validation

### Conflict Resolution

**Priority order when conflicts arise:**
1. Obsidian plugin API requirements (non-negotiable)
2. Test-Driven Development principle (non-negotiable)
3. Upstream compatibility (strong preference)
4. TypeScript type safety (strong preference)
5. Code quality standards (enforced)

**Version**: 1.0.0 | **Ratified**: 2025-10-01 | **Last Amended**: 2025-10-01