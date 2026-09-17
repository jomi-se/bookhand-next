# Repository guidance

## Product boundary

This is a local-first ebook reader and WebMCP study environment. Keep reading,
annotation, search, and study-board capabilities useful without an agent. WebMCP
is the semantic bridge that lets a compatible agent discover and combine those
capabilities; do not make the reader depend on one model vendor or harness.

The application is client-side for the proof of concept. Do not add a backend,
accounts, synchronization service, Agent Connect dependency, or production
security machinery without recording the decision under `docs/decisions/`.

Read `docs/product-north-star.md` before making product or scope decisions. It
captures the motivating discussion and is the highest-level product authority.
Then follow `docs/architecture/implementation-defaults.md` and
`docs/plan/vertical-slice-build-order.md`; they exist to stop implementation
agents from reopening settled choices during the short build.

## Current scope

- EPUB reading built on the smallest practical Foliate.js integration.
- Local persistence for books, position, highlights, notes, and study boards.
- Official SQLite WASM owned by one dedicated worker, persisted with
  `opfs-sahpool`; FTS5 for lexical retrieval and ordinary packed BLOBs plus an
  exact JavaScript scan for vectors. Do not use `sqlite-vec`, Dexie, MiniSearch,
  SQLite Worker1, or the deprecated Promiser API unless ADR 0002 is revisited.
- Exact navigation, text lookup, table-of-contents access, and scoped search
  exposed through WebMCP.
- Typography and book CSS customization, including an agent-applicable style
  surface with a user-visible reset.
- Explicit document remastering: a browser agent may read and rewrite a
  section's XHTML and CSS as source code, while Bookhand preserves the
  publisher original and exposes comparison, revision history, Undo, and
  Reset. Deterministic repair helpers are optional accelerators, not the
  architecture or a limit on agent judgement. Never apply a remaster silently.
- Study boards that work both docked beside the book and as a larger workspace.
- Stable native blocks for common content, plus explicitly created generated
  labs for richer diagrams and interactive explanations. Keep generated work
  bounded to its study-board surface; do not let it silently rewrite the reader.
- Public-domain technical books are temporary judging fixtures, not permanent
  product commitments.

Favor a convincing vertical slice over a generalized platform. The immediate
question is whether WebMCP enables a materially better study experience than an
ordinary ebook reader.

## Commands

During the final submission day, follow
`docs/plan/deadline-operating-mode.md`: use focused regression checks and batch
broad verification at commit boundaries. Retire that temporary mode after the
submission.

Use npm from the repository root:

```sh
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
npm run verify
```

For routine non-interactive checks whose success output carries no useful
information, use `scripts/quiet-run.sh`. It prints one line on success and a
bounded failure tail while retaining the complete log in `/tmp`. This prevents
mechanical command output from displacing useful implementation context.

```sh
./scripts/quiet-run.sh "typecheck" npm run typecheck
./scripts/quiet-run.sh --detach "verify" npm run verify
```

Prefer the narrowest relevant check while editing. Format only after code has
stabilized and before final verification; do not interleave mechanical
formatting with every code change.

## Browser validation

Use the project Playwright MCP for browser investigation and user-flow checks.
WebMCP is compiled into Playwright's bundled Chromium but gated: launch with
`--enable-features=WebMCPTesting` (the switch behind
`chrome://flags/#enable-webmcp-testing`) to get a real `document.modelContext`
on a secure origin. Prefer that real runtime over a stand-in.
`docs/research/2026-09-01-webmcp-in-playwright.md` has the working recipe, the
switches that do not work, and the two API shapes a stub gets wrong.
Prefer the `agent-browser` skill when its workflow applies. Test the real user
surface and preserve useful screenshots or traces under an ignored artifact
directory when they are evidence for a decision.

## Skills and harnesses

Shared skills live under `.agents/skills`. `.codex/skills` and `.claude/skills`
are adapters to the same files so their instructions do not drift.

Impeccable is available for deliberate design and UI review. Its automatic
post-edit hooks are intentionally disabled: invoke the relevant skill when the
work benefits from it instead of paying for a review on every edit.

The shared Impeccable build default is code-first. This keeps routine reader
and product work fast and avoids spending image-generation tokens on changes
whose visual direction is already established. The default is not a ban on
comps: override it for a specific task when a generated image will materially
improve the reference, ambition, or alignment for a novel surface (for example,
the hero interactive study experience). State the temporary override and its
reason; do not change the shared default merely for one such task.

`CLAUDE.md` imports this file. Keep durable cross-harness guidance here rather
than maintaining two copies.

## Documentation

- Product North Star: `docs/product-north-star.md`
- Product mission and boundaries: `docs/mission.md`
- Current surface inventory: `docs/scope-inventory.md`
- System shape: `docs/architecture/`
- Accepted decisions: `docs/decisions/`
- Active work and handoff state: `docs/plan/current-work.md`
- Time-stamped external research: `docs/research/`
- Time-stamped reviews: `docs/reviews/`
- Deployment and hosting: `docs/deployment.md`

Update the earliest source of truth that changed. Keep
`docs/plan/current-work.md` current enough that another agent can resume after a
usage reset without reconstructing the project from chat history.

## Engineering rules

- Add tests for public behavior as it appears.
- Keep browser packages free of Node-only runtime imports.
- Treat imported book content and agent-produced content as untrusted input.
- Reader implementation agents must work from Bookhand's reader-engine
  specifications and the MIT `jomi-se/foliate-js` fork. Do not clone, inspect,
  or copy from the AGPL Readest application.
- Keep WebMCP tool inputs narrow, schema-described, and observable in the UI.
- Preserve user control over persistent changes and destructive operations.
- Record architectural forks before implementing both sides of them.
