# Clover Build Protocol 1.2.0 candidate

Status: `candidate-unvalidated-awaiting-exact-head-ci`

Version 1.2.0 is an additive security-hardening candidate. Version 1.1.0 remains the current validated protocol until a separate exact-head validation and owner-controlled promotion records otherwise.

## Trust sequence

1. Check out the candidate commit exactly.
2. Check out the protocol from `job.workflow_repository` at `job.workflow_sha`, binding runtime and enrollment to the exact reusable-workflow commit selected by the caller's `uses@SHA`.
3. Install only pinned protocol validation tooling.
4. Validate the central enrollment and project policy schemas before any project command.
5. Bind the policy's raw-byte SHA-256, project identity, baseline commit/tree, and production anchor to the enrollment record stored in the pinned protocol checkout.
6. Verify branch and changed-path boundaries from the enrollment baseline.
7. Snapshot candidate HEAD, Git tree, tracked working-tree bytes, policy bytes, and tracked status.
8. Execute only schema-approved executable/argv records with `shell: false`.
9. Compare source state after every project-command group and after the browser audit.
10. Emit a receipt containing observed evidence and explicit unknowns, never unsupported negative-attempt claims.

## Authority boundary

A passing candidate run authorizes no merge, production deployment, production-data mutation, domain or DNS change, credential change, external message, or purchase. Project policy, enrollment, and receipts all encode this boundary, but owner approval remains the authority.

## Enrollment is the identity root

The candidate repository may describe itself, but it cannot enroll itself. The authoritative policy hash and source anchors live in a central enrollment record in an exact pinned protocol commit. Changing policy bytes, baseline identity, or enrollment path requires a new central enrollment commit and a separately reviewed caller pin.
