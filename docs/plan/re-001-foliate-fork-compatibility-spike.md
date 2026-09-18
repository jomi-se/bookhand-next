# RE-001 Foliate fork compatibility spike

Status: active disposable evaluation; not an adoption decision.

Last updated: 2026-09-17.

## Objective

Prove or disprove whether the exact MIT renderer candidate
`jomi-se/foliate-js@ca3f118269f8d78811ef17a1b147363c321273d7` can replace
Bookhand's current
`johnfactotum/foliate-js@78914aef4466eb960965702401634c2cb348e9b1`
pin behind the existing `ReaderAdapter` without weakening Bookhand's frame,
security, CFI, remaster, annotation, search, persistence, or mobile-reader
contracts.

This mission maximizes evidence before owner access to the ChatGPT Desktop
browser is available. It must leave every Desktop-only claim explicitly
blocked until that surface is exercised.

## Decision boundary

The spike may:

- use an isolated, disposable Git worktree and branch;
- change the exact archive pin and lockfile there;
- re-derive the exact-match persistent-frame build transform for the candidate;
- add Bookhand-authored fixtures, assertions, diagnostics, and evidence tooling;
- make the minimum adapter-contained compatibility changes needed to evaluate
  the candidate; and
- record results and a recommendation in Bookhand documentation.

The spike may not:

- promote the candidate to `main` or call it adopted;
- push, tag, publish, deploy, or mutate `jomi-se/foliate-js`;
- consult, copy, translate, or import Readest application code, tests, fixtures,
  comments, or distinctive pseudocode;
- enable continuous multi-section scrolling, publisher scripts, PDF support,
  native bridges, Readest services, or unrelated renderer capabilities;
- weaken ADR 0005, CSP, sandbox, remote-resource blocking, sanitization, or
  user-owned domain persistence to make the candidate pass; or
- call Playwright's Pixel 7 profile physical-device evidence.

The final recommendation is one of `compatible candidate`, `compatible with
bounded Bookhand patches`, `incompatible under current architecture`, or
`insufficient evidence`. Only the owner may turn that recommendation into an
adoption mission.

## Accepted baselines and oracle

- Bookhand baseline: commit `1743074` with official Foliate commit
  `78914aef4466eb960965702401634c2cb348e9b1`.
- Candidate repository: the owner-controlled public fork
  `https://github.com/jomi-se/foliate-js`. Its clean local checkout was observed
  at `10907a083726e8f1c4cdb617ee3cd07d77430038`; that newer HEAD is not the
  selected runtime candidate.
- Candidate commit: `ca3f118269f8d78811ef17a1b147363c321273d7`, parent
  `830b41e23752f7407cba1fc3464bdc2d06bd974b`, tree
  `aadf7414e1f8a297953f1845543ff8dc67f83505`, descended by 212 commits from
  merge base `6b11e1744346f60504b727984f7d42f0fef3ab54`. It is the same commit formerly
  selected from `readest/foliate-js`; the owner fork is now Bookhand's stable
  evaluation source.
- Exact archive URL:
  `https://github.com/jomi-se/foliate-js/archive/ca3f118269f8d78811ef17a1b147363c321273d7.tar.gz`.
  The observed archive SHA-256 is
  `d24cf72c42da663709a9f089bb69e00a3fee6d9b04edd8ca95bac1ea2aa72ba0`;
  W1 must independently verify the extracted file manifest against the local
  Git tree before treating this observation as final evidence.
- Source oracle: Bookhand's existing domain contracts, ADR 0005, production
  CSP, independently authored fixtures, and current unit/E2E suites.
- Candidate-source oracle: the fork contains a browser CFI harness at
  `tests/tests.html`/`tests/tests.js`/`tests/epubcfi-tests.js` using
  `console.assert`, but no package test command or broad paginator/view suite.
  W1 must run that harness with console assertions promoted to failures and
  record the absence of broader source tests as validation risk. Bookhand's
  differential behavior matrix remains the adoption oracle.
- Provenance oracle: the candidate archive's `LICENSE`, `package.json`, exports,
  third-party assets, dependency/build scripts, and archive digest.
- Behavioral inspiration from the AGPL Readest application is research only;
  it is not a source suite and cannot supply test or implementation bytes.

## Environment and validation readiness

The candidate archive is reachable through the exact HTTPS URL above and the
clean local owner-fork checkout contains the selected commit. SSH access to
GitHub is not available from this VM, but the spike does not need write access
or branch access. If the exact archive becomes unavailable, source and parity
targets are blocked rather than redirected to a floating ref.

The VM can run clean installation, source/package inspection, Vitest,
TypeScript, Vite production builds, bundle/CSP checks, Playwright Chromium,
and the Pixel 7 emulation suite. The ChatGPT Desktop controlled browser,
physical touch hardware, assistive technology, and credible hours-long memory
observation are unavailable before owner participation. Their targets remain
blocked or residual risks; headless Chromium is not a substitute.

Evidence belongs under the ignored
`artifacts/validation/reader-engine/re-001/` hierarchy. Every evidence manifest
records the Bookhand commit, baseline and candidate renderer commits, archive
URL and digest, Node/npm versions, browser executable/version, commands, exit
codes, and skipped surfaces.

## Milestones

### M1: reproducible candidate and fail-closed integration

Resolve the exact candidate artifact, inspect provenance/package deltas, make
the exact-match persistent-frame transform either apply deliberately or fail
the build, and establish clean candidate install/build/import compatibility.

Targets: `VAL-RE001-SOURCE`, `VAL-RE001-BUILD`, `VAL-RE001-BOUNDARY`.

### M2: domain and security compatibility

Run and, where coverage is genuinely absent, independently extend the
Bookhand-owned compatibility surface for lifecycle, exact anchors, frame
identity, containment, remasters, annotations, Tutor cues, indexing, and
search. Added tests describe Bookhand behavior and may not reproduce Readest
test structure.

Targets: `VAL-RE001-LIFECYCLE`, `VAL-RE001-FRAME`,
`VAL-RE001-CFI-TEXT`, `VAL-RE001-CFI-RICH`, `VAL-RE001-SECURITY`,
`VAL-RE001-REMASTER`, `VAL-RE001-OVERLAYS`, `VAL-RE001-SEARCH`,
`VAL-RE001-ANCHOR`, `VAL-RE001-LAYOUT`, `VAL-RE001-DIRECTION`, and
`VAL-RE001-INPUT`.

### M3: current reader regression and comparative evidence

Run the full production suite, desktop reader flow, Pixel 7 emulation, and a
bounded resource/performance comparison against the baseline. Demonstrate a
clean rollback. Preserve failures; do not patch unrelated product behavior to
obtain a green comparison.

Targets: `VAL-RE001-NAVIGATION`, `VAL-RE001-PERSISTENCE`,
`VAL-RE001-PRESENTATION`, `VAL-RE001-PIXEL`, `VAL-RE001-RESOURCES`, and
`VAL-RE001-ROLLBACK`.

### M4: owner-surface closure

When the owner is at the Desktop, exercise the reviewed candidate build inside
the actual ChatGPT controlled browser with genuine WebMCP discovery and the
ADR 0005 chapter/tutor/remaster path. Until then, the spike can recommend but
cannot claim controlled-browser compatibility.

Target: `VAL-RE001-DESKTOP-HOST`.

## Completion and disposition

The VM phase is complete when M1 through M3 have independent scrutiny and
real-browser verdicts, the full evidence matrix identifies every pass, fail,
and blocked surface, rollback is reproducible, and the research report states
whether M4 is the only remaining decision gate. The overall spike is not
closed until M4 passes or the owner explicitly accepts its absence.

No candidate source change is merged into `main` as part of this mission.
Bookhand-authored test, tooling, and documentation improvements may be proposed
for a separate reviewed commit when they are renderer-neutral and useful with
the current baseline.
