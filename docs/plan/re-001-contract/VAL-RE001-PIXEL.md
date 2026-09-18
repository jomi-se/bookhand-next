# VAL-RE001-PIXEL: Candidate preserves the complete Pixel emulation suite

Surface: browser.
Needs: Bookhand `1743074` with official Foliate `78914aef4466eb960965702401634c2cb348e9b1`, the exact candidate production build, identical fixture/state, and the Playwright Pixel 7 project.
Behavior: Every current `reader-mobile.spec.ts` case passes: full-width/no-overflow reading, compact text zoom, edge-tap forward/back and center chrome recall, panel chrome/focus/hidden-book keyboard behavior, shell/book theme parity, dark-theme mathematics, and phone Foliate configuration. This target does not claim remaster, active-selection protection, swipe arbitration, or physical touch behavior; those remain under their dedicated contracts or residual limits.
Evidence: Complete unfiltered `pixel-7` project output, browser/version/viewport manifest, screenshots and traces for every failure, and a baseline rerun for candidate-only differences.
Fail: A filtered subset is presented as the suite or emulation is described as physical-device validation.
Oracle: `tests/e2e/reader-mobile.spec.ts` and project Playwright configuration.
