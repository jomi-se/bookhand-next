# Documentation map

Documentation is organized by authority rather than chronology:

- `product-north-star.md` preserves the complete product thesis.
- `mission.md` defines the current delivery boundary.
- `scope-inventory.md` records what exists, is planned, and is not yet real.
- `architecture/` describes the current system shape.
- `decisions/` contains accepted architectural decisions.
- `design/` preserves approved visual direction artifacts.
- `plan/current-work.md` is the resumable execution ledger.
- `contracts/` contains falsifiable validation targets for active slices.
- `research/` contains dated external findings and source links.
- `reviews/` contains dated design and implementation reviews.
- `ideas/` contains unaccepted proposals; inclusion is not permission to implement.
- `../experiments/` contains reproducible technical spikes and their measured
  outputs when the experiment is part of an accepted decision.

When a decision changes, update the earliest authoritative document and then
repair downstream plans rather than leaving contradictory snapshots.

Before implementation, read `architecture/implementation-defaults.md` and
`plan/vertical-slice-build-order.md`. They intentionally settle routine choices
and the cut order for the short hackathon build.
