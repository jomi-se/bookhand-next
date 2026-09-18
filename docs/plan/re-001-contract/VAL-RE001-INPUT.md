# VAL-RE001-INPUT: Iframe input has deterministic ownership

Surface: browser.
Needs: Bookhand `1743074` with official Foliate `78914aef4466eb960965702401634c2cb348e9b1`, the exact candidate build, iframe event instrumentation, and desktop/mobile Playwright input profiles.
Behavior: One wheel gesture with inertial tail causes at most one intended page action; keyboard events preserve editable controls and selection; taps/swipes do not steal active selection, vertical scroll intent, links, or controls; a consumed swipe does not replay as a synthetic click; 50 section transitions do not accumulate reader-owned input listeners.
Evidence: Per-input action/event counts, before/after CFI/quote, editable value and selection state, synthetic-click sentinel, listener ownership samples at transitions 0/10/25/50, and baseline/candidate comparison.
Fail: Browser input synthesis is called physical-device proof, private fork listeners are the only oracle, or any gesture causes duplicate navigation.
Oracle: Bookhand input policy and observable action count.
