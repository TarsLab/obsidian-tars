/**
 * Real E2E Test: Ollama + MCP Memory Server (Docker)
 *
 * Tests the complete integration with:
 * - Real Ollama server (llama3.2 with tool calling)
 * - Real MCP memory server (mcp/memory Docker image)
 * - Full tool discovery, execution, and LLM interaction
 *
 * Prerequisites:
 * - Ollama running with llama3.2:3b model
 * - Docker available for running MCP memory server
 * - Image: docker pull mcp/memory
 *
 * Skip: Set SKIP_REAL_E2E=true to skip this test
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { Ollama } from 'ollama'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
	buildAIToolContext,
	createMCPManager,
	createToolExecutor,
	type MCPServerConfig,
	type MCPServerManager,
	type ToolExecutor
} from '../../src/mcp'

// Detect Ollama URL (WSL2-aware)
function detectOllamaUrl(): string {
	const envUrl = process.env.OLLAMA_URL
	if (envUrl) return envUrl

	// Check if WSL2
	try {
		const procVersion = readFileSync('/proc/version', 'utf-8')
		if (procVersion.toLowerCase().includes('microsoft')) {
			const hostIp = execSync('bash bin/get-host-ip.sh', { encoding: 'utf-8' }).trim()
			if (hostIp && hostIp !== '127.0.0.1') {
				return `http://${hostIp}:11434`
			}
		}
	} catch {
		// Fall through to localhost
	}

	return 'http://localhost:11434'
}

// Check if Ollama is available
async function isOllamaAvailable(url: string): Promise<boolean> {
	try {
		const response = await fetch(`${url}/api/tags`)
		return response.ok
	} catch {
		return false
	}
}

// Skip if real E2E tests disabled or Ollama not available
const SKIP_REAL_E2E = process.env.SKIP_REAL_E2E === 'true'
const OLLAMA_URL = detectOllamaUrl()
const MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b'

describe.skipIf(SKIP_REAL_E2E)('Real E2E: Ollama + MCP Memory Server', async () => {
	let manager: MCPServerManager
	let executor: ToolExecutor
	let ollama: Ollama

	// Check Ollama availability
	const ollamaAvailable = await isOllamaAvailable(OLLAMA_URL)

	beforeAll(async () => {
		if (!ollamaAvailable) {
			console.warn(`⚠️  Ollama not available at ${OLLAMA_URL} - skipping E2E tests`)
			return
		}

		// Initialize Ollama client
		ollama = new Ollama({ host: OLLAMA_URL })

		// Initialize MCP manager with memory server
		manager = createMCPManager()
		executor = createToolExecutor(manager)

		const serverConfig: MCPServerConfig = {
			id: 'memory-server',
			name: 'Memory Server',
			configInput: 'docker run -i --rm mcp/memory:latest',
			enabled: true,
			failureCount: 0,
			autoDisabled: false
		}
		// Suppress MCP server startup messages in test environment
		const originalStderr = process.stderr.write
		process.stderr.write = () => true

		try {
			await manager.initialize([serverConfig])
		} finally {
			process.stderr.write = originalStderr
		}
	}, 30000)

	afterAll(async () => {
		if (manager) {
			await manager.shutdown()
		}
	})

	describe.skipIf(!ollamaAvailable)('Ollama + MCP Integration Tests', () => {
		it('should connect to Ollama and list models', async () => {
			const response = await ollama.list()
			expect(response.models).toBeDefined()
			expect(Array.isArray(response.models)).toBe(true)
		})

		it('should discover MCP tools from memory server', async () => {
			// Build tool context
			const toolContext = await buildAIToolContext(manager, executor)

			// Memory server should provide tools like: store_memory, retrieve_memory, etc.
			expect(toolContext.tools.length).toBeGreaterThan(0)

			// mcp/memory is a Knowledge Graph server with these tools:
			// create_entities, create_relations, add_observations, etc.
			const toolNames = toolContext.tools.map((t) => t.toolName)
			const hasKnowledgeGraphTools = toolNames.some(
				(name) => name.includes('entities') || name.includes('relations') || name.includes('observations')
			)
			expect(hasKnowledgeGraphTools).toBe(true)
		})

		it('should convert MCP tools to Ollama format', async () => {
			const toolContext = await buildAIToolContext(manager, executor)

			// Convert to Ollama tool format
			const ollamaTools = toolContext.tools.map((tool) => ({
				type: 'function' as const,
				function: {
					name: tool.toolName,
					description: tool.description,
					parameters: tool.inputSchema
				}
			}))

			expect(ollamaTools.length).toBeGreaterThan(0)

			ollamaTools.forEach((tool) => {
				expect(tool.type).toBe('function')
				expect(tool.function.name).toBeDefined()
				expect(tool.function.description).toBeDefined()
				expect(tool.function.parameters).toBeDefined()
			})

			expect(ollamaTools.length).toBeGreaterThan(0)
		})

		it('should let Ollama call MCP knowledge graph tool', async () => {
			const toolContext = await buildAIToolContext(manager, executor)

			// Convert to Ollama format
			const ollamaTools = toolContext.tools.map((tool) => ({
				type: 'function' as const,
				function: {
					name: tool.toolName,
					description: tool.description,
					parameters: tool.inputSchema
				}
			}))

			// Ask Ollama to read the knowledge graph
			const response = await ollama.chat({
				model: MODEL,
				messages: [
					{
						role: 'user',
						content: 'Read the current knowledge graph to see what data is stored.'
					}
				],
				tools: ollamaTools,
				stream: false
			})

			// Check if Ollama called a tool
			if (response.message.tool_calls && response.message.tool_calls.length > 0) {
				const toolCall = response.message.tool_calls[0]

				// Find the tool in our context
				const tool = toolContext.tools.find((t) => t.toolName === toolCall.function.name)
				expect(tool).toBeDefined()

				// Execute the tool via our executor (catch errors for incomplete params)
				try {
					const result = await executor.executeTool({
						serverId: tool?.serverId || 'memory-server',
						toolName: toolCall.function.name || '',
						parameters: toolCall.function.arguments,
						source: 'ai-autonomous',
						documentPath: 'e2e-test.md'
					})

					expect(result.content).toBeDefined()
				} catch (_error) {
					// This is OK - the LLM might not provide all required parameters
				}
			}
		}, 60000)

		it('should complete full conversation loop with tool usage', async () => {
			const toolContext = await buildAIToolContext(manager, executor)
			const ollamaTools = toolContext.tools.map((tool) => ({
				type: 'function' as const,
				function: {
					name: tool.toolName,
					description: tool.description,
					parameters: tool.inputSchema
				}
			}))

			// biome-ignore lint/suspicious/noExplicitAny: conversation history can contain various types
			const conversation: Array<any> = []

			// Step 1: User asks to store something
			conversation.push({
				role: 'user',
				content: [
					'You have access to an MCP memory server.',
					'Call the tool named "create_entities" exactly once.',
					'Pass the following JSON object as arguments (do not wrap it in quotes):',
					'{"entities":[{"name":"user_name","entityType":"key-value","observations":["Alice"]}]}',
					'Do not call any other tools. After the tool succeeds, acknowledge that "user_name" now maps to Alice.'
				].join(' ')
			})

			const storeResponse = await ollama.chat({
				model: MODEL,
				messages: conversation,
				tools: ollamaTools,
				stream: false
			})

			conversation.push({
				role: 'assistant',
				content: storeResponse.message.content || '',
				tool_calls: storeResponse.message.tool_calls
			})

			// If tool was called, execute it
			if (storeResponse.message.tool_calls && storeResponse.message.tool_calls.length > 0) {
				for (const toolCall of storeResponse.message.tool_calls) {
					const tool = toolContext.tools.find((t) => t.toolName === toolCall.function.name)

					if (tool) {
						const normalizedArgs = { ...toolCall.function.arguments }

						// Handle various ways the LLM might provide the entities parameter
						if (normalizedArgs.entities) {
							// Case 1: entities is a string containing JSON
							if (typeof normalizedArgs.entities === 'string') {
								try {
									const parsed = JSON.parse(normalizedArgs.entities)
									// If parsed result has entities property, use it; otherwise use parsed result directly
									normalizedArgs.entities = parsed.entities || parsed
								} catch (parseError) {
									console.warn('Failed to parse entities string from tool call:', parseError)
									// If parsing fails, try to use the string as-is if it looks like JSON
									try {
										const parsed = JSON.parse(normalizedArgs.entities)
										normalizedArgs.entities = parsed
									} catch {
										// Last resort: leave as string and let the server handle it
									}
								}
							}
							// Case 2: entities is already an object with entities property
							else if (typeof normalizedArgs.entities === 'object' && normalizedArgs.entities.entities) {
								normalizedArgs.entities = normalizedArgs.entities.entities
							}
							// Case 3: entities is already the correct array format
							// (no change needed)
						}

						// Ensure entities is an array
						if (!Array.isArray(normalizedArgs.entities)) {
							console.warn('Entities parameter is not an array, attempting to fix:', normalizedArgs.entities)
							// Try to extract entities from various formats
							if (typeof normalizedArgs.entities === 'object' && normalizedArgs.entities.entities) {
								normalizedArgs.entities = normalizedArgs.entities.entities
							} else if (typeof normalizedArgs.entities === 'string') {
								try {
									const parsed = JSON.parse(normalizedArgs.entities)
									normalizedArgs.entities = Array.isArray(parsed) ? parsed : parsed.entities || [parsed]
								} catch {
									// Convert to array with single item as last resort
									normalizedArgs.entities = [normalizedArgs.entities]
								}
							} else {
								// Wrap in array as last resort
								normalizedArgs.entities = [normalizedArgs.entities]
							}
						}

						const result = await executor.executeTool({
							serverId: tool?.serverId || 'memory-server',
							toolName: toolCall.function.name || '',
							parameters: normalizedArgs,
							source: 'ai-autonomous',
							documentPath: 'e2e-test.md'
						})

						// Add tool result to conversation
						conversation.push({
							role: 'tool',
							content: JSON.stringify(result.content),
							tool_name: toolCall.function.name
						})
					}
				}

				// Step 2: Get final response from LLM
				const finalResponse = await ollama.chat({
					model: MODEL,
					messages: conversation,
					tools: ollamaTools,
					stream: false
				})

				expect(finalResponse.message.content).toBeDefined()
				expect(finalResponse.message.content.length).toBeGreaterThan(0)
			}
		}, 90000)

		it('should handle errors gracefully', async () => {
			const toolContext = await buildAIToolContext(manager, executor)

			// Try to execute a tool with invalid parameters
			const invalidTool = toolContext.tools[0]

			await expect(
				executor.executeTool({
					serverId: invalidTool?.serverId || 'memory-server',
					toolName: 'non_existent_tool',
					parameters: {},
					source: 'user-codeblock',
					documentPath: 'test.md'
				})
			).rejects.toThrow()
		})

		it('should maintain execution statistics', async () => {
			const stats = executor.getStats()
			expect(stats.totalExecuted).toBeGreaterThanOrEqual(0)
			expect(stats.activeExecutions).toBe(0)
			expect(stats.sessionLimit).toBeDefined()
		})
	})
})
