# Security, performance, and async integrity

## User-visible goal

Large or hostile books remain responsive and contained. Cancelling, navigating,
backgrounding, or closing cannot leak work, show stale content, lose the latest
confirmed place, or give book content access to Bookhand privileges.

## Why it matters

Continuous rendering and richer formats multiply frames, object URLs, canvases,
observers, pending reads, and event sources. Correct visible behavior can still
hide an unbounded memory curve, stale async mutation, or weakened CSP.

## Behavioral requirements

- **Bookhand requirement:** Imported publisher and agent-produced content is
  untrusted. Packaged scripts, inline handlers, remote fetches, forms, objects,
  nested browsing, top navigation, storage access, and privileged bridges stay
  blocked by the production-delivered policy.
- **Bookhand requirement:** Parser fallbacks, iframe event forwarding, PDF
  workers, footnote previews, fonts, CSS, and remaster resources may not create
  a new network or parent-access route.
- **Verified MIT renderer / adopt:** Adjacent reflow sections and fixed-layout
  pages use explicit resident-view, preload-distance, and concurrent-load
  bounds. Distant views are evicted and their resources released.
- **Verified MIT renderer / adopt:** Expensive PDF/range/canvas or animation
  work is throttled or falls back when a platform's memory/compositor limits
  make the preferred path unsafe.
- **Mixed / implement independently:** Every async operation has a generation,
  owner, or abort signal. Late opens, loads, searches, preloads, resize work,
  annotation draws, and remaster refreshes cannot commit into newer state.
- **Bookhand requirement:** Cancellation and failure keep a readable last-safe
  surface, release resources, and provide a named retry path where meaningful.
- **Verified AGPL behavior / implement independently:** Renderer-global input
  listeners are installed once, deliver the latest handler, and are removed on
  teardown. Hot location state does not rerender the entire reader tree.
- **Bookhand requirement:** Performance budgets cover time to first readable
  content, page/scroll response, reflow stabilization, resident DOM/resources,
  long-session memory, and background/unmount persistence flush.

## Edge cases and failure modes

Rapid open A/open B, close during load, multiple preloads finishing out of
order, a section that never resolves, continuous scrolling for hours, a huge
image/PDF canvas, repeated footnote open/close, repeated style toggles, resize
storms, selection during eviction, background suspension, and a malicious EPUB
that attempts every blocked channel.

## Known footguns

- Counting frames but not retained documents, object URLs, canvases, observers,
  closures, or cached section bytes.
- Calling `AbortController` without checking ownership at every commit point.
- Assuming a sandbox attribute alone proves CSP/network containment.
- Reusing Readest's optional publisher-script or native-bridge configuration.
- Making background persistence depend only on `requestAnimationFrame` or idle
  callbacks, which may stop before the write runs.
- Accepting generated/vendor asset churn without provenance and bundle review.

## Bookhand constraints and conflicts

ADR 0005 and the hostile EPUB contracts are hard gates. The renderer stays
behind `ReaderAdapter`; no native bridge is required for ordinary reading.
Bookhand remains local-first and account-free. The local FTS/index and remaster
pipelines have their own cancellation and revision semantics that a renderer
upgrade must not bypass.

## Provenance and source pointers

- MIT renderer: `paginator.js`, `fixed-layout.js`, `pdf.js`, `epub.js`,
  `view.js` at `ca3f118`; history `6f1a190`, `e098bc3`, `98fc0d5`,
  `c1f0c3c`, `ca3f118`, `a1cec6f`, `03cfb6c`.
- AGPL behavior: relocation/store/listener lifecycle in `FoliateViewer.tsx`,
  `useProgressAutoSave.ts`, and `useRendererInputListeners.ts` at `180795fb`.
- Bookhand: `VAL-EPUB-CONTAINMENT`, `VAL-EPUB-RESOURCE-POLICY`,
  `VAL-READER-LIFECYCLE`, ADR 0005, and current fault-injection controls.

## Validation ideas

Use a production bundle, controlled exfiltration origin, and per-capability
malicious sentinels. Observe network, parent/storage state, popup/navigation,
CSP violations, and readable content. Inject delayed/out-of-order/hanging loads
and inspect generation outcomes. Run repeated and long-session journeys while
recording active views, documents, listeners, observers, URLs, canvases, heap,
frame time, and persisted location before/after backgrounding.

## Adoption disposition

Adopt compatible MIT bounds, cleanup, throttling, and stale-work guards. Keep
Bookhand's stricter security policy. Implement application cancellation,
persistence, and listener ownership independently.
