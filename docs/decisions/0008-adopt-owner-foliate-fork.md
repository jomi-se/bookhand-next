# ADR 0008: Adopt the pinned owner Foliate fork

## Status

Accepted on 2026-09-19 after exact-asset Windows validation and local merge.

## Context

RE-001 evaluated the MIT `jomi-se/foliate-js` fork at
`ca3f118269f8d78811ef17a1b147363c321273d7` against Bookhand's reader,
WebMCP, remaster, search, mobile, containment, and persistent-frame contracts.
The fork provides materially broader ebook pagination and input work than the
previous upstream pin, but its default multi-view lifecycle conflicts with
Bookhand's controlled-browser requirement to retain one same-origin iframe.

The evaluation found that the fork is compatible when Bookhand keeps its
existing adapter boundary and applies a small, exact-source, fail-closed build
transform. No Readest application source is part of this decision.

## Decision

Adopt that exact owner-fork archive behind `ReaderAdapter`. Keep dependency
updates explicit and pinned.
Continue to own the following compatibility behavior in Bookhand:

- ADR 0005's retained same-origin iframe and blocked publisher scripts;
- one active renderer view, with exact transform drift causing the build to
  fail;
- fragment navigation that falls forward from an unrendered publisher marker
  to the first renderable text while retaining the marker as the semantic
  anchor; and
- a best-effort page-turn animation at spine boundaries that never makes
  navigation depend on animation support and respects reduced motion.

PDF, continuous multi-section scrolling, and other unadopted fork capabilities
remain outside Bookhand's current product surface.

## Consequences

- Bookhand gains the fork's accumulated pagination, writing-mode, input, and
  rendering fixes without coupling product code to the renderer internals.
- Updating the pin requires the owner-fork update gate, license/vendor review,
  transform re-derivation, and controlled-browser proof required by ADR 0005.
- The dependency and its bundled vendor assets retain their own licenses as
  recorded in `THIRD_PARTY_NOTICES.md`.
- Future pin updates remain gated on exact-asset controlled-browser validation;
  deterministic browser tests do not replace that evidence.
