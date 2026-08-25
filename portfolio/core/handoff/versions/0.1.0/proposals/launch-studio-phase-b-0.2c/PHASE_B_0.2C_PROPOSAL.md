# Clover Launch Studio Phase B 0.2C Action 006 proposal

Status: Action 005 revoked; Action 006 proposed, unapproved, unconsumed and non-executable.

## Acceptance correction

This successor restores material `accept_event_append_only` coverage for every Launch Session event: exact expected session version, monotonic sequence, exact predecessor event ID and canonical predecessor hash, and idempotency binding. It separately adds material `accept_handoff_lifecycle_append_only` for the Handoff index 0003→0004 revocation-and-append plus synthetic 0004→0005 approval and 0005→0006 consumption rehearsal. The new Acceptance Contract contains exactly 31 unique material test IDs, and the Build Charter binds the same exact ordered list.

PR #29 review thread `PRRT_kwDOSWXoYM6b41Fx` remains unresolved. This proposal records the correction; it does not comment on or resolve that historical thread.

## Lifecycle correction

Action 005 remains immutable history at envelope hash `cc1626a1d8e2bbc77ee64352a4521d9a8394a66bfbb70d43bcf5662aff28ce44`. Its proposal-local, closed, self-hashed revocation evidence records reason `acceptance-contract-launch-session-append-only-coverage-omitted` and source finding `PR #29 review thread PRRT_kwDOSWXoYM6b41Fx`. Handoff 0.1 has no native revocation-record schema or evidence resolver, so the authorized test independently validates the exact key set, canonical self-hash and index 0004 evidence binding. No runtime or schema is changed, no historical record is rewritten and no consequential authority is granted.

Immutable index 0004 performs exactly one existing-entry transition (Action 005 proposed to revoked) and one contiguous append (Action 006 proposed). The stable root is byte-identical to index 0004. Action 005 cannot execute. Action 006 cannot execute from index 0004. Actions 001, 002 and 004 remain unchanged; no canonical Action 003 exists.

## Separate approval and execution paths

A future separate owner approval-recording gate—not Action 006 execution—must record `portfolio/core/handoff/versions/0.1.0/approvals/action-006-launch-studio-phase-b-source-approval.json`, immutable `portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0005.json`, and the stable root. Only exact approved/available index 0005 can make Action 006 executable.

Action 006 execution may record exactly `portfolio/core/handoff/versions/0.1.0/receipts/action-006-launch-studio-phase-b-source-receipt.json`, immutable `portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0006.json`, and `portfolio/core/handoff/index.json`. Approval paths and indexes 0003/0004/0005 are outside its execution recording scope. The deterministic test-only rehearsal proves proposed index 0004 → approved/available index 0005 → consumed/completed index 0006, validates the synthetic receipt and both transitions, and rejects direct 0004→0006, replay, wrong-index, substitution, path widening, traversal, symlink, expiry and revoked-Action execution. Synthetic approval, receipt and successor index records are not persisted.

## Exact source and destination separation

- Proposal source: protected `chrisdortch/first` / `main` / `50faeb470893d926393937418b3b0b67a286ec99`, tree `09907780237a23d68b2555d83485bfba69d09994`.
- Action target: immutable `chrisdortch/first` / `main` / `e5688c771d384d80a8c723cfa655298ce8257889`, tree `4c84129b4fb5ea098ac9d2325bc2cb387857a471`; this is a reviewed source baseline and not a claim that current main equals that commit.
- The exact future destination is designated only in the Executor Work Order and future receipt contract; it is not repeated here.
- The existing Branch Capsule is reused byte-for-byte; its Action 004 recommendation is historical issuance metadata.
- No destination branch, application worktree, candidate commit/tree or application source exists.

## Exact boundary and authority

The future source candidate is confined to the exact ordered 31 `apps/clover-launch-studio/**` paths. Workflow, portfolio, standards, another application and provider configuration paths are excluded. The operation has exactly seven enrolled actions: read public metadata, verify exact identity, verify local cleanliness, verify source ancestry, create isolated branch, commit candidate and record Handoff artifacts. `assemble-sanitized-receipt` is not enrolled. Requested authority is bounded, but effective authority is entirely false while proposed.

Validation, repair, push, pull-request publication, providers, OAuth, database, Blob, environment, secret, preview, merge, production, private data, messages, payments, purchases and spending are prohibited.

Provider-neutral interfaces remain required. Exact classifications: Clerk: candidate/unselected; Neon: candidate/unselected; Vercel Blob: candidate/unselected; Vercel hosting: candidate/unprovisioned. No provider is selected, provisioned or authorized. Speech remains host-assisted to exact owner-reviewed transcript; native in-app voice false; raw audio retained false; text fallback required; personal ChatGPT memory ingestion false.

## Future budget and stop rules

The future Launch Session ceilings remain exactly 12 model calls, 2 implementation agents, 3 repair loops, 120 minutes, 1 provider CI run, 1 target-null preview and USD 0 explicit purchases, with automatic additional-credit purchase false. Stop after the same failure signature occurs twice. Stop after one repair loop produces no new evidence. Maximum future repair loops remains three. These future ceilings grant Action 006 no present validation, repair, CI or preview authority.

## Hash and publication gate

- Revocation self-hash: `322ca206e0eaceb983067d64132e0a380b5105c67d724fdcb9a81a036ae355dc`.
- Branch Capsule self-hash: `7c859ee6ad9330e7f42b78467236948280b1765e7c045b4d0dc17e4753d6e2d4`.
- Action 006 envelope self-hash: `d1bd1b261cfa0b7c52b5cd7bb69058f2011d526ec874492a2253255ce65d9965`.
- Index 0004 self-hash: `6c283a75552b77101fccaffea665bf2163bb29ca050ef8b8738105eabfc50b8f`.
- Creation: `2026-08-25T00:30:18.000Z`; expiry: `2026-08-28T00:30:18.000Z` exactly 72 hours later. Publish within 24 hours so 48 through 72 hours remain before expiry, or abandon and reseal.

No owner approval line, attestation, execution receipt or application/provider effect is present. Independent Personal Pro review and protected-main merge must precede a separate exact Action 006 approval-recording gate.
