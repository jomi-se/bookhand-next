# VAL-RE001-ROLLBACK: Official renderer can be restored without user-data migration

Surface: artifact.
Needs: completed candidate integration; Bookhand `1743074`; official Foliate `78914aef4466eb960965702401634c2cb348e9b1` exact archive URL/digest, baseline `package-lock.json` hash and file manifest; fresh install cache; and pre-spike persisted reader-data fixture.
Behavior: Restoring the official archive pin, lockfile, and official-source exact transform in a clean worktree produces the baseline build and focused compatibility suite, reopens the pre-spike data fixture unchanged, and leaves no candidate compatibility residue outside explicitly renderer-neutral tests/tooling.
Evidence: Exact rollback diff/file/hash list, clean-worktree check, clean-cache `npm ci`, build, bundle/CSP and focused reader/CFI/frame exit codes, pre-spike data reopen result, schema/persisted-type comparison, and residue scan.
Fail: Rollback relies on cached candidate files, manual user-data rewriting, or undocumented compatibility residues.
Oracle: Bookhand `1743074`, its exact lockfile identity, and official Foliate `78914aef4466eb960965702401634c2cb348e9b1` artifact identity recorded by `VAL-RE001-SOURCE`.
