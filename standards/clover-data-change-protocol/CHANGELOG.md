# Changelog

## 1.0.1 candidate — 2026-08-19 America/Chicago

Status: `security-hardening-candidate-unvalidated`

Added without changing any 1.0.0 file:

- exact comparison of `origin/<productionBranch>` with the enrollment commit;
- binding between policy, GitHub's immutable reusable-workflow SHA, and observed working/control protocol commits;
- separate candidate, protocol, control, and evidence roots with evidence outside the candidate checkout;
- reduced-environment, `shell: false`, timeout-bounded project commands with process-group cleanup;
- pre/post candidate, protocol, input, tooling, and evidence snapshots around every project-controlled phase;
- exact receipt/log hash binding, trusted protocol restoration, and a final artifact recheck;
- accurate same-user-runner semantics: project-command external effects are `unknown`, not asserted absent;
- accurate seed semantics: seed SQL bytes are bound, while source-record provenance and synthetic classification remain `unknown`;
- lexical, `lstat`, realpath, and regular-file checks for every SQL path;
- rejection of every psql backslash command or escape, including inline meta-commands;
- strict 1.0.1 policy, receipt, and pointer schemas;
- adversarial stale-anchor, protocol-substitution, meta-command, and symlink regressions;
- a Git-blob immutability manifest for all preserved 1.0.0 artifacts.

Exact-head CI and a disposable 1.0.1 project pilot have not yet been recorded. This candidate grants no production or release authority.

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
