# Agent Connect SDK provenance

## Current dependency — published 0.0.9

Bookhand installs exact `@open-agent-connect/web@0.0.9` from the public npm
registry. Its npm integrity is
`sha512-k7AwMx5cKh85lOFGq+WLwzm/47qFZXrKgyl7Snb5cUJeBPSZkJrCBj/+RLet9i4S7c1QBKTOhBWmo3GwxsuROg==`.
`scripts/verify-ai-sdk-packaging.mjs` checks the installed version and exact
lockfile registry artifact. The older files retained below are historical
inputs, not installed dependencies.

## Historical approved plugin SDK — e3fa090

The former migration branch pointed package.json to
`open-agent-connect-web-0.0.3-e3fa090.tgz`, supplied from the Agent Connect
release build.
SHA-256: `ccd489d55189df32654c3e3bf2dc667ee65545d4d0d453f52eff7cbbfb128480`.
Approved source: `e3fa090809e1197dac4a7347a6f48c78240bef44`. Root reports completed
SDK review, SDK tests/typecheck/build/external package smoke, and real installed
Agent Connect plugin for OpenClaw composition passing on Node 24.15. Those are
upstream evidence;
Bookhand did not repeat live provider/auth flows. Refresh CAS identity is retained
and history JSON is bounded to 1 MiB. No live cutover or npm publication.
Bytes are identical to the tested `candidate-ccd489d` artifact; only the filename
and references changed after source approval.
Bookhand's own checks are recorded in `docs/plan/plugin-sdk-migration.md`.
This replaces the earlier unreviewed `94a58b5` provisional test artifact.
Historical reviewed baseline below remains available.

## Historical baseline — 3cc49ec (not the active dependency)

`open-agent-connect-web-0.0.3-3cc49ec.tgz` is the local Agent Connect SDK build
supplied by its implementation instance at commit
`3cc49ec32981553faa01729e0e2cee6cdea39dd4`. Its package version remains 0.0.3; this is
**not** the unmodified npm 0.0.3 artifact. The filename and lockfile preserve
that distinction. Its SHA-256 is
`57d38dad6d57fc82786faa8a684e342814d75a0e9bafdaff1d1d7827a5f90a80`.

This includes upstream fix `90b4e75` (`fix(web-sdk): keep AI SDK imports CSP-safe`).
The supplied sibling `PROVENANCE.md` records the packed commit/hash and upstream
14-test restrictive-CSP suite, SDK/typecheck/Canvas/lint/dependency/package checks.
Those are upstream reports, not Bookhand test claims. Bookhand separately checks
the actual production import via `npm run verify:csp` after a fresh build.

In addition to the CSP-safe schema interpreter, this build exposes the public AI
SDK model, application-tool, continuation, and checkpoint helpers. Continuation
requires Bookhand's reviewed `@ai-sdk/open-responses@2.0.39` patch; the helper
fails closed when its downstream marker is absent.

The temporary consumer setup pins `ai@7.0.93`,
`@ai-sdk/open-responses@2.0.39`, `zod@4.4.3`, and `patch-package@8.0.1`.
The SDK configures supported Zod jitless mode before AI SDK evaluation and marks
`dist/zod-jitless.js` as a bundler side effect. Keep the app and SDK Zod versions
aligned so they share the same configuration; do not relax Bookhand CSP.
Bookhand's root `postinstall` runs `patch-package`, applying
`patches/@ai-sdk+open-responses+2.0.39.patch` with SHA-256
`99f31168f18f59f13cbc0b60ec85c0bdd302213716980ddfbac63e5e1abce571`.
Reproduce the clean install and public-export smoke from the repository root:

```sh
npm ci --cache /tmp/bookhand-npm-cache
npm run verify:ai-sdk
npm run build
npm run verify:csp
```

This earlier temporary dependency was replaced by public 0.0.4 on 2026-09-09,
then by public 0.0.5, and finally by public 0.0.9. Do not publish a patched SDK
from this repository.

The earlier tracked cf3b3d1 tarball is retained as historical material, not the
installed dependency. The unused 9736495 tarball was preserved in the ignored
`artifacts/local-archive/2026-09-08/` directory.
