# Presentation and format boundaries

## User-visible goal

Reflowable EPUBs remain readable despite difficult publisher CSS and media,
while Bookhand's typography controls remain reversible. More specialized
formats and presentation effects enter only as explicit future projects.

## Why it matters

Publisher content routinely assumes one engine, fixed dimensions, or invalid
CSS. The renderer must repair layout without erasing meaning. At the same time,
fixed-layout books, PDFs, comics, TTS, autoscroll, and page curls each carry
different interaction and validation obligations and must not hitchhike on a
reflowable correctness upgrade.

## Behavioral requirements

- **Verified MIT renderer / adopt:** Normalize relevant `-epub-` properties and
  break rules, constrain media, permit safe fragmentation of pathological
  inline boxes, and handle wide tables without losing readable content.
- **Verified MIT renderer / adopt:** Respect packaged fonts, backgrounds,
  textures, author colors, cover/full-bleed conventions, and dark themes while
  retaining sufficient contrast and a deterministic publisher baseline.
- **Bookhand requirement:** Font size, family, line height, paragraph spacing,
  measure, theme, page layout, and bounded custom CSS reflow around a content
  anchor. Preview, Cancel, Apply, reopen, and Reset remain observable and
  reversible; remote CSS resources remain blocked.
- **Bookhand requirement:** Remastered markup stays in ordinary EPUB flow,
  preserves semantics and alternatives, and cannot impose fixed viewport
  geometry, hidden overflow, nested columns, or remote/executable content.
- **Deferred fixed-layout scope:** If accepted later, specify spread policy,
  cover side, fit modes, page/intra-page anchor preservation, panning/pinch,
  bounded virtualization, RTL placement, seams, selection limits, and a new
  persistent-frame/CSP decision.
- **Deferred PDF/comics scope:** Treat PDF workers/assets, range concurrency,
  text layers, page labels, direction, canvas memory, annotation overlays, and
  CBZ natural ordering as independent format integrations.
- **Deferred TTS/media scope:** Define source segmentation, pronunciation,
  sentence/word highlighting, selection start, navigation synchronization,
  cancellation, audio focus, caching, and accessibility separately.
- **Deferred autoscroll scope:** Define subpixel motion, pause/control, input
  ownership, periodic relocation, reduced motion, and battery/performance.
- **Rejected from correctness upgrades:** Slide/curl/snapshot transitions,
  native GPU paths, e-ink refresh, stylus controls, and hardware page turners.
  They require explicit future approval and may never weaken reduced motion.

## Edge cases and failure modes

Late/system fonts, huge images, SVG/MathML, image-only equations with
alternatives, tables wider than a column, background covers, fractional device
pixels, publisher `overflow:hidden`, and different page colors across a spread.
For deferred formats: portrait single pages, mixed spreads, negative RTL scroll,
zoomed seams, async text layers, image-only fixed pages, and natural numeric
comic filenames.

## Known footguns

- Treating publisher CSS as trusted application CSS.
- Using viewport units as if they represented a single EPUB column.
- Resetting to a Bookhand theme instead of the named publisher baseline.
- Pulling PDF.js and large licensed assets into the web bundle as a side effect
  of adopting EPUB fixes.
- Combining animation snapshots with selection/overlay correctness work.

## Bookhand constraints and conflicts

Current product scope is reflowable EPUB. Custom CSS must pass the existing
resource-policy corpus. Rendering, extraction, citation, indexing, annotations,
and remasters must agree on the accepted document. Generated study labs remain
separate from EPUB presentation. Reduced motion and accessible source meaning
outweigh animation fidelity.

## Provenance and source pointers

- MIT renderer: `paginator.js`, `fixed-layout.js`, `pdf.js`, `comic-book.js`,
  `tts.js`, `epub.js` at `ca3f118`; history includes `f518015`, `d88daae`,
  `43f7831`, `4088d28`, `6f1a190`, `8bcb61e`, `663e630`, `e098bc3`,
  `4735c0a`, `6992cfe`, `c50a7b1`.
- AGPL behavior: layout settings, captured turns, autoscroll and TTS integration,
  plus format regressions under `apps/readest-app/src/__tests__/` at `180795fb`.
- Bookhand: `VAL-READER-STYLE`, `VAL-CUSTOM-CSS-SAFETY`,
  `VAL-EPUB-RESOURCE-POLICY`, and remaster requirements.

## Validation ideas

Maintain a licensed/created hostile-EPUB corpus for tables, covers, media,
MathML/SVG, author colors, fonts, backgrounds, and fragmentation. Compare text,
accessibility names, selectable meaning, network requests, visible anchors, and
publisher-reset state before/after styles and remasters. Do not claim deferred
formats from source inspection; each needs its own fixtures, performance budget,
real-surface suite, and product decision.

## Adoption disposition

Adopt compatible MIT reflow and publisher-content hardening. Preserve Bookhand's
style/remaster lifecycle independently. Defer fixed layout, PDF, comics, TTS,
autoscroll, animation, and native input as separate scopes.
