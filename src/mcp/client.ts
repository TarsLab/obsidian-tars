/**
 * MCP Client Implementation
 * Provides MCP protocol client with stdio and SSE transport support
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  MCPClient,
  MCPServerConfig,
  ToolDefinition,
  ServerCapabilities,
  ToolExecutionResult,
  ConnectionError,
  ToolNotFoundError,
  ValidationError,
  TimeoutError
} from './types';
import {
  ConnectionError as ConnError,
  ToolNotFoundError as TnfError,
  ValidationError as ValError,
  TimeoutError as TmoError
} from './errors';

export class MCPClientImpl implements MCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | SSEClientTransport | null = null;
  private connected = false;

  async connect(config: MCPServerConfig): Promise<void> {
    try {
      // Create client instance
      this.client = new Client({
        name: 'tars-obsidian',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      // Create appropriate transport
      if (config.transport === 'stdio') {
        if (!config.dockerConfig) {
          throw new ConnError('Stdio transport requires dockerConfig');
        }
        this.transport = new StdioClientTransport({
          command: 'docker',
          args: ['exec', '-i', config.dockerConfig.containerName, 'mcp-server']
        });
      } else if (config.transport === 'sse') {
        if (!config.sseConfig) {
          throw new ConnError('SSE transport requires sseConfig');
        }
        this.transport = new SSEClientTransport({
          url: config.sseConfig.url
        });
      } else {
        throw new ConnError(`Unsupported transport: ${config.transport}`);
      }

      // Connect to server
      await this.client.connect(this.transport);
      this.connected = true;

    } catch (error) {
      this.connected = false;
      throw new ConnError(
        `Failed to connect to MCP server '${config.name}': ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      try {
        await this.client.disconnect();
      } catch (error) {
        // Log but don't throw on disconnect
        console.warn('Error during MCP client disconnect:', error);
      }
    }
    this.client = null;
    this.transport = null;
    this.connected = false;
  }

  async listTools(): Promise<ToolDefinition[]> {
    if (!this.client || !this.connected) {
      throw new ConnError('MCP client is not connected');
    }

    try {
      const response = await this.client.listTools();
      return response.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as any // JSON Schema type
      }));
    } catch (error) {
      throw new ConnError(
        `Failed to list tools: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  async callTool(
    toolName: string,
    parameters: Record<string, unknown>,
    timeout?: number
  ): Promise<ToolExecutionResult> {
    if (!this.client || !this.connected) {
      throw new ConnError('MCP client is not connected');
    }

    const startTime = Date.now();

    try {
      // Set up timeout if specified
      let timeoutId: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        if (timeout) {
          timeoutId = setTimeout(() => {
            reject(new TmoError(timeout, `tool execution: ${toolName}`));
          }, timeout);
        }
      });

      // Execute tool with timeout race
      const executionPromise = this.client.callTool({
        name: toolName,
        arguments: parameters
      });

      const result = timeout
        ? await Promise.race([executionPromise, timeoutPromise])
        : await executionPromise;

      // Clear timeout if it was set
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const executionDuration = Date.now() - startTime;

      return {
        content: result.content,
        contentType: 'json', // MCP tools typically return structured data
        executionDuration,
        tokensUsed: undefined // MCP doesn't provide token usage
      };

    } catch (error) {
      if (error instanceof TmoError) {
        throw error;
      }

      // Check for specific MCP error types
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('tool not found') || errorMessage.includes('Tool not found')) {
        throw new TnfError(toolName, 'connected server');
      }

      if (errorMessage.includes('invalid') || errorMessage.includes('validation')) {
        throw new ValError(`Tool '${toolName}' parameter validation failed: ${errorMessage}`, error);
      }

      throw new ConnError(
        `Tool execution failed: ${errorMessage}`,
        error
      );
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getCapabilities(): ServerCapabilities {
    // MCP servers typically support tools by default
    return {
      tools: true,
      prompts: false, // Not implemented in initial version
      resources: false // Not implemented in initial version
    };
  }
}
