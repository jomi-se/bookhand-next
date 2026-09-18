# VAL-RE001-CFI-RICH: Rich-content and chunk anchors retain meaning

Surface: library fixtures and browser.
Needs: Bookhand `1743074` with official Foliate `78914aef4466eb960965702401634c2cb348e9b1`, the exact candidate build, and Bookhand fixtures containing mixed text/MathML/TeX, figure-only alternatives, SVG captions, and deterministic chunks.
Behavior: CFIs spanning mixed math and text, figure-only accessible content, SVG/caption content, and every generated chunk resolve against fresh documents to the same serialized semantic segments, normalized quote, and fingerprint on baseline and candidate; candidate browser navigation lands at the corresponding rich source.
Evidence: Per-case differential segment/quote/fingerprint manifest, full chunk round-trip results for the tiny and bundled books, and baseline/candidate browser target evidence.
Fail: Plain `textContent` substitutes for Bookhand semantic serialization, only one rich-content kind is exercised, or chunk failures are sampled away.
Oracle: Independently authored fixture meaning and baseline Bookhand semantic extraction.
