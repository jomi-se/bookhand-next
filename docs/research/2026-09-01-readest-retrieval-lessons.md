# Readest and Reedy retrieval lessons

Observed: 2026-09-01

Source snapshot: Readest at commit `180795fb4`

## Why inspect it

Readest is a mature ebook application, and the local checkout contains a Reedy
AI/retrieval implementation. It is useful prior art for the difficult boundary
between rendered EPUB text, stable source locations, retrieval, and reader UI.
It is not the architecture to reproduce wholesale in a short browser-only proof
of concept.

Readest is AGPL-3.0. Its Foliate.js engine is separately MIT licensed. Learn
from Readest's boundaries and behavior; do not copy application code unless this
project deliberately accepts the resulting licensing obligations. Prefer the
upstream MIT Foliate.js package over Readest's application or fork-specific
layers.

## Valuable ideas to carry forward

### Text chunks must remain navigable

`CfiChunker.ts` walks each EPUB section's DOM, ignores non-content nodes, groups
text at paragraph/sentence/word boundaries, and stores a start and end EPUB CFI
with every chunk. It also round-trips generated CFIs before storing them.

The important principle is not its exact 500-character and 50-character-overlap
defaults. It is that retrieval results are source locations, not detached text
snippets. Our chunks likewise need a stable book id, section, structural title,
ordered position, exact text, and navigable range.

### Indexing is a visible lifecycle

`BookIndexer.ts` separates chunking from embedding, reports progress, records
index state, replaces old data on re-index, batches inference, supports abort,
and distinguishes an empty book from a failed index. The POC needs the same
user-facing states even if its persistence is much simpler:

- not indexed;
- downloading the local model;
- extracting text;
- embedding `n / total`;
- ready;
- failed with a retry or “use exact search” path.

### Semantic search should degrade, not disable reading

`BookRetriever.ts` combines vector and full-text results, returns navigable
sources, detects stale indexes, and falls back when embedding the query fails or
times out. This reinforces the local-first boundary: exact navigation and
lexical search remain useful before the model downloads, on unsupported
hardware, or after an inference failure.

### Keep the model behind a tiny interface

Reedy's retrieval code sees an `EmbeddingModel` with an id, dimension, batch
size, and `embed()` method. Provider-specific machinery stays outside. Our
browser worker should expose the same conceptual seam even though v0 has one
pinned Transformers.js model. This keeps model loading and retrieval logic from
infecting the reader domain.

## Deliberately not copied

- Readest's Turso-specific database service, vector columns, and native-provider
  assumptions. We use the official browser SQLite WASM artifact, OPFS, ordinary
  BLOBs, and an application-owned exact scan instead.
- Its database-level hybrid implementation. We retain the principle of FTS plus
  semantic fusion, but use the official build's FTS5 and fuse two small ranked
  lists in TypeScript.
- Multiple hosted and local embedding providers. The POC pins one local model.
- Reedy's agent runtime, prompt layering, memories, skills, chat history, and
  provider adapters. The connected WebMCP agent owns intelligence and dialogue.
- Readest's complete reader shell, synchronization, Tauri services, and broad
  format support.

## Source pointers

- `apps/readest-app/src/services/reedy/retrieval/CfiChunker.ts`
- `apps/readest-app/src/services/reedy/retrieval/BookIndexer.ts`
- `apps/readest-app/src/services/reedy/retrieval/BookRetriever.ts`
- `apps/readest-app/src/services/reedy/models/EmbeddingModel.ts`
- `apps/readest-app/src/services/reedy/db/ReedyDb.ts`
- `apps/readest-app/src/services/reedy/tools/builtins/`
- `apps/readest-app/src/app/reader/components/FoliateViewer.tsx`
- `apps/readest-app/src/components/settings/LayoutPanel.tsx`

## External references

- Foliate.js: <https://github.com/johnfactotum/foliate-js>
- Transformers.js: <https://huggingface.co/docs/transformers.js/en/index>
- Local embedding default: <https://huggingface.co/mixedbread-ai/mxbai-embed-xsmall-v1>
- Measured browser storage report:
  `2026-09-01-sqlite-wasm-vs-indexeddb-report.md`
