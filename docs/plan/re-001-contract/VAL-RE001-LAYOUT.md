# VAL-RE001-LAYOUT: Difficult publisher markup remains readable or fails safely

Surface: browser.
Needs: Bookhand `1743074` with official Foliate `78914aef4466eb960965702401634c2cb348e9b1`, the exact candidate build, and independently authored fixtures for covers, tables, tall inline block/flex/grid/table boxes, encoded paths, malformed-but-recoverable XHTML, and unrecoverable parser errors.
Behavior: Candidate and baseline render all content following difficult layout constructs without silent clipping; encoded packaged resources resolve; malformed recoverable markup remains readable under the documented parser path; unrecoverable content yields Bookhand's bounded section error and Retry without enabling scripts or remote resources.
Evidence: Fixture provenance, per-case visible/selectable trailing sentinel, resource/request log, parser/error diagnostics, accessibility text, baseline/candidate matrix, and failure artifacts.
Fail: A fixture is copied from Readest, trailing prose disappears, a parser fallback weakens containment, or a blank section substitutes for a bounded error.
Oracle: Fixture-authored visible and accessible sentinel semantics.
