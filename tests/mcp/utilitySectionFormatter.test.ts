import { describe, expect, it } from 'vitest'

import {
	formatUtilitySectionCallout,
	type UtilitySectionInfo
} from '../../src/mcp/utilitySectionFormatter'

describe('formatUtilitySectionCallout', () => {
	it('formats provider, model, and tools into callout', () => {
		const info: UtilitySectionInfo = {
			providerName: 'OpenAI',
			modelName: 'gpt-4.1',
			servers: [
				{ serverName: 'Weather Server', toolNames: ['getWeather', 'getForecast'] },
				{ serverName: 'Math Server', toolNames: ['add'] }
			]
		}

		const callout = formatUtilitySectionCallout(info)

		expect(callout).toBe(
			'\n> [!llm] OpenAI model: gpt-4.1\n> Tools: Weather Server:(getWeather, getForecast), Math Server:(add)\n\n'
		)
	})

	it('falls back to defaults when data missing', () => {
		const info: UtilitySectionInfo = {
			providerName: '',
			modelName: '',
			servers: []
		}

		const callout = formatUtilitySectionCallout(info)
		expect(callout).toBe('\n> [!llm] Unknown model: unknown\n> Tools: none\n\n')
	})

	it('handles servers without tool names', () => {
		const info: UtilitySectionInfo = {
			providerName: 'Claude',
			modelName: 'claude-3-sonnet',
			servers: [{ serverName: 'Docs Server', toolNames: [] }]
		}

		const callout = formatUtilitySectionCallout(info)
		expect(callout).toBe('\n> [!llm] Claude model: claude-3-sonnet\n> Tools: Docs Server:(none)\n\n')
	})
})
