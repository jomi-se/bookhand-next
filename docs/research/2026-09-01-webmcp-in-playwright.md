# Driving the real WebMCP runtime from Playwright

Recorded 2026-09-01 on Linux ARM64, against Chromium 151 and Chrome
for Testing 153. Written so any local development harness — Claude Code, Codex,
or a bare script — can exercise the agent path without a stand-in.

## The short version

```js
const browser = await chromium.launch({ args: ['--enable-features=WebMCPTesting'] })
```

That is the whole trick. Playwright's own bundled Chromium already contains
WebMCP; it is gated behind a feature flag, not absent. Load a **secure origin**
and `document.modelContext` is there, with `registerTool`, `getTools`,
`executeTool`, and `ontoolchange`.

No Chrome install, no `sudo`, no system Chromium, no ARM64 problem. It works
with `chromium.launch()`'s default executable, so it is portable rather than
coupled to one development environment.

## How the flag name was found

`--enable-features=` needs the `base::Feature` name, which is not the flag id.
Dump the binary's strings and look for the id, then for the `k`-prefixed
symbol near it:

```sh
strings -a "$(node -e "import('@playwright/test').then(m=>console.log(m.chromium.executablePath()))")" > chrome.strings
grep -n "webmcp" chrome.strings          # -> enable-webmcp-testing, devtools-webmcp-support
grep -n "kWebMCPTesting\|WebMCPTesting" chrome.strings
```

The flag id is `enable-webmcp-testing` (what `chrome://flags` shows); the
feature is **`WebMCPTesting`**. This generalises: for any `chrome://flags`
entry, the switch value is usually the `kFoo` symbol sitting near the flag id
in the string table, not the id itself.

Things that do **not** work, all tried:

- `--enable-features=ModelContext`, `ModelContextTesting`, `ModelContextSupplement`
- `--enable-blink-features=ModelContext` / `ModelContextTesting` — these are
  Blink IDL/class names that show up in `strings`, not runtime-feature names
- `--enable-webmcp-testing` as a bare switch
- navigating to `chrome://flags/` under Playwright — fails `ERR_INVALID_URL`
- `npx playwright install chrome` — Google publishes no stable Chrome for
  Linux ARM64. (Chrome *for Testing* does ship arm64, and Playwright may
  already have one under `~/.cache/ms-playwright/chromium-*/chrome-linux-arm64/`,
  but you do not need it.)

**`about:blank` returns `undefined`.** WebMCP requires a secure context, so
probe against `http://localhost:<port>` or an `https://` origin, never
`about:blank`. This one cost real time — it makes a working flag look broken.

## The API, as it actually behaves

Registration is what the docs describe, and what `src/webmcp/` already does:

```js
await document.modelContext.registerTool(
  { name, description, inputSchema, execute },
  { signal: controller.signal },   // abort to unregister
)
```

Calling back in as a test agent has two sharp edges a hand-written stub will
not reproduce:

```js
const tools = await document.modelContext.getTools()
const tool = tools.find((t) => t.name === 'list_books')   // pass the OBJECT
const raw = await document.modelContext.executeTool(tool, JSON.stringify(args))
const result = JSON.parse(raw)                            // JSON string back
```

1. `executeTool` takes the **registered tool object**, not its name. A name
   throws `TypeError: Failed to execute 'executeTool' on 'ModelContext': The
   provided value is not of type 'RegisteredTool'`.
2. Arguments go in as a **JSON string** and the result comes back as a **JSON
   string**. Passing a plain object throws `UnknownError: Failed to parse input
   arguments` — which reads like a schema-validation failure and sends you off
   auditing your `inputSchema` for nothing.

Inside the page, `execute` still receives a normal parsed object; the runtime
does the parsing. `getTools()` returns tools whose `inputSchema` is a
**string**, and whose prototype carries no own methods worth poking at.

## In this repo

`tests/e2e/webmcp-agent.spec.ts` sets the flag at file scope:

```ts
test.use({ launchOptions: { args: ['--enable-features=WebMCPTesting'] } })
```

`tests/e2e/reader-without-agent.spec.ts` deliberately omits it, because that is
the ordinary-browser case. Keep those apart: a file-level flag would make any
"no agent runtime" assertion silently vacuous.

## What this does not prove

It proves the tools register, validate, and execute against the genuine API.
It says nothing about how ChatGPT's in-app browser presents them, whether it
grants OPFS synchronous access handles, or how it phrases consent — see ADR
0003. Those still need the desktop check against the deployed site.
