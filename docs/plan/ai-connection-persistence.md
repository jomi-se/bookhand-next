# Scoped connection persistence

Owner-authorized 2026-09-07. Supersedes memory-only behavior in the earlier
integration plan under amended ADR 0007. Existing dirty work remains in place.

## Scope

Restore one scoped connection across reloads/tabs; independently remember provider
address and experience. Preserve the exact approved catalog and existing absolute
grant lifetime. No chat/checkpoint persistence, replay, live credentials, consent,
service changes, pushes or broad suites. Saved lesson reload/source navigation
has now been reported successful by Jose; this work changes authorization only.

## VAL-BH-AI-PERSIST-RESTORE

Surface: connection store and installed SDK fixture.
Needs: origin-local versioned storage and Web Locks.
Behavior: validate version, types, current client origin, canonical provider and
resource endpoint, model alias, dates, declarations/schema and canonical hash
before constructing a model. Access expiry with a live refresh lifetime remains
restorable; refresh on demand under lock. Absolute grant expiry blocks use even
if access expiry claims to be fresh. Reject corrupt/mismatching/grant-expired records, retaining
separate safe preferences. Restoring credentials never restores chat/checkpoints
or dispatches a task; fresh authorization is needed for a changed catalog.
Evidence: new-store reload fixtures; invalid origin/resource/hash/schema/expiry
fixtures; prefs retained after disconnect/expiry. No real credentials in fixtures.

## VAL-BH-AI-PERSIST-ROTATE

Surface: two stores sharing storage/lock port and actual SDK refresh client.
Needs: prior validated scoped record.
Behavior: one origin lock covers read-current, refresh, persist; re-read under
lock, keep it through uncancelled refresh/save despite caller abort. Write a
durable in-flight marker before spending the token. Waiting stores use the new
token, not the old one. Restore after abandoned rotation, network ambiguity or
failed write requires consent with no retry. Provider TTLs are not extended.
Evidence: two-store deferred refresh race, cancellation while refresh pending,
orphan marker, pre/post-refresh write failure and absolute-expiry fixtures.

## VAL-BH-AI-PERSIST-INVALIDATE

Surface: shared store lifecycle and cross-tab change notifications.
Needs: serial credential mutation lock, persistent identity distinct from local
page/conversation generation.
Behavior: removal/replacement invalidates other stores and old consumers;
refresh retains each page's generation. Disconnect is locally immediate and
durably removes/revokes the relevant connection without clearing a newer one.
Queued disconnect captures persistent identity, then re-reads under the lock:
remove/revoke that identity's latest rotated credentials, not the stale pre-refresh
copy. If a replacement won the lock first, preserve it. Test both orderings.
No late restore/refresh/auth completion resurrects a superseded identity.
Preferences remain; no persisted snapshots contain conversation or raw errors.
Evidence: disconnect/replacement versus deferred rotation/restore, storage-event
resync, generation stability and no stale-write fixtures.

## Work / evidence

Parent owns design, record and integration review. Bounded Sol lanes implement
storage/store tests and minimal lifecycle/UI wording. Focused tests/typecheck
only; real model and live owner consent remain outside this request.

Implementation checkpoint, 2026-09-07:

- Versioned credential/prefs store, full-lock refresh, credential-free rotating
  marker, absolute-expiry checks and persistent identity/local generation split
  are implemented. Writer-tab failures explicitly retire the local connection;
  they do not rely on storage events. Disconnect suppresses stale resync adoption.
  A superseded cross-tab authorization also discards its returned feature intent.
- Actual installed-SDK synthetic fixtures: 26 connection tests pass across
  `ai-connection.test.ts` and `ai-connection-persistence.test.ts`. Storage ports
  exclude writer self-events. Coverage includes shared refresh, caller abort,
  orphan rotation, refresh rejection, marker/save write failures, replacement
  preservation, delayed expiry validation, and stale callback/disconnect races.
- Parent reran those files with `tutor-panel.test.tsx` and
  `app-ai-return.test.tsx`: all four focused files passed. Focused oxlint,
  `git diff --check`, and `npm run build` (including TypeScript) passed.
- Local built asset: `index-CnwyuI8u.js`, SHA-256
  `216d09758b141cb2f204a562efd77b76a492908b579b35f15ed7eda3b656530c`.
  No live consent/model call, browser reload, service restart, push or deployment
  was performed. These are deterministic SDK/store checks, not live browser
  persistence evidence.

Owner acceptance, 2026-09-07 (relayed by Agent Connect Astra):

- Jose confirms the persistent connection works after a phone reload, without
  entering the provider address again or repeating consent.
- Saved Study lesson persistence and source-link navigation are also confirmed
  by Jose. These are owner-observed outcomes, not additional agent-run tests.
- Reload confirmation is distinct from the deterministic refresh/concurrency
  fixtures above; no claim is made that live token rotation occurred on reload.
- An initial attempt failed, then worked. Cause unknown; Jose explicitly asks
  that it not be investigated now. No new tests, model calls or service changes
  were made for this acceptance update.
- Root is closing vertical-slice acceptance. Review and commit packaging remain
  separately authorized work; unrelated dirty files are preserved.
