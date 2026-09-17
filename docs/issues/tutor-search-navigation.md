# Tutor search anchors, navigation and timeout reporting

Status: **OPEN**. Recorded 2026-09-08 from Jose's authorized Agent Connect
handoff while preparing Bookhand's integration commits.

Jose confirms the connection/follow-up flow works, but explicitly says unstable
search anchors, navigation and timeout reporting are not solved. Preserve three
separate concerns until reproduction establishes whether they share a cause:

- Search results/source anchors may not reliably identify a usable destination.
- Navigation from Tutor/search may be unstable or fail to show the intended
  passage.
- Timeout/error reporting may not accurately describe the reader's state or
  the outcome of an action.

This handoff supplies no new exact range, trace, timing or reproducible input;
do not invent a diagnosis. Earlier unavailable-index results mean the index was
not ready, not that the book contained no matches. Tool-description fixes clarify
usage but do not repair anchors, indexing, rendering or timeout behavior.

No indexing implementation or unverified navigation fix is included in the
integration packaging. Follow-up: capture one failing book/range/command and
actual reader state, distinguish index availability from source resolution and
presentation failure, then add a focused regression before implementing a fix.
No live replay is authorized by this issue record.

## 2026-09-17 live reproduction

After the Agent Connect Web SDK 0.0.9 upgrade, a live Tutor run completed 20
mixed parallel and sequential tool calls, including durable EPUB repairs and a
Study lesson. `navigate_book` and `set_study_board_view` calls were separately
blocked because the generated inputs supplied mutually exclusive operations;
the UI displayed repeated blocked notices and the handlers changed no state.
This narrows the defect to Bookhand tool-call argument formation or guidance,
not transport continuation. The raw rejected payloads were not captured, so a
follow-up must record them before choosing between a schema, description, model
adapter, or presentation fix.
