# Bookhand

A local-first EPUB reader whose reading and study capabilities are registered
as WebMCP tools, so a person and their agent can study the same book together.

The book never leaves the browser. There is no backend, no account, and no
model bill: books, reading position, highlights, notes, and study boards live
in SQLite compiled to WebAssembly, persisted in the browser's own storage.

## What it does

Bookhand is a real reader first. Open one of the bundled books or import your
own EPUB, navigate a nested table of contents, select exact text, adjust
typography and book CSS, and come back later to exactly where you were. All of
that works with no agent present.

WebMCP then gives an agent precise semantics for the same capabilities, instead
of leaving it to guess its way around the interface. Because a book is a
document an agent cannot see, and a reader's position in it is state an agent
cannot infer, the reader has to hand both over explicitly. Once it does, the
agent can read the passage you are actually looking at, quote it exactly,
highlight it in your book, and build a lesson on your study board that links
back to the precise range it came from.

## The tools

Registered through `document.modelContext.registerTool` whenever a book is
open:

| Tool | What an agent can do |
| --- | --- |
| `get_reading_context` | Read the current book, chapter, progress, visible passage, and live selection |
| `get_table_of_contents` | List the book's structure with navigable targets |
| `get_passage` | Re-read the exact text at a range returned earlier |
| `navigate_book` | Move the reader to a CFI, an href, a section, or the next/previous page |
| `save_annotation` | Highlight a passage and attach a note |
| `set_reading_style` | Change size, line height, measure, spacing, theme, or book CSS |
| `upsert_study_item` | Add or update a prose, quotation, equation, steps, or question block |
| `list_study_items` | Read what is already on the board |
| `set_study_board_view` | Dock the board beside the book or expand it |

Three properties matter more than the list:

**One surface, not two.** Every tool calls `BookhandCommands`
([`src/app/commands.ts`](src/app/commands.ts)) — the same code the interface
calls. An agent cannot reach behaviour a person cannot reach, and the two paths
cannot drift apart.

**Book text is untrusted.** A book can contain text aimed at whichever agent
reads it. Passages are returned inside an explicit boundary labelling them as
data, never as instructions.

**Agents anchor to real ranges.** Tools accept only ranges other tools
returned. An invented range is refused before anything is stored, so an agent
cannot highlight text that is not in the book.

**You can watch it happen.** Every tool call appears in the study board as it
runs, with what it did, and failures shown as failures.

## Try it

Open the live URL in ChatGPT's in-app browser, or in Chrome 149+ with
`chrome://flags/#enable-webmcp-testing` enabled. Then:

1. Open *Calculus Made Easy* from the library and go to a chapter.
2. Ask your agent something like *"read what I'm looking at and turn it into
   study steps I can keep"*.
3. Watch the tool calls appear in the Study panel, and the new block land on
   the board with a link back to the exact passage.

Without an agent, everything still works: select a passage, choose **Highlight**
or **Study this**, and build the board by hand.

## Run it locally

```sh
npm install
npm run build && npm run preview
```

`npm run dev` is intentionally not the way to view it: the production Content
Security Policy blocks the dev server's inline script, and that CSP is part of
how imported books are contained.

The full gate — lint, types, unit tests, production build, bundle scan, and
browser tests — is:

```sh
npm run verify
```

To serve from a subpath, such as a project page:

```sh
BOOKHAND_BASE=/bookhand/ npm run build
```

## How it is built

- **Reading** — [foliate-js](https://github.com/johnfactotum/foliate-js) pinned
  to a commit, behind a `ReaderAdapter` boundary. No DOM object crosses it, so
  everything the agent sees is serializable.
- **Storage** — official SQLite WASM in one dedicated worker over
  `opfs-sahpool`, with a runtime-validated typed protocol, an in-memory
  fallback when the browser refuses persistent storage, and an explicit
  second-tab lock rather than a silent shadow library.
- **Containment** — imported EPUBs are untrusted. A malicious sentinel EPUB is
  driven through the production build on every run to prove no packaged script
  executes and no off-origin request completes.

Architecture decisions are in [`docs/decisions/`](docs/decisions/), the product
thesis in [`docs/product-north-star.md`](docs/product-north-star.md), and
current state in [`docs/plan/current-work.md`](docs/plan/current-work.md).

## Bundled judging books

Bookhand temporarily includes three unmodified, checksum-pinned Project
Gutenberg EPUBs:

- *Calculus Made Easy* by Silvanus P. Thompson — the primary reading, tutoring,
  and mathematics-remaster demonstration.
- *Relativity: The Special & the General Theory* by Albert Einstein — a corpus
  whose hundreds of image-based formula glyphs make semantic restoration
  especially visible.
- *Flatland* by Edwin A. Abbott — a contrasting example of structural,
  responsive, and figure restoration in legacy book markup.

They are judging fixtures, not part of the product. Emptying the registration
list in [`src/library/bundled-books.ts`](src/library/bundled-books.ts) leaves the
ordinary empty library. See [`public/books/README.md`](public/books/README.md)
for exact artifacts, provenance, checksums, and terms.

## License

Bookhand is MIT licensed. See [`LICENSE`](LICENSE) for Bookhand's license and
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the bundled books,
fixtures, and dependencies.
