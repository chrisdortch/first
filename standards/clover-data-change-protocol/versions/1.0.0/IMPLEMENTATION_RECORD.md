# Implementation Record — Version 1.0.0

Verified through **2026-08-17T04:08:39Z**.

## Central standard

- Repository: `chrisdortch/first`
- Candidate branch: `protocol/clover-data-change-protocol-v1.0.0-candidate-20260816`
- Validated reusable runtime commit: `d98d6abc402964e6327984f7fb768a34bf2c09c6`
- Standard-validation workflow run: `31993337570`
- Standard-validation conclusion: `success`
- Reusable workflow: `.github/workflows/clover-data-preview-v1.yml`
- Runtime: `standards/clover-data-change-protocol/runtime/v1.0.0/`
- Schemas: `standards/clover-data-change-protocol/schemas/`
- Default lane: disposable PostgreSQL 16 with synthetic data only

## Disposable-database pilot — Boat Rentals

- Repository: `chrisdortch/serenity-shores-boat-rentals`
- Production branch: `main`
- Production commit before and after pilot: `680039ff44be030010c0e252dca7d68056fe853f`
- Production Vercel deployment: `dpl_HdyBzY9HAVSYJm4gq4s5sCMUWAhx`
- Pilot branch: `chatpro/clover-data-v1-boat-rentals-pilot-20260816`
- Pilot commit: `0507f5008896bfc78611292aabd7c246d485a013`
- Changed files: one policy, seven synthetic SQL rehearsal files, and one caller workflow
- Application source changes: none
- Reusable protocol pin: `d98d6abc402964e6327984f7fb768a34bf2c09c6`
- Workflow run: `31993387866`
- Workflow conclusion: `success`
- Evidence artifact ID: `9276053822`
- Evidence digest: `sha256:2b2e0a47e69d73e5e30914d25a55ac8bd8f039400efce6eb51bb024ea188e8d4`
- Preview deployment: `dpl_B4Hd9dFeCkmvT32oNcCBxgUDXfSV`
- Preview state: `READY`
- Preview target: none; not production
- Clover Vault folder: `1mHDjvtEGW0inHqs01F5qQTRSK1NWRLJz`
- Clover Vault evidence file: `1cSYG_yzftN-W3jg1alzPFoVLDUiljxeO`

## Rehearsal results

- Existing project tests: 9 passed, 0 failed
- SQL screening: passed
- Baseline schema and synthetic seed: passed
- First forward migration: passed
- Migration-specific assertions: passed
- Second forward migration: identical schema and reconciliation
- Rollback: passed
- Baseline schema hash: `5c79c37c4d4b108ed2c5c7c73776e164d7b7798b06883d14569a0a243c5ef8a0`
- Forward schema hash, both runs: `68122f06164537b0094e2411195c1eef54b875399f5fbfadeb85f676a7c9413a`
- Rollback schema hash: `5c79c37c4d4b108ed2c5c7c73776e164d7b7798b06883d14569a0a243c5ef8a0`
- Reconciliation hash at baseline, both forward runs, and rollback: `6c68ff9091ee7248394b95f7102e4b10abab3f36afd6f239cd09c4e139fb9620`
- Final receipt schema: passed

The rehearsal migration was deliberately artificial: it added and then removed a `clover_rehearsal_marker` column and index in the disposable database. It was not a proposed production migration.

## Scope statement

No production database credential was accepted. No production database was connected, read, written, backed up, restored, branched, or migrated. No application source, production branch, production deployment, alias, domain, DNS record, secret, customer or waiver record, external message, purchase, or OpenAI Site was changed.

The artifact receipt explicitly reports `releaseState: not-authorized` and `productionEligible: false`.
