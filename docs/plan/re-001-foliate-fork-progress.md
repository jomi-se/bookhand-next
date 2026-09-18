# RE-001 live progress ledger

This is the resumable state for the disposable Foliate fork compatibility
spike. Update it at every planning revision, worker handoff, root review,
validator verdict, gate, commit, and newly discovered blocker. Detailed raw
logs belong in ignored validation artifacts; this file keeps the durable,
concise state and pointers.

Last updated: 2026-09-17 22:44 UTC.

## Current state

- **Phase:** planning frozen at a proportionate evidence-first spike; preparing W1.
- **Production adoption:** not authorized; no candidate dependency change has
  been made on `main`.
- **Main checkout:** clean before the new uncommitted RE-001 planning files;
  HEAD `1743074` when the mission began.
- **Candidate source:** clean local owner-fork checkout at
  `/home/dev/foliate-js`, branch `main`, HEAD
  `10907a083726e8f1c4cdb617ee3cd07d77430038`.
- **Selected runtime candidate:**
  `ca3f118269f8d78811ef17a1b147363c321273d7`, present in the local fork. The
  newer fork HEAD is not silently substituted.
- **Owner-fork policy:** local checkout is read-only for this mission; no pull,
  checkout, commit, push, tag, or publication.
- **Active agent:** none. Five review passes have ended; no further contract
  review loop is planned.
- **Next action:** commit the planning/ledger checkpoint, create one disposable
  candidate worktree, and dispatch W1 for the exact pin, frame transform,
  source harness, clean build, and focused tests.

## Completed checkpoints

### Planning investigation

- Confirmed RE-001 is the selected P0 pinned-fork compatibility spike.
- Read the product North Star, implementation defaults, vertical-slice order,
  reader-engine backlog/specifications, ADR 0005, current adapter/types,
  persistent-frame transform, package pin, Playwright projects, and current
  reader/containment/remaster/search/Tutor test surfaces.
- Confirmed the exact candidate archive is reachable over HTTPS.
- Confirmed the local owner fork is clean, MIT licensed, at `10907a0`, and
  contains `ca3f118`.
- Confirmed SSH authentication to GitHub is unavailable on this VM. This does
  not block read-only local-source inspection or exact HTTPS archive install.
- Wrote the provisional mission charter, capability inventory, validation
  contracts, and work/validation/gate topology. They are not frozen until two
  sequential contract reviews pass.
- First clean-context contract review rejected the initial set. The revision:
  fixed candidate/baseline/archive identity; added the candidate CFI source
  harness and its missing-suite risk; corrected CSP evidence to allow blocked
  attempts but no completed off-origin response; split CFI, navigation,
  persistence, and presentation; added anchor/layout/direction/input targets;
  removed nonexistent search overlays; quantified resource probes; strengthened
  rollback/data evidence; made AGPL provenance review explicit; separated
  worker paths; and assigned the Desktop target to W5 plus independent V3.
- Second clean-context review rejected the revision. The next revision aligned
  the canonical spec on `jomi-se/foliate-js`; narrowed Pixel to its actual
  project coverage; bound preservation targets to immutable baseline runs;
  embedded exact baseline and AGPL provenance requirements in contracts; split
  broad workers into seven bounded lanes; made validator targets, isolation,
  artifact prefixes, retry limits, and result schema explicit; added
  worker/canvas accounting; strengthened the source harness to a 10-second
  completion sentinel with exactly 100 assertions and zero console/page/
  rejection errors; and replaced subjective presentation equivalence with
  exact state transitions.
- An exploratory run against the clean owner-fork HEAD reached an explicit
  completion sentinel, invoked 100 CFI assertions, and reported no failures or
  page errors. The `tests/` tree is byte-identical between HEAD and `ca3f118`,
  but W1 must still execute the harness against the actual candidate source.
- Third review confirmed candidate identity, source-harness anti-fake-pass,
  provenance, resource accounting, one-owner work lanes, and Desktop closure,
  but rejected four inconsistencies. The revision pins the exact Bookhand and
  official Foliate baseline in every preservation target; narrows the Pixel
  inventory to its actual eight-test surface; defines anchor settle as 5,000 ms
  with the only accepted fallback being the visible section error plus enabled
  Try again while the last safe passage remains; and isolates V1's port,
  profile, npm cache, and Playwright output from V2.
- Fourth review found that isolation still lacked executable profile paths,
  search accidentally required nonexistent remaster reindexing, and the anchor/
  frame contract disallowed Bookhand's intentional stalled-view replacement.
  The revision now assigns concrete V1/V2 ports, `TMPDIR` profile roots, npm
  caches, output directories, and command shapes; limits search to current
  publisher-source indexing while explicitly refusing a remaster-reindex claim;
  and models navigation timeout as a 5-second trigger followed by at most two
  10-second speculative open/init deadlines, with the old frame visible until
  an atomic new-lifetime swap or visible Retry failure.
- The fifth pass confirmed the 22-target ownership, search boundary, timeout
  arithmetic, and command viability, then found that two contracts forgot the
  intentionally mounted hidden speculative recovery view. Those contradictions
  are fixed. At the owner's request to keep the spike proportionate, validation
  lanes will run sequentially and contract review stops here; implementation
  evidence now has priority over more planning ceremony.

### Validation readiness

- Focused baseline reader unit command passed:
  `npm run test:unit -- tests/unit/reader-adapter.test.ts tests/unit/reader-foliate-fixture.test.ts tests/unit/reader-text.test.ts tests/unit/reader-chunking.test.ts tests/unit/tap-intent.test.ts`.
- Baseline `npm run build` passed in a separate bounded rerun.

## Active target state

All targets are `planned`, not passed. `VAL-RE001-DESKTOP-HOST` is additionally
`blocked-owner-surface` until ChatGPT Desktop access is available.

## Change ledger

| Time (UTC) | Change | Review/evidence state |
| --- | --- | --- |
| 2026-09-17 22:00 | Added mission, inventory, provisional topology, and 14 validation assertions. | Awaiting two contract reviews. |
| 2026-09-17 22:02 | Added this live progress ledger at owner request. | Update at every handoff and gate. |
| 2026-09-17 22:06 | Re-ran the baseline production build independently. | Passed. |
| 2026-09-17 22:18 | Incorporated all first-review blockers and expanded the contract from 14 broad assertions to 22 narrower assertions. | Awaiting mechanical audit and second review. |
| 2026-09-17 22:25 | Incorporated all second-review blockers and split implementation into seven bounded Luna lanes plus owner-assisted Desktop closure. | Awaiting mechanical audit and third approval review. |
| 2026-09-17 22:31 | Incorporated the third review's four remaining blockers. | Awaiting fourth clean-context approval review. |
| 2026-09-17 22:39 | Incorporated the fourth review's three remaining blockers. | Awaiting fifth clean-context approval review. |
| 2026-09-17 22:44 | Fixed speculative-recovery count semantics and ended the disproportionate review loop. | Planning frozen; W1 next. |

## Known blockers and residual limits

- Actual ChatGPT controlled-browser evidence requires owner/Desktop access.
- Physical touch and assistive-technology claims are outside the VM evidence
  available tonight.
- Credible hours-long memory behavior will remain unproven unless a bounded
  long-run probe is practical; short repeated-cycle evidence must not be
  mislabeled.
- The local owner fork lacks the official Bookhand baseline commit object; use
  Bookhand's exact installed/archive artifact for baseline comparison rather
  than mutating or fetching into the owner-fork checkout.
