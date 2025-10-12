import type { EmbedCache } from 'obsidian'
import { t } from 'src/lang/helper'
import type { BaseOptions, Capability, ResolveEmbedAsBinary, Vendor } from '.'

export const getMimeTypeFromFilename = (filename: string) => {
	const extension = filename.split('.').pop()?.toLowerCase() || ''

	const mimeTypes: Record<string, string> = {
		png: 'image/png',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		gif: 'image/gif',
		webp: 'image/webp',
		svg: 'image/svg+xml',
		bmp: 'image/bmp',
		ico: 'image/x-icon',

		pdf: 'application/pdf',
		doc: 'application/msword',
		docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		xls: 'application/vnd.ms-excel',
		xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		ppt: 'application/vnd.ms-powerpoint',
		pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

		txt: 'text/plain',
		html: 'text/html',
		css: 'text/css',
		js: 'application/javascript',
		json: 'application/json',
		xml: 'application/xml',
		md: 'text/markdown',

		mp3: 'audio/mpeg',
		wav: 'audio/wav',
		ogg: 'audio/ogg',
		flac: 'audio/flac',
		m4a: 'audio/mp4',

		mp4: 'video/mp4',
		avi: 'video/x-msvideo',
		mov: 'video/quicktime',
		wmv: 'video/x-ms-wmv',
		webm: 'video/webm'
	}

	return mimeTypes[extension] || 'application/octet-stream'
}

export const CALLOUT_BLOCK_START = ' \n\n> [!quote]-  \n> '
export const CALLOUT_BLOCK_END = '\n\n'

export const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
	let binary = ''
	const bytes = new Uint8Array(buffer)
	const len = bytes.byteLength
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i])
	}
	return window.btoa(binary)
}

export const convertEmbedToImageUrl = async (embed: EmbedCache, resolveEmbedAsBinary: ResolveEmbedAsBinary) => {
	const mimeType = getMimeTypeFromFilename(embed.link)

	if (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mimeType) === false) {
		throw new Error(t('Only PNG, JPEG, GIF, and WebP images are supported.'))
	}

	const embedBuffer = await resolveEmbedAsBinary(embed)
	const base64Data = arrayBufferToBase64(embedBuffer)
	return {
		type: 'image_url' as const,
		image_url: {
			url: `data:${mimeType};base64,${base64Data}`
		}
	}
}

export const getCapabilityEmoji = (capability: Capability): string => {
	switch (capability) {
		case 'Text Generation':
			return '✍️'
		case 'Image Vision':
			return '👁️'
		case 'PDF Vision':
			return '📄'
		case 'Image Generation':
			return '🎨'
		case 'Image Editing':
			return '✏️'
		case 'Web Search':
			return '🔍'
		case 'Reasoning':
			return '🧠'
		case 'Tool Calling':
			return '🔧'
	}
}

/**
 * Result of testing a provider connection
 */
export interface TestResult {
	success: boolean
	message: string
	models?: string[]
	latency?: number
}

/**
 * Test a provider connection using a two-tier strategy:
 * 1. Primary: Try to list available models (works for OpenAI, Ollama, etc.)
 * 2. Fallback: Send a minimal echo/ping message (works for Claude, custom providers)
 *
 * @param vendor - The provider vendor configuration
 * @param options - The provider options including API key, baseURL, etc.
 * @returns TestResult with success status, message, and optional models/latency
 */
export async function testProviderConnection(vendor: Vendor, options: BaseOptions): Promise<TestResult> {
	const timeout = 5000 // 5 second timeout
	const startTime = Date.now()

	try {
		// Create abort controller for timeout
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), timeout)

		try {
			// Try model listing first
			const modelResult = await tryModelListing(vendor, options, controller)

			if (modelResult.success) {
				clearTimeout(timeoutId)
				const latency = Date.now() - startTime
				return {
					success: true,
					message: `Connected to ${vendor.name} successfully`,
					models: modelResult.models,
					latency
				}
			}

			// If model listing returned an error message (e.g., 401), return it immediately
			if (modelResult.message) {
				clearTimeout(timeoutId)
				return {
					success: false,
					message: modelResult.message
				}
			}

			// Model listing failed without error message, try echo test
			const echoResult = await tryEchoTest(vendor, options, controller)
			clearTimeout(timeoutId)

			if (echoResult.success) {
				const latency = Date.now() - startTime
				return {
					success: true,
					message: `Connected to ${vendor.name} successfully`,
					latency
				}
			}

			// Both failed
			return {
				success: false,
				message: echoResult.message || 'Connection failed'
			}
		} catch (error: unknown) {
			clearTimeout(timeoutId)

			// Handle abort/timeout
			if (error instanceof Error && error.name === 'AbortError') {
				return {
					success: false,
					message: `Connection timeout: ${vendor.name} did not respond within ${timeout / 1000} seconds`
				}
			}

			throw error
		}
	} catch (error: unknown) {
		// Handle general errors
		if (error instanceof Error) {
			// Check for network/connection errors
			const errorMessage = error.message.toLowerCase()
			if (
				errorMessage.includes('econnrefused') ||
				errorMessage.includes('connection') ||
				errorMessage.includes('fetch')
			) {
				return {
					success: false,
					message: `Cannot connect to ${vendor.name}: Please check if the service is running and the baseURL is correct (${options.baseURL})`
				}
			}

			if (errorMessage.includes('timeout')) {
				return {
					success: false,
					message: `Request timeout: ${vendor.name} did not respond in time`
				}
			}

			return {
				success: false,
				message: `Connection failed: ${error.message}`
			}
		}

		return {
			success: false,
			message: 'Connection failed: Unknown error'
		}
	}
}

/**
 * Try to list available models from the provider
 */
async function tryModelListing(
	vendor: Vendor,
	options: BaseOptions,
	controller: AbortController
): Promise<{ success: boolean; models?: string[]; message?: string }> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	}

	// Add authentication headers based on provider
	if (options.apiKey) {
		// Claude uses x-api-key header
		if (vendor.name === 'Claude') {
			headers['x-api-key'] = options.apiKey
			headers['anthropic-version'] = '2023-06-01'
		} else {
			// Most providers use Bearer token
			headers.Authorization = `Bearer ${options.apiKey}`
		}
	}

	// Determine the models endpoint based on provider
	let modelsUrl: string
	if (vendor.name === 'Ollama') {
		// Ollama uses /api/tags
		modelsUrl = `${options.baseURL}/api/tags`
	} else {
		// Most OpenAI-compatible providers use /models or /v1/models
		const baseUrl = options.baseURL.replace(/\/$/, '') // Remove trailing slash
		modelsUrl = baseUrl.includes('/v1') ? `${baseUrl}/models` : `${baseUrl}/v1/models`
	}

	const response = await fetch(modelsUrl, {
		method: 'GET',
		headers,
		signal: controller.signal
	})

	if (!response.ok) {
		// If it's a 401, extract error message
		if (response.status === 401) {
			try {
				const errorData = await response.json()
				const errorMessage = errorData?.error?.message || 'Invalid API key'
				return { success: false, message: errorMessage }
			} catch {
				return { success: false, message: 'Invalid API key' }
			}
		}

		// For other errors (like 404), we'll fall back to echo test
		return { success: false }
	}

	const data = await response.json()

	// Parse models based on provider format
	let models: string[]
	if (vendor.name === 'Ollama') {
		// Ollama format: { models: [{ name: "llama3.1:latest", ... }] }
		models = data.models?.map((m: { name: string }) => m.name) || []
	} else {
		// OpenAI format: { data: [{ id: "gpt-4", ... }] }
		models = data.data?.map((m: { id: string }) => m.id) || []
	}

	return { success: true, models }
}

/**
 * Try to send a minimal echo/ping message to test the connection
 */
async function tryEchoTest(
	vendor: Vendor,
	options: BaseOptions,
	controller: AbortController
): Promise<{ success: boolean; message?: string }> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	}

	// Add authentication headers based on provider
	if (options.apiKey) {
		if (vendor.name === 'Claude') {
			headers['x-api-key'] = options.apiKey
			headers['anthropic-version'] = '2023-06-01'
		} else {
			headers.Authorization = `Bearer ${options.apiKey}`
		}
	}

	// Determine the chat endpoint
	const baseUrl = options.baseURL.replace(/\/$/, '')
	let chatUrl: string
	let requestBody: unknown

	if (vendor.name === 'Claude') {
		// Claude uses /v1/messages
		chatUrl = `${baseUrl}/v1/messages`
		requestBody = {
			model: options.model,
			max_tokens: 1,
			messages: [{ role: 'user', content: 'test' }]
		}
	} else {
		// OpenAI-compatible /chat/completions or /v1/chat/completions
		chatUrl = baseUrl.includes('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`
		requestBody = {
			model: options.model,
			messages: [{ role: 'user', content: 'test' }],
			max_tokens: 1,
			stream: false
		}
	}

	const response = await fetch(chatUrl, {
		method: 'POST',
		headers,
		body: JSON.stringify(requestBody),
		signal: controller.signal
	})

	if (!response.ok) {
		// Extract error message if available
		try {
			const errorData = await response.json()
			const errorMessage = errorData?.error?.message || `HTTP ${response.status}: ${response.statusText}`
			return { success: false, message: errorMessage }
		} catch {
			return { success: false, message: `HTTP ${response.status}: ${response.statusText}` }
		}
	}

	// Success - we got a valid response
	return { success: true }
}
