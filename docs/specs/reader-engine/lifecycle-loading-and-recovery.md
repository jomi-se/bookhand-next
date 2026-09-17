# Lifecycle, loading, and recovery

## User-visible goal

A book opens promptly, keeps its last safe readable surface during recoverable
failures, and can be closed, reopened, or replaced without stale content,
duplicated listeners, broken resources, or an indefinite spinner.

## Why it matters

Reader correctness begins before pagination. Real EPUBs contain inconsistent
metadata, unusual archive paths, malformed XML, late resources, and sections
that fail independently. Concurrent snapshots, overlays, or previews can also
outlive the visible section unless ownership is explicit.

## Behavioral requirements

- **Verified MIT renderer / adopt:** Normalize missing or partial metadata and
  cover conventions without making title/author optionality a crash.
- **Verified MIT renderer / adopt:** Resolve archive hrefs consistently,
  including encoded reserved characters and unusual package paths. Navigation,
  styles, images, fonts, and cross-section links must use the same resolution.
- **Verified MIT renderer / adopt with bounds:** If declared XHTML cannot be
  parsed, one documented HTML fallback may recover readable content. Malformed
  package/navigation XML may use a narrow repair or fallback. Every fallback
  must be observable in diagnostics and must not enable scripts or remote URLs.
- **Verified MIT renderer / adopt:** Resource lifetime is reference-owned. A
  second logical consumer may not revoke a blob/object URL still used by the
  visible reader; closing the final consumer must release it.
- **Bookhand requirement:** Open, close, rapid competing opens, section loads,
  extraction, and remaster hydration carry a generation/ownership token. A late
  result from an older book or section is discarded.
- **Bookhand requirement:** Failure preserves either the prior readable section
  or a named reader/library recovery surface with Retry and Back to library.
- **Bookhand requirement:** Teardown removes renderer views, event listeners,
  observers, timers, queued callbacks, overlays, and resource references once.
- **Bookhand requirement:** The first success signal means real source-derived
  metadata and readable section content are available, not merely that a viewer
  element was created.

## Edge cases and failure modes

- Package metadata is absent, duplicated, wrongly namespaced, or contains a
  creator with a non-author role.
- The navigation document exists but contains no usable destinations; an NCX
  fallback may exist.
- The manifest omits or mislabels a cover; a bounded deterministic fallback may
  find one without treating an arbitrary large image as authoritative.
- A section has no body, only CFI-inert content, broken markup, an invalid href,
  a delayed image/font, or a load that never settles.
- The same section is simultaneously visible, extracted for indexing, opened
  as a footnote, or refreshed for a remaster.
- The person opens book B before book A finishes, closes during navigation, or
  retries after a timed-out section.

## Known footguns

- Treating object URLs as view-local when the underlying book loader caches or
  shares them.
- Broadly reparsing every XHTML file as HTML, which can hide publisher defects
  and change namespaces, MathML, SVG, CFIs, or security behavior.
- Resolving open before the first section renders.
- Letting cleanup revoke resources before async overlays or extraction finish.
- Assuming `document.body` or a target node still exists during teardown.

## Bookhand constraints and conflicts

ADR 0005 permits one persistent same-origin iframe, while the fork often uses
multiple concurrent frames. Logical consumers must not automatically become
navigated child frames. Section snapshots and remaster comparison must remain
internal and serializable. Accepted remaster markup, not publisher bytes alone,
is the source used by rendering, extraction, citations, and search.

## Provenance and source pointers

- MIT renderer: `epub.js`, `view.js`, `paginator.js`, `footnotes.js` at
  `readest/foliate-js@ca3f118`; history landmarks `4361f29`, `4aa4efe`,
  `63a2eb1`, `90764e1`, `c1f0c3c`, `a1cec6f`, `03cfb6c`, `f94b251`.
- AGPL application behavior: reader lifecycle integration and document-loader
  regressions under `apps/readest-app/src/app/reader/` and
  `apps/readest-app/src/__tests__/document/` at `readest@180795fb`.
- Bookhand: `src/reader/FoliateReaderAdapter.ts`,
  `VAL-READER-OPEN`, `VAL-READER-LIFECYCLE`, and
  `VAL-READER-SECTION-ERROR`.

## Validation ideas

Use independently authored EPUBs for missing metadata, wrong cover signals,
encoded paths, broken package XML, XHTML-to-HTML fallback, inert-only content,
slow/hanging resources, and shared resource ownership. Instrument active views,
listeners, observers, URLs, and generation tokens across repeated/competing
open-close cycles. Verify Retry after fault removal and inspect console/network
activity in the production build.

## Adoption disposition

Adopt compatible MIT parser, lifecycle, null-guard, and resource-ownership
capabilities after the compatibility gate. Implement recovery UX and async
ownership independently. Do not adopt a multi-frame architecture by accident.
