# Progress Methodology 0.2 candidate

Status: `candidate-unmerged-undeployed`

This additive August 20 candidate defines four different completion questions and a transparent priority model. It does not modify or reinterpret the preserved August 17 methodology or its 41% historical broad-mission estimate.

## Evidence rule

Every metric is a planning estimate. Each published value must include its date, scope, weighting method, evidence confidence, source freshness, exclusions, lifecycle class, component scores, and arithmetic. A percentage never grants authority.

Use these lifecycle classes exactly:

- `live`: externally running production state actually read back;
- `current`: the adopted or governing version, whether or not it is a deployed application;
- `candidate`: isolated, unmerged, undeployed, or otherwise awaiting a separate promotion decision;
- `historical`: immutable prior evidence retained for comparison.

Do not convert `reported`, `partially-verified`, `unverified`, or `unknown` evidence into `verified`. When a current connector readback contradicts a source pointer, the current readback may override only the exact fact it proves. It does not silently update the pointer or promote the underlying candidate.

## Four completion metrics

### Broad mission completion

Scope: the complete Clover mission across the eight program areas and weights preserved in the August 17 methodology.

Calculation:

```text
weighted raw completion = sum(area weight × area completion estimate ÷ 100)
displayed completion = nearest whole number
```

The August 20 candidate re-evaluates every area against the existing percentage anchors. An unchanged component is retained only when no new milestone evidence justifies movement. Candidate milestones can improve a planning score, but they remain labeled candidate and cannot be presented as live progress.

### Owner-usable operating-loop completion

Scope: what Chris can actually use through the current operating path, excluding candidate-only surfaces that are not connected to the owner path.

| Stage | Weight |
|---|---:|
| Observe | 15 |
| Understand | 15 |
| Recommend | 15 |
| Approve | 10 |
| Execute safe parts | 20 |
| Verify | 15 |
| Return and report | 10 |

Stage anchors are deterministic: `0` absent, `25` defined/manual, `50` implemented but not fully integrated, `75` exact candidate readback, and `100` owner-accessible live end to end. Candidate-only evidence cannot raise this current-use metric above `50` for a stage.

### Live production completion

Scope: the live Clover Today owner experience, excluding every saved source candidate, preview, draft PR, unratified policy, and historical checkpoint.

It uses the existing project dimensions and weights from Progress Methodology 1.0: definition 10, core journeys 25, data/integrations 15, UX/accessibility 10, security/privacy/legal 10, build/deployment/production verification 10, backup/restore/portability 10, and monitoring/documentation/operations 10. The same 0/25/50/75/100 evidence anchors apply. Unknown production facts receive no inferred credit beyond the last proven milestone.

### Verified candidate completion

Scope: the exact August 20 candidate stack only. It uses the same eight project dimensions and weights as live production completion, but credits exact candidate source, test, CI, immutable preview, and rollback evidence. It excludes merge, production readiness, owner acceptance, pending project pilots, unavailable visual readback, and all unknowns.

The verified-candidate percentage must never be described as current or live.

## August 20 priority model

This candidate introduces the following owner-authorized model; it was not part of the August 17 historical methodology.

| Dimension | Weight |
|---|---:|
| `deadlineSafetyContinuityRisk` | 30 |
| `ownerCollaboratorWorkloadReduction` | 25 |
| `revenueFinancialStability` | 20 |
| `portfolioSynergyUnblockingValue` | 15 |
| `readinessAndCostToFinish` | 10 |

Each dimension is an integer from 0 to 100 or `null`. Every factor carries a short rationale, evidence classification (`source-fact`, `owner-direction`, `AI-inference`, or `unknown`), and evidence references. `null` means unknown; it never means zero. If any factor is null, the target is `blocked-unknown`, receives no weighted score, and remains unranked.

For complete factors, the weighted score is the sum of `dimension score × weight ÷ 100`, rounded to two decimals. Ranking is deterministic: P0 before P1, then weighted score descending, then target ID ascending. The stored August 20 input contains all 19 P0/P1 records from current Registry 1.0, joined to Registry 2.0 by stable project ID. The output exposes the top three ranked eligible records while retaining blocked and unranked records visibly.

Only minimized P0/P1 target records may enter the engine. Inputs and outputs may contain target IDs, lane, scores, provenance, freshness, unknown labels, exact public source identities, and selection state. They may not contain raw legal, financial, health, customer, guest, staff, credential, communication, payment, or transactional fields.

WIP is limited to:

- one active `coreTrunk` task;
- one active `affiliatedBranch` task.

Eligible excess work remains queued. Blocked work remains visible but cannot consume an active lane. A recommendation does not automatically start work: the selected affiliated target is recorded as `selected-pending-owner-gate`, reserves at most one lane, and remains absent from `activeByLane`. Only the already-authorized Core trunk task is active in this gate. These limits are maximum capacity, not authority to begin work, merge, deploy, access data, communicate, change secrets or domains, or spend.

## Recalculation and history

`portfolio/runtime/priority-engine.mjs` deterministically recalculates weighted metrics and priority output. Priority input, output, and status are self-bound with SHA-256 over canonical key-sorted JSON excluding the artifact's own hash field. Tests must prove hash binding, weight totals, stored arithmetic, 19-target completeness, null-to-unranked behavior, per-factor evidence labels, deterministic ranking, pending-gate reservations, WIP enforcement, lifecycle distinctions, and the raw-sensitive-field boundary.

Never overwrite `portfolio/status/current.json`, `portfolio/status/STATUS.md`, or `portfolio/status/snapshots/2026-08-17.json` to publish this candidate. Promotion, if ever approved, requires a separate pointer and history decision.
