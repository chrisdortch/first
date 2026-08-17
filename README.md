# Clover Knowledge, Portfolio, and Operating Standards

This repository preserves the canonical master plan, current progress status, project registry, versioned build/data protocols, AI handoffs, and operating standards for the CloverApps portfolio.

Start with [`AI_START_HERE.md`](AI_START_HERE.md).

## Master plan and status

- Pointer: [`CLOVER_MASTER_PLAN_POINTER.json`](CLOVER_MASTER_PLAN_POINTER.json)
- Current status: [`portfolio/status/current.json`](portfolio/status/current.json)
- Master plan: [`portfolio/master-plan/CURRENT.md`](portfolio/master-plan/CURRENT.md)
- Project registry: [`portfolio/registry/projects.json`](portfolio/registry/projects.json)
- Prioritized work: [`portfolio/NEXT.md`](portfolio/NEXT.md)
- Progress method: [`portfolio/PROGRESS_METHODOLOGY.md`](portfolio/PROGRESS_METHODOLOGY.md)

## Current standards

**Clover Build Protocol 1.1.0** governs isolated source changes, deterministic validation, bounded visual review, previews, and owner-controlled release.

- Pointer: [`CLOVER_BUILD_PROTOCOL_POINTER.json`](CLOVER_BUILD_PROTOCOL_POINTER.json)
- Protocol: [`standards/clover-build-protocol/CURRENT.md`](standards/clover-build-protocol/CURRENT.md)
- Registry: [`standards/clover-build-protocol/registry/projects.json`](standards/clover-build-protocol/registry/projects.json)

**Clover Data Change Protocol 1.0.0** governs schema and persisted-data changes. Its default automation uses disposable PostgreSQL with synthetic records and refuses production database credentials.

- Pointer: [`CLOVER_DATA_CHANGE_PROTOCOL_POINTER.json`](CLOVER_DATA_CHANGE_PROTOCOL_POINTER.json)
- Protocol: [`standards/clover-data-change-protocol/CURRENT.md`](standards/clover-data-change-protocol/CURRENT.md)
- Registry: [`standards/clover-data-change-protocol/registry/projects.json`](standards/clover-data-change-protocol/registry/projects.json)

Passing a protocol is evidence, not authority to merge, deploy, migrate production data, change credentials, purchase services, or communicate externally.

This public repository must not contain secret values, customer records, private legal evidence, private communications, financial records, health records, or production credentials.
