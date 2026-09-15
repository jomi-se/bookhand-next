# Post-Slice 3 product, mobile, and WebMCP audit

Date: 2026-09-01  
Commit reviewed: `f286910`  
Live surface reviewed: `https://bookhand.dev/`

## Executive judgment

Bookhand has crossed the line from mockup to credible system. It is a real
local-first EPUB reader, its SQLite and Foliate boundaries are substantive, and
its eleven tools register and execute through Chromium's genuine WebMCP
runtime. The library already has a distinctive, calm identity.

It has not yet demonstrated the complete product thesis. The current study
result is a persisted list of native records created by a deterministic test,
not a lesson designed by a model. On mobile, the reader behaves like a desktop
shell around a narrow EPUB viewport. Several documented trust guarantees are
also stronger than the production code and tests justify.

The correct next move is not broad visual decoration. It is a three-part
mission:

1. make persistent tool actions and source grounding trustworthy;
2. turn the mobile reader into a theme-coherent, immersive reading surface;
3. demonstrate one cohesive, model-composed learning experience.

Impeccable audit score: **11/20 — acceptable, significant polish needed**.

- Accessibility: 2/4
- Performance: 3/4
- Responsive design: 2/4
- Theming: 1/4
- Anti-patterns: 3/4

There are no visual-slop or generic-template blockers. The weakness is
interaction architecture, not ornamental taste.

## What is genuinely proven

- A real EPUB renders through the pinned Foliate.js integration and restores a
  reading position.
- The official SQLite WASM build runs behind a dedicated worker, with OPFS
  persistence on the deployed Cloudflare origin and a truthful memory fallback.
- The production build registers and executes tools through the genuine
  `document.modelContext` API in Chromium.
- A scripted tool path can create an annotation and source-linked study item
  that appear in the interface and survive reload.
- EPUB containment, local reading, production test-control exclusion, and the
  deployed security/cache policy have browser evidence.
- The repository's full gate passed in a clean audit run: 110 unit tests and 7
  Playwright tests, plus typecheck and production build checks.

## Claims that need correction or stronger evidence

### P1: exact-source integrity is not enforced

`save_annotation` accepts a structurally valid range, caller-provided quote,
and fingerprint without resolving them against the book before persistence.
The happy-path browser test supplies an invented quote. The negative test
accepts either rejection or successful persistence, so it cannot prove the
documented rule that an agent may only anchor to exact returned text.

Before persistence, Bookhand must resolve the range through the reader, compare
the fingerprint, normalize and compare the quote, reject stale or invented
input, and prove that rejection leaves both storage and overlays unchanged.

### P1: UI and WebMCP mutations do not share observable state

The visual Text controls update React state and schedule persistence through
`useReader`; `BookhandCommands.setReadingStyle()` talks directly to the
adapter. A tool change can therefore be invisible in the controls, omitted
from persistence, and later overwritten by stale interface state.

The equivalent board-view path persists a tool change without reliably
updating the mounted Study surface. These paths must converge on one stateful,
observable command boundary before the README can claim parity.

### P1: study-item ownership is unsafe across books

A caller-provided study item ID can collide with an item owned by another
book. SQLite's conflict update does not verify `board_id`, which can mutate the
other book's row while returning an object that appears to belong to the open
book. Updates need an ownership predicate and a two-book regression test.

### P1: durable-storage prompting is disconnected

The helper that requests `navigator.storage.persist()` is tested but not called
by the real import path. The product must either wire the one-time request into
the user-initiated import flow or narrow the contract and interface copy.

### P1: technical passages can lose inline mathematics

The bundled calculus book represents important variables and equations as
images carrying `data-tex` and `alt`. Full-section extraction preserves image
alternatives, while visible and exact range extraction relies on
`Range.toString()` and omits them. A tutor can receive grammatically intact
prose with its mathematical meaning removed.

Passage serialization must preserve inline `data-tex`, then `alt`, plus useful
figure descriptions without weakening the CFI boundary.

### P2: deployed COOP differs from the accepted architecture

The live app sends `Cross-Origin-Opener-Policy: same-origin`, while the accepted
SQLite architecture says Bookhand does not require COOP/COEP. Remove the header
or record and validate the changed decision, especially for an embedded agent
browser.

### P2: evidence and source-of-truth documents drifted

The repository described 106 unit tests, 8 browser tests, and a stand-in
WebMCP runtime after the actual state had become 110, 7, and genuine Chromium.
The scope inventory still described Slices 2 and 3 as future work. One clean
full-gate pass was obtained during this audit, but an earlier isolated
production-suite run exhibited a non-deterministic bundled-book bootstrap
failure that passed alone. Repeated clean runs should close that stability
question.

## Mobile reader findings

### P1: themes stop at the EPUB boundary

Light, sepia, and dark are applied inside the book iframe while application
tokens remain permanently light. Dark mode therefore becomes a narrow dark
rectangle surrounded by bright toolbar, rails, panels, and footer. The reader
shell needs a complete token set keyed by the active reader theme, including
theme-specific accents with accessible contrast. The library can remain an
independently light surface.

### P1: permanent chrome makes the book too small

At 412 by 915, the top bar consumes 65 pixels, the footer 36, and two 44-pixel
navigation rails leave only 324 pixels for the book. Foliate then adds its own
internal margins. Mobile should remove the rails from layout, use reachable
overlay or bottom navigation, and let secondary reading chrome recede.

### P1: swipe is raw upstream dragging

Foliate prevents default on one-finger movement without a directional intent
threshold. Bookhand does not enable Foliate's animated snap behavior. The
result is a page that follows the finger and hard-snaps, intercepts diagonal
gestures, and can compete with text selection. The product needs an explicit
tap/swipe policy with axis locking, thresholds, selection protection, short
easing, and reduced-motion behavior.

### P1: mobile panels duplicate chrome and lose focus

Contents, Text, and Study replace the book but retain the global reader header
and footer, then add another panel header. Closing a panel leaves focus on the
document body rather than returning it to the invoking control. Each should be
a genuine mobile surface with one header, correct initial/final focus, and no
irrelevant pagination footer.

### P1: mobile toolbar controls become unnamed

The only accessible text for Contents, Study, and Text is hidden with
`display:none` at mobile widths. Give the buttons stable `aria-label` values
and test their accessible names at the actual mobile breakpoint.

### P2: supporting interaction gaps

- Study creation buttons are 34 pixels tall rather than the 44-pixel target.
- Contents receives but does not expose the current section with
  `aria-current` or active styling.
- The global arrow-key handler can navigate the hidden book from focused panel
  controls.
- Selection actions lack quote context and compete with native selection UI.
- The current mobile Study surface leads with block-creation controls and tool
  telemetry instead of the learning artifact.

## WebMCP product findings

### The current milestone is Slice 3, not Slice 5

The runtime and command surface are real, but there is no populated whole-book
index, lexical or semantic search, generated lab, or model-driven browser run.
The Playwright “agent” is a deterministic script with hand-authored lesson
content. This is useful contract evidence; it is not evidence that a model can
design a valuable study experience.

### Retrieval should begin with faithful local lexical search

Without a non-mutating retrieval tool, an agent must move the person's reader
to inspect earlier definitions and examples. Populate the existing CFI-anchored
chunk/FTS schema and add bounded `search_book` before spending time on local
embeddings. The exact source, visible passage, and local FTS path can establish
the thesis without a model download.

### Study needs a cohesive authored unit

Five flat block types rendered as equally weighted records do not create a
lesson. Add a trusted `study_experience` container with ordered native blocks
and one declarative interactive-plot primitive. Let a tool atomically create or
update the unit. Add durable provenance, a grouped action ID, and visible Undo;
do not jump directly to arbitrary agent-authored JavaScript.

### Recommended hero: the slope microscope

Use Chapter X's geometrical explanation of `dy/dx`. A compatible model should:

1. read the current, math-faithful passage;
2. retrieve a small number of relevant local chunks without moving the reader;
3. create one source-linked experience containing a short explanation, typeset
   derivative, and interactive `y = x²` plot;
4. let the learner drag a secant point toward the tangent while `Δx`, `Δy`, and
   both slopes update;
5. expand Study, show “Created with your agent · Undo,” and preserve the result;
6. update the same experience after a follow-up about negative derivatives.

That path demonstrates semantic composition, iteration, grounding, user
control, and persistence in one legible scene.

## Recommended execution order

1. **Trust reset:** exact range/quote verification, shared observable mutation
   state, cross-book ownership, durable-storage wiring, math-faithful passage
   extraction, visible mutation errors, and COOP decision.
2. **Mobile reading reset:** shell-wide themes, named controls, immersive
   navigation chrome, tuned gestures, proper panel focus/geometry, current TOC
   state, and mobile browser coverage.
3. **Showcase:** local lexical retrieval, cohesive study experience,
   declarative interactive plot, provenance/action groups/Undo, then a genuine
   model-driven Chapter X run.
4. **Evidence reset:** keep current-work and scope inventory truthful; validate
   repeated full-suite stability and preserve screenshots/traces for the actual
   judged desktop embedded-browser flow.
