# Bookhand plugin SDK migration — 2026-09-08

Branch: `work/bookhand-plugin-sdk`, based on local main `11f04cc`. Root/Jose
authorized bounded implementation; no live cutover, services, auth, consent,
Serve, merge or push. Preserve main and unrelated work. Source plan:
`/home/dev/agent-connect/docs/plan/plugin-sdk-bookhand-migration.md`.

## Settled ownership

SDK owns provider layouts, inner connection parsing/serialization, approved tool
hash/schema validation, history URLs/bounded wire parsing and error classes.
Bookhand owns versioned storage envelope, app origin, absolute grant cap, Web Lock
covering complete uncancelled refresh/save, CAS/rotation markers, connection and
book generations, exact-head association, cancellation and no replay. No tool
catalog, Tutor/Study UX or generation-protocol change. History expiry stays in
epoch milliseconds.

Approved exports: `parseOpenClawConnection`, `serializeOpenClawConnection`,
`getOpenClawConnectionProviderUrl`, `normalizeOpenClawProviderUrl`,
`createOpenClawConversationClient`, `OpenClawConversationUnavailableError` and
`OpenClawConversationDescriptor`/`OpenClawExecutionHistory`/
`OpenClawExecutionHistoryEntry`. Callback rediscovery uses verified transaction
`issuer`, never a reconstructed path or bare `providerOrigin`.

## Bounded acceptance

- `VAL-BH-PLUGIN-RECORD`: installed SDK parses both supported layouts, validates
  client/schema/hash, preserves expired-access-but-refreshable records. App
  envelope and absolute cap remain enforced; causes retained on parser failure.
  Existing two-store lock/rotation/abort/replacement tests remain applicable.
- `VAL-BH-PLUGIN-HISTORY`: actual SDK client with synthetic HTTP transport covers
  both layouts and bounded/malformed/unavailable vs recoverable responses. App
  guards before authorization and after awaits fence disconnected/replaced
  connections. Same-book/head matching and no replay remain unchanged.
- `VAL-BH-PLUGIN-URL`: preferences and saved connections retain supported plugin
  address; callback rediscovery uses issuer. No hardcoded provider path logic in
  application source, and no silent consent widening.
- `VAL-BH-PLUGIN-CSP`: exact hash/provenance/patch package check, fresh production
  build and phone-width Chromium strict-CSP import with blocked-eval control.
  Isolated test browser only, no live provider/owner context.

## Status

Implementation complete against approved SDK source
`e3fa090809e1197dac4a7347a6f48c78240bef44`, SHA-256
`ccd489d55189df32654c3e3bf2dc667ee65545d4d0d453f52eff7cbbfb128480`.
Root reports completed source review, SDK tests/typecheck/build/external package
smoke, and real installed stock-plugin composition PASS on Node 24.15. This is
upstream evidence, not a Bookhand live OAuth test. Final vendor filename is
`open-agent-connect-web-0.0.3-e3fa090.tgz`; bytes are unchanged from the tested
candidate. Root reviewed/approved Bookhand's migration including the dispatch
guard and authorized a local branch commit. Candidate superseded provisional
`94a58b5`, preserved in ignored `artifacts/local-archive/2026-09-08/`.
No invented export stubs or local SDK rebuild used to simulate delivery.

Fresh candidate evidence:

- Package exports/hash/unchanged continuation patch check passes.
- Connection/history tests: 37/37 pass, actual installed SDK with synthetic HTTP.
  Both layouts, issuer-based rediscovery, SDK error identity/cause and bounded
  projection covered. No raw provider route/parser duplication remains in app.
- Persistence, Tutor conversation and Tutor panel test files pass, including
  both-layout persisted SDK connection restore, absolute cap, parser causes,
  full rotation transaction and same-book/no-replay behavior.
- Production build (including TypeScript), lint and bundle verification pass.
- `verify:csp -- --phone` passes: 412×915 touch/mobile Chromium; blocked-eval
  control detected; actual production Library initializes with zero CSP
  violations, page errors or external requests.

Independent review found an extra await between token resolution and SDK fetch.
The app now guards generation/abort synchronously in the injected fetch adapter;
review confirmed closure and a deterministic disconnect-at-await-gap test proves
no request dispatch. The initial pre-artifact persisted-plugin coverage gap is
also closed by the actual-package restore tests, not preferences alone.

No Bookhand live plugin OAuth, owner-device acceptance, model/tool replay or
full-suite claim. The local commit is authorized; no merge, push or live cutover.
Final filename/provenance changes require only package-lock/reference/hash
verification, not rerunning the unchanged build/browser matrix.
Final package/export/hash/patch check passed; manifest and both lockfile references
agree with the renamed artifact, including its SHA-512 lock integrity. Whitespace
check passed. No broad suite was rerun for this byte-identical rename.
