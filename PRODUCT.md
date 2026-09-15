# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Bookhand is primarily for self-directed learners reading technical books who
want help understanding, revisiting, and working with difficult material
without giving up the ordinary reading experience.

The judging audience also needs to understand the product quickly through a
desktop embedded agent browser, but judging is an evaluation context rather
than the product's permanent user definition.

## Product Purpose

Bookhand is a calm, local-first ebook reader that a compatible agent can turn
into an adaptive study environment. Reading, annotation, search, and study
remain useful without an agent. With WebMCP, a user-chosen agent can understand
precise book context and construct grounded, user-controlled explanations,
worked examples, visualizations, questions, and interactive study experiences
inside the reading environment.

Success means the agent materially improves how someone studies a passage
without turning the product into “chat with a book,” obscuring the source, or
taking control away from the reader.

## Positioning

Bookhand is not an ebook-shaped chat interface and does not depend on one model
vendor or agent harness. Its distinctive mechanism is a semantic WebMCP surface
over a capable local reader: agents discover narrow reading and study actions,
ground their work in exact book locations, and compose durable learning
artifacts that remain visibly attached to their sources and under user control.

## Operating Context

- A person opens the local library, reads a bundled or imported EPUB, changes
  typography, selects text, annotates, searches, and builds a study board.
- A compatible agent can inspect the offered WebMCP tools before and after a
  book opens, retrieve bounded book context, navigate, and create visible study
  material through the same product domain.
- Mobile web is a first-class reading context. The current hackathon's judged
  agent surface is a desktop embedded browser; desktop Chromium with
  `WebMCPTesting` is the reproducible development surface.
- *Calculus Made Easy* is the temporary judging-period demonstration book. It
  is ordinary library data and can be removed later without changing the
  product model.

## Capabilities and Constraints

- EPUB reading uses the smallest practical pinned Foliate.js integration.
- Books, reading state, annotations, notes, and study boards are local-first and
  persist through official SQLite WASM when browser storage permits it.
- The application is client-side for the proof of concept. It has no backend,
  accounts, synchronization service, or Agent Connect requirement.
- Imported book content and agent-produced content are untrusted input.
- WebMCP tools remain narrow, schema-described, model-independent, and visible
  through their effects in the ordinary interface.
- Agent-created changes must be perceived as changes to the user's study
  environment, not silent rewrites of the book or application. Persistent
  changes remain identifiable, removable, resettable, or undoable as
  appropriate.
- Bookhand is intentionally hackable. People may customize typography, themes,
  book CSS, and study presentation directly or through an agent. The shipped
  visual system is a strong default and a source of composition guidance, not a
  restriction on the worlds a user may create.
- Generated work stays bounded to its study surface and never silently changes
  publisher content.
- Whole-book lexical retrieval, the cohesive interactive study experience, and
  a real model-composed hero lesson are active work rather than completed
  claims.

## Brand Commitments

- The product name is Bookhand.
- Product language is calm, direct, and precise. It explains agent activity and
  local-storage boundaries without anthropomorphic spectacle or inflated AI
  claims.
- The application remains reader-first. Agent capability supports the book
  rather than becoming the primary interface.

## Evidence on Hand

- The deployed proof of concept is available at
  `https://bookhand.dev/` during the judging period.
- `public/books/calculus-made-easy.epub` provides real technical-book content,
  inline mathematical alternatives, figures, and the Chapter X hero source.
- `tests/fixtures/epub/` contains deterministic, malformed, and malicious EPUB
  evidence for reader, storage, selection, and containment behavior.
- Chromium's genuine `document.modelContext` registration and execution are
  exercised in `tests/e2e/webmcp-agent.spec.ts` and by the deployed live check.
- The current automated “agent” path is deterministic orchestration with
  authored payloads. It proves the tool plumbing, not that a model designed a
  valuable lesson.
- No genuine model-composed rich study experience has yet been accepted as
  evidence. `docs/contracts/polish/VAL-HERO-MODEL-RUN.md` defines that bar.

## Product Principles

1. **The book remains primary.** Reading must be competent and calm without an
   agent; study experiences support rather than bury the source.
2. **Grounding stays inspectable.** Explanations and artifacts carry exact,
   navigable source relationships instead of relying on model memory.
3. **The reader stays in control.** Persistent agent changes are legible and
   can be removed, reset, or undone without changing the underlying book.
4. **Composition beats chat.** WebMCP should let a model combine useful native
   capabilities into a learning experience, not merely operate buttons or
   append conversational prose.
5. **Local-first is product behavior.** Core reading and study remain useful
   without an account, hosted model backend, or book-content upload.
6. **Guidance enables freedom.** Customization surfaces give people and agents
   enough semantic design context to create coherent alternatives while
   preserving accessibility, reversibility, and the book's source integrity.

## Accessibility & Inclusion

Bookhand targets WCAG AA for application text, controls, focus, and meaningful
states. Keyboard operation, reduced-motion alternatives, text scaling,
44-by-44 CSS-pixel coarse-pointer targets, and one-primary-surface mobile
composition are durable requirements. Physical Android long-press validation
is useful but non-gating under ADR 0003 and must not be confused with touch
emulation evidence.
