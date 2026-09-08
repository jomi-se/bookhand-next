# Bookhand integration: local merge readiness

Date: 2026-09-08. Authorization: Jose through Agent Connect root requests
reviewed local commits and a readiness report, **not the merge yet**. No push,
service/auth/Serve change or live model/tool replay.

## Ownership inventory and intended split

Base branch: `work/openclaw-tutor-demo`, started at `2c36f33`.
Local `main` is still `2c36f33`; origin is the development fork `bookhand-next`.
The separate `judged` remote and submitted deployment are out of scope.

1. **Previously requested documentation cleanup, separate from integration:**
   `docs/ideas/` and its documentation-map link. These preserve unaccepted
   proposals and explicitly do not authorize implementation. No EPUB factory
   experiments or code are included.
2. **Reproducible dependency foundation and decisions:** package/lockfile,
   current provenance-labelled SDK tarball and vendor README, required
   Open Responses patch, packaging verifier, ADRs 0006/0007 and the documented
   post-submission architecture exception. No npm publishing or absolute local
   file dependencies.
3. **Tool contract clarity:** `src/webmcp/tools.ts`, `library-tools.ts`, and
   their focused regression additions. Closed local standalone Study schemas,
   concise mutually exclusive/dependent-field descriptions and examples.
   Provider normalization still flattens union schemas; runtime validation stays.
4. **Optional Tutor integration:** `src/ai/`, `src/tutor/`, App/ReaderScreen,
   surface panel type, reading-state flush exposure, shell/frame CSP and mobile
   keyboard viewport, new integration tests and current/historical handoff docs.
   Includes scoped credential persistence, safe error causes, exact-head history
   restore and source-bound page tools; not new search/indexing behavior.

The old unused `vendor/open-agent-connect-web-0.0.3-csp-9736495.tgz` remains
untracked and preserved locally. It is not imported, staged or required by the
lockfile. No unrelated source edit or indexing investigation is active in this
checkout at packaging time.

## Evidence and open defects

- Jose's latest confirmation: connection and contextual follow-up work.
- Earlier distinct owner reports: credential reload works without re-entering
  the address/consent; saved Study lesson survives reload and its source link
  works. These are owner observations, not proof of live token rotation.
- Automatic same-book history reload, New-conversation reload, changed grant,
  duplicate tab and expiry are covered by deterministic tests; the general flow
  confirmation is **not** marked as owner acceptance of each of those cases.
- [Search anchor, navigation and timeout reporting defects](../issues/tutor-search-navigation.md)
  remain **OPEN**, accepted as follow-up by Jose. No anchor/index/navigation fix
  is claimed or included through incidental cleanup.

Mechanical commit-boundary check: lint, typecheck, full unit suite, build,
production bundle verification, installed SDK/patch verification and agent setup
verification all pass. Commands ran sequentially without live model calls. This
is not a fresh complete Playwright or hosted-CI run; neither is claimed here.
Earlier component and disconnected-browser evidence retains its original scope.

## Local commit set

- `f5888e5` — docs: preserve unaccepted post-submission ideas (separate cleanup).
- `c9c0019` — build: pin reviewed Agent Connect and AI SDK integration.
- `9aadac1` — fix: clarify and validate Bookhand tool inputs.
- `feat: add scoped OpenClaw Tutor and safe conversation restore` — the feature
  commit containing this record. Resolve its exact ID with
  `git log --format='%h %s' 2c36f33..work/openclaw-tutor-demo`; the final handoff
  reports the resulting hash without a self-referential documentation hash.

The hash-pinned third-party patch retains its exact unified-diff context bytes;
two blank context lines trigger `git diff --check` whitespace warnings. Do not
rewrite this reviewed artifact to silence those warnings. Other staged content
passes the whitespace check; the installed patch verifier passes.

## Qualitative review outcome

Independent bounded logic/security/session-lifetime review found **no merge
blocker**. It ran separately from mechanical verification and made no changes.
Two non-blocking follow-ups remain, not silently repaired in packaging:

- Provider-address input accepts path/query/fragment, while persisted reconnect
  preferences canonicalize to the origin. Align entry validation/canonicalization
  in a future focused change (`TutorPanel.tsx`, `connection.ts`,
  `connection-persistence.ts`).
- `create_study_lesson` still advertises a broad block schema despite rejecting
  foreign kind-specific fields at runtime. The closed standalone `upsert` schema
  is not a claim that every lesson block declaration is structurally closed;
  provider normalization also remains a limitation. Keep concise descriptions
  and runtime enforcement; any schema change must respect fresh consent.

Merge must wait for root's explicit authorization even though checks are green.
No remote refs were fetched or changed by this packaging pass; readiness concerns
local main. This is not approval to push or change the submitted deployment.
