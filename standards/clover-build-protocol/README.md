# Clover Build Protocol

Clover Build Protocol is a versioned, deterministic-first development and release-governance system for the CloverApps portfolio.

## Operating model

```text
Exact project identity
→ isolated candidate branch
→ changed-file and authority boundary
→ deterministic source/build tests
→ desktop and mobile browser checks
→ compact receipt and visual packet
→ model review only when useful
→ owner review
→ separately authorized release
→ production verification
→ durable receipt and rollback anchor
```

## Current version

See [`CURRENT.md`](CURRENT.md). Numbered versions are immutable historical records. The central reusable workflow is pinned by commit from each project, so a future central change cannot silently alter an existing candidate run.

Version 1.2.0 is an unvalidated hardening candidate. Its enrolled identity model moves authoritative policy hashes and source anchors out of the candidate repository, and its runtime measures source state around every project command. Version 1.1.0 remains current until exact-head CI and a separate promotion decision.

## Safety rule

Use deterministic systems for repetition and certainty, models for interpretation and invention, and the owner for irreversible authority.

A passing workflow never authorizes merge, production deployment, alias/domain changes, credentials, purchases, messages, or production-data writes.
