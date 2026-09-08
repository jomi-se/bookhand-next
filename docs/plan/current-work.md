# Current work

Documentation triage updated: 2026-09-05.

## Current checkpoint: main merged, cleanup complete (2026-09-08)

Local checkout is on `main` at integration commit
`ea3b18e31993adbf74e2778f6c30880fddefd055`; clean before this docs-only update.
Agent Connect root reports the authorized fast-forward and removal of merged
`work/bookhand-plugin-sdk` and `work/openclaw-tutor-demo` branches. The migration
and packaging sections below preserve historical evidence, not pending merge
instructions or current branch names.

Root also reports that `feat/document-remaster` was already an ancestor of main.
Its checkout, including the unique untracked review, was preserved intact at
`artifacts/local-archive/2026-09-08/bookhand-remaster/`; `.git` was renamed to
`.git.archived`, then worktree registration and merged branch were removed.
This ledger pass verified that archive directory and `.git.archived` exist;
the intact-content/no-data-loss assertion is root's cleanup report, not a new
file-by-file audit. Do not treat the archive as an active Git worktree.

Root reports origin remains `bookhand-next` and the judged original is unchanged.
Live OpenClaw was relocated: plugin health passes at the same provider URL
`https://artifex-box.tail246db1.ts.net/agent-connect`, grants preserved, but old
conversation heads were reset by the restart. This is upstream runtime evidence;
no health/auth/model call was made for this ledger update. Retained authorization
does not imply old conversations can continue; use the existing unavailable-head
handling and explicit fresh conversation, never replay prior prompts or tools.

Previously verified Bookhand `:8445` serves byte-identical `ea3b18e` assets with
strict CSP. Known search/navigation/timeout defects and owner-evidence limits
remain unchanged. This update runs no tests, changes no services and pushes
nothing; only the current-work ledger is committed.

## Historical: plugin SDK migration approved for local commit (2026-09-08)

Agent Connect root authorized bounded consumer decoupling, not live cutover.
Checkout inspected clean on `main` at `11f04cc`. Upstream plan:
`/home/dev/agent-connect/docs/plan/plugin-sdk-bookhand-migration.md`, following
plugin-host `1b8b67a`. Root approved exact SDK signatures; source migration is
complete against approved SDK source `e3fa090809e1197dac4a7347a6f48c78240bef44`,
with byte-identical hash `ccd489d…` to the tested candidate. Root reports real
installed stock-plugin composition PASS on Node 24.15 and approves this migration
diff, including the dispatch guard. [Exact evidence](plugin-sdk-migration.md).
Root authorized branch `work/bookhand-plugin-sdk`; preparation and subsequent
migration work live there. Local main remains at `11f04cc`; no extra worktree.

Migration ownership: replace route/fetch/parser duplication in
`src/ai/conversation-history.ts` and `connection.ts` with SDK history client;
delegate inner record/schema/hash validation in `connection-persistence.ts`;
use SDK provider URL helpers and transaction issuer for callback rediscovery.
Keep app envelope/origin checks, absolute grant cap, full rotation lock/CAS,
markers, cancellation, connection/book generations, catalog and no replay.

Contract checkpoint resolved by root: history `expiresAt` is epoch milliseconds
(`Date.now()` plus TTL milliseconds); the upstream plan's seconds wording was
corrected. Preserve existing units, with no conversion or magnitude inference.
SDK unavailable error must retain the fresh-vs-recoverable
distinction without changing existing restore behavior.

Focused installed-SDK connection/persistence/history/restore tests for both
provider layouts and phone-width production strict-CSP smoke completed. No
model/auth/consent replay, service/Serve, merge or push changes. No validation
against old SDK bytes or invented exports. Candidate connection/
history tests (37/37), persistence, Tutor core/panel, package/patch check, build,
lint, bundle and phone-width strict-CSP import pass. Independent review's
token-to-fetch await gap is closed with a synchronous dispatch guard and focused
regression. These are deterministic local checks, not live plugin OAuth proof.
Root authorized the bounded local commit; no merge or push. Filename/provenance
finalization leaves SDK bytes unchanged; only package/hash/reference checks are
repeated. Local main remains untouched.

## Local main merged; bounded CSP dependency refresh (2026-09-08)

Root authorized the fast-forward and local main reached `7c74142`; integration
branch preserved. The obsolete 9736495 SDK tarball is now in ignored
`artifacts/local-archive/2026-09-08/`, checksum unchanged. The earlier packaging
sections below are historical, not an outstanding merge authorization request.

Root subsequently supplied AC `3cc49ec` with the strict-CSP Zod import fix.
[SDK CSP refresh](sdk-csp-refresh.md) records bounded package/build/production
browser verification. No tool catalog, conversation or consent change, no live
model calls, services or push. Known defects and owner-evidence limits remain.

## Local integration packaging, awaiting root merge approval (2026-09-08)

Jose confirms connection and contextual follow-up work and requests reviewed
local integration commits. [Merge readiness](bookhand-merge-readiness.md)
tracks exact ownership/commit splits and checks. General flow confirmation does
not pass every automatic reload/New-conversation acceptance scenario. Earlier
credential reload and saved-Study reload/source-link confirmations retain their
own specific evidence; new automatic conversation restore remains separately
fixture-validated unless the owner reports that exact flow.

[Unstable search anchors, navigation and timeout reporting](../issues/tutor-search-navigation.md)
are **OPEN** defects, not solved by this integration. No pending indexing code
was found or folded into this packaging. Main merge requires root's next go-ahead;
no push, service/auth/Serve change or live mutation/model replay is authorized.

Packaging checks pass: lint, typecheck, full unit suite, build, bundle, installed
SDK/patch and setup verification. Independent qualitative review found no merge
blocker; two non-blocking provider-address/schema-clarity follow-ups are recorded
in the readiness note. The ideas cleanup is a separate commit; the obsolete SDK
tarball remains untracked and preserved. These are local integration commits,
not a merge or deployment.

## Implemented locally: automatic last Tutor conversation (2026-09-08)

Jose authorized minimal automatic restore, not a picker. Backend contract is
Agent Connect 97c69d6; [bounded plan](tutor-last-conversation.md) and ADR 0007
amendment capture tab-local same-book/same-authorization head matching,
provider-owned history, active-head locking and no replay. Two sequential
contract reviews complete; bounded port/core/UI implementation finished. No SDK
architecture change or tool-catalog change: this feature does not itself require
fresh consent (the earlier tool-description changes still do).

Combined focused checks pass for connection, credential persistence, history
parser, Tutor conversation, Tutor panel and app OAuth return; production build
and focused lint passed. Independent lifecycle/lease review found no remaining
blocker. The tests use synthetic history/model transport and real installed AI
SDK; no live history/model acceptance is claimed. Tutor core is now 28/28 with
explicit different-book/scope, absent/expired/pending/changed-head fresh outcomes
and late history after disposal covered. Final UI truncation copy says some
history was omitted, without claiming which messages were clipped. Parent final
core/panel regression and rebuilt production artifact both passed.

Read-only HTTPS fetch verifies :8445 serves the byte-identical local asset
index-DiXsiEfF.js, SHA-256
80dc4f9a56bbc44cee368684d4a237d3da6dd1d5738eec86f8e32fde62615516.
No owner browser reload, live model/tool replay, proxy restart, service/Serve
change, commit, merge or push. Root must coordinate proxy readiness/live smoke.
Use a completed turn on this build before reloading: pre-feature conversations
have no known book association and are deliberately not guessed from a list.

## Tool-description follow-up (2026-09-08)

Implemented plain-language exclusive/dependent-field guidance directly in tool
descriptions: navigate_book, open_book, focus_passage, set_reading_style,
set_study_board_view, create_study_lesson and upsert_study_item. Navigation
explicitly requires ONE selector with all others omitted, not empty placeholders.
Minimal JSON examples are included; search_book distinguishes index unavailable
from no matches and warns that partial results are not exhaustive. Schemas,
runtime validation, call shapes and consent binding are unchanged.

Focused tool/library/connection tests, example validation through the installed
SDK, focused lint, diff whitespace check and production build passed. Read-only
HTTPS verification on :8445 serves index-khtm_nof.js matching the local asset:
SHA-256 59ec59bfd55f64503fb90da79e660009d0c715f0b6a8a4a8417e8a641faa8574.
This is served-artifact evidence, not a live model smoke. Descriptions participate
in exact approved catalog equality, so existing Tutor grants need fresh consent;
no automatic catalog expansion. No owner browser reload, consent, model calls,
mutation replay, service changes, commit, merge or push performed.

Agent Connect root now owns a conversation-history/reopening API implementation;
it is no longer deferred upstream. Bookhand conversation UI remains gated on the
validated contract handoff. Preserve existing dirty work; no UI work started.

## Accepted follow-up: scoped connection persistence (2026-09-07)

Jose requests credential reload persistence and remembered provider preferences.
Amended ADR 0007 and [the bounded persistence contract](ai-connection-persistence.md)
supersede the previous memory-only choice. Implementation must hold the origin
Web Lock through uncancelled refresh/save, fail closed on orphan rotation, and
preserve exact approved declarations. No chat/task replay or live consent work.
Jose reports the saved lesson survives reload and its source link works.

Persistence implemented and focused checks passed: 26 connection tests plus
Tutor-panel/App-return checks; focused lint and TypeScript/build clean. Writer-tab
refresh failures explicitly clear their own connection, guarded by persistent
identity; no reliance on self storage events. Disconnect/resync and stale
cross-tab callback races are covered. Detailed evidence and local build hash are
in the persistence contract. No live model, consent, browser reload, service
restart, push or deployment was performed by this implementation lane.

Owner acceptance, relayed by Agent Connect Astra: Jose confirms the connection
works after a phone reload without re-entering the provider address or repeating
consent. Saved Study lesson persistence and source-link navigation are also
owner-confirmed. This is real owner reload evidence, separate from deterministic
refresh/rotation tests; it does not establish that a token refresh occurred.
One initial attempt failed before a later success. Jose explicitly requests no
investigation now; its cause remains unknown. Root is closing vertical-slice
acceptance. Review/commit packaging is a separate follow-up, with no permission
to sweep unrelated dirty work into a commit.

## Implementation history: native OpenClaw auth and AI SDK (2026-09-06)

Bounded follow-up: reported standalone prose rejection is confirmed as a
declaration/runtime mismatch: `upsert_study_item` advertises foreign-kind fields
that `toPayload` rejects. Close each discriminator's schema without widening
runtime acceptance or changing flat call shape. Validate the exposed schema
through the installed SDK and existing page validator using fixtures only.
The changed catalog requires fresh owner consent; never bypass snapshot equality.
Native-normalizer limitation verified offline against the pinned OpenClaw
`packages/ai/src/providers/agent-tools-parameter-schema.ts` and
`openai-tool-schema.ts`: both normal and strict outputs flatten the new closed
branches into all 17 properties, `required: ["kind"]`,
`additionalProperties: true`, and no `oneOf` or field dependencies. Therefore
the local closure fix is NOT model-visible closure through this provider. Keep
actionable descriptions and runtime rejection; no custom protocol or broad
schema rewrite is authorized. Probe executed source only, no model/tool writes.
Transport diagnostics are a separate bounded follow-up: preserve the original
Error/cause identity in conversation memory only, with bounded allowlisted UI
diagnostics, never raw error serialization/logging. Warn that interrupted tool
turns may already have saved changes; no retry/checkpoint policy changes.
Jose switched from the phone browser to Termux during the failed turn. This is
context, not proof of suspension/network causality; add no visibility-change
cancellation. A later successful lesson/follow-up is owner-reported, not an
independent stored-content check. Subsequent owner acceptance confirmed the saved
lesson survives reload and its source link returns to the passage. Do not
reload or reauthorize Jose's active context on his behalf.

Follow-up implemented: closed local standalone-block schemas plus explicit
kind/field guidance; 36 tool tests and typecheck pass. Conversation now retains
the original failure/cause tree privately through `getFailureCause()`, with
bounded allowlisted diagnostics rendered separately and possible-tool-effects
warnings. No raw logging/persistence/export or replay changes. Focused Tutor
tests: 22 passed, including one error-result tool followed by HTTP 200 body-read
failure, nested TypeError identity, secret exclusion and no replay. This fixture
does not prove a successful mutation; the owner accepted that bounded evidence.
Production build passed and read-only HTTPS fetch confirmed `:8445` serves the
byte-identical local asset `index-CbI9_QXO.js`, SHA-256
`bd728bcfefd931878239621e4026c4256145f82a5dfd16a9a01a1bb3368bf782`.
No browser reload, consent, live tool invocation or service changes were made.

The previous runtime-card/custom AgentChat replacement demo is superseded for
new integration work. Current ownership, mapping and interface questions are in
[`connect-your-ai-bookhand.md`](connect-your-ai-bookhand.md). Parent owns design,
integration review and failure diagnosis; authorized Sol high-effort lanes own
bounded edits against the now-validated `cf3b3d1` SDK artifact and required
Open Responses continuation patch. Package, shared-connection, conversation and
UI/wiring lanes are active under ADR 0007. Existing dirty work is preserved. No
live services, credentials, Serve, push or publication changes authorized.

Current local evidence: packaged dependency clean-install/export/continuation
checks pass, as do integration typecheck and focused connection/conversation
unit suites. The latter exercise the installed AI SDK against deterministic
response fixtures, including partial-stream EOF without replay; they are not
native provider or model evidence. Bounded independent shared-auth review is
clear after fixes for stale returned intent, expiry during callback claiming,
and malformed-state dismissal. App callback-recovery fixtures also pass.
Disconnected production-build browser smoke passed at desktop and 412×915:
real EPUB selection, draft/address/attachment retained across panel reopen,
controls visible, no horizontal overflow, strict CSP and no console/page errors.
Screenshots: ignored `artifacts/tutor-disconnected-smoke-20260906/`.
Broad unit run: 514 passed, one failed: the reader-Foliate Section 23 workload
deadline measured 18.14s against a 15s bound. Broad-suite success is not claimed
and baseline causality has not been established. Full log:
`/tmp/bookhand-command-logs/quiet-run.ZsvzyC.log`.
The same workload test passed on a focused isolated rerun; this suggests load
sensitivity but does not establish the cause or turn the broad run green.
The live native-auth,
source-linked Study hero remains unproven pending upstream runtime readiness.

## Previous checkpoint: separate-gateway Tutor demo preparation

This existing checkout is now on `work/openclaw-tutor-demo`, starting at
`2c36f33`; pending Tutor implementation and unrelated edits remain intact.
`main` has not moved. The runtime-neutral integration is the intended real
Agent Connect demo instead of Canvas. Scope, reviewed acceptance, intent-only
prompts and current evidence are in
[`openclaw-tutor-demo.md`](openclaw-tutor-demo.md).

No SDK API change is currently required. Actual subscription-backed testing is
blocked on the Agent Connect instance supplying an isolated runtime/card after
José selects its execution loop. Do not reuse the old personal gateway/card or
restart `agc`. No push, public deployment, credentials, or CSP changes authorized;
ordinary local Bookhand preview rebuild/restart is allowed.

## Development-fork handoff

Remaining root brainstorming is indexed in
[`../ideas/README.md`](../ideas/README.md); these are not accepted implementation
plans. The shipped remastering proposal and old handwritten defect reports were
removed at the user's request. Code inspection found fixes for the main reports;
no remaining runtime defect was confirmed during this documentation pass. Track
fresh reproductions if problems recur rather than revive speculative backlog.

Standalone EPUB restoration work lives in `/home/dev/epub-remaster`. This checkout
tracks `bookhand-next`; leave the judged Bookhand repository and deployment
unchanged. Agent Connect integration is now authorized under ADR 0006; current
scope, validation requirements and progress live in
[`agent-connect-tutor.md`](agent-connect-tutor.md). Ask Jose before any git push;
no publishing or deployment is authorized.

The execution notes below are the **2026-09-03 pre-submission snapshot**. Their
deployment/recording instructions and runtime counts are historical, not current
authorization to alter the submitted project.

## Next executable wave

Deploy and exercise the combined **tutor + document remaster + composed Study**
surface through ChatGPT Desktop. The local runtime now has twenty-three tools. The
highest-value engineering continuation is W9's bounded temporary explanation
and direct Study reveal; the highest-value owner action is an intent-only model
run that proves the agent discovers the six remaster tools, reads actual XHTML,
rewrites one chapter, and leaves the person able to compare, Undo, Reset, and
reload the result.

The exact morning preflight, intent-only prompts, fallback prompts, and 2:45
shot order are in `docs/submission/demo-runbook.md`.

The final broad Impeccable review is complete. Its submission-critical findings
have been implemented locally; after this lands, stop opening new general review
cycles. Validate the deployed product with the real model, fix only defects that
the run exposes, then record and submit.

The owner-visible **ChatGPT Desktop smoke** remains required after the next
deployment. It must confirm the model discovers and uses the shipped tools from
intent-only prompts; deterministic Playwright evidence proves the application
contract, not model-authored behavior.

The judging build now seeds three checksum-pinned public-domain restoration
corpora through the ordinary library path: *Calculus Made Easy* for the primary
tutor/remaster story, Einstein's *Relativity* for pervasive image-based math,
and *Flatland* for legacy document structure and illustrations. All are marked
for removal after judging.

## Active product direction

Bookhand is a local-first EPUB reader and page-owned WebMCP study environment.
The active polish mission now distinguishes:

- **Study:** durable, coherent learner-owned lessons and annotations.
- **Tutor guidance:** transient attention that can search, point, explain,
  reveal, Back, and Stop without creating permanent content implicitly.
- **Document remaster:** agent-authored restoration of the EPUB document
  itself, with original bytes preserved and recovery controlled by the reader.
- **Agent diagnostics:** separate observability. Raw tool names, calls, and logs
  have no place in Study; only compact semantic status for an active tutoring
  action belongs near the learning surface.

This direction is recorded in:

- `docs/product-north-star.md`
- `docs/reviews/2026-09-02-study-platform-synthesis.md`
- `docs/plan/study-surface-and-tutor-layer-proposal.md`
- `docs/plan/polish-and-showcase-mission.md`

## Current implementation truth

- Slices 1 through 3 are implemented: local library/import, Foliate EPUB
  reading, SQLite WASM persistence, highlights/notes, the native Study board,
  and genuine `document.modelContext` registration.
- Deployed commit `bf7b2f0` exposes twenty-one open-book tools. The current
  local runtime exposes twenty-three: the deployed set plus atomic
  `create_study_lesson` and summary-only `list_study_lessons`. Deployment truth
  must remain separate until this change is pushed and verified.
- W0 through W3 are implemented: runtime design-context discovery, source and
  persistence trust, shared observable style/board state, and the mobile/desktop
  reader reset.
- W4 is implemented: runtime design guidance is derived from a canonical
  capability manifest and versioned with it; WebMCP handlers defensively reject
  invalid calls and preserve actionable structured success/failure results.
- Passage extraction now covers image-only visibility, MathML `aria-label`,
  figure-only semantic CFI round trips, and mixed math. A real bundled-book
  Foliate regression proves Fig. 52 keeps its description, caption, typed
  figure/math segments, `AB`, `x`, `P`, `Q`, `OM=x_1`, and `PM=y_1`.
- Source-linked records use bounded typed canonical excerpts. Legacy derived
  records and resolved excerpts from older extraction versions repair lazily
  without a learner edit/revision; authored text remains unchanged; unresolved
  records preserve their display and expose Retry and Relink. Source-bearing
  migration and browser reload persistence are covered. ADR 0004 fixes and a
  regression proves the non-destructive deduplication policy.
- Source-linked mutations verify current book, range, fingerprint, and quote.
  Agent-created item updates use ownership tokens, retry idempotency, revisions,
  provenance, and per-item Undo.
- A first-class titled lesson now stores one ordered native-block composition
  atomically in schema v6, with stable lesson/block IDs, source verification,
  provenance, and retry idempotency. Lessons render as semantic articles;
  legacy single blocks remain separately under Notes rather than masquerading
  as lessons through action-group metadata.
- Study equations compile through the bounded native MathML renderer, with
  unsupported notation kept visibly as code rather than disappearing. Storage
  delimiters in lesson blocks and saved highlight quotations use the same safe
  inline MathML path instead of leaking raw TeX. Storage type labels no longer
  outrank the lesson, existing content comes before one
  progressively disclosed manual-authoring path, and raw Agent Activity is no
  longer part of Study.
- An initial Study-load failure is visible and retryable without unregistering
  the reading/search/style/tutor tool surface. Independent Study streams retain
  successful lesson, block, or annotation data when another stream fails.
  Expanded desktop gives Study the primary 48rem reading measure and keeps the
  book as a narrow reference; compact Study is a full surface with an explicit
  route back to the book. Recoverable removal, lesson updates, safe plots, and
  richer per-block source relationships remain open W7 work.
- `focus_passage` now draws a production transient cue over exact verified
  words. Precise ranges become one composed highlight, underline, or outline;
  broad ranges become a bounded tonal wash and accent rule instead of dozens of
  fragment boxes. It briefly settles into place, respects reduced motion,
  coexists with durable marks, and clears through the W6 session lifecycle.
  The preferred input accepts Bookhand's returned `range` envelope unchanged,
  while legacy flattened calls remain valid. Search hits expose the same
  reusable envelope. Direct Study reveal and a temporary anchored explanation
  remain open.
- W5 is implemented locally: canonical Foliate chunks feed a schema-v4,
  worker-owned FTS5 index with transactional batches, truthful lifecycle state,
  cancellation, resume, failure recovery, and book/version isolation. Ordinary
  Search exposes a bounded 1–10 result limit; genuine `search_book` returns
  structured availability, outcomes, exact source envelopes, and never moves
  the reader. This makes thirteen open-book tools after deployment.
- W6 is implemented in `d9f204d`: source-verified `focus_passage`, Back and
  Stop, one origin-aware transient session, learner takeover, anchored reading
  persistence, serialized navigation, stalled-view recovery, and a dedicated
  tutor-overlay identifier space that cannot replace durable annotations.
  W9 now supplies the production cue; anchored explanation remains open.
- Document remaster is implemented through six genuine WebMCP tools. An agent
  reads current package-relative XHTML/CSS, diagnoses it without heuristic
  classification, rewrites the complete section through Foliate's own loader,
  makes small fingerprinted exact edits without returning the whole chapter,
  or optionally compiles publisher-supplied `data-tex` to MathML. Exact-edit
  batches are serialized, all-or-nothing revisions and preserve the existing
  agent stylesheet when omitted. Publisher bytes remain immutable;
  Original/Rewritten, Undo, and Reset are visible. The persistent-frame build
  patch rebinds Foliate's private body measurement range before each pagination
  pass. Version toggles retain the nearest logical TOC fragment inside
  monolithic spine files and perform one final pagination after bounded local
  image/font settling, preventing blank pages and jumps to an unrelated start.
- Schema v5 persists bounded sanitized rewrite history before it is shown and
  hydrates it before Foliate's first render. Markup, CSS, summary, Undo, and
  Reset survive reload. Reindexing, EPUB export, and annotation re-anchoring do
  not exist and must not be claimed.
- The final product audit fixes are local: named themes now paint shell, EPUB,
  overscroll canvas, and mathematical image treatment from one synchronous
  palette; Search receives focus and meets the 44px target floor; Study opens at
  the lesson top without mobile question bleed; and remastering is presented as
  a reader-controlled advisory with truthful sanitizer feedback, visible
  Original/Rewritten state, and reachable mobile controls. The source audit is
  `docs/reviews/2026-09-03-full-product-impeccable-audit.md`.

## Accepted remaining topology

- W4: complete — runtime/tool truth and canonical source lifecycle.
- W5: complete and deployed — local lexical retrieval and `search_book`.
- W6: complete — shared origin-aware navigation, navigation-only
  `focus_passage`, and the non-persistent tutor-session core.
- W7: partial — native safe math plus the focused first-class titled lesson
  create/list lifecycle have landed atomically; updates, safe plots, richer
  block types/sources, and recoverable removal remain.
- W8: focused rescue landed — diagnostics separation, lesson-first semantic
  composition, visible partial-load recovery, and distinct docked, expanded,
  and compact layouts are implemented. Broader workspace refinement remains an
  iterative quality wave rather than a missing data-model foundation.
- W9: partial — production source cue presentation is complete; Study reveal
  and a bounded temporary explanation remain.
- W10: combined real-model hero and evidence closure.
- W11: repeated composition-quality evaluation showing worst and best outputs.

The contracts under `docs/contracts/polish/` define acceptance. The original
W4-through-W11 topology received two sequential reviews on 2026-09-02. Later
runtime evidence exposed additional tutor-navigation races; the amended W6/W9
contracts then received three sequential passes, with findings incorporated
after the first two and a clean third verdict. The amendment is frozen and W6
passed implementation scrutiny plus real-surface validation. The
document-remaster slice now takes priority before the remaining
lesson-composition waves because it is the strongest new WebMCP-specific
demonstration; W7 through W11 remain recorded rather than discarded.

## Submission state

The WebMCP Challenge closes 2026-09-03T20:00Z.

- Live surface: https://bookhand.jomi-se.workers.dev/
- ADR 0005 replaces Foliate's blocked per-section `blob:` iframe navigation
  with one persistent same-origin frame. Focused production tests prove frame
  identity across Chapter X to XI to X, offline navigation, remaster reload,
  keyboard paging, and hostile-book containment. Confirm the deployed build in
  a fresh ChatGPT browser tab before recording.
- Deployed commit `bf7b2f0` was verified with persistent browser storage,
  twenty-one genuine WebMCP tools, `search_book` reaching `ready / results` with
  corpus-derived hits, the document-remaster tools present, reload survival,
  and no observed page, console, request, or off-origin errors.
- Cloudflare Workers Builds deploys pushes to `main`.
- `LICENSE` is committed. Making the GitHub repository public and attaching the
  final domain are owner actions.
- A public YouTube demo under three minutes with audio is still required.
- Final judged-surface evidence requires the compatible ChatGPT Desktop app and
  a named real model; deterministic Playwright WebMCP tests prove plumbing, not
  model-authored teaching quality.

## Verification and handoff notes

- Use `npm run build && npm run preview`; development CSP intentionally makes
  `npm run dev` unsuitable.
- Use `scripts/quiet-run.sh` for routine checks and preserve validation evidence
  under ignored `artifacts/validation/polish/<commit>/`.
- W4 passed independent post-fix scrutiny for WebMCP boundaries, real-Foliate
  math/figure meaning, canonical-source migration/repair, and genuine browser
  persistence. The separate real-surface lane also passed design-context and
  WebMCP runtime checks.
- W5 passed independent scrutiny, the complete two-book frozen oracle, 288
  unit/component checks (the real-book timing guard passed unchanged when run
  without competing browser work), production build and bundle-exclusion
  checks, the complete production Playwright suite, and the dedicated secure
  lifecycle harness. Browser evidence covers genuine WebMCP ready/partial/
  unavailable states, cancellation and reopen, injected transactional failure,
  repeated Retry coalescing, explicit result navigation, non-navigation on
  search alone, and narrow-panel containment with no console/page errors or
  off-origin requests.
- W6 passed independent source scrutiny, focused unit suites, typecheck, lint,
  production build and bundle exclusion, the complete 33-test production
  Playwright suite, and separate desktop/compact/production browser validation.
  Evidence covers focus supersession, learner links, Back/Stop, reload
  anchoring, style persistence, stalled-navigation recovery, 44px compact
  controls, and same-range durable/tutor overlay isolation. The unchanged
  real-book timing guard passed alone after one resource-contended full run.
- Document remaster passes its sanitizer/compiler/source-path units and four
  production-browser scenarios: free-form rewrite, deterministic MathML
  shortcut, compact 44px controls, and persistent rewrite + persistent Reset
  across full reload. Schema-v5 migration, bounded history, cross-book
  isolation, worker request/result validation, refused-write truth, and
  first-render hydration are covered. The combined post-merge typecheck, lint,
  targeted units, production build, remaster browser, and Study/WebMCP browser
  suites pass.
- The focused W7/W8 lesson rescue passes schema-v6 migration, protocol
  rejection, atomic rollback, conflicting retry, source-handshake, partial-load,
  and genuine WebMCP create/list/reload coverage. Production screenshots cover
  docked and expanded desktop plus 390px and 320px light, dark, and sepia Study;
  compact tests assert no horizontal overflow and 44px Book, source, and answer
  controls. This evidence closes only `VAL-STUDY-LESSON-CORE`, not the broader
  experience-update, safe-removal, or plot contracts.
- Fingerprinted surgical remaster editing adds focused ordered/missing/
  ambiguous/stale/concurrent/CSS-preservation units and a genuine production
  WebMCP browser flow covering targeted rendering, atomic rejection, reload,
  and one-step Undo. It remains local until pushed and checked on the deployed
  origin.
- The production tutor cue passes typed/schema validation, exact verified-range
  resolution, bounded composed rendering for both browser `DOMRectList` and
  array-shaped test geometry, durable-highlight coexistence, transient cleanup,
  reduced-motion behavior, and the real Chromium guidance flow. The actual
  bundled-book browser surface confirms the broad visible range renders four
  marks total rather than per-fragment boxes. The existing reload/style timing
  guard passed alone after one resource-contended combined run.
- Final live-demo blockers now have focused regressions: `open_book` waits for
  the first readable section before returning success; WebMCP remaster writes
  persist without replacing the mounted Foliate frame and wait for the person
  to select Rewritten; remastered documents cannot impose fixed page geometry, hidden
  overflow, mid-word display breaks, or poster-sized headings; desktop text
  size controls are visible; and Left/Right plus PageUp/PageDown page the book
  even after reader chrome receives focus. The focused remaster and ordinary
  desktop browser flows pass against the production build.
- The chapter-remaster provenance strip can collapse to one quiet, session-only
  disclosure without changing the selected version or its history.
- Page layout is a persisted reader preference with Auto, Single, and Spread
  controls in Text and the same bounded `set_reading_style` field for agents;
  compact/coarse-pointer reading remains single-column.
- Text zoom scales the reader root, so repaired chapters cannot strand rem-based
  headings or native MathML at a fixed size.
- Original, Rewritten, Undo, and Reset now update the mounted section in place
  and ask Foliate to repaginate. They never replace the reader or trigger a new
  post-load `blob:` iframe navigation, which the ChatGPT/Codex browser blocks.
- The bundled *Calculus Made Easy* is judging content, not a permanent product
  dependency.
- Keep embeddings optional and after lexical retrieval.
- Do not add arbitrary generated code to the reader or Study. The current rich
  path is trusted native rendering from bounded declarative data.
- Physical Pixel validation is non-gating under ADR 0003; ChatGPT Desktop is
  the owner-only judged surface for the real-model hero.
- Update this file whenever completion changes the next executable wave.
