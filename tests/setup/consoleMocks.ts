import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { Writable } from 'node:stream'

type ConsoleMethod = 'log' | 'info' | 'debug' | 'warn' | 'error'

declare global {
	// Store serialized console.error calls for assertions
	var __CONSOLE_ERROR_MESSAGES__: string[]
}

const allMethods: ConsoleMethod[] = ['log', 'info', 'debug', 'warn', 'error']
const capturedErrors: string[] = []

const toMessage = (args: unknown[]) =>
	args
		.map((value) => {
			if (typeof value === 'string') return value
			try {
				return JSON.stringify(value)
			} catch {
				return String(value)
			}
		})
		.join(' ')

// Store original stderr
const originalStderr = process.stderr

beforeAll(() => {
	globalThis.__CONSOLE_ERROR_MESSAGES__ = capturedErrors

	// Suppress debug library output in tests
	// The logger uses the 'debug' library which checks DEBUG env var
	process.env.DEBUG = ''

	// Mock all console methods to suppress test noise
	// Error messages are captured for assertions but not displayed
	for (const method of allMethods) {
		vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
			// Only capture errors for test assertions
			if (method === 'error') {
				capturedErrors.push(toMessage(args))
			}
			// All other output is silently suppressed
		})
	}

	// Suppress stderr from child processes (npm/npx errors)
	// Create a writable stream that discards all data
	const nullStream = new Writable({
		write(_chunk, _encoding, callback) {
			callback()
		}
	})

	// Replace process.stderr with our null stream
	Object.defineProperty(process, 'stderr', {
		value: nullStream,
		writable: true,
		configurable: true
	})
})

afterEach(() => {
	capturedErrors.length = 0
})

afterAll(() => {
	vi.restoreAllMocks()

	// Restore original stderr
	Object.defineProperty(process, 'stderr', {
		value: originalStderr,
		writable: true,
		configurable: true
	})
})
