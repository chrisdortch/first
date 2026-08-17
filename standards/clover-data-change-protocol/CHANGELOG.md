# Changelog

## 1.0.0 — 2026-08-16 America/Chicago

Status: `disposable-pilot-validated`

Added:

- a production-denying data-change policy;
- a reusable PostgreSQL 16 migration-rehearsal workflow;
- formal policy, receipt, pointer, and registry schemas;
- exact source and protocol commit pinning;
- fail-closed changed-file boundaries;
- SQL safety screening;
- synthetic baseline and seed support;
- schema snapshots and SHA-256 identities;
- reconciliation output hashing;
- forward idempotency verification;
- rollback equivalence verification;
- owner-controlled production authority;
- a validated disposable-database pilot on Serenity Shores Boat Rentals.

Validated:

- 9/9 existing Boat Rentals tests;
- baseline schema creation and synthetic seed;
- forward migration and assertions;
- identical second forward run;
- exact rollback-to-baseline schema restoration;
- unchanged business-record reconciliation through every stage;
- no production database connection, read, write, backup, restore, or migration.

This version does not authorize live database inspection or migration.
