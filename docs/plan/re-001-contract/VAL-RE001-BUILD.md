# VAL-RE001-BUILD: Clean browser build with a fail-closed frame transform

Surface: artifact.
Needs: `VAL-RE001-SOURCE`, a fresh isolated npm cache, and an isolated production-browser profile.
Behavior: `npm ci` from the candidate lockfile in a clean worktree and isolated cache imports Bookhand's Foliate entry points and produces the production browser bundle with no Node-only runtime import or undeclared runtime asset fetch; the old exact paginator transform demonstrably rejects candidate source before a candidate-specific transform is deliberately re-derived and covered by a negative drift test.
Evidence: Clean-cache `npm ci`, typecheck, build, bundle, CSP, and focused transform-test commands with exit codes; before/after transform failure; built import/asset inspection; production-browser network trace with off-origin traffic blocked and all requested candidate assets accounted for.
Fail: Permissive/fuzzy replacement, silent transform bypass, unreviewed runtime fetch, or build success that depends on an existing `node_modules` tree.
Oracle: ADR 0005 and `scripts/vite-foliate-persistent-frame-plugin.mjs`.
