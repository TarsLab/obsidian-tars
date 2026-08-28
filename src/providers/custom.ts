import { BaseOptions, SendRequest, Vendor } from '.'
import { claudeVendor } from './claude'
import { geminiVendor } from './gemini'
import { openAIVendor } from './openAI'

/**
 * The wire protocol a custom endpoint speaks.
 *
 * Deliberately spelled as the names of the three vendors that define them, so
 * that anything already keyed by vendor name — `MODEL_FETCH_CONFIGS`, most of
 * `providerDefs` — serves a custom provider by being asked for its protocol
 * instead. A fourth protocol is an entry in `PROTOCOL_VENDORS` and nothing else.
 */
export const PROTOCOLS = ['OpenAI', 'Claude', 'Gemini'] as const

export type Protocol = (typeof PROTOCOLS)[number]

export interface CustomOptions extends BaseOptions {
	protocol: Protocol
	/** Present only while the Claude protocol is selected; see `CLAUDE_ONLY`. */
	max_tokens?: number
	enableThinking?: boolean
	budget_tokens?: number
}

const PROTOCOL_VENDORS: Record<Protocol, Vendor> = {
	OpenAI: openAIVendor,
	Claude: claudeVendor,
	Gemini: geminiVendor
}

/**
 * The vendor implementing a protocol, defaulting when the name is not one.
 *
 * A protocol arrives from `data.json`, which is a file on disk that other
 * software and the user can write: it is not guaranteed to be one of the three.
 */
const vendorFor = (protocol: Protocol): Vendor => PROTOCOL_VENDORS[protocol] ?? openAIVendor

/**
 * Claude's own settings, with the defaults they are created with.
 *
 * `max_tokens` is not optional to Anthropic — a request without it is a 400 — so
 * a custom provider speaking that protocol has to carry one. These are added and
 * removed with the protocol rather than left permanently on every custom
 * provider, because `bodyParams` drops any override key that names a provider
 * setting: a `max_tokens` left behind after a switch to the OpenAI protocol
 * would silently swallow the same key typed into "Override input parameters",
 * which is the failure that function exists to prevent.
 */
const CLAUDE_ONLY: Record<string, unknown> = {
	max_tokens: 8192,
	enableThinking: false,
	budget_tokens: 1600
}

/**
 * The vendor whose protocol a provider actually speaks.
 *
 * For everything but a custom provider that is the provider's own vendor. This
 * is the one place the distinction is made: capabilities, the model list
 * endpoint, the Claude-only settings and the base URL default all follow from
 * the answer, so each of them asks here rather than testing for `Custom` itself.
 */
export const protocolVendor = (vendor: Vendor, options: BaseOptions): Vendor =>
	vendor.name === customVendor.name ? vendorFor((options as CustomOptions).protocol) : vendor

/**
 * Switches a custom provider to another protocol, settings and all.
 *
 * The base URL moves with the protocol only while it is still one of the
 * defaults: the point of a custom provider is usually a relay address, and
 * having that replaced by a change of protocol would be the setting undoing the
 * user's own work.
 */
export const applyProtocol = (options: CustomOptions, protocol: Protocol) => {
	const previous = PROTOCOL_VENDORS[options.protocol]
	const next = vendorFor(protocol)
	options.protocol = protocol

	if (!options.baseURL.trim() || options.baseURL === previous?.defaultOptions.baseURL) {
		options.baseURL = next.defaultOptions.baseURL
	}

	const record = options as unknown as Record<string, unknown>
	for (const [key, value] of Object.entries(CLAUDE_ONLY)) {
		if (protocol !== 'Claude') delete record[key]
		else if (!(key in record)) record[key] = value
	}
	return options
}

const sendRequestFunc = (settings: CustomOptions): SendRequest => {
	const vendor = PROTOCOL_VENDORS[settings.protocol]
	if (!vendor) throw new Error(`Unknown protocol: ${settings.protocol}. Expected one of ${PROTOCOLS.join(', ')}`)
	return vendor.sendRequestFunc(settings)
}

/**
 * An endpoint this plugin has never heard of.
 *
 * Every request to add a provider — MiniMax, LongCat, OpenCode Zen — has been
 * the same request twice over: the endpoint already speaks one of the three
 * protocols implemented here, and what was missing was a way to say so without
 * waiting for a release. A relay, a self-hosted gateway and a model behind a
 * corporate proxy all need the same four answers, so ask for those and reuse the
 * protocol.
 *
 * The tag is the name: it is what the user types to trigger the assistant and
 * what titles the provider's page, so a separate display name would be a second
 * name for the same thing.
 */
export const customVendor: Vendor = {
	name: 'Custom',
	description: 'Your own endpoint: anything speaking the OpenAI, Claude or Gemini protocol',
	defaultOptions: {
		apiKey: '',
		baseURL: openAIVendor.defaultOptions.baseURL,
		model: '',
		protocol: 'OpenAI',
		parameters: {}
	} as CustomOptions,
	sendRequestFunc,
	models: [],
	websiteToObtainKey: '',
	// What all three protocols have in common; the page shows what the chosen one adds.
	capabilities: ['Text Generation']
}
