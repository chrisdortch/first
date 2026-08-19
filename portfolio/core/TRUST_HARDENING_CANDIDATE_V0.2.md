# Clover Core Trust Hardening Candidate 0.2

Status: **isolated draft candidate; not ratified, merged, deployed, or runtime-enforced**

PR #15 reconciliation baseline: `05dd1c8c4e14d8133bb78490f8108f6b3c62f518`

Direct parent and canonical Constitution 0.1 reconciliation commit: `ce5149dad0fdf418ea51d03b58d6d77f78d8032c`

This additive candidate preserves every path recorded by the Constitution 0.1 ratification commit and adds a dependency-free executable proof of the trust model:

- lifecycle status is separate from normative Constitution text, so 0.1 remains current and 0.2 remains a draft;
- future ratification uses an enrolled owner credential, an expiring one-time challenge, and an Ed25519 signature over the exact artifact and displayed decision;
- v0.2 Event Ledger records use canonical JSON, payload hashes, consecutive sequence numbers, source hashes, previous-event hashes, and exact supersession references;
- the v0.2 genesis record anchors the complete legacy ledger without rewriting it, and the next record corrects the legacy ratification-receipt source hash append-only;
- Action Envelopes bind the exact intent, account, project, environment, native resource, expected version, operation, closed handler, tool version, verifier identity and tool, authoritative readback source, expected postcondition, parameters, data classes, cost ceiling, rollback, stop conditions, policy, nonce, approval, and expiry; authenticated approval additionally requires a phishing-resistant `action-approver` credential scoped to that account, project, and environment;
- local execution atomically spends single-use authority before a side effect, uses a separate closed verifier registry for exact readback, and records partial failure, compensation, rollback, terminal state, and a hashed receipt;
- the synthetic Trust Slice captures exact bytes, derives an allowlisted claim, builds a minimum Context Capsule and Today brief, applies a correction, exports, restores, rebuilds, and proves scoped deletion with a tombstone.

Run the full local proof from the repository root:

```sh
node --test portfolio/core/test/*.test.mjs
node portfolio/core/scripts/verify-core.mjs
node portfolio/core/scripts/run-trust-slice.mjs
```

The local `wx` reservation proves exclusion only for processes sharing one filesystem. A distributed executor still requires a transactional compare-and-swap store. A process crash after authority reservation but before terminal-state persistence requires operator recovery from the spent marker and authoritative readback; this candidate does not automatically reissue authority. The prepared ledger anchor is deliberately labeled `prepared-unanchored` until a later independently read-back remote Git object or external authenticated attestation binds its exact hash.

The next safe gate is review of this isolated local candidate. Publishing its branch, opening a draft pull request, and obtaining exact-head remote CI evidence require a separate owner decision. A later, separate decision would be whether to begin an authenticated ratification ceremony for Constitution 0.2. No private Cell, sensitive connector, merge, deployment, or runtime enforcement should precede those reviews.
