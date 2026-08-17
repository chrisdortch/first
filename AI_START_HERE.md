# AI Start Here — Clover Project Work

This repository is the durable operating record for Chris Dortch's Clover project portfolio.

Before planning or changing any project:

1. Read `CLOVER_MASTER_PLAN_POINTER.json`.
2. Read `portfolio/status/current.json`, `portfolio/master-plan/CURRENT.md`, `portfolio/registry/projects.json`, and `portfolio/NEXT.md`.
3. Read `CLOVER_CONTEXT_GATEWAY_POINTER.json`. When the Clover context app is connected, use it to retrieve this canonical context and prepare a freshness-aware command packet instead of asking the owner to paste the same context into every prompt.
4. Read `CLOVER_BUILD_PROTOCOL_POINTER.json` and the current build protocol.
5. If the work touches a database, schema, migration, backup, restore, retention rule, or persisted record, also read `CLOVER_DATA_CHANGE_PROTOCOL_POINTER.json` and the current data protocol.
6. Inspect the exact target repository, production branch, current production commit, deployment, domains, databases, storage, secret names only, backup status, live errors/logs when relevant, and open work.
7. Resolve conflicts through current readback. Conversation summaries and stored plans are context, not proof of current state.
8. Treat all stored plans as versioned guidance, not standing authority.
9. Work on one isolated branch and one exact project only.
10. Use the reusable Clover workflows when the project is enrolled; do not copy or silently rewrite central runtimes.
11. Run deterministic checks before requesting model visual or data interpretation.
12. Preserve receipts, screenshots, schema snapshots, reconciliation results, preview identity, backup evidence, and rollback anchors.
13. Update the progress ledger only when evidence changes project or program state.
14. Stop before merge, production promotion, domain/DNS changes, secret changes, purchases, external messages, or production-data reads or writes unless the owner separately authorizes that exact action.

Routine application checks belong in CI. Routine migration rehearsals belong in disposable databases containing synthetic data. Models are reserved for judgment, architecture, ambiguous failures, invention, risk interpretation, and final acceptance.

A passing build or migration rehearsal is evidence. A percentage is a planning estimate. Neither is publication or production-data authority.
