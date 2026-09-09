# Restored Tutor conversation exposes raw application steps

Status: **OPEN**. Recorded 2026-09-09 from Jose's owner-accepted live Agent
Connect vertical slice.

## Observed behavior

The live conversation itself works and restores after reload, but the restored
Tutor transcript renders internal history entries as ordinary conversation
content. Long application outputs and tool receipts appear under repeated
`Input (prompt or application output)` labels as raw JSON. In the reported run
this included duplicated `content` and `structuredContent`, full reading-context
passages and ranges, search results, Study mutation receipts, action-group IDs,
update tokens and source excerpts.

The result is technically complete but not readable as a conversation: the
learner's prompt and the Tutor's answer are buried under implementation detail,
and JSON escaping destroys normal prose/math formatting.

This is owner-observed live evidence. The report does not establish whether the
history projection, Bookhand adapter or Tutor rendering is the earliest faulty
boundary; reproduce before assigning the cause.

## Expected behavior

After reload, the primary Tutor transcript should read like the conversation the
learner saw before reload:

- Show learner prompts and Tutor answers with their normal prose formatting.
- Do not render raw application/tool envelopes as peer chat messages.
- Preserve honest provenance. If intermediate activity is useful, summarize it
  compactly or place it behind a clearly labeled disclosure instead of silently
  relabeling it as assistant prose.
- Keep truncation explicit when provider history is bounded; never imply omitted
  messages were recovered.
- Continue treating restored book/tool text as untrusted content and never render
  it through unsafe HTML.

The exact omit-versus-collapse presentation is still a product choice. Do not
solve this by discarding data required to identify the final answer or by
inventing assistant text from tool results.

## Boundaries for a future fix

This is a presentation/projection defect, not authorization to change OAuth,
connection persistence, checkpoint selection, same-book association, Web
Locks/CAS, conversation expiry, cancellation or no-replay behavior. Do not
re-execute any restored prompt or tool call.

A focused regression should restore a completed turn containing a learner
prompt, reading-context output, search output, a Study mutation receipt and a
final Tutor response. Assert that the primary transcript preserves the prompt
and formatted final response while raw JSON/tool payloads are absent from the
main message flow (or contained only in an explicitly chosen disclosure). Also
cover bounded/truncated history and application-output-only entries without
misattributing them to the learner or Tutor.
