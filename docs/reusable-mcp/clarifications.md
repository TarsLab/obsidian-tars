@@ -1,145 +0,0 @@
🔍 Clarification Questions
1. Scope & Purpose Confirmation
Q1.1: The extracted library will be used for:
 A. Other internal projects you're planning
 B. Making the MCP logic testable in isolation
 C. Potential future open-source release (after v1.0 stabilization)
 D. All of the above
Q1.2: Priority order - which is most important?
 A. Clean architecture / separation of concerns
 B. Reusability in other projects
 C. Easier testing and maintenance
 D. Learning exercise / best practices
2. Document-Specific Features
The current implementation has several document-aware features: Q2.1: toolResultCache.ts - Parses markdown to find cached tool results
Current: Tightly coupled to Obsidian Editor API
Plan: Keep in plugin (marked as ❌ in extraction plan)
Question: Agree to keep this in plugin, or want to extract with abstraction?
Q2.2: documentSessionHandlers.ts - Tracks per-document execution counts
Current: Hooks into Obsidian's active-leaf-change event
Plan: Library provides generic session API, plugin maps documents to sessions
Question: This approach works for you?
3. Breaking Changes & Timeline
Q3.1: Current plugin state:
Completed: Epics 100-400 (143 SP) ✅
Remaining: Epics 500, 600, 900 (partial), 1000 (82 SP) ⏳
Question: Should we complete remaining epics BEFORE extraction, or is parallel work acceptable?
Q3.2: Risk tolerance:
Extraction is 50 SP over 4 weeks
During extraction, plugin development pauses
Question: Is this acceptable, or should we do incremental extraction (e.g., 10 SP per sprint)?
4. Dependency Injection Details
Q4.1: Logger injection - confirm this pattern works:
// Library provides console logger by default
const manager = new MCPServerManager() // Uses console

// Plugin can inject Obsidian logger
const logger = createObsidianLoggerAdapter('mcp:manager')
const manager = new MCPServerManager({ logger })
Question: Acceptable? Or prefer logger always required (no default)?
Q4.2: Error reporting - confirm this pattern:
// Library: Optional error reporter
const executor = new ToolExecutor(manager, {
  errorReporter: statusBarAdapter // Optional
})

// If provided, library calls: errorReporter.report(category, msg, error, ctx)
// If not provided, library just logs via logger
Question: This design works? Or should errors always be reported somewhere?
5. Event System Migration
Q5.1: EventTarget vs EventEmitter:
// Current (Node.js)
manager.on('server-started', (serverId) => {})
manager.emit('server-started', serverId)

// New (Web standard)
manager.addEventListener('server-started', (event) => {
  const { serverId } = event.detail
})
manager.dispatchEvent(new CustomEvent('server-started', {
  detail: { serverId }
}))
Question: This change acceptable for plugin code? It's more verbose but platform-agnostic.
Alternative: Keep EventEmitter, accept Node.js dependency?
6. Build & Distribution
Q6.1: Library output format:
ESM (import/export) for modern Node.js
CJS (require) for compatibility
Type declarations (.d.ts)
Question: Need both ESM and CJS, or just ESM?
Q6.2: Monorepo structure:
obsidian-tars/
├── packages/
│   └── mcp-manager/    # New library
├── src/                # Existing plugin
├── tests/              # Existing plugin tests
├── package.json        # Workspace root
└── pnpm-workspace.yaml
Question: This structure works? Or prefer different layout?
7. Testing Strategy
Q7.1: Test migration:
Unit tests → Move to library
Integration tests → Split (some in library, some in plugin)
E2E tests → Stay in plugin
Question: Agree with this split?
Q7.2: Performance benchmarking:
Benchmark tool execution latency (before/after)
Target: Within 5% of current performance
Question: Is 5% acceptable, or need exact parity?
8. Documentation
You said "skip for now" on documentation generation, but clarifying: Q8.1: README and basic API docs still needed for the library?
At minimum: Installation, quick start, API overview
Question: Skip everything, or just auto-generation (TypeDoc)?
9. Version & Release
Q9.1: Versioning strategy:
Library: v1.0.0 (initial release)
Plugin: v3.6.0 (minor bump, uses library)
Question: Library and plugin versions independent, or lock-step?
Q9.2: Release process:
Extract to library → Test → Release library v1.0.0 → Update plugin
Question: Want a "feature flag" to toggle old/new implementation during transition?
10. Technical Debt & Future Work
Q10.1: Items explicitly deferred for v2.0:
Browser compatibility testing
Additional provider adapters (beyond Claude/OpenAI/Ollama)
Performance optimizations (request batching, connection pooling)
Question: Anything else you want explicitly deferred?

🎯 Quick Decision Template
If you want to speed through, here's a quick response template:
1.1: [A/B/C/D]
1.2: [A/B/C/D]
2.1: [Keep in plugin / Extract with abstraction]
2.2: [Yes / No, because...]
3.1: [Complete remaining epics first / Parallel work ok]
3.2: [4-week extraction ok / Prefer incremental]
4.1: [Default console logger ok / Always required]
4.2: [Optional reporter ok / Always required]
5.1: [EventTarget ok / Keep EventEmitter]
6.1: [ESM only / Both ESM and CJS]
6.2: [Proposed structure ok / Suggest alternative]
7.1: [Test split ok / Different approach]
7.2: [5% acceptable / Need exact parity]
8.1: [Skip all docs / Just README + API overview]
9.1: [Independent versioning / Lock-step]
9.2: [Feature flag needed / Direct cutover]
10.1: [List any other deferrals]

Let me know what you'd like to clarify, or if you're ready to proceed with the plan as-is!

Q1.1: A, B
Q1.2: A, B, C
Q2.1: plan for future extractions, create interfaces for abstract the concrete obsidian implementation 
Q2.2: plan for future extraction, create interfaces for abstract the concrete obsidian implementation 
Q3.1: we complete other tasks before starting with this one
Q3.2: risks accepatable
Q4.1: abstract interface, rely on ts-log NPM library
Q4.2: use event emitter for errors throwing
Q5.1: keep nodejs style
Q6.1: esm
Q6.2: ok for today
Q7.1: move into library
Q7.2: no performance changes are expected
Q8.1: readme file in package subfolder is enough
Q9.1: own version number
Q9.2: no separated release process,
No newline at end of file
