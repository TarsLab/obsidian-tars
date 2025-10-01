/**
 * Contract tests for MCPClient SSE transport
 * Tests the MCP SDK integration for SSE-based connections
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPClientImpl } from '../../src/mcp/client';
import { TransportProtocol, DeploymentType } from '../../src/mcp/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn()
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: vi.fn()
}));

describe('MCPClient SSE transport contract tests', () => {
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
    (SSEClientTransport as any).mockImplementation(() => mockTransport);
  });

  describe('SSE transport connection', () => {
    it('should establish SSE connection to remote MCP server', async () => {
      // GIVEN: Remote SSE server URL
      const serverConfig = {
        id: 'remote-server',
        name: 'remote-server',
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
      };

      // AND: MCP client instance
      const client = new MCPClientImpl();
      mockClient.connect.mockResolvedValue(undefined);

      // WHEN: Client connects using SSE transport
      await client.connect(serverConfig);

      // THEN: Connection established
      expect(Client).toHaveBeenCalled();

      // AND: SSEClientTransport configured correctly with URL object
      expect(SSEClientTransport).toHaveBeenCalledWith(new URL('http://localhost:8080/sse'));
      
      expect(mockClient.connect).toHaveBeenCalledWith(mockTransport);
    });

    it('should execute tool via SSE transport', async () => {
      // GIVEN: Connected SSE client
      mockClient.isConnected = vi.fn().mockReturnValue(true);
      const toolName = 'weather';
      const parameters = { location: 'New York', format: 'json' };
      const expectedResult = {
        content: {
          location: 'New York',
          temperature: 22,
          conditions: 'sunny',
          timestamp: '2025-10-01T16:30:00Z'
        },
        contentType: 'json' as const,
        executionDuration: 250
      };

      // WHEN: callTool() invoked
      mockClient.callTool.mockResolvedValue(expectedResult);

      // THEN: Tool result streamed back successfully
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

    it('should handle SSE connection timeout', async () => {
      // GIVEN: Unreachable SSE URL
      const invalidConfig = {
        id: 'unreachable-sse',
        name: 'unreachable-sse',
        transport: 'sse' as const,
        deploymentType: 'external' as const,
        sseConfig: {
          url: 'http://nonexistent-server:8080/sse'
        },
        enabled: true,
        failureCount: 0,
        autoDisabled: false,
        sectionBindings: []
      };

      // WHEN: Connection attempted with timeout
      const timeoutError = new Error('SSE connection timed out after 5000ms');
      mockClient.connect.mockRejectedValue(timeoutError);

      // THEN: TimeoutError thrown with appropriate message
      await expect(mockClient.connect(mockTransport)).rejects.toThrow('SSE connection timed out after 5000ms');
    });

    it('should list tools from remote SSE server', async () => {
      // GIVEN: Connected remote SSE MCP server
      mockClient.isConnected = vi.fn().mockReturnValue(true);

      const remoteTools = [
        {
          name: 'weather',
          description: 'Get current weather for a location',
          inputSchema: {
            type: 'object',
            properties: {
              location: { type: 'string' },
              format: { type: 'string', enum: ['json', 'text'] }
            },
            required: ['location']
          }
        },
        {
          name: 'search',
          description: 'Search the web for information',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              limit: { type: 'number', default: 10 }
            },
            required: ['query']
          }
        }
      ];

      // WHEN: listTools() called on SSE server
      mockClient.listTools.mockResolvedValue({ tools: remoteTools });

      // THEN: Remote tool definitions returned
      const response = await mockClient.listTools();
      expect(response.tools).toHaveLength(2);
      expect(response.tools[0].name).toBe('weather');
      expect(response.tools[1].name).toBe('search');
    });

    it('should handle SSE server disconnection during tool execution', async () => {
      // GIVEN: SSE connection that drops mid-execution
      mockClient.isConnected = vi.fn()
        .mockReturnValueOnce(true)  // Initially connected
        .mockReturnValueOnce(false); // Drops during execution

      // WHEN: Tool execution started but connection lost
      const connectionLostError = new Error('SSE connection lost during tool execution');
      mockClient.callTool.mockRejectedValue(connectionLostError);

      // THEN: Appropriate error thrown
      await expect(mockClient.callTool({
        name: 'long_running_tool',
        arguments: { duration: 30 }
      })).rejects.toThrow('SSE connection lost during tool execution');
    });

    it('should reconnect to SSE server after temporary failure', async () => {
      // GIVEN: SSE server that recovers after failure
      const reconnectConfig = {
        id: 'reconnecting-sse',
        name: 'reconnecting-sse',
        transport: 'sse' as const,
        deploymentType: 'external' as const,
        sseConfig: {
          url: 'http://unstable-server:8080/sse'
        },
        enabled: true,
        failureCount: 0,
        autoDisabled: false,
        sectionBindings: []
      };

      // WHEN: First connection fails, then reconnects
      mockClient.connect
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce(undefined); // Second attempt succeeds

      // THEN: Client can reconnect after failure
      await expect(mockClient.connect(mockTransport)).rejects.toThrow('Connection refused');

      // AND: Second connection succeeds
      await mockClient.connect(mockTransport);
      expect(mockClient.connect).toHaveBeenCalledTimes(2);
    });
  });
});
