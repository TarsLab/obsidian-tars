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

## The second trap: an invalid key only tests the error path

cors() and sdk() cost nothing because a preflight runs before authentication, so
an invalid key is enough to see whether the browser let a request out. That is
true, and it is also how they mislead.

A gateway that attaches CORS headers to real responses may attach none to the
rejections it writes itself. Then every probe — invalid key, or valid key with a
made-up model — reads as blocked, and a provider that streams perfectly is
recorded as unusable. LongCat was written off this way (issue #120) until a real
request showed it working: its preflight advertises
`access-control-allow-origin`, its 200s carry it, and its 4xx carry nothing.

So a `blocked` verdict from cors() is a finding about the error path only. What
settles it is a request that succeeds — chat(), with a configured provider and a
model that exists. A real key alone is not enough, since the probe still sends a
model that does not exist.

The cost of this is real in the other direction too: users of such a provider
see "Failed to fetch" instead of whatever the API actually said, because the
browser refuses to hand over a response with no CORS headers on it.

## The third trap: your shell is not Obsidian

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

Five entry points:

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

The default question costs the least and answers in one token, but it provokes no
thinking — so the callout path, which is what most provider changes touch, goes
unexercised unless `prompt` asks for it. `errChars` widens the error column,
which is fifty characters by default and never enough to see why a provider said 400.

```bash
obsidian eval code='(async()=>app.plugins.plugins["tars-smoke"].chat({
  only:"Kimi", model:"kimi-k3", sample:200, errChars:400,
  prompt:"A bat and ball cost 1.10 … Think it through."}))()'
```

**`models()`** — asks every configured provider for its own model list, through
the very `MODEL_FETCH_CONFIGS` and `fetchModels` the settings tab uses. Those are
exported from `src/settingTab.ts` for this reason: a harness holding its own copy
of the URLs stops testing them the moment one is edited. Costs nothing beyond a
`GET`, but it does use real keys.

```bash
obsidian eval code='(async()=>app.plugins.plugins["tars-smoke"].models())()'
# models(only?, timeoutMs = 8000, limit = 6) — widen the budget and the sample:
obsidian eval code='(async()=>app.plugins.plugins["tars-smoke"].models("Claude",40000,99))()'
```

This is what a hardcoded model list is checked against. Two things it has already
settled: DeepSeek no longer lists `deepseek-chat` or `deepseek-reasoner` at all,
and eight seconds is not a generous timeout — Qwen, DeepSeek, OpenRouter and
SiliconFlow all came back as `timeout` at 8s and answered fine at 40s. Read a
`FAIL — timeout` as "ask again with a bigger budget", never as "the endpoint is
gone".

A listed model is not a guaranteed model. `claude-sonnet-4-0` appears in the list
this vault's relay returns and still answers `404 not_found_error` when asked a
question, which is why the model field stays typeable next to the picker.

**`image()`** — the one thing `chat()` refuses to do. Image vendors are skipped
there because they spend credit _and_ write a file into the vault, so this has to
be asked for by name. It saves the attachment through the editor's own
`getAvailablePathForAttachment` + `createBinary`, because the binary handoff is
the part worth testing: a Node `Buffer` standing in for an `ArrayBuffer` worked
on desktop and threw on every phone.

```bash
obsidian eval code='(async()=>app.plugins.plugins["tars-smoke"].image({
  only:"GptImage", options:{n:1, quality:"low", size:"1024x1024"}}))()'
```

`options` overrides the provider's settings for that run only, so one cheap
image can be asked for without editing the vault. Note that those are _settings_
and `bodyParams` filters them back out of the request body — to prove an
override reaches the API, put it in the provider's `parameters` instead and give
it a value the API will reject.

**`sse()`** — replays a chat stream that arrives in awkward pieces, through the
decoder that ships and through the loop it replaced. Costs nothing and touches no
network. A provider only splits a frame when the packets happen to land that way,
so the bug it pins fails intermittently, mid-answer, and looks like the model
stopping early — which is exactly the kind of thing a live run cannot be relied
on to reproduce.

```bash
obsidian eval code='(async()=>app.plugins.plugins["tars-smoke"].sse())()'
# shipped decoder : "Hello world"  ✓
# previous loop   : THREW Unterminated string in JSON at position 35
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
- **LongCat was a false alarm** — see the trap above. It streams fine; only its
  error responses lack CORS headers, which is all an invalid key can provoke.
  OpenCode Zen, Doubao and OpenAI still read as blocked, and for the same reason
  none of those verdicts should be trusted until a successful request is tried
  against them.
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

`models()` — the same vault, 40s budget, run while replacing the hardcoded model
lists:

| Tag         | Vendor      | N   | Note                                                       |
| ----------- | ----------- | --- | ---------------------------------------------------------- |
| Router      | OpenRouter  | 417 | —                                                          |
| Qwen        | Qwen        | 242 | the four names once hardcoded are 4 of these               |
| gpt         | OpenAI      | 132 | through a relay, so the list is the relay's                |
| Doubao      | Doubao      | 130 | `/api/v3/models` answers to the inference key              |
| Claude      | Claude      | 18  | derived from a base URL ending in `/v1/messages`           |
| Gemini      | Gemini      | 15  | Veo and image entries filtered out                         |
| Kimi        | Kimi        | 12  | —                                                          |
| Zhipu       | Zhipu       | 10  | —                                                          |
| MiniMax     | MiniMax     | 8   | —                                                          |
| DeepSeek    | DeepSeek    | 3   | `deepseek-chat` and `deepseek-reasoner` are not among them |
| LongCat     | LongCat     | 1   | —                                                          |
| SiliconFlow | SiliconFlow | —   | 403, account awaiting identity verification                |
| Ollama      | Ollama      | —   | **unverified**: no server reachable from this machine      |

`Azure`, `QianFan` and `GptImage` have no entry in `MODEL_FETCH_CONFIGS`. Azure
addresses a deployment whose name its owner chose, and listing deployments needs
a management credential rather than the inference key; the other two keep a
curated list.
