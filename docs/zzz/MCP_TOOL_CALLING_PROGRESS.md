# MCP Tool Calling Implementation Progress

**Date**: 2025-10-02
**Branch**: 001-integrate-mcp-servers
**Commit**: 3294eb4

---

## ✅ Completed (First Commit)

### Core Infrastructure
1. **Tool Response Parsers** ([src/mcp/toolResponseParser.ts](../src/mcp/toolResponseParser.ts))
   - ✅ Generic `ToolResponseParser<TChunk>` interface
   - ✅ `OpenAIToolResponseParser` - Handles streaming tool_calls
   - ✅ `ClaudeToolResponseParser` - Handles content_block events
   - ✅ `OllamaToolResponseParser` - Handles pre-parsed tool calls
   - ✅ 26 tests passing (18 interface + 8 detailed OpenAI tests)

2. **Tool Calling Coordinator** ([src/mcp/toolCallingCoordinator.ts](../src/mcp/toolCallingCoordinator.ts))
   - ✅ `ToolCallingCoordinator` class
   - ✅ Multi-turn conversation loop logic
   - ✅ Tool execution integration
   - ✅ Result injection back to LLM
   - ✅ Max turns limit (prevents infinite loops)
   - ✅ 6 coordinator tests passing

3. **Provider Adapters** ([src/mcp/providerAdapters.ts](../src/mcp/providerAdapters.ts))
   - ✅ `ProviderAdapter` interface
   - ✅ OpenAI adapter factory
   - ✅ Tool-to-server mapping helper

4. **Test Coverage**
   - ✅ 90 unit/integration tests passing
   - ✅ Comprehensive test suite for parsers
   - ✅ Coordinator multi-turn scenarios
   - ✅ Contract tests for all interfaces

5. **Documentation**
   - ✅ [MCP_FULL_INTEGRATION_ANALYSIS.md](./MCP_FULL_INTEGRATION_ANALYSIS.md) - Complete analysis
   - ✅ This progress document

---

## 🔄 Current State

### What Works
- ✅ Tool response parsing from LLM streams
- ✅ Coordinator orchestrates multi-turn loops
- ✅ Tool execution via existing ToolExecutor
- ✅ All infrastructure tested and working

### What's Missing
- ❌ Provider integration (providers don't use coordinator yet)
- ❌ Streaming text while tool calling in progress
- ❌ UI feedback for tool execution

---

## 📋 Next Steps

### Phase 1: Provider Integration Architecture Decision

**Option A: Wrap at editor.ts level**
```typescript
// In editor.ts generate()
if (mcpManager && mcpExecutor && providerSupportsTools(vendor.name)) {
    // Use coordinator wrapper
    for await (const text of generateWithTools(...)) {
        insertText(...)
    }
} else {
    // Original code path
    for await (const text of sendRequest(...)) {
        insertText(...)
    }
}
```

**Pros**:
- No provider changes needed
- Backward compatible
- Centralized tool calling logic

**Cons**:
- Duplicates text insertion logic
- Harder to maintain two code paths

**Option B: Make providers tool-aware**
```typescript
// In providers/openAI.ts
async function* sendRequestWithTools(messages, ...) {
    if (mcpManager && mcpExecutor) {
        const coordinator = new ToolCallingCoordinator()
        const adapter = createOpenAIAdapter({...})
        yield* coordinator.generateWithTools(messages, adapter, mcpExecutor)
    } else {
        // Original streaming code
    }
}
```

**Pros**:
- Provider-specific tool handling
- Cleaner separation of concerns
- Easier to optimize per provider

**Cons**:
- Modifies all providers
- More test surface area

**Decision**: **Option B** - Make providers tool-aware
- Reasoning: Better architecture, each provider controls its own tool calling
- Allows provider-specific optimizations
- Tests already structured for this approach

### Phase 2: OpenAI Provider Integration

**Tasks**:
1. ✅ Create provider adapter factory
2. ⏳ Modify OpenAI sendRequestFunc to use coordinator
3. ⏳ Handle backward compatibility (no tools = original behavior)
4. ⏳ Add tool execution notifications
5. ⏳ Test with real OpenAI API + MCP server

**Implementation Plan**:
```typescript
// src/providers/openAI.ts

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages, controller, resolveEmbedAsBinary, saveAttachment) {
		const { mcpManager, mcpExecutor, ...options } = settings

		// Check if tool calling is enabled
		const hasTools = mcpManager && mcpExecutor

		if (hasTools) {
			// Use tool-aware path
			const coordinator = new ToolCallingCoordinator()
			const adapter = createOpenAIAdapter(/* ... */)

			yield* coordinator.generateWithTools(
				messages,
				adapter,
				mcpExecutor,
				{ documentPath: /* from context */ }
			)
		} else {
			// Original path (backward compatible)
			const client = new OpenAI({...})
			const stream = await client.chat.completions.create({...})

			for await (const part of stream) {
				yield part.choices[0]?.delta?.content || ''
			}
		}
	}
```

### Phase 3: Other Providers

**OpenAI-Compatible** (same adapter):
- Azure
- OpenRouter
- Grok
- DeepSeek
- SiliconFlow

**Custom Adapters Needed**:
- Claude (native tool_use)
- Ollama (different format)
- Gemini (functionDeclarations)

**Order of Implementation**:
1. OpenAI (prototype)
2. Azure (test OpenAI adapter reuse)
3. Ollama (test Ollama parser)
4. Claude (complex - native tools)
5. Gemini (complex - different format)
6. Remaining OpenAI-compatible

### Phase 4: UI & UX

**Tool Execution Feedback**:
- Show "Calling tool X..." notification
- Progress indicators
- Tool result summaries
- Execution history in status bar

**Error Handling**:
- Graceful degradation
- User-friendly error messages
- Retry logic

**Settings**:
- Enable/disable tool calling per provider
- Max turns limit configuration
- Tool approval mode (manual vs automatic)

---

## 🧪 Testing Strategy

### Unit Tests
- ✅ Parser tests (26 passing)
- ✅ Coordinator tests (6 passing)
- ⏳ Provider adapter tests
- ⏳ Integration tests with mocked LLMs

### Integration Tests
- ⏳ Full flow: User question → Tool call → Tool execution → Final answer
- ⏳ Multi-turn scenarios
- ⏳ Error handling paths

### E2E Tests
- ⏳ Real Ollama + MCP memory server
- ⏳ Real OpenAI + MCP filesystem server
- ⏳ Claude + MCP server

### Manual Testing Checklist
- [ ] OpenAI with filesystem MCP server
- [ ] Multi-turn tool calling (2+ tools)
- [ ] Error recovery (tool fails)
- [ ] Backward compatibility (no tools)
- [ ] UI feedback and notifications
- [ ] Status bar shows tool execution
- [ ] Works on mobile (if applicable)

---

## 📊 Success Metrics

### MVP (Minimum Viable Product)
- [ ] OpenAI provider uses tools autonomously
- [ ] User asks question → LLM calls tool → LLM answers
- [ ] At least one E2E test passes
- [ ] No regressions in existing functionality

### Complete Implementation
- [ ] All providers with "Tool Calling" capability support MCP
- [ ] Comprehensive test coverage (>90%)
- [ ] UI feedback for tool execution
- [ ] Error handling and retries
- [ ] Documentation updated
- [ ] Performance: No noticeable slowdown vs. non-tool responses

---

## 🔍 Technical Decisions

### Why Provider-Level Integration?
- Each provider has unique streaming format
- Allows provider-specific optimizations
- Cleaner separation of concerns
- Easier to test

### Why Coordinator Pattern?
- Abstracts multi-turn complexity
- Reusable across providers
- Testable independently
- Handles edge cases centrally

### Why Parser Abstraction?
- Providers stream in different formats
- OpenAI: Incremental JSON chunks
- Claude: Event-based blocks
- Ollama: Complete objects
- Parser hides complexity

### Backward Compatibility
- Tools are opt-in (requires mcpManager + mcpExecutor)
- Existing code works unchanged
- Gradual rollout possible

---

## 🐛 Known Issues & Limitations

### Current Limitations
1. **No parallel tool execution** - Tools execute sequentially
2. **No streaming during tool execution** - User sees pause while tool runs
3. **Simple tool-to-server mapping** - First server wins if duplicate tools
4. **No tool approval UI** - Tools execute automatically

### Future Enhancements
1. **Parallel tool execution** - Execute multiple tools concurrently
2. **Streaming status updates** - "Calling tool..." messages
3. **Smart tool routing** - Context-aware server selection
4. **Tool approval mode** - Require user confirmation
5. **Tool execution caching** - Cache tool results
6. **Tool composition** - Chain tool calls

---

## 📝 Code Quality

### Test Coverage
- Parsers: 100% (all scenarios covered)
- Coordinator: 100% (multi-turn, errors, limits)
- Providers: TBD (after integration)
- Overall: ~75% (will increase with provider integration)

### Type Safety
- All core types exported
- Generic interfaces for extensibility
- Minimal `any` usage (only in mocks)

### Performance
- Streaming maintained (no buffering)
- Lazy parser instantiation
- Efficient tool mapping

---

## 🚀 Deployment Plan

### Rollout Strategy
1. **Alpha**: Feature flag, test with team
2. **Beta**: Opt-in for power users
3. **GA**: Default enabled, docs published

### Monitoring
- Tool execution success rate
- Average tool execution time
- User feedback on tool calling UX
- Error rates

### Rollback Plan
- Feature flag to disable
- Backward compatibility ensures safety
- No breaking changes

---

## 📚 Resources

### Documentation
- [MCP Specification](https://modelcontextprotocol.io/)
- [OpenAI Tool Calling](https://platform.openai.com/docs/guides/function-calling)
- [Claude Tool Use](https://docs.anthropic.com/claude/docs/tool-use)
- [Ollama Tool Calling](https://github.com/ollama/ollama/blob/main/docs/api.md#tool-calling)

### Related PRs
- TBD (this is first implementation)

---

## 🎯 Current Task

**Next Immediate Step**: Integrate coordinator into OpenAI provider
- Modify `src/providers/openAI.ts`
- Add backward compatibility check
- Test with mock MCP tools
- Verify streaming still works
- Commit when tests pass

**ETA**: ~1-2 hours for OpenAI integration + tests
