# VAL-RE001-DIRECTION: Logical reading order is correct across writing modes

Surface: browser.
Needs: Bookhand `1743074` with official Foliate `78914aef4466eb960965702401634c2cb348e9b1`, the exact candidate build, and independent LTR, RTL, and vertical-rl EPUB fixtures.
Behavior: Logical previous/next, physical left/right keys and taps, layout axis, page progression, exact target navigation, selection geometry, and displayed source order are recorded and correct for LTR, RTL, and vertical-rl. Vertical-lr remains explicitly unsupported unless separately proved.
Evidence: Per-mode/action matrix with starting/ending source quote/CFI, direction/writing-mode observation, screenshots, selection result, and baseline/candidate comparison.
Fail: Physical right is assumed to mean logical next for every mode, RTL scroll sign becomes the domain model, or vertical-lr is claimed from vertical-rl evidence.
Oracle: Fixture-declared reading order and Bookhand logical navigation contract.
