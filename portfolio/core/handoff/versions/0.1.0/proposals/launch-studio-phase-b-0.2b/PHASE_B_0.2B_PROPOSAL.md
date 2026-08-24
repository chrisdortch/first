# Clover Launch Studio Phase B 0.2B Action 005 proposal

Status: Action 004 revoked; Action 005 proposed, unapproved, unconsumed and non-executable.

## Lifecycle correction

Action 004 remains immutable history at envelope hash `7649ec03c472306c1e3de93c08b11665debb4e095ece4aa9d4da2c2d357ca420`. Its proposal-local, closed, self-hashed revocation evidence records reason `execution-consumption-index-path-not-authorized`; Handoff 0.1 has no native revocation-record schema or evidence resolver, so the authorized test independently validates the exact key set, canonical self-hash and index 0003 evidence binding. No runtime or schema is changed, no historical record is rewritten and no consequential authority is granted.

Immutable index 0003 performs exactly one existing-entry transition (Action 004 proposed to revoked) and one contiguous append (Action 005 proposed). The stable root is byte-identical to index 0003. Action 004 cannot execute. Action 005 cannot execute from index 0003.

## Chain-depth-neutral publication fixture

The exact 14-path proposal includes one test-only amendment to portfolio/core/test/publication-finalization.test.mjs. Genesis-based synthetic chains are normalized to immutable index 0001, explicit synthetic installation removes unrelated later snapshots, and the actual-current-root orphan probe derives its next sequence dynamically. Existing adversarial assertions and error patterns remain unchanged. No Handoff or publication runtime or schema changes.

## Separate approval and execution paths

A future separate owner approval-recording gate—not Action 005 execution—must record `portfolio/core/handoff/versions/0.1.0/approvals/action-005-launch-studio-phase-b-source-approval.json`, immutable `portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0004.json`, and the stable root. Only exact approved/available index 0004 can make Action 005 executable.

Action 005 execution may record exactly `portfolio/core/handoff/versions/0.1.0/receipts/action-005-launch-studio-phase-b-source-receipt.json`, immutable `portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0005.json`, and `portfolio/core/handoff/index.json`. Approval paths and indexes 0003/0004 are outside its execution recording scope. The deterministic test-only rehearsal proves proposed index 0003 → approved/available index 0004 → consumed/completed index 0005, validates the synthetic receipt and both transitions, and rejects replay, direct 0003→0005, index substitution and out-of-scope recording. Synthetic approval and receipt records are not persisted.

## Exact source and destination separation

- Proposal source: protected `chrisdortch/first` / `main` / `3bf01627272d6c3a3da578dc7080b441e4fa3d47`, tree `e30153603796d12539444d88c4ca7f36ffc8fd04`.
- Action target: immutable `chrisdortch/first` / `main` / `e5688c771d384d80a8c723cfa655298ce8257889`, tree `4c84129b4fb5ea098ac9d2325bc2cb387857a471`.
- The exact future destination is designated only in the Executor Work Order and future receipt contract; it is not repeated here.
- The existing Branch Capsule is reused byte-for-byte; its Action 004 recommendation is historical issuance metadata.
- No destination branch, worktree, candidate commit/tree or application source exists.

## Exact boundary and authority

The future source candidate is confined to the exact ordered 31 `apps/clover-launch-studio/**` paths. Workflow, portfolio, standards, another application and provider configuration paths are excluded. The operation has exactly seven enrolled actions: read public metadata, verify exact identity, verify local cleanliness, verify source ancestry, create isolated branch, commit candidate and record Handoff artifacts. `assemble-sanitized-receipt` is not enrolled. Effective authority is entirely false while proposed.

Validation, repair, push, pull-request publication, providers, OAuth, database, Blob, environment, secret, preview, merge, production, private data, messages, payments, purchases and spending are prohibited.

Provider-neutral interfaces remain required. Exact classifications: Clerk: candidate provider, unselected; Neon: candidate provider, unselected; Vercel Blob: candidate provider, unselected; Vercel hosting: candidate provider, unprovisioned. No provider is selected, provisioned or authorized. Speech remains host-assisted to exact owner-reviewed transcript; native in-app voice false; raw audio retained false; text fallback required; personal ChatGPT memory ingestion false.

## Future budget and stop rules

The future Launch Session ceilings remain exactly 12 model calls, 2 implementation agents, 3 repair loops, 120 minutes, 1 provider CI run, 1 target-null preview and USD 0 explicit purchases, with automatic additional-credit purchase false. Stop after the same failure signature occurs twice. Stop after one repair loop produces no new evidence. Maximum future repair loops remains three. These future ceilings grant Action 005 no present validation, repair, CI or preview authority.

## Hash and publication gate

- Revocation self-hash: `3b496dde58ed6c5a27f732620db7acc1ad7b3d58fb5aec15da9c76851d5c2f04`.
- Branch Capsule self-hash: `7c859ee6ad9330e7f42b78467236948280b1765e7c045b4d0dc17e4753d6e2d4`.
- Action 005 envelope self-hash: `cc1626a1d8e2bbc77ee64352a4521d9a8394a66bfbb70d43bcf5662aff28ce44`.
- Index 0003 self-hash: `915ae90d41f8fff62681c213f230424d2a7e86049d362081883f276562ca3115`.
- Creation: `2026-08-24T22:30:28.000Z`; expiry: `2026-08-27T22:30:28.000Z` exactly 72 hours later. Publish within 24 hours so 48 through 72 hours remain before expiry, or abandon and reseal.

No owner approval line, attestation, execution receipt or application/provider effect is present. Independent Personal Pro review and protected-main merge must precede a separate exact Action 005 approval-recording gate.
