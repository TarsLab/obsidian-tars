# Testing providers against real networks

A provider can be correct in TypeScript, pass `npm run build`, and still fail for
every user, because the thing that breaks it lives outside the code: Obsidian's
renderer runs at origin `app://obsidian.md`, so every provider call is a
cross-origin request. Whether it survives depends on headers the plugin never
writes, on an allowlist the provider operator can change without telling anyone,
and on the route the user's machine happens to take.

`archive/TEST.md` holds the previous generation of this knowledge — "kimi 电脑端
跨域Error", "doubao 都不行" — as prose. It went stale silently. This document
describes the two harnesses that replace it, and, more importantly, the ways the
question can be answered wrongly.

## The trap that matters most

**A CORS rejection and an unreachable host are the same error.** Both surface as
`Failed to fetch` (fetch, and the OpenAI SDK) or `Network Error` (axios). Neither
mentions CORS. Diagnosing one as the other sends you rewriting a provider that
was fine.

They are separable, because `requestUrl` ignores CORS but still needs the
network:

| `fetch` | `requestUrl` | meaning                       |
| ------- | ------------ | ----------------------------- |
| ok      | ok           | working                       |
| blocked | ok           | **CORS**                      |
| blocked | blocked      | network — says nothing at all |

This works because Obsidian's `requestUrl` runs on Electron's network stack, the
same one `fetch` uses: an unreachable host reports `net::ERR_TIMED_OUT` through
it, a Chromium error code. Node's `https` module is _not_ a substitute — it
bypasses Chromium's proxy settings, so it can reach a host the plugin cannot.

## The second trap: your shell is not Obsidian

Obsidian honours the macOS system proxy. A terminal usually does not, and an
agent sandbox may inject its own. On the machine this was written on the two
disagreed in both directions:

- `api.x.ai` — unreachable from the shell, `HTTP 400` from Obsidian.
- `api-inference.modelscope.cn` — `HTTP 200` from the shell, timed out from
  Obsidian, whose proxy egresses to a foreign IP that ModelScope refuses.

So a shell probe can neither confirm nor refute a CORS finding. It is useful for
one thing only: reading what a server _advertises_.

## L1 — `scripts/cors-probe.sh`

Sends the OPTIONS preflight a browser would send, twice per endpoint: once with
the eight `X-Stainless-*` headers the OpenAI SDK attaches to every request, once
without. Fast, needs no credentials, and shows the raw allowlist.

```bash
./scripts/cors-probe.sh                # or --strip-proxy under a sandbox
./scripts/cors-probe.sh Kimi           # one provider
```

Treat its output as evidence, not a verdict. Two of its rules were wrong when
first written and had to be corrected against real behaviour:

- The Fetch spec and MDN both say `Access-Control-Allow-Headers: *` does not
  cover `Authorization`. **Chromium disagrees** — SiliconFlow answers `*` and a
  real request reaches it. Follow the implementation.
- A `403` from a CDN or a `404` from an endpoint that ignores OPTIONS is not a
  CORS finding. `api.anthropic.com` answers `403` to curl and `401` to a real
  request from Obsidian.

## L2 — `test/smoke`, a development-only plugin

The verdicts come from here, because only here does the code run at
`app://obsidian.md` on the user's real route. It is a separate plugin rather
than test code inside `main.js`: a plugin can `require('obsidian')` for the
genuine `requestUrl`, which `obsidian eval` cannot.

```bash
npm run smoke
cp build/tars-smoke/{main.js,manifest.json} "$VAULT/.obsidian/plugins/tars-smoke/"
obsidian eval code='(async()=>{await app.plugins.loadManifests();await app.plugins.enablePlugin("tars-smoke")})()'
```

Two entry points:

**`cors()`** — classifies every endpoint using the table above. Costs nothing
and touches no keys: the preflight runs before authentication, so a deliberately
invalid key is enough, and a `401` already proves the browser let the call out.

```bash
obsidian eval code='(async()=>app.plugins.plugins["tars-smoke"].cors())()'
```

**`chat()`** — runs each configured provider through its real `sendRequestFunc`
and reports time-to-first-token, length, and failure mode. This one **spends
real credit on real keys**, since it reads the Tars plugin's own settings.

```bash
obsidian eval code='(async()=>app.plugins.plugins["tars-smoke"].chat({only:"Kimi"}))()'
```

Run `chat()` before a change and after it, and diff. A provider that stops
streaming, starts returning empty, or loses its reasoning callout shows up as a
changed row — which is what `archive/TEST.md` could never do.

A provider whose backend is simply absent gives unstable timings — the Ollama
row has come back at 2ms, 1.2s, 13s and 30s in a row with nothing running on
`127.0.0.1:11434` either time, because a refused localhost connection is not
handled consistently. Read that row as signal only when the server is up.

**The harness bundles its own copy of `src/`.** That is the point — it tests the
source rather than whatever happens to be deployed — but it means editing a
provider and reloading the _Tars_ plugin proves nothing. Rebuild and redeploy
`tars-smoke` after every change to `src/`, or you will watch a fix you already
made appear to fail.

## `obsidian eval` mechanics

- **No top-level `await`.** Wrap everything: `(async()=>{ ... })()`. The CLI does
  await the promise you return, so the value comes back normally.
- `require` works, including absolute paths, but `require('obsidian')` does not —
  only real plugins get that module.
- A blocked request hangs until Chromium gives up. Always pass
  `AbortSignal.timeout(...)`; `requestUrl` takes no signal, so race it instead.
  Without this a full matrix takes minutes instead of seconds.

## Mobile

None of this covers mobile, and mobile is not optional — no provider may be
desktop-only. `obsidian dev:mobile` emulates the viewport, not the network
stack, so it cannot answer a CORS question. Every provider change needs a manual
pass on a phone before release. `src/providers/qianFan.ts` shows the established
shape for a genuine platform difference: branch on `Platform`, stream on the
side that can, fall back to `requestUrl` on the side that cannot.

## Recorded baseline — 2026-08-27

Measured on macOS with the system proxy enabled, so Obsidian's requests egress
through a non-mainland IP. **This is a property of the machine, not of the
providers.** Re-run both harnesses on your own before drawing conclusions; the
network column in particular will differ.

`cors()` — dummy keys, no credit spent:

| Provider    | fetch   | +stainless | network | verdict                                 |
| ----------- | ------- | ---------- | ------- | --------------------------------------- |
| Claude      | 401     | 401        | 401     | ok                                      |
| DeepSeek    | 401     | 401        | 401     | ok                                      |
| Grok        | 400     | 400        | 400     | ok                                      |
| OpenRouter  | 401     | 401        | 401     | ok                                      |
| Qwen        | 401     | 401        | 401     | ok                                      |
| SiliconFlow | 401     | 401        | 401     | ok                                      |
| Zhipu       | 401     | 401        | 401     | ok                                      |
| closeAI     | 401     | 401        | 401     | ok (both the openai and anthropic path) |
| **Kimi**    | 401     | blocked    | 401     | **x-stainless-\* rejected**             |
| **MiniMax** | 401     | blocked    | 401     | **x-stainless-\* rejected**             |
| OpenAI      | blocked | blocked    | 401     | CORS — requestUrl only, no streaming    |
| Doubao      | blocked | blocked    | 401     | CORS — requestUrl only, no streaming    |
| QianFan     | blocked | blocked    | 200     | CORS — requestUrl only, no streaming    |
| LongCat     | blocked | blocked    | 401     | CORS — requestUrl only, no streaming    |
| OpenCodeZen | blocked | blocked    | 401     | CORS — requestUrl only, no streaming    |
| ModelScope  | timeout | timeout    | timeout | no network — no CORS conclusion         |

What this overturns:

- **Doubao is still blocked.** A shell probe says its CORS headers are fine, and
  that reading is what a direct route sees. From inside Obsidian it is refused,
  so the non-streaming `requestUrl` path in `src/providers/doubao.ts` is still
  load-bearing. `archive/TEST.md` was right and remains right.
- **Kimi's history has a cause.** "kimi 电脑端 跨域Error … kimi 用 axios 可以"
  was never about axios being better; axios simply does not send
  `X-Stainless-*`. Strip those headers and the OpenAI SDK works there too.
- **LongCat and OpenCode Zen are not drop-in.** Both advertise usable CORS
  headers to a shell and refuse the browser, so neither is the "copy
  `deepSeek.ts`, change the base URL" job it looks like.
- **ModelScope cannot be judged from this machine at all** — the proxy route
  cannot reach it. Issue #108's cause is still visible in its headers
  (`Access-Control-Allow-Headers` is a fixed nginx allowlist carrying
  `Authorization` and `Content-Type` but no `x-stainless-*`), but the fix has to
  be confirmed on a route that reaches the host.

`chat()` — real keys, in the author's vault, so failures include account state
and are not all plugin defects:

| Tag         | Vendor      | First  | Result                                                    |
| ----------- | ----------- | ------ | --------------------------------------------------------- |
| Qwen        | Qwen        | 303ms  | ok                                                        |
| Kimi        | Kimi        | 560ms  | ok                                                        |
| DeepSeek    | DeepSeek    | 525ms  | ok, reasoning callout present                             |
| OpenRouter  | OpenRouter  | 1004ms | ok                                                        |
| Claude      | Claude      | 1995ms | ok, reasoning callout present                             |
| Gemini      | Gemini      | —      | fetch error — **issue #121**, `gemini-1.5-pro` is retired |
| gpt         | OpenAI      | —      | 403, account balance exhausted                            |
| Sonnet      | Claude      | —      | 404, model missing on that relay path                     |
| SiliconFlow | SiliconFlow | —      | 403                                                       |
| Zhipu       | Zhipu       | —      | no API key in this vault                                  |
| Ollama      | Ollama      | —      | not running locally                                       |

The reasoning-callout column is issue #116's test: DeepSeek and Claude open one,
and Zhipu is the row that should. Confirming it needs a Zhipu key in the vault
under test.
