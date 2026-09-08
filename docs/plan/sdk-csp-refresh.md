# Bounded SDK CSP refresh — 2026-09-08

Jose/Agent Connect root authorized a local-main vendor refresh, not publication,
deployment, service/auth changes or live model calls. Source is merged AC
`3cc49ec32981553faa01729e0e2cee6cdea39dd4`, including CSP fix `90b4e75`.
No tool declarations, conversation semantics or consent associations change.

## Acceptance

`VAL-BH-SDK-CSP-IMPORT`: Surface: installed package and real production Chromium
page. Needs: supplied hash-verified tarball, aligned Zod 4.4.3, unchanged pinned
Open Responses patch, fresh production build. Behavior: package bootstrap sets
shared Zod jitless mode and is retained through Vite; actual application imports
and initializes under unchanged strict CSP without eval violations. Evidence:
installed version/hash/patch checks, build and isolated `verify:csp` run, with a
blocked-eval negative control proving CSP observation is active. No CDP-evaluated
application import, no provider request, no external network or user context.

Scope: dependency packaging only. Previous search/navigation/timeouts remain
open; this check is not live-agent, mobile restoration or full browser-suite
acceptance. Existing preview processes and root's upstream environment untouched.

## Outcome

PASS: supplied tarball hash verified; clean locked `npm ci` applies the unchanged
continuation patch; installed SDK export/hash/patch/jitless/side-effect checks
pass. `npm ls zod --all` shows one deduplicated 4.4.3 across SDK, AI SDK and app.
Production build (including TypeScript), bundle verification and lint pass.
Focused WebMCP-tool and Tutor-conversation unit files pass. Fresh Chromium
`verify:csp` detects the negative-control eval violation and then observes zero
CSP violations, page errors or off-origin requests while the production app
imports and the Library/All books surface initializes. The command is included
in `npm run verify` for future commit-boundary checks.

Validated production entry: `index-DBS8mElX.js`, SHA-256
`3243e078fd36caeb20c1b6550f057baa37808d6c5c9a81925ddbb000a5893f69`.
The minified entry retains the `jitless:!0` initialization; runtime evidence above
is the primary oracle, not a string scan alone.

Independent bounded contract/oracle/package review found no blocker. This is
not a full unit/E2E rerun or live provider proof. No managed service was started
or changed: the CSP verifier owns an ephemeral loopback fixture and disposable
browser, closing both on exit. No CSP policy was relaxed.

The former cf3b3d1 tarball remains tracked as historical bytes,
not an active dependency; the older 9736495 artifact remains in its ignored
local archive. No cleanup deletion is needed for this bounded refresh.
