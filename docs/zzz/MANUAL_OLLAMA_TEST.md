# Manual Ollama + MCP Integration Test

This guide shows how to test the complete integration between:
- **Local Ollama** (DeepSeek-R1 model)
- **MCP Tools** (simulated calculator)
- **Provider Integration** (tool context formatting)

## Prerequisites

### 1. Install and Run Ollama

```bash
# Install Ollama (if not already installed)
# Visit: https://ollama.com/download

# Start Ollama server
ollama serve
```

### 2. Pull DeepSeek-R1 Model

```bash
# Pull the model (one-time setup)
ollama pull deepseek-r1

# Verify it's available
ollama list
```

Expected output:
```
NAME                 ID              SIZE      MODIFIED
deepseek-r1:latest   0a8c26691023    4.7 GB    8 months ago
```

## Running the Test

### Prerequisites for WSL2 Users

If you're running Ollama on Windows and testing from WSL2, you need to configure Ollama to listen on all interfaces:

**On Windows** (in PowerShell as Administrator):
```powershell
# Set Ollama to listen on all interfaces
$env:OLLAMA_HOST="0.0.0.0:11434"

# Restart Ollama service or app
# If using the Ollama app, restart it
# If using the service:
Stop-Service Ollama
Start-Service Ollama
```

Or set permanently in Windows environment variables:
1. Open "Edit environment variables for your account"
2. Add new variable: `OLLAMA_HOST` = `0.0.0.0:11434`
3. Restart Ollama

**Verify it's working:**
```bash
# From WSL2, find Windows host IP
bash bin/get-host-ip.sh

# Test connectivity (replace with your IP)
curl http://192.168.1.xxx:11434/api/tags
```

### Option 1: Run the Manual Test Script

```bash
# From project root
npx tsx scripts/test-ollama-mcp.ts
```

**Expected Output:**
```
🚀 Testing Ollama + MCP Integration with DeepSeek-R1

✓ Test 1: Connecting to Ollama...
  Response: Hello from DeepSeek-R1

✓ Test 2: Providing MCP tool context...
  Response: I have access to two calculator tools: add and multiply...

✓ Test 3: Asking LLM to perform calculation...
  LLM Response: TOOL_CALL: {serverId: "calculator", toolName: "add", parameters: {a: 15, b: 27}}
  ✓ Tool call parsed: add({"a":15,"b":27})
  ✓ Tool result: {"result":42}
  ✓ Final answer: The sum of 15 and 27 is 42.

✅ All tests complete!
```

### Option 2: Interactive Test

You can also test interactively using the Ollama CLI:

```bash
# Start interactive session with system message
ollama run deepseek-r1:latest
```

Then paste this prompt:
```
You have access to MCP tools:
- add(a, b): Add two numbers
- multiply(a, b): Multiply two numbers

To use a tool, format: TOOL_CALL: {serverId: "calculator", toolName: "add", parameters: {a: 5, b: 3}}

Calculate 8 * 7 using the multiply tool.
```

## What This Tests

### 1. **Ollama Connection** ✓
- Verifies Ollama server is running
- Tests basic chat functionality
- Confirms DeepSeek-R1 model works

### 2. **Tool Context Provision** ✓
- Formats MCP tools for LLM consumption
- Provides tool descriptions and schemas
- Tests system message integration

### 3. **Tool Invocation** ✓
- LLM recognizes available tools
- LLM formats tool calls correctly
- Tool execution works
- Results are returned to LLM

### 4. **Complete Loop** ✓
- User question → LLM reasoning → Tool call → Tool execution → Final answer
- Tests the full agentic workflow

## Integration with Obsidian Tars

In the actual plugin, this flow works as:

```
User in Obsidian
    ↓
  Writes code block or chat message
    ↓
  Provider (Ollama/Claude/etc) receives:
    - User message
    - Available MCP tools (via buildAIToolContext)
    ↓
  LLM decides to use a tool
    ↓
  parseToolCallFromResponse extracts tool call
    ↓
  ToolExecutor.executeTool() runs the tool
    ↓
  formatToolResultForAI formats result
    ↓
  Result sent back to LLM
    ↓
  LLM provides final answer to user
```

## Troubleshooting

### Ollama Not Running
```
Error: connect ECONNREFUSED 127.0.0.1:11434
```
**Solution**: Start Ollama with `ollama serve`

### Model Not Found
```
Error: model 'deepseek-r1:latest' not found
```
**Solution**: Pull the model with `ollama pull deepseek-r1`

### Tool Calls Not Parsed
If the LLM doesn't format tool calls correctly:
- Try lowering temperature (0.1 or 0)
- Be more explicit in the prompt
- Check the system message is set correctly

### Different Model

You can test with other models:
```bash
# Use llama3.2 instead
ollama pull llama3.2:3b

# Modify the script:
const model = 'llama3.2:3b';
```

## Next Steps

After validating this works:

1. **Test with Real MCP Servers**
   - Replace simulated tools with actual MCP servers
   - Test with mcp/memory, mcp/filesystem, etc.

2. **Test in Obsidian**
   - Use the plugin UI to configure MCP servers
   - Write code blocks with tool invocations
   - Test AI chat with tool access

3. **Add More Providers**
   - Test with Claude
   - Test with OpenAI
   - Compare tool usage across models

## Example Use Cases

### Calculator Tools
```markdown
```ollama
Calculate the compound interest on $10,000 at 5% annual rate for 3 years.
Use the multiply and add tools as needed.
```
```

### Weather + Calculations
```markdown
```ollama
Get the weather for Tokyo and convert the temperature from Celsius to Fahrenheit.
Use get_weather and multiply tools.
```
```

### Multi-Step Reasoning
```markdown
```ollama
I have 5 apples and buy 3 more. Then I give away 2. How many do I have?
Use the add tool for each step.
```
```

## Performance Notes

**DeepSeek-R1** (4.7GB):
- Reasoning: Excellent (shows chain-of-thought)
- Tool usage: Good (understands tool schemas)
- Speed: ~2-5 tokens/sec on CPU
- Memory: ~6GB RAM

**For faster testing**, use smaller models:
- `llama3.2:3b` (2GB) - Fast, decent tool usage
- `phi3:mini` (2.3GB) - Very fast, basic tool usage

## Documentation

- [Ollama Docs](https://github.com/ollama/ollama)
- [DeepSeek-R1 Model Card](https://ollama.com/library/deepseek-r1)
- [MCP Specification](https://github.com/modelcontextprotocol/specification)
