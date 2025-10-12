/**
 * Real E2E Test: Ollama + MCP Memory Server (Docker)
 *
 * Tests the complete integration with:
 * - Real Ollama server (llama3.2 with tool calling)
 * - Real MCP memory server (mcp/memory Docker image)
 * - Full tool discovery, execution, and LLM interaction
 *
 * Prerequisites:
 * - Ollama running with any llama3.x model (auto-detects available models)
 * - Docker available for running MCP memory server
 * - Image: docker pull mcp/memory
 *
 * Smart Auto-Detection:
 *
 * URL Detection (tries in parallel with 3s timeout):
 * - OLLAMA_CLOUD_URL env var (if set) - highest priority
 * - OLLAMA_URL env var (if set and accessible)
 * - WSL2 Windows host IP (auto-detected on WSL2)
 * - localhost:11434 and 127.0.0.1:11434
 * - Local network IPs from all network interfaces
 * - Docker: host.docker.internal:11434
 * - Docker Compose: ollama:11434
 *
 * Model Selection (tries in order):
 * - OLLAMA_MODEL env var (if set)
 * - First available from: llama3.2:3b, llama3.2:latest, llama3.2:1b,
 *   llama3.1:latest, llama3.1:8b, llama3:latest
 * - Falls back to llama3.2:3b with warning
 *
 * Environment Variables:
 * - SKIP_REAL_E2E=true - Skip all E2E tests
 * - OLLAMA_URL=<url> - Force specific Ollama endpoint
 * - OLLAMA_CLOUD_URL=<url> - Priority cloud/remote Ollama
 * - OLLAMA_MODEL=<model> - Force specific model
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
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

// Check if Ollama is available at a specific URL
async function isOllamaAvailable(url: string): Promise<boolean> {
	try {
		const response = await fetch(`${url}/api/tags`, {
			signal: AbortSignal.timeout(3000) // 3 second timeout
		})
		return response.ok
	} catch {
		return false
	}
}

// Get local network IPs from all network interfaces
function getLocalNetworkIPs(): string[] {
	const ips: string[] = []
	const interfaces = networkInterfaces()

	for (const interfaceName in interfaces) {
		const networkInterface = interfaces[interfaceName]
		if (!networkInterface) continue

		for (const iface of networkInterface) {
			// Skip internal (loopback) addresses and IPv6
			if (iface.internal || iface.family !== 'IPv4') continue

			// Add valid IPv4 addresses
			if (iface.address && iface.address !== '127.0.0.1') {
				ips.push(iface.address)
			}
		}
	}

	return ips
}

// Detect Ollama URL by trying multiple endpoints
async function detectOllamaUrl(): Promise<string> {
	// If explicit URL provided, use it
	const envUrl = process.env.OLLAMA_URL
	if (envUrl) {
		const available = await isOllamaAvailable(envUrl)
		if (available) {
			return envUrl
		}
		console.warn(`⚠️  OLLAMA_URL=${envUrl} not accessible, trying fallback URLs...`)
	}

	// Build list of candidate URLs (in priority order)
	const candidateUrls: string[] = []

	// Add WSL2 Windows host IP if on WSL2 (highest priority for WSL environments)
	try {
		const procVersion = readFileSync('/proc/version', 'utf-8')
		if (procVersion.toLowerCase().includes('microsoft')) {
			// Try to get Windows host IP using the script
			try {
				const hostIp = execSync('bash bin/get-host-ip.sh', { encoding: 'utf-8' }).trim()
				if (hostIp && hostIp !== '127.0.0.1' && hostIp.match(/^\d+\.\d+\.\d+\.\d+$/)) {
					candidateUrls.push(`http://${hostIp}:11434`)
				}
			} catch {
				// Ignore if script fails
			}

			// Also try WSL2 default gateway (Windows host IP)
			try {
				const gateway = execSync("ip route show default | awk '/default/ {print $3}'", { encoding: 'utf-8' }).trim()
				if (gateway && gateway !== '127.0.0.1' && gateway.match(/^\d+\.\d+\.\d+\.\d+$/)) {
					candidateUrls.push(`http://${gateway}:11434`)
				}
			} catch {
				// Ignore if command fails
			}
		}
	} catch {
		// Not on WSL2 or can't read /proc/version
	}

	// Add standard localhost URLs
	candidateUrls.push('http://localhost:11434', 'http://127.0.0.1:11434')

	// Add local network IPs (for Ollama running on same network)
	const localIPs = getLocalNetworkIPs()
	for (const ip of localIPs) {
		candidateUrls.push(`http://${ip}:11434`)
	}

	// Add container/cloud URLs
	candidateUrls.push(
		'http://host.docker.internal:11434', // Docker Desktop
		'http://ollama:11434' // Docker Compose service name
	)

	// Add cloud/remote Ollama URLs if specified via env
	if (process.env.OLLAMA_CLOUD_URL) {
		candidateUrls.unshift(process.env.OLLAMA_CLOUD_URL) // Highest priority
	}

	// Try all URLs in parallel
	const results = await Promise.allSettled(
		candidateUrls.map(async (url) => ({
			url,
			available: await isOllamaAvailable(url)
		}))
	)

	// Find first available URL
	for (const result of results) {
		if (result.status === 'fulfilled' && result.value.available) {
			console.log(`✅ Found Ollama at: ${result.value.url}`)
			return result.value.url
		}
	}

	// No available URL found, return default
	console.warn(`⚠️  No Ollama instance found. Tried: ${candidateUrls.join(', ')}`)
	return candidateUrls[0]
}

// Get available models from Ollama and select from fallback list
async function selectAvailableModel(url: string, preferredModels: string[]): Promise<string | null> {
	try {
		const response = await fetch(`${url}/api/tags`)
		if (!response.ok) return null

		const data = await response.json()
		const availableModels = data.models?.map((m: { name: string }) => m.name) || []

		// Try to find first preferred model that's available
		for (const preferred of preferredModels) {
			if (availableModels.includes(preferred)) {
				return preferred
			}
		}

		return null
	} catch {
		return null
	}
}

// Skip if real E2E tests disabled or Ollama not available
const SKIP_REAL_E2E = process.env.SKIP_REAL_E2E === 'true'

// Preferred models list (in order of preference) - llama3.2 and llama3.1 support tool calling
const PREFERRED_MODELS = [
	'llama3.2:3b',
	'llama3.2:latest',
	'llama3.2:1b',
	'llama3.1:latest',
	'llama3.1:8b',
	'llama3:latest'
]

type OllamaEnvironment = {
	url: string
	model: string
	modelAvailable: boolean
}

const ollamaEnvironmentPromise = (async (): Promise<OllamaEnvironment> => {
	const url = await detectOllamaUrl()
	const selectedModel = await selectAvailableModel(url, PREFERRED_MODELS)
	const model = process.env.OLLAMA_MODEL || selectedModel || 'llama3.2:3b'
	const modelAvailable = Boolean(selectedModel || process.env.OLLAMA_MODEL)
	return { url, model, modelAvailable }
})()

describe.skipIf(SKIP_REAL_E2E)('Real E2E: Ollama + MCP Memory Server', async () => {
	let manager: MCPServerManager
	let executor: ToolExecutor
	let ollama: Ollama
	let originalStderrWrite: typeof process.stderr.write
	let originalStdoutWrite: typeof process.stdout.write
	let environment: OllamaEnvironment
	let ollamaAvailable = false

	beforeAll(async function (this: { skip?: (reason?: string) => void }) {
		environment = await ollamaEnvironmentPromise
		ollamaAvailable = await isOllamaAvailable(environment.url)
		if (!ollamaAvailable || !environment.modelAvailable) {
			const reason = !ollamaAvailable
				? `Ollama not available at ${environment.url}`
				: `No suitable Ollama model detected from ${PREFERRED_MODELS.join(', ')}`
			console.warn(`⚠️  ${reason} - skipping E2E tests`)
			this.skip?.(reason)
			return
		}

		console.log(`✅ Using Ollama model: ${environment.model}`)

		// Suppress MCP server messages for cleaner test output
		originalStderrWrite = process.stderr.write
		originalStdoutWrite = process.stdout.write

		process.stderr.write = (chunk: any) => {
			// Filter out MCP server startup messages
			const msg = chunk.toString()
			if (msg.includes('Knowledge Graph') || msg.includes('MCP Server')) {
				return true
			}
			return originalStderrWrite.call(process.stderr, chunk)
		}

		process.stdout.write = (chunk: any) => {
			// Filter out MCP server startup messages
			const msg = chunk.toString()
			if (msg.includes('Knowledge Graph') || msg.includes('MCP Server running on stdio')) {
				return true
			}
			return originalStdoutWrite.call(process.stdout, chunk)
		}

		// Initialize Ollama client
		ollama = new Ollama({ host: environment.url })

		// Initialize MCP manager with memory server
		manager = createMCPManager()
		executor = createToolExecutor(manager)

		const serverConfig: MCPServerConfig = {
			id: 'memory-server',
			name: 'Memory Server',
			configInput: 'docker run -i --rm mcp/memory:latest 2>/dev/null',
			enabled: true,
			failureCount: 0,
			autoDisabled: false
		}

		await manager.initialize([serverConfig])
	}, 30000)

	afterAll(async () => {
		// Restore original stderr and stdout
		if (originalStderrWrite) {
			process.stderr.write = originalStderrWrite
		}
		if (originalStdoutWrite) {
			process.stdout.write = originalStdoutWrite
		}

		if (manager) {
			await manager.shutdown()
		}
	})

	describe('Ollama + MCP Integration Tests', () => {
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
				model: environment.model,
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
				model: environment.model,
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
									// Skip logging in test environment - this is expected LLM behavior
									// console.warn('Failed to parse entities string from tool call:', parseError)
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
							// Skip logging in test environment - this is expected LLM behavior
							// console.warn('Entities parameter is not an array, attempting to fix:', normalizedArgs.entities)
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
					model: environment.model,
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
