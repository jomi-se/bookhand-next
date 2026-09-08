# Can mutation receipts be simpler?

Status: unaccepted investigation. Migrated from `IDEAS.md`, 2026-09-05.

The original idea questioned whether payload digests and `action_receipts`
remain necessary if changes have approval, diffs, and history. There is no
recorded measurement establishing meaningful overhead.

[Current implementation](../../src/storage/library-repository.ts) stores
receipts and compares payload digests on retries. Approval and Undo address
different problems: neither prevents a repeated request from creating another
item. Debouncing is not equivalent to durable idempotency.

First measure receipt size, lookup/write time, and retention needs on realistic
boards. Only propose simplification if it earns its keep while preserving retry
results and rejecting reuse of a token for a different payload. This is not a
plan to delete the mechanism.
