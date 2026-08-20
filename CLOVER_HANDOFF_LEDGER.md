# Clover Handoff Ledger

Status: `0.1.0 candidate-unmerged-undeployed`

The Clover Handoff Ledger is the durable bridge between an owner conversation and a bounded Codex task. It lets the owner refer to one stable Action ID instead of copying a long prompt. It does not grant authority by itself.

## Record set

Each versioned record set contains:

- a minimized Branch Capsule for the affected Cell;
- an immutable Handoff Action Envelope;
- an Execution Receipt only after work has actually completed;
- an Independent Review Decision only after a separate reviewer has evaluated one exact receipt; and
- an append-only index that binds the Action ID, capsule, envelope, lifecycle, approval attestation, receipt, and review.

The candidate records live under `portfolio/core/handoff/versions/0.1.0/`. The resolvable pointer is `portfolio/core/handoff/index.json`.

## Action-ID lifecycle

1. `proposed`: the exact envelope exists but has no effective owner approval. Codex must not execute it.
2. `approved`: a separate approval attestation in the append-only index binds the exact Action ID and envelope hash. Approval cannot alter the envelope. Recording it is a bounded candidate-branch write that needs its own explicit owner authorization; the read-only Gateway cannot perform it.
3. `consumed`: the single-use envelope has one matching receipt and cannot be replayed.
4. `revoked`: the envelope is invalid and cannot be approved or executed.

Missing, expired, ambiguous, superseded, consumed, or revoked records fail closed. A compact owner command is a lookup request, not an approval attestation.

## Authority separation

Handoff records are orchestration metadata. They do not replace the hardened Core Action Envelope v0.2, Command Packet 1.2, Constitution, or applicable Build/Data protocols. Any mutation must compile into and satisfy every applicable enforcement contract. When two controls differ, the narrower boundary wins.

No Handoff record can grant standing production authority or standing merge, private-data, secret, communication, payment, domain, permission, environment, OpenAI Site, or spending authority. Such actions require a separate exact owner decision and an execution system capable of enforcing it.

## Resolve and verify

Given `Use CloverApps to execute approved Action ID [ID]`, Codex must:

1. fetch the index from the exact authorized Git source;
2. locate exactly one entry with that Action ID;
3. hash-verify the capsule and envelope paths;
4. verify lifecycle, expiration, single-use state, and exact approval binding;
5. refresh every materially unstable source named by the envelope;
6. stop on any contradiction or missing rollback anchor;
7. stay within allowed connectors, paths, actions, and cost ceiling;
8. produce the required source-bound receipt; and
9. return that exact receipt for independent `APPROVE`, `AMEND`, or `HOLD` review.

The August 20 demonstration includes one completed read-only status-refresh record and one unapproved WarRoom reconciliation proposal. The latter is not authority to begin WarRoom work.
