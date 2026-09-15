# Agent Connect tutor integration

Started 2026-09-05. Development fork only. ADR 0006 records authorization.

Historical prototype record, superseded by
[native OpenClaw authorization and AI SDK](connect-your-ai-bookhand.md), ADR 0007
and its persistence/restore amendments. The runtime cards, earlier SDK artifact,
gateway endpoints and unfinished checklists below are dated evidence, not
current setup instructions. Current acceptance and merge authority are recorded
in [current work](current-work.md). Do not restart an old gateway to follow this
document.

## Scope and capability inventory

- Optional reader Tutor panel and selection-to-question action; manual reader,
  annotation, Search and Study unaffected without a gateway.
- SDK 0.0.3 from npm (verified published); shared existing WebMCP tool handlers,
  fixed definitions and book lifetime, cancellation propagation.
- User-supplied signed runtime card, HTTPS consent redirect/callback, same-book
  return with question/selection preserved, no automatic send.
- Streamed explanation, source-grounded Study artifact through existing tools,
  same-session follow-up; close/reopen panel preserves mounted conversation.
- Send/Stop, pending/error/reconnect states; reject overlapping sends; no
  automatic replay after unknown network failure, expiration or cancellation.
- Explicit new conversation and disconnect/revocation; no claim of transcript
  restoration after reload; untrusted transcript displayed without HTML execution.
- Pixel 7 first: one primary panel, reachable composer/controls, keyboard focus,
  existing light/dark/sepia palette; diagnostics outside Study.
- Local real-flow evidence separated from scripted model/provider fixtures.

## Validation contracts

### VAL-AC-TOOLS
Surface: library/browser.
Needs: SDK and existing Bookhand tools.
Behavior: SDK calls execute identical handlers/results, preserve source checks
and errors, pass cancellation, and reject calls after book lifetime ends.
Evidence: focused adapter regression tests and real tool execution on the page.
Exercise same-book reader rebuild and a pending call during exit. Bookhand binds
the original book commands, never delegates an old session to a new book. Already
committed effects are not rolled back by Stop; cooperative cancellation and
rejected subsequent dispatch are the guarantee, not transactional cancellation.

### VAL-AC-AUTH
Surface: browser.
Needs: HTTPS app and reachable user-owned gateway.
Behavior: connect discloses data/tool access, verifies card through SDK, handles
consent/denial and only matching callback state, returns to the same book and
draft without sending; failed or abandoned setup remains recoverable. Disconnect
clears local credentials and reports unsuccessful revocation honestly.
Evidence: callback/storage tests, real authorization trace with secrets omitted.
Authorization expiry requires renewed consent; lost/expired conversation requires
explicit new session using a valid app grant. Dispose alone is not revocation.
Check matching callback state before restoring a book or consuming credentials.

### VAL-AC-CHAT
Surface: browser.
Needs: connected SDK chat.
Behavior: selection stays attached to the intended question; streaming and Stop
are observable; empty/concurrent sends do not dispatch. Panel switches preserve
chat; book exit prevents late tools. Expiry/capacity/network failure show actionable
states, preserve visible text, never replay, and offer explicit fresh conversation.
Evidence: deterministic lifecycle tests plus browser interactions/network review.
Capture book id, exact range and quote at Ask tutor, before panel focus changes;
later DOM selections must not replace that attachment. Redirect preserves the
captured context and draft. A new explicit Ask tutor action replaces it visibly.

### VAL-AC-PHONE
Surface: browser.
Needs: running app, desktop and Pixel 7 viewport.
Behavior: select, open Tutor, connect, compose, send/stop, switch Study/Book and
return without horizontal overflow or inaccessible controls; existing themes
and keyboard focus work; tool logs never enter Study. Agent text cannot execute HTML.
Evidence: screenshots and actual UI actions at both viewports; physical Pixel
7 keyboard/lifecycle confirmation remains separate from emulation.

### VAL-AC-HERO
Surface: browser/real agent.
Needs: authorized reachable gateway and real agent; readable EPUB.
Behavior: select a passage, ask for explanation and saved useful Study material,
observe a source-linked artifact made through Bookhand tools, then ask a follow-up
whose answer demonstrates retained conversation. Saved work survives reload.
Evidence: real prompt/tool/continuation observations, artifact and screenshots,
reload check. Scripted responses or provider mocks cannot pass this assertion.
The follow-up must refer to the prior explanation without restating it; record
the created artifact identity and verify that same artifact after reload.

## Readiness and blockers

- Existing Playwright/browser tooling and local EPUB fixtures are available.
- Gateway health is reachable on the VM's existing tailnet HTTPS endpoint;
  provider authorization/readiness is not yet proven.
- Published SDK runtime Ajv compilation conflicts with no-eval CSP; resolved
  locally by upstream commit 9736495, pending a published fixed SDK version.
- Native WebMCP discovery is experimental; direct shared handlers avoid making
  the optional in-app tutor depend on it.
- No mission-runtime submit/advance tools are exposed in this session; use this
  persistent record and independent review lanes instead.

## Progress

Two sequential independent contract reviews completed; scope gaps resolved.
Work ownership: integration implementation owns all five assertions, followed
by independent scrutiny and real browser validation lanes; final gate requires
separate real-agent hero evidence or an explicit blocked verdict.

First implementation in progress: published SDK pinned, shared tool adapter,
Tutor connection/controller, selection action and separate responsive panel.
Browser readiness established with installed ARM64 Chromium and VM-compatible
no-sandbox launch. SDK Ajv CSP failure reproduced in actual browser (`EvalError`
even for a single trivial schema), not only inferred. Upstream is working on a
supported CSP-safe validator. Real-agent proof pending. Original
uncommitted docs cleanup is preserved. No pushes or deployments authorized.

Upstream supplied local SDK commit `9736495`; installed as the provenance-labelled
tarball in `vendor/`, not falsely treated as published npm 0.0.3. Its CSP-safe
interpreter remains fail-closed; unsupported multipleOf is absent from Bookhand
schemas. Fixed app-level HTTPS networking leaves a separate `script-src 'none';
connect-src 'none'` policy on the persistent EPUB frame, browser-checked after
chapter rendering. No generated-lab runtime is added by this integration.

Focused tests cover handler parity, signals, late results, same-book rerenders,
draft/attachment capture, continuation without transcript replay, owned callback
success/denial, invalid grants, disconnect/revocation failures and late connection
completion. Browser evidence so far: actual EPUB paragraph -> Ask tutor -> draft
-> Study -> Tutor preserves captured context; 412px has no horizontal overflow.
Screenshots were retained outside the repository for the development session.
Physical Pixel 7 keyboard behavior and real agent flow are not yet proven.

## Handoff: implementation ready for owner approval

The optional Tutor is implemented locally. The existing WebMCP registry stays
available; direct SDK lending excludes `open_book` so the mounted book owns the
conversation. Same-book catalog/Study recovery updates reuse the conversation
and current handlers without changing its authorized definitions. A real
definition change fails rather than silently widening the session.

Validated locally:

- Focused Tutor unit/component tests plus existing WebMCP handler and reader
  adapter regressions, TypeScript/build and lint. These include a scripted SDK
  provider and are **not** evidence of model-authored teaching.
- Actual tailnet-private built preview: EPUB
  selection, captured quote, compose, Study switch and return preserve context.
- Real SDK signed gateway challenge and authorization request succeed against
  a private gateway; all offered tool schemas reach the actual
  consent screen under the strict no-eval policy.
- **Deny**, through that real consent screen, returns to Calculus Made Easy,
  with one EPUB iframe still mounted and a visible authorization-denied error.
  No authorization was granted and no model prompt was sent.
- Final automatic callback handling was then exercised through real Deny:
  same book, draft preserved, one frame, pending transaction cleared, no extra
  finish button needed and no model prompt sent.
- The persistent reader's independent network restriction was exercised after
  section rendering. Desktop/412px screenshots collected; no horizontal overflow.
- Final 412x500 layout keeps the 44px Send control fully visible. Dark and sepia
  were applied through the real Text settings and paint Tutor coherently; draft
  survives those switches. Physical soft-keyboard behavior remains untested.

Evidence captures are in ignored `test-results/tutor-integration/`. Earlier
captures show intermediate layouts; `*-final.png` files show the final checks.

Redirect readiness includes a reading-state flush and SQLite close before
navigating. A cached page otherwise retained the writer during the browser
rehearsal. Restoring a disposed page from BFCache reloads it; cancelled/throwing
redirects after teardown also reload rather than leave a dead storage client.
Focused tests cover both cancellation-during-flush and navigation failure.

The local preview process was restarted to load its updated CSP header. A cached
old navigation response also retained the previous policy; browser validation
used a cache-disabled fresh page, not a policy bypass. Gateway config and the
judged deployment were untouched.

Remaining proof: Jose's normal gateway approval, then the complete real-agent
passage -> explanation -> source-linked Study artifact -> contextual follow-up
-> persisted artifact after reload. VAL-AC-HERO remains **pending**, not passed.
Actual Pixel 7 keyboard/lifecycle validation also remains pending. Do not reuse
judge credentials, publish the patched SDK, push or deploy without permission.

To continue: use a private preview, open a book, select a passage and Ask tutor.
Use the public runtime card supplied by the gateway operator.
Approve in the same browser's normal gateway flow; callback returns to that book
and never auto-sends. Ask for a useful saved example, then a follow-up referring
to the explanation without restating it. Record artifact identity and reload.
