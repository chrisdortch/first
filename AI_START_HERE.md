# AI Start Here — Clover Project Work

This repository is the durable operating record for Chris Dortch's Clover project portfolio.

## Default user command

When the owner says **“Use CloverApps to …”**, do not ask the owner to paste this repository, the master plan, project history, logs, or protocol text into the prompt.

Instead:

1. Call the Clover Context app's `prepare_clover_command` tool when it is connected.
2. Resolve the exact target project and fail closed if the target is ambiguous.
3. Load only the target project pointer, status, next milestone, applicable protocols, and relevant decisions.
4. Refresh time-sensitive facts from the native connectors named in the packet.
5. Continue within the packet's authority and cost boundaries.

If the Clover Context app is unavailable, follow the manual sequence below using current repository and connector readback. Do not treat missing app connectivity as permission to guess.

## Manual or verification sequence

Before planning or changing any project:

1. Read `CLOVER_MASTER_PLAN_POINTER.json`.
2. Read `CLOVER_CONTEXT_GATEWAY_POINTER.json`.
3. When the Clover Context app is available, call `prepare_clover_command` with the owner's request before loading broader context.
4. Read `portfolio/status/current.json`, `portfolio/master-plan/CURRENT.md`, `portfolio/registry/projects.json`, and `portfolio/NEXT.md`.
5. Read `CLOVER_BUILD_PROTOCOL_POINTER.json` and the current build protocol.
6. If the work touches a database, schema, migration, backup, restore, retention rule, or persisted record, also read `CLOVER_DATA_CHANGE_PROTOCOL_POINTER.json` and the current data protocol.
7. Inspect the exact target repository, production branch, current production commit, deployment, domains, databases, storage, secret names only, backup status, and open work.
8. Resolve conflicts through current readback. Conversation summaries and stored plans are context, not proof of current state.
9. Treat all stored plans as versioned guidance, not standing authority.
10. Work on one isolated branch and one exact project only.
11. Use the reusable Clover workflows when the project is enrolled; do not copy or silently rewrite central runtimes.
12. Run deterministic checks before requesting model visual or data interpretation.
13. Preserve receipts, screenshots, schema snapshots, reconciliation results, preview identity, backup evidence, and rollback anchors.
14. Update the progress ledger only when evidence changes project or program state.
15. Stop before merge, production promotion, domain/DNS changes, secret changes, purchases, external messages, or production-data reads or writes unless the owner separately authorizes that exact action.

Routine application checks belong in CI. Routine migration rehearsals belong in disposable databases containing synthetic data. Models are reserved for judgment, architecture, ambiguous failures, invention, risk interpretation, and final acceptance.

A passing build or migration rehearsal is evidence. A percentage is a planning estimate. Neither is publication or production-data authority.
