# ADR 0007: Shared OpenClaw connection, AI SDK feature execution

Accepted 2026-09-06 through José's authorized Agent Connect implementation handoff.
Supersedes ADR 0006's runtime-card and custom AgentChat implementation choice,
not its optional connection, page-owned tools, source integrity or user control.

Use provider-owned OpenClaw discovery and OAuth Authorization Code + PKCE through
the validated Agent Connect SDK. The person supplies an HTTPS OpenClaw address;
the provider authenticates its owner and authorizes Bookhand. Tailscale is the
first owner-authentication deployment, never a client-forged identity header.
Bookhand receives only an application-scoped credential and public model alias.

An app-level connection is shared by Tutor and future AI features. Each book
conversation owns its own checkpoint, visible messages and abort/tool lifetime.
Book exit ends that conversation, not authorization. Provider replacement or
disconnect invalidates all consumers of the old local connection generation.
Refresh preserves the generation and uses a shared app-level token path with
expected-current CAS inside the full credential lock; late completion cannot
restore a disconnected/replaced connection.

Amended 2026-09-07 by explicit owner request: persist only the app-scoped
connection in a validated versioned origin-local record, with provider address
and experience in separate non-secret preferences. No upstream/admin credentials,
chat history, checkpoints or automatic tasks are persisted. Keep provider TTLs
unchanged (one-hour access, absolute 30-day grant/refresh lifetime).

On restore, validate current app origin, canonical provider/endpoint binding,
model alias, credential envelope and approved tool declarations/hash before use.
Refresh, restore, replacement and disconnect serialize on one origin Web Lock.
Refresh re-reads inside the lock and leaves a durable rotation-in-progress marker
before spending a token. Hold the lock until the uncancelled SDK refresh and save
finish; caller cancellation must not release it early. An orphan marker or an
ambiguous refresh/write fails closed and asks for consent, never token replay.
Cross-tab events invalidate removed/replaced identities; ordinary refresh does
not change a page's conversation generation. Disconnect retains preferences.

Persist pending PKCE transaction and feature intent in sessionStorage.
Because duplicated tabs can copy pending transactions too, claim a callback once
using an origin Web Lock plus a non-secret consumed-state marker before exchange.
Unavailable storage/locking and ambiguous exchange fail visibly without retry.
Local scoped credential storage is accessible to same-origin app code; existing
CSP and EPUB containment remain unchanged. No hidden second storage backend or
fallback that reuses a potentially spent refresh token is acceptable.

AI SDK owns application-side streaming and tool steps. Use the SDK's thin
Open Responses model/tool/prepareStep adapters with automatic retries disabled.
Install the provenance-pinned temporary Open Responses continuation patch in the
application root; it is not included transitively by the SDK tarball. Do not add
a private request-body interceptor, custom response engine or parallel AgentChat.

Every request sends the exact full approved declarations. Tutor and remaster can
vary instructions but cannot silently subset or expand that ToolSet. Execution
uses the original page-owned handlers bound to current book context; no book or
incomplete/mismatching tool availability blocks generation. Tool changes require
fresh consent rather than broader credentials during refresh.

An interrupted or ambiguous turn is not rolled back by retaining an old response
ID. Preserve visible messages and saved Study effects, forbid automatic replay,
and require an explicit new conversation when checkpoint safety is unknown.
No source rewrite or durable study action is implicit in connecting.

Amended 2026-09-08 by explicit owner request: a bounded tab-local association
may remember this book's last completed response head for the same persisted
authorization. This narrowly supersedes the blanket no-checkpoint-persistence
rule above, not the no-transcript-storage or no-replay rules. On Tutor reopen or
reload, match that exact head against provider-owned scoped history before
continuing. Never select a newest grant-wide conversation without book evidence,
adopt an active sibling tab's conversation, or resume an interrupted tool turn.
History inputs may be prompts or application outputs and must be labeled as such.
See [the restore contract](../plan/tutor-last-conversation.md). No picker or
general conversation database is authorized.

Retain existing CSP and independent EPUB containment. No backend inside
Bookhand, live service migration, credentials changes, push or public deployment
is authorized by this ADR. Native app-auth/real-model acceptance remains separate
from deterministic client and loop tests.
