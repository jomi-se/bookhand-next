# VAL-RE001-SECURITY: Imported EPUB containment does not weaken

Surface: browser.
Needs: Bookhand `1743074` with official Foliate `78914aef4466eb960965702401634c2cb348e9b1`, the exact candidate production build, malicious EPUB fixture, safe packaged-content fixture, identical profile, and complete request/failure/response observation.
Behavior: Publisher scripts, forms, nested browsing, top navigation, popups, local/session storage writes, privileged-bridge discovery, and remote HTTP resources remain blocked. Off-origin attempts may be observed, but every attempt fails under CSP and zero off-origin response completes. A separate safe packaged-content fixture keeps text, CSS, images, SVG, fonts, MathML, captions, and accessible names readable offline.
Evidence: Production CSP/bundle results, complete page/frame request/request-failed/response log, hostile sentinel and storage/bridge state, safe-content assertions, console errors, and screenshot/trace on failure.
Fail: Any hostile sentinel executes, any off-origin response completes, an attempted off-origin request fails for something other than the enforced policy, safe content disappears due to a hidden bypass, or CSP/sandbox is relaxed.
Oracle: Current production policy and `tests/e2e/epub-containment.spec.ts`.
