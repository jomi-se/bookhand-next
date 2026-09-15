# Minimal last-conversation restore

Requested through Agent Connect, 2026-09-08. Backend oracle:
Agent Connect's `docs/architecture/scoped-conversation-history.md`,
97c69d6. Only automatic same-book restore on Tutor opening/reload; no picker,
search, pagination, transcript database, tool replay or automatic prompt resend.

## Scope and implementation boundary

Keep a bounded, versioned sessionStorage association of book id, persisted local
connection identity and last terminal response head. The local connection id is
minted on new authorization, survives credential refresh/reload, and is not a
bearer or server grant id. Do not choose the newest grant-wide conversation.
Match the saved response head to the provider list, then verify the fetched
history root has the same conversationId and previousResponseId as the selected
descriptor, and canContinue, before adopting its head.
Keep transcript text only in memory, fetched from OpenClaw.
Source inspection confirms history fields are at the root, expiresAt is epoch
milliseconds, and conversationId stays stable while previousResponseId changes.
Only structured 404/conversation_unavailable and 409/conversation_changed mean
the fetched head is unavailable; an unrecognized 404 (old proxy route) is an
ordinary recoverable error. Recheck expiry after asynchronous reads. A later
continuation rejection remains interrupted with explicit fresh action, no replay.

Session storage avoids sharing another tab's most recent book conversation.
Duplicated tabs may inherit it: use an exclusive, nonwaiting Web Lock on the
scoped response head while that conversation is owned. Contention starts fresh,
never adopts an active sibling. Clear the saved head before an admitted send;
save only a validated final text checkpoint, not intermediate tool heads.
Retain the old head lock through the turn; release on failure, New conversation,
book disposal or connection invalidation. No lock support means no restore
persistence, not a broken reader/Tutor.
On successful completion, acquire the new head's nonwaiting exclusive lease and
save its association before releasing the old lease; keep the new lease while
idle. Failed lease/write disables restore persistence but does not turn an
already completed model/tool turn into a failure. Association schema is exactly
version, bookId, scopeId and previousResponseId (no transcript or credentials).
Contention or unsupported locking clears this tab's inherited association and
chooses fresh permanently, not a later automatic attempt to adopt a sibling.

Connection store supplies a narrow authenticated history-read port bound to its
current persistent identity and exact tool catalog, using existing serialized
token refresh. No SDK change, auth redesign or token exposure is needed.
Guard scope and page generation before/after token acquisition and every read.
Start restore only from the open Tutor lifecycle; single-flight loading/error
states block Send. Commit a read only when book/scope/generation/attempt epoch
still match, transcript remains empty, and New conversation/dispose has not won.
Retries replace rather than append history; preserve draft and attachment.
New authorization clears old-scope associations; same-grant refresh preserves
them. A missing association never triggers grant-wide discovery.

## Validation contract

### VAL-TUTOR-RESTORE-MATCH

Surface: installed AI SDK with deterministic history/fetch/storage/lock fixtures.
Needs: exact backend descriptor and history shapes; real model calls prohibited.
Behavior: after a completed turn, same-book same-connection reload/open restores
only its recorded eligible head even when newer unrelated conversations exist.
Follow-up sends only new input plus previous_response_id, with original full
tool declarations; restoration executes no tools and sends no model request.
Evidence: focused save/dispose/restore/follow-up tests through actual AI SDK;
different book, new authorization and unknown association start empty.

### VAL-TUTOR-RESTORE-FAILURE

Surface: deterministic transport/lifecycle tests.
Needs: scoped read port, association store and abort guards.
Behavior: missing, expired, pending, consumed or changed head starts fresh.
Transient fetch/401/403/5xx/malformed-history failures preserve association and
draft, show a recoverable restore error and block send until retry/new chat.
New conversation clears association and prevents late restore resurrection;
disconnect/replacement/book disposal abort reads and reject stale completions.
Duplicate-tab active-head contention never adopts that conversation. Storage
failure never causes model replay or turns completed actions into failed turns.
Evidence: focused boundary/race tests, including late fetch completion, lease
contention, explicit fresh action, and no request/tool execution during reads.

### VAL-TUTOR-RESTORE-PRESENTATION

Surface: component tests and build; owner live acceptance separate.
Needs: provider history allowlist; live proxy not yet restarted at handoff.
Behavior: reuse existing transcript with a small restored-history notice;
input entries say “Input (prompt or application output)”, never “You”. Render
only input/assistant text as inert text, never reasoning/system/tool metadata;
show truncation honestly. No picker, redesign, auto-send or hidden execution.
Evidence: focused component assertions for labels/inert content/error recovery;
production build. Live proxy/model acceptance explicitly pending root readiness.

## Status and ownership

Source investigation found no missing grant/checkpoint lookup primitive: local
persistent authorization identity plus exact list/head matching is sufficient.
Two sequential contract reviews passed after clarifying lease transfer and
stale-restore guards. Mission runtime tools are unavailable in this environment;
use bounded native work lanes and this ledger, not invented runtime commands.

Work lanes: authenticated history port/parser; book-scoped association/restore
lifecycle; minimal existing transcript wiring. Parent owns integration review,
focused checks and evidence. Deterministic component/API-SDK tests and local
build are this slice's available floor; live history/model acceptance remains
gated on root's proxy readiness. No live calls/services changed.

Implementation complete. Parent combined regression passed across six focused
files: ai-connection, ai-connection-persistence, ai-conversation-history,
tutor-conversation, tutor-panel and app-ai-return. Production TypeScript/build
and focused core/port lint passed. The UI lane reports 10/10 component checks,
no new lint warnings (existing TutorPanel warnings remain). Independent bounded
core lifecycle/lease review found no remaining blocker. Final core test-only
follow-up passed 28/28: different book/scope, absent/expired/pending/changed head
all start fresh without a model call; late history after disposal is discarded.

The installed AI SDK fixture proves save/dispose/restore/exact-head follow-up
with only the new prompt and previous_response_id. Separate fixtures prove
transient recovery, original failure causes, exact authenticated routes,
scope preservation through synthetic refresh/reload, duplicated-tab contention,
New-conversation late-finalization rejection and denied clear preventing send.
These are deterministic fixtures, not real subscription/browser history evidence.
After the final truncation-copy correction, parent core/panel regression and
production build passed again. The served preview asset matches local
index-DiXsiEfF.js (SHA-256
80dc4f9a56bbc44cee368684d4a237d3da6dd1d5738eec86f8e32fde62615516).
No model requests, live history reads, user mutations, service changes or pushes.

## Root-coordinated live acceptance, when proxy is ready

Use a completed same-book conversation from an explicitly approved owner run
on this build. Conversations created before this association feature cannot be
assigned to a book retrospectively; they intentionally start fresh rather than
guessing from the newest provider session.
Reload/open Tutor: expect the restored execution-history label and no new model
request or repeated Study action. Send one explicit follow-up: it should use
the saved context. New conversation then reload should stay empty, not reopen
the discarded head. A different book must not show that conversation. Owner
approval/live model turns remain separate from local fixture evidence.
