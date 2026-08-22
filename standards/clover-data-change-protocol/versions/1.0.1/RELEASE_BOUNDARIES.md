# Release Boundaries — Version 1.0.1 Candidate

Status: `security-hardening-candidate-unvalidated`

A successful 1.0.1 rehearsal means only that the exact candidate and exact protocol commits passed the recorded checks in a disposable PostgreSQL 16 service using the exact bound candidate seed SQL.

It additionally means candidate SQL executed through the recorded restricted rehearsal role rather than the service bootstrap superuser, and the static screen observed none of the prohibited procedural/dynamic forms. It does not turn that narrow disposable-database control into production authority.

It also means that the workflow observed no mutation of its bounded candidate, protocol, policy/SQL inputs, or pre-existing evidence across the measured phases. It does not mean project-controlled code was sandboxed. External effects from npm lifecycle and verification code remain `unknown`, and success does not prove that arbitrary same-user code made no external connection or side effect.

Seed-data provenance also remains `unknown`. The receipt binds seed SQL identity but does not attest that its literal records are synthetic, invented, or free of copied real data.

It does not authorize:

- reading, copying, changing, deleting, backing up, restoring, or migrating production data;
- accepting production database credentials;
- merging a branch or pull request;
- deploying or promoting any environment;
- changing domains, DNS, credentials, secrets, roles, or permissions;
- sending an external message, publishing, purchasing, or moving money;
- treating the candidate as the current validated protocol.

## Promotion gates

Promotion requires all of the following as new, reviewable evidence:

1. the standard workflow passes on the exact candidate HEAD;
2. its run identifier and exact commit are recorded without rewriting version 1.0.0;
3. a disposable project pilot using 1.0.1 passes and is separately recorded;
4. the owner explicitly approves promotion;
5. the promotion itself is a new identified repository state.

Production access remains a separate owner-approval gate even after protocol promotion.
