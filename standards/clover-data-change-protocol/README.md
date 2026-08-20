# Clover Data Change Protocol

This standard controls changes to schemas and persisted data across the CloverApps portfolio.

Its first automated lane is deliberately narrow:

```text
exact candidate
→ fail-closed changed-file boundary
→ policy schema validation
→ immutable workflow protocol + production-anchor binding
→ isolated evidence + pre-command integrity snapshot
→ reduced-environment project install/test
→ independent post-command integrity checks + exact protocol restore
→ symlink-safe SQL path resolution
→ psql meta-command rejection
→ disposable PostgreSQL service
→ dedicated NOSUPERUSER rehearsal role with no inherited memberships
→ dynamic procedural SQL rejection
→ baseline schema + candidate seed with bound identity and unknown provenance
→ forward migration
→ assertions and reconciliation
→ idempotency rerun
→ rollback
→ exact schema/data comparison
→ artifact-hash-bound machine-readable receipt
→ owner gate
```

No production database URL or credential is supplied by the reusable workflow. The same-user hosted runner is not a hostile-code sandbox, so candidate-controlled npm external effects are reported as unknown rather than falsely reported as absent. Version 1.0.1 also binds the seed SQL bytes but reports seed-data provenance as unknown: content identity does not prove that literal values are synthetic. Production inspection, backup, restore, and migration require a later, separately authorized lane with provider-specific recovery evidence.

Version 1.0.0 remains the validated current version. Version 1.0.1 is an additive, unvalidated security-hardening candidate; see [`CURRENT.md`](CURRENT.md) for the exact state.

Start with [`CURRENT.md`](CURRENT.md).
