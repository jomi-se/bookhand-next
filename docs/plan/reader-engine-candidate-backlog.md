# Reader-engine candidate backlog and selection workflow

Status: prioritized candidate workstreams, not approved implementation tasks.

This backlog converts the
[reader-engine specifications](../specs/reader-engine/README.md) into choices
for future missions. It deliberately stops before detailed implementation
plans, `VAL-*` contracts, task graphs, dependency changes, or production
adoption. Those belong to the focused planning pass after the owner selects one
candidate.

## Decision principles

Candidates are ordered by:

1. user-visible reading value;
2. prerequisite leverage for later work;
3. reduction of security, data, or architecture risk;
4. ability to validate independently;
5. implementation and maintenance cost; and
6. reversibility.

Priority labels mean:

- **P0 foundation:** establish evidence or settle a blocking boundary before a
  production renderer change;
- **P1 correctness:** high-value reader behavior that should precede feature
  breadth or polish;
- **P2 capability:** worthwhile behavior after the foundation is trustworthy;
- **P3 separate product:** useful but outside the current reflowable-EPUB
  mission;
- **Reject:** an observed Readest choice that Bookhand should not inherit.

Effort is deliberately coarse until a candidate receives a focused
investigation: **S** is one bounded mission, **M** spans several coherent
implementation surfaces, and **L** requires an architectural or product slice.

## P0 foundation candidates

### RE-001 — Pinned MIT-fork compatibility spike

- **Outcome:** prove or disprove whether
  `jomi-se/foliate-js@ca3f118269f8d78811ef17a1b147363c321273d7` can replace the
  current official Foliate pin behind `ReaderAdapter` without becoming a
  production dependency.
- **Value:** establishes whether the rest of the renderer backlog rests on a
  viable foundation.
- **Scope:** disposable dependency bump, minimum compatibility patching,
  complete existing Bookhand verification, provenance/bundle inspection, and
  evidence recorded against the
  [compatibility checklist](../specs/reader-engine/fork-integration-and-update-gate.md#disposable-compatibility-spike-checklist).
- **Must prove:** build/import compatibility, exact CFI behavior, open/close and
  StrictMode safety, annotations, remasters, local search, hostile EPUB
  containment, current desktop/Pixel flows, and whether ADR 0005's exact-match
  persistent-frame transform still applies.
- **Non-goal:** no production adoption, continuous scroll enablement, Readest
  application code, or owner-fork mutation.
- **Dependencies:** none.
- **Unlocks:** RE-004 and every fork-backed P1/P2 candidate.
- **Risk:** high integration uncertainty, low lasting-change risk because the
  spike is disposable.
- **Effort:** M.

### RE-002 — Bookhand-owned reader regression corpus and observability

- **Outcome:** independently authored EPUB fixtures and instrumentation expose
  the failures the renderer must solve before implementation begins.
- **Value:** turns Readest's AGPL regression catalogue into Bookhand-owned,
  license-clean oracles rather than optimistic source inference.
- **Scope:** fixtures for delayed/broken media, hostile publisher CSS, encoded
  paths, malformed markup, LTR/RTL/vertical-rl, resize/style reflow, multi-node
  selection, footnotes, and lifecycle races; resource/listener/view counters;
  quote-plus-CFI anchor assertions.
- **Must prove:** each fixture fails or exercises a named current risk, has
  documented provenance, and can run against both the current and candidate
  renderer without source-specific shortcuts.
- **Non-goal:** fixing the exposed behavior or copying Readest fixtures/tests.
- **Dependencies:** none.
- **Unlocks:** stronger RE-001 evidence and all correctness missions.
- **Risk:** low product risk; principal risk is building fixtures that do not
  reproduce the intended browser behavior.
- **Effort:** M.

### RE-003 — Persistent-frame versus multi-view architecture experiment

- **Outcome:** decide whether continuous multi-section rendering can coexist
  with Bookhand's one persistent same-origin frame, requires a different
  single-frame design, or warrants replacing ADR 0005.
- **Value:** resolves the largest known architectural conflict before
  continuous scrolling or adjacent-view lifecycle leaks into production.
- **Scope:** bounded prototypes and evidence for frame identity, CSP,
  annotations, selection, remaster switching, extraction, focus/accessibility,
  resource lifetime, and section-boundary scrolling.
- **Must produce:** options, observed tradeoffs, security implications, and an
  ADR proposal or a confirmed decision that ADR 0005 remains unchanged.
- **Non-goal:** shipping continuous scroll or weakening containment to make a
  prototype pass.
- **Dependencies:** benefits from RE-001 and RE-002 but may begin as an isolated
  architecture probe.
- **Unlocks:** RE-018.
- **Risk:** high architecture/security significance; all prototypes remain
  disposable until an ADR is accepted.
- **Effort:** M.

### RE-004 — Adopt one vetted fork commit behind `ReaderAdapter`

- **Outcome:** move Bookhand from the official Foliate pin to one reviewed
  owner-fork commit with notices, rollback, and no application-visible renderer
  leakage.
- **Value:** makes the compatible MIT renderer improvements available for
  focused adoption and removes dependence on an upstream repository URL.
- **Scope:** exact archive pin, lockfile/integrity, third-party notices,
  compatibility adaptations, rollback proof, and clean-install verification.
- **Dependencies:** RE-001 must pass; RE-003 must decide any unavoidable frame
  conflict. RE-002 supplies the preferred evidence floor.
- **Unlocks:** fork-backed P1/P2 behavior work.
- **Risk:** high because this changes the production reader foundation.
- **Effort:** M.

## P1 correctness candidates

### RE-010 — Lifecycle, resource ownership, and stale-work cancellation

- **Outcome:** competing opens, section loads, extraction, remaster refreshes,
  footnotes, overlays, and teardown cannot revoke live resources or commit stale
  results.
- **Primary gains:** fewer blank sections, indefinite spinners, detached-node
  errors, listener leaks, and book-A-content-in-book-B races.
- **Dependencies:** RE-004 for fork-specific implementation; RE-002 for strong
  proof.
- **Evidence:** fault injection, repeated/competing open-close cycles, active
  resource accounting, last-safe-surface recovery, and Retry.
- **Effort:** M.

### RE-011 — Content-anchor stability across resize, styles, and flow

- **Outcome:** the same passage remains visible across rotation, viewport and
  typography changes, late fonts/images, remaster switching, and page/scroll
  transitions.
- **Primary gains:** eliminates page drift and the feeling that changing a
  reading preference loses one's place.
- **Dependencies:** RE-002; RE-004 if using fork primitives.
- **Evidence:** quote-plus-CFI before/after round trips across independent
  fixtures, broken/hanging resources, fractional dimensions, and repeated
  portrait-landscape cycles.
- **Effort:** M.

### RE-012 — Unified targets, history, and durable-progress semantics

- **Outcome:** TOC, CFI, href, page-list, search, annotation, study citation,
  and agent focus all navigate through one exact target model; preview
  navigation never overwrites last-read state.
- **Primary gains:** predictable Back behavior, truthful progress, and fewer
  feature-specific navigation bugs.
- **Dependencies:** none for domain-policy work; RE-004 for renderer parity.
- **Evidence:** differential navigation to source quotes, explicit/implicit
  history transitions, pagehide/visibility/unmount flush, and preview versus
  confirmed reading.
- **Effort:** M.

### RE-013 — Reading direction and writing-mode correctness

- **Outcome:** logical previous/next, physical keys/taps/swipes, layout axis,
  and browser scroll sign remain distinct for LTR, RTL, and vertical-rl.
- **Primary gains:** correct non-LTR reading and a single direction model for
  UI, adapter, and future input work.
- **Dependencies:** RE-002 fixtures; RE-004 for complete fork behavior.
- **Evidence:** independent LTR/RTL/vertical-rl fixtures and physical-direction
  actions. Vertical-lr remains explicitly unsupported until separately proved.
- **Effort:** M.

### RE-014 — EPUB parsing and publisher-layout hardening

- **Outcome:** malformed-but-readable packages, encoded paths, covers, tables,
  media, fonts, backgrounds, and pathological publisher CSS fail safely or
  render without clipping later prose.
- **Primary gains:** broader real-world EPUB compatibility.
- **Dependencies:** RE-002 corpus; RE-004 if adopting fork parser/layout fixes.
- **Evidence:** licensed or independently authored hostile corpus, network/CSP
  observation, readable/selectable content, accessibility alternatives, and
  bounded fallback diagnostics.
- **Effort:** M.

## P2 capability candidates

### RE-015 — Iframe input and gesture ownership

- **Outcome:** wheel, keyboard, touch, mouse, selection, pinch, links, and
  trailing synthetic clicks have deterministic ownership and cause at most one
  intended action.
- **Value:** makes desktop trackpads and phone gestures reliable without
  stealing selection or editable controls.
- **Dependencies:** RE-013 direction model; physical-device validation for
  touch claims.
- **Effort:** M.

### RE-016 — Selection, overlays, footnotes, and accessibility integrity

- **Outcome:** saved ranges resolve to the same words, annotation/search/tutor
  overlays remain isolated, footnotes recover safely, and visible content has
  correct focus and assistive exposure.
- **Value:** protects Bookhand's study experience as rendering becomes more
  sophisticated.
- **Dependencies:** RE-002; RE-010 lifecycle; RE-013 for vertical/RTL geometry.
- **Effort:** M.

### RE-017 — Explicit performance budgets and long-session resource bounds

- **Outcome:** resident views, object URLs, documents, canvases, observers,
  listeners, pending work, reflow time, and persistence flush have measurable
  budgets and regression evidence.
- **Value:** prevents a reader that looks correct in short tests but degrades
  over hours or large books.
- **Dependencies:** instrumentation from RE-002 and lifecycle ownership from
  RE-010.
- **Effort:** M.

### RE-018 — Continuous multi-section scrolling

- **Outcome:** scrolling crosses EPUB section boundaries without blank flashes,
  dead ends, lost anchors, accessibility gaps, or unbounded memory.
- **Value:** the largest visible capability identified in Readest.
- **Dependencies:** accepted result from RE-003 plus RE-010, RE-011, RE-013,
  RE-016, and RE-017.
- **Risk:** high; this is a lifecycle architecture, not a display toggle.
- **Effort:** L.

### RE-019 — Repeatable owner-fork update and rollback tooling

- **Outcome:** an upstream candidate produces a bounded history/provenance/
  dependency/security report and cannot advance Bookhand's pin automatically.
- **Value:** makes later updates reviewable without pretending automation can
  approve them.
- **Dependencies:** RE-004 establishes the first production pin and rollback.
- **Effort:** S–M.

## P3 separate product candidates

These remain inventoried but are not eligible for ordinary renderer-correctness
rounds without a new product decision:

- **RE-030 — Fixed-layout EPUB:** spreads, cover side, fit modes, zoom/pan,
  virtualization, selection limitations, and a frame/CSP decision. **Effort L.**
- **RE-031 — PDF and comics:** workers/assets, canvas memory, text layers,
  labels, range concurrency, overlays, direction, and CBZ ordering. **Effort L.**
- **RE-032 — TTS, media overlays, and autoscroll:** segmentation, pronunciation,
  highlighting, audio focus, cancellation, navigation sync, reduced motion,
  and progress. **Effort L.**
- **RE-033 — Animation and native inputs:** page curls/slides, snapshot
  cancellation, GPU/WebKit paths, e-ink, stylus, volume, and hardware turners.
  **Effort L.**

## Explicit rejections

No implementation candidate should:

- copy Readest AGPL application code, tests, fixtures, comments, or close
  structural translations;
- use a floating Foliate branch or assume the registry package is the Readest
  fork;
- relax Bookhand's CSP, publisher-script, remote-resource, bridge, or
  persistent-frame rules merely to adopt a feature;
- replace exact CFI/domain state with byte-size location estimates;
- replace Bookhand's local FTS/remaster-aware retrieval with renderer search;
- introduce accounts, Readest sync/services, native bridges, or backend
  dependencies into ordinary reading;
- combine page-turn animation or deferred formats with a correctness mission;
  or
- call emulator evidence physical-device validation.

## Three-candidate selection workflow

Each round follows this loop:

1. **Present three.** The root agent filters to unblocked candidates and offers
   exactly three concise choices. Each choice states reader value, why now,
   dependencies, likely effort, highest risk, and the evidence required.
2. **Owner chooses one.** The owner may select, combine narrowly, defer, or ask
   for a different slate. No implementation begins before this choice.
3. **Plan the chosen mission together.** Investigate the exact current surface,
   settle open product/architecture questions with the owner, write or update
   the mission scope and capability inventory, author falsifiable `VAL-*`
   contracts, review those contracts twice, and only then create the work,
   validation, and gate topology.
4. **Launch bounded Luna workers.** After the plan is accepted, use clean-context
   `gpt-5.6-luna` subagents for independent implementation lanes with exact
   files, contracts, constraints, evidence, and non-goals. Do not give parallel
   workers overlapping mutable ownership. No worker may consult the AGPL
   Readest application.
5. **Integrate and review centrally.** The root agent inspects every diff,
   resolves cross-lane behavior, runs the hard gates, and commissions
   independent scrutiny and real-surface validation where the contracts
   require it. Worker summaries and green self-authored tests are supporting
   evidence, not acceptance.
6. **Land coherently.** Commit only the reviewed, integrated result in one or
   more concern-scoped commits. Do not push, publish, tag, mutate the owner
   fork, or deploy without a separate explicit owner instruction.
7. **Update the backlog.** Record evidence, newly unblocked work, rejected
   assumptions, regressions, and the next three eligible choices.

## Recommended first slate

The first round should choose among:

1. **RE-001 — Pinned MIT-fork compatibility spike** *(recommended)*: fastest
   path to learning whether the fork can actually become Bookhand's foundation.
2. **RE-002 — Regression corpus and observability**: safest investment and the
   strongest way to keep later work license-clean and evidence-led.
3. **RE-003 — Persistent-frame versus multi-view experiment**: attacks the
   largest architecture uncertainty before continuous scrolling becomes an
   assumed goal.

These three are complementary rather than redundant. The selected one becomes
a fully planned mission; the others remain available for later rounds.
