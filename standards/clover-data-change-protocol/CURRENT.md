# Current Clover Data Change Protocol

The current preserved version is **1.0.0**, with status **disposable-pilot-validated**.

Version **1.0.1** exists only as a **security-hardening candidate**. It is explicitly unvalidated until exact-head CI and a new disposable pilot are recorded. The reusable workflow is prepared to exercise 1.0.1, but that preparation does not promote it.

Read:

- [`versions/1.0.0/CLOVER_DATA_CHANGE_PROTOCOL.md`](versions/1.0.0/CLOVER_DATA_CHANGE_PROTOCOL.md)
- [`versions/1.0.0/ROLLBACK_AND_RECONCILIATION.md`](versions/1.0.0/ROLLBACK_AND_RECONCILIATION.md)
- [`versions/1.0.0/RELEASE_BOUNDARIES.md`](versions/1.0.0/RELEASE_BOUNDARIES.md)
- [`versions/1.0.0/IMPLEMENTATION_RECORD.md`](versions/1.0.0/IMPLEMENTATION_RECORD.md)
- [`evidence/1.0.0/boat-rentals.json`](evidence/1.0.0/boat-rentals.json)

Candidate review material:

- [`versions/1.0.1/CLOVER_DATA_CHANGE_PROTOCOL.md`](versions/1.0.1/CLOVER_DATA_CHANGE_PROTOCOL.md)
- [`versions/1.0.1/SECURITY_HARDENING.md`](versions/1.0.1/SECURITY_HARDENING.md)
- [`versions/1.0.1/RELEASE_BOUNDARIES.md`](versions/1.0.1/RELEASE_BOUNDARIES.md)
- [`versions/1.0.1/IMPLEMENTATION_RECORD.md`](versions/1.0.1/IMPLEMENTATION_RECORD.md)

The validated 1.0.0 pilot used a disposable PostgreSQL 16 service with reviewed synthetic records. The 1.0.1 candidate additionally isolates and hashes its source, protocol, inputs, and evidence around project-controlled phases, executes SQL only as a dedicated observed `NOSUPERUSER` role with no inherited memberships, and rejects procedural/dynamic SQL constructs. It binds candidate seed SQL identity but does not attest the origin or classification of literal seed values, so seed-data provenance remains explicitly unknown. It supplies no production credentials and does not authorize production access, backup, restore, or migration. Because a same-user runner is not a hostile-code sandbox, project-command external effects also remain explicitly unknown.

**A passing rehearsal is evidence, not permission to read, copy, alter, delete, restore, or migrate production data.**
