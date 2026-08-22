# Implementation Record — Version 1.0.1 Candidate

Status: `security-hardening-candidate-unvalidated`

Prepared on 2026-08-19 America/Chicago from reconciliation base `7d5d15bc2bc39a74725c9cfd6827bfe61dbb65ed`.

## Additive implementation

- Runtime: `standards/clover-data-change-protocol/runtime/v1.0.1/`
- Schemas: `standards/clover-data-change-protocol/schemas/1.0.1/`
- Templates: `standards/clover-data-change-protocol/templates/data-change-policy.v1.0.1.template.json` and `caller-workflow.v1.0.1.template.yml`
- Standard workflow: `.github/workflows/validate-clover-data-standard.yml`
- Reusable rehearsal workflow: `.github/workflows/clover-data-preview-v1.yml`
- Integrity runtime: `integrity.mjs`, `capture-state.mjs`, `verify-state.mjs`, and `verify-final-receipt.mjs`
- Restricted-role runtime: `role-safety.mjs` plus observed role evidence in `data-rehearsal.mjs`
- Immutability evidence: `V1_0_0_IMMUTABILITY_MANIFEST.json`

No version 1.0.0 runtime, schema, template, registry, evidence, or version document is changed by this candidate. The immutability validator recomputes the Git blob identity of every preserved file.

The candidate workflow is bound to GitHub's immutable reusable-workflow SHA, uses independent working and control protocol checkouts, isolates evidence under `runner.temp`, reduces the project-child environment, restores trusted tooling after each project phase, and makes the final status depend on recorded workflow outcomes plus exact artifact hashes. Its receipt deliberately reports project-command external effects as unknown because a same-user runner is not a hostile-code sandbox. It likewise reports seed-data provenance as unknown: binding candidate SQL bytes is not a provenance or synthetic-content attestation.

Candidate SQL never uses the PostgreSQL bootstrap superuser. A trusted step creates a dedicated restricted role, and the runtime records and validates its exact `pg_roles` flags and empty membership set before the first SQL artifact runs. Dynamic procedural and comment-spliced SQL forms are rejected before execution.

## Validation state

The checked-in pointer deliberately records `exactHeadCiPassed: false` and `disposablePilotPassed: false`. Local syntax, schema, adversarial, and invariant checks are development evidence only. Exact-head CI and a new disposable project pilot must be recorded separately before promotion.

No commit, pull-request update, merge, deployment, production-data action, or publication is authorized by this record.
