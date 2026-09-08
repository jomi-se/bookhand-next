# Ideas — not accepted plans

Exploratory proposals, not implementation authorization. Discuss and accept a
proposal before promoting it into `docs/plan/`; record architectural decisions
in `docs/decisions/`. Confirmed defects should be tracked separately from ideas.

- [Cross-session Study editing](cross-session-study-editing.md): let a person
  authorize a new agent to revise existing work without recovering an old token.
- [Mutation receipt simplification](mutation-receipts.md): investigate costs
  before changing retry safety; no measured overhead yet.
- [Human-facing copy](human-facing-copy.md): make guidance sound more natural.

These files replace root `IDEAS.md`. The shipped remastering proposal and old
human E2E defect notes were removed rather than retained as misleading backlog.
Current remastering behavior belongs in the
[implementation documentation](../plan/document-remaster-slice.md).
