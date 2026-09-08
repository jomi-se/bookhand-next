# Cross-session Study editing

Status: unaccepted. Migrated from `IDEAS.md`; code checked at `2c36f33`, 2026-09-05.

A person should be able to ask a new conversation to improve yesterday's card.
Today, agent-created items receive an update token; agent updates must supply it.
The public item representation deliberately excludes it. See
[repository mutations and mapping](../../src/storage/library-repository.ts).
Losing the token blocks that agent update path, not the person's own editing.

Proposed direction: an agent submits a before/after proposal and the person
approves or rejects it. Approval could authorize a narrowly scoped revision
without handing a new conversation unrestricted ownership. Existing revision
history could support recovery. A per-card agent-edit lock is another option,
not a requirement.

Decide before building:

- Which items may be proposed for editing, including person-authored content?
- Is approval one revision only, or an explicit continuing grant?
- What happens if the person edits between proposal and approval?
- How do preview, revision conflicts, Undo, and retries compose?

Do not remove token checks as incidental cleanup. Human approval needs a real
authorization path, not merely a dialog preceding an unrestricted mutation.
