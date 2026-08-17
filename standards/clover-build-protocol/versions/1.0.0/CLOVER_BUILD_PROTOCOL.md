# Clover Build Protocol 1.0.0

Status: **pilot-current**  
Preserved: **August 16, 2026, America/Chicago**

## Mission

Create software at a high professional level while minimizing avoidable model inference, protecting existing projects, preserving evidence, and reserving irreversible authority for the owner.

## Governing principle

> Use deterministic systems for repetition and certainty, models for interpretation and invention, and the owner for irreversible authority.

## Stage model

### Stage 0 — Identify and bound

Before changing code:

- identify the exact repository, project, production branch, deployment, domains, and writable resources;
- inspect current source and deployment rather than relying on a previous summary;
- classify risk and side effects;
- establish the candidate base commit and production anchor;
- state forbidden actions and required approvals;
- choose an isolated branch or non-public preview.

If identity or boundaries cannot be verified, stop before mutation.

### Stage 1 — Create the smallest reversible candidate

- modify only the named project;
- avoid cross-project secrets, data, domains, and infrastructure;
- preserve existing behavior outside the approved objective;
- use deterministic fixtures rather than production data where practical;
- keep changes reviewable and rollback-ready.

### Stage 2 — Deterministic source gate

Run the project's applicable fixed checks, including:

- locked dependency installation;
- formatting and linting;
- type checking;
- production build;
- static-reference and checksum integrity;
- unit and integration tests;
- database migration safety checks when applicable;
- dependency or security checks appropriate to the project's risk class.

A failed required check blocks advancement.

### Stage 3 — Deterministic interaction and browser gate

Run known user journeys in at least desktop Chromium and mobile WebKit when applicable.

Collect mechanically:

- route and HTTP status;
- console and uncaught page errors;
- first-party request and response failures;
- required selectors and expected states;
- visible broken images;
- horizontal overflow;
- duplicate IDs and unlabeled visible controls;
- structural landmarks and headings;
- mobile touch-target advisories;
- bounded CSS-scale screenshots;
- commit-addressed receipts.

Tests must not submit real forms, send messages, make purchases, mutate production, or use owner credentials unless a separately approved, controlled test explicitly requires it.

### Stage 4 — Evidence compression

Produce a compact review packet before invoking a model:

- one machine-readable summary;
- one visual contact sheet;
- no more than the small set of highest-value screenshots on the first pass;
- exact failing route, browser, assertion, and commit;
- traces, videos, full-page screenshots, and logs only for concrete failures.

### Stage 5 — Selective AI review

Use AI reasoning or full browser control when one or more of these conditions holds:

- the interface or interaction is new or materially redesigned;
- deterministic checks reveal a novel or ambiguous failure;
- visual hierarchy, clarity, beauty, tone, meaning, or product positioning requires judgment;
- an authenticated owner-only flow cannot be represented safely by a fixed fixture;
- the owner requests final acceptance review;
- the risk class warrants an independent reasoning pass.

Do not use a high-capability model merely to repeat stable assertions already covered by deterministic checks.

### Stage 6 — Owner acceptance

Present:

- exact candidate commit and branch;
- changed-file inventory;
- deterministic results;
- model findings, if any;
- preview or evidence links;
- remaining uncertainty;
- exact proposed release action and rollback plan.

A passing gate makes a candidate reviewable. It does not authorize production.

### Stage 7 — Release and verify

Only after explicit owner authorization:

- merge or promote the exact accepted commit;
- verify the resulting production identity;
- run bounded post-release smoke checks;
- confirm domains, data, payments, and messaging remain correct;
- record release and rollback evidence.

## Fail-closed rules

Stop and report when:

- the repository, branch, deployment, or project identity is uncertain;
- a changed file falls outside the approved scope;
- a required deterministic check fails;
- a test would need uncontrolled production credentials or side effects;
- the candidate commit differs from the reviewed commit;
- a deployment or domain target cannot be read back;
- evidence is missing, stale, or tied to another commit.

## Learning rule

When AI review identifies a reproducible defect, encode it as a test, policy, fixture, budget, or documented exception when practical. The system should become less dependent on repeated model rediscovery over time.

## Non-authority statement

This specification does not authorize any merge, deployment, production mutation, purchase, communication, credential change, or expansion of public access.
