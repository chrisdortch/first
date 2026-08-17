# Schemas and receipts

Version 1.1.0 formalizes the interfaces between CloverApps, repositories, CI, models, and owner review.

## Schemas

- Project policy: exact identity, commands, routes, budgets, allowed files, forbidden capabilities, and false production-authority flags.
- Project registry: enrolled projects, exact verification identities, evidence, backup state, and authority.
- Build packet: one objective, exact baseline, bounded scope, acceptance tests, cost ceilings, and expiration.
- Build receipt: exact source, checks, browser result, artifacts, safety statement, and `not-authorized` release state.
- Visual baseline: only an owner-approved baseline may become authoritative.

## Evidence economy

The first model review packet should contain only:

1. the contact sheet;
2. the final receipt;
3. the changed route or failed screenshot;
4. the relevant source diff.

Traces, videos, full-page screenshots, complete logs, and the full repository are opened only to diagnose a specific issue.
