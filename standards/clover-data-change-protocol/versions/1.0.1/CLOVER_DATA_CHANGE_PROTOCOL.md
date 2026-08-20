# Clover Data Change Protocol 1.0.1 Candidate

Status: `security-hardening-candidate-unvalidated`

Version 1.0.1 is an additive security-hardening candidate for the disposable-database lane. Version 1.0.0 remains the current validated protocol and is preserved byte-for-byte.

## Mission

Permit repeatable migration rehearsals against a local PostgreSQL 16 service with candidate-provided seed SQL while failing closed on ambiguous source state, executable psql input, and filesystem indirection. Bind the seed bytes without claiming unverified data provenance or synthetic classification.

## Required sequence

1. Validate the project policy against the 1.0.1 schema before running project-controlled commands.
2. Bind the policy's protocol commit to the immutable reusable-workflow commit exposed by GitHub, not to a caller-supplied protocol input, and check out an independent control copy of that commit.
3. Require the baseline commit to equal `productionCommitAtEnrollment`.
4. Resolve `origin/<productionBranch>` to an exact commit, require it to equal that enrollment commit, and require the baseline to be an ancestor of the exact candidate commit.
5. Restrict candidate paths, branch prefixes, environment variables, capabilities, and all authority flags.
6. Put candidate, protocol, independent control, and evidence in separate roots; keep evidence outside the candidate checkout.
7. Run only the closed project command grammar (`npm ci`, `npm test`, or `npm run <safe-script-name>`) with `shell: false`, a reduced environment, a timeout, and process-group cleanup.
8. Before and immediately after each project-controlled phase, compare the exact candidate commit and tracked bytes, policy and SQL input hashes, protocol tracked bytes and installed tooling, and all pre-existing evidence. Bind allowed new command receipts and logs to immutable step-output hashes.
9. Restore the exact protocol commit and pinned tooling after each project-controlled phase before continuing.
10. Resolve every SQL path inside the repository, reject every symbolic-link path segment, and confirm realpath containment.
11. Reject every backslash byte in candidate SQL so psql meta-commands cannot reach `psql`.
12. Create a disposable local database, load the exact bound candidate seed SQL, and run baseline, forward, assertions, idempotency, rollback, schema-equivalence, namespace, and reconciliation checks. Record seed-data provenance as unknown unless a separate provenance mechanism is introduced.
13. Produce and schema-validate a receipt binding workflow outcomes, exact source identities, integrity observations, and SHA-256 identities for every gate artifact.
14. Recheck the receipt and every bound artifact, then stop before production access, release, merge, or deployment.

## Runner security model

The GitHub-hosted same-user runner is an integrity-observation boundary, not a hostile-code sandbox. Project-controlled npm lifecycle and test code can use the runner's general network and filesystem capabilities. The workflow supplies no production credentials, removes Clover paths and GitHub output files from the child environment, terminates the observed process group, and fails when it observes candidate, protocol, input, or evidence mutation. It cannot prove that arbitrary project code had no external effects, especially if code evades same-user observation. Receipts therefore record project-command external effects as `unknown`; they do not claim that no production read, write, or connection occurred.

The seed SQL path and SHA-256 are evidence of exact content identity, not provenance. Because candidate authors control SQL and literal values, version 1.0.1 cannot determine whether records were invented, transformed, or copied from another source. It records `seedDataProvenance.state` as `unknown` and makes no synthetic-data attestation.

## Candidate state

Local tests do not promote this candidate. It remains unvalidated until the standard workflow passes on its exact repository HEAD and a separately reviewed promotion record identifies that run and commit. A disposable project pilot is a separate gate.

## Governing principle

Treat a migration rehearsal as evidence about a bounded disposable environment and exact inputs, never as proof of seed provenance or authority over a production database or release.
