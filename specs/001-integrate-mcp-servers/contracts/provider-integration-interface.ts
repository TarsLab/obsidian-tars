/**
 * Contract: AI Provider Integration Interface
 * 
 * Extends existing AI providers to support MCP tool execution.
 * Provides hooks for injecting tool context and handling tool requests.
 */

export interface ProviderToolSupport {
  /**
   * Build tool context for AI assistant.
   * Called before sending messages to AI provider.
   * 
   * @param documentPath - Current document path
   * @param sectionLine - Current section line (for section bindings)
   * @returns Tool context with available tools
   */
  buildToolContext(documentPath: string, sectionLine?: number): AIToolContext;

  /**
   * Inject tool descriptions into provider message format.
   * Provider-specific implementation (system message, function calling, etc.)
   * 
   * @param messages - Existing message array
   * @param toolContext - Available tools
   * @returns Modified messages with tool descriptions
   */
  injectToolContext(
    messages: Message[],
    toolContext: AIToolContext
  ): Message[];

  /**
   * Parse AI response for tool execution requests.
   * Provider-specific parsing based on tool use format.
   * 
   * @param response - AI response text
   * @returns Array of tool requests, empty if none found
   */
  parseToolRequests(response: string): ToolRequest[];

  /**
   * Format tool execution result for injection back into conversation.
   * 
   * @param toolRequest - Original request
   * @param result - Execution result
   * @returns Message object to append to conversation
   */
  formatToolResult(
    toolRequest: ToolRequest,
    result: ToolExecutionResult
  ): Message;

  /**
   * Check if provider supports native tool calling API.
   * (e.g., Claude tool use, OpenAI function calling)
   */
  supportsNativeToolCalling(): boolean;
}

export interface ToolRequest {
  toolName: string;
  serverId?: string;     // Optional: AI may specify server or use default
  parameters: Record<string, unknown>;
  requestId: string;     // For correlating result
}

/**
 * Provider-specific tool use formats:
 * 
 * Claude (Anthropic native):
 *   Response: { type: 'tool_use', id: '...', name: 'tool', input: {...} }
 * 
 * OpenAI (function calling):
 *   Response: { tool_calls: [{ id: '...', function: { name: '...', arguments: '...' } }] }
 * 
 * Generic (system message):
 *   Response: "TOOL_CALL: tool_name(param1=value1, param2=value2)"
 */
