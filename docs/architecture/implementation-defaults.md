# Implementation defaults for the fast vertical slice

This document closes routine technical choices so implementation agents can
build instead of repeatedly redesigning the project. These are defaults, not a
promise to preserve an approach after evidence disproves it. Deviate only when
the hero flow is blocked, and record the reason in `docs/plan/current-work.md`.

## One-sentence architecture

A Vite/React client loads an EPUB with upstream Foliate.js, persists reader and
study state in official SQLite WASM over OPFS, runs SQLite and Transformers.js
in separate dedicated workers, exposes domain operations as WebMCP tools, and
renders agent artifacts as native study blocks or explicit sandboxed labs.

## Dependency defaults

Use direct dependencies rather than frameworks around frameworks:

- the exact pinned MIT `jomi-se/foliate-js` owner fork for EPUB parsing,
  rendering, CFI, and navigation, behind `ReaderAdapter` and ADR 0005;
- `@sqlite.org/sqlite-wasm` for the sole local database and FTS5 lexical index;
- `@huggingface/transformers` for local embeddings;
- `zod` only if it materially simplifies runtime validation shared by UI and
  tools; JSON Schema remains the WebMCP declaration format;
- `vitest` and Testing Library for narrow domain/component tests;
- Playwright only for the real hero flow.

Do not add Redux, a server framework, an ORM, Turso, Dexie, MiniSearch,
`sqlite-vec`, another vector database, LangChain, an agent SDK, or a general
canvas framework in v0.

Post-submission exception: ADR 0006 authorizes the optional Agent Connect Tutor
in `bookhand-next`; ADR 0007 supersedes its transport with native OpenClaw
authorization and AI SDK execution. It reuses page-owned tool handlers and does
not change the submitted app or make ordinary reading depend on a provider.

## Reader boundary

Create a `ReaderAdapter` around Foliate.js. UI components and WebMCP handlers
must not reach through it to arbitrary viewer internals. Its initial surface is:

The judged ChatGPT browser rejects Foliate's generated `blob:` section iframe
navigations. ADR 0005 therefore keeps one same-origin frame and replaces its
parsed document in place. Do not restore `blob:`, `data:`, or `srcdoc` frame
navigation without testing inside the controlled browser.

```ts
interface ReaderAdapter {
  open(blob: Blob): Promise<BookMetadata>
  close(): Promise<void>
  getToc(): TocItem[]
  getLocation(): ReaderLocation
  getSelection(): ReaderSelection | null
  getVisibleContext(): Promise<Passage>
  getPassage(range: BookRange): Promise<Passage>
  listSections(): BookSection[]
  getSectionSnapshot(sectionIndex: number): Promise<BookSectionSnapshot>
  navigate(target: BookTarget): Promise<void>
  applyStyle(style: ReaderStyle): void
  resetStyle(): void
}
```

Use Foliate/EPUB CFI as the navigable anchor and keep section index plus a short
text fingerprint as diagnostic fallback data. Never expose viewer DOM nodes or
opaque iframe handles through the domain API.

Foliate-specific extraction code may use a separate internal-only section
source whose `createSectionDocument()` returns a DOM `Document`; that interface
must not be reachable from UI, WebMCP, structured-clone messages, or public
reader-domain callers.

## Persistence schema

Use one SQLite database with small, explicit tables:

- `books`: content hash, metadata, original EPUB `Blob`, import time;
- `readingState`: book id, current CFI/location, style profile, timestamps;
- `annotations`: id, book id, CFI range, quote, color, note, timestamps;
- `boards`: id, book id, title, layout mode, timestamps;
- `studyItems`: id, board id, optional source range, kind, payload, order;
- `chunks`: id, book id, section, title breadcrumb, start/end CFI, order, text,
  text hash, index version;
- `vector_batches`: book id, model id, first chunk/order metadata, count,
  dimensions, and a packed normalized float32 BLOB;
- `chunks_fts`: an FTS5 external-content index over chunk text.

Hash imported EPUB bytes with SHA-256 for the book id. Keep application records
separate from the Foliate viewer so the reader engine can be replaced without a
data migration. Persist after meaningful transitions, not on every render.

The database lives in `opfs-sahpool` and is owned for its lifetime by exactly
one dedicated worker. Use the synchronous SQLite `oo1` API inside that worker
and expose a small typed request protocol to the UI. Do not use SQLite's
deprecated Worker1 or Promiser APIs, even if a tutorial recommends them. Do not
set COOP/COEP headers for this path.

Commit ingestion in transactions of roughly 250 chunks and yield between
batches. Record progress and the index epoch after each committed batch so a
reload or cancellation resumes rather than restarts. A second-tab sahpool lock
is an expected product state: show “This library is open in another tab” and a
retry action.

Keep the external-content FTS5 table synchronized with `chunks` through
`INSERT`, `UPDATE`, and `DELETE` triggers, so the source row and lexical index
change in the same SQLite transaction. On an FTS schema or tokenizer version
change, use FTS5's `rebuild` command and record completion in the index metadata;
do not maintain an independently serialized lexical snapshot.

## Text extraction and chunking

Index one section at a time through the internal-only Foliate section source.
Publish only serializable `BookSectionSnapshot` and `Passage` values from the
reader domain; section `Document` objects remain inside extraction code.

1. Walk visible text nodes beneath the section body.
2. Skip `script`, `style`, `noscript`, `template`, hidden/inert content, and
   viewer-injected chrome.
3. Insert separators at block boundaries instead of concatenating paragraphs.
4. Preserve useful equation text from MathML and accessible labels when plain
   text would otherwise be empty. Preserve figure captions. Do not attempt OCR.
5. Group complete paragraphs toward 800 characters, allow roughly 400–1,200,
   and overlap one short paragraph or at most 100 characters.
6. Store start and end CFI, section index, chapter breadcrumb, global order, and
   the exact normalized text.
7. Round-trip each generated CFI against the section before committing it.

These numbers are tuning defaults, not doctrine. Prefer coherent source units
over perfectly uniform lengths. The embedding model accepts longer input than
we need; chunks remain small primarily so citations and explanations are
precise.

## Search ladder

Implement retrieval in this order:

1. Exact current selection and visible context.
2. Direct lookup by CFI and structural neighbors.
3. Exact/lexical search with SQLite FTS5 and BM25 ranking.
4. Local semantic retrieval.
5. Simple hybrid fusion.

This order ensures the first WebMCP demo can work before the embedding layer is
finished and leaves a useful fallback if local inference fails.

### Database worker

The database worker owns:

- the sole SQLite connection and `opfs-sahpool` lifecycle;
- schema creation and migrations;
- all persistent reader and study state;
- FTS5 lookup;
- vector BLOB loading and the lazy in-memory vector matrix;
- exact vector top-k and small-list hybrid fusion inputs.

Use the official package's direct module initialization and `oo1` APIs. The
database worker is not the embedding worker: model inference is long-running and
must not queue interactive searches behind it. Communicate with a small typed
message protocol; Comlink is optional if it removes more code than it adds.

At startup, try to install `opfs-sahpool` with a short bounded retry for ordinary
reload teardown races. If persistence is unavailable, open an in-memory SQLite
database and display an unmistakable session-only warning. Request
`navigator.storage.persist()` after the user's first book import.

### Local embedding worker

The UI communicates with one module Web Worker through a tiny protocol:

```ts
type EmbeddingWorkerRequest =
  | { type: 'load' }
  | { type: 'embed'; requestId: string; texts: string[] }
  | { type: 'cancel'; requestId: string }

type EmbeddingWorkerEvent =
  | { type: 'download-progress'; file: string; progress: number }
  | { type: 'ready'; modelId: string; dimensions: number }
  | { type: 'result'; requestId: string; vectors: Float32Array[] }
  | { type: 'error'; requestId?: string; message: string }
```

Pin `mixedbread-ai/mxbai-embed-xsmall-v1`, request mean pooling and normalized
vectors, and index in small batches (start at eight). Use quantized WASM first.
The model has about 24 million parameters and is explicitly demonstrated by the
Transformers.js documentation for browser embeddings. Browser caching should
make subsequent use offline-capable after the first download.

Do not auto-download the model merely because a book opened. Start when the user
enables semantic search or an agent requests it, and show the cost honestly.
Indexing must be abortable and resume by reusing already committed chunks.

### Vector storage and ranking

Normalize vectors at creation and transfer them from the embedding worker in
batches. Store about 1,000 consecutive vectors per ordinary SQLite BLOB rather
than one row per vector. On first semantic query, load the current book into one
`Float32Array` in the database worker, retain the chunk-id/offset mapping, and
calculate exact dot products there.

Invalidate the in-memory matrix only after the transaction containing a changed
vector batch commits. Rebuild it lazily on the next semantic query.

Search the current book only. Take the top 20 FTS5 and top 20 semantic results,
combine them with reciprocal-rank fusion in TypeScript, deduplicate overlapping
chunks, and return five by default.

Do not use `sqlite-vec`: the available browser builds require replacing the
official SQLite artifact, and measured exact search was no faster than the
plain JavaScript scan at 10,000 chunks. Do not build ANN indexing. A few thousand
vectors of 384 floats are a small corpus by vector-search standards.

## WebMCP v0 surface

Keep registration behind `WebMcpAdapter`; domain handlers must also be directly
callable from tests and the ordinary UI. Pin the hackathon's current WebMCP API
shape inside that adapter rather than spreading draft browser types throughout
the application.

Start with these tools:

| Tool | Purpose |
| --- | --- |
| `get_design_context` | Read compact, versioned composition guidance plus current surface/theme state before styling or composing study material. |
| `get_reading_context` | Book metadata, current location, selected/visible passage, nearby structure, active board summary. |
| `get_table_of_contents` | Bounded TOC tree with stable navigation targets. |
| `get_passage` | Exact text and neighbors for a CFI/range or structural target. |
| `search_book` | Lexical or hybrid passage search with navigable citations. |
| `navigate_book` | Move to a returned CFI/heading/chapter target. |
| `save_annotation` | Create or update a highlight/note tied to an exact source range. |
| `set_reading_style` | Apply named settings plus bounded book CSS; always return the previous style and reset path. |
| `upsert_study_item` | Create/update one native block or one generated lab on the current board. |
| `set_study_board_view` | Dock, expand, focus, or close the board without deleting content. |

Prefer a small number of composable tools over separate tools for every study
block kind. Write operations use stable caller-provided ids when possible so a
retry updates rather than duplicates.

Every tool result that quotes the book returns `bookId`, `startCfi`, `endCfi`,
`sectionTitle`, and text. Every persistent mutation becomes visible in the UI
and can be undone or deleted by the user.

### Agent-facing design context

The page-owned WebMCP surface is the delivery mechanism for design guidance.
Repository skills and `DESIGN.md` help implementation agents, but a browser
agent cannot be assumed to see either. Keep `get_design_context` read-only,
available before and after a book opens, and backed by a compact versioned
runtime artifact rather than shipping the complete design document as prompt
text.

The result is selected by `surface` (`library`, `reader`, or `study`) and
contains current state, supported primitives, semantic roles, mutation scope,
four to six relevant composition invariants, accessibility expectations, and
the available Preview, Apply, Undo, Reset, or Delete path. It must also state
the creative freedom plainly: semantic roles, containment, source integrity,
and user control are stable; palette, typography, shape language, and
composition may change coherently.

Descriptions for presentation and study-composition tools direct the agent to
this context rather than duplicating it. High-expression calls such as custom
book CSS, a custom semantic theme, or a multi-block study experience carry the
design-context version they used. A stale version fails before mutation and
invites a refresh; ordinary named-theme and one-block operations stay simple.
Mutation results return an observable receipt with prior/applied state,
sanitizer warnings, visible scope, provenance, and the exact reversal route.

Do not treat raw application-shell CSS or JavaScript as a customization API.
A custom whole-application world requires a separate decision defining a
declarative semantic-token schema, persistence, preview/apply lifecycle,
provenance, Undo/Reset, and permitted surfaces. Bounded EPUB CSS and trusted
native study rendering remain separate containment domains.

## Study-board content

Native v0 block kinds:

- rich text/Markdown;
- source quotation;
- equation;
- ordered worked steps;
- callout;
- question with revealable answer;
- Mermaid diagram;
- simple data plot.

Store structured payloads, not rendered HTML, for native blocks.

When these are insufficient, allow a `lab` item containing HTML, CSS, JavaScript,
and a JSON data payload. Render it in an iframe with `sandbox="allow-scripts"`
and no `allow-same-origin`. Pass initial data with `postMessage`; do not give the
lab storage, WebMCP, or parent-DOM access. A visible badge, reload, edit-source,
and delete controls are enough for the POC. This single browser primitive is the
right amount of containment; do not build a permissions platform around it.

## UI shape

- Desktop: reader plus resizable docked study board; board can expand to occupy
  the workspace while preserving reading location.
- Mobile: one primary surface at a time with a persistent, obvious switch
  between book and board. Do not squeeze two columns onto a phone.
- Selection action: a small “Study this” affordance creates/opens the board and
  makes the selected range the obvious agent context.
- Index state belongs near search/tutor controls, not in a settings labyrinth.

The board is not a chat transcript. Agent prose may appear, but durable learning
material is represented by study items tied back to sources.

## Validation floor

Keep the test suite proportional to a hackathon POC:

- unit-test chunk boundaries and CFI round trips on one small EPUB fixture;
- unit-test hybrid ranking and duplicate suppression;
- contract-test every WebMCP handler without a browser agent;
- integration-test SQLite schema creation, FTS5, transactions, export, and
  batched-index resume against the real official WASM artifact;
- test OPFS reload recovery and the explicit second-tab lock state;
- run one Playwright hero path from selection to persisted study artifact;
- manually run the same path with the actual supported WebMCP agent before
  submission.

Do not create a cross-browser matrix, exhaustive visual snapshots, or elaborate
performance harness before the hero flow works. Capture three timings on the
target phone: first model load, full hero-book index, and semantic query.

Before treating the storage choice as phone-validated, run the preserved
`experiments/sqlite-browser-storage-spike/` drills on a Pixel 7. Desktop
Chromium results choose the default; they do not prove Android lifecycle and
memory behavior.

## Complexity gates

The following require evidence recorded in `current-work.md`:

- `sqlite-vec` or another vector extension: only after the official SQLite plus
  exact-scan path fails a measured target and a maintained official-compatible
  browser artifact exists.
- another persistence system: only if the Pixel 7 OPFS drills fail in a way that
  cannot be mitigated within the hackathon; Dexie is the documented fallback,
  not a parallel implementation.
- WebGPU: only after WASM is too slow and the target environment is confirmed.
- semantic chunk reranking: only after reviewing actual bad queries.
- OCR or image embeddings: only if the chosen hero passage cannot be extracted.
- multiple embedding models: only after committing to multilingual scope.
- custom Foliate.js fork: only after upstream APIs demonstrably block the hero
  flow.
- Agent Connect: only after the judgeable browser-native WebMCP path is complete.
