# Current Clover Data Change Protocol

The current preserved version is **1.0.0**, with status **disposable-pilot-validated**.

Read:

- [`versions/1.0.0/CLOVER_DATA_CHANGE_PROTOCOL.md`](versions/1.0.0/CLOVER_DATA_CHANGE_PROTOCOL.md)
- [`versions/1.0.0/ROLLBACK_AND_RECONCILIATION.md`](versions/1.0.0/ROLLBACK_AND_RECONCILIATION.md)
- [`versions/1.0.0/RELEASE_BOUNDARIES.md`](versions/1.0.0/RELEASE_BOUNDARIES.md)
- [`versions/1.0.0/IMPLEMENTATION_RECORD.md`](versions/1.0.0/IMPLEMENTATION_RECORD.md)
- [`evidence/1.0.0/boat-rentals.json`](evidence/1.0.0/boat-rentals.json)

The validated automated lane is intentionally limited to a disposable PostgreSQL 16 service containing synthetic records. It rejects production-style database environment variables and does not authorize production access, backup, restore, or migration.

**A passing rehearsal is evidence, not permission to read, copy, alter, delete, restore, or migrate production data.**
