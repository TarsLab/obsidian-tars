# Trello Board Workflow Guide for LLMs

**Board**: MCP Servers Integration Release
**URL**: https://trello.com/b/NDXU4w4k/mcp-servers-intgration-release
**Board ID**: `68eb4723ab01134a8d545cf5`

This document provides essential information for LLMs working with the Trello board via MCP tools.

---

## Table of Contents

1. [Label IDs Reference](#label-ids-reference)
2. [Board Structure](#board-structure)
3. [Card Hierarchy System](#card-hierarchy-system)
4. [Workflow Process](#workflow-process)
5. [MCP Tool Usage Patterns](#mcp-tool-usage-patterns)
6. [Common Operations](#common-operations)
7. [Best Practices](#best-practices)

---

## Label IDs Reference

### Hierarchy Type Labels

Use these to indicate the work item type:

| Label Name | Color | Label ID | Use For |
|------------|-------|----------|---------|
| Epic | Purple | `68eb4723ab01134a8d545d38` | Epic-level cards (Epic-100, Epic-200) |
| Feature | Blue | `68eb4723ab01134a8d545d39` | Feature-level cards (Feature-100-10) |
| UserStory | Green | `68eb4723ab01134a8d545d34` | UserStory-level cards (UserStory-100-10-5) |
| Task | Yellow | `68eb4723ab01134a8d545d35` | Task-level cards (Task-100-10-5-1) |

### Priority Labels

Use these to indicate urgency and importance:

| Label Name | Color | Label ID | Use For |
|------------|-------|----------|---------|
| P0 - Blocker | Red | `68eb4723ab01134a8d545d37` | Production blockers, critical bugs |
| P1 - Critical | Orange | `68eb4723ab01134a8d545d36` | Critical for release |
| P2 - Important | Sky Light | `68eb5a6125dff3faf3dedec3` | Important UX improvements |
| P3 - Nice to Have | Green Light | `68eb5a76e1aefd377405d429` | Optional features |
| P4 - Future | Black Dark | `68eb5a8eed8cdab36f341b95` | Future consideration, backlog |

### Applying Labels via MCP

```typescript
// Example: Apply Epic + P0 labels to a card
await mcp__trello__update_card_details({
  cardId: "68eb52cf9b3a43019bed6046",
  labels: ["68eb4723ab01134a8d545d38", "68eb4723ab01134a8d545d37"]
})
```

**Important**: The `labels` parameter requires an array of label IDs, not names or colors.

---

## Board Structure

### List IDs and Workflow Order

| List Name | List ID | Purpose |
|-----------|---------|---------|
| 📝 Backlog | `68eb52695d7ceeaa3f9df490` | Starting point for all new work |
| 🔴 Red (Test Failing) | `68eb52696807c2ab40a24208` | TDD Red phase - failing tests written |
| ⚙️ Doing | `68eb536feeda6f8236c2d811` | Active implementation work |
| 🟢 Green (Test Passing) | `68eb526909f804970dc93eb5` | TDD Green phase - tests pass |
| ✅ Quality Gates | `68eb526ad7735518abf7bcf3` | Lint, type-check, build validation |
| 🚫 Blocked | `68eb5370c6ae4624c7b0d6cd` | Tasks waiting on dependencies |
| 👤 Human Review | `68eb526abce27d0f5474b34f` | Manual verification and approval |
| ✨ Approved & Done | `68eb526ab9ed75b7219de599` | Completed and approved work |

### Workflow Movement Strategy

**Epics**: Stay in Backlog throughout. Track progress via Feature completion.

**Features**: Start in Backlog → Move to Approved & Done when all UserStories complete.

**UserStories**: Start in Backlog → Track progress via Task completion.

**Tasks** (Primary workflow units): Move through the full TDD cycle:
```
Backlog → Red → Doing → Green → Quality Gates → (Blocked if needed) → Human Review → Approved & Done
```

---

## Card Hierarchy System

### Naming Convention

```
Epic-{N00}: Title (Total SP)
├─ Feature-{Epic}-{N0}: Title (SP)
   ├─ UserStory-{Feature}-{N}: Title (SP)
      ├─ Task-{Story}-{N}: Title (SP)
```

**Example**:
```
Epic-100: Critical Bug Fixes (16 SP)
├─ Feature-100-10: Fix Server Initialization (3 SP)
   ├─ UserStory-100-10-5: ID/Name Mismatch Resolution (3 SP)
      ├─ Task-100-10-5-1: Update mcpUseAdapter to use config.id (1 SP)
      ├─ Task-100-10-5-2: Update managerMCPUse session creation (1 SP)
      └─ Task-100-10-5-3: Add unit tests for ID/name alignment (1 SP)
```

### Card Structure Guidelines

#### Epic Cards
- **Labels**: Epic + Priority (P0-P4)
- **Location**: Backlog (permanent)
- **Description Must Include**:
  - Epic overview and goals
  - List all Features with SP breakdown
  - Link to planning document reference
  - Status tracking (% complete)

#### Feature Cards
- **Labels**: Feature + Priority
- **Location**: Backlog → Approved & Done
- **Description Must Include**:
  - Feature description and problem statement
  - List all UserStories
  - Parent Epic reference
  - Files affected
  - Solution approach

#### UserStory Cards
- **Labels**: UserStory + Priority
- **Location**: Backlog → (workflow) → Approved & Done
- **Description Must Include**:
  - User story format: "As a... I need... so that..."
  - Background/context
  - Tasks as checklist items
  - Parent Feature reference
  - Acceptance Criteria (Given-When-Then)
  - Files affected

#### Task Cards
- **Labels**: Task + Priority
- **Location**: Full workflow movement
- **Description Must Include**:
  - TDD Approach (Red-Green-Refactor phases)
  - Detailed implementation steps
  - Code changes required with file paths and line numbers
  - Test requirements and coverage
  - Acceptance Criteria (Given-When-Then)
  - Parent UserStory reference
  - Definition of Done checklist

---

## Workflow Process

### Test-Driven Development (TDD) Flow

Tasks follow strict TDD workflow:

1. **📝 Backlog**: Task created with acceptance criteria
2. **🔴 Red Phase**: Write failing test
   - Write test that captures requirement
   - Verify test fails
   - Document expected behavior
3. **⚙️ Doing**: Implement solution
   - Write minimum code to pass test
   - No implementation before test
4. **🟢 Green Phase**: Tests pass
   - All new tests pass
   - All existing tests still pass (no regressions)
   - Code coverage ≥85%
5. **✅ Quality Gates**: Validation
   - `npm run check` passes (Biome lint + format)
   - `tsc -noEmit -skipLibCheck` passes (type check)
   - `npm run build` succeeds (production build)
6. **🚫 Blocked** (if needed): Dependencies
   - Document blocker in card comment
   - Link to blocking card/issue
7. **👤 Human Review**: Manual verification
   - Execute test scenarios
   - Capture screenshots/logs
   - Validate edge cases
   - Performance assessment
   - Reviewer sign-off with initials and date
8. **✨ Approved & Done**: Complete
   - All DoD criteria met
   - Human review approved
   - Ready for deployment

---

## MCP Tool Usage Patterns

### Efficient Card Retrieval

**Get all cards in a list** (faster than individual card fetches):
```typescript
const cards = await mcp__trello__get_cards_by_list_id({
  boardId: "68eb4723ab01134a8d545cf5",
  listId: "68eb52695d7ceeaa3f9df490"
})
```

**Get specific card details** (when you need full card data):
```typescript
const card = await mcp__trello__get_card({
  cardId: "68eb52cf9b3a43019bed6046"
})
```

### Creating Cards with Proper Structure

**Create a Task card**:
```typescript
await mcp__trello__add_card_to_list({
  boardId: "68eb4723ab01134a8d545cf5",
  listId: "68eb52695d7ceeaa3f9df490", // Backlog
  name: "Task-100-10-5-2: Update managerMCPUse session creation (1 SP)",
  description: `## Task-100-10-5-2: Update managerMCPUse session creation

**Parent**: UserStory-100-10-5: ID/Name Mismatch Resolution
**Priority**: P0
**Story Points**: 1

[... detailed description ...]`
})

// Then apply labels
await mcp__trello__update_card_details({
  cardId: cardId,
  labels: ["68eb4723ab01134a8d545d35", "68eb4723ab01134a8d545d37"] // Task + P0
})
```

### Moving Cards Through Workflow

```typescript
// Move card to next stage
await mcp__trello__move_card({
  cardId: "68eb548de8272bc51a8343e5",
  listId: "68eb52696807c2ab40a24208" // Move to Red (Test Failing)
})
```

### Adding Comments for Status Updates

```typescript
await mcp__trello__add_comment({
  cardId: "68eb548de8272bc51a8343e5",
  text: `✅ RED PHASE COMPLETE

Failing test written in \`tests/mcp/mcpUseAdapter.test.ts\`:
- Test verifies config.id is used as map key
- Test currently fails as expected

Moving to Doing for implementation.`
})
```

### Updating Card Progress

```typescript
// Mark as in progress
await mcp__trello__update_card_details({
  cardId: taskId,
  dueDate: "2025-10-15T17:00:00.000Z" // Optional deadline
})

// Mark as complete
await mcp__trello__update_card_details({
  cardId: taskId,
  dueComplete: true
})
```

---

## Common Operations

### Operation 1: Create Complete Task Hierarchy

When implementing a new feature from the planning document:

1. **Extract from planning doc**: Read `docs/2025-10-03-115553-planning.md`
2. **Create Epic card** if it doesn't exist (stays in Backlog)
3. **Create Feature card** (starts in Backlog)
4. **Create UserStory cards** for each story in the feature
5. **Create Task cards** for each task in the story
6. **Apply appropriate labels** to all cards (hierarchy + priority)
7. **Link cards** by referencing parent URLs in descriptions

### Operation 2: Move Task Through TDD Workflow

```typescript
// 1. Move to Red phase
await mcp__trello__move_card({ cardId: taskId, listId: "68eb52696807c2ab40a24208" })
await mcp__trello__add_comment({ cardId: taskId, text: "🔴 Writing failing tests..." })

// 2. Move to Doing
await mcp__trello__move_card({ cardId: taskId, listId: "68eb536feeda6f8236c2d811" })
await mcp__trello__add_comment({ cardId: taskId, text: "⚙️ Implementing solution..." })

// 3. Move to Green
await mcp__trello__move_card({ cardId: taskId, listId: "68eb526909f804970dc93eb5" })
await mcp__trello__add_comment({ cardId: taskId, text: "🟢 Tests passing. Coverage: 87%" })

// 4. Move to Quality Gates
await mcp__trello__move_card({ cardId: taskId, listId: "68eb526ad7735518abf7bcf3" })
await mcp__trello__add_comment({ cardId: taskId, text: "✅ Lint/Type/Build: All passed" })

// 5. Move to Human Review
await mcp__trello__move_card({ cardId: taskId, listId: "68eb526abce27d0f5474b34f" })
await mcp__trello__add_comment({ cardId: taskId, text: "👤 Ready for manual verification" })
```

### Operation 3: Query Board Status

```typescript
// Get all tasks in progress
const doingCards = await mcp__trello__get_cards_by_list_id({
  boardId: "68eb4723ab01134a8d545cf5",
  listId: "68eb536feeda6f8236c2d811"
})

// Get blocked tasks
const blockedCards = await mcp__trello__get_cards_by_list_id({
  boardId: "68eb4723ab01134a8d545cf5",
  listId: "68eb5370c6ae4624c7b0d6cd"
})

// Get recent activity
const activity = await mcp__trello__get_recent_activity({
  boardId: "68eb4723ab01134a8d545cf5",
  limit: 20
})
```

### Operation 4: Bulk Label Application

When creating multiple cards from a planning epic:

```typescript
const epicCards = [
  { id: "epic-id", labels: ["68eb4723ab01134a8d545d38", "68eb4723ab01134a8d545d37"] },
  { id: "feature-id", labels: ["68eb4723ab01134a8d545d39", "68eb4723ab01134a8d545d37"] },
  { id: "story-id", labels: ["68eb4723ab01134a8d545d34", "68eb4723ab01134a8d545d37"] },
  { id: "task-id", labels: ["68eb4723ab01134a8d545d35", "68eb4723ab01134a8d545d37"] }
]

for (const card of epicCards) {
  await mcp__trello__update_card_details({
    cardId: card.id,
    labels: card.labels
  })
}
```

### Operation 5: Complete Task Implementation Workflow (Following All Rules)

This demonstrates the complete workflow following all critical rules:

```typescript
/**
 * Complete task implementation following all workflow rules
 */
async function implementTask(taskId: string): Promise<void> {
  // STEP 1: Sync card with latest Trello state
  console.log("📥 Syncing card from Trello...")
  const card = await mcp__trello__get_card({ cardId: taskId })

  // Check if card was updated since last sync
  const lastSync = readLocalSyncTimestamp(taskId)
  if (new Date(card.dateLastActivity) > lastSync) {
    console.log("🔄 Card updated in Trello, syncing to local docs...")
    await syncCardToLocalDocs(card)
    await mcp__trello__add_comment({
      cardId: taskId,
      text: `🔄 Synced to local docs at ${new Date().toISOString()}\n\nCard was updated since last sync. Local planning document updated.`
    })
  }

  // STEP 2: RED PHASE - Write failing tests
  console.log("🔴 Starting RED phase...")
  await mcp__trello__move_card({
    cardId: taskId,
    listId: "68eb52696807c2ab40a24208" // Red (Test Failing)
  })

  // Write tests (implementation not shown)
  // ... write failing tests ...

  // Commit tests
  const redCommit = await gitCommit("test: add failing test for config.id usage")

  await mcp__trello__add_comment({
    cardId: taskId,
    text: `🔴 RED PHASE COMPLETE

Failing test written in \`tests/mcp/mcpUseAdapter.test.ts\`

**Commit**: \`${redCommit}\` - test: add failing test for config.id usage
**Branch**: \`001-integrate-mcp-servers\`
**Test File**: \`tests/mcp/mcpUseAdapter.test.ts\`

Test verifies config.id is used as map key when both id and name exist.
Test fails as expected (current implementation uses config.name).

Moving to Doing for implementation.`
  })

  // STEP 3: DOING PHASE - Implement solution
  console.log("⚙️ Starting implementation...")
  await mcp__trello__move_card({
    cardId: taskId,
    listId: "68eb536feeda6f8236c2d811" // Doing
  })

  await mcp__trello__add_comment({
    cardId: taskId,
    text: `⚙️ IMPLEMENTATION IN PROGRESS

Working on: Update mcpUseAdapter to use config.id
Target file: \`src/mcp/mcpUseAdapter.ts:41\`

Implementing: \`const serverKey = config.id || config.name\``
  })

  // Implement solution (implementation not shown)
  // ... write implementation code ...

  const greenCommit = await gitCommit("feat: use config.id as primary server identifier")

  // STEP 4: GREEN PHASE - Tests pass
  console.log("🟢 Running tests...")
  const testResult = await runTests() // { passed: true, coverage: 87 }

  await mcp__trello__move_card({
    cardId: taskId,
    listId: "68eb526909f804970dc93eb5" // Green (Test Passing)
  })

  await mcp__trello__add_comment({
    cardId: taskId,
    text: `🟢 GREEN PHASE COMPLETE

All tests passing! ✅

**Commit**: \`${greenCommit}\` - feat: use config.id as primary server identifier
**Branch**: \`001-integrate-mcp-servers\`
**Files Changed**:
- \`src/mcp/mcpUseAdapter.ts\` (line 41)
- \`tests/mcp/mcpUseAdapter.test.ts\` (added)

**Test Results**:
- All new tests: PASS ✅
- Regression tests: PASS ✅
- Coverage: ${testResult.coverage}% ✅

No regressions introduced. Moving to Quality Gates.`
  })

  // STEP 5: QUALITY GATES - Lint, type-check, build
  console.log("✅ Running quality gates...")
  await mcp__trello__move_card({
    cardId: taskId,
    listId: "68eb526ad7735518abf7bcf3" // Quality Gates
  })

  const lintResult = await runLint()
  const typeCheckResult = await runTypeCheck()
  const buildResult = await runBuild()

  await mcp__trello__add_comment({
    cardId: taskId,
    text: `✅ QUALITY GATES PASSED

All quality checks completed successfully!

**Lint** (\`npm run check\`): ${lintResult.status} ✅
**Type Check** (\`tsc -noEmit\`): ${typeCheckResult.status} ✅
**Build** (\`npm run build\`): ${buildResult.status} ✅

No lint errors, type errors, or build failures.
Ready for human review.`
  })

  // STEP 6: HUMAN REVIEW
  console.log("👤 Ready for human review...")
  await mcp__trello__move_card({
    cardId: taskId,
    listId: "68eb526abce27d0f5474b34f" // Human Review
  })

  await mcp__trello__add_comment({
    cardId: taskId,
    text: `👤 READY FOR HUMAN REVIEW

Task implementation complete and all quality gates passed.

**Review Checklist**:
- [ ] Manual verification with test scenarios
- [ ] Edge cases validated
- [ ] Performance impact assessed
- [ ] Code review completed
- [ ] Reviewer sign-off

**Test Scenarios**:
1. Server with both id and name → uses id as key
2. Server with different id and name → uses id
3. Server with only name (no id) → fallback to name (backward compatible)

**Commits to Review**:
- \`${redCommit}\` - test: add failing test for config.id usage
- \`${greenCommit}\` - feat: use config.id as primary server identifier`
  })

  // STEP 7: After human approval, move to Done
  // (This would be done by human reviewer after manual verification)
  // await mcp__trello__move_card({
  //   cardId: taskId,
  //   listId: "68eb526ab9ed75b7219de599" // Approved & Done
  // })
}

/**
 * Helper to sync Trello card to local planning document
 */
async function syncCardToLocalDocs(card: any): Promise<void> {
  // Read local planning document
  const planningDoc = await readFile('docs/2025-10-03-115553-planning.md')

  // Extract task section based on card name
  const taskMatch = card.name.match(/Task-(\d+-\d+-\d+-\d+)/)
  if (!taskMatch) return

  // Find and update the task section in planning doc
  const taskSection = findTaskSection(planningDoc, taskMatch[1])

  // Compare and update if different
  if (taskSection.acceptanceCriteria !== extractAcceptanceCriteria(card.desc)) {
    updateTaskSection(planningDoc, taskMatch[1], {
      acceptanceCriteria: extractAcceptanceCriteria(card.desc),
      description: card.desc,
      lastUpdated: card.dateLastActivity
    })
  }

  // Save sync timestamp
  saveSyncTimestamp(card.id, new Date())
}
```

---

## Critical Workflow Rules

### Rule 1: No Skipping Workflow States ⛔

**NEVER jump directly to Done state.** Cards MUST move through each workflow stage sequentially according to the Definition of Done.

❌ **Forbidden**:
```typescript
// DO NOT DO THIS - Skipping from Backlog to Done
await mcp__trello__move_card({ cardId: taskId, listId: "68eb526ab9ed75b7219de599" })
```

✅ **Required**:
```typescript
// Follow the complete workflow path
Backlog → Red → Doing → Green → Quality Gates → Human Review → Approved & Done
```

**Enforcement**: Before moving a card, verify it has completed ALL requirements for its current stage.

### Rule 2: Document Git Commits in Card Comments 📝

**Every code change MUST be linked to its git commit in the card comment.**

✅ **Required Comment Format**:
```typescript
await mcp__trello__add_comment({
  cardId: taskId,
  text: `✅ GREEN PHASE COMPLETE

Tests now passing with 87% coverage.

**Commit**: \`c454f77\` - feat: implement concurrent text editing stream with anchor-aware mutations
**Branch**: \`001-integrate-mcp-servers\`
**Files Changed**:
- \`src/mcp/mcpUseAdapter.ts\` (line 41)
- \`tests/mcp/mcpUseAdapter.test.ts\` (added)

All regression tests passing. Moving to Quality Gates.`
})
```

**Comment at Each Stage** with commit information:
- **Red Phase**: "Tests written in commit `abc123`"
- **Green Phase**: "Implementation in commit `def456`"
- **Quality Gates**: "Lint fixes in commit `ghi789`"

### Rule 3: Sync Trello Updates to Local Docs 🔄

**Before starting work on ANY card, sync it with local documentation.**

**Workflow**:
```typescript
// 1. Fetch latest card state
const card = await mcp__trello__get_card({ cardId: taskId })

// 2. Check dateLastActivity - if newer than local docs, sync required
if (card.dateLastActivity > lastLocalUpdate) {
  // 3. Update local planning markdown with Trello changes
  // Example: User updated acceptance criteria or file paths
  await syncTrelloToLocalDocs(card)
}

// 4. Verify sync before starting implementation
// Compare card description vs docs/2025-10-03-115553-planning.md
```

**What to Sync**:
- Card description changes (requirements, acceptance criteria)
- Comment updates (clarifications, decisions)
- Label changes (priority shifts)
- Due date changes
- Checklist item additions/modifications

**Sync Pattern**:
```typescript
/**
 * Sync Trello card to local planning document
 */
async function syncCardToPlanning(cardId: string): Promise<void> {
  const card = await mcp__trello__get_card({ cardId })

  // Extract card metadata
  const taskNumber = card.name.match(/Task-(\d+-\d+-\d+-\d+)/)?[1]

  // Update local planning doc section
  // Parse card description and update corresponding section in:
  // docs/2025-10-03-115553-planning.md

  // Log sync action
  await mcp__trello__add_comment({
    cardId,
    text: `🔄 Synced to local docs at ${new Date().toISOString()}`
  })
}
```

### Rule 4: Use Stickers for Visual Markers 🎨

**Stickers provide quick visual status indicators beyond labels.**

**Available via Trello UI** (apply manually or note for human reviewer):
- 🔥 **Hot/Urgent**: Critical path items needing immediate attention
- ⚠️ **Warning**: Potential issues or tech debt
- ✅ **Verified**: Passed human review with no issues
- 🐛 **Bug**: Bug fix rather than feature
- 📚 **Docs**: Documentation changes required
- 🔬 **Experimental**: Proof of concept or experimental approach

**Note**: Stickers cannot be applied via MCP tools currently. Document sticker needs in comments for human reviewers to apply.

```typescript
await mcp__trello__add_comment({
  cardId: taskId,
  text: `👤 REVIEWER: Please apply 🔥 Hot sticker - critical path blocker`
})
```

### Rule 5: Process User-Created Cards in Backlog 📥

**Users may create new cards directly in Backlog. LLMs must review and integrate them into the proper hierarchy.**

**Daily Workflow**:
```typescript
// 1. Check for new user-created cards in Backlog
const backlogCards = await mcp__trello__get_cards_by_list_id({
  boardId: "68eb4723ab01134a8d545cf5",
  listId: "68eb52695d7ceeaa3f9df490"
})

// 2. Identify cards without proper hierarchy labels
const unlabeledCards = backlogCards.filter(card =>
  !card.labels.find(l => ['Epic', 'Feature', 'UserStory', 'Task'].includes(l.name))
)

// 3. For each unlabeled card, analyze and categorize
for (const card of unlabeledCards) {
  await processUserCreatedCard(card)
}
```

**Processing Pattern**:
```typescript
async function processUserCreatedCard(card: any): Promise<void> {
  // Analyze card content to determine type and placement
  const analysis = analyzeCardContent(card.desc)

  // Add comment documenting analysis
  await mcp__trello__add_comment({
    cardId: card.id,
    text: `🤖 AUTOMATED ANALYSIS

**Card Type**: ${analysis.type}
**Suggested Hierarchy**: ${analysis.hierarchy}
**Related Epic**: ${analysis.epic || 'New Epic needed'}
**Estimated SP**: ${analysis.storyPoints}

**Analysis**:
${analysis.reasoning}

**Recommendations**:
${analysis.recommendations}

**Action Required**:
- Review and confirm card type
- Assign proper labels
- Link to parent cards
- Update planning document if new Epic/Feature`
  })

  // If it's an update to existing work, link to parent
  if (analysis.parentCard) {
    await linkToParent(card.id, analysis.parentCard)
  }

  // If it's entirely new, create planning document entry
  if (analysis.isNew) {
    await createPlanningEntry(card)
  }
}
```

**Classification Logic**:
- **Epic**: High-level goal, multiple features, 15+ SP
- **Feature**: Complete functionality, multiple stories, 5-13 SP
- **UserStory**: Single user-facing capability, 2-5 SP
- **Task**: Implementation detail, 1-3 SP
- **Bug**: Existing functionality broken (use 🐛 sticker)

**Integration Steps**:
1. Analyze card description and title
2. Determine if it fits into existing Epic/Feature or needs new hierarchy
3. Apply appropriate hierarchy label (Epic/Feature/UserStory/Task)
4. Apply priority label (P0-P4) based on content
5. If update to existing: Add reference to parent card URL
6. If new: Create corresponding entry in `docs/2025-10-03-115553-planning.md`
7. Add comment explaining categorization and next steps

### Rule 6: Epic Lifecycle - Never Moves to Done ♾️

**Epics NEVER move to Approved & Done list. They remain in Backlog throughout their lifecycle.**

**Epic Final States**:
```
Backlog (Active) → Backlog (In Progress) → Backlog (Complete)
```

**Status Tracking via Comments**:
```typescript
// When Epic starts
await mcp__trello__add_comment({
  cardId: epicId,
  text: `📊 EPIC STATUS: IN PROGRESS

Started: ${new Date().toISOString()}

**Features**:
- [ ] Feature-100-10: Fix Server Initialization (3 SP)
- [ ] Feature-100-20: Enable Configuration Settings (3 SP)
- [ ] Feature-100-30: Activate Health Monitoring (3 SP)
- [ ] Feature-100-40: Fix Inefficient Tool Discovery (3 SP)
- [ ] Feature-100-50: Fix Memory Leaks (2 SP)
- [ ] Feature-100-90: Release Validation (2 SP)

**Progress**: 0/6 Features Complete (0%)`
})

// Update as features complete
await mcp__trello__add_comment({
  cardId: epicId,
  text: `📊 EPIC STATUS: IN PROGRESS

**Features**:
- [x] Feature-100-10: Fix Server Initialization (3 SP) ✅
- [ ] Feature-100-20: Enable Configuration Settings (3 SP)
- [ ] Feature-100-30: Activate Health Monitoring (3 SP)
- [ ] Feature-100-40: Fix Inefficient Tool Discovery (3 SP)
- [ ] Feature-100-50: Fix Memory Leaks (2 SP)
- [ ] Feature-100-90: Release Validation (2 SP)

**Progress**: 1/6 Features Complete (17%)
**Completed SP**: 3/16 (19%)`
})

// When all features complete
await mcp__trello__add_comment({
  cardId: epicId,
  text: `📊 EPIC STATUS: COMPLETE

All features completed! ✅

**Features**:
- [x] Feature-100-10: Fix Server Initialization (3 SP) ✅
- [x] Feature-100-20: Enable Configuration Settings (3 SP) ✅
- [x] Feature-100-30: Activate Health Monitoring (3 SP) ✅
- [x] Feature-100-40: Fix Inefficient Tool Discovery (3 SP) ✅
- [x] Feature-100-50: Fix Memory Leaks (2 SP) ✅
- [x] Feature-100-90: Release Validation (2 SP) ✅

**Progress**: 6/6 Features Complete (100%)
**Completed SP**: 16/16 (100%)

**Completed**: ${new Date().toISOString()}
**Duration**: 14 days

Epic remains in Backlog for historical tracking.`
})
```

**Why Epics Stay in Backlog**:
- Provides historical context
- Allows reopening if issues discovered
- Maintains planning reference
- Tracks long-term progress across releases

### Rule 7: Use Blocked State for Clarifications ❓

**When you need clarification on requirements, move card to Blocked and document questions.**

**Blocked Workflow**:
```typescript
async function requestClarification(cardId: string, questions: string[], assumptions: string[]): Promise<void> {
  // Move to Blocked list
  await mcp__trello__move_card({
    cardId: cardId,
    listId: "68eb5370c6ae4624c7b0d6cd" // Blocked
  })

  // Document questions and assumptions
  await mcp__trello__add_comment({
    cardId: cardId,
    text: `🚫 BLOCKED - CLARIFICATION NEEDED

**Blocking Questions**:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

---

**Current Assumptions** (proceeding if not clarified):
${assumptions.map((a, i) => `${i + 1}. ${a}`).join('\n')}

---

**Impact**:
- Implementation paused until clarification
- Related cards may be blocked: [list dependent cards]
- Estimated delay: [time estimate]

**Requested From**: @[username or team]
**Urgency**: [Low/Medium/High/Critical]

👤 **Action Required**: Please review questions and provide clarification in comments.`
  })
}
```

**Example Blocked Comment**:
```typescript
await mcp__trello__add_comment({
  cardId: "68eb548de8272bc51a8343e5",
  text: `🚫 BLOCKED - CLARIFICATION NEEDED

**Blocking Questions**:
1. Should config.id fallback to config.name or throw an error if id is missing?
2. Do we need to handle backwards compatibility for existing configs without id field?
3. Should we migrate existing configs to add id field automatically?

---

**Current Assumptions** (proceeding if not clarified):
1. ✅ Assume fallback to config.name for backwards compatibility
2. ✅ Assume no automatic migration, manual config update required
3. ✅ Assume we log a warning when fallback occurs

---

**Impact**:
- Task-100-10-5-2 and Task-100-10-5-3 are dependent
- UserStory-100-10-5 cannot complete until resolved
- Estimated delay: 1-2 days pending response

**Requested From**: @product-owner
**Urgency**: Medium

👤 **Action Required**: Please confirm assumptions or provide alternative approach.`
})
```

**When to Use Blocked**:
- Requirements are ambiguous or contradictory
- Acceptance criteria are unclear
- Technical approach needs validation
- Dependency on external team/decision
- Breaking change requires approval
- Security/compliance review needed

**Unblocking Process**:
```typescript
// After receiving clarification
await mcp__trello__add_comment({
  cardId: cardId,
  text: `✅ UNBLOCKED - CLARIFICATION RECEIVED

**Answers Received**:
1. Q: Should config.id fallback to config.name?
   A: Yes, fallback for backwards compatibility ✅
2. Q: Handle configs without id field?
   A: Yes, use fallback but log deprecation warning ✅
3. Q: Automatic migration needed?
   A: No, document manual migration path ✅

**Updated Approach**:
- Implement fallback: \`config.id || config.name\`
- Add deprecation warning when fallback used
- Document migration guide in MCP_ARCHITECTURE.md

**Next Steps**:
- Resume implementation in Doing phase
- Update tests to include fallback scenario
- Add deprecation warning to logs

Moving back to previous workflow stage.`
})

// Move back to appropriate stage (probably Backlog or Red)
await mcp__trello__move_card({
  cardId: cardId,
  listId: "68eb52695d7ceeaa3f9df490" // Backlog or appropriate stage
})
```

**Blocked Card Best Practices**:
1. **Clear Questions**: Number questions for easy reference
2. **Document Assumptions**: State what you'll do if not clarified
3. **Estimate Impact**: How many cards/days affected
4. **Tag Stakeholders**: Mention who needs to respond
5. **Set Urgency**: Help prioritize response
6. **Update Regularly**: Add comments if no response after 24-48 hours
7. **Link Dependencies**: Reference blocked child cards

---

## Best Practices

### For Efficient Board Usage

1. **Batch Operations**: When fetching multiple cards, prefer `get_cards_by_list_id` over individual `get_card` calls
2. **Label Early**: Apply labels immediately when creating cards to maintain visual organization
3. **Comment Progress**: Add comments at each workflow transition to create audit trail with commit hash
4. **Link Parents**: Always reference parent card URLs in descriptions for traceability
5. **Story Points**: Include story points in card titles for quick estimation visibility
6. **Sync First**: Always fetch and sync card before starting work on it

### For Card Creation

1. **Follow Naming Convention**: Strict adherence to `Type-Number: Title (SP)` format
2. **Complete Descriptions**: Include all required sections (see Card Structure Guidelines)
3. **Acceptance Criteria**: Always use Given-When-Then format
4. **File References**: Include file paths with line numbers (e.g., `src/main.ts:47`)
5. **Planning References**: Link back to planning documents with line numbers

### For Workflow Management

1. **One Task Active**: Limit work-in-progress to maintain focus
2. **Complete Before Moving**: Ensure all criteria met before moving to next stage
3. **Document Blockers**: When blocked, add detailed comment explaining the blocker
4. **Update Parents**: When task completes, check UserStory task checklist
5. **Status Comments**: Add comments when moving cards to document rationale

### For Code Implementation

1. **TDD Strictly**: Always write failing test before implementation
2. **Test Coverage**: Maintain ≥85% coverage for new/modified code
3. **Quality Gates**: Don't skip any quality checks
4. **Incremental Commits**: Commit at each TDD phase (Red, Green, Refactor)
5. **Review Ready**: Ensure tests, lint, and build all pass before Human Review

### For Collaboration

1. **Clear Comments**: Write comments as if for human readers
2. **Screenshots**: Attach screenshots for UI changes in Human Review
3. **Sign-Off Format**: Use format "✅ Reviewed by [Initials] on [Date]"
4. **Question Cards**: Create separate cards for questions/clarifications
5. **Blocker Resolution**: Tag relevant people when unblocking cards

---

## Definition of Done (DoD) Checklist

Every Task card should track these criteria:

### Development Phase (AI Implementation)
- [ ] Failing test(s) written first to capture the defect or requirement (red test)
- [ ] Code changes make those tests pass (green test)
- [ ] No regressions introduced (all existing suites stay green)
- [ ] Test coverage for new/modified modules ≥85%
- [ ] Observable behavior documented in settings/help copy if needed

### Review Phase (Human Verification)
- [ ] Manual verification completed using provided test scenarios
- [ ] Screenshots/logs captured for UI/behavior changes
- [ ] Edge cases and error conditions manually tested
- [ ] Performance impact assessed (if applicable)
- [ ] Reviewer sign-off with initials and date

### Quality Gates
- [ ] Linting passes (Biome)
- [ ] Type checking passes (TypeScript)
- [ ] Build completes successfully
- [ ] Security scan passes (if external dependencies added)

---

## Quick Reference: Card IDs

### Template Cards
- **DoD Template**: `68eb5297efae15a476b11fab`
- **Workflow Guide**: `68eb52b5dc413a75ba087941`
- **Hierarchy Guide**: `68eb5464ffdb7accb26e0ce7`
- **Setup Guide**: `68eb5677635a9ed17f91d957`

### Example Hierarchy (Epic-100)
- **Epic-100**: `68eb52cf9b3a43019bed6046`
- **Feature-100-10**: `68eb548b5d9b850fb9a4fe1a`
- **UserStory-100-10-5**: `68eb548c718273d4625f341c`
- **Task-100-10-5-1**: `68eb548de8272bc51a8343e5`

---

## Troubleshooting

### Labels Not Applying
**Issue**: `update_card_details` returns 400 error
**Solution**: Ensure you're passing label IDs (long strings), not color names or label names

### Card Not Moving
**Issue**: `move_card` fails
**Solution**: Verify both cardId and target listId are correct. Use `get_lists` to confirm list IDs.

### Missing Label IDs
**Issue**: Need to get label IDs but don't have them
**Solution**: Fetch a card that already has labels applied using `get_card` and extract from the `labels` array

### Cannot Find Cards
**Issue**: Searching for specific cards
**Solution**: Use `get_cards_by_list_id` to get all cards in Backlog, then filter by name pattern

---

## Additional Resources

- **Planning Document**: `docs/2025-10-03-115553-planning.md`
- **Board URL**: https://trello.com/b/NDXU4w4k/mcp-servers-intgration-release
- **MCP Architecture**: `docs/MCP_ARCHITECTURE.md`
- **Testing Guide**: `docs/TESTING.md`

---

**Last Updated**: 2025-10-12
**Maintained By**: Development Team
**Board Version**: v1.0
