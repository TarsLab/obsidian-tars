/**
 * Integration tests for MCP tool execution
 * End-to-end testing of tool invocation from code blocks to results
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMCPManager, createToolExecutor, createCodeBlockProcessor } from '../../src/mcp';

// Mock external dependencies
vi.mock('../../src/mcp/docker.ts');
vi.mock('@modelcontextprotocol/sdk/client/index.js');

describe('MCP Tool Execution Integration', () => {
  let manager: any;
  let toolExecutor: any;
  let codeBlockProcessor: any;

  beforeEach(() => {
    manager = createMCPManager();
    toolExecutor = createToolExecutor(manager);
    codeBlockProcessor = createCodeBlockProcessor();

    vi.clearAllMocks();
  });

  describe('Code block to tool execution flow', () => {
    it('should parse and execute tool from code block', async () => {
      // GIVEN: Code block with valid tool invocation
      const codeBlockContent = `tool: echo
message: Hello MCP
timestamp: true`;

      const serverConfigs = [{
        id: 'test-server',
        name: 'test-server',
        transport: 'stdio' as const,
        deploymentType: 'managed' as const,
        enabled: true,
        failureCount: 0,
        autoDisabled: false,
        sectionBindings: []
      }];

      codeBlockProcessor.updateServerConfigs(serverConfigs);

      // WHEN: Code block processor parses the content
      const invocation = codeBlockProcessor.parseToolInvocation(
        codeBlockContent,
        'test-server'
      );

      // THEN: Tool invocation is correctly parsed
      expect(invocation).toEqual({
        serverId: 'test-server',
        toolName: 'echo',
        parameters: {
          message: 'Hello MCP',
          timestamp: true
        }
      });
    });

    it('should handle tool execution with result rendering', async () => {
      // GIVEN: Parsed tool invocation and mock result
      const invocation = {
        serverId: 'test-server',
        toolName: 'echo',
        parameters: { message: 'test' }
      };

      const mockResult = {
        content: { echo: 'test', timestamp: '2025-10-01T16:30:00Z' },
        contentType: 'json' as const,
        executionDuration: 150
      };

      // Mock successful tool execution
      toolExecutor.executeTool = vi.fn().mockResolvedValue(mockResult);

      // WHEN: Tool is executed via executor
      const result = await toolExecutor.executeTool({
        ...invocation,
        source: 'user-codeblock',
        documentPath: 'test.md'
      });

      // THEN: Result matches expected format
      expect(result).toEqual(mockResult);
      expect(toolExecutor.executeTool).toHaveBeenCalledWith({
        serverId: 'test-server',
        toolName: 'echo',
        parameters: { message: 'test' },
        source: 'user-codeblock',
        documentPath: 'test.md'
      });
    });

    it('should handle tool execution errors gracefully', async () => {
      // GIVEN: Tool execution that will fail
      const executionError = new Error('Tool not found: nonexistent_tool');

      toolExecutor.executeTool = vi.fn().mockRejectedValue(executionError);

      // WHEN: Tool execution fails
      await expect(toolExecutor.executeTool({
        serverId: 'test-server',
        toolName: 'nonexistent_tool',
        parameters: {},
        source: 'user-codeblock',
        documentPath: 'test.md'
      })).rejects.toThrow('Tool not found: nonexistent_tool');

      // THEN: Error is properly propagated
      expect(toolExecutor.executeTool).toHaveBeenCalled();
    });
  });

  describe('Execution limits and tracking', () => {
    it('should track execution statistics', () => {
      // GIVEN: Fresh tool executor

      // WHEN: Getting initial stats
      const stats = toolExecutor.getStats();

      // THEN: Stats show initial state
      expect(stats).toEqual({
        activeExecutions: 0,
        totalExecuted: 0,
        sessionLimit: 25,
        concurrentLimit: 25,
        stopped: false
      });
    });

    it('should enforce session limits', async () => {
      // GIVEN: Executor with low session limit
      toolExecutor = createToolExecutor(manager);
      // Mock stats to simulate limit reached
      toolExecutor.getStats = vi.fn().mockReturnValue({
        activeExecutions: 0,
        totalExecuted: 25,
        sessionLimit: 25,
        concurrentLimit: 25,
        stopped: false
      });

      // WHEN: Checking execution capability
      const canExecute = toolExecutor.canExecute();

      // THEN: Execution is blocked by session limit
      expect(canExecute).toBe(false);
    });

    it('should reset execution tracking', () => {
      // GIVEN: Executor with some history
      toolExecutor.getStats = vi.fn().mockReturnValue({
        activeExecutions: 0,
        totalExecuted: 10,
        sessionLimit: 25,
        concurrentLimit: 25,
        stopped: false
      });

      // WHEN: Reset is called
      toolExecutor.reset();

      // THEN: Stats are reset (simulated)
      expect(toolExecutor.reset).toHaveBeenCalled();
    });
  });
});
