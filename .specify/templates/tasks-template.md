# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → If not found: ERROR "No implementation plan found"
   → Extract: tech stack, libraries, structure
2. Load optional design documents:
   → data-model.md: Extract entities → model tasks
   → contracts/: Each file → contract test task
   → research.md: Extract decisions → setup tasks
3. Generate tasks by category:
   → Setup: project init, dependencies, linting
   → Tests: contract tests, integration tests
   → Core: models, services, CLI commands
   → Integration: DB, middleware, logging
   → Polish: unit tests, performance, docs
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness:
   → All contracts have tests?
   → All entities have models?
   → All endpoints implemented?
9. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **Single project**: `src/`, `tests/` at repository root
- **Web app**: `backend/src/`, `frontend/src/`
- **Mobile**: `api/src/`, `ios/src/` or `android/src/`
- Paths shown below assume single project - adjust based on plan.md structure

## Phase 3.1: Setup
- [ ] T001 Create project structure per implementation plan
- [ ] T002 Initialize TypeScript project with Obsidian plugin dependencies
- [ ] T003 [P] Configure ESLint and Prettier per upstream standards
- [ ] T004 [P] Verify tsconfig.json: noImplicitAny=true, strictNullChecks=true

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**
**GIVEN/WHEN/THEN format with clear comments required**
- [ ] T005 [P] Provider message format test in tests/providers/test_provider_format.test.ts
- [ ] T006 [P] Tag parsing test in tests/editor/test_tag_parsing.test.ts
- [ ] T007 [P] Stream handling test in tests/providers/test_stream.test.ts
- [ ] T008 [P] Settings validation test in tests/settings/test_validation.test.ts

## Phase 3.3: Core Implementation (ONLY after tests are failing)
- [ ] T009 [P] Provider interface implementation in src/providers/[provider].ts
- [ ] T010 [P] Message formatter extending BaseOptions in src/providers/[provider].ts
- [ ] T011 [P] Command registration in src/commands/[command].ts
- [ ] T012 Streaming response handler (async generator)
- [ ] T013 Settings persistence via loadData/saveData
- [ ] T014 Type-safe options interface
- [ ] T015 Error handling with Notice and i18n

## Phase 3.4: Integration
- [ ] T016 Register provider in src/providers/index.ts
- [ ] T017 Integrate with tag suggestion system
- [ ] T018 Connect to status bar manager
- [ ] T019 Wire AbortController for cancellation

## Phase 3.5: Polish
- [ ] T020 [P] Unit tests for edge cases in tests/unit/
- [ ] T021 Verify npm run lint passes (zero warnings)
- [ ] T022 [P] Update README.md with provider documentation
- [ ] T023 Remove code duplication
- [ ] T024 Manual test in Obsidian vault with real API
- [ ] T025 Verify upstream compatibility (no breaking changes)

## Dependencies
- Setup (T001-T004) before tests
- Tests (T005-T008) before implementation (T009-T015)
- T009 blocks T012 (interface before async generator)
- T013 blocks T017 (settings before tag integration)
- Implementation before polish (T020-T025)

## Parallel Example
```
# Launch T005-T008 together (different test files):
Task: "Provider message format test - tests/providers/test_provider_format.test.ts"
Task: "Tag parsing test - tests/editor/test_tag_parsing.test.ts"
Task: "Stream handling test - tests/providers/test_stream.test.ts"
Task: "Settings validation test - tests/settings/test_validation.test.ts"

# Each test MUST use GIVEN/WHEN/THEN pattern with comments
```

## Notes
- [P] tasks = different files, no dependencies
- Verify tests fail before implementing (Red-Green-Refactor)
- All tests use GIVEN/WHEN/THEN with clear business purpose comments
- Run `npm run lint` before each commit
- Commit after each task
- Maintain TypeScript strict mode compliance
- Avoid: vague tasks, same file conflicts, `any` types

## Task Generation Rules
*Applied during main() execution*

1. **From Contracts**:
   - Each contract file → contract test task [P]
   - Each endpoint → implementation task
   
2. **From Data Model**:
   - Each entity → model creation task [P]
   - Relationships → service layer tasks
   
3. **From User Stories**:
   - Each story → integration test [P]
   - Quickstart scenarios → validation tasks

4. **Ordering**:
   - Setup → Tests → Models → Services → Endpoints → Polish
   - Dependencies block parallel execution

## Validation Checklist
*GATE: Checked by main() before returning*

- [ ] All contracts have corresponding tests
- [ ] All entities have model tasks
- [ ] All tests come before implementation
- [ ] Parallel tasks truly independent
- [ ] Each task specifies exact file path
- [ ] No task modifies same file as another [P] task