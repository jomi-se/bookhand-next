# Fork integration and upstream-update gate

## User-visible goal

Renderer upgrades improve reading without silently changing security,
locations, annotations, remasters, performance, or recoverability. Every bump
is reviewable, reversible, and tied to one exact source commit.

## Why it matters

`readest/foliate-js` is MIT and technically promising, but it is unreleased,
versioned `0.0.0`, API-unstable, and carries 212 post-divergence commits across
many unrelated capability families. Bookhand also has a deliberate
persistent-frame compatibility patch that conflicts with its multi-frame
continuous-scroll design.

## Behavioral requirements

- Every evaluated or adopted renderer resolves to one reviewed full commit and
  one reproducible dependency artifact.
- Every candidate is compared with the prior pin by history, authored source,
  generated/vendor assets, license/provenance, security-sensitive paths, and
  Bookhand-visible behavior.
- Bookhand's compatibility suite and evidence, not an upstream green build or
  feature claim, decides whether the candidate is acceptable.
- Promotion, owner-fork mutation, push, release, and deployment remain separate
  explicit owner decisions.
- The prior pin remains reproducible and user-owned data remains readable after
  rollback.

## Non-negotiable pinning and provenance

- Pin a full commit SHA. Never use a floating branch, tag that can move, GitHub
  default archive, or registry package name as a substitute for the fork.
- Verify the fetched tree and lockfile resolve to the reviewed commit. Record
  repository URL, commit, archive integrity, review date, and reviewer.
- Read the fork `LICENSE` and every added/changed third-party notice or bundled
  asset license on every update. Retain the MIT copyright and permission notice
  and update Bookhand's third-party notices before distribution.
- Treat Readest application code/tests/fixtures as AGPL research-only. No code,
  comments, test bodies, fixtures, distinctive pseudocode, or close structural
  translations enter Bookhand through the bump.
- This gate is an engineering provenance policy, not legal advice.

## Disposable compatibility spike checklist

The spike changes only the renderer source/pin and the minimum isolated
compatibility patch needed to evaluate it. It does not approve production use.

### Source and install

- Confirm current Bookhand baseline
  `johnfactotum/foliate-js@78914aef4466eb960965702401634c2cb348e9b1`.
- Confirm candidate `readest/foliate-js` commit and its merge base/history.
- Prefer the existing exact GitHub archive dependency workflow for the first
  spike; do not introduce submodule operations merely because Readest uses one.
- Capture clean install, lockfile, package contents, build output, bundle-size
  and newly bundled third-party asset changes.
- Verify browser packages contain no Node-only runtime imports and no implicit
  native/Tauri/PDF asset paths.

### Architecture compatibility

- `ReaderAdapter` public values remain structured-clone-safe and renderer-free.
- Open/close and rapid competing opens remain safe under React StrictMode.
- The persistent same-origin iframe keeps the same browsing context across
  section navigation, remaster switches, Retry, and tutor return flows.
- No `blob:`, `data:`, or `srcdoc` post-load child navigation returns.
- Decide explicitly how candidate multi-view/continuous-scroll behavior relates
  to ADR 0005. If incompatible, disable it for the spike or propose a separate
  ADR; do not weaken the frame requirement silently.
- Exact CFI/range round trips, section snapshots, accepted revision selection,
  local chunks/search, annotations, transient tutor cues, and TOC labels keep
  their present Bookhand semantics.

### Security and resource policy

- Production CSP and sandbox block every hostile-EPUB sentinel.
- Packaged text, CSS, images, SVG, fonts, MathML, captions, and accessible names
  still render offline while remote resource attempts make zero requests.
- Custom CSS and remaster sanitizer behavior is unchanged.
- Parser fallbacks do not enable script, forms, nested browsing, bridge access,
  storage access, or remote URLs.
- All created frames, object URLs, workers, canvases, observers, and listeners
  have inspectable ownership and cleanup.

### Reading compatibility suite

- Open, timeout, Retry, close/reopen, and section-failure recovery.
- Previous/next, nested TOC, href, section, CFI, annotation, search, study
  citation, tutor focus/Back/Stop, and invalid-target paths.
- Restore after reload/tab reopen with styles applied before location.
- CFI selection/range round trips and annotation/tutor/search overlay isolation.
- Publisher baseline, themes, typography, custom CSS preview/cancel/apply/reset,
  remaster Original/Rewritten/Undo/Reset, and local resource mapping.
- Resize/reflow anchor stability; delayed/broken media; tables, covers, inline
  boxes; LTR/RTL/vertical-rl; explicit vertical-lr limitation.
- Wheel inertia, keyboard/editable focus, pointer/touch ownership, and no
  listener accumulation.
- Desktop, Pixel 7 emulation, and—before claiming native touch behavior—a
  physical target device.

### Performance and failure evidence

- Record first readable section, page/scroll response, reflow settle time,
  resident views/resources, and long-session memory.
- Inject delayed, hanging, stale, and out-of-order operations. Prove old work
  cannot replace current content and cancellation releases resources.
- Flush and compare live, queued, and persisted position across pagehide,
  visibility loss, reload, and close.
- Preserve screenshots/traces/logs under an ignored evidence directory with
  exact commit, browser, viewport, fixture provenance, and command.

## Review gate for every owner-fork update

The owner-controlled fork at `https://github.com/jomi-se/foliate-js` is a
review boundary, not an automatically trusted upstream. Do not push or change
it as part of this specification work.

1. **Choose a candidate.** Name the current owner-fork pin, candidate upstream
   pin, exact merge base, intended gains, and unrelated capability families.
2. **Review history and diff.** Classify every intervening commit; review
   authored file deltas separately from generated/vendor assets; follow issue
   and PR links for failure context.
3. **Review provenance.** Re-read licenses/notices, dependency and build-script
   changes, package exports, worker assets, and repository identity metadata.
4. **Review security.** Recheck frame creation/navigation, sandbox/CSP, URL and
   resource loaders, parser fallbacks, event/native bridges, PDF workers, and
   remote-capable code paths.
5. **Rebase Bookhand patches deliberately.** Exact-match transforms must fail
   closed when source changes. Re-derive rather than fuzzily applying the
   persistent-frame patch; document why each local delta still exists.
6. **Run the compatibility suite.** No green subset substitutes for the named
   Bookhand surfaces above. New candidate features require new independent
   fixtures before being enabled.
7. **Inspect evidence and residual risk.** Record failures, skipped platforms,
   corpus limitations, performance deltas, and accepted unsupported behavior.
8. **Owner approval.** A human owner approves the exact commit and documented
   tradeoffs before dependency, fork, release, or deployment changes.
9. **Land with rollback.** Keep the prior exact pin and patch reproducible;
   prefer a single revertable dependency/compatibility change. Verify a clean
   install from the committed lockfile.
10. **No automatic promotion.** Watching or fetching upstream never updates
    Bookhand, the owner fork, a tag, a package, or production by itself.

## Rollback requirements

Rollback restores the prior exact source pin, lockfile, persistent-frame patch,
and notices without migrating user-owned data backward. Reader state remains in
Bookhand domain types so rollback does not require a renderer-specific database
migration. If a candidate wrote incompatible location or annotation data, the
candidate is not acceptable without an explicit forward/backward migration and
its own decision record.

## Edge cases and failure modes

- Candidate history rewrites, an archive differs from the reviewed tree, a
  dependency starts fetching assets at build/runtime, or package exports move.
- The owner fork contains Bookhand patches plus upstream merges whose effective
  diff cannot be explained from commit subjects alone.
- A source bump still builds but bypasses the exact-match frame transform, or a
  fuzzy patch appears to apply while restoring forbidden frame navigation.
- The compatibility suite passes on desktop but fails physical touch, assistive
  technology, long-session memory, malformed content, or production CSP.
- A rollback can restore code but not reader data because the candidate leaked
  renderer-specific state into persistence.

## Bookhand constraints and conflicts

The public repository must remain portable and contain no owner-machine or
deployment identifiers. Updating the owner fork, pushing, publishing, tagging,
or deploying requires an explicit owner gate. `ReaderAdapter`, ADR 0005, strict
containment, exact CFI/domain persistence, local search, and remaster ownership
remain authoritative unless their earliest source of truth is deliberately
changed first.

## Known footguns

- Cherry-picking only the headline continuous-scroll commit while omitting its
  later anchor, resource, direction, and lifecycle fixes.
- Accepting all 212 commits because the aggregate test suite looks mature.
- Reviewing generated PDF.js churn as if it were authored renderer logic—or
  ignoring its dependency/license impact because it is generated.
- Using `npm install foliate-js` and assuming it resolves to Readest's fork.
- Letting an exact-match Bookhand transform degrade into a permissive search and
  replacement when upstream source changes.
- Calling Playwright device emulation physical Android evidence.

## Provenance and source pointers

- MIT candidate: `readest/foliate-js@ca3f118269f8d78811ef17a1b147363c321273d7`,
  `LICENSE`, `package.json`, commit history after `6b11e174`.
- AGPL research baseline: `readest/readest@180795fb4960c32ed11539e6ba70085a5041ecaf`,
  `LICENSE`, `.gitmodules`, reader integration and regression paths.
- Bookhand baseline: `package.json`, lockfile,
  `scripts/vite-foliate-persistent-frame-plugin.mjs`, ADR 0005, reader
  contracts, and the current reader/unit/E2E suites.

## Validation ideas

The checklists above define the future evidence floor. For this documentation
pass, validation is limited to source/history/license inspection, link checking,
and repository diff hygiene. No compatibility conclusion may be inferred from
these specifications alone.

## Adoption disposition

Run a disposable spike before any adoption. If it passes, prefer one reviewed
exact MIT fork commit behind `ReaderAdapter`. Maintain the owner fork only when
Bookhand-specific durable patches justify that cost. Never float on `main`.
