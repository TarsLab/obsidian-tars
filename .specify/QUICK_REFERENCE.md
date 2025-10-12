# Tars Plugin Constitution - Quick Reference

**Version**: 1.0.0 | **Full Document**: `.specify/memory/constitution.md`

## 🚨 NON-NEGOTIABLE Rules

### ✅ Test-Driven Development
```typescript
// 1. Write test FIRST (must fail)
// TEST: Stream cancellation stops generation
test('provider respects AbortController signal', () => {
  // GIVEN: Active stream with abort controller
  const controller = new AbortController()
  const stream = provider.sendRequest(messages, controller)
  
  // WHEN: Abort signal is triggered
  controller.abort()
  
  // THEN: Stream stops immediately
  // AND: No further tokens are yielded
})

// 2. See it RED (test fails)
// 3. Implement to GREEN (test passes)
// 4. Refactor if needed
```

### 📋 Test Format Requirements
- **Pattern**: GIVEN / WHEN / THEN with `AND:` for additional steps
- **Comments**: Clear business purpose, not just code description
- **Separation**: Blank lines between GIVEN/WHEN/THEN sections
- **Tag**: Start with `// TEST: {clear description of what's being tested}`

## 🏗️ Architecture Patterns

### Provider Implementation Checklist
```typescript
// ✅ 1. Define options interface
export interface MyProviderOptions extends BaseOptions {
  api_key: string
  model: string
  // ... provider-specific settings
}

// ✅ 2. Implement sendRequestFunc
const sendRequestFunc = (settings: MyProviderOptions): SendRequest =>
  async function* (messages, controller, resolveEmbed) {
    // ... streaming implementation
    for await (const chunk of stream) {
      yield chunk.text // token-by-token
    }
  }

// ✅ 3. Export vendor object
export const myProvider: Vendor<MyProviderOptions> = {
  sendRequest: sendRequestFunc,
  protocol: 'my-protocol',
  getCapabilityEmoji: () => '🎯'
}
```

### File Structure Rules
- **Providers**: `src/providers/[name].ts` (isolated, interface-based)
- **Commands**: `src/commands/[name].ts` (tag-driven)
- **Tests**: `tests/[category]/[feature].test.ts` (GIVEN/WHEN/THEN)
- **Settings**: Use `PluginSettings` interface, persist via `loadData()`/`saveData()`

## 🔍 Code Quality Gates

### Before Every Commit
```bash
# Must pass with ZERO warnings
npm run lint

# Must pass TypeScript compilation
npm run build
```

### TypeScript Strict Mode
- ✅ `noImplicitAny: true` (no implicit any types)
- ✅ `strictNullChecks: true` (handle null/undefined explicitly)
- ✅ Explicit types for all public interfaces
- ✅ `interface` for contracts, `type` for composition
- ❌ No `any` types (except justified third-party APIs)
- ❌ No `@ts-ignore` (without explicit comment explaining why)

### Naming Conventions
```typescript
// PascalCase: Classes, Interfaces, Types
class TarsPlugin {}
interface BaseOptions {}
type Vendor<T> = {}

// camelCase: Functions, variables, properties
function buildRunEnv() {}
const sendRequest = () => {}

// UPPER_SNAKE_CASE: Constants
const DEFAULT_SETTINGS = {}
const APP_FOLDER = '.tars'
```

## 🔌 Obsidian Plugin Specifics

### Tag-Based Interaction Model
```markdown
#NewChat

#System : You are a helpful assistant.

#User : What is 1+1?

#Claude : (triggers AI response)
```

### Required Patterns
- **Commands**: Register via `this.addCommand()` in `main.ts`
- **Settings**: Extend `PluginSettings`, use `TarsSettingTab`
- **Notices**: Use `new Notice(t('message'))` for user feedback
- **Internationalization**: Wrap strings in `t()` helper
- **Tag parsing**: Respect blank line separators, ignore callouts

### Provider Capabilities
```typescript
// ✅ MUST support
- Streaming (async generators)
- AbortController cancellation
- API key validation
- Base URL configuration
- Error handling with Notice

// 🔄 MAY support (provider-dependent)
- Multimodal (images via resolveEmbedAsBinary)
- Web search
- Extended thinking
- Document interpretation (PDF)
```

## 🔗 Upstream Compatibility

### Fork Development Rules
- ✅ Preserve existing architecture (commands, providers, settings, suggest)
- ✅ Match `tsconfig.json` and `eslint.config.mjs` from upstream
- ✅ Keep PR-ready (document all deviations)
- ✅ Follow upstream patterns (check recent commits)
- ❌ Don't break existing tag syntax or provider interfaces

## 🚦 When Things Conflict

### Priority Order (1 = highest)
1. **Obsidian plugin API requirements** (can't violate)
2. **Test-Driven Development** (non-negotiable)
3. **Upstream compatibility** (strong preference)
4. **TypeScript type safety** (strong preference)
5. **Code quality standards** (enforced)

## 📚 Quick Commands

### Workflows Available
```bash
/specify    # Create feature specification
/plan       # Generate implementation plan
/tasks      # Generate ordered task list
/implement  # Execute tasks
/constitution  # Update this constitution
```

### Common Patterns
```typescript
// ✅ Good: Type-safe provider options
interface ClaudeOptions extends BaseOptions {
  max_tokens: number
  enableThinking: boolean
}

// ❌ Bad: Implicit any
function processMessage(msg) { // ← no type
  return msg.content
}

// ✅ Good: Explicit error handling
try {
  const response = await api.call()
} catch (error) {
  new Notice(t('API request failed'))
  console.error('Claude API error:', error)
}

// ❌ Bad: Silent failure
const response = await api.call() // might throw
```

## 🎯 Test Coverage Priorities

### MUST Test
- ✅ Provider message formatting
- ✅ Tag parsing and role assignment
- ✅ Stream cancellation
- ✅ Settings validation
- ✅ Multimodal content handling

### MAY Skip
- ❌ Third-party API calls (mock instead)
- ❌ Obsidian internal APIs (assume correct)
- ❌ UI rendering (manual verification)

## 📖 Reference Documents

- **Full Constitution**: `.specify/memory/constitution.md`
- **Plan Template**: `.specify/templates/plan-template.md`
- **Spec Template**: `.specify/templates/spec-template.md`
- **Tasks Template**: `.specify/templates/tasks-template.md`
- **Upstream Repo**: `https://github.com/TarsLab/obsidian-tars`

---

**Remember**: When in doubt, write a test first! 🧪
