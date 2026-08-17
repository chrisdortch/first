# Clover Build Protocol Roadmap

## Current milestone: 1.1.0

- Central reusable workflow and schemas.
- Registry validation.
- Third-project portability proof.
- No production release authority.

## Next candidate: 1.2.0

- Durable evidence storage outside expiring CI artifacts.
- Approved visual-baseline promotion rules.
- Automatic Clover Vault receipts.
- Reusable workflow caching and compute-budget measurement.
- Low-risk enrollment of Poolside Pulse, Lifeguards, and other public read-mostly projects.

## Separate protocol required before sensitive rollout

Clover Data Change Protocol v1 must exist before preview or release workflows may write to a database, object store, payment system, waiver record, reservation record, legal-evidence repository, or customer account.

It must include disposable test data, backup evidence, forward and corrective migrations, reconciliation, separate owner approval, and post-change verification.

## Long-term control plane

CloverApps should display protocol version, production commit, preview candidate, deterministic status, model-review state, backup state, data-backup state, owner decisions, and rollback anchors. Tests passing must never be treated as publication approval.
