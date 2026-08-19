# Clover Trust Slice 0.2

This dependency-free synthetic proof exercises one complete low-risk truth path:

1. capture exact source bytes in a content-addressed store;
2. append hash-linked observations and claims;
3. compile a minimum Context Capsule and Clover Today brief;
4. ingest a correction and explicitly supersede the prior claim;
5. export a complete hash manifest;
6. restore into a clean directory and rebuild derived state;
7. apply a synthetic retention rule, preserve a tombstone, and prove the deleted raw blob is absent from the post-deletion export.

The proof uses only synthetic public-shaped fixtures. It grants no production, private-data, secret, messaging, spending, domain, permission, merge, or deployment authority.

The prompt-injection sentence inside the source fixture is deliberately untrusted data. Extraction reads only allowlisted factual fields; source text can never populate policy, approval, or authority.

Run from the repository root:

```sh
node portfolio/core/scripts/run-trust-slice.mjs
node --test portfolio/core/test/*.test.mjs
node portfolio/core/scripts/verify-core.mjs
```

Successful local deletion proves absence only from the tested content-addressed store and exports. It does not prove erasure from unknown external copies, provider backups, or caches.

The committed deterministic receipt is `expected/trust-slice-receipt.json`, with receipt hash `017b8b18c818721077ee11d3a4f77846908f4d258054f1e583cb2dcb64d4f10f`. Validation rebuilds it from the fixtures rather than trusting the committed receipt.
