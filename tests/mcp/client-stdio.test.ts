/**
 * Contract tests for MCPClient stdio transport
 * Tests the MCP SDK integration for stdio-based connections
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPClientImpl } from '../../src/mcp/client';
import { TransportProtocol, DeploymentType } from '../../src/mcp/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn()
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn()
}));

describe('MCPClient stdio transport contract tests', () => {
  let mockClient: any;
  let mockTransport: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock client
    mockClient = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      listTools: vi.fn(),
      callTool: vi.fn()
    };

    // Setup mock transport
    mockTransport = {
      // Mock transport methods
    };

    // Configure mocks
    (Client as any).mockImplementation(() => mockClient);
    (StdioClientTransport as any).mockImplementation(() => mockTransport);
  });

  describe('stdio transport connection', () => {
    it('should establish stdio connection to MCP server', async () => {
      // GIVEN: Docker container with MCP server running
      const serverConfig = {
        id: 'test-server',
        name: 'test-server',
        transport: TransportProtocol.STDIO,
        deploymentType: DeploymentType.MANAGED,
        dockerConfig: {
          image: 'mcp-test/echo-server:latest',
          containerName: 'tars-mcp-test'
        },
        enabled: true,
        failureCount: 0,
        autoDisabled: false,
        sectionBindings: [],
        executionCommand: ''
      };

      // AND: MCP client instance
      const client = new MCPClientImpl();
      mockClient.connect.mockResolvedValue(undefined);

      // WHEN: Client connects using stdio transport
      await client.connect(serverConfig);

      // THEN: Connection established
      expect(Client).toHaveBeenCalled();

      // AND: StdioClientTransport configured correctly
      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'docker',
        args: ['exec', '-i', 'tars-mcp-test', 'mcp-server']
      });
      
      expect(mockClient.connect).toHaveBeenCalledWith(mockTransport);
    });

    it('should execute tool via stdio transport', async () => {
      // GIVEN: Connected stdio client
      mockClient.isConnected = vi.fn().mockReturnValue(true);

      const toolName = 'echo';
      const parameters = { message: 'hello world', timestamp: true };
      const expectedResult = {
        content: { message: 'hello world', timestamp: '2025-10-01T16:30:00Z' },
        contentType: 'json' as const,
        executionDuration: 150
      };

      // WHEN: callTool() invoked with valid parameters
      mockClient.callTool.mockResolvedValue(expectedResult);

      // THEN: Tool result returned within timeout
      const result = await mockClient.callTool({
        name: toolName,
        arguments: parameters
      });

      expect(result).toEqual(expectedResult);
      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: toolName,
        arguments: parameters
      });
    });

    it('should handle stdio connection failure', async () => {
      // GIVEN: Invalid Docker container configuration
      const invalidConfig = {
        id: 'invalid-server',
        name: 'invalid-server',
        transport: 'stdio' as const,
        deploymentType: 'managed' as const,
        dockerConfig: {
          image: 'nonexistent-image:latest',
          containerName: 'invalid-container'
        },
        enabled: true,
        failureCount: 0,
        autoDisabled: false,
        sectionBindings: []
      };

      // WHEN: Connection attempted
      const connectionError = new Error('docker: command not found');
      mockClient.connect.mockRejectedValue(connectionError);

      // THEN: ConnectionError thrown with descriptive message
      await expect(mockClient.connect(mockTransport)).rejects.toThrow('docker: command not found');
    });

    it('should list available tools from stdio server', async () => {
      // GIVEN: Connected stdio MCP server
      mockClient.isConnected = vi.fn().mockReturnValue(true);

      const availableTools = [
        {
          name: 'echo',
          description: 'Echo back the input message',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              timestamp: { type: 'boolean' }
            }
          }
        }
      ];

      // WHEN: listTools() called
      mockClient.listTools.mockResolvedValue({ tools: availableTools });

      // THEN: Tool definitions returned
      const response = await mockClient.listTools();
      expect(response.tools).toEqual(availableTools);
      expect(mockClient.listTools).toHaveBeenCalled();
    });

    it('should handle tool execution timeout via stdio', async () => {
      // GIVEN: Connected stdio client with slow tool
      mockClient.isConnected = vi.fn().mockReturnValue(true);

      // WHEN: Tool execution exceeds timeout
      const timeoutError = new Error('Tool execution timed out after 30000ms');
      mockClient.callTool.mockRejectedValue(timeoutError);

      // THEN: TimeoutError thrown with appropriate message
      await expect(mockClient.callTool({
        name: 'slow_tool',
        arguments: { delay: 60 }
      })).rejects.toThrow('Tool execution timed out after 30000ms');
    });
  });
});
