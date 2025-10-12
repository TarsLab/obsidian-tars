# MCP Full Integration Analysis - Obsidian Tars

**Date**: 2025-10-02
**Status**: Partial Implementation - Critical Gaps Identified

---

## Executive Summary

The Tars Obsidian plugin has **foundational MCP support** but lacks the **critical tool calling loop** needed for autonomous LLM tool execution. While tools can be manually executed via code blocks and are injected into some provider requests, **no provider properly handles LLM tool responses**, executes the requested tools, and continues the conversation.

---

## Current Architecture

### Major Features Implemented ✅

#### 1. **MCP Server Management** ([main.ts:40-102](../src/main.ts#L40))
- **MCPServerManager**: Manages MCP server lifecycle using `mcp-use` library
- **ToolExecutor**: Coordinates tool execution with tracking and limits
- **CodeBlockProcessor**: Renders tool invocations from markdown code blocks
- **Configuration**: User can register multiple MCP servers via settings
- **Health Monitoring**: Tracks server connection status and tool availability

**Files Involved**:
- [src/mcp/managerMCPUse.ts](../src/mcp/managerMCPUse.ts) - Server manager using mcp-use
- [src/mcp/executor.ts](../src/mcp/executor.ts) - Tool execution coordinator
- [src/mcp/codeBlockProcessor.ts](../src/mcp/codeBlockProcessor.ts) - Code block rendering
- [src/mcp/types.ts](../src/mcp/types.ts) - Type definitions

#### 2. **Manual Tool Execution via Code Blocks** ([main.ts:54-91](../src/main.ts#L54))
- Users write markdown code blocks with server name as language
- Syntax: ` ```Server Name\ntool: tool_name\nparameters... ```
- Plugin parses, executes, and renders results inline
- **Works perfectly** for manual tool invocation

**Example**:
````markdown
```Memory Server
tool: create_entities
entities:
  - name: "project"
    entityType: "project"
```
````

#### 3. **Tool Injection into Provider Requests** ([src/mcp/providerToolIntegration.ts](../src/mcp/providerToolIntegration.ts))
- **buildClaudeTools()**: Converts MCP tools to Claude format
- **buildOpenAITools()**: Converts MCP tools to OpenAI format
- **buildOllamaTools()**: Converts MCP tools to Ollama format
- **injectMCPTools()**: Generic injection based on provider name

**Providers with Tool Injection**:
- ✅ OpenAI ([src/providers/openAI.ts:12-23](../src/providers/openAI.ts#L12))
- ✅ Azure ([src/providers/azure.ts:17-28](../src/providers/azure.ts#L17))
- ✅ Ollama ([src/providers/ollama.ts:10-20](../src/providers/ollama.ts#L10))
- ✅ OpenRouter ([src/providers/openRouter.ts:14-25](../src/providers/openRouter.ts#L14))

**Providers WITHOUT Tool Injection**:
- ❌ Claude (has native tool support but not integrated)
- ❌ Gemini (explicitly skipped - needs format conversion)
- ❌ DeepSeek, Grok, Kimi, Qwen, SiliconFlow, Zhipu, Doubao, QianFan

#### 4. **Provider Integration Points** ([src/editor.ts:455-555](../src/editor.ts#L455))
- `generate()` function injects mcpManager and mcpExecutor into provider options
- Providers can access MCP tools if available
- Tools are passed to LLM API in provider-specific format

---

## Critical Gaps - What's Missing ❌

### 1. **No Tool Response Handling** (BLOCKER)

**Problem**: While tools are injected into requests, **no provider parses tool calls from LLM responses**.

**Current Flow**:
```
Messages → LLM API (with tools) → Stream text → Insert into document → DONE
```

**What Happens**:
- LLM receives tool definitions
- LLM responds with `tool_calls` or `function_call` objects
- **Plugin ignores these** and only streams text content
- Tool never executes, conversation stops

**Example** (OpenAI format):
```json
{
  "choices": [{
    "delta": {
      "tool_calls": [{
        "id": "call_abc123",
        "type": "function",
        "function": {
          "name": "create_entities",
          "arguments": "{\"entities\": [...]}"
        }
      }]
    }
  }]
}
```

**Current Code**: `yield text` only ([openAI.ts:42-44](../src/providers/openAI.ts#L42))
```typescript
for await (const part of stream) {
    const text = part.choices[0]?.delta?.content
    if (!text) continue  // ← SKIPS tool_calls!
    yield text
}
```

**Needed**: Parse `tool_calls`, execute via ToolExecutor, inject results back

---

### 2. **No Conversation Loop with Tool Execution** (BLOCKER)

**Problem**: After tool execution, results must be added to conversation and LLM re-invoked.

**Required Flow**:
```
1. User message → LLM
2. LLM requests tool → Detect tool_call
3. Execute tool → Get result
4. Inject result as "tool" message → Back to LLM
5. LLM generates final response → Stream to user
   (repeat 2-5 if LLM requests more tools)
```

**Missing Components**:
- Tool call detection in streaming responses
- Tool execution middleware
- Result injection as new message
- Re-invocation loop
- Multi-turn tool calling support

**Current**: Single-shot text generation only

---

### 3. **Provider-Specific Tool Formats Not Implemented**

Each provider has different tool calling conventions:

#### **Claude (Anthropic)** ([src/providers/claude.ts](../src/providers/claude.ts))
- **Has native tool support** in SDK
- Plugin has `enableWebSearch` tool but **no MCP tool integration**
- **Needed**:
  ```typescript
  // Add MCP tools to request
  const mcpTools = await buildClaudeTools(mcpManager, mcpExecutor)
  const requestParams = {
      tools: [
          ...(enableWebSearch ? [webSearchTool] : []),
          ...mcpTools  // ← Add MCP tools
      ]
  }

  // Handle tool_use blocks in response
  if (block.type === 'tool_use') {
      const result = await executeTool(block.name, block.input)
      // Add result to messages and continue
  }
  ```

#### **Gemini** ([src/providers/gemini.ts:22-27](../src/providers/gemini.ts#L22))
- **Explicitly skipped**: `console.debug('Gemini tool integration not yet implemented')`
- **Needs**: Special format conversion (uses `functionDeclarations` not `tools`)
- **Blocked**: Requires buildGeminiTools() implementation

#### **OpenAI/Compatible** (OpenAI, Azure, OpenRouter)
- Tools are injected ✅
- **Missing**: Response parsing for `tool_calls` array
- **Needed**:
  ```typescript
  if (part.choices[0]?.delta?.tool_calls) {
      // Accumulate tool call data (may span multiple chunks)
      // Execute when complete
      // Inject result and re-invoke
  }
  ```

#### **Ollama** ([src/providers/ollama.ts](../src/providers/ollama.ts))
- Tools injected ✅
- **Missing**: Parse response for tool calls
- **Format**: Similar to OpenAI but with Ollama-specific structure

#### **Other Providers** (DeepSeek, Grok, Kimi, etc.)
- **No tool injection at all**
- Most are OpenAI-compatible, need same treatment as OpenAI
- Some may need custom formats

---

### 4. **Type Safety Issues**

**Problem**: mcpManager and mcpExecutor typed as `unknown`

**Current**:
```typescript
// editor.ts
mcpManager?: unknown,
mcpExecutor?: unknown

// providers/index.ts
mcpManager?: unknown
mcpExecutor?: unknown

// Requires runtime casts
mcpManager as any, mcpExecutor as any
```

**Issues**:
- No type checking
- Runtime errors possible
- Hard to refactor
- Poor DX

**Needed**: Proper typing with conditional imports

---

### 5. **No User Feedback for Tool Execution**

**Current**: Only manual code blocks show execution status

**Missing for AI-autonomous calls**:
- "Calling tool X..." notification
- Progress indicator during execution
- Tool result summary
- Error messages for failed tools
- Tool execution history in status bar

---

## Provider Support Matrix

| Provider | Tool Injection | Response Parsing | Conversation Loop | Status |
|----------|---------------|------------------|-------------------|--------|
| **OpenAI** | ✅ | ❌ | ❌ | Partial |
| **Azure** | ✅ | ❌ | ❌ | Partial |
| **OpenRouter** | ✅ | ❌ | ❌ | Partial |
| **Ollama** | ✅ | ❌ | ❌ | Partial |
| **Claude** | ❌* | ❌ | ❌ | None |
| **Gemini** | ❌ | ❌ | ❌ | None |
| **DeepSeek** | ❌ | ❌ | ❌ | None |
| **Grok** | ❌ | ❌ | ❌ | None |
| **Kimi** | ❌ | ❌ | ❌ | None |
| **Qwen** | ❌ | ❌ | ❌ | None |
| **SiliconFlow** | ❌ | ❌ | ❌ | None |
| **Zhipu** | ❌ | ❌ | ❌ | None |
| **Doubao** | ❌ | ❌ | ❌ | None |
| **QianFan** | ❌ | ❌ | ❌ | None |

\* Claude has native tool support but MCP tools not integrated

---

## Use Case Analysis

### ✅ What Works Today

1. **Manual Tool Execution**
   ```markdown
   User writes code block → Plugin executes → Result shown
   ```
   **Files**: [main.ts:54-91](../src/main.ts#L54), [mcp/codeBlockProcessor.ts](../src/mcp/codeBlockProcessor.ts)

2. **Tool Discovery**
   ```
   User configures server → Plugin lists available tools → Shows in status bar
   ```
   **Files**: [main.ts:297-336](../src/main.ts#L297), [statusBarManager.ts](../src/statusBarManager.ts)

### ❌ What Doesn't Work (Use Case)

**Scenario**: User wants LLM to fetch data from filesystem and use it

**Current**:
```markdown
#User : What files are in my project folder?

#Claude :
```

**What Happens**:
1. User triggers Claude
2. Plugin sends message to Claude API
3. **Claude receives filesystem tool in tools array**
4. **Claude responds with tool_call to read_directory**
5. **Plugin ignores tool_call** ❌
6. **Plugin streams empty text** ❌
7. User gets no answer

**Expected**:
1. User triggers Claude
2. Plugin sends message with tools
3. Claude requests `read_directory` tool
4. **Plugin detects tool_call**
5. **Plugin executes via ToolExecutor**
6. **Plugin injects result back to Claude**
7. **Claude generates answer using directory listing**
8. User gets complete answer ✅

**Blocked By**: Missing tool response handler + conversation loop

---

## Architecture Requirements

### High-Level Solution

```typescript
// Generic tool calling loop (provider-agnostic)
async function* generateWithTools(
    messages: Message[],
    provider: Provider,
    mcpExecutor: ToolExecutor
): AsyncGenerator<string> {
    let conversation = [...messages]
    let maxTurns = 10  // Prevent infinite loops

    for (let turn = 0; turn < maxTurns; turn++) {
        const response = await provider.sendRequest(conversation)

        // Stream text AND accumulate tool calls
        let toolCalls: ToolCall[] = []
        for await (const chunk of response) {
            if (chunk.type === 'text') {
                yield chunk.content
            } else if (chunk.type === 'tool_call') {
                toolCalls.push(chunk)
            }
        }

        // No tools requested? Done!
        if (toolCalls.length === 0) {
            break
        }

        // Execute tools
        for (const call of toolCalls) {
            const result = await mcpExecutor.executeTool({
                serverId: findServerId(call.name),
                toolName: call.name,
                parameters: call.parameters,
                source: 'ai-autonomous',
                documentPath: getCurrentDocPath()
            })

            // Add tool result to conversation
            conversation.push({
                role: 'tool',
                tool_call_id: call.id,
                content: formatToolResult(result)
            })
        }

        // Continue loop - LLM will see tool results and generate final answer
    }
}
```

### Per-Provider Implementation

Each provider needs:

1. **Tool Call Parser**
   ```typescript
   interface ToolCallParser {
       parseStream(chunk: ProviderChunk): ToolCall | TextChunk
   }
   ```

2. **Result Formatter**
   ```typescript
   interface ToolResultFormatter {
       formatResult(result: ToolExecutionResult): Message
   }
   ```

3. **Request Builder**
   ```typescript
   interface RequestBuilder {
       addToolResult(message: Message): void
       rebuild(): ProviderRequest
   }
   ```

---

## Implementation Roadmap

### Phase 1: Core Infrastructure (Week 1)

**Goal**: Generic tool calling loop that works with one provider (OpenAI)

1. **Create tool calling coordinator** ([src/mcp/toolCallingCoordinator.ts](../src/mcp/toolCallingCoordinator.ts))
   - Generic loop logic
   - Provider adapter interface
   - Tool execution orchestration

2. **Implement OpenAI adapter** ([src/mcp/adapters/openai.ts](../src/mcp/adapters/openai.ts))
   - Parse `tool_calls` from stream
   - Format tool results as messages
   - Handle multi-turn conversations

3. **Update editor.ts** ([src/editor.ts](../src/editor.ts))
   - Replace direct streaming with tool-aware loop
   - Add tool execution feedback
   - Handle errors gracefully

4. **Test with OpenAI + MCP filesystem server**
   - Verify tool detection
   - Verify execution
   - Verify result injection
   - Verify final response generation

### Phase 2: Provider Coverage (Week 2-3)

5. **Claude Adapter** ([src/mcp/adapters/claude.ts](../src/mcp/adapters/claude.ts))
   - Use native tool_use blocks
   - Integrate with existing web_search logic
   - Handle Claude-specific message format

6. **Ollama Adapter** ([src/mcp/adapters/ollama.ts](../src/mcp/adapters/ollama.ts))
   - Similar to OpenAI but with Ollama format

7. **Azure/OpenRouter Adapters**
   - Reuse OpenAI adapter (compatible formats)

8. **Gemini Adapter** ([src/mcp/adapters/gemini.ts](../src/mcp/adapters/gemini.ts))
   - Implement `buildGeminiTools()` with functionDeclarations
   - Parse functionCall responses
   - Format tool results in Gemini format

9. **Remaining Providers**
   - DeepSeek, Grok, Kimi, etc.
   - Most are OpenAI-compatible

### Phase 3: Polish & Features (Week 4)

10. **Type Safety**
    - Remove `unknown` types
    - Proper imports with conditional loading
    - Full TypeScript coverage

11. **UI Enhancements**
    - Tool execution notifications
    - Progress indicators
    - Tool approval modal (optional setting)
    - Execution history viewer

12. **Error Handling**
    - Tool timeout handling
    - Retry logic
    - Graceful degradation (continue without tool if fails)
    - User-friendly error messages

13. **Testing**
    - Integration tests with real MCP servers
    - Unit tests for each adapter
    - E2E tests for full conversation flow

14. **Documentation**
    - Update MCP guides with AI tool calling examples
    - Provider-specific tool calling docs
    - Troubleshooting guide

---

## Key Files to Modify

### Core Logic
- **[src/editor.ts](../src/editor.ts)** - Main generation loop (lines 455-555)
- **[src/mcp/toolCallingCoordinator.ts](../src/mcp/toolCallingCoordinator.ts)** - NEW: Tool calling orchestration

### Provider Integrations
- **[src/providers/openAI.ts](../src/providers/openAI.ts)** - Add tool call parsing
- **[src/providers/claude.ts](../src/providers/claude.ts)** - Integrate MCP tools with native tool support
- **[src/providers/ollama.ts](../src/providers/ollama.ts)** - Add tool call parsing
- **[src/providers/gemini.ts](../src/providers/gemini.ts)** - Implement Gemini format
- **[src/providers/azure.ts](../src/providers/azure.ts)** - Add tool call parsing
- **[src/providers/openRouter.ts](../src/providers/openRouter.ts)** - Add tool call parsing
- **All other providers** - Add tool injection and parsing

### MCP Infrastructure (already solid ✅)
- **[src/mcp/managerMCPUse.ts](../src/mcp/managerMCPUse.ts)** - Working
- **[src/mcp/executor.ts](../src/mcp/executor.ts)** - Working
- **[src/mcp/providerToolIntegration.ts](../src/mcp/providerToolIntegration.ts)** - Extend for more providers

### Types
- **[src/providers/index.ts](../src/providers/index.ts)** - Fix mcpManager/mcpExecutor types
- **[src/mcp/types.ts](../src/mcp/types.ts)** - Add tool calling types

---

## Success Criteria

### Minimum Viable Product (MVP)
✅ User can ask LLM to use MCP tools
✅ LLM autonomously calls tools
✅ Results are injected back into conversation
✅ LLM generates complete answer using tool results
✅ Works with at least OpenAI, Claude, Ollama

### Full Implementation
✅ All providers with "Tool Calling" capability support MCP tools
✅ Multi-turn tool calling works
✅ Proper error handling
✅ User feedback and progress indicators
✅ Type-safe implementation
✅ Comprehensive tests
✅ Updated documentation

---

## Example: End-to-End Tool Calling Flow

### Scenario: User asks about files in vault

**User Note**:
```markdown
#System : You have access to filesystem tools via MCP. Use them to help answer questions.

#User : What markdown files are in my vault?

#Claude :
```

**Step-by-Step**:

1. **User triggers Claude**
   - Plugin calls `generate()` in editor.ts
   - mcpManager and mcpExecutor injected into provider

2. **Build Request with Tools**
   ```typescript
   // In claude.ts sendRequestFunc
   const mcpTools = await buildClaudeTools(mcpManager, mcpExecutor)
   const request = {
       model: 'claude-sonnet-4-0',
       messages: [
           { role: 'system', content: 'You have access to...' },
           { role: 'user', content: 'What markdown files...' }
       ],
       tools: mcpTools  // ← MCP tools included
   }
   ```

3. **LLM Responds with Tool Call**
   ```json
   {
       "type": "tool_use",
       "id": "toolu_123",
       "name": "list_files",
       "input": { "pattern": "**/*.md" }
   }
   ```

4. **Plugin Detects Tool Call**
   ```typescript
   if (block.type === 'tool_use') {
       yield { type: 'tool_call', data: block }  // ← Signal to coordinator
   }
   ```

5. **Coordinator Executes Tool**
   ```typescript
   const result = await mcpExecutor.executeTool({
       serverId: 'filesystem-server',
       toolName: 'list_files',
       parameters: { pattern: '**/*.md' },
       source: 'ai-autonomous',
       documentPath: currentDoc
   })
   // result.content = ['note1.md', 'note2.md', ...]
   ```

6. **Inject Result Back**
   ```typescript
   messages.push({
       role: 'user',
       content: [{
           type: 'tool_result',
           tool_use_id: 'toolu_123',
           content: JSON.stringify(result.content)
       }]
   })
   ```

7. **LLM Generates Final Answer**
   ```
   Claude receives tool result and generates:
   "I found the following markdown files in your vault:
   - note1.md
   - note2.md
   ..."
   ```

8. **Stream to User**
   ```typescript
   for await (const chunk of response) {
       if (chunk.type === 'text') {
           yield chunk.text  // ← User sees final answer
       }
   }
   ```

**User Sees**:
```markdown
#Claude : I found the following markdown files in your vault:
- note1.md
- note2.md
...
```

✨ **Success!** LLM autonomously used MCP tool to answer question.

---

## Conclusion

The Tars plugin has **excellent MCP infrastructure** but is **missing the critical link** between LLM responses and tool execution. With the implementation of:

1. **Tool response parsers** for each provider
2. **Generic conversation loop** with tool execution
3. **Result injection** back into conversation

...the plugin will achieve **full MCP integration** and enable the use case of LLMs autonomously using tools to access filesystems, databases, web pages, and other external resources via MCP servers.

**Estimated Effort**: 3-4 weeks for full implementation across all providers
**Priority**: High - This is the core value proposition of MCP integration
**Complexity**: Medium - Well-defined problem, clear architecture, good foundation

---

**Next Steps**: Begin Phase 1 implementation with OpenAI adapter