#!/usr/bin/env ts-node
/**
 * Manual Integration Test: Ollama + MCP
 * 
 * Tests real integration with local Ollama (DeepSeek-R1) and MCP tools
 * 
 * Prerequisites:
 * - Ollama running: ollama serve
 * - DeepSeek model: ollama pull deepseek-r1
 * 
 * Run: npx ts-node scripts/test-ollama-mcp.ts
 */

import { Ollama } from 'ollama';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

// Detect Ollama host URL (WSL2-aware)
function detectOllamaUrl(): string {
  const envUrl = process.env.OLLAMA_URL;
  if (envUrl) {
    console.log(`Using OLLAMA_URL from environment: ${envUrl}`);
    return envUrl;
  }

  // Check if we're in WSL2
  const isWSL2 = (() => {
    try {
      const procVersion = readFileSync('/proc/version', 'utf-8');
      return procVersion.toLowerCase().includes('microsoft');
    } catch {
      return false;
    }
  })();

  if (isWSL2) {
    console.log('Detected WSL2 environment, finding Windows host IP...');
    
    try {
      // Use the get-host-ip.sh script
      const hostIp = execSync('bash bin/get-host-ip.sh', { encoding: 'utf-8' }).trim();
      
      if (hostIp && hostIp !== '127.0.0.1') {
        const url = `http://${hostIp}:11434`;
        console.log(`Using Windows host IP: ${url}`);
        return url;
      }
    } catch (error) {
      console.warn('Failed to detect Windows host IP, falling back to localhost');
    }
  }

  console.log('Using default localhost URL');
  return 'http://localhost:11434';
}

// Simulated MCP tool context
const toolContext = {
  tools: [
    {
      serverId: 'calculator',
      serverName: 'Calculator',
      toolName: 'add',
      description: 'Add two numbers together',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number', description: 'First number' },
          b: { type: 'number', description: 'Second number' }
        },
        required: ['a', 'b']
      }
    },
    {
      serverId: 'calculator',
      serverName: 'Calculator',
      toolName: 'multiply',
      description: 'Multiply two numbers',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number', description: 'First number' },
          b: { type: 'number', description: 'Second number' }
        },
        required: ['a', 'b']
      }
    }
  ]
};

// Format tools for system message
function formatToolsForSystem(tools: typeof toolContext.tools): string {
  const toolDescriptions = tools.map(tool => {
    const schemaStr = JSON.stringify(tool.inputSchema, null, 2);
    return `### ${tool.toolName} (${tool.serverName})
Description: ${tool.description}
Parameters: ${schemaStr}`;
  }).join('\n\n');

  return `
## Available MCP Tools

You have access to the following tools via Model Context Protocol (MCP):

${toolDescriptions}

To use a tool, respond with:
TOOL_CALL: {serverId: "server-id", toolName: "tool_name", parameters: {...}}

After the tool executes, you will receive the result.`;
}

// Execute tool (simulated)
function executeTool(serverId: string, toolName: string, params: any): any {
  if (toolName === 'add') {
    // Parse params as numbers (LLM might send strings)
    const a = typeof params.a === 'string' ? parseFloat(params.a) : params.a;
    const b = typeof params.b === 'string' ? parseFloat(params.b) : params.b;
    return { result: a + b };
  }
  if (toolName === 'multiply') {
    const a = typeof params.a === 'string' ? parseFloat(params.a) : params.a;
    const b = typeof params.b === 'string' ? parseFloat(params.b) : params.b;
    return { result: a * b };
  }
  throw new Error(`Unknown tool: ${toolName}`);
}

// Parse tool call from response
function parseToolCall(response: string): { serverId: string; toolName: string; parameters: any } | null {
  const toolCallMatch = response.match(/TOOL_CALL:\s*({[^}]+})/);
  if (!toolCallMatch) return null;
  
  try {
    return JSON.parse(toolCallMatch[1]);
  } catch {
    return null;
  }
}

async function main() {
  // Use a model that supports tool calling
  // See: https://ollama.com/search?c=tool
  const model = process.env.OLLAMA_MODEL || 'llama3.2:3b';
  
  console.log(`🚀 Testing Ollama + MCP Integration with ${model}\n`);

  const ollamaUrl = detectOllamaUrl();
  
  // Run diagnostics
  console.log('📊 Running connectivity diagnostics...\n');
  
  // Test 1: Check if we can reach Windows host
  const hostIp = ollamaUrl.match(/http:\/\/([^:]+)/)?.[1] || 'localhost';
  console.log(`Host IP: ${hostIp}`);
  
  try {
    // Test basic network connectivity to Windows
    console.log('  Testing network connectivity to Windows host...');
    const pingResult = execSync(`ping -c 1 -W 1 ${hostIp} 2>&1 || echo "FAILED"`, { encoding: 'utf-8' });
    
    if (pingResult.includes('FAILED') || pingResult.includes('100% packet loss')) {
      console.log('  ⚠️  Cannot ping Windows host - network issue or firewall');
    } else {
      console.log('  ✓ Network connectivity OK');
    }
    
    // Test if port 11434 is reachable
    console.log('  Testing port 11434 accessibility...');
    try {
      execSync(`timeout 2 bash -c "echo > /dev/tcp/${hostIp}/11434" 2>&1`, { encoding: 'utf-8' });
      console.log('  ✓ Port 11434 is reachable');
    } catch {
      console.log('  ⚠️  Port 11434 is NOT reachable - firewall or Ollama not listening on 0.0.0.0');
      
      // Provide helpful diagnostic via PowerShell
      console.log('\n  Checking Ollama configuration on Windows...');
      try {
        const ollamaCheck = execSync(
          `powershell.exe -Command "Get-NetTCPConnection -LocalPort 11434 -ErrorAction SilentlyContinue | Select-Object LocalAddress, State"`,
          { encoding: 'utf-8' }
        );
        console.log('  Ollama listening on:');
        console.log(ollamaCheck || '    (No listeners found on port 11434)');
        
        if (ollamaCheck.includes('127.0.0.1')) {
          console.log('\n  ❌ PROBLEM FOUND: Ollama is listening on 127.0.0.1 (localhost only)');
          console.log('  📝 SOLUTION: Set OLLAMA_HOST=0.0.0.0:11434 on Windows');
          console.log('     1. Close Ollama');
          console.log('     2. In PowerShell: $env:OLLAMA_HOST="0.0.0.0:11434"');
          console.log('     3. Start Ollama: ollama serve');
          console.log('     OR set in Windows environment variables permanently\n');
        }
      } catch (error) {
        console.log('  Could not check Ollama configuration');
      }
    }
  } catch (error) {
    console.log(`  Diagnostic error: ${error}`);
  }
  
  console.log('\n' + '='.repeat(60) + '\n');

  const ollama = new Ollama({ host: ollamaUrl });

  // Test 1: Simple connection
  console.log('✓ Test 1: Connecting to Ollama...');
  const simpleResponse = await ollama.chat({
    model,
    messages: [{ role: 'user', content: 'Say "Hello from DeepSeek-R1" and nothing else.' }],
    stream: false
  });
  console.log(`  Response: ${simpleResponse.message.content}\n`);

  // Test 2: Register tools with Ollama (native tool calling)
  console.log('✓ Test 2: Registering MCP tools with Ollama...');
  
  // Convert MCP tools to Ollama format
  const ollamaTools = toolContext.tools.map(tool => ({
    type: "function" as const,
    function: {
      name: tool.toolName,
      description: tool.description,
      parameters: tool.inputSchema
    }
  }));
  
  console.log(`  Registered ${ollamaTools.length} tools: ${ollamaTools.map(t => t.function.name).join(', ')}\n`);

  // Test 3: Ask LLM to use a tool (with native tool calling)
  console.log('✓ Test 3: Asking LLM to perform calculation with tool calling...');
  const calculationResponse = await ollama.chat({
    model,
    messages: [
      { 
        role: 'user', 
        content: 'What is 15 + 27? Use the add tool to calculate it.' 
      }
    ],
    tools: ollamaTools,
    stream: false
  });
  
  console.log(`  LLM Response: ${calculationResponse.message.content || '(tool call)'}`);
  
  // Check for tool calls in the response
  if (calculationResponse.message.tool_calls && calculationResponse.message.tool_calls.length > 0) {
    const toolCall = calculationResponse.message.tool_calls[0];
    console.log(`  ✓ Tool call detected: ${toolCall.function.name}(${JSON.stringify(toolCall.function.arguments)})`);
    
    const result = executeTool('calculator', toolCall.function.name, toolCall.function.arguments);
    console.log(`  ✓ Tool executed: ${JSON.stringify(result)}\n`);
    
    // Send result back to LLM
    console.log('✓ Test 4: Sending tool result back to LLM...');
    const finalResponse = await ollama.chat({
      model,
      messages: [
        { role: 'user', content: 'What is 15 + 27? Use the add tool to calculate it.' },
        { role: 'assistant', content: calculationResponse.message.content || '', tool_calls: calculationResponse.message.tool_calls },
        { role: 'tool', content: JSON.stringify(result), tool_name: toolCall.function.name }
      ],
      tools: ollamaTools,
      stream: false
    });
    
    console.log(`  ✓ Final answer: ${finalResponse.message.content}\n`);
  } else {
    console.log(`  ⚠️  No tool call detected - model may not support tool calling\n`);
    console.log(`  Try using a model with tool support: https://ollama.com/search?c=tool\n`);
  }

  console.log('✅ All tests complete!');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}
