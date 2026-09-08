# Bookhand as the OpenClaw Agent Connect demo

Superseded for new integration work on 2026-09-06 by
[native provider connection and AI SDK](connect-your-ai-bookhand.md). Keep the
following as evidence/history; its runtime-card/dashboard instructions are not
the new onboarding plan or permission to resume the old deployment.

Started 2026-09-05. Active branch: `work/openclaw-tutor-demo` in the existing
`/home/dev/bookhand` checkout. Branch starts at `2c36f33`; all pending Tutor
implementation and unrelated documentation edits were carried intact. `main`
has not moved. No additional worktree, public deployment, or push.

## Scope and ownership

Bookhand replaces the bundled Canvas as the real application demonstration.
Keep ADR 0006's optional, harness-neutral Tutor and the page-owned WebMCP tool
handlers. Agent Connect owns runtime setup, authentication, tool-snapshot
authority, Open Responses, and continuation. Bookhand must not implement a
second protocol or special OpenClaw tool-output projection.

Upstream sources, initially inspected at `e9d1d04` in
`/home/dev/agent-connect-openclaw` on `work/openclaw-gateway`:

- `docs/decisions/0012-openclaw-policy-gateway.md`
- `docs/plan/openclaw-replacement.md`

The current SDK public API is unchanged. Bookhand uses the CSP-safe SDK tarball
documented in `vendor/README.md`, not the original npm 0.0.3 artifact. Change it
only for a demonstrated compatibility gap. Preserve the current CSP, including
the EPUB frame's independent restrictions.

This is demo preparation plus real-flow validation, not a general redesign or
backend migration inside Bookhand. Do not change the personal `agc` runtime,
gateway credentials, enrollment, Tailscale routes, or submitted `bookhand.dev`.
Normal local Bookhand preview rebuild/restart is authorized. Coordinate a new
isolated gateway/card with the Agent Connect instance; do not reuse the old
`/tmp/bookhand-agent-connect-runtime-card.json` for this proof.

## Scope inventory and evidence boundary

| Surface | Required behavior / evidence | Existing oracle |
| --- | --- | --- |
| SDK lending | Same schema/handler/result and book lifetime; no runtime-specific tools | `VAL-AC-TOOLS`, Tutor adapter tests |
| Connection | Explicit isolated runtime card and normal consent; same-book draft return; denial remains usable | `VAL-AC-AUTH`, callback tests |
| Source grounding | Actual source/context lookup, unchanged exact quote/range, visible source-linked artifact | `VAL-AC-HERO`, existing WebMCP source checks |
| Conversation | Actual useful result consumed, follow-up uses it without user restating it | `VAL-AC-CHAT/HERO`, SDK continuation test |
| Persistence/control | Saved artifact survives reload, source link returns to book; no replay or automatic remaster | `VAL-AC-HERO`, ordinary Study UI |
| Phone | Tutor/Study switching and Send reachable at Pixel 7 viewport; physical keyboard separately reported | `VAL-AC-PHONE` |
| Failures | No fabricated success for provider auth, interrupted stream, expired session, or rejected source; explicit recovery | `VAL-AC-AUTH/CHAT` |

The full existing contracts remain in [agent-connect-tutor.md](agent-connect-tutor.md).
Their scripted provider tests are supporting compatibility evidence, never
evidence that OpenClaw or a subscription model taught anything. Prior Omnigent
consent/denial checks are historical, not replacement-gateway proof.

## Demo-specific acceptance

### VAL-BH-OC-SETUP

Surface: git, installed SDK, built browser.
Needs: current dirty checkout, upstream contract, private Bookhand preview.
Behavior: work continues on the dedicated branch with pre-existing work intact;
main stays at its starting commit. Installed headless API and shared tool path
need no OpenClaw-specific protocol fork; any required difference is documented
and tested. CSP stays unchanged. Reader and Tutor open without a gateway.
Evidence: branch/status and scoped diff; SDK comparison; focused Tutor tests;
built preview and console inspection. No claim of full gateway parity.

### VAL-BH-OC-CONNECT

Surface: browser and actual replacement gateway.
Needs: Agent Connect supplies an isolated public card and authorized selected
runtime/model; owner completes normal consent.
Behavior: connect from the exact Bookhand preview origin, handle denial and
approval with the same-book/draft preserved, never auto-send or use old backend
conversation state. Provider/login failures are not presented as study success.
Evidence: actual consent/callback actions and redacted endpoint/runtime identity,
SDK version, selected execution loop/model, console/network outcomes.
Fail: old personal gateway used, owner/operator credentials exposed, or a mock
authorization path described as real.

### VAL-BH-OC-TEACH

Surface: browser, real model, Bookhand Study.
Needs: VAL-BH-OC-CONNECT, bundled Calculus Made Easy, selected source passage.
Behavior: model reads source using the app's tools, explains it, and creates a
useful source-linked Study artifact in response to an explicit save request.
Useful means a passage-specific explanation plus a worked example or a check
question with an answer, with correct source attribution and the model's own
teaching distinguished from author quotations.
Its follow-up meaningfully uses a detail from the actual prior tool result or
created artifact without the learner restating it. Saved content survives reload
and its source link returns to the passage. No remaster or unrelated mutation.
Evidence: intent-only prompts, redacted actual tool names/results and continuation
IDs, artifact identity, screenshots before/after reload and source navigation.
Record actual excerpt and agent-authored detail used by the follow-up.
Fail: scripted teaching, manually seeded output presented as model work,
fabricated quote, chat-only claim of saving, or native Codex claimed when the
built-in OpenClaw loop ran. Built-in tool-output-as-user-text behavior must be
disclosed, not repaired or concealed by Bookhand.

### VAL-BH-OC-CONTROL

Surface: browser and real replacement gateway.
Needs: VAL-BH-OC-CONNECT, disposable demo conversation.
Behavior: Tutor/Study switching preserves the mounted conversation; Stop prevents
subsequent app tool dispatch, interruption never replays automatically, and
explicit new conversation starts fresh. Disconnect reports failed revocation
honestly. Library/book exit ends the old tool lifetime. Manual reading remains
usable. Composer and Send remain reachable at 412px width.
Evidence: focused lifecycle tests plus real UI switching, Stop/new-conversation/
disconnect/book-exit observations and phone-viewport screenshot. Actual upstream
generation-stop proof belongs to upstream VAL-OC-003; do not infer it from a
disabled button. Physical Pixel 7 keyboard behavior remains separately pending.
Only attempt failure/revocation injection when it is safely reproducible on the
isolated runtime and within the supplied approval. Record unavailable probes as
blocked, with deterministic regression coverage reported separately; do not
manufacture failures by disturbing the personal gateway or invalidate this
boundary to obtain a green result.

## Current readiness

Latest checkpoint: José selected the built-in OpenClaw subscription loop.
Upstream reports `openai/gpt-5.6-sol`, checkpoint `c669816`, real tool/follow-up
success upstream and disabled auxiliary memory embeddings. José enabled HTTPS
8446 to loopback 8789. Bookhand independently verified HTTPS health with Origin
8445 and reached the real owner-consent screen using the new public card at
`/home/dev/agent-connect-openclaw/.agent-connect/openclaw-demo/agent-connect/public-runtime-card.json`.
Identity matches the prior gateway, but grants/devices are empty; fresh consent
is required. No model request or owner approval performed by Bookhand yet.

For owner handoff only, the agent-browser dashboard is running on loopback
`127.0.0.1:4848` (also `::1`), verified not wildcard-bound. José can privately
forward that port through VS Code and interact with the test browser's consent
screen. Do not read the passphrase, approve for him, or expose this browser-control
dashboard publicly. Mobile handoff supersedes the VS Code suggestion: José
enabled a temporary tailnet-private route at
`https://artifex-box.tail246db1.ts.net:8447` to localhost 4848. Open that dashboard
on the phone, select the test browser and complete consent there. Check only
page URL/connection state while awaiting approval, never passphrase contents.
Keep browser/dashboard alive until the owner finishes; José can remove the
temporary 8447 route afterward. Close the dashboard/browser after the test. Older
readiness bullets below record preflight before this endpoint was available.

Dashboard handoff correction: a bare 8447 URL loads HTML but cannot authenticate
its session API. Dashboard-only restart with
`agent-browser dashboard start --allowed-origins https://artifex-box.tail246db1.ts.net:8447`
fixes the allowed-origin setup; José must run that identical command to obtain
and open the generated private access link. Repeated starts reuse the server.
Do not commit or paste that link/token into reports. Verified in a separate
browser context: authenticated remote session API returned 200 and discovered
`default`; proxied WebSocket delivered live frames/status, canvas exists. The
original consent tab was not touched. The dashboard's Claude Sonnet label is
its unrelated optional AI chat, not the Bookhand/OpenClaw model. Session discovery
inside the Codex process sandbox incorrectly reported no sessions; outside the
sandbox it found `default`. No custom proxy/control project was needed.

- Dedicated branch created; main remains `2c36f33`.
- Existing 18 Tutor unit/component cases pass on this branch. They exercise a
  scripted SDK provider, not a real subscription.
- Private built preview on `https://artifex-box.tail246db1.ts.net:8445/`
  responds with the existing CSP; browser can open its library and Calculus.
- Isolated replacement card and selected runtime/model requested from the
  Agent Connect instance. No gateway or model request sent by this pass.
- Runtime decision is upstream: pinned native Codex currently drops client
  tools; built-in loop supports them but projects their output as user text.
  Actual subscription-backed proof is pending, not implied by deterministic tests.

No mission submit/advance runtime is exposed here. Use this record plus bounded
independent contract review and compatibility scrutiny; keep unmet real-flow
prerequisites explicit rather than simulating a pass.

## Reviewed execution order

Two sequential independent contract passes completed. Pass 1 clarified useful
teaching output and safe failure injection; pass 2 accepted the revised contract.

1. Bookhand owns SETUP and demo preparation: retain the neutral integration,
   compare installed SDK, run focused checks, rehearse passage capture without
   connecting, and keep this runbook current. No speculative protocol edits.
2. Agent Connect supplies the isolated endpoint/card and confirmed runtime/model
   after José's decision. José completes normal authorization. This is the
   dependency for CONNECT, TEACH and CONTROL, not a reason to reuse `agc`.
3. Bookhand exercises the actual browser flow below and fixes demonstrated app
   defects only. Report SDK/gateway defects upstream with concrete evidence.
4. Independent scrutiny reviews compatibility/evidence; real-surface validation
   judges CONNECT/TEACH/CONTROL only when their prerequisites exist. A blocked
   real run remains blocked; no repeated broad review or simulated substitute.

## Demo runbook: why the constant matters

Use the bundled *Calculus Made Easy*. Through Contents, open **Chapter XVIII:
Integrating as the Reverse of Differentiating**. Select the short paragraph
beginning “Clearly, in dealing with powers of x…” and ending with the
undetermined constant. Click **Ask tutor**; confirm that passage appears attached.
This exact selection path was rehearsed with the real EPUB, not a test document.

Connect only after receiving the replacement runtime card. Do one normal Deny
round trip to check recovery, then connect again and let José approve in the same
browser. Confirm the chapter, attachment and question survive without being sent.
Do not capture raw callback URLs, cookies, grants, passphrases or model credentials.

First prompt (intent, not a tool script):

> I don't understand why this rule needs an added constant. Read the surrounding
> explanation and teach it with a small worked example. Save a short lesson in
> Study, linked to this passage, with the example and one check question whose
> answer I can reveal. Keep the book itself unchanged.

Observe the actual operations, without prescribing their names in the prompt:

- Source/context lookup must occur; a response from model memory alone fails.
- The source range/quote must come from Bookhand, not be reconstructed by the
  model. Source rejection must be reported honestly, not replaced with an
  unlinked block masquerading as a quotation.
- A titled lesson or coherent native block composition must actually appear in
  Study, with a source link, sensible math and a correct worked example/question.
  `create_study_lesson` is available; `get_design_context` describes composition.
  Do not manually seed the claimed agent-produced material.
- Record the created lesson/block identifiers and one distinctive detail from
  its worked example. A green activity label alone is not a mutation receipt.

Return to Tutor without reloading and ask:

> Use a different added constant in that same example. Which steps change, and
> which stay identical? Refer to the example you just saved, not a new one.

The reply must use the actual earlier example, not only repeat a generic rule
about constants. Inspect the continuing Responses chain with identifiers
redacted where appropriate; do not paste prior content into the second prompt
to manufacture retained context. An explicit extra read of Study/source is fine.
No follow-up save is requested; a correct contextual explanation suffices.

Then open Study, reveal the check answer and follow the source link. Reload once
the teaching exchange is complete: the same artifact should remain, but a
conversation must not replay or claim restoration. Reader/Study remain usable
without reconnecting. Use a separate explicitly started disposable conversation
for Stop/disconnect/book-exit checks so they do not destroy the hero evidence.

Repeat only the relevant interaction at 412px width: reach the composer, switch
to Study and back, and check for horizontal overflow. Emulation does not prove
the physical Pixel 7 keyboard or background lifecycle.

## Evidence record to fill after the real run

- App branch/commit plus dirty diff identity:
- SDK artifact/hash (see vendor README):
- Isolated endpoint/public runtime ID, gateway commit, OpenClaw/plugin version:
- Selected execution loop/model (built-in vs native must be explicit):
- Consent/denial, source/context tool results and continuation observations:
- Lesson/block identity; specific example detail reused in follow-up:
- Saved artifact reload and source navigation result:
- Stop/disconnect/book-exit results and unavailable probes:
- Console/network errors, relevant screenshots and any redaction:
- Verdict per SETUP / CONNECT / TEACH / CONTROL:

Keep screenshots in ignored `test-results/openclaw-tutor-demo/`. Avoid full HARs
or raw storage exports: they may include grants or other credentials. Record
only the approved public runtime fields and necessary redacted response evidence.

## Compatibility findings (2026-09-05)

An independent read-only comparison found every common installed SDK `dist`
file byte-identical to the replacement checkout's build. The installed tarball
also contains unused old Omnigent files; Bookhand does not import them. No
OpenClaw-specific source or package change is justified by current evidence.
Upstream subsequently reported checkpoint `621e6cc` and no SDK API change.

Two pre-existing SDK reporting limitations were sent upstream, not worked around
in Bookhand: `agent-session.ts` emits `tool.completed.isError: false` even when
a returned result has `isError: true` (structured `ok: false` still reaches the
model); `responses-provider.ts` maps every HTTP 401 to `invalid_app_grant`.
These require accurate error observations during the actual demo. Neither is
evidence that the replacement flow has passed or failed.

## Local preflight evidence (no gateway connection)

### Subsequent owner-run failures

José connected his own mobile Bookhand tab to the replacement and received a
contextual reply to “Wololo” mentioning Lineland in Flatland. This proves a basic
exchange, not the hero. The requested source-linked lesson then failed with
“The response stream ended before a terminal event.” José reports multiple tries
failing in different ways. TEACH is **failing/unproven**, not passed; stop asking
for retries until partial effects and the actual failure boundaries are checked.

Read-only client trace: SDK SSE parser flushes its trailing frame at EOF. Gateway
`response-routes.ts` closes an already-started response in its catch without
emitting the underlying error; this explains the generic EOF symptom but not the
triggering cause. Agent Connect is comparing live ledger/provider attempts and
whether any Study tool calls reached the browser. No mutations replayed, provider
restarted, or successful saving inferred from the first chat reply.

- Real built browser: Library -> Calculus -> Contents -> Chapter XVIII -> mouse
  select the rule paragraph -> Ask tutor. Attachment displayed the intended
  passage; the real EPUB frame remained mounted.
- Drafted the first prompt, switched View Study -> Tutor at 412x700, and checked
  that the question and attachment were unchanged. Document had no horizontal
  overflow. Send occupied y=644..688, entirely inside the 700px viewport, and
  correctly remained disabled while disconnected. The connection area scrolls
  independently above the composer; no runtime card was entered.
- Annotated screenshots inspected: `reader-preflight.png`,
  `tutor-draft-desktop.png`, `tutor-draft-phone.png` under the evidence directory.
  Browser console/page-error queries returned no entries. Browser was closed
  after the check to release its OPFS writer.
- `git diff --check` passes. Existing focused Tutor tests pass; no source,
  dependency, CSP, credential, preview-server or gateway changes made by this
  preparation pass. Only documentation and the branch were changed.
- SETUP preflight is supported by this evidence. CONNECT, TEACH and the
  real-runtime portion of CONTROL remain **blocked** on the isolated runtime
  setup and owner consent. No subscription model request has been sent.
