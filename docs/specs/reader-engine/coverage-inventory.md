# Reader-engine research coverage inventory

This inventory makes omissions and residual unknowns visible. `Adopt` means
adopt a compatible MIT renderer capability after the update gate; `Independent`
means implement Bookhand-owned behavior without copying the AGPL application;
`Defer` means a separately approved future scope; `Reject` means do not inherit
the behavior or architecture.

| Capability family | Evidence class | Bookhand disposition | Specification |
| --- | --- | --- | --- |
| Renderer/view open, close, replacement, teardown | Mixed | Adopt MIT lifecycle guards; keep Bookhand ownership | [Lifecycle](lifecycle-loading-and-recovery.md) |
| EPUB package parsing, metadata, covers, hrefs, XML/XHTML fallback | MIT renderer | Adopt after hostile/malformed corpus proof | [Lifecycle](lifecycle-loading-and-recovery.md) |
| Resource/object-URL lifetime across concurrent views | MIT renderer | Adopt concept; adapt to persistent frame | [Lifecycle](lifecycle-loading-and-recovery.md) |
| Paginated reflow and spread calculation | MIT renderer | Adopt after parity proof | [Reflow](reflow-scrolling-and-anchoring.md) |
| Scrolled reflow, adjacent-section preload and eviction | MIT renderer | Defer adoption pending frame decision; spike only | [Reflow](reflow-scrolling-and-anchoring.md) |
| Resize, style, font, image, and flow-switch anchoring | MIT renderer | Adopt | [Reflow](reflow-scrolling-and-anchoring.md) |
| CFI, href, TOC, page-list, fraction, section, and result targets | MIT renderer | Adopt unified semantics; reject estimates as canonical | [Navigation](navigation-progress-and-input.md) |
| Relocation, progress projection, restoration, and history | Mixed | Adopt renderer facts; implement persistence independently | [Navigation](navigation-progress-and-input.md) |
| Search traversal and transient result overlays | Mixed | Keep Bookhand FTS/index; adopt exact target convergence | [Navigation](navigation-progress-and-input.md) |
| LTR, RTL, vertical-rl, vertical-lr | MIT renderer plus app mapping | Adopt LTR/RTL/vertical-rl after fixtures; mark vertical-lr incomplete | [Navigation](navigation-progress-and-input.md) |
| Wheel, touch, mouse, keyboard, synthetic clicks | Mixed | Adopt renderer hooks; implement ownership independently | [Navigation](navigation-progress-and-input.md) |
| Hardware keys, stylus, volume buttons, e-ink refresh | AGPL/native behavior | Defer | [Presentation](presentation-and-format-boundaries.md) |
| Selection and CFI range round trips | Mixed | Adopt primitives; keep Bookhand fingerprints | [Selection](selection-annotations-and-accessibility.md) |
| Highlights, notes, tutor/search overlays | Mixed | Adopt MIT geometry; implement policy independently | [Selection](selection-annotations-and-accessibility.md) |
| Footnotes and link handling | Mixed | Adopt parser capability; implement popup UX independently | [Selection](selection-annotations-and-accessibility.md) |
| Keyboard focus, iframe naming, off-screen accessibility | MIT renderer | Adopt with real AT validation | [Selection](selection-annotations-and-accessibility.md) |
| Publisher CSS, fonts, media, tables, full-bleed covers | MIT renderer | Adopt compatible hardening | [Presentation](presentation-and-format-boundaries.md) |
| Bookhand style and custom CSS lifecycle | Bookhand constraint | Preserve independently | [Presentation](presentation-and-format-boundaries.md) |
| Fixed-layout EPUB | MIT renderer | Defer as separate scope | [Presentation](presentation-and-format-boundaries.md) |
| PDF and comics/CBZ | MIT renderer plus app/native assumptions | Defer; reject bundled expansion | [Presentation](presentation-and-format-boundaries.md) |
| TTS and media overlays | Mixed | Defer as separate accessible-media scope | [Presentation](presentation-and-format-boundaries.md) |
| Autoscroll | Mixed | Defer separately; retain progress lesson | [Presentation](presentation-and-format-boundaries.md) |
| Page-turn animation | Mixed | Reject from correctness upgrade; possible later scope | [Presentation](presentation-and-format-boundaries.md) |
| Memory bounds, preload limits, concurrent loads | MIT renderer | Adopt explicit budgets and cancellation | [Security/performance](security-performance-and-async-integrity.md) |
| Async races, stale results, background/unmount flush | Mixed | Implement independently where application-owned | [Security/performance](security-performance-and-async-integrity.md) |
| CSP, script blocking, remote resources, native bridges | Bookhand conflict | Preserve Bookhand policy; reject Readest permissiveness | [Security/performance](security-performance-and-async-integrity.md) |
| Malformed books and partial failure recovery | MIT renderer plus Bookhand UX | Adopt bounded fallbacks; implement recovery UX independently | [Lifecycle](lifecycle-loading-and-recovery.md) |
| Renderer source tests and application regression catalogue | Mixed license | Re-author Bookhand fixtures/assertions; never copy AGPL artifacts | All topical specs |
| Package pin, notices, diff review, rollback | MIT/provenance | Mandatory gate | [Fork gate](fork-integration-and-update-gate.md) |

## Investigated source surface

MIT renderer modules included `view.js`, `paginator.js`, `fixed-layout.js`,
`epub.js`, `epubcfi.js`, `progress.js`, `search.js`, `overlayer.js`,
`footnotes.js`, `pdf.js`, `comic-book.js`, `mobi.js`, `fb2.js`, `tts.js`, package
metadata, build inputs, and bundled third-party PDF assets. The post-divergence
history and touched paths were classified through `ca3f118`.

AGPL application inspection included the reader integration, pagination and
event hooks, progress autosave, captured turns, touch interception, renderer
listener ownership, iframe event handling, wheel intent, search navigation,
annotation/selection flows, footnote UI, auto-scroll, and the document/reader
regression catalogue at `180795fb`.

Bookhand comparison included the public reader domain, `FoliateReaderAdapter`,
persistent-frame transform, containment/custom-CSS rules, remaster source and
revision boundaries, search/chunking, reader E2E and unit suites, current
contracts, ADR 0005, and active-work truth.

## Current Bookhand evidence and remaining gaps

| Area | Current evidence inspected | Gap exposed by this study |
| --- | --- | --- |
| Adapter and lifecycle | `tests/unit/reader-adapter.test.ts`, `VAL-READER-ADAPTER-CONTRACT`, `VAL-READER-LIFECYCLE` | Long-session resource accounting, adjacent-view ownership, and broader malformed-package races |
| CFI, text, and search | `reader-foliate-fixture.test.ts`, `reader-text.test.ts`, `reader-chunking.test.ts`, `search-book.spec.ts` | RTL/vertical fixtures, styled-node search overlays, page-list and fragment-only navigation |
| Reader surface and restore | `reader-without-agent.spec.ts`, `reader-mobile.spec.ts`, `VAL-READER-NAV`, `VAL-READER-RESTORE`, `VAL-READER-STYLE` | Resize/flow round-trip anchors, delayed background images, wheel inertia, and physical-device gestures |
| Security | `epub-containment.spec.ts`, custom-CSS tests, `VAL-EPUB-CONTAINMENT`, `VAL-EPUB-RESOURCE-POLICY` | Re-run against any multi-view loader, parser fallback, new worker asset, or footnote resource path |
| Annotations and guidance | adapter/unit coverage and `tutor-guidance.spec.ts` | Multi-section overlay geometry, off-screen accessibility exposure, footnote popup lifecycle, and touch ownership |
| Remaster | remaster unit suites and `remaster-agent.spec.ts` | Anchor/overlay behavior through renderer flow switches and any adjacent-section cache |
| Format breadth | Reflowable EPUB is covered by current scope | Fixed layout, PDF, comics, TTS, and autoscroll have no Bookhand acceptance surface and remain deferred |

This table is a research gap map, not a new contract or task list. Current
tests remain authoritative only for the behavior they actually exercise.

## Known gaps

- No Readest suite or application runtime was executed.
- No source-to-target differential harness exists yet.
- No EPUB corpus coverage measure establishes how representative the inspected
  Readest fixtures are.
- Browser-extension compatibility, Safari/iOS behavior, and native WebView
  integrations are source claims, not Bookhand evidence.
- Fixed-layout, PDF, comics, TTS, autoscroll, and animation were inventoried
  but not specified as current product commitments.
- The one-frame versus multi-view continuous-scroll architecture remains the
  largest unresolved compatibility question.
