/**
 * Contract: MCP Client Interface
 * 
 * Defines the public API for interacting with MCP servers.
 * Implementations must support both stdio and SSE transports.
 */

export interface MCPClient {
  /**
   * Connect to an MCP server using specified transport.
   * 
   * @param config - Server configuration including transport details
   * @returns Promise resolving when connection established
   * @throws ConnectionError if connection fails
   */
  connect(config: MCPServerConfig): Promise<void>;

  /**
   * Disconnect from the MCP server.
   * Cleans up transport resources.
   */
  disconnect(): Promise<void>;

  /**
   * List all tools available on the connected server.
   * 
   * @returns Promise resolving to array of tool definitions
   * @throws NotConnectedError if not connected
   */
  listTools(): Promise<ToolDefinition[]>;

  /**
   * Execute a tool on the MCP server.
   * 
   * @param toolName - Name of the tool to execute
   * @param parameters - Tool input parameters (must match schema)
   * @param timeout - Optional timeout in milliseconds (default: global setting)
   * @returns Promise resolving to tool execution result
   * @throws ToolNotFoundError if tool doesn't exist
   * @throws ValidationError if parameters don't match schema
   * @throws TimeoutError if execution exceeds timeout
   */
  callTool(
    toolName: string,
    parameters: Record<string, unknown>,
    timeout?: number
  ): Promise<ToolExecutionResult>;

  /**
   * Check if client is currently connected to server.
   */
  isConnected(): boolean;

  /**
   * Get server capabilities reported during handshake.
   */
  getCapabilities(): ServerCapabilities;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;  // JSON Schema for parameter validation
}

export interface ServerCapabilities {
  tools: boolean;      // Server supports tool execution
  prompts?: boolean;   // Server supports prompt templates (optional MCP feature)
  resources?: boolean; // Server supports resource access (optional MCP feature)
}

export type JSONSchema = Record<string, unknown>; // JSON Schema v7
