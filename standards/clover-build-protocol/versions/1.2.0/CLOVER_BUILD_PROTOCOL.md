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
10. Emit a receipt only after the exact complete check set, all workflow outcomes, core receipts/logs/contact sheets, and every browser screenshot have matched their sealed hashes.
11. Validate the receipt schema, then independently rehash the receipt and every artifact from a fresh exact protocol control checkout.

## Authority boundary

A passing candidate run authorizes no merge, production deployment, production-data mutation, domain or DNS change, credential change, external message, or purchase. Project policy, enrollment, and receipts all encode this boundary, but owner approval remains the authority.

`status: passed` is structurally unavailable to an empty or partial receipt. Candidate schemas require all 37 named checks in protocol order, 13 core artifact records, and at least one sealed browser screenshot; the runtime applies the same contract before emission and again after schema validation.

## Enrollment is the identity root

The candidate repository may describe itself, but it cannot enroll itself. The authoritative policy hash and source anchors live in a central enrollment record in an exact pinned protocol commit. Changing policy bytes, baseline identity, or enrollment path requires a new central enrollment commit and a separately reviewed caller pin.
