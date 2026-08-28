import { describe, expect, it } from 'vitest'
import { LocaleKey, t } from '../../src/lang/helper'
import en from '../../src/lang/locale/en'
import { ProviderSettings } from '../../src/providers'
import { applyProtocol, CustomOptions, customVendor, protocolVendor } from '../../src/providers/custom'
import { openAIVendor } from '../../src/providers/openAI'
import { availableVendors, nameUntaggedProviders, unusedTag } from '../../src/settings'

describe('unusedTag', () => {
	it('uses the vendor name when nothing has taken it', () => {
		expect(unusedTag('Claude', ['DeepSeek'])).toBe('Claude')
	})

	// Numbered rather than spaced, because a tag may not contain a space.
	it('numbers from 2 upwards when it has', () => {
		expect(unusedTag('Claude', ['Claude'])).toBe('Claude2')
		expect(unusedTag('Claude', ['Claude', 'Claude2'])).toBe('Claude3')
	})

	it('compares the way the tag field does, without regard to case', () => {
		expect(unusedTag('Claude', ['claude'])).toBe('Claude2')
	})
})

describe('nameUntaggedProviders', () => {
	const provider = (tag: string, vendor = 'Claude'): ProviderSettings => ({
		tag,
		vendor,
		options: { apiKey: '', baseURL: '', model: '', parameters: {} }
	})

	// A provider with no tag cannot be triggered — there is no way to type an
	// empty tag — but it still registers a command palette entry reading "# : ".
	// Adding a second provider of one vendor stored exactly that for several
	// releases, so vaults still carry them.
	it('names a provider that was saved without a tag', () => {
		const providers = [provider('Claude'), provider('')]
		expect(nameUntaggedProviders(providers)).toEqual(['Claude2'])
		expect(providers[1].tag).toBe('Claude2')
	})

	it('treats whitespace as no tag at all', () => {
		const providers = [provider('  ')]
		expect(nameUntaggedProviders(providers)).toEqual(['Claude'])
	})

	it('leaves a named provider alone and reports nothing', () => {
		const providers = [provider('Claude'), provider('mine')]
		expect(nameUntaggedProviders(providers)).toEqual([])
		expect(providers.map((p) => p.tag)).toEqual(['Claude', 'mine'])
	})
})

describe('vendor descriptions', () => {
	// A description is stored as a locale key and looked up at render time, so a
	// key that does not exist renders as nothing at all rather than failing.
	it('are all keys the locale actually has', () => {
		for (const vendor of availableVendors) {
			if (!vendor.description) continue
			expect(en, `${vendor.name} description`).toHaveProperty(vendor.description)
		}
	})
})

describe('the custom provider', () => {
	const fresh = () => JSON.parse(JSON.stringify(customVendor.defaultOptions)) as CustomOptions

	// Someone who has scrolled the list looking for their own provider and not
	// found it has already gone past every row that could have told them what to
	// do instead, so this one goes first.
	it('is the first entry in the vendor list, and the only one out of order', () => {
		const [first, ...rest] = availableVendors.map((v) => v.name)
		expect(first).toBe(customVendor.name)
		expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)))
	})

	// "Custom" is the one name in the picker that names nothing the reader would
	// recognise; without this it reads as a vendor they have never heard of.
	it('says what it is, in a string that resolves', () => {
		expect(customVendor.description).toBeTruthy()
		expect(t(customVendor.description as LocaleKey)).toBe(en[customVendor.description as LocaleKey])
	})

	it('starts on the OpenAI protocol', () => {
		expect(fresh().protocol).toBe('OpenAI')
		expect(protocolVendor(customVendor, fresh()).name).toBe(openAIVendor.name)
	})

	it('leaves every other vendor speaking for itself', () => {
		expect(protocolVendor(openAIVendor, openAIVendor.defaultOptions).name).toBe(openAIVendor.name)
	})

	// A protocol read back from data.json is whatever is in the file.
	it('falls back to OpenAI when the stored protocol is not one', () => {
		const options = { ...fresh(), protocol: 'Nonsense' } as unknown as CustomOptions
		expect(protocolVendor(customVendor, options).name).toBe(openAIVendor.name)
	})

	it('takes on the capabilities of the protocol it speaks', () => {
		const claude = applyProtocol(fresh(), 'Claude')
		expect(protocolVendor(customVendor, claude).capabilities).toContain('Web Search')
		const gemini = applyProtocol(fresh(), 'Gemini')
		expect(protocolVendor(customVendor, gemini).capabilities).not.toContain('Web Search')
	})

	describe('applyProtocol', () => {
		// max_tokens is not optional to Anthropic: without one the request is a 400.
		it('brings Claude its own settings', () => {
			expect(applyProtocol(fresh(), 'Claude')).toMatchObject({
				protocol: 'Claude',
				max_tokens: 8192,
				enableThinking: false,
				budget_tokens: 1600
			})
		})

		// Left behind, a max_tokens would silently swallow the same key typed into
		// "Override input parameters", which is what bodyParams exists to prevent.
		it('takes them away again on the way out', () => {
			const options = applyProtocol(applyProtocol(fresh(), 'Claude'), 'OpenAI')
			expect(Object.keys(options)).not.toContain('max_tokens')
			expect(Object.keys(options)).not.toContain('budget_tokens')
		})

		it('keeps a value the user already set', () => {
			const options = applyProtocol(fresh(), 'Claude')
			options.max_tokens = 4096
			expect(applyProtocol(options, 'Claude').max_tokens).toBe(4096)
		})

		it('moves a base URL that is still a default', () => {
			expect(applyProtocol(fresh(), 'Claude').baseURL).toBe('https://api.anthropic.com')
			expect(applyProtocol(fresh(), 'Gemini').baseURL).toBe('https://generativelanguage.googleapis.com')
		})

		// The point of a custom provider is usually a relay address; a change of
		// protocol has no business undoing the user's own typing.
		it('leaves a base URL the user typed', () => {
			const options = fresh()
			options.baseURL = 'https://relay.example.com/v1'
			expect(applyProtocol(options, 'Claude').baseURL).toBe('https://relay.example.com/v1')
		})

		it('fills an empty base URL in', () => {
			const options = fresh()
			options.baseURL = ''
			expect(applyProtocol(options, 'Gemini').baseURL).toBe('https://generativelanguage.googleapis.com')
		})
	})

	it('refuses to send to a protocol it does not know', () => {
		const options = { ...fresh(), protocol: 'Nonsense' } as unknown as CustomOptions
		expect(() => customVendor.sendRequestFunc(options)).toThrow(/Unknown protocol/)
	})
})
