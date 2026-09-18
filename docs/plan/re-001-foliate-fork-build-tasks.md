# RE-001 work, validation, and gate topology

The contracts under `re-001-contract/` define done. This topology is frozen
only after clean-context contract review approves it. Worker self-checks are
supporting evidence; the root reviews every diff and independent validators
own the verdicts.

Workers use separate disposable Git worktrees/branches. The root reviews and
integrates commits in dependency order into one candidate evaluation branch.
No worker edits another lane's owned paths.

## W1: exact candidate package and transform integration

Owns: `VAL-RE001-SOURCE`, `VAL-RE001-BUILD`, `VAL-RE001-BOUNDARY`.

Use a clean-context Luna worker.

Path ownership:

- `package.json`, `package-lock.json`;
- `scripts/vite-foliate-persistent-frame-plugin.mjs`;
- new `scripts/re001-source-*` and one new transform/source-package unit spec;
- narrow `src/reader/foliate-types.ts` or `foliate-module.ts` compatibility
  edits only when build evidence proves they are required.

First preserve evidence that the baseline exact transform rejects candidate
source. Re-derive each replacement against candidate source, prove negative
drift fails, verify archive-to-local-Git identity, run the source CFI harness
to its 100-assertion completion contract, classify source/license/vendor and
all changed-file provenance, and establish a clean candidate install/build.
Write no Bookhand behavior fixture or E2E compatibility test.

The worker formats touched files, runs focused tests, clean-cache `npm ci`,
typecheck, production build, bundle/CSP checks, commits one W1 commit, and hands
off exact commands, failures, digests, manifests, and source-suite limits.

## W2: CFI, rich content, publisher layout, and direction fixtures

Depends on: root-reviewed W1.

Owns: `VAL-RE001-CFI-TEXT`, `VAL-RE001-CFI-RICH`, `VAL-RE001-LAYOUT`,
`VAL-RE001-DIRECTION`.

Use a clean-context Luna worker that must not inspect Readest application code
or tests.

Path ownership:

- `scripts/generate-epub-fixtures.mjs` and new generated RE-001 EPUB fixtures;
- fixture provenance under `tests/fixtures/epub/`;
- new `tests/unit/re001-cfi-parity.test.ts`;
- new `tests/e2e/re001-layout-direction.spec.ts`.

Independently design fixtures with semantic and trailing sentinels. Cover every
atomic contract case and make them reusable by later lanes. Format, regenerate
fixtures twice to prove idempotence, run focused units and production-browser
cases, commit one W2 commit, and report baseline/candidate matrices and
provenance.

## W3: anchor and iframe-input parity

Depends on: integrated W2 fixtures.

Owns: `VAL-RE001-ANCHOR`, `VAL-RE001-INPUT`.

Use a clean-context Luna worker.

Path ownership: new `tests/e2e/re001-anchor-input.spec.ts` only. Any required
fixture change returns to W2; no production or shared test-helper edits.

Exercise resize/style/media anchor transitions, wheel inertia, editable focus,
selection/touch ownership, synthetic click suppression, and the 50-transition
listener series. Format, run the focused baseline/candidate browser matrix,
commit one W3 commit, and distinguish emulated input from physical evidence.

## W4: lifecycle, frame, and containment probes

Depends on: root-reviewed W1; may be developed independently of W2/W3 in its
own worktree.

Owns: `VAL-RE001-LIFECYCLE`, `VAL-RE001-FRAME`, `VAL-RE001-SECURITY`.

Use a clean-context Luna worker.

Path ownership:

- new `tests/e2e/re001-lifecycle-frame-security.spec.ts`;
- new lane-local helper under `tests/support/re001-core-*` only if unavoidable;
- no production code, fixture generator, or existing shared test edits.

Keep harness fault interleavings separate from production recovery. Record the
full frame transition matrix and request/request-failed/response evidence,
including storage/bridge sentinels and safe packaged content. Format, run
focused unit/harness/production cases, verify production test-control
exclusion, commit one W4 commit, and report per-target evidence.

## W5: remaster, overlay, search, and navigation probes

Depends on: integrated W2 fixtures and root-reviewed W4 frame evidence.

Owns: `VAL-RE001-REMASTER`, `VAL-RE001-OVERLAYS`, `VAL-RE001-SEARCH`,
`VAL-RE001-NAVIGATION`.

Use a clean-context Luna worker.

Path ownership: new `tests/e2e/re001-product-contracts.spec.ts` only. No
production, fixture-generator, shared-helper, dependency, or transform edits.

Map existing suites, add only missing atomic cases, keep search navigation-only,
and collect exact source/frame/domain outcomes rather than aggregate suite
claims. Format, run focused production and genuine-WebMCP tests, commit one W5
commit, and report the full target matrix.

## W6: persistence and presentation probes

Depends on: root-reviewed W1; may be developed independently of W2-W5 in its
own worktree.

Owns: `VAL-RE001-PERSISTENCE`, `VAL-RE001-PRESENTATION`.

Use a clean-context Luna worker.

Path ownership: new `tests/e2e/re001-persistence-presentation.spec.ts` only.
No production, fixture, helper, dependency, or transform edits.

Record live/queued/persisted position transitions and pre-spike data reopen;
exercise the exact style/focus/selection/custom-CSS state machine in the
contracts. Format, run focused baseline/candidate production cases, commit one
W6 commit, and report atomic evidence.

## W7: fixed comparative runner, Pixel, resources, and rollback

Depends on: integrated W1 through W6.

Owns: `VAL-RE001-PIXEL`, `VAL-RE001-RESOURCES`, `VAL-RE001-ROLLBACK`.

Use a clean-context Luna worker.

Path ownership:

- new renderer-neutral `scripts/re001-compare-*` scripts;
- ignored evidence artifacts/manifests;
- no production source, dependency, transform, fixture, or test edits.

Run complete production Chromium and Pixel projects, the fixed 20-cycle and
100-turn resource probe including workers/canvases, bundle/package comparison,
and clean-cache rollback with pre-spike data reopen and residue scan. Format and
test retained scripts, commit only portable tooling, and leave generated
evidence ignored. Return behavior failures to their owning lane.

## V1: provenance, implementation, and evidence scrutiny

Depends on: integrated W1 through W7.

Targets: `VAL-RE001-SOURCE`, `VAL-RE001-BUILD`, `VAL-RE001-BOUNDARY`,
`VAL-RE001-LIFECYCLE`, `VAL-RE001-FRAME`, `VAL-RE001-CFI-TEXT`,
`VAL-RE001-CFI-RICH`, `VAL-RE001-SECURITY`, `VAL-RE001-REMASTER`,
`VAL-RE001-OVERLAYS`, `VAL-RE001-SEARCH`, `VAL-RE001-ANCHOR`,
`VAL-RE001-LAYOUT`, `VAL-RE001-DIRECTION`, `VAL-RE001-INPUT`,
`VAL-RE001-NAVIGATION`, `VAL-RE001-PERSISTENCE`,
`VAL-RE001-PRESENTATION`, `VAL-RE001-PIXEL`, `VAL-RE001-RESOURCES`, and
`VAL-RE001-ROLLBACK`.

Use the `scrutiny-validator` skill in a clean worktree at the exact integrated
candidate commit. Reserve a distinct server port, isolated browser profile,
fresh temporary npm cache, and V1-only Playwright output directory; do not use
V2's resources. V1 uses port `4191`, a fresh temporary directory supplied as
`TMPDIR` so Playwright-created ephemeral Chromium user-data directories live
under the V1 profile root, npm cache `v1-npm-cache`, and output
`artifacts/validation/reader-engine/re-001/v1-scrutiny/playwright`. Browser
hard-gate commands use this exact shape from the V1 worktree:
`TMPDIR=<fresh-v1-profile-root> NPM_CONFIG_CACHE=<fresh-v1-npm-cache> BOOKHAND_E2E_PORT=4191 npm run test:e2e:built -- --workers=1 --output=artifacts/validation/reader-engine/re-001/v1-scrutiny/playwright`.
Write evidence under the ignored
`artifacts/validation/reader-engine/re-001/v1-scrutiny/` prefix. Do not edit
implementation or retry a behavioral failure; at most one rerun is allowed for
a demonstrated infrastructure-only failure, with both logs retained.

Inspect every commit, rerun hard gates, verify the exact transform fails
closed, and classify every changed file/byte as candidate MIT, pre-existing
Bookhand, or independently authored Bookhand. Review generated/vendor assets,
MIT notice retention, and every new test/fixture/comment/structure for AGPL
derivation. Output one table row per target:
`target | passed|failed|blocked | evidence paths | concise reason`. Missing or
wrong-surface evidence is failed/blocked, never passed.

## V2: real-browser compatibility

Depends on: completed V1. Run sequentially after scrutiny so validator resource
isolation does not become a second engineering project.

Targets: `VAL-RE001-LIFECYCLE`, `VAL-RE001-FRAME`,
`VAL-RE001-CFI-TEXT`, `VAL-RE001-CFI-RICH`, `VAL-RE001-SECURITY`,
`VAL-RE001-REMASTER`, `VAL-RE001-OVERLAYS`, `VAL-RE001-SEARCH`,
`VAL-RE001-ANCHOR`, `VAL-RE001-LAYOUT`, `VAL-RE001-DIRECTION`,
`VAL-RE001-INPUT`, `VAL-RE001-NAVIGATION`, `VAL-RE001-PERSISTENCE`,
`VAL-RE001-PRESENTATION`, `VAL-RE001-PIXEL`, and
`VAL-RE001-RESOURCES`.

Use the `user-testing-validator` skill. Use separate baseline and candidate
worktrees. Baseline uses port `4192`, `TMPDIR=<fresh-v2-baseline-profile-root>`,
`NPM_CONFIG_CACHE=<fresh-v2-baseline-npm-cache>`, and output
`artifacts/validation/reader-engine/re-001/v2-browser/baseline-playwright`.
Candidate uses port `4193`, its own fresh `TMPDIR` and npm cache, and output
`artifacts/validation/reader-engine/re-001/v2-browser/candidate-playwright`.
Each command uses this shape:
`TMPDIR=<lane-profile-root> NPM_CONFIG_CACHE=<lane-npm-cache> BOOKHAND_E2E_PORT=<4192-or-4193> npm run test:e2e:built -- --workers=1 --output=<lane-output>`.
Run immutable baseline and candidate production builds with identical fixtures
and Playwright project settings. Write evidence under
`artifacts/validation/reader-engine/re-001/v2-browser/`. Review console,
request, response, request-failed, frame, and visible state. Do not edit code;
allow at most one infrastructure-only rerun with both attempts preserved.
Output `target | passed|failed|blocked | evidence paths | concise reason` for
every assigned target. Source inspection, unit tests, or aggregate full-suite
success cannot pass a browser target without its required atomic evidence.

## G1: VM evidence gate and research report

Depends on: V1 and V2.

The root reconciles findings, reruns only disputed evidence, classifies the
candidate as `compatible candidate`, `compatible with bounded Bookhand
patches`, `incompatible under current architecture`, or `insufficient
evidence`, and writes
`docs/research/2026-09-18-re001-foliate-fork-compatibility-spike.md`. Include
exact commits/digests, patch delta, atomic matrix, failures, blocked surfaces,
source-suite limitation, rollback result, and minimal Desktop recipe. Update
`current-work.md`, the live progress ledger, and reader-engine backlog without
approving RE-004.

## W8: owner-assisted controlled-browser run

Owns: `VAL-RE001-DESKTOP-HOST`.

Depends on: G1 and owner access to ChatGPT Desktop. The Windows Desktop
controller exercises the reviewed candidate build. SSH/tmux may transport
instructions but cannot substitute for browser proof. While access is absent
the target remains blocked, never passed. Evidence prefix:
`artifacts/validation/reader-engine/re-001/w8-desktop-host/`.

## V3: independent controlled-browser evidence review

Depends on: W8. A validator other than the W8 operator ties evidence to exact
assets, verifies genuine WebMCP and frame/network observations, reproduces
locally available portions, and outputs the standard per-target verdict row
under `artifacts/validation/reader-engine/re-001/v3-desktop-review/`.

## G2: RE-001 closure

Depends on: V3. Append the controlled-browser verdict and close RE-001 only if
it passes. If the owner accepts the missing evidence instead, record that
explicit risk in an ADR or dated mission decision and in the progress ledger
before closure; topology prose alone is not acceptance.

## Integration rules

- Workers start only after root review of their prerequisites and never overlap
  mutable path ownership.
- Each worker owns coding, formatting, focused verification, and one coherent
  disposable-branch commit; the root reviews all diffs and reruns hard gates.
- No worker pushes, deploys, mutates the owner fork, or reads the Readest app.
- The candidate dependency is never merged to `main` by this mission.
- Renderer-neutral test/tooling changes stay separable from candidate pinning.
