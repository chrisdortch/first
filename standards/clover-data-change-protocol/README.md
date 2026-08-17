# Clover Data Change Protocol

This standard controls changes to schemas and persisted data across the CloverApps portfolio.

Its first automated lane is deliberately narrow:

```text
exact candidate
→ fail-closed changed-file boundary
→ policy schema validation
→ project tests
→ disposable PostgreSQL service
→ baseline schema + synthetic seed
→ forward migration
→ assertions and reconciliation
→ idempotency rerun
→ rollback
→ exact schema/data comparison
→ machine-readable receipt
→ owner gate
```

No production database URL is accepted by the reusable workflow. Production inspection, backup, restore, and migration require a later, separately authorized lane with provider-specific recovery evidence.

Start with [`CURRENT.md`](CURRENT.md).
