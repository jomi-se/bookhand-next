# VAL-RE001-REMASTER: Remasters retain source truth and recovery

Surface: browser.
Needs: Bookhand `1743074` with official Foliate `78914aef4466eb960965702401634c2cb348e9b1`, the exact candidate production build, genuine WebMCP test runtime, identical state, and remaster fixtures.
Behavior: A section rewrite remains pending until explicitly revealed; Rewritten/Original, Undo, Reset, resource translation, style replacement, section-boundary navigation, and reload show the correct accepted version without changing publisher bytes or losing the logical anchor.
Evidence: Complete production remaster suite, frame/document inspection for each transition, stored revision state, exact visible quote/location, request log, and failure traces.
Fail: Candidate source becomes persistence truth, a toggle requires frame replacement, reset cannot restore publisher content, or resources escape containment.
Oracle: Bookhand remaster domain contracts and current browser behavior.
