# VAL-RE001-LIFECYCLE: Retired reader work cannot replace live content

Surface: harness browser and production browser.
Needs: Bookhand `1743074` with official Foliate `78914aef4466eb960965702401634c2cb348e9b1` in test-harness and production builds; exact candidate test-harness build with deterministic fault controls; exact candidate production build without those controls; identical fixtures and interleavings.
Behavior: In the harness, StrictMode-style reopen, rapid competing opens, delayed/hanging/out-of-order section work, open timeout, and stale relocation prove retired work cannot win. In production, section failure and Retry, close/reopen, and repeated teardown leave exactly one authoritative visible reader. During the bounded stalled-navigation recovery only, one additional hidden, non-interactive speculative reader is allowed; success atomically swaps it in and disposes the old reader, while failure disposes it and preserves the old reader and location.
Evidence: Focused unit race output; harness-browser interleaving results; production-browser visible final book/section, reader/frame counts, console review, and cleanup observations; baseline/candidate case matrix.
Fail: Stale content/state wins, the last-safe surface blanks, more than one reader is visible/authoritative, more than one speculative reader exists, a speculative reader survives success/failure/close, post-close relocation is accepted, or owned listeners/frames accumulate.
Oracle: Existing Bookhand deadline, revision, Retry, and StrictMode behavior.
