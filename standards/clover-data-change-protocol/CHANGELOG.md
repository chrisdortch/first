# Changelog

## 1.0.0 — 2026-08-16 America/Chicago

Status: `candidate-disposable-pilot`

Added:

- a production-denying data-change policy;
- a reusable PostgreSQL migration-rehearsal workflow;
- formal policy, receipt, pointer, and registry schemas;
- exact source and protocol commit pinning;
- fail-closed changed-file boundaries;
- SQL safety screening;
- synthetic baseline and seed support;
- schema snapshots and SHA-256 identities;
- reconciliation output hashing;
- forward idempotency verification;
- rollback equivalence verification;
- owner-controlled production authority.

This version does not authorize live database inspection or migration.
