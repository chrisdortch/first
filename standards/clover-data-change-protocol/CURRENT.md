# Current Clover Data Change Protocol

The current preserved candidate is **1.0.0**, with status **candidate-disposable-pilot**.

Read:

- [`versions/1.0.0/CLOVER_DATA_CHANGE_PROTOCOL.md`](versions/1.0.0/CLOVER_DATA_CHANGE_PROTOCOL.md)
- [`versions/1.0.0/ROLLBACK_AND_RECONCILIATION.md`](versions/1.0.0/ROLLBACK_AND_RECONCILIATION.md)
- [`versions/1.0.0/RELEASE_BOUNDARIES.md`](versions/1.0.0/RELEASE_BOUNDARIES.md)
- [`versions/1.0.0/IMPLEMENTATION_RECORD.md`](versions/1.0.0/IMPLEMENTATION_RECORD.md)

The automated workflow is intentionally limited to a disposable PostgreSQL service containing synthetic records. It rejects production database environment variables and does not authorize production access or migration.

**A passing rehearsal is evidence, not permission to read, copy, alter, delete, or migrate production data.**
