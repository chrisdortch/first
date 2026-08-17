# Clover Data Change Protocol 1.0.0

## Mission

Permit disciplined evolution of schemas and persisted data without allowing a routine AI or CI run to touch production records.

## Default lane

Version 1.0.0 automates only **disposable-database rehearsals**. The database is created as a local PostgreSQL 16 service for one CI job, contains synthetic records only, and disappears with the runner.

## Required sequence

1. Identify the exact repository, production branch, production commit, database engine, provider, and environment-variable names.
2. Create an isolated candidate branch.
3. Limit candidate changes to the approved policy, SQL rehearsal files, and caller workflow.
4. Reject production-style database environment variables.
5. Validate the policy against the formal schema.
6. Run the project's existing deterministic tests.
7. Create the baseline schema in a disposable database.
8. Seed synthetic records that exercise keys, JSON fields, dates, nullability, and indexes.
9. Capture the baseline schema and reconciliation identity.
10. Apply the forward migration.
11. Run migration-specific assertions.
12. Apply the same forward migration again and require idempotency.
13. Apply the rollback or corrective migration.
14. Require the rollback schema to match the baseline schema exactly.
15. Require reconciliation output to remain unchanged for a preserve-mode change.
16. Produce a machine-readable receipt.
17. Stop before production access or release.

## Production lane

Production inspection, backup, restore, and migration are deliberately outside the automated v1 lane. A later production lane must require an exact owner approval naming the database, environment, migration, backup or recovery point, maintenance window, rollback plan, and post-migration verification.

## Governing principle

Use synthetic disposable data for repetition, models for migration design and risk interpretation, and the owner for all production-data authority.
