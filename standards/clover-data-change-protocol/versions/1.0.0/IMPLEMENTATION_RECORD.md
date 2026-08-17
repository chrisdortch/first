# Implementation Record — Version 1.0.0

Status: **candidate pending disposable-database pilot**.

## Central standard

- Repository: `chrisdortch/first`
- Parent commit: `c65a7216954034059c392695530a281d633d0b14`
- Reusable workflow: `.github/workflows/clover-data-preview-v1.yml`
- Runtime: `standards/clover-data-change-protocol/runtime/v1.0.0/`
- Schemas: `standards/clover-data-change-protocol/schemas/`
- Default lane: disposable PostgreSQL 16 with synthetic data only

## Pilot target

- Repository: `chrisdortch/serenity-shores-boat-rentals`
- Production branch: `main`
- Production commit at selection: `680039ff44be030010c0e252dca7d68056fe853f`
- Production database access: prohibited

The final implementation record will be updated only after exact workflow, artifact, changed-file, preview, and production-branch identities are independently read back.
