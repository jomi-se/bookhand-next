# Selection, annotations, footnotes, and accessibility

## User-visible goal

People can select exact text, save and revisit annotations, follow footnotes,
and operate the reader with keyboard or assistive technology without page turns
stealing gestures or off-screen preload content polluting the reading order.

## Why it matters

Selection and overlays cross iframe, layout, writing-mode, zoom, remaster, and
section-lifecycle boundaries. A visually plausible rectangle is not enough: the
saved source range must still resolve to the same words.

## Behavioral requirements

- **Mixed / adopt:** Pointer and keyboard selection produce normalized quote,
  exact range/start/end CFI, section identity, and text fingerprint. Resolution
  against a fresh accepted section returns the same source.
- **Verified MIT renderer / adopt:** Overlay geometry handles text split across
  styled and block nodes, headings, zoom, vertical layout, fixed-layout view
  boxes where applicable, and late-rendered text layers.
- **Bookhand requirement:** Permanent annotations, temporary tutor cues, and
  transient search results have separate identities, lifetimes, styling, and
  persistence. Clearing one cannot delete or disguise another.
- **Bookhand requirement:** An unresolvable or fingerprint-mismatched mark is
  skipped with visible/diagnostic repair state; it cannot anchor to unrelated
  words or make the reader fail to open.
- **Verified MIT renderer / adopt:** CFI-inert/skip markers let injected wrappers
  avoid changing addresses. Bookhand remasters must preserve the one-for-one
  structure required by its current CFI policy or explicitly migrate anchors.
- **Mixed / implement independently:** Footnote activation resolves the target,
  ignores hidden/unusable targets, tolerates empty or anchor-only structures,
  permits ordinary links deliberately, and keeps resource ownership valid while
  a popup is open.
- **Verified MIT renderer / adopt:** Navigating by keyboard or assistive control
  focuses a meaningful target. Iframes expose useful names. Only fully
  off-screen preloaded views are hidden from accessibility APIs; any content
  intersecting the viewport stays exposed.
- **Bookhand requirement:** Reader chrome retains accurate names, roles, states,
  logical focus order, visible focus, Escape/close focus restoration, 44px
  coarse-pointer targets, reduced-motion equivalence, and required contrast.

## Edge cases and failure modes

- Selection spans styled nodes, paragraphs, headings, multiple loaded sections,
  MathML/figure alternatives, or a remaster boundary.
- Touch long-press jitters or becomes a swipe; synthetic click follows a drag;
  keyboard extension uses platform word-selection modifiers.
- Overlay target is removed, hidden, off-screen, not yet rendered, or redrawn
  after flow/resize/zoom.
- A footnote is empty, nested in a list/definition, links elsewhere, shares the
  visible section resource, or never emits a relocation event.
- Multiple visible adjacent sections meet at the viewport boundary.

## Known footguns

- Saving only collapsed endpoints when the renderer draws a range CFI.
- Assuming all client rectangles share the top-level frame coordinate system.
- Hiding every non-primary frame from assistive technology.
- Letting a failed annotation draw abort section rendering.
- Copying Readest's AGPL selection hooks or test bodies instead of expressing
  Bookhand-owned behavior and fixtures.

## Bookhand constraints and conflicts

No live `Range`, node, document, frame, or overlay object crosses
`ReaderAdapter`. Annotations remain user-owned local records. Accepted remaster
revisions and publisher originals can change text/structure, so anchor repair
must be explicit and never silently retarget. Physical Pixel long-press remains
a best-effort target under the existing contract, not something emulation can
prove.

## Provenance and source pointers

- MIT renderer: `overlayer.js`, `epubcfi.js`, `footnotes.js`, `paginator.js`,
  `view.js` at `ca3f118`; history `920676b`, `4fbd77f`, `1309db7`,
  `345b246`, `57c9358`, `c558766`, `1bf1937`, `1ea3843`, `7657c78`.
- AGPL behavior: selection/annotation hooks, `FootnotePopup`, iframe keyboard
  and input-listener regressions at `readest@180795fb`.
- Bookhand: `VAL-READER-SELECTION`, `VAL-READER-ACCESSIBILITY`, annotation and
  tutor-cue paths in `FoliateReaderAdapter`.

## Validation ideas

Create independent fixtures for cross-node/block selections, headings, math,
figures, vertical text, styled excerpts, hidden footnotes, nested links, and
two simultaneously visible sections. Verify CFI round trips in fresh documents,
overlay recreation after reflow, annotation/tutor/search isolation, keyboard
selection and focus, accessibility-tree exposure, screen-reader navigation,
and physical-device touch when available.

## Adoption disposition

Adopt compatible MIT range, overlay, footnote, focus, and visibility behavior.
Implement selection/gesture policy and popup UI independently. Preserve
Bookhand's fingerprint and user-control safeguards.
