# Reflow, scrolling, and anchoring

## User-visible goal

The same words remain in view when the reader resizes, typography changes,
images and fonts settle, or the person switches between pages and scrolling.
Scrolling across section boundaries feels continuous without unbounded memory.

## Why it matters

Raw page numbers and pixel offsets are products of the current layout. They
become wrong after rotation, zoom, measure changes, late media, or a different
flow. Mature reading behavior preserves a content anchor and recomputes layout.

## Behavioral requirements

- **Verified MIT renderer / adopt:** Paginated reflow derives column/spread
  geometry from available size, reading axis, maximum measure, margins, and
  layout preference while avoiding fractional-pixel off-by-one pages.
- **Verified MIT renderer / adopt:** Media, tables, full-bleed covers,
  positioned wrappers, and over-tall unfragmentable boxes are constrained or
  normalized so they do not clip subsequent prose or create unexplained blanks.
- **Verified MIT renderer / adopt:** Resize, style changes, layout changes, and
  flow switches preserve a DOM/range/section content anchor, then emit a fresh
  durable location after layout settles.
- **Verified MIT renderer / adopt:** Late fonts and background images use a
  bounded stabilization window. A broken or hanging image cannot block opening
  forever; a late image above the target cannot silently move the saved passage.
- **Verified MIT renderer / evaluate:** Continuous scroll maintains bounded
  adjacent content, preloads backward before the top is reached, compensates
  when inserting content above, and evicts distant content without changing the
  visible words.
- **Verified MIT renderer / adopt:** The primary section is chosen by meaningful
  viewport occupancy, normally the center, rather than a one-pixel sliver.
- **Verified MIT renderer / adopt:** Sections with incompatible writing modes
  are not retained in one continuous strip.
- **Bookhand requirement:** A style/remaster reflow preserves the nearest
  accepted source passage and does not replace the persistent frame.

## Edge cases and failure modes

- Portrait-landscape-portrait round trips; browser zoom; 200 percent text zoom.
- A prior anchor remains visible during resize-generated scroll events.
- A section begins with a huge image, table, `inline-block`, background image,
  fractional-height container, or publisher-defined full-screen cover.
- Prepending a previous section changes total scroll height.
- Flow changes occur inside the scroll-relocation debounce window.
- An anchor resolves but has no client rectangles.
- A book changes writing mode between adjacent spine items.

## Known footguns

- Restoring a page index, whole-book percentage, or scroll offset after reflow.
- Measuring before custom styles, remasters, fonts, and bounded media settling.
- Treating the first visible section as primary when it contributes only a
  clipped edge.
- Preloading without eviction, or evicting above the viewport without scroll
  compensation.
- Using `inert` for content that is partly visible and must remain interactive
  and exposed to assistive technology.

## Bookhand constraints and conflicts

The fork's continuous strip is multi-iframe; Bookhand currently requires one
persistent frame. Continuous scrolling is therefore an evaluation target, not
an approved capability. Any alternative must preserve CSP, selection, overlays,
remaster switching, exact extraction, and frame identity. Bookhand's existing
style-before-location restore and one-final-pagination remaster behavior are
minimum compatibility requirements.

## Provenance and source pointers

- MIT renderer: `paginator.js` at `ca3f118`; history landmarks `e925e9d`,
  `c3b2d09`, `bf84163`, `f860916`, `befe16d`, `c5c09a9`, `d3baa52`,
  `f518015`, `d562f76`, `f6bce4c`, `887a0ae`.
- AGPL regression behavior: `paginator-paginated.browser.test.ts`,
  `paginator-scrolled.browser.test.ts`, `paginator-resize-anchor.browser.test.ts`,
  `paginator-scrolled-restore.browser.test.ts`, and
  `paginator-stabilization.browser.test.ts` at `readest@180795fb`.
- Bookhand: ADR 0005, `VAL-READER-STYLE`, `VAL-READER-RESTORE`, and remaster
  refresh behavior in `src/reader/FoliateReaderAdapter.ts`.

## Validation ideas

Author fixtures for delayed/broken background images, late fonts, oversized
inline boxes, wide tables, full-bleed covers, mixed writing modes, fractional
device-pixel sizes, and long multi-section books. Capture the visible quote and
CFI before and after resize, type changes, flow switches, remaster toggles, and
backward insertion. Measure resident sections, resource release, blank frames,
layout shifts, and scroll compensation during a long session.

## Adoption disposition

Adopt MIT pagination hardening and content-anchor restoration. Evaluate
continuous multi-section scroll only in the explicit compatibility spike;
defer production adoption until the persistent-frame conflict is resolved.
