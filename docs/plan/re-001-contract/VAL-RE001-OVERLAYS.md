# VAL-RE001-OVERLAYS: Durable and transient overlays remain isolated

Surface: browser.
Needs: Bookhand `1743074` with official Foliate `78914aef4466eb960965702401634c2cb348e9b1`, the exact candidate production build, deterministic annotation and Tutor targets, and identical state.
Behavior: A permanent annotation and transient Tutor cue can target overlapping source without overwriting one another; navigation/reflow redraws each at the resolved words, and Stop/removal deletes only the requested layer. Search is navigation-only in current Bookhand and creates no renderer overlay.
Evidence: Real iframe geometry and tagged-layer counts before/after navigation/reflow/removal, exact source quote, visible browser result, and console review.
Fail: One layer replaces or deletes another, overlays drift to different text, stale overlays survive book close, or the spike adds a search-mark feature.
Oracle: Current Bookhand overlay ownership semantics.
