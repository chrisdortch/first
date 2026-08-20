# Security model — 1.2.0 candidate

## Closed execution grammar

Project commands are JSON objects with a package-manager executable and an argv array. Shell executables, path-qualified executables, control characters, and shell metacharacters are rejected. Runtime execution uses `spawn(executable, args, { shell: false })`. This closes the 1.1 path in which project policy strings were passed to `bash -lc`.

Package-manager scripts remain project code and therefore remain untrusted. They run only after schema, enrollment, ancestry, path, and authority checks pass. Their local effects are measured by source snapshots; external-provider effects remain `unknown` unless a future provider-specific observer supplies readback evidence.

Version 1.2 is not an adversarial-code sandbox. Project scripts still run as the hosted-runner user and can attempt network access, daemonization, transient mutate-and-restore behavior, or runner-directory discovery. The workflow separates candidate/protocol/evidence paths, strips the child environment, terminates the observed process group, hashes source/protocol/tooling state, seals evidence hashes in step outputs, and restores the exact protocol after every project phase; these controls improve CI evidence but do not prove safety against deliberately malicious candidate code. Such code requires a separately designed sandboxed execution protocol.

## State evidence

A source snapshot binds:

- exact HEAD commit and committed tree;
- a deterministic SHA-256 over every tracked path, mode, index object, observed filesystem type, and observed bytes;
- raw project-policy SHA-256;
- porcelain status and tracked changed paths.

Any HEAD, committed-tree, tracked-byte, or policy-byte change during a project-command group or browser audit fails that step. Untracked build output is not represented as a tracked-tree mutation and remains bounded by the isolated ephemeral runner.

The protocol checkout does not trust an input supplied by the candidate caller. GitHub's called-job identity supplies `job.workflow_repository` and `job.workflow_sha`; the workflow checks out its co-located runtime and enrollment at that exact SHA.

## Evidence semantics

Receipts distinguish `observed`, `not-observed`, and `unknown`. `not-observed` requires a named local measurement and before/after evidence. Lack of provider telemetry is `unknown`; it is never rewritten as `Attempted: false`.

## Promotion rule

Candidate code and candidate-local tests are not promotion proof. Promotion requires exact-head CI on the proposed commit, immutable evidence identifying that commit and run, review of the central enrollment model, and a separate pointer change. Until then, 1.1.0 remains current.
