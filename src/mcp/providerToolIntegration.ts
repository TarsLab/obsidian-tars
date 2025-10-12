/**
 * Provider Tool Integration
 *
 * Helpers to integrate MCP tools with AI providers that support function calling.
 * This module provides utilities to:
 * - Convert MCP tools to provider-specific formats
 * - Inject tool context into provider parameters
 * - Handle tool calling responses
 */

import type { ToolExecutor } from './executor'
import type { MCPServerManager } from './managerMCPUse'
import { buildAIToolContext } from './providerIntegration'

/**
 * Ollama tool format
 * See: https://github.com/ollama/ollama/blob/main/docs/api.md#tool-calling
 */
export interface OllamaTool {
	type: 'function'
	function: {
		name: string
		description: string
		parameters: Record<string, unknown>
	}
}

/**
 * OpenAI/Compatible tool format
 * Used by: OpenAI, Azure, OpenRouter, etc.
 */
export interface OpenAITool {
	type: 'function'
	function: {
		name: string
		description: string
		parameters: Record<string, unknown>
	}
}

/**
 * Claude tool format (Anthropic)
 */
export interface ClaudeTool {
	name: string
	description: string
	input_schema: Record<string, unknown>
}

/**
 * Build Ollama-compatible tools from MCP servers
 */
export async function buildOllamaTools(manager: MCPServerManager, executor: ToolExecutor): Promise<OllamaTool[]> {
	const toolContext = await buildAIToolContext(manager, executor)

	return toolContext.tools.map((tool) => ({
		type: 'function' as const,
		function: {
			name: tool.toolName,
			description: tool.description,
			parameters: tool.inputSchema
		}
	}))
}

/**
 * Build OpenAI-compatible tools from MCP servers
 * Works with: OpenAI, Azure OpenAI, OpenRouter, etc.
 */
export async function buildOpenAITools(manager: MCPServerManager, executor: ToolExecutor): Promise<OpenAITool[]> {
	const toolContext = await buildAIToolContext(manager, executor)

	return toolContext.tools.map((tool) => ({
		type: 'function' as const,
		function: {
			name: tool.toolName,
			description: tool.description,
			parameters: tool.inputSchema
		}
	}))
}

/**
 * Build Claude-compatible tools from MCP servers
 */
export async function buildClaudeTools(manager: MCPServerManager, executor: ToolExecutor): Promise<ClaudeTool[]> {
	const toolContext = await buildAIToolContext(manager, executor)

	return toolContext.tools.map((tool) => ({
		name: tool.toolName,
		description: tool.description,
		input_schema: tool.inputSchema
	}))
}

/**
 * Generic tool builder - detects provider and returns appropriate format
 */
export async function buildToolsForProvider(
	providerName: string,
	manager: MCPServerManager,
	executor: ToolExecutor
): Promise<OllamaTool[] | OpenAITool[] | ClaudeTool[]> {
	const lowerName = providerName.toLowerCase()

	if (lowerName.includes('ollama')) {
		return buildOllamaTools(manager, executor)
	}

	if (lowerName.includes('claude') || lowerName.includes('anthropic')) {
		return buildClaudeTools(manager, executor)
	}

	// Default to OpenAI format (compatible with most providers)
	// Works with: OpenAI, Azure, OpenRouter, DeepSeek, Grok, etc.
	return buildOpenAITools(manager, executor)
}

/**
 * Inject MCP tools into provider parameters
 *
 * Example usage:
 * ```ts
 * const params = { model: 'llama3.2', temperature: 0.7 };
 * const withTools = await injectMCPTools(params, 'Ollama', manager, executor);
 * // withTools now has: { model: 'llama3.2', temperature: 0.7, tools: [...] }
 * ```
 */
export async function injectMCPTools(
	parameters: Record<string, unknown>,
	providerName: string,
	manager: MCPServerManager,
	executor: ToolExecutor
): Promise<Record<string, unknown>> {
	const tools = await buildToolsForProvider(providerName, manager, executor)

	if (tools.length === 0) {
		return parameters
	}

	return {
		...parameters,
		tools
	}
}

/**
 * Check if a provider supports tool calling
 */
export function providerSupportsTools(providerName: string): boolean {
	const lowerName = providerName.toLowerCase()

	// Providers with known tool/function calling support
	const supportedProviders = [
		'ollama', // Native tool calling (llama3.2+)
		'openai', // Function calling
		'azure', // Azure OpenAI function calling
		'claude', // Tool use
		'anthropic', // Tool use
		'openrouter', // Supports OpenAI format
		'deepseek', // Supports OpenAI format
		'grok', // Supports OpenAI format
		'gemini' // Function calling
	]

	return supportedProviders.some((provider) => lowerName.includes(provider))
}

/**
 * Get recommended models for tool calling by provider
 */
export function getToolCallingModels(providerName: string): string[] {
	const lowerName = providerName.toLowerCase()

	if (lowerName.includes('ollama')) {
		return ['llama3.2:3b', 'llama3.2', 'llama3.1', 'mistral']
	}

	if (lowerName.includes('openai')) {
		return ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo']
	}

	if (lowerName.includes('claude')) {
		return ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku']
	}

	if (lowerName.includes('gemini')) {
		return ['gemini-pro', 'gemini-1.5-pro']
	}

	return []
}
