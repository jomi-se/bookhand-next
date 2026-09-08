# Temporary SDK build

`open-agent-connect-web-0.0.3-cf3b3d1.tgz` is the local Agent Connect SDK build
supplied by its implementation instance, from commit
`cf3b3d1adc1f546bdc6786f243bcf059821366e8` in
`/home/dev/agent-connect-openclaw`. Its package version remains 0.0.3; this is
**not** the unmodified npm 0.0.3 artifact. The filename and lockfile preserve
that distinction. Its SHA-256 is
`cec8778c0afa030f9126ef9d1ed122b46f3b3cc8fe43bd2f068df052a62035b2`.

In addition to the CSP-safe schema interpreter, this build exposes the public AI
SDK model, application-tool, continuation, and checkpoint helpers. Continuation
requires Bookhand's reviewed `@ai-sdk/open-responses@2.0.39` patch; the helper
fails closed when its downstream marker is absent.

The temporary consumer setup pins `ai@7.0.93`,
`@ai-sdk/open-responses@2.0.39`, `zod@4.1.11`, and `patch-package@8.0.1`.
Bookhand's root `postinstall` runs `patch-package`, applying
`patches/@ai-sdk+open-responses+2.0.39.patch` with SHA-256
`99f31168f18f59f13cbc0b60ec85c0bdd302213716980ddfbac63e5e1abce571`.
Reproduce the clean install and public-export smoke from the repository root:

```sh
npm ci --cache /tmp/bookhand-npm-cache
npm run verify:ai-sdk
```

Replace this temporary file dependency with the next published fixed SDK after
checking compatibility. Do not publish a patched SDK from this repository.
