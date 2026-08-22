# Codex Clover Operator

This is the bounded execution-lane guide for the Clover Core trunk-activation candidate. It is not an Action Envelope and grants no authority.

## Owner command

Begin only from this compact handoff:

```text
Use CloverApps to execute approved Action ID [ID].
```

The Action ID is a lookup key, not permission by itself. The compact command does not approve the action or create an owner approval attestation.

## Resolve before acting

1. Read `AI_START_HERE.md`, the current Constitution pointer, applicable current protocols, and this operator guide.
2. Fetch `portfolio/core/handoff/index.json` from the exact authorized candidate source. Resolve the Action ID to one immutable envelope version and content hash.
3. Validate the envelope and separate approval attestation against their declared schemas. Verify the index binds both exact hashes, lifecycle state, expiry, single-use state, exact owner-approval binding, source and target identities, allowed operations, prohibited operations, connectors, cost ceiling, stop conditions, rollback, and receipt requirements.
4. Confirm that the approval names the same Action ID, version, hash, source, target, and operation set. Neither the compact command nor earlier chat expands the envelope.
5. Refresh every materially unstable fact through the minimum required connector. Treat unavailable or contradictory facts as `unknown` and stop when they affect safety.
6. Use a clean, isolated workspace. Record the rollback anchor before editing. Preserve unrelated work and historical artifacts.

The Handoff Ledger envelope does not replace or broaden the runtime Action Envelope and Command Packet 1.2 controls. When both apply, enforce the narrower boundary and stop on contradiction. Codex must not self-record an approval from the compact execution command; the exact approval attestation must already be present in the authorized index.

## Execute and verify

- Perform only the exact allowed operations, in order, against the exact targets.
- Prefer deterministic local checks and isolated non-production previews.
- Never widen scope merely to make a check pass.
- Stop before any separately owner-gated operation.
- Re-read exact source, target, CI, preview, rollback, and repository cleanliness after the work.
- Write the required source-bound execution receipt and artifact hashes only to the authorized candidate branch or output location.
- Report completed, failed, skipped, rolled back, contradictory, and unknown checks separately. A partial result is not `COMPLETE`.

## Stop conditions

Stop without improvising if the Action ID is missing or ambiguous; the envelope or approval cannot be read and hash-verified; the envelope is draft, expired, used, revoked, or not approved; an exact identity differs; the workspace cannot be isolated; rollback cannot be proven; an unlisted file, target, connector, cost, or operation is required; or another system could be affected.

Never merge; deploy or promote production; access production/private data; reveal or mutate secrets; send messages or comments; spend money; exercise payments; change domains, aliases, DNS, permissions, credentials, access policies, or persistent environments; or modify an OpenAI Site unless that exact operation is named in a still-valid envelope and separately bound owner approval. No standing authority exists.
