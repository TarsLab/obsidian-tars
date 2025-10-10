/**
 * Document tool cache tests
 *
 * Validates parsing of tool call/result pairs, parameter hashing, and
 * order-independent matching for cached executions.
 */

import type { Editor } from 'obsidian'
import { describe, expect, it } from 'vitest'
import { DocumentToolCache } from '../../src/mcp/toolResultCache'

const buildEditor = (content: string): Editor =>
	({
		getValue: () => content
	}) as unknown as Editor

describe('DocumentToolCache', () => {
	const cache = new DocumentToolCache()

	const doc = `> [!tool] Tool Call (Weather Server: getWeather)
> Server ID: weather-server
> \`\`\`Weather Server
> tool: getWeather
> location: Paris
> units: metric
> \`\`\`
> Duration: 150ms
> Executed: 2025-10-09T12:34:56.000Z
> Results:
> \`\`\`
> {
>   "forecast": "Sunny",
>   "temperature": 24
> }
> \`\`\`
`

	it('hashes parameters ignoring key order', () => {
		const paramsA = { location: 'Paris', units: 'metric' }
		const paramsB = { units: 'metric', location: 'Paris' }

		const hashA = cache.hashParameters(paramsA)
		const hashB = cache.hashParameters(paramsB)

		expect(hashA).toBe(hashB)
	})

	it('finds existing result with order-independent parameters', () => {
		const editor = buildEditor(doc)
		const existing = cache.findExistingResult(editor, 'weather-server', 'getWeather', {
			units: 'metric',
			location: 'Paris'
		})

		expect(existing).not.toBeNull()
		expect(existing?.serverName).toBe('Weather Server')
		expect(existing?.parameterHash).toBe(cache.hashParameters({ location: 'Paris', units: 'metric' }))
		expect(existing?.resultMarkdown).toContain('"forecast": "Sunny"')
		expect(existing?.executedAt).toBe(Date.parse('2025-10-09T12:34:56.000Z'))
		expect(existing?.calloutRange.startLine).toBe(0)
		expect(existing?.resultRange?.startLine ?? 0).toBeGreaterThan(existing?.calloutRange.startLine ?? -1)
	})

	it('returns all cached results in document', () => {
		const multiDoc = `${doc}\n> [!tool] Tool Call (Math Server: add)
> Server ID: math-server
> \`\`\`Math Server
> tool: add
> a: 1
> b: 2
> \`\`\`
> Duration: 5ms
> Executed: 2025-10-09T13:00:00.000Z
> Results:
> \`\`\`
> {
>   "result": 3
> }
> \`\`\`
`
		const editor = buildEditor(multiDoc)
		const results = cache.getAllResults(editor)
		expect(results).toHaveLength(2)
		expect(results[1].toolName).toBe('add')
		expect(results[1].resultMarkdown).toContain('"result": 3')
	})

	it('handles missing timestamp gracefully', () => {
		const docWithoutTimestamp = doc.replace('> Executed: 2025-10-09T12:34:56.000Z\n', '')
		const editor = buildEditor(docWithoutTimestamp)
		const result = cache.findExistingResult(editor, 'weather-server', 'getWeather', {
			location: 'Paris',
			units: 'metric'
		})

		expect(result).not.toBeNull()
		expect(result?.executedAt).toBeUndefined()
	})
})
