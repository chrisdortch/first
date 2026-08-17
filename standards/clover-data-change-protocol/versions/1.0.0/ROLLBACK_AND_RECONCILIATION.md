# Rollback and Reconciliation

A migration rehearsal is incomplete unless it demonstrates what happens after both success and failure.

For preserve-mode migrations, v1 requires:

- a baseline schema snapshot;
- a stable reconciliation query over synthetic business records;
- a forward migration;
- migration assertions;
- a second forward run with identical schema and data identities;
- a rollback;
- post-rollback assertions;
- an exact baseline-versus-rollback schema hash match;
- identical reconciliation hashes before, after, and after rollback.

Reconciliation SQL must be deterministic. It should order arrays and rows explicitly and should summarize only synthetic records created by the seed file.

A rollback is not proof that production recovery is safe. Production requires provider-specific backup, point-in-time recovery, restore testing, and a separately approved corrective plan.
