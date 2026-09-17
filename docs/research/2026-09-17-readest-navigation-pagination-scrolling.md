# Readest navigation, pagination, and scrolling lessons

Observed: 2026-09-17

Source snapshots:

- Readest application: `jomi-se/readest@180795fb4960c32ed11539e6ba70085a5041ecaf`
  (`0.12.6`; local checkout commit, not reachable from the public remote when
  this document was written)
- Readest Foliate fork: `readest/foliate-js@ca3f118269f8d78811ef17a1b147363c321273d7`
- Bookhand Foliate baseline:
  `johnfactotum/foliate-js@78914aef4466eb960965702401634c2cb348e9b1`

This is a source study and future-work brief. It does not change Bookhand's
renderer, navigation semantics, or accepted architecture. The local Readest
checkout and initialized Foliate submodule were inspected at the exact commits
above. The Readest application and its tests were not executed in this
investigation; their AGPL sources were used only to identify observable
behavior, failure modes, and validation ideas.

The investigation compared the shared ancestor, every post-divergence Foliate
commit subject and touched-file set, meaningful source deltas, Readest's
application integration, and its reader regression catalogue. It was detailed
enough to classify the fork's capability families, ownership, likely
integration conflicts, and a safe evaluation plan. It was not a legal audit,
a proof that every commit is correct, an execution of Readest's test suite, or
a working Bookhand spike.

Related research: [Readest and Reedy retrieval lessons](2026-09-01-readest-retrieval-lessons.md).

## Executive conclusion

Readest has indeed solved many of the problems Bookhand is likely to encounter.
The most valuable work is not a collection of React controls. It is:

1. a much more mature MIT-licensed Foliate renderer;
2. a clear separation between external navigation targets, live layout
   anchors, progress state, and durable saves;
3. an input architecture that accounts for iframe boundaries, gesture
   ownership, momentum, selection, direction, and native controls; and
4. an unusually rich regression catalogue built from real-world EPUB failures.

The Readest Foliate fork and Bookhand's official Foliate line diverged at
`6b11e1744346f60504b727984f7d42f0fef3ab54`. At the inspected snapshots, the
Readest fork has 212 later commits while Bookhand's official line has 14. The
scale is material: Readest's `paginator.js` is 3,918 lines versus Bookhand's
1,130, and `fixed-layout.js` is 1,826 versus 319. Across the central renderer,
view, progress, search, and CFI files, the Readest fork is roughly
5,104 additions and 384 deletions beyond Bookhand's pinned baseline.

The recommendation is not to transplant all of this. Preserve Bookhand's
`ReaderAdapter`, security boundary, local index, remaster ownership, and product
surface. Evaluate the Readest Foliate fork behind the adapter as a renderer
candidate, and adopt its behavioral contracts and regression ideas in stages.

In plain English: **follow the fork, but do not follow its moving branch or put
it into production yet**. Test one exact commit behind Bookhand's existing
adapter. If it survives Bookhand's security, remaster, annotation, CFI, and
phone tests, it is likely a better renderer foundation than independently
rediscovering years of edge cases.

## What Bookhand would gain

The practical value is not “more Foliate.” It is a reader that behaves like a
mature reading application when books, browsers, and inputs become awkward.

| Gain | What it means for the reader | Where it comes from |
| --- | --- | --- |
| Continuous chapter scrolling | Scrolling does not pause or flash at every EPUB section boundary. Nearby sections are preloaded and old ones are removed without moving the visible text. | MIT Foliate fork |
| Stable place during reflow | Rotating the phone, resizing, changing type, or switching between scroll and pages returns to the same passage rather than a nearby page. | MIT Foliate fork |
| More reliable pagination | Images, tables, covers, late fonts, publisher CSS, and oversized boxes are much less likely to clip text, produce blank pages, or shift the location after load. | MIT Foliate fork |
| Correct reading direction | Previous and next remain correct for LTR, RTL, and much of vertical-rl instead of assuming that physical right always means next. | MIT Foliate fork, with some app-level input mapping |
| Predictable input | Wheel momentum produces one intended turn; selection, pinch zoom, links, native controls, and page-turn gestures have explicit ownership. | MIT renderer plus AGPL application behavior that Bookhand must independently implement |
| Safer progress restoration | Hot renderer position, visible UI progress, queued persistence, and the confirmed last-read location are treated as different states. Backgrounding does not silently lose the newest position. | MIT relocation data plus AGPL application behavior that Bookhand must independently implement |
| Better fixed-layout foundations | A later fixed-layout project could gain virtualized pages, spreads, scaling, panning, pinch zoom, RTL placement, and resize preservation. | MIT Foliate fork; not current Bookhand scope |
| A map of real failures | Readest's regressions identify the cases Bookhand should test before users report them: resize drift, delayed images, hostile CSS, wheel inertia, iframe listeners, vertical text, and long continuous sessions. | Behavior may be re-expressed in Bookhand tests; AGPL test code itself must not be copied |

The highest-value near-term gains are stable anchoring, correct direction,
gesture ownership, and robust EPUB layout. Continuous multi-section scrolling
is the largest visible feature, but it should come after those correctness
contracts. Fixed-layout virtualization and page-turn animation are valuable
later projects, not reasons to widen the first renderer change.

## Licensing boundary

Bookhand is MIT licensed. Readest contains two relevant repositories with
different licenses, so “Readest code” is not one undifferentiated source.

- The Readest application is AGPL-3.0. Its hooks, stores, components, and tests
  are evidence about requirements and failure modes. Do not copy that code into
  MIT Bookhand unless the project deliberately accepts the AGPL consequence.
- `readest/foliate-js` is MIT licensed. Bookhand may evaluate, depend on, fork,
  or selectively port that engine code while retaining its copyright and
  license notices.
- Behavioral contracts are not code. Bookhand can independently express such
  requirements as “resize preserves the visible passage” or “one wheel gesture
  turns one page,” then create its own fixtures and tests.

Reading AGPL code does not change Bookhand's license. Copying its protected
expression into a combined application is the risk. The safe working rule is:

1. copy or depend on renderer code only from the MIT `readest/foliate-js`
   repository;
2. retain the MIT copyright and permission notice, and record the exact commit
   in `THIRD_PARTY_NOTICES.md` if Bookhand adopts it;
3. use the AGPL application's behavior as research, then write Bookhand-owned
   integration code, fixtures, and assertions independently; and
4. check the history and third-party notices of any substantial individual
   file before porting it.

This is an engineering boundary, not legal advice. It is deliberately more
conservative than assuming that all code used by Readest inherits the Foliate
fork's MIT license.

Primary source links:

- <https://github.com/readest/readest>
- <https://github.com/readest/readest/blob/main/LICENSE>
- <https://github.com/readest/readest/blob/main/.gitmodules>
- <https://github.com/readest/foliate-js/tree/ca3f118269f8d78811ef17a1b147363c321273d7>
- <https://github.com/readest/foliate-js/blob/ca3f118269f8d78811ef17a1b147363c321273d7/LICENSE>
- <https://github.com/johnfactotum/foliate-js/tree/78914aef4466eb960965702401634c2cb348e9b1>

## How Readest and Bookhand obtain Foliate

Readest does not install its fork from the npm registry. Its `.gitmodules` file
declares `packages/foliate-js` as a Git submodule pointing to
`https://github.com/readest/foliate-js.git`. The Readest parent repository
stores an exact Foliate commit pointer; initializing submodules materializes
that separate MIT repository inside the checkout.

The fork's `package.json` still says `0.0.0`, and its own README says the API is
unstable and unreleased. An npm registry package named `foliate-js` existed at
the time of this investigation, but it pointed to John Factotum's upstream,
not the Readest fork. Do not install that registry name expecting Readest's 212
commits.

Bookhand already avoids that ambiguity. Its `package.json` points npm directly
at an exact GitHub archive of official Foliate:

```json
"foliate-js": "https://github.com/johnfactotum/foliate-js/archive/78914aef4466eb960965702401634c2cb348e9b1.tar.gz"
```

For the first evaluation, Bookhand can keep the same dependency workflow and
change only the repository and exact commit in a disposable branch:

```json
"foliate-js": "https://github.com/readest/foliate-js/archive/ca3f118269f8d78811ef17a1b147363c321273d7.tar.gz"
```

That would test the same MIT code without adding submodule operations to every
checkout and CI job. A submodule or Bookhand-owned fork becomes attractive only
if Bookhand needs to carry renderer patches, inspect history routinely, or
contribute changes upstream. In every form, pin a commit; never depend on a
floating branch.

## Recommendation at a glance

- **Should we watch the Readest fork?** Yes. It is the strongest known source
  of Foliate renderer hardening relevant to Bookhand.
- **Should we copy the Readest application?** No. It is AGPL and its product
  architecture is not Bookhand's architecture.
- **Should we replace Foliate immediately?** No. First run a pinned,
  adapter-contained compatibility spike.
- **Should we cherry-pick 212 commits one by one?** Probably not. The pagination,
  anchoring, iframe lifecycle, and input changes are interdependent.
- **What is the likely adoption shape if the spike passes?** Keep
  `ReaderAdapter`, point the existing archive dependency at a reviewed Readest
  commit, preserve the MIT notice, and update only through tested commit bumps.
- **When would we maintain our own fork?** When Bookhand-specific CSP,
  persistent-frame, annotation, or remaster requirements need durable engine
  patches that Readest cannot take upstream.

## System shape

**Provenance: mixed.** The renderer boundary is MIT; application coordination
is AGPL research-only; the final conclusion is a Bookhand recommendation.

Readest divides responsibility into three layers:

1. `foliate-view` normalizes navigation targets and selects a renderer.
2. The selected renderer owns iframe lifetime, pagination or scrolling,
   anchoring, direction, adjacent sections, and relocation.
3. The application maps taps, wheels, keys, native controls, saved state, and
   presentation policy onto that renderer.

In `packages/foliate-js/view.js`, `View.open()` selects the fixed-layout
renderer for pre-paginated books and the paginator for reflowable books. It
forwards a stable event surface rather than making the application understand
renderer details. `resolveNavigation()` accepts section indexes, whole-book
fractions, EPUB CFIs, and hrefs. `goTo()`, `goToFraction()`, `select()`,
`prev()`, and `next()` all pass through that resolution model.

Relocation is correspondingly rich. It includes an exact CFI and range, TOC
item, physical page-list item, section progress, approximate book location,
fraction, and time estimate. Explicit jumps enter navigation history; ordinary
page, scroll, and snap relocation replaces the current history entry.

This validates Bookhand's existing architectural instinct: `ReaderAdapter` is
the right boundary. UI and WebMCP callers should continue to use serializable
reading-order operations and exact source targets. A future renderer upgrade
should happen beneath that boundary.

## Reflowable pagination and continuous scrolling

**Provenance: MIT renderer facts and Bookhand inference.**

### Layout and EPUB normalization

Readest's paginator renders spine sections in sandboxed iframes. Paginated mode
uses CSS multicolumn layout; scrolled mode removes the columns and sizes each
iframe to its document. It calculates column and spread count from host size,
maximum inline measure, margins, writing direction, and book layout.

It also repairs common publisher CSS before laying pages out:

- unprefixes `-epub-*` properties;
- maps page breaks to column breaks;
- constrains images and other media to the available page;
- detects over-tall `inline-block`, `inline-flex`, `inline-grid`, and
  `inline-table` boxes that browsers treat as unfragmentable, then allows them
  to fragment rather than silently clipping later columns;
- handles cover conventions, positioned wrappers, background images, tables,
  fractional device pixels, late fonts, and WebKit scroll clamping.

The lesson is broader than any individual workaround: pagination needs a
fixture corpus of hostile but legal publisher layout, not only clean prose.

### A bounded multi-section strip

Readest's scrolled experience is not a single iframe exchanged at chapter
boundaries. The paginator holds a bounded map of section views around one
primary view:

- it keeps roughly five pages of forward buffer;
- begins backward preloading near the top;
- limits initial filling to eight sections;
- removes far-forward sections more than about ten pages away;
- compensates scroll position when a preceding section is inserted at the top;
- rejects an adjacent preload whose writing mode is incompatible with the
  current strip; and
- marks off-screen preloads `aria-hidden`, while retaining visible adjacent
  sections in the accessibility tree.

That last distinction is deliberate. `inert` would be wrong when a spread or
viewport legitimately shows content from two sections.

This continuous strip is probably the largest reader capability Bookhand could
gain. It removes the chapter-boundary pause and makes scrolling feel like one
book. It is also a substantial lifecycle system, not a switch that can safely
be imitated with a few extra iframes.

### Preserve a content anchor, not pixels

Readest repeatedly applies one rule: a layout change must restore a content
anchor, not a raw page number or scroll offset.

The live anchor may be a section fraction, DOM `Range`, or element. The
paginator derives a visible range, rerenders active views after reflow, and
returns immediately to that anchor. In continuous scroll it prefers the
section covering the viewport center rather than a tiny sliver at the top.

Important refinements include:

- resize-generated scrolling does not replace a still-visible prior anchor;
- switching out of scrolled mode first flushes the debounced visible range;
- initial navigation waits for background-image dimensions, with a bounded
  fallback, so an image above the saved passage cannot grow later and push it
  away;
- rectangle mapping is relative to the target iframe, including RTL
  mirroring, rather than to the full loaded strip; and
- an anchor with no client rectangles still initializes the section and swipe
  bounds instead of leaving navigation half-configured.

A durable CFI remains the correct external coordinate. It is not sufficient as
the renderer's only live state. Bookhand should distinguish:

- a live DOM/layout anchor;
- a serializable durable CFI;
- the current display/progress projection; and
- the last confirmed persistent reading position.

## Relocation, restoration, and persistence

**Provenance: mixed.** Renderer relocation is MIT; application scheduling and
durable-save behavior is AGPL research-only; the final paragraph is a Bookhand
recommendation.

Readest handles different time scales separately.

Inside the renderer, relocation waits for ordinary scrolling to settle, but
continuous auto-scroll forces progress at least every second so an endless
event stream cannot freeze the location. The renderer calculates a visible
range, primary section, section fraction, and page fraction after settling.

In `FoliateViewer.tsx`, the application coalesces relocation writes to one per
animation frame. A previous `requestIdleCallback` design caused Android work to
pile up after a swipe. When the document becomes hidden, Readest commits
synchronously because animation frames pause in background WebViews. It also
flushes a pending relocation while unmounting.

`useProgressAutoSave.ts` applies another layer:

- persistence is debounced after the hot progress update;
- the initial no-op relocation does not change the saved record's timestamp;
- a deep-link preview does not overwrite the person's real last-read place;
- `visibilitychange` and `pagehide` bypass the debounce; and
- library-level rollups are flushed when the reader unmounts.

Readest also isolates hot per-book progress in a keyed store so every page turn
does not rerender the whole reader tree.

Bookhand already persists exact locations and flushes reading state at
important transitions. The useful future audit is to prove all five states are
distinct: renderer anchor, emitted relocation, UI state, queued durable write,
and persisted confirmed position. Agent-directed or deep-link navigation must
also remain a preview until the learner takes a reading action.

## Reading direction and writing mode

**Provenance: mixed.** Axis/layout behavior is MIT renderer evidence;
physical-input mapping crosses the MIT renderer and AGPL application; support
claims and priorities are Bookhand recommendations.

Readest separates concepts that are easy to conflate:

- physical input direction;
- previous/next in reading order;
- layout axis;
- writing mode; and
- browser scroll-coordinate sign.

It detects direction from the rendered document, including books that declare
vertical writing on the first child rather than the body. Axis mapping is
centralized:

- horizontal paginated flow uses `scrollLeft`;
- horizontal scrolled flow uses `scrollTop`;
- vertical paginated flow uses `scrollTop`; and
- vertical scrolled flow uses `scrollLeft`.

RTL horizontal coordinates are negated where the browser requires it. Vertical
page progression is not assumed to share that sign rule. Physical left/right
commands are mapped through book direction before becoming previous/next.

Vertical-rl pagination needs special treatment: CSS fragments progress on the
vertical axis, but a Japanese-book gesture and animation is horizontal. Readest
uses a two-phase off-screen swap because adjacent vertical fragments cannot be
displayed side by side in the ordinary transition. Sections with incompatible
writing modes are not kept in one continuous strip.

Readest has not solved everything. Its own paginator still marks vertical-lr
scrolled flow as incomplete. Future Bookhand work must preserve that as an
explicit limitation rather than claiming generic vertical-writing support.

Bookhand currently exposes logical relative navigation in `ReaderAdapter`, but
its UI still maps physical right/PageDown to next and left/PageUp to previous.
The next design should keep “previous/next in reading order” as the domain
primitive and centralize physical-side mapping using detected book direction.

## Touch, wheel, mouse, and keyboard input

**Provenance: mixed.** Renderer event boundaries and primitives are MIT;
gesture, key, and native-input coordination observed in the application is
AGPL research-only; Bookhand must implement application policy independently.

Rendered EPUB events occur inside section iframes and do not bubble to the app.
Readest treats forwarding and gesture ownership as architecture rather than
component event handlers.

### Wheel

Paginated wheel input uses a gesture detector that normalizes pixel, line, and
page delta modes; accumulates movement to a 30px intent threshold; chooses the
dominant axis; emits one turn; and ignores inertial continuation until 200ms of
idle. Scrolled mode leaves wheel ownership with native iframe scrolling.

In scrolled flow, a keyboard or page-step action moves by viewport height minus
a configurable overlap. For horizontal text it also tries to land between line
boxes so the next viewport neither repeats nor clips a line.

### Touch and selection

Readest has a priority-ordered touch-interceptor registry. The first subsystem
that claims a gesture owns it. Page turning declines a gesture when it belongs
to pinch zoom, an active text selection, reserved native gesture strips,
another scroll lock, or the wrong dominant axis. A consumed swipe also
suppresses the synthetic click that browsers emit afterward, preventing a
second action on a link or toolbar.

This is especially relevant to Bookhand because selection, annotations, page
turning, panel recall, and future remaster inspection all compete for the same
phone gestures. A small explicit gesture arena scales better than independent
listeners with incidental ordering.

### Keyboard and other controls

Readest captures relevant keyboard events synchronously inside the iframe so it
can cancel browser defaults. A `postMessage` received later is too late for
that. It avoids stealing keys from editable or interactive elements, prevents
repeat turns, and installs renderer-global listeners once rather than on every
section load.

It additionally supports Home/End, half-page steps, section jumps, mouse
back/forward buttons, volume keys, configurable hardware page turners, stylus
gestures, and e-ink refresh. Those native features are evidence of the input
model's breadth, not immediate Bookhand scope.

## Navigation targets, history, TOC, and search

**Provenance: MIT renderer facts and Bookhand recommendation.**

Readest routes TOC hrefs, CFIs, fractions, section indexes, page-list entries,
and search results through the same resolver and `goTo()` path. CFI generation
joins a section base CFI with a range CFI; resolution reverses that operation.

Its built-in search visits section documents, yields progress incrementally,
returns CFI-anchored excerpts, and draws transient overlays when a result's
section is rendered. Search navigation is therefore not a separate coordinate
system.

Readest's whole-book location number is an estimate based on section byte size,
using constants near 1,500 bytes per location and 1,600 bytes per time unit. It
is useful display metadata, not semantic pagination or a canonical position.

Bookhand should keep its SQLite/FTS index: it is durable,
transformation-aware, local, and suitable for WebMCP. The transferable rule is
that every result—TOC, search, annotation, study source, agent focus, or deep
link—must converge on the same exact navigation route and history semantics.

## Fixed-layout books, PDF, and comics

**Provenance: MIT renderer facts and Bookhand scope recommendation.**

Readest's MIT fixed-layout renderer is far beyond Bookhand's current EPUB-first
scope. It supports:

- spreads, RTL placement, and cover-side policy;
- fit-page, fit-width, and custom scale;
- panning and pinch zoom with anchor preservation;
- spread prerendering and bounded cache eviction;
- a one-device-pixel overlap at spread seams; and
- preservation of page plus intra-page fraction across gap, axis, scale, and
  viewport changes.

Scrolled fixed-layout mode creates placeholders for all pages but virtualizes
the real iframes. It uses intersection lead distance, caps loaded pages at 12,
allows at most three concurrent loads, rejects stale async work with generation
counters, and evicts distant frames. Pointer interaction inside page iframes is
disabled during native scroll and restored after an idle delay.

Horizontal scroll converts ordinary vertical wheel ticks into horizontal
progression and handles negative RTL `scrollLeft`. Paginated `next()` and
`prev()` advance by spread; scrolled operations advance by viewport distance.

The tradeoffs remain visible. Selection in fixed layout is still incomplete,
and a pinch spanning two separate page iframes is deliberately unsupported.
Treat this renderer as a future capability reference, not a reason to expand
Bookhand's current format scope.

## Page-turn animation

**Provenance: mixed MIT renderer and AGPL application behavior, with a
Bookhand recommendation to keep the scope separate.**

Readest implements instant turns, push transitions, vertical-writing swaps,
View Transition slide and curl, finger-scrubbed progress, e-ink and reduced
motion bypasses, main-thread fallbacks for surfaces too large to composite, and
a platform-specific GPU path.

This is impressive but downstream of correctness. The captured-turn pipeline
must coordinate native snapshots, selection, gestures, transient overlays,
programmatic navigation, cancellation, and pre-rendered surfaces. It occupies
hundreds of lines and many tests. Bookhand should not mix this work into an
anchor, direction, or continuous-scroll project. Page curl belongs after
navigation and restoration are boringly reliable.

## Regression catalogue to emulate

**Provenance: AGPL application tests used only as a behavioral catalogue.** No
test code, fixtures, comments, or distinctive structure may be copied.

Readest's tests may be its most transferable asset. The application tests are
AGPL, so Bookhand should create independent fixtures and assertions from the
behaviors rather than copy their code.

High-value source suites under
`apps/readest-app/src/__tests__/document/` include:

- `paginator-paginated.browser.test.ts`: primary and adjacent view lifecycle,
  accessibility, fractions, spreads, and CFI navigation;
- `paginator-scrolled.browser.test.ts`: flow switching, preceding-section
  insertion, backward preload, blank-flash prevention, center-section
  relocation, and progress during continuous scroll;
- `paginator-resize-anchor.browser.test.ts`: portrait → landscape → portrait
  round trips;
- `paginator-scrolled-restore.browser.test.ts`: delayed, broken, and hanging
  background images above a saved position;
- `paginator-stabilization.browser.test.ts`: event order, fonts, opacity, rapid
  navigation, rerender, and mode-switch stability;
- `paginator-vertical-rl.browser.test.ts`: direction detection and physical
  gesture semantics;
- `paginator-turn-styles.browser.test.ts`: gesture ownership, interrupted
  transitions, and animation fallbacks;
- `paginator-inline-block-overflow.browser.test.ts`, table, decorative TOC,
  and Duokan-cover tests: hostile real-world CSS; and
- fixed-layout suites for virtualization scheduling, RTL horizontal scrolling,
  zoom/gap anchors, iframe wheel ownership, pinch anchoring, spread seams,
  annotations, and PDF direction.

Additional focused suites cover wheel accumulation, hardware modifier matching,
iframe keyboard selection, input listener ownership, touch selection, and
accessibility visibility geometry.

## Systematic fork-history classification

The exact divergence anchor was verified in a temporary checkout containing
both histories: `6b11e1744346f60504b727984f7d42f0fef3ab54` is the merge base of
Bookhand's official pin and the inspected Readest fork commit. The fork has 212
commits after that anchor; the official line leading to Bookhand's pin has 14.
Commit counts are context, not a quality score.

The 212 fork commits fall into overlapping families. One commit can belong to
more than one family, especially the first large compatibility import, so the
following is an inventory rather than an additive tally:

| Family | Verified themes in history and source | Bookhand disposition |
| --- | --- | --- |
| Reflowable layout and lifecycle | Continuous adjacent-section loading, bounded removal, resize stabilization, anchors, scroll bounds, fractional-pixel fixes, background painting, vertical/RTL layout, covers, tables, oversized boxes, null guards | Evaluate as the highest-value MIT capability family, but adapt to the persistent-frame decision |
| EPUB parsing and resources | Missing metadata, cover fallbacks, NCX fallback, malformed XML/XHTML, encoded hrefs, Adobe font keys, resource reference counting, section fragments, cached section content | Adopt compatible parser hardening selectively or through a pinned fork after corpus validation |
| CFI, search, progress, and navigation | Inert/skip markers, CFI progress, styled-node excerpts, regex/proximity modes, physical page data, section fragment targets, relocation during continuous scroll | Keep Bookhand's exact CFI and local FTS model; adopt only renderer primitives that preserve it |
| Overlays, selection, and footnotes | Zoom-aware geometry, block-spanning highlights, heading ranges, vertical overlays, loupe support, scroll locks, PDF overlays, nested/empty footnotes | Adopt compatible MIT drawing fixes; independently implement app gesture and popup policy |
| Accessibility | Focus targets for semantic navigation, keyboard focus after navigation, meaningful iframe labeling, and visibility-based hiding of off-screen preloads | Adopt the behaviors, subject to real assistive-technology testing |
| Fixed layout, PDF, and comics | Virtualized scroll, bounded loading, zoom/pan, spreads, seams, page labels, PDF direction, memory limits, bitmap sizing, CBZ ordering | Defer as distinct format projects; do not let these widen an EPUB renderer change |
| TTS | Sentence segmentation, current ranges, next/previous marks, node filters, PDF text layers | Defer as a separate product capability with its own semantics and accessibility review |
| Animation and device integration | GPU/RAF fallbacks, slide/curl tracking, e-ink bypass, stylus, WebKit compatibility, native page-turn inputs | Reject from the first compatibility bump unless required for correctness; review later in isolated scopes |
| Packaging and dependencies | CSSStyleSheet polyfill, old-WebKit fallbacks, PDF.js upgrades and assets, package metadata that still identifies upstream and version `0.0.0` | Treat as supply-chain and compatibility review work, not incidental renderer code |

The most concentrated changes are in `paginator.js`, `fixed-layout.js`,
`pdf.js`, `epub.js`, `overlayer.js`, `view.js`, `footnotes.js`, `search.js`, and
`tts.js`. Comparing the exact snapshots changes 25 files. Generated PDF.js
vendor files dominate the raw 53,089 additions and 59,338 deletions, which is
why raw line counts are a poor review guide. Review the authored modules and
third-party asset/license changes separately.

Useful history landmarks include continuous EPUB scroll (`e925e9d`), backward
preload/navigation drift (`c3b2d09`, Readest issue 4112), delayed background
image restoration (`bf84163`), mixed writing-mode eviction (`befe16d`, PR 13),
resource lifetime across multiple views (`c1f0c3c`, PR 78), malformed XHTML
fallback (`63a2eb1`, PR 70), periodic relocation during uninterrupted scroll
(`fd91451`, PR 72), vertical-rl physical turns (`cecaef9`, PR 45), and ordered
overlapping MOBI reads (`ca3f118`, PR 86). These references explain why a
change exists; they do not replace local validation.

## Renderer lifecycle, parsing, and resource ownership

**Verified MIT renderer facts.** The renderer now expects more concurrency
than Bookhand's current one-section presentation: adjacent sections, search or
footnote views, pre-rendered fixed-layout pages, and overlapping asynchronous
loads can coexist. It therefore carries explicit view destruction, resource
reference counting, bounded preload controls, and stale-state guards. EPUB
loading has fallbacks for missing metadata and covers, malformed package XML,
XHTML that must be retried as HTML, encoded reserved characters in archive
paths, navigation documents with no useful links, and incorrect font
obfuscation identifiers.

**Bookhand inference.** Multi-view resource ownership is directly relevant
even if Bookhand rejects continuous scroll: section snapshots, footnote
previews, annotation drawing, remaster comparison, and the visible reader can
otherwise revoke the same object URL out from under each other. Conversely,
the fork's expectation that it may create and navigate multiple iframes
conflicts with ADR 0005's single persistent browsing context. A compatibility
layer must define whether Bookhand emulates multiple logical views inside one
frame, relaxes the feature to single-section scroll, or records a new ADR. The
spike may not silently discard the current decision.

**Recommendation.** Adopt parser and resource-lifetime behavior when it can be
proven beneath `ReaderAdapter`; adapt multi-view lifecycle independently until
the persistent-frame conflict is resolved. On malformed content, retry only
bounded alternate parses, preserve a named diagnostic, and keep the last safe
surface rather than converting every failure into permissive HTML.

## Selection, overlays, footnotes, and accessibility

**Verified MIT renderer facts.** Selection and annotation work includes range
splitting across block/text nodes, zoom-aware coordinates, vertical layout,
fixed-layout view boxes, explicit overlay recreation after an asynchronous
text layer appears, CFI skip/inert markers, and scroll locking during instant
annotation. Footnotes tolerate empty or anchor-only structures and nested
links. The renderer focuses navigated targets for keyboard or assistive use and
marks only truly off-screen preloaded views `aria-hidden`; content intersecting
the viewport remains exposed.

**Verified AGPL application behavior.** The application resolves competition
between selection, page turning, pinch, instant annotation, native gesture
areas, and trailing synthetic clicks. It also forwards iframe keyboard events
synchronously, keeps global input listener counts stable across rerenders, and
recreates transient search or annotation overlays only in visible documents.
These are requirements only; Bookhand must not copy the hooks or tests.

**Bookhand inference and recommendation.** Bookhand should use one gesture
ownership policy and one renderer-listener lifetime, while keeping permanent
annotations and temporary tutor cues separate. Every saved range must still
round-trip against a fresh accepted section revision. An unresolvable overlay
must not block reading, and visible multi-section content must not disappear
from the accessibility tree merely because it is not the primary section.

## Performance, cancellation, and security observations

**Verified MIT renderer facts.** Bounded schedulers appear where unbounded work
caused actual failures: fixed-layout pages cap resident views and concurrent
loads; PDF range reads are throttled to avoid WebView memory exhaustion;
continuous EPUB scroll prunes distant sections; large animation surfaces fall
back from expensive paths; overlapping MOBI reads are serialized; and view
destruction/null guards tolerate teardown racing with asynchronous rendering.

**Verified AGPL application behavior.** Hot relocation work is coalesced,
durable writes are debounced, visibility and page-hide transitions flush state,
and listener registration is stable while callbacks stay current. Again, these
are behavioral observations, not reusable code.

**Bookhand conflict.** Readest can optionally accommodate publisher scripts and
native bridges. Bookhand deliberately blocks packaged scripts, remote loads,
forms, nested browsing, and privileged bridge access. A fork bump must not
inherit a more permissive sandbox, event bridge, URL loader, or PDF worker
asset path. Multi-frame loading also expands CSP and resource-lifetime review.

**Recommendation.** Every async open, preload, search, resize, annotation draw,
and remaster refresh needs an ownership token or generation check and a bounded
queue. Cancellation must leave a readable last-safe surface and must release
listeners, object URLs, observers, timers, canvases, and frames. Security
fixtures must observe network and parent-state effects, not merely inspect
attributes.

## Limitations and behavior not to inherit

- The fork remains version `0.0.0`, describes its API as unstable, and has no
  release contract suitable for a floating dependency.
- Vertical-lr scrolled reflow is explicitly incomplete. Vertical-rl has deeper
  support but still requires its own fixtures and physical input validation.
- Fixed-layout selection and gestures spanning separate page frames remain
  incomplete or deliberately unsupported.
- Byte-size location and time estimates are display conveniences, not durable
  reading positions, semantic page counts, or citation anchors.
- Continuous scroll's multiple iframe model is not compatible by assumption
  with Bookhand's persistent same-origin frame.
- Application behavior assumes native/WebView integrations in several places.
  Volume keys, stylus events, e-ink refresh, native PDF bridges, and platform
  animation paths are not browser-product requirements.
- Page animation substantially increases cancellation, snapshot, overlay, and
  gesture coupling. It should not enter a correctness-focused renderer bump.
- Readest's application persistence, sync, remote services, reader shell, and
  provider integrations conflict with Bookhand's local-first product boundary.
- The application and its regression code are AGPL. Only independently stated
  behaviors and newly authored Bookhand fixtures/assertions may cross into this
  repository unless Bookhand deliberately changes its licensing decision.

The topical, implementation-neutral Bookhand requirements distilled from this
study now live in [the reader-engine specification index](../specs/reader-engine/README.md).

## Recommended future sequence

**Provenance: Bookhand recommendation based on the mixed evidence above.**

### 1. Turn lessons into Bookhand-owned contracts

Before changing the dependency, write independent assertions for:

- exact CFI restoration after close/reopen;
- visible-passage preservation across resize and style reflow;
- scrolled/paginated mode switching without section drift;
- previous/next mapping for LTR, RTL, and vertical-rl fixtures;
- one intentional wheel gesture producing one turn;
- selection and annotation gestures winning over page turns;
- background/unmount progress flush;
- deep-link and agent-directed preview not overwriting last-read state; and
- listener counts remaining stable across many section transitions.

### 2. Evaluate the renderer behind `ReaderAdapter`

Use an isolated branch or disposable spike to replace only the Foliate
dependency with `readest/foliate-js@ca3f118…`. Do not expose its new internals
to UI or WebMCP. Run compatibility gates for:

- Bookhand's script-blocking CSP and same-origin persistent-frame patch;
- exact CFI and range round trips;
- annotations and overlay recreation;
- section snapshots and accepted remaster revision switching;
- safe open/close under React StrictMode;
- current deterministic, malformed, and malicious EPUB fixtures; and
- the current Pixel 7 flow.

The persistent same-origin frame is the largest likely integration conflict.
Readest's multi-frame strip and Bookhand's controlled-browser workaround must
be reconciled deliberately; neither should be silently discarded.

### 3. Adopt correctness before breadth

Prioritize, in order:

1. reading-order direction mapping;
2. resize/reflow anchor preservation;
3. flow-switch restoration;
4. iframe input forwarding and listener ownership;
5. wheel momentum filtering;
6. visibility/unmount progress flushing; and
7. continuous multi-section scroll.

Add RTL and vertical-writing fixtures during this phase, not after it.

### 4. Keep separate future projects separate

Fixed-layout virtualization is one project. Page-turn animation is another.
Native volume keys, stylus input, e-ink refresh, publisher scripts, and PDF
integration are separate product decisions. None should hitchhike on a
reflowable-navigation upgrade.

## Explicit cautions

- Do not copy Readest's AGPL application hooks or tests.
- Do not adopt 212 Foliate-fork commits blindly. They include Tauri, WebKit,
  PDF, native-device, e-ink, and animation assumptions Bookhand may not want.
- Do not relax Bookhand's script-blocking policy. Readest can optionally allow
  publisher scripts; Bookhand's untrusted-content boundary is intentionally
  stricter.
- Do not bypass `ReaderAdapter` or expose renderer DOM handles through WebMCP.
- Do not replace exact CFI persistence with Readest's byte-size location
  estimate.
- Do not mix animation polish with navigation correctness.
- Do not claim vertical-lr support from a renderer that marks it incomplete.
- Do not treat emulator coverage as physical-phone evidence.

## Source map for future agents

Readest application paths are relative to `/home/dev/readest`:

- `apps/readest-app/src/app/reader/components/FoliateViewer.tsx`
- `apps/readest-app/src/app/reader/hooks/usePagination.ts`
- `apps/readest-app/src/app/reader/hooks/useFoliateEvents.ts`
- `apps/readest-app/src/app/reader/hooks/useProgressAutoSave.ts`
- `apps/readest-app/src/app/reader/hooks/useCapturedTurn.ts`
- `apps/readest-app/src/app/reader/hooks/useTouchInterceptor.ts`
- `apps/readest-app/src/app/reader/hooks/useRendererInputListeners.ts`
- `apps/readest-app/src/app/reader/utils/iframeEventHandlers.ts`
- `apps/readest-app/src/app/reader/utils/wheelGesture.ts`
- `apps/readest-app/src/app/reader/hooks/useSearchNav.ts`
- `apps/readest-app/src/store/readerProgressStore.ts`
- `apps/readest-app/src/components/settings/LayoutPanel.tsx`
- `apps/readest-app/src/app/reader/components/ViewMenu.tsx`

Readest Foliate paths at the recorded submodule commit:

- `view.js`
- `paginator.js`
- `fixed-layout.js`
- `progress.js`
- `epubcfi.js`
- `search.js`

The essential takeaway is narrow: Readest is a strong renderer candidate and a
rich behavioral specification. It is not Bookhand's application architecture.
