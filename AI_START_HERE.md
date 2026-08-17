# AI Start Here — Clover Project Work

This repository is the durable operating record for Chris Dortch's Clover project portfolio.

Before changing any application:

1. Read `CLOVER_BUILD_PROTOCOL_POINTER.json`.
2. Read `standards/clover-build-protocol/CURRENT.md` and the current numbered build protocol.
3. Read `standards/clover-build-protocol/registry/projects.json`.
4. If the work touches a database, schema, migration, backup, restore, retention rule, or persisted record, also read `CLOVER_DATA_CHANGE_PROTOCOL_POINTER.json`, `standards/clover-data-change-protocol/CURRENT.md`, and its registry.
5. Inspect the exact target repository, production branch, current production commit, deployment, domains, databases, storage, secret names only, and open work.
6. Treat all stored plans as versioned guidance, not standing authority.
7. Work on one isolated branch and one exact project only.
8. Use the reusable Clover workflows when the project is enrolled; do not copy or silently rewrite the central runtimes.
9. Run deterministic checks before requesting model visual or data interpretation.
10. Preserve receipts, screenshots, schema snapshots, reconciliation results, preview identity, backup evidence, and rollback anchors.
11. Stop before merge, production promotion, domain/DNS changes, secret changes, purchases, external messages, or production-data reads or writes unless the owner separately authorizes that exact action.

Routine application checks belong in CI. Routine migration rehearsals belong in a disposable database containing synthetic data. Models are reserved for visual judgment, architecture, ambiguous failures, migration design, risk interpretation, and final acceptance.

A passing build or migration rehearsal is evidence. It is not publication or production-data authority.
