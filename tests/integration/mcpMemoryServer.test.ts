/**
 * Integration Tests for MCP Component Integration
 * 
 * Tests the integration between Manager, Executor, and CodeBlockProcessor
 * with mocked mcp-use library.
 * 
 * For full E2E testing with real MCP servers, see the manual testing guide.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { MCPServerManager, ToolExecutor, CodeBlockProcessor, createMCPManager, createToolExecutor, createCodeBlockProcessor } from '../../src/mcp';

// Mock mcp-use library
vi.mock('mcp-use', () => {
  // Define tools inside the factory to avoid hoisting issues
  const tools = [
    {
      name: 'store_memory',
      description: 'Store a key-value pair',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          value: { type: 'string' }
        }
      }
    },
    {
      name: 'retrieve_memory',
      description: 'Retrieve stored value',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string' }
        }
      }
    }
  ];

  const mockSession = {
    isConnected: true,
    connector: {
      tools,
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }]
      })
    },
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue(undefined)
  };

  return {
    MCPClient: {
      fromDict: vi.fn(() => ({
        createSession: vi.fn().mockResolvedValue(mockSession),
        createAllSessions: vi.fn().mockResolvedValue({ 'test-server': mockSession }),
        getSession: vi.fn().mockReturnValue(mockSession),
        closeSession: vi.fn().mockResolvedValue(undefined),
        closeAllSessions: vi.fn().mockResolvedValue(undefined)
      }))
    },
    MCPSession: vi.fn(() => mockSession)
  };
});

describe('Integration: MCP Components', () => {
  let manager: MCPServerManager;
  let toolExecutor: ToolExecutor;
  let codeBlockProcessor: CodeBlockProcessor;
  let serverConfig: any;

  beforeAll(async () => {
    // Configure a managed server
    serverConfig = {
      id: 'test-server',
      name: 'test-server',
      transport: 'stdio' as const,
      deploymentType: 'managed' as const,
      dockerConfig: {
        image: 'test:latest',
        containerName: 'test-container',
        command: []
      },
      enabled: true,
      failureCount: 0,
      autoDisabled: false,
      sectionBindings: [],
      executionCommand: ''
    };

    // Initialize manager ONCE for all tests
    manager = createMCPManager();
    toolExecutor = createToolExecutor(manager);
    codeBlockProcessor = createCodeBlockProcessor();
    
    // Initialize manager with test config
    await manager.initialize([serverConfig]);
  }, 30_000);

  it('SMOKE TEST: MCP component integration with tool discovery', async () => {
    // GIVEN: Manager initialized in beforeAll
    const servers = manager.listServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe('test-server');
    expect(servers[0].enabled).toBe(true);

    // WHEN: Get client
    const client = manager.getClient(serverConfig.id);
    
    // THEN: Client should be available
    expect(client).toBeDefined();

    // AND: Should be able to list tools (mocked MCP SDK response)
    const tools = await client!.listTools();
    expect(tools.length).toBeGreaterThan(0);
    
    // Validate mocked tool response
    const toolNames = tools.map(t => t.name);
    expect(toolNames).toContain('store_memory');
    expect(toolNames).toContain('retrieve_memory');

    // Validate tool schema structure
    const storeTool = tools.find(t => t.name === 'store_memory');
    expect(storeTool).toBeDefined();
    expect(storeTool!.description).toBeDefined();
    expect(storeTool!.inputSchema).toBeDefined();
  }, 10000);

  it('should discover and describe tools with proper schema', async () => {
    // GIVEN: Initialized server from beforeAll
    const client = manager.getClient(serverConfig.id);

    // WHEN: List tools
    const tools = await client!.listTools();

    // THEN: Tools are discovered with proper structure
    expect(tools.length).toBeGreaterThan(0);

    // Validate each tool has required fields
    tools.forEach(tool => {
      expect(tool.name).toBeDefined();
      expect(typeof tool.name).toBe('string');
      expect(tool.description).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema).toBe('object');
    });
  }, 30000);

  it('should parse code block and execute tool', async () => {
    // GIVEN: Initialized server from beforeAll
    codeBlockProcessor.updateServerConfigs([serverConfig]);

    // AND: Code block with tool invocation
    const codeBlockContent = `tool: store_memory
key: test-key
value: Hello from integration test`;

    // WHEN: Parse code block
    const invocation = codeBlockProcessor.parseToolInvocation(
      codeBlockContent,
      'test-server'
    );

    // THEN: Invocation parsed correctly
    expect(invocation).toBeDefined();
    expect(invocation!.serverId).toBe(serverConfig.id);
    expect(invocation!.toolName).toBe('store_memory');
    expect(invocation!.parameters.key).toBe('test-key');
    expect(invocation!.parameters.value).toBe('Hello from integration test');

    // WHEN: Execute tool via executor
    const result = await toolExecutor.executeTool({
      serverId: invocation!.serverId,
      toolName: invocation!.toolName,
      parameters: invocation!.parameters,
      source: 'user-codeblock',
      documentPath: 'test.md'
    });

    // THEN: Execution successful (mocked response)
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.executionDuration).toBeDefined();

    // Verify execution was tracked
    const stats = toolExecutor.getStats();
    expect(stats.totalExecuted).toBe(1);
    expect(stats.activeExecutions).toBe(0);
  }, 30000);

  it('should execute multiple tools sequentially', async () => {
    // GIVEN: Fresh executor to avoid cumulative stats
    const freshExecutor = createToolExecutor(manager);
    
    // WHEN: Execute store tool
    await freshExecutor.executeTool({
      serverId: serverConfig.id,
      toolName: 'store_memory',
      parameters: {
        key: 'test-key',
        value: 'Test value'
      },
      source: 'user-codeblock',
      documentPath: 'test.md'
    });

    // AND: Execute retrieve tool
    const result = await freshExecutor.executeTool({
      serverId: serverConfig.id,
      toolName: 'retrieve_memory',
      parameters: {
        key: 'test-key'
      },
      source: 'user-codeblock',
      documentPath: 'test.md'
    });

    // THEN: Both executions successful
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    
    // Verify execution stats
    const stats = freshExecutor.getStats();
    expect(stats.totalExecuted).toBe(2);
    expect(stats.activeExecutions).toBe(0);
  }, 30000);

  it('should handle execution limits correctly', async () => {
    // GIVEN: Executor with low session limit
    const limitedExecutor = new ToolExecutor(manager, {
      concurrentLimit: 25,
      sessionLimit: 2, // Only allow 2 executions
      activeExecutions: new Set(),
      totalExecuted: 0,
      stopped: false,
      executionHistory: []
    });

    // Server already initialized in beforeAll

    // WHEN: Execute 2 tools (at limit)
    await limitedExecutor.executeTool({
      serverId: serverConfig.id,
      toolName: 'store_memory',
      parameters: { key: 'key1', value: 'value1' },
      source: 'user-codeblock',
      documentPath: 'test.md'
    });

    await limitedExecutor.executeTool({
      serverId: serverConfig.id,
      toolName: 'store_memory',
      parameters: { key: 'key2', value: 'value2' },
      source: 'user-codeblock',
      documentPath: 'test.md'
    });

    // THEN: Third execution should be blocked
    expect(limitedExecutor.canExecute()).toBe(false);

    await expect(
      limitedExecutor.executeTool({
        serverId: serverConfig.id,
        toolName: 'store_memory',
        parameters: { key: 'key3', value: 'value3' },
        source: 'user-codeblock',
        documentPath: 'test.md'
      })
    ).rejects.toThrow(/session.*limit/i);
  }, 30000);

  it('should track execution history', async () => {
    // GIVEN: Fresh executor to test stats tracking
    const freshExecutor = createToolExecutor(manager);

    // WHEN: Execute multiple tools
    await freshExecutor.executeTool({
      serverId: serverConfig.id,
      toolName: 'store_memory',
      parameters: { key: 'hist-key-1', value: 'value1' },
      source: 'user-codeblock',
      documentPath: 'test.md'
    });

    await freshExecutor.executeTool({
      serverId: serverConfig.id,
      toolName: 'store_memory',
      parameters: { key: 'hist-key-2', value: 'value2' },
      source: 'user-codeblock',
      documentPath: 'test.md'
    });

    // THEN: Execution stats should be tracked
    const stats = freshExecutor.getStats();
    expect(stats.totalExecuted).toBe(2);
    expect(stats.activeExecutions).toBe(0);
  }, 30000);

  it('should handle server lifecycle (start/stop)', async () => {
    // GIVEN: Initialized server from beforeAll
    expect(manager.getClient(serverConfig.id)).toBeDefined();

    // WHEN: Stop server
    await manager.stopServer(serverConfig.id);

    // THEN: Client should no longer be available
    expect(manager.getClient(serverConfig.id)).toBeUndefined();

    // WHEN: Restart server
    await manager.startServer(serverConfig.id);

    // THEN: Client should be available again
    expect(manager.getClient(serverConfig.id)).toBeDefined();

    // AND: Should still be able to execute tools
    const result = await toolExecutor.executeTool({
      serverId: serverConfig.id,
      toolName: 'store_memory',
      parameters: { key: 'restart-key', value: 'after-restart' },
      source: 'user-codeblock',
      documentPath: 'test.md'
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
  }, 30000);
});
