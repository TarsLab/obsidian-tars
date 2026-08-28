import OpenAI from 'openai'
import { Plugin, requestUrl } from 'obsidian'
import { Message, ProviderSettings } from '../../src/providers'
import { protocolVendor } from '../../src/providers/custom'
import { chatCompletionChunks, stripStainlessHeaders } from '../../src/providers/utils'
import { availableVendors } from '../../src/settings'
import { fetchModels, MODEL_FETCH_CONFIGS, ModelFetchConfig } from '../../src/settingTab'

/**
 * Development-only harness. Loaded as a separate plugin so that it can import the
 * real vendor code and still call `require('obsidian')` for the genuine
 * `requestUrl` — neither is reachable from `obsidian eval`, and neither is worth
 * shipping inside main.js.
 *
 * Drive it from the CLI:
 *   obsidian eval code='(async()=>app.plugins.plugins["tars-smoke"].cors())()'
 *   obsidian eval code='(async()=>app.plugins.plugins["tars-smoke"].chat())()'
 */

const DUMMY_KEY = 'sk-deliberately-invalid'

/** The endpoint each vendor actually posts to, for the CORS probe. */
const ENDPOINTS: Record<string, string> = {
	OpenAI: 'https://api.openai.com/v1/chat/completions',
	Claude: 'https://api.anthropic.com/v1/messages',
	DeepSeek: 'https://api.deepseek.com/chat/completions',
	Doubao: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
	Grok: 'https://api.x.ai/v1/chat/completions',
	Kimi: 'https://api.moonshot.cn/v1/chat/completions',
	OpenRouter: 'https://openrouter.ai/api/v1/chat/completions',
	QianFan: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat',
	Qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
	SiliconFlow: 'https://api.siliconflow.cn/v1/chat/completions',
	Zhipu: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
	// candidates from open issues
	MiniMax: 'https://api.minimaxi.com/v1/chat/completions',
	LongCat: 'https://api.longcat.chat/openai/v1/chat/completions',
	ModelScope: 'https://api-inference.modelscope.cn/v1/chat/completions',
	OpenCodeZen: 'https://opencode.ai/zen/v1/chat/completions',
	// third-party relays this vault is configured against
	'closeAI/openai': 'https://api.openai-proxy.org/v1/chat/completions',
	'closeAI/claude': 'https://api.openai-proxy.org/anthropic/v1/messages'
}

/** A blocked request can hang until Chromium gives up, which is far too long. */
const PROBE_TIMEOUT_MS = 8000

/** The headers the OpenAI SDK attaches to every request whether you want them or not. */
const STAINLESS = {
	'x-stainless-os': 'MacOS',
	'x-stainless-lang': 'js',
	'x-stainless-arch': 'arm64',
	'x-stainless-runtime': 'browser:chrome',
	'x-stainless-runtime-version': '1.0.0',
	'x-stainless-package-version': '5.1.1',
	'x-stainless-retry-count': '0',
	'x-stainless-timeout': '600'
}

type Reach = 'ok' | 'blocked' | 'error'

interface PluginRegistry {
	plugins: { plugins: Record<string, { settings?: { providers?: ProviderSettings[] } }> }
}

// Truncates as well as pads: a provider's error text is arbitrarily long, and one
// overlong cell shifts every column after it, which makes the table unreadable
// exactly when something has gone wrong.
const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n - 1) + ' ' : s + ' '.repeat(n - s.length))

export default class SmokePlugin extends Plugin {
	async onload() {
		// Nothing to register; the harness is driven entirely from `obsidian eval`.
	}

	/**
	 * Classifies each endpoint as reachable, CORS-blocked, or network-down.
	 *
	 * `fetch` is subject to CORS; `requestUrl` is not, but both traverse the same
	 * network. A failure in one and not the other is therefore decisive, which
	 * matters because a CORS rejection and an unreachable host both surface as the
	 * same useless "Failed to fetch". An invalid key is enough: the preflight runs
	 * before authentication, so a 401 already proves the browser let the call out.
	 */
	async cors(filter?: string): Promise<string> {
		const targets = Object.entries(ENDPOINTS).filter(
			([name]) => !filter || name.toLowerCase().includes(filter.toLowerCase())
		)

		// Probing serially costs a timeout per unreachable host; there are enough of
		// those to push a serial run past two minutes.
		const rows = await Promise.all(
			targets.map(async ([name, url]) => {
				const auth: Record<string, string> =
					name === 'Claude'
						? {
								'x-api-key': DUMMY_KEY,
								'anthropic-version': '2023-06-01',
								'anthropic-dangerous-direct-browser-access': 'true',
								'Content-Type': 'application/json'
							}
						: { Authorization: `Bearer ${DUMMY_KEY}`, 'Content-Type': 'application/json' }

				const body = JSON.stringify({ model: 'probe', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 })

				const [plain, stain, direct] = await Promise.all([
					this.viaFetch(url, auth, body),
					this.viaFetch(url, { ...auth, ...STAINLESS }, body),
					this.viaRequestUrl(url, auth, body)
				])

				let verdict: string
				// requestUrl ignores CORS but still needs the network, so it is what
				// separates "the browser refused this" from "the host is unreachable".
				// Both surface as the same "Failed to fetch" without it.
				if (direct.reach === 'blocked') verdict = 'NO NETWORK — says nothing about CORS'
				else if (plain.reach === 'blocked')
					// This probe can only ever provoke an error: the key is invalid and
					// the model is made up. A gateway that puts CORS headers on real
					// responses may put none on its own rejections, and then a provider
					// that works perfectly reads as blocked. LongCat did exactly that.
					// Only a request that succeeds tells the two apart, which means
					// chat(), with a configured provider and a real model.
					verdict = 'CORS: blocked on the error path — only chat() tells this from a real block'
				else if (stain.reach === 'blocked') verdict = 'CORS: ** x-stainless-* rejected — strip them **'
				else verdict = 'ok'

				return pad(name, 15) + pad(plain.note, 20) + pad(stain.note, 20) + pad(direct.note, 16) + verdict
			})
		)

		return [
			pad('PROVIDER', 15) + pad('fetch', 20) + pad('fetch+stainless', 20) + pad('network', 16) + 'VERDICT',
			'-'.repeat(100),
			...rows
		].join('\n')
	}

	/**
	 * The same question as cors(), asked through the OpenAI SDK instead of raw
	 * fetch — which is what actually ships. Constructs each client twice, with the
	 * SDK's telemetry headers left alone and with `stripStainlessHeaders` applied,
	 * so the effect of the fix is visible per provider rather than inferred.
	 *
	 * Costs nothing: an invalid key still proves the browser let the request out.
	 */
	async sdk(filter?: string): Promise<string> {
		// Anthropic and QianFan do not go through this SDK, so they are not listed.
		const skip = ['Claude', 'QianFan', 'closeAI/claude']
		const targets = Object.entries(ENDPOINTS).filter(
			([name]) => !skip.includes(name) && (!filter || name.toLowerCase().includes(filter.toLowerCase()))
		)

		const attempt = async (baseURL: string, strip: boolean) => {
			try {
				const client = new OpenAI({
					apiKey: DUMMY_KEY,
					baseURL,
					dangerouslyAllowBrowser: true,
					maxRetries: 0,
					timeout: PROBE_TIMEOUT_MS,
					...(strip ? { defaultHeaders: stripStainlessHeaders } : {})
				})
				await client.chat.completions.create({ model: 'probe', messages: [{ role: 'user', content: 'hi' }] })
				return 'HTTP 200'
			} catch (e) {
				const msg = (e as Error).message ?? String(e)
				// An HTTP status means the request left the browser, which is the
				// only thing being asked here — 401 is a pass, not a failure.
				const status = /(\d{3}) status code/.exec(msg)
				if (status) return `HTTP ${status[1]}`
				if (/Connection error|Failed to fetch/i.test(msg)) return 'BLOCKED'
				return msg.slice(0, 24)
			}
		}

		const rows = await Promise.all(
			targets.map(async ([name, url]) => {
				const baseURL = url.replace(/\/chat\/completions$/, '')
				const [before, after] = await Promise.all([attempt(baseURL, false), attempt(baseURL, true)])
				const verdict =
					before === 'BLOCKED' && after !== 'BLOCKED'
						? '** FIXED by stripping x-stainless-* **'
						: before === 'BLOCKED'
							? 'still blocked — not a header problem'
							: 'was already working'
				return pad(name, 15) + pad(before, 26) + pad(after, 26) + verdict
			})
		)

		return [
			pad('PROVIDER', 15) + pad('SDK as-is', 26) + pad('SDK stripped', 26) + 'VERDICT',
			'-'.repeat(90),
			...rows
		].join('\n')
	}

	/**
	 * The preflight response as the browser saw it, for when cors() says a provider
	 * is blocked and the question is why.
	 *
	 * requestUrl ignores CORS but travels the same route, so it can read the
	 * headers Chromium refused on — which a shell cannot, since a shell may not
	 * take that route at all.
	 */
	async preflight(url: string, requestHeaders = 'authorization,content-type', apiKey = DUMMY_KEY): Promise<string> {
		// A preflight passing is only half of it: the response to the real request
		// has to carry Access-Control-Allow-Origin as well, and a gateway that
		// answers OPTIONS itself may not put it on what the backend returns.
		const look = async (method: string, headers: Record<string, string>, body?: string) => {
			try {
				const r = await requestUrl({ url, method, headers, body, throw: false })
				const cors = Object.entries(r.headers).filter(([k]) => k.toLowerCase().startsWith('access-control'))
				return (
					`  HTTP ${r.status}\n` +
					(cors.length
						? cors.map(([k, v]) => `    ${k}: ${v}`).join('\n')
						: '    (no access-control-* headers — the browser refuses here)')
				)
			} catch (e) {
				return `  unreachable: ${(e as Error).message}`
			}
		}

		const optionsRes = await look('OPTIONS', {
			Origin: 'app://obsidian.md',
			'Access-Control-Request-Method': 'POST',
			'Access-Control-Request-Headers': requestHeaders
		})
		const postRes = await look(
			'POST',
			{ Origin: 'app://obsidian.md', Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
			JSON.stringify({ model: 'probe', messages: [{ role: 'user', content: 'hi' }] })
		)
		// A GET that succeeds is the only way to see the success path when the POST
		// is refused for quota: a gateway may attach CORS headers on one and not the
		// other, and an invalid key would never reveal the difference.
		const listRes = await look('GET', { Origin: 'app://obsidian.md', Authorization: `Bearer ${apiKey}` })
		return `preflight (OPTIONS)\n${optionsRes}\n\nactual request (POST)\n${postRes}\n\nsame URL via GET\n${listRes}`
	}

	private async viaFetch(url: string, headers: Record<string, string>, body: string) {
		try {
			const r = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
			return { reach: 'ok' as Reach, note: `HTTP ${r.status}` }
		} catch (e) {
			// A CORS rejection and a dead host are indistinguishable here by design;
			// the requestUrl column is what tells them apart.
			return { reach: 'blocked' as Reach, note: (e as Error).message.slice(0, 20) }
		}
	}

	private async viaRequestUrl(url: string, headers: Record<string, string>, body: string) {
		try {
			// requestUrl takes no AbortSignal, so the timeout has to be raced alongside it.
			const r = await Promise.race([
				requestUrl({ url, method: 'POST', headers, body, throw: false }),
				new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), PROBE_TIMEOUT_MS))
			])
			return { reach: 'ok' as Reach, note: `HTTP ${r.status}` }
		} catch (e) {
			return { reach: 'blocked' as Reach, note: (e as Error).message.slice(0, 14) }
		}
	}

	/**
	 * Runs every configured provider through its real `sendRequestFunc` and reports
	 * time-to-first-token, output and failure mode — the regression baseline that
	 * `archive/TEST.md` was, except re-runnable.
	 *
	 * Uses whatever is in the Tars plugin's own settings, so it spends real API
	 * credit on real keys.
	 */
	async chat(
		opts: {
			only?: string
			timeoutMs?: number
			model?: string
			sample?: number
			maxChars?: number
			errChars?: number
			prompt?: string
		} = {}
	): Promise<string> {
		const timeoutMs = opts.timeoutMs ?? 45_000
		// Enough to see an answer begin; raise it to inspect where a callout ends.
		const maxChars = opts.maxChars ?? 300
		// `App.plugins` is not in obsidian.d.ts. Reach for it behind a narrow
		// structural type, the way src/settingTab.ts reaches for closePage().
		const tars = (this.app as unknown as PluginRegistry).plugins?.plugins?.['tars']
		if (!tars) return 'Tars plugin is not loaded — enable it first.'
		const providers: ProviderSettings[] = tars.settings?.providers ?? []
		if (!providers.length) return 'No providers configured.'

		// The default costs the least and answers in one token, but it provokes no
		// thinking at all — so the callout path, which is what most provider changes
		// touch, goes unexercised unless a prompt asks for it.
		const messages: Message[] = [{ role: 'user', content: opts.prompt ?? 'What is 1+1? Reply with the digit only.' }]
		const lines = [
			pad('TAG', 14) + pad('VENDOR', 12) + pad('FIRST', 9) + pad('TOTAL', 9) + pad('CHARS', 7) + 'RESULT',
			'-'.repeat(92)
		]

		for (const p of providers) {
			if (opts.only && !p.tag.toLowerCase().includes(opts.only.toLowerCase())) continue
			const vendor = availableVendors.find((v) => v.name === p.vendor)
			if (!vendor) {
				lines.push(pad(p.tag, 14) + pad(p.vendor, 12) + 'unknown vendor')
				continue
			}
			// Image generation writes attachments into the vault; keep the harness read-only.
			if (vendor.capabilities.includes('Image Generation')) {
				lines.push(pad(p.tag, 14) + pad(p.vendor, 12) + 'skipped (image generation)')
				continue
			}

			const controller = new AbortController()
			const t0 = performance.now()
			let first = -1
			let out = ''
			let result = 'ok'

			try {
				// Overriding the model here rather than in the vault keeps the harness
				// from editing the settings it is supposed to be observing.
				const options = opts.model ? { ...p.options, model: opts.model } : p.options
				const send = vendor.sendRequestFunc(options)
				const drain = (async () => {
					for await (const chunk of send(messages, controller, async () => {
						throw new Error('smoke test sends no embeds')
					})) {
						if (first < 0) first = performance.now() - t0
						out += chunk
						if (out.length > maxChars) {
							controller.abort()
							break
						}
					}
				})()
				// Aborting the controller is a request, not a guarantee: a vendor SDK
				// that ignores the signal keeps the harness hostage. Ollama took 75s
				// against a 30s budget that way. Race a hard deadline alongside it.
				await Promise.race([
					drain,
					new Promise<never>((_, reject) =>
						window.setTimeout(() => {
							controller.abort()
							reject(new Error(`smoke-deadline ${timeoutMs}ms`))
						}, timeoutMs)
					)
				])
			} catch (e) {
				const msg = (e as Error).message ?? String(e)
				// axios reports a CORS rejection as a bare "Network Error"; the OpenAI
				// SDK and raw fetch report "Failed to fetch". Neither names CORS.
				// Fifty characters is enough to see that a provider said 400 and not
				// enough to see why, which is the moment the column is wanted. Widen it
				// per-run rather than by default, so the table still lines up.
				const errChars = opts.errChars ?? 50
				if (/Failed to fetch|Network Error/i.test(msg)) result = `NETWORK/CORS: ${msg.slice(0, errChars)}`
				else if (/smoke-deadline/.test(msg)) result = `TIMEOUT >${timeoutMs}ms`
				else if (/abort/i.test(msg) && out.length) result = 'ok (truncated)'
				else if (/abort/i.test(msg)) result = `TIMEOUT >${timeoutMs}ms`
				else result = `ERROR: ${msg.slice(0, errChars)}`
			}

			const total = performance.now() - t0
			// A reasoning model that never opens a callout is issue #116's signature.
			const reasoning = out.includes('[!') ? ' +reasoning-callout' : ''
			if (result === 'ok' && !out.trim()) result = 'EMPTY RESPONSE'

			// Seeing the bytes matters when the question is how a provider formats
			// its answer rather than whether it answered — issue #116, for one.
			if (opts.sample && out) lines.push(`    ${JSON.stringify(out.slice(0, opts.sample))}`)
			lines.push(
				pad(opts.model ? `${p.tag}:${opts.model}` : p.tag, 14) +
					pad(p.vendor, 12) +
					pad(first < 0 ? '-' : `${Math.round(first)}ms`, 9) +
					pad(`${Math.round(total)}ms`, 9) +
					pad(String(out.length), 7) +
					result +
					reasoning
			)
		}
		return lines.join('\n')
	}
	/**
	 * Asks every configured provider for its own model list.
	 *
	 * The settings tab fetches models for some vendors and ships a hardcoded array
	 * for the rest, and those arrays go stale — issue #119 was exactly that. This
	 * reports what each vendor's list endpoint actually answers, so the choice
	 * between fetching a list and curating one rests on the response rather than on
	 * documentation.
	 *
	 * Uses `requestUrl`, as the settings tab does, so CORS never enters into it:
	 * what is being measured is reachability, authentication and response shape.
	 */
	async models(only?: string, timeoutMs = PROBE_TIMEOUT_MS, limit = 6): Promise<string> {
		const tars = (this.app as unknown as PluginRegistry).plugins?.plugins?.['tars']
		if (!tars) return 'Tars plugin is not loaded — enable it first.'
		const providers: ProviderSettings[] = tars.settings?.providers ?? []
		if (!providers.length) return 'No providers configured.'

		const lines = [
			pad('TAG', 14) + pad('VENDOR', 12) + pad('STATUS', 8) + pad('N', 5) + 'ENDPOINT — SAMPLE',
			'-'.repeat(110)
		]

		for (const p of providers) {
			if (only && !p.tag.toLowerCase().includes(only.toLowerCase())) continue
			// Keyed by the protocol a provider speaks rather than by its vendor, so a
			// custom provider is asked for its models at the endpoint its protocol
			// defines instead of being reported as having none.
			const listed = availableVendors.find((v) => v.name === p.vendor)
			const spoken = listed ? protocolVendor(listed, p.options).name : p.vendor
			const config: ModelFetchConfig | undefined = (
				MODEL_FETCH_CONFIGS as Record<string, ModelFetchConfig | undefined>
			)[spoken]
			if (!config) {
				lines.push(pad(p.tag, 14) + pad(p.vendor, 12) + 'no list endpoint configured — the model is typed in by hand')
				continue
			}
			const url = typeof config.url === 'function' ? config.url(p.options.baseURL) : config.url
			try {
				const ids = await Promise.race([
					fetchModels(config, p.options.baseURL, config.requiresApiKey ? p.options.apiKey : undefined),
					new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), timeoutMs))
				])
				lines.push(
					pad(p.tag, 14) +
						pad(p.vendor, 12) +
						pad('ok', 8) +
						pad(String(ids.length), 5) +
						url +
						(ids.length ? ` — ${ids.slice(0, limit).join(', ')}` : ' — empty list')
				)
			} catch (e) {
				lines.push(
					pad(p.tag, 14) +
						pad(p.vendor, 12) +
						pad('FAIL', 8) +
						pad('-', 5) +
						url +
						' — ' +
						(e as Error).message.slice(0, 70)
				)
			}
		}
		return lines.join('\n')
	}
	/**
	 * Runs an image vendor for real.
	 *
	 * `chat()` skips these on purpose: they spend credit and they write a file into
	 * the vault, so this has to be asked for by name. The attachment goes through
	 * the same `getAvailablePathForAttachment` + `createBinary` the editor uses,
	 * because the binary handoff is the part worth testing — a Node `Buffer`
	 * standing in for an ArrayBuffer worked on desktop and threw on every phone.
	 *
	 * `options` overrides the provider's settings for this run only, so a probe can
	 * ask for one cheap image without editing the vault:
	 *   image({ options: { n: 1, quality: 'low', size: '1024x1024' } })
	 */
	async image(
		opts: {
			only?: string
			prompt?: string
			timeoutMs?: number
			options?: Record<string, unknown>
		} = {}
	): Promise<string> {
		const timeoutMs = opts.timeoutMs ?? 120_000
		const tars = (this.app as unknown as PluginRegistry).plugins?.plugins?.['tars']
		if (!tars) return 'Tars plugin is not loaded — enable it first.'
		const providers: ProviderSettings[] = tars.settings?.providers ?? []

		const messages: Message[] = [
			{ role: 'user', content: opts.prompt ?? 'A single small red circle centred on white. Flat vector, no text.' }
		]
		const lines: string[] = []

		for (const p of providers) {
			if (opts.only && !p.tag.toLowerCase().includes(opts.only.toLowerCase())) continue
			const vendor = availableVendors.find((v) => v.name === p.vendor)
			if (!vendor?.capabilities.includes('Image Generation')) continue

			const written: string[] = []
			const saveAttachment = async (fileName: string, data: ArrayBuffer) => {
				// Deliberately the editor's own implementation, byte for byte: what is
				// being tested is that what the vendor hands over is something the
				// vault will accept.
				const path = await this.app.fileManager.getAvailablePathForAttachment(fileName)
				await this.app.vault.createBinary(path, data)
				written.push(`${path} (${data.byteLength} bytes)`)
			}

			const controller = new AbortController()
			const t0 = performance.now()
			let out = ''
			let result = 'ok'
			try {
				const send = vendor.sendRequestFunc({ ...p.options, ...opts.options })
				const drain = (async () => {
					for await (const chunk of send(
						messages,
						controller,
						async () => {
							throw new Error('this probe sends no embeds')
						},
						saveAttachment
					))
						out += chunk
				})()
				await Promise.race([
					drain,
					new Promise<never>((_, reject) =>
						window.setTimeout(() => {
							controller.abort()
							reject(new Error(`deadline ${timeoutMs}ms`))
						}, timeoutMs)
					)
				])
			} catch (e) {
				result = `ERROR: ${((e as Error).message ?? String(e)).slice(0, 300)}`
			}

			lines.push(`${p.tag} (${p.vendor}) — ${Math.round(performance.now() - t0)}ms — ${result}`)
			for (const w of written) lines.push(`  wrote ${w}`)
			if (out) lines.push(`  yielded ${JSON.stringify(out)}`)
		}
		return lines.length ? lines.join('\n') : 'No image-generation provider matched.'
	}
	/**
	 * Replays an SSE body that arrives in awkward pieces, through the decoder that
	 * ships and through the loop kimi and grok used before it.
	 *
	 * Costs nothing and touches no network: the point is the framing, and framing
	 * is reproducible. A real provider only splits a frame when the packets happen
	 * to land that way, which is why this went unnoticed — it fails intermittently,
	 * mid-answer, and looks like the model stopping early.
	 */
	async sse(): Promise<string> {
		// "Hello world" in two frames, the first split mid-JSON, with the protocol
		// lines a chat stream really carries in between.
		const wire = [
			'data: {"choices":[{"delta":{"content":"He',
			'llo"}}]}\n\n: keep-alive\n\ndata: {"choices"',
			':[{"delta":{"content":" world"}}]}\n\nevent: ping\n\ndata: [DONE]\n\n'
		]
		const body = () =>
			new ReadableStream<Uint8Array>({
				start(ctrl) {
					for (const part of wire) ctrl.enqueue(new TextEncoder().encode(part))
					ctrl.close()
				}
			})

		const lines: string[] = []

		try {
			let out = ''
			for await (const chunk of chatCompletionChunks(body())) out += chunk.choices[0]?.delta?.content ?? ''
			lines.push(
				`shipped decoder : ${JSON.stringify(out)}${out === 'Hello world' ? '  ✓' : '  ✗ expected "Hello world"'}`
			)
		} catch (e) {
			lines.push(`shipped decoder : THREW ${(e as Error).message}  ✗`)
		}

		try {
			// The old loop, verbatim in shape: split each decoded read on newlines and
			// parse every non-empty piece, with no buffer across reads and no try.
			let out = ''
			const reader = body().pipeThrough(new TextDecoderStream()).getReader()
			for (;;) {
				const { done, value } = await reader.read()
				if (done) break
				for (const part of value.split('\n')) {
					if (part.includes('data: [DONE]')) break
					const trimmed = part.replace(/^data: /, '').trim()
					if (trimmed) {
						const data = JSON.parse(trimmed) as OpenAI.ChatCompletionChunk
						out += data.choices?.[0]?.delta?.content ?? ''
					}
				}
			}
			lines.push(`previous loop   : ${JSON.stringify(out)}`)
		} catch (e) {
			lines.push(`previous loop   : THREW ${(e as Error).message}`)
		}

		return lines.join('\n')
	}
}
