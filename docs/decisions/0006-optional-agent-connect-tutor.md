# ADR 0006: Optional Agent Connect tutor in the development fork

Accepted: 2026-09-05, by Jose's authorized integration handoff.

Historical decision: ADR 0007 supersedes the runtime-card transport, credential
storage and conversation-restoration choices below. The optional-Tutor and
page-owned-tool boundaries remain in force.

The browser-native WebMCP submission is complete. Integrate the published
`@open-agent-connect/web` 0.0.3 headless conversation helpers in `bookhand-next`,
without modifying the judged repo or deployment. This deliberately opens the
Agent Connect dependency gate in the original implementation defaults.

The optional Tutor panel owns connection and conversation presentation. Reading,
Search and Study remain usable without it. Study contains saved learning work,
not a transcript or tool diagnostics. The SDK owns transport and continuation;
Bookhand owns selection context, tool definitions, validation and effects.

Lend the same page-owned WebMCP handlers directly as SDK application tools. Do
not require experimental native tool discovery on a phone, duplicate tool
semantics, or couple tools to a model/harness. Freeze tools and bind execution
to the open book's lifetime; ending that lifetime cancels the session and
rejects later calls. Closing the panel alone does not end the conversation.

Use the SDK's signed runtime-card and gateway-owned authorization flow. Show
what leaves the device before connecting. Keep credentials and pending redirect
state in tab-scoped sessionStorage, never in the book database or logs. A reload
does not silently restore/replay a conversation. Follow-ups use the same mounted
SDK chat; an expired/lost session requires explicit new-conversation action.

HTTPS gateway requests require an intentional connect-src expansion to HTTPS;
this permits user-chosen gateways without hard-coding a vendor. Reader/lab
content containment stays unchanged and must be checked independently: untrusted
content is not granted the application's gateway network permissions. A static
deployment CSP cannot add an arbitrary origin after a runtime-card selection;
HTTPS is the deliberate app-level ceiling, while the SDK verifies the selected
gateway identity and the user grants its tool snapshot. Do not add unsafe-eval: SDK 0.0.3's Ajv
runtime compilation is an integration blocker to resolve upstream.

No backend, accounts, sync, image/file delivery, publishing or deployment is
part of this slice. Ask Jose before every git push.
