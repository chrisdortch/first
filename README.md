# Clover Knowledge and Operating Standards

This repository preserves versioned instructions, project registries, AI handoffs, and operating standards for the CloverApps portfolio.

Start with [`AI_START_HERE.md`](AI_START_HERE.md).

## Current standards

**Clover Build Protocol 1.1.0** governs isolated source changes, deterministic validation, bounded visual review, previews, and owner-controlled release.

- Pointer: [`CLOVER_BUILD_PROTOCOL_POINTER.json`](CLOVER_BUILD_PROTOCOL_POINTER.json)
- Protocol: [`standards/clover-build-protocol/CURRENT.md`](standards/clover-build-protocol/CURRENT.md)
- Registry: [`standards/clover-build-protocol/registry/projects.json`](standards/clover-build-protocol/registry/projects.json)

**Clover Data Change Protocol 1.0.0** is disposable-pilot-validated and governs schema and persisted-data changes. Its default automation uses a disposable PostgreSQL service with synthetic records and refuses production database credentials.

- Pointer: [`CLOVER_DATA_CHANGE_PROTOCOL_POINTER.json`](CLOVER_DATA_CHANGE_PROTOCOL_POINTER.json)
- Protocol: [`standards/clover-data-change-protocol/CURRENT.md`](standards/clover-data-change-protocol/CURRENT.md)
- Registry: [`standards/clover-data-change-protocol/registry/projects.json`](standards/clover-data-change-protocol/registry/projects.json)

Passing either protocol is evidence, not authority to merge, deploy, migrate production data, change credentials, or communicate externally.

This repository must not contain secret values, customer records, private legal evidence, private communications, financial records, or production credentials.
