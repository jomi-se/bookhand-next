# VAL-RE001-CFI-TEXT: Text point and range anchors round-trip exactly

Surface: library fixtures and browser.
Needs: Bookhand `1743074` with official Foliate `78914aef4466eb960965702401634c2cb348e9b1`, the exact candidate build, identical independently authored text fixtures, and candidate source CFI harness results.
Behavior: Point and range CFIs for ordinary text, multi-node text, collapsed boundaries, special-character IDs, ignored/skipped nodes, section start/end, current selection, and saved locations resolve against fresh documents to the same normalized quote, offsets, section, and fingerprint on baseline and candidate.
Evidence: Per-case differential manifest with CFI, resolved quote/offsets/fingerprint/section, source-harness result, and equivalent baseline/candidate browser selection evidence.
Fail: Coordinates replace semantic comparisons, candidate-only expected values hide drift, or any named case is omitted.
Oracle: EPUB CFI semantics, candidate source harness, and baseline Bookhand behavior.
