# Security Hardening — Version 1.0.1 Candidate

Status: `security-hardening-candidate-unvalidated`

## Production-anchor binding

The boundary runtime requires `source.baselineCommit` to equal `source.productionCommitAtEnrollment`, resolves `origin/<productionBranch>^{commit}` from the exact candidate checkout, and compares all three identities. It also requires that baseline to be an ancestor of the candidate. A missing remote-tracking reference, malformed commit, missing commit object, stale candidate base, or mismatch fails the rehearsal. The receipt records both enrollment and observed commits.

The comparison binds to the checkout-time remote-tracking state supplied by the CI checkout. It does not claim a continuously live lock on the production branch and grants no merge or deployment authority.

## Protocol-commit binding

The policy's `protocol.commit`, GitHub's immutable reusable-workflow SHA, and both observed protocol checkouts must identify the same 40-character commit. The caller cannot substitute a separate `protocol_ref` input. The receipt records the expected and observed protocol commits.

## Same-user runner integrity

The candidate checkout, working protocol checkout, independent control checkout, and evidence directory use separate roots; evidence is stored under `runner.temp`. Before and after every project-controlled npm phase, version 1.0.1 hashes and compares the exact candidate HEAD and tree, every tracked worktree byte/mode/index object, tracked status, policy and SQL inputs, the exact protocol HEAD and tracked bytes, installed protocol tooling, and pre-existing evidence. Command receipt and log hashes are emitted by the trusted wrapper after the child closes, then bound into the integrity record and final receipt. A fresh exact control checkout performs the post-command measurement before the working protocol is restored.

The project child receives a reduced environment that omits Clover paths, GitHub output files, database URLs, and repository credentials. Commands run with `shell: false`, a timeout, and process-group cleanup. The exact protocol and pinned tooling are restored before each later trusted phase.

This is not a hostile-code sandbox. Project-controlled package lifecycle and test code still shares a hosted runner user and general network namespace. Same-user code can attempt filesystem discovery, detached processes, or external network effects that the workflow cannot fully observe. Consequently the receipt records `projectCommandExternalEffects.state` as `unknown`. It states only that the workflow supplied no production credentials and granted no production authority; it does not claim observed absence of every external connection, read, or write.

## Seed-data provenance

The workflow binds the configured seed SQL path, byte length, and SHA-256. Those measurements prove which bytes ran; they do not establish where literal values came from or whether they are synthetic. Candidate-controlled seed SQL can contain arbitrary accepted literals. Version 1.0.1 therefore records seed-data provenance as `unknown` and does not make a synthetic-only claim. Server-file SQL functions such as `pg_read_file`, `pg_read_binary_file`, `pg_ls_dir`, `pg_stat_file`, `lo_import`, and `lo_export` are separately rejected, but that screening still cannot classify literal data provenance.

## SQL path integrity

Every configured SQL path must be relative to the repository. Version 1.0.1 applies lexical containment, `lstat` checks to every path segment, realpath containment, and a regular-file check. A symbolic-link file, a symbolic-link directory, an escape outside the repository, or a non-file target fails before `psql` runs.

## psql meta-command rejection

psql can interpret backslash commands even when they appear after SQL on the same line. Rather than use a line-prefix heuristic, version 1.0.1 rejects every backslash byte in all baseline, seed, forward, assertion, reconciliation, rollback, and post-rollback SQL artifacts. This intentionally rejects some otherwise valid PostgreSQL escape syntax; candidate authors must express equivalent SQL without backslashes.

Examples rejected include `\\!`, `\\include`, `\\connect`, and inline `\\gexec`.

## Restricted database role and procedural SQL

The PostgreSQL service bootstrap account is used only by the trusted setup step. Candidate SQL connects as the dedicated `clover_rehearsal` role, created with `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, `NOREPLICATION`, and `NOBYPASSRLS`, with no role memberships. Before any candidate SQL executes, the runtime queries `pg_roles` and `pg_auth_members` through that same connection and fails unless every restricted capability and membership observation matches the receipt contract.

SQL screening strips line and nested block comments while masking quoted and dollar-quoted values, then rejects `DO`, function/procedure creation or alteration, procedural languages, dynamic `EXECUTE`/`PREPARE`/`CALL`, security-definer clauses, triggers/rules, role or session-authorization switching, and server-file functions. Comment splicing does not bypass the normalized screen. This is deliberately restrictive and complements rather than replaces the database role boundary.

## Preserved boundaries

The lane still supplies no production credentials and grants no production reads or writes, backups or restores, migrations, merges, production deployment, DNS or secret changes, external messages, or purchases. All authority fields remain exactly false.
