# Constitution Compliance Checklist

**Version**: 1.0.0 | **For**: Code Reviews & Pull Requests

Use this checklist to validate that code changes comply with the Tars Plugin Constitution before merging.

## 🧪 Test-Driven Development (CRITICAL)

### Pre-Implementation
- [ ] Tests were written **BEFORE** implementation code
- [ ] Tests initially **FAILED** (Red phase confirmed)
- [ ] Tests now **PASS** after implementation (Green phase)
- [ ] Code was refactored for clarity (Refactor phase if needed)

### Test Quality
- [ ] Every test uses **GIVEN / WHEN / THEN** pattern
- [ ] Each section (GIVEN/WHEN/THEN) is separated by blank lines
- [ ] Test comments explain **business purpose**, not just code mechanics
- [ ] Tests start with `// TEST: {clear description}`
- [ ] `AND:` is used for additional steps within sections
- [ ] Test file naming: `*.test.ts` in appropriate `tests/` subdirectory

### Example Validation
```typescript
// ✅ COMPLIANT
// TEST: Provider handles malformed API response gracefully
test('sendRequest catches and logs JSON parse errors', () => {
  // GIVEN: API returns invalid JSON response
  const mockResponse = "not valid json{"
  
  // WHEN: Provider attempts to parse the response
  const result = await provider.handleResponse(mockResponse)
  
  // THEN: Error is caught and user is notified
  expect(result.error).toBeDefined()
  // AND: Error is logged for debugging
  expect(console.error).toHaveBeenCalled()
})

// ❌ NON-COMPLIANT
test('parse error', () => {
  const r = "bad json"
  expect(() => parse(r)).toThrow() // No GIVEN/WHEN/THEN, no business context
})
```

## 🏗️ Plugin Architecture

### Module Organization
- [ ] New providers added to `src/providers/`
- [ ] New commands added to `src/commands/`
- [ ] Editor logic kept in `src/editor.ts` (not scattered)
- [ ] Settings changes reflected in `src/settings.ts` and `src/settingTab.ts`
- [ ] No business logic in UI components

### Provider Implementation
- [ ] Provider options interface **extends BaseOptions**
- [ ] `sendRequestFunc` returns **async generator** (uses `yield`)
- [ ] Streaming implemented token-by-token
- [ ] **AbortController** support implemented
- [ ] Error handling uses **Notice** for user feedback
- [ ] Capability emoji implemented via `getCapabilityEmoji()`
- [ ] Provider registered in `src/providers/index.ts`

### Tag-Based Interaction
- [ ] Tag syntax preserved: `#Role :` format
- [ ] Blank lines separate messages
- [ ] Callouts properly ignored
- [ ] Conversation order respected: System → User ↔ Assistant

## 📘 TypeScript Type Safety

### Strict Mode Compliance
- [ ] No `any` types (or explicitly justified in comments)
- [ ] No `@ts-ignore` (or explicitly justified in comments)
- [ ] All public functions have explicit return types
- [ ] All parameters have explicit types (no implicit `any`)
- [ ] Null/undefined handled explicitly (`strictNullChecks`)

### Type Definitions
- [ ] `interface` used for extensible contracts
- [ ] `type` used for unions/intersections/compositions
- [ ] Provider options extend `BaseOptions`
- [ ] Message types use `Message` interface from `./providers`

### Naming Conventions
- [ ] Classes/Interfaces/Types: **PascalCase** (`ClaudeOptions`)
- [ ] Functions/variables/properties: **camelCase** (`sendRequest`)
- [ ] Constants: **UPPER_SNAKE_CASE** (`DEFAULT_SETTINGS`)
- [ ] No `I` prefix on interfaces (use `BaseOptions`, not `IBaseOptions`)

## 🔍 Code Quality

### Linting
- [ ] `npm run lint` passes with **zero warnings**
- [ ] Prettier formatting applied: `npm run format`
- [ ] No unused variables (except `_` prefixed)
- [ ] ESLint rules from `eslint.config.mjs` followed

### Code Standards
- [ ] ES6 module syntax (`import`/`export`)
- [ ] Async/await for promises (not `.then()/.catch()`)
- [ ] Arrow functions for callbacks
- [ ] Template literals for string interpolation
- [ ] Destructuring used where appropriate

### Error Handling
- [ ] User-facing errors use `new Notice(t('message'))`
- [ ] Debug information logged to `console.debug` or `console.error`
- [ ] HTTP errors translated to helpful messages (401, 404, 429, etc.)
- [ ] All strings wrapped in `t()` for internationalization

## 🔗 Upstream Compatibility

### Architecture Preservation
- [ ] No breaking changes to existing provider interfaces
- [ ] Command registration pattern unchanged
- [ ] Settings structure compatible with upstream
- [ ] Tag syntax backwards compatible
- [ ] Plugin lifecycle hooks unchanged (`onload`, `onunload`)

### Configuration Matching
- [ ] `tsconfig.json` settings match upstream
- [ ] `eslint.config.mjs` rules match upstream
- [ ] Build configuration (`esbuild.config.mjs`) compatible
- [ ] `package.json` scripts unchanged (or documented)

### Documentation
- [ ] Deviations from upstream documented with rationale
- [ ] README updated if user-facing changes
- [ ] Provider-specific behavior documented
- [ ] Breaking changes clearly marked

## 🧹 Polish & Refinement

### Code Cleanliness
- [ ] No commented-out code blocks
- [ ] No `console.log` (use `console.debug` for dev logs)
- [ ] No TODOs without issue tracking
- [ ] Duplicate code refactored/extracted
- [ ] File length reasonable (<500 lines preferred)

### Testing Coverage
- [ ] Provider message formatting tested
- [ ] Tag parsing tested for edge cases
- [ ] Stream cancellation tested
- [ ] Error scenarios tested (network failures, invalid responses)
- [ ] Settings validation tested

### Performance
- [ ] No synchronous file I/O in hot paths
- [ ] Streaming chunks efficiently (not buffering entire response)
- [ ] Status bar updates don't block rendering
- [ ] Large responses don't freeze UI

## 📋 Pull Request Checklist

### Before Submitting
- [ ] All tests pass locally
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes (zero warnings)
- [ ] Manual testing in real Obsidian vault completed
- [ ] No merge conflicts with main branch

### PR Description
- [ ] Links to related issue/spec
- [ ] Describes WHAT changed and WHY
- [ ] Screenshots/GIFs for UI changes
- [ ] Breaking changes clearly called out
- [ ] Testing steps documented

### Reviewer Guidance
- [ ] TDD workflow evidence provided (commit history shows tests first)
- [ ] Constitution compliance verified (this checklist completed)
- [ ] Upstream compatibility assessed
- [ ] Performance impact considered

## 🚦 Gate Status

**Mark each gate as PASS/FAIL before merge:**

| Gate | Status | Notes |
|------|--------|-------|
| TDD Workflow | ⬜ PASS / ⬜ FAIL | Tests written before code? |
| Test Format | ⬜ PASS / ⬜ FAIL | GIVEN/WHEN/THEN with comments? |
| TypeScript Strict | ⬜ PASS / ⬜ FAIL | No `any`, explicit types? |
| Linting | ⬜ PASS / ⬜ FAIL | Zero warnings? |
| Architecture | ⬜ PASS / ⬜ FAIL | Modules in correct locations? |
| Upstream Compat | ⬜ PASS / ⬜ FAIL | No breaking changes? |
| Manual Testing | ⬜ PASS / ⬜ FAIL | Works in real Obsidian? |

**All gates must PASS before merge.**

## 🎯 Quick Validation Commands

```bash
# Run all quality checks
npm run lint          # Must pass (zero warnings)
npm run build         # Must succeed
npm test              # Must pass (if test suite exists)

# Check TypeScript strict mode
grep -E "(noImplicitAny|strictNullChecks)" tsconfig.json
# Should show both set to true

# Find potential violations
grep -r "any" src/               # Check for any types
grep -r "@ts-ignore" src/        # Check for ts-ignore
grep -r "console.log" src/       # Check for debug logs
```

## 📚 Reference

- **Full Constitution**: `.specify/memory/constitution.md`
- **Quick Reference**: `.specify/QUICK_REFERENCE.md`
- **Constitution Summary**: `.specify/CONSTITUTION_SUMMARY.md`

---

**Remember**: This is a living document. Update it when the constitution changes.

**Version History**:
- v1.0.0 (2025-10-01): Initial checklist based on constitution v1.0.0
