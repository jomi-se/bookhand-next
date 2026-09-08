# Connect your AI: Bookhand integration ownership

Started: 2026-09-06. Implementation packaged for local merge review, 2026-09-08.
Validated SDK handoff: `cf3b3d1adc1f546bdc6786f243bcf059821366e8`.

Current evidence: Jose confirms connection and contextual follow-up work. Earlier
owner reports separately confirm credential reload persistence and saved Study
lesson reload/source-link behavior. This is not blanket acceptance of every
automatic history reload/New-conversation case or navigation reliability.
[Merge readiness](bookhand-merge-readiness.md) records exact checks/commits;
[reported search/navigation defects](../issues/tutor-search-navigation.md) stay
OPEN. Earlier implementation mapping and task topology below are historical.

## Accepted implementation boundary and validation

### Bounded live-feedback follow-up (2026-09-06)

`VAL-BH-AI-BLOCK-SCHEMA`: Surface: declared page tool and installed SDK
validator. Needs: existing five standalone block kinds. Behavior: each
`upsert_study_item` branch permits only common fields plus its own payload
fields; even empty foreign-kind fields are rejected. Preserve flat calls,
runtime validation and exact-consent snapshot enforcement. Evidence: focused
valid/invalid fixtures through both validators, no live writes. Changed tool
declarations require owner reconnection/consent, never silent expansion.

`VAL-BH-AI-FAILURE-CAUSE`: Surface: conversation state and rendered diagnostic.
Needs: installed AI SDK synthetic stream fixture. Behavior: retain the original
failure/cause tree in memory only, independently of a bounded allowlisted
diagnostic; do not serialize or log raw errors, request/response bodies, headers,
tokens or tool/book content. Interrupted tool turns warn of possible saved
effects. Retry/checkpoint and no-replay rules remain unchanged. Evidence: one
focused tool-refusal/body-read-failure scenario (not a successful mutation), original nested
identity and secret-exclusion assertions, plus bounded cycle/depth checks.
Physical transport causality is not inferred from the error wrapper or app switch.

The supplied SDK bytes have SHA-256
`cec8778c0afa030f9126ef9d1ed122b46f3b3cc8fe43bd2f068df052a62035b2`;
the required Open Responses continuation patch has SHA-256
`99f31168f18f59f13cbc0b60ec85c0bdd302213716980ddfbac63e5e1abce571`.
Install the exact SDK/AI SDK versions and application-root patch, not source
imports into the neighboring repository.

The initial slice used memory-only credentials. Owner authorization on 2026-09-07
supersedes that restriction: [scoped connection persistence](ai-connection-persistence.md)
defines validated origin-local restoration, independent preferences, full-lock
refresh rotation and crash recovery. Pending authorization/intent stays tab-scoped;
chat transcripts never persist locally. The 2026-09-08
[last-conversation amendment](tutor-last-conversation.md) permits only a bounded
tab-local book/authorization/terminal-head association; history is read from the
provider with exact-head checks and no replay. CAS alone is insufficient for
rotating tokens.

Connection identity is a local generation created after new authorization,
preserved through refresh, invalidated before disconnect/replacement. One shared
app credential path serializes refresh under the origin-wide lock. Its
`saveConnection(next, expected)` performs an atomic expected-current replace and
returns false after replacement/disconnect; an old getter error cannot clear the
new generation. Closing a book aborts its conversation and tools, not the grant.

### VAL-BH-AI-PACKAGE
Surface: installed public library and built browser.
Needs: handed-off SDK tarball and reviewed continuation patch.
Behavior: exact pins/provenance, patch applies during install, exported helpers
load and native continuation refuses an absent patch. Browser code has no
Node-only imports or eval relaxation; retired custom AgentChat is not a second
active execution path.
Evidence: hashes, package smoke, focused installed AI SDK request-shape tests,
build and actual browser console/CSP check. Scripted provider is not live proof.

### VAL-BH-AI-CONNECTION
Surface: app store and browser OAuth.
Needs: SDK connection contract; isolated fixture for routine checks, real native
provider/owner consent for composition.
Behavior: address discovery and normal PKCE callback create a shared connection;
exact full approved declarations on all generations/steps. Single-flight refresh
and CAS cannot resurrect stale state; invalidation aborts old conversations.
Disconnect revokes best-effort with honest error, without clearing a replacement.
Origin-wide full refresh transactions prevent reuse across independent tabs;
the persistence follow-up defines the required durable markers and validation.
Evidence: focused actual-SDK fixture tests for refresh races, snapshot mismatch,
replacement/disconnect, denied/invalid callback and no auto-send; browser flow.
Late authorization completion is generation-guarded too: disconnect, replacement
or a superseding attempt prevents old credentials or feature intent installation.
Native connection is owner-confirmed; exact real-surface evidence must still be
attributed per scenario rather than inferred from deterministic fixtures.

### VAL-BH-AI-RETURN
Surface: browser, pending intent, SQLite lifecycle.
Needs: SDK transaction serializer/parser, existing books/reader.
Behavior: copy book/draft/selection before redirect; validate callback ownership
before routing/cleanup; reopen intended book, preserve pending request, never
send automatically. Denial, expired/malformed transaction and missing book are
visible/recoverable. Flush position/close SQLite before redirect and reload on
failure after disposal. StrictMode cannot exchange a single code twice.
Duplicated tabs can copy pending PKCE state. Before exchanging a successful
callback, claim its state once under an origin Web Lock and a non-secret
localStorage consumed marker; check the saved transaction expiry first. No lock/
marker support means visible recovery, not an unguarded exchange. Mark before
the request and never retry an ambiguous exchange. Markers contain no verifier,
code or credentials and can be pruned after expired transactions cannot run.
Evidence: callback/teardown/missing-book tests and browser redirect/reload checks;
include copied-transaction and deferred-authorization-completion race tests;
no credentials or verifier in logs, URLs, book database or committed artifacts.

### VAL-BH-AI-TURN
Surface: book conversation and AI SDK public stream/tool APIs.
Needs: installed patched provider and shared connection.
Behavior: full fixed ToolSet uses original guarded page handlers; new turn sends
only new input, tool continuation only actual results with provider checkpoint.
Two sequential calls and follow-up do not replay history. Empty/overlapping send
does not dispatch; errors/Stop/incomplete output interrupt, preserve visible
text and prevent automatic replay or reuse of a possibly dirty checkpoint.
Closing book rejects late effects/results; panel switches preserve conversation.
New conversation never silently adopts old checkpoint. Tool errors remain errors.
Evidence: actual AI SDK with deterministic HTTP fixture tests, cancellation/late
result tests, and real provider tool trace when available.

### VAL-BH-AI-UI
Surface: Tutor and manual reader on desktop/412px browser.
Needs: preceding integration, local preview.
Behavior: Connect your AI uses address not runtime card; no vendor-specific
transport UI. Draft and source attachment remain obvious, Send/Stop reachable,
connection/errors actionable, Study separate from activity. Shared connection
works across books; old conversation does not. Existing themes and manual
reader/Study/source links remain usable without auth. No implicit remaster.
Evidence: focused component tests plus screenshots/console and actual browser
actions. Physical phone keyboard remains distinct from viewport emulation.

### VAL-BH-AI-HERO
Surface: native OpenClaw authorization plus real Bookhand/model.
Needs: validated native endpoint and owner consent, supplied by upstream.
Behavior: actual source lookup, useful source-linked Study lesson with example
and reveal question, contextual follow-up using actual previous result; artifact
survives reload and source link works. No old gateway, scripted teaching or chat
claim can substitute for actual saved work and verified continuation.
Evidence: redacted real consent/tool/checkpoint observations, artifact identity,
screenshots, reload/source-link result. Owner-reported results are recorded above;
upstream deterministic loop evidence alone cannot pass this assertion, nor does
general flow confirmation prove every quality/navigation assertion.

José authorized the Bookhand parent to own design, integration decisions,
review and failure diagnosis, with Sol high-effort agents performing bounded
code edits. Use the existing `work/openclaw-tutor-demo` checkout. Preserve its
pending Tutor implementation and unrelated edits; do not push, publish, alter
live gateways/credentials/Serve, or weaken CSP.

## New authority, not an old demo repair

Read in `/home/dev/agent-connect-openclaw`:

- `docs/plan/connect-your-ai-openclaw.md`
- `docs/decisions/0013-native-provider-delegation-and-ai-sdk.md`
- `docs/plan/connect-your-ai-sdk.md`
- `packages/web-sdk/src/ai-sdk.ts`

These supersede the runtime-card/custom AgentChat direction for the next slice.
Bookhand asks for an OpenClaw address and uses provider-owned OAuth/PKCE consent
with Tailscale-verified owner identity. Agent Connect owns connection glue;
AI SDK owns streaming/tool steps; native OpenClaw owns execution and app authority.
Do not invent discovery endpoints, token shapes, routing headers or OAuth APIs.
Earlier separate-gateway results do not prove this architecture.

## Initial mapping and proposed ownership boundary (historical, 2026-09-06)

This describes files before replacement. Current modules are `src/ai/` for
shared authorization/history reads and `src/tutor/` for book-scoped execution
and presentation; the old Tutor connection/authorization modules are retired.

- `src/tutor/connection.ts` currently combines per-book runtime-card grants,
  redirect handling and custom AgentChat state. Separate app-shared connection
  lifecycle from book-scoped conversation state; replace execution, not layer a
  new custom protocol over the old one.
- `src/tutor/authorization-state.ts` and `App.tsx` restore the intended book and
  draft on an owned callback. Preserve that behavior and avoid automatic send;
  transaction serialization/state verification must follow the new SDK contract.
- `TutorPanel.tsx` owns panel rendering, captured attachment and same-book
  lifecycle. Keep the existing design and manual Study/reader independence.
- `src/tutor/tool-adapter.ts` lends actual page-owned handlers. Retain exact
  source validation, error payloads and cancellation; phone support must not
  require experimental browser WebMCP discovery.
- `ReaderScreen.tsx` / `useReader.ts` flush reading position and close SQLite
  before auth navigation. Preserve OPFS/BFCache recovery and selection/draft
  restoration, rather than treating redirect as transport-only.
- Existing Tutor tests are behavior oracles for attachment, callback ownership,
  cancellation, late results and same-book rerender preservation. Custom
  AgentChat fixtures will need replacing, not preserving as a second transport.

The shared provider connection should survive book exit. The old book's
conversation, outstanding work and handler lifetime must not survive that exit.
Different features may share authorization without sharing conversation history.
How approved fixed snapshots span those features is an upstream contract question,
not permission to silently broaden a grant.

## Execution adapter inspected; packaging not yet installed

The current upstream seam provides `createAiSdkOpenResponsesModel` (verified
endpoint, model, per-attempt bearer getter), `createAiSdkApplicationTools`
(fixed ApplicationTool snapshot and connection identity), generation options
with retries disabled and public prepareStep continuation, and successful-text
checkpoint selection. This is inspected source, not a frozen OAuth API.

Upstream pins AI SDK 7.0.93 and Open Responses 2.0.39 with a persisted temporary
patch for previous-response continuation/metadata. Bookhand must install the
same reviewed patch and provenance when supplied; an ordinary unpatched npm
dependency does not prove native continuation. No private fetch-body rewrite,
owner bearer, provider session header or transcript replay workaround.

Retaining a previous checkpoint after failure does not make it safe to reuse.
After ambiguous admission or tool effects, mark the conversation interrupted
and prohibit automatic replay/continuation unless the validated provider contract
explicitly establishes safety. Saved Study effects are not undone by Stop.

## Interface questions sent to Agent Connect owner

1. Address discovery, verified inference endpoint/model, and requested fixed
   tool snapshot input; exact begin/callback API and serialized PKCE state.
2. Pending feature/book/draft context and callback ownership; failed/denied/
   abandoned redirect recovery without consuming unrelated callback parameters.
3. Shared connection identity, bearer getter, token persistence, single-flight
   refresh, expiry/revocation error types and explicit disconnect behavior.
4. Snapshot reuse across features and books, and when changed tools require
   fresh consent. No implicit widening or newest-conversation adoption.
5. Interrupted execution/checkpoint rules; distinguish provider auth failure,
   source-tool rejection, incomplete response and unknown mutation outcome.
6. Packaged SDK artifact, exact dependency pins/patch and install verification.

## Preparation status

Implementation activated after package handoff and two independent contract
reviews. Scope clarifications added copied-PKCE callback ownership and stale
authorization completion alongside refresh CAS. ADR 0007 records the accepted
replacement and memory-only credential lifecycle.

Current bounded ownership:

- `ai_sdk_package`: package/lock/vendor/patches and installed-package smoke;
  owns PACKAGE implementation.
- `ai_connection_store`: new `src/ai/` connection and pending-intent modules,
  refresh/auth-race and transaction tests; owns CONNECTION and RETURN core.
- `ai_tutor_conversation`: book-scoped AI SDK conversation and focused real-SDK
  fixture tests; owns TURN.
- `ai_tutor_ui`: Tutor rendering, App/Reader integration and component tests;
  owns UI and RETURN wiring, with RETURN final ownership in the shared integration
  gate rather than independent partial-pass claims.
- Parent integrates/reviews, diagnoses failed checks and owns real-surface proof;
  separate scrutiny follows a compiling integrated result. HERO stays blocked
  until the native provider endpoint/owner approval are available.

The source mapping notes below are historical pre-handoff constraints where
they describe awaiting exports. The validated artifact now permits implementation.

Concrete OAuth source is now available at upstream
`packages/web-sdk/src/openclaw-connection.ts`, still under focused validation.
It defines discover/begin/complete, transaction serialize/parse, refresh/revoke,
and a single-flight bearer getter. Connection includes endpoint/model,
credential expiries, approved declarations and their hash. Do not install from
provisional source or treat these as validated package exports yet.

Upstream clarified that **every Responses request must carry the exact full
approved declarations**, not a feature subset. This fits a shared Tutor/remaster
catalog: vary feature instructions, not ToolSet declarations; bind execution to
the current book's handlers/lifetime. When no book or complete catalog is ready,
block generation rather than publish a partial snapshot. Declaration changes
require new consent, not token refresh. The existing native WebMCP registration
can keep its own lifecycle; this rule applies to the delegated AI connection.

One remaining identity question was sent upstream: the connection type exposes
no stable grant ID. A local connection generation can invalidate conversations
on disconnect/provider replacement without doing so on normal token rotation;
confirm how this maps to the tool adapter's `connectionId` before implementation.

- Existing branch and dirty tree verified intact; no integration code edited.
- Parent inspected the actual AI SDK source and sent interface questions to
  `cdx:1.1` with explicit Bookhand/not-José attribution and separate Enter.
- Sol high-effort read-only lane maps reusable behavior and candidate edit scopes.
- Bounded code assignments and new acceptance contracts follow the settled
  interface; this document is not a speculative implementation task list.
- Real acceptance will require actual app-scoped consent, two sequential
  page-owned tool calls, useful saved Study work, contextual follow-up and
  honest interruption/reload behavior. No simulated provider closes that gate.
