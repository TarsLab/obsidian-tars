/**
 * Contract: Code Block Processor Interface
 * 
 * Handles parsing and rendering of MCP tool invocation code blocks.
 * Integrates with Obsidian's markdown code block processor API.
 */

export interface CodeBlockProcessor {
  /**
   * Parse code block content to extract tool invocation.
   * 
   * @param source - Raw code block content
   * @param language - Code block language (server name)
   * @returns Parsed tool invocation or null if invalid
   */
  parseToolInvocation(source: string, language: string): ToolInvocation | null;

  /**
   * Render tool execution result in code block element.
   * 
   * @param el - DOM element to render into
   * @param result - Tool execution result
   * @param options - Rendering options
   */
  renderResult(
    el: HTMLElement,
    result: ToolExecutionResult,
    options?: {
      collapsible?: boolean;
      showMetadata?: boolean;
    }
  ): void;

  /**
   * Render error state in code block element.
   * 
   * @param el - DOM element to render into
   * @param error - Error information
   */
  renderError(el: HTMLElement, error: ErrorInfo): void;

  /**
   * Render pending/executing state in code block element.
   * 
   * @param el - DOM element to render into
   * @param status - Current execution status
   */
  renderStatus(el: HTMLElement, status: 'pending' | 'executing'): void;

  /**
   * Extract YAML parameters from code block lines.
   * Lines after "tool: toolname" are parsed as YAML.
   * 
   * @param lines - Code block lines
   * @returns Parsed parameters object
   * @throws YAMLParseError if YAML is invalid
   */
  parseYAMLParameters(lines: string[]): Record<string, unknown>;

  /**
   * Validate that code block references a configured server.
   * 
   * @param serverName - Language identifier from code block
   * @returns Server configuration if found, undefined otherwise
   */
  getServerByName(serverName: string): MCPServerConfig | undefined;
}

export interface ToolInvocation {
  serverId: string;      // Resolved from server name
  toolName: string;      // Extracted from "tool: name" line
  parameters: Record<string, unknown>;  // Parsed YAML
}
