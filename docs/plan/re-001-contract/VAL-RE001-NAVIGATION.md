# VAL-RE001-NAVIGATION: Every current target uses the same exact reader path

Surface: browser.
Needs: Bookhand `1743074` with official Foliate `78914aef4466eb960965702401634c2cb348e9b1`, the exact candidate production build, identical fixture/state, and target matrix.
Behavior: Previous, next, nested TOC, href, numeric section, exact CFI, annotation, search hit, study citation, Tutor focus/Back/Stop, and invalid target cases produce the same semantic destination, history/provenance outcome, and recoverable error behavior on baseline and candidate.
Evidence: Per-target baseline/candidate matrix with source quote, CFI, section, visible UI/history outcome, console/network review, and trace on mismatch.
Fail: A full-suite aggregate hides a failed target or candidate-only private navigation bypasses `ReaderAdapter`.
Oracle: Baseline Bookhand behavior and domain target contracts.
