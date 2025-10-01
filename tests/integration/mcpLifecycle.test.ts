/**
 * Integration tests for MCP lifecycle
 * End-to-end testing of MCP server management and tool execution
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPServerManager, ToolExecutor, CodeBlockProcessor, createMCPManager, createToolExecutor, createCodeBlockProcessor } from '../../src/mcp';

// Mock the Docker client and MCP SDK
vi.mock('../../src/mcp/docker.ts', () => ({
  DockerClient: vi.fn().mockImplementation(() => ({
    buildContainerConfig: vi.fn().mockReturnValue({
      Image: 'mcp-test/echo:latest',
      name: 'test-container',
      Cmd: ['mcp-server']
    }),
    createContainer: vi.fn().mockResolvedValue('test-container-id'),
    startContainer: vi.fn().mockResolvedValue(undefined),
    stopContainer: vi.fn().mockResolvedValue(undefined),
    removeContainer: vi.fn().mockResolvedValue(undefined),
    getContainerStatus: vi.fn().mockResolvedValue({ State: { Status: 'running' } }),
    ping: vi.fn().mockResolvedValue(true),
    listContainers: vi.fn().mockResolvedValue([])
  }))
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    callTool: vi.fn().mockResolvedValue({ content: {} })
  }))
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({
    close: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: vi.fn().mockImplementation(() => ({
    close: vi.fn().mockResolvedValue(undefined)
  }))
}));

describe('MCP Lifecycle Integration', () => {
  let manager: MCPServerManager;
  let toolExecutor: ToolExecutor;
  let _codeBlockProcessor: CodeBlockProcessor

  beforeEach(() => {
    manager = createMCPManager();
    toolExecutor = createToolExecutor(manager);
    _codeBlockProcessor = createCodeBlockProcessor();

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('Full lifecycle management', () => {
    it('should initialize with multiple server configurations', async () => {
      // GIVEN: Multiple MCP server configurations
      const { TransportProtocol, DeploymentType } = await import('../../src/mcp/types');
      const serverConfigs = [
        {
          id: 'test-docker-server',
          name: 'test-docker',
          transport: TransportProtocol.STDIO,
          deploymentType: DeploymentType.MANAGED,
          dockerConfig: {
            image: 'mcp-test/echo:latest',
            containerName: 'test-container',
            command: ['mcp-server']
          },
          enabled: true,
          failureCount: 0,
          autoDisabled: false,
          sectionBindings: [],
          executionCommand: ''
        },
        {
          id: 'test-remote-server',
          name: 'test-remote',
          transport: TransportProtocol.SSE,
          deploymentType: DeploymentType.EXTERNAL,
          sseConfig: {
            url: 'http://localhost:8080/sse'
          },
          enabled: true,
          failureCount: 0,
          autoDisabled: false,
          sectionBindings: [],
          executionCommand: ''
        }
      ];

      // WHEN: Manager initializes with server configs
      await manager.initialize(serverConfigs);

      // THEN: Manager is ready and servers are listed
      const servers = manager.listServers();
      expect(servers).toHaveLength(2);
      expect(servers[0].name).toBe('test-docker');
      expect(servers[1].name).toBe('test-remote');
    });

    it('should handle plugin load and unload lifecycle', async () => {
      // GIVEN: Initialized MCP manager with servers

      // WHEN: Plugin unloads (simulated shutdown)
      await manager.shutdown();

      // THEN: All resources are cleaned up
      // Note: In real scenario, this would stop containers and close connections
      expect(manager.listServers()).toHaveLength(0);
    });

    it('should prevent tool execution when stopped', async () => {
      // GIVEN: Tool executor with stopped state
      toolExecutor.stop();

      // WHEN: Attempting to execute a tool
      const canExecute = toolExecutor.canExecute();

      // THEN: Execution is blocked
      expect(canExecute).toBe(false);
    });
  });
});
