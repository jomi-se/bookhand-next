# VAL-RE001-PRESENTATION: Desktop presentation and style controls preserve behavior

Surface: browser.
Needs: Bookhand `1743074` with official Foliate `78914aef4466eb960965702401634c2cb348e9b1`, the exact candidate production build, and identical fixture/profile.
Behavior: Publisher reset removes Bookhand style overrides; Light/Sepia/Dark apply matching shell/book foreground and background tokens; each font-size step changes the exposed percentage by exactly 10 within bounds; configured line height, measure, paragraph spacing, and page layout appear in the iframe's applied style; panels preserve focus and selected text; keyboard navigation is suppressed while a panel/editable control owns focus; custom CSS Preview applies only the preview text, Cancel restores the pre-preview computed value, Apply persists across reload, and Reset removes it. No control exposes fork internals.
Evidence: Per-control baseline/candidate matrix with exact exposed values, iframe computed styles/tokens, selected quote/range, focus owner, before/Preview/Cancel/Apply/reload/Reset values, stable-state screenshots, console review, and full Chromium E2E output as supporting evidence.
Fail: Aggregate suite success hides a failed control, custom CSS cannot return to publisher state, or focus/selection is lost merely by opening a panel.
Oracle: Current Bookhand reader UI contracts.
