# Source Pulse Matrix — Candidate 0.1

Status: **preview-only design candidate**  
Prepared: August 18, 2026 · America/Chicago  
Authority effect: none beyond existing read-only source checks and separately approved preview work.

## Purpose

Clover should continually become more current without repeatedly copying every connected source into one database, wasting tokens, increasing exposure, or confusing unchanged information with meaningful change.

The Source Pulse Matrix is a compact registry of each authorized source's availability, coverage, freshness, delta position, sensitivity, cost, and permitted projections.

The operating principle is:

> Check health and deltas first. Read content only when change, priority, or an exact task justifies it.

## One row per source boundary

Each source or bounded Cell should expose, where technically available:

- source ID and responsible Cell;
- connector and authenticated owner identity;
- permitted operations;
- data classes and disclosure restrictions;
- coverage start and end;
- last successful observation time;
- last complete synchronization time;
- current sync state: healthy, partial, syncing, stale, failed, revoked, or unknown;
- delta cursor, change token, last event ID, commit, message ID, modified time, or other source-native checkpoint;
- estimated retrieval and model cost;
- retention and deletion policy;
- minimized projection types the source may publish to Core;
- owner action required, if any;
- next scheduled or event-triggered check only after a real scheduler is approved and running.

## Refresh sequence

1. Read the Pulse Matrix and current task purpose.
2. Check connector availability, authorization, coverage, and source-native delta metadata.
3. Mark partial, stale, failed, or unknown coverage explicitly.
4. Skip unchanged sources unless an exact task still requires them.
5. Retrieve only changed records or the smallest relevant range.
6. Preserve source pointers and content hashes where appropriate.
7. Classify extracted assertions through the Memory Promotion Ladder.
8. Publish only purpose-bound Knowledge Projections.
9. Update the Event Ledger, pulse checkpoint, receipt, and daily-log projection.

## Why this is stronger than bulk synchronization

Bulk synchronization treats volume as intelligence. The Pulse Matrix treats relevance, change, coverage, provenance, and authority as intelligence.

It reduces:

- token and model spend;
- connector calls and rate-limit pressure;
- unnecessary movement of private data;
- duplicate records;
- stale summaries;
- cross-project contamination;
- owner review burden;
- the chance that a disconnected or partially synced source is mistaken for complete truth.

## Priority-aware opening rules

A source may be opened beyond metadata when at least one condition is true:

- it changed since the last verified checkpoint;
- it supports or contradicts a current P0/P1 priority;
- it contains an approaching deadline or commitment within the approved scope;
- it is required to verify an exact action, rollback, backup, or receipt;
- Chris explicitly asks for it;
- a deterministic rule identifies a material anomaly;
- the current Context Capsule names it as necessary.

Sensitivity and authority still control access. Priority never overrides permission.

## Private-source projections

Private Cells should normally return minimized projections rather than raw records.

Examples:

- Finance returns available coverage, posted-cash constraints, upcoming recurring obligations, and confidence—not an indiscriminate public copy of transactions.
- WarRoom returns approved deadline, case-state, risk, and task projections—not raw evidence or strategy to public Core.
- Health returns an authorized task-specific summary—not an unrestricted health corpus.
- The Vault returns secret references and reveal capability status—not plaintext values.

## Event-driven plus periodic operation

The future preferred model is hybrid:

- source-native webhooks or change tokens when reliable;
- lightweight periodic health checks for sources without events;
- task-triggered refresh before consequential reasoning or action;
- daily-log projection after material events;
- full reconciliation and restore testing on a slower schedule.

No continuous monitor or scheduler is claimed by this candidate. A monitor exists only after its exact runtime, cadence, cost, permissions, failure reporting, and stop controls are deployed and verified.

## Failure behavior

Clover must not convert missing data into “nothing happened.”

When a pulse is partial, stale, failed, revoked, or unknown, the resulting brief must say so in the same section as the affected conclusion. Consequential actions stop when the missing coverage could materially change safety or priority.

## First implementation milestone

Implement the Matrix initially for public canonical GitHub and Vercel context only. Then add one low-risk private ingest Cell after export and clean-room restoration are proven. Sensitive connectors are added individually, with source-specific retention, projection, and authorization policies.
