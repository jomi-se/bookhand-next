# VAL-RE001-SEARCH: Local extraction and navigable search remain exact

Surface: browser.
Needs: Bookhand `1743074` with official Foliate `78914aef4466eb960965702401634c2cb348e9b1`, the exact candidate build, deterministic search corpus, SQLite worker, identical state, and genuine WebMCP runtime.
Behavior: Section snapshots and chunks remain serializable and exact-CFI stable; indexing reaches ready or a truthful recoverable failure; lexical results preserve the oracle order/quotes and navigate through the shared reader path to the matching publisher source. Bookhand does not currently reindex accepted remasters, so this spike neither tests nor claims remaster-aware search.
Evidence: Unit corpus output, index lifecycle browser run, genuine `search_book` result, clicked/tool-driven publisher-source quote and section, and worker state.
Fail: Renderer search replaces Bookhand indexing, hit navigation is approximate, candidate-specific shortcuts bypass the worker/domain path, or the spike claims remaster reindexing.
Oracle: Bookhand search oracle and current index lifecycle contracts.
