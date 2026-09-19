# Third-party notices

The MIT license in [`LICENSE`](LICENSE) covers Bookhand's own source code and
assets. Third-party material distributed with this repository keeps its own
terms:

- `public/books/calculus-made-easy.epub` and its extracted cover are the
  unmodified Project Gutenberg edition of *Calculus Made Easy* (eBook #33283).
  The underlying work is public domain in the United States, but Project
  Gutenberg's trademark and redistribution terms still apply to that edition,
  and readers outside the United States must check their own copyright law.
  See `public/books/README.md` and the license preserved inside the EPUB.
- `public/books/relativity.epub` and `public/books/flatland.epub` are unmodified
  Project Gutenberg editions distributed for the judging demonstration. See
  `public/books/README.md` and the licenses preserved inside those EPUBs.
- `tests/fixtures/epub/` contains Bookhand-authored CC0 fixtures; see
  `tests/fixtures/epub/LICENSE`.
- `foliate-js` is the exact MIT archive from the owner-controlled
  `jomi-se/foliate-js` fork at commit
  `ca3f118269f8d78811ef17a1b147363c321273d7`, resolved in `package-lock.json`
  from `https://github.com/jomi-se/foliate-js/archive/ca3f118269f8d78811ef17a1b147363c321273d7.tar.gz`.
  Its packaged `LICENSE` and README remain the authoritative notices. That
  archive also contains generated vendor files: `vendor/zip.js` is built from
  `@zip.js/zip.js` 2.7.52 (BSD-3-Clause), `vendor/fflate.js` is built from
  `fflate` 0.8.2 (MIT), and the checked-in `vendor/pdfjs/` JavaScript identifies
  itself as PDF.js 4.7.76 (Apache-2.0). The archive's build lock currently
  declares PDF.js 6.2.108, but that is not the version embedded in these pinned
  vendor bytes. PDF.js also ships CMaps and standard fonts under the terms in
  `vendor/pdfjs/cmaps/LICENSE`, `vendor/pdfjs/standard_fonts/LICENSE_FOXIT`,
  and `vendor/pdfjs/standard_fonts/LICENSE_LIBERATION` inside the installed
  archive.
- `construct-style-sheets-polyfill` 3.1.0 is an MIT dependency from
  `https://github.com/calebdwilliams/construct-style-sheets`; its package
  `LICENSE.md` is the authoritative notice.
- Other dependencies keep the licenses declared in their own packages,
  including SQLite WASM (public domain).

The bundled demonstration books are not a permanent part of the product and
are intended to be removed after the judging period.
