# VAL-RE001-PERSISTENCE: Reading state remains durable and renderer-neutral

Surface: data and browser.
Needs: Bookhand `1743074` with official Foliate `78914aef4466eb960965702401634c2cb348e9b1`, the exact candidate build, pre-spike data fixture, and visibility/pagehide controls.
Behavior: Style is applied before restored exact location; queued and confirmed positions remain distinguishable; visibility loss, pagehide, reload, tab reopen, and close flush the confirmed reading position without preview/Tutor navigation overwriting it; persisted values remain Bookhand domain data.
Evidence: Before/after database state, live/queued/persisted location timeline, reload/tab-reopen visible quote and style, preview/Tutor non-overwrite case, and baseline/candidate matrix.
Fail: Raw page/scroll pixels or fork-specific values enter persistence, a lifecycle transition loses the confirmed position, or restoration visibly visits the wrong style/location first.
Oracle: Bookhand storage and Tutor navigation contracts.
