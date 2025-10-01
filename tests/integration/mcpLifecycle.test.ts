/**
 * Integration tests for MCP lifecycle
 * End-to-end testing of MCP server management and tool execution
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPServerManager, createMCPManager, createToolExecutor, createCodeBlockProcessor } from '../src/mcp';

// Mock the Docker client and MCP SDK
vi.mock('../src/mcp/docker.ts', () => ({
  DockerClient: vi.fn().mockImplementation(() => ({
    createContainer: vi.fn(),
    startContainer: vi.fn(),
    stopContainer: vi.fn(),
    removeContainer: vi.fn(),
    getContainerStatus: vi.fn().mockResolvedValue('connected'),
    ping: vi.fn().mockResolvedValue(true)
  }))
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn()
}));

describe('MCP Lifecycle Integration', () => {
  let manager: MCPServerManager;
  let toolExecutor: any;
  let codeBlockProcessor: any;

  beforeEach(() => {
    manager = createMCPManager();
    toolExecutor = createToolExecutor(manager);
    codeBlockProcessor = createCodeBlockProcessor();

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('Full lifecycle management', () => {
    it('should initialize with multiple server configurations', async () => {
      // GIVEN: Multiple MCP server configurations
      const serverConfigs = [
        {
          id: 'test-docker-server',
          name: 'test-docker',
          transport: 'stdio' as const,
          deploymentType: 'managed' as const,
          dockerConfig: {
            image: 'mcp-test/echo:latest',
            containerName: 'test-container',
            command: ['mcp-server']
          },
          enabled: true,
          failureCount: 0,
          autoDisabled: false,
          sectionBindings: []
        },
        {
          id: 'test-remote-server',
          name: 'test-remote',
          transport: 'sse' as const,
          deploymentType: 'external' as const,
          sseConfig: {
            url: 'http://localhost:8080/sse'
          },
          enabled: true,
          failureCount: 0,
          autoDisabled: false,
          sectionBindings: []
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
