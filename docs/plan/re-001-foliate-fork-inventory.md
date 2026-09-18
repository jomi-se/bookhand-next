# RE-001 scope and capability inventory

This inventory prevents the compatibility spike from shrinking to “the build
is green.” Each row maps to one owning validation contract or an explicit
non-goal.

| Area | Required scenario and observable outcome | Oracle/evidence | Target |
| --- | --- | --- | --- |
| Exact source | Owner-fork HEAD, selected commit, parent/tree/merge base, exact archive URL/digest, archive-to-Git manifest, and immutable Bookhand/official-renderer baselines are recorded. | Git/archive/package manifest. | `VAL-RE001-SOURCE` |
| License/provenance | MIT notice plus all changed dependencies, scripts, exports, generated/vendor assets, workers, native/PDF paths, and every Bookhand-added byte are classified; no Readest application material enters. | Classified source and changed-file provenance manifests. | `VAL-RE001-SOURCE` |
| Candidate source suite | Candidate CFI browser harness passes with `console.assert` promoted to failure; lack of a paginator/view suite is explicit validation risk. | Browser console result and source-suite inventory. | `VAL-RE001-SOURCE` |
| Clean install/build | Clean-cache `npm ci`, typecheck/build/bundle/CSP, browser imports, accounted runtime assets, and no Node-only import. | Commands, artifact manifest, network trace. | `VAL-RE001-BUILD` |
| Exact transform | Old transform first rejects candidate source; reviewed candidate transform and negative drift test fail closed. | Before/after build and transform test. | `VAL-RE001-BUILD` |
| Adapter/data boundary | Domain values remain structured-clone-safe and renderer-free; pre-spike persisted data opens unchanged. | Type/source review, clone tests, DB/browser reopen. | `VAL-RE001-BOUNDARY` |
| Async lifecycle | StrictMode reopen, competing opens, delayed/hanging/out-of-order loads, timeout, Retry, close/reopen, and teardown cannot let stale work win. | Harness interleavings plus production recovery. | `VAL-RE001-LIFECYCLE` |
| Frame transport | Named initial/navigation/Retry/remaster/Tutor transitions reuse one same-origin Window per open-book lifetime; reload/reopen start clean allowed lifetimes; no post-load `blob:`, `data:`, or `srcdoc`. | Window marker, frame-load count, navigation/request events. | `VAL-RE001-FRAME` |
| Text CFIs | Point/range, multi-node, special-ID, ignored-node, boundaries, selection, and saved-location CFIs resolve identically. | Atomic baseline/candidate cases. | `VAL-RE001-CFI-TEXT` |
| Rich CFIs/chunks | Mixed math/text, figure/SVG/caption, and every generated chunk retain serialized semantic meaning. | Full differential segment/quote/fingerprint results. | `VAL-RE001-CFI-RICH` |
| Navigation | Previous/next, nested TOC, href, section, CFI, annotation, search, study citation, Tutor Back/Stop, and invalid targets share exact outcomes. | Per-target browser matrix. | `VAL-RE001-NAVIGATION` |
| Persistence | Styles precede restored CFI; live/queued/persisted positions, pagehide/visibility/reload/reopen, and preview non-overwrite remain correct. | DB timeline and visible restore. | `VAL-RE001-PERSISTENCE` |
| Containment | Hostile scripts/forms/navigation/popups/storage/bridge remain inert; every off-origin attempt fails under CSP and no off-origin response completes. | Request/failure/response log and sentinel state. | `VAL-RE001-SECURITY` |
| Safe packaged content | Independent packaged CSS/images/SVG/fonts/MathML/captions/names render offline under the same policy. | Safe fixture and accessibility/content assertions. | `VAL-RE001-SECURITY` |
| Remaster | Pending reveal, Original/Rewritten/Undo/Reset, local resources, style replacement, section boundary, reflow, and reload preserve source truth. | Production WebMCP remaster matrix. | `VAL-RE001-REMASTER` |
| Overlays | Durable annotation and transient Tutor cue coexist, redraw, and remove independently; search remains navigation-only. | Tagged geometry/count/source evidence. | `VAL-RE001-OVERLAYS` |
| Search/index | Exact section/chunk extraction, index lifecycle, publisher-source search order/quotes/navigation remain Bookhand-owned; remaster reindexing remains explicitly nonexistent and unclaimed. | Unit oracle, worker state, genuine WebMCP browser flow. | `VAL-RE001-SEARCH` |
| Reflow anchors | Resize, repeated rotation proxy, styles, late/broken/hanging media/fonts preserve quote-plus-CFI or bounded recovery. | Before/after semantic anchor matrix. | `VAL-RE001-ANCHOR` |
| Publisher layout/parser | Covers, tables, tall inline boxes, encoded paths, recoverable malformed XHTML, and unrecoverable section errors do not clip later content or weaken containment. | Independent fixtures and trailing sentinels. | `VAL-RE001-LAYOUT` |
| Direction/writing mode | Logical/physical navigation, axis, progression, selection, and source order work for LTR, RTL, vertical-rl; vertical-lr stays unsupported. | Per-mode/action matrix. | `VAL-RE001-DIRECTION` |
| Input/listeners | Wheel inertia, keyboard/editable focus, pointer/touch/selection ownership, synthetic clicks, and 50-transition listener bounds remain deterministic. | Event/action counts and listener samples. | `VAL-RE001-INPUT` |
| Desktop presentation | Themes, typography, page layout, panels, selection, keyboard and custom CSS Preview/Cancel/Apply/Reset preserve current behavior. | Per-control browser matrix plus full suite. | `VAL-RE001-PRESENTATION` |
| Pixel emulation | The full current project covers full-width/no-overflow reading, compact text zoom, edge-tap paging and center chrome, panel chrome/focus, shell/book theme parity, dark-theme mathematics, and phone Foliate configuration without claiming remaster, active-selection, swipe, or physical-device proof. | Unfiltered Pixel project. | `VAL-RE001-PIXEL` |
| Resources/performance | Artifact sizes, first read, page/reflow samples, 20 open-cycle and 100-turn runs, frames/views/URLs/available listeners remain bounded; unavailable heap/long-session metrics stay blocked. | Fixed differential probe and raw series. | `VAL-RE001-RESOURCES` |
| Rollback | Official pin/lock/transform restore cleanly, pre-spike data reopens, and candidate residue is absent. | File hashes, clean-cache install/build/tests/data reopen. | `VAL-RE001-ROLLBACK` |
| Controlled browser | Actual ChatGPT Desktop WebMCP exercises chapter navigation, remaster, Tutor, reload, exact position and frame identity on reviewed candidate bytes. | Owner-accessible controlled-browser artifacts plus independent review. | `VAL-RE001-DESKTOP-HOST` |

## Explicitly deferred or excluded

- Continuous multi-section scrolling belongs to RE-003/RE-018 and remains
  disabled or unused during this spike.
- Fixed-layout EPUB, PDF, comics, TTS, media overlays, page-turn animation,
  native device inputs, sync, accounts, and backend services are not evaluated.
- Physical Android/iOS touch, assistive-technology behavior, vertical-lr, and
  credible hours-long heap behavior remain residual unknowns unless the
  required access appears; no other surface may silently satisfy them.
- The spike does not establish parity with every feature in the fork. It tests
  the exact candidate as a replacement for Bookhand's present renderer use.
