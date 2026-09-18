# VAL-RE001-BOUNDARY: Renderer remains behind Bookhand domain types

Surface: library, worker/data, and browser.
Needs: `VAL-RE001-BUILD` and a pre-spike persisted reader-data fixture.
Behavior: The candidate requires no renderer object, DOM node, iframe handle, fork-only location, or non-serializable value in UI, persistence, command, worker, or WebMCP contracts; existing `ReaderAdapter` values remain structured-clone-safe, and the candidate opens/restores a pre-spike persisted book/location/annotation/style record without migration.
Evidence: Public-boundary source/type review, adapter and structured-clone tests, persistence schema diff, before/after data snapshot, and real-browser reopen of the pre-spike fixture; confirmation that candidate compatibility code is confined to the reader integration/build seam.
Fail: Renderer-specific state crosses a public boundary or rollback would require rewriting user data.
Oracle: `docs/architecture/implementation-defaults.md` and current domain types.
