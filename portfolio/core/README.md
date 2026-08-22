# Clover Core Candidate Architecture 0.1

Status: **preview-only architecture candidate; Clover Constitution 0.1 ratified**
Prepared: August 18, 2026 · America/Chicago  
Canonical rollback anchor: `be62b3d8dfb07eecb52628f1b629fd308eb3cb24`  
Command packet: `clover-575ec419516e5b1e`

This candidate does not authorize a merge, production deployment, production-data access, secret access, disclosure, external communication, purchase, domain change, or change to any existing application or OpenAI Site.

## The architectural correction

Clover Core should be a **governed kernel**, not a warehouse that absorbs every source and secret.

The system should provide one coherent intelligence experience while preserving source sovereignty:

- **Clover Kernel** governs identity, provenance, time, policy, authority, priorities, approvals, and receipts.
- **Clover Cells** keep raw domain data inside the system that is responsible for it: WarRoom for legal evidence, finance systems for transactions, health systems for health data, project runtimes for customer and operational data, and a dedicated encrypted secret service for credential values.
- **Knowledge Hub / Window / Vault** is Core's ingest, retrieval, preservation, projection, and secure-reference subsystem. It is not a second competing Core.
- **Context Compiler** assembles a small, task-specific, expiring capsule from approved sources. It supplies only the minimum context needed for the current question or action.
- **CloverApps.ai** is the owner-facing control and portfolio window.
- **WarRoom** is the legal-private Cell and legal window.
- Existing applications remain independent runtimes. They publish only approved projections and receipts to Core.

The revised maxim is:

> One governed intelligence, many sovereign stores, minimum necessary context.

This is safer, cheaper, easier to restore, less confusing to models, and substantially less likely to contaminate one project with another project's data or authority.

## The five planes

### 1. Source plane

Gmail, Drive, GitHub, Vercel, OpenAI Sites, databases, financial accounts, health systems, voice notes, scans, and application stores remain authoritative for their own records.

Core records source identity, freshness, coverage, checksums, and retrieval paths. It does not claim a source was checked when it was not.

### 2. Truth plane

The append-only Event Ledger records observations, proposed assertions, corrections, disputes, decisions, approvals, actions, verifications, failures, and rollbacks.

Current state is a rebuildable projection over events. Earlier beliefs are preserved rather than silently overwritten.

### 3. Meaning plane

Typed objects and effective-dated relationships represent people, organizations, projects, properties, cases, documents, deployments, commitments, deadlines, ideas, decisions, risks, and opportunities.

Every material claim retains:

- source or owner attribution;
- observation and effective time;
- truth status;
- confidence and freshness;
- sensitivity and disclosure class;
- supersession or dispute history.

### 4. Intent and action plane

Goals, priorities, dependencies, approval requirements, capability limits, spend limits, owner-attention cost, rollback anchors, and execution receipts live here.

Knowledge does not imply authority. Authority is granted only through a narrow, expiring Action Envelope.

### 5. Experience plane

Clover Today, CloverApps, WarRoom, Knowledge Window, project views, and future OpenAI Sites are replaceable interfaces over the governed system. No interface is the only copy.

## Two separate operating loops

### Truth Loop — active first

1. Observe an approved source.
2. Record the source identity and freshness.
3. Extract candidate assertions.
4. label each assertion as source fact, owner assertion, AI inference, disputed, superseded, or unknown.
5. Verify material claims independently when possible.
6. Publish a minimized projection to the permitted audience.
7. Rebuild the Today view and daily log from the ledger.

The Truth Loop is read-only with respect to source systems. It can operate today through the current Clover Context Gateway and connected read tools.

### Action Loop — locked by default

1. Convert an accepted recommendation into an Action Envelope.
2. Bind exact target resources, environment, operations, cost, duration, data classes, rollback anchor, and expiration.
3. Obtain every required version-bound approval and atomically consume its persistent challenge.
4. Recheck expiry and the authoritative target version immediately before execution; use a native conditional write when the closed handler supports it.
5. Execute through the least-privileged tool.
6. Independently read back the exact result.
7. Append a receipt from persisted, phase-valid state-machine history, including failures and partial completion.
8. Consume or revoke the envelope so it cannot silently become standing authority.

Production, secrets, disclosure, money movement, external messages, domain changes, and private-data movement are always explicit gates.

## The Memory Promotion Ladder

Continuous learning must not mean silent self-modification.

| Level | Meaning | Persistence | Required promotion |
|---|---|---|---|
| L0 | Ephemeral model interpretation | Current task only | None |
| L1 | Candidate assertion or relationship | Event Ledger as unverified | Source or owner review |
| L2 | Verified knowledge | Effective-dated projection | Supporting provenance |
| L3 | Adopted decision or workflow rule | Decision ledger | Exact owner approval when material |
| L4 | Constitutional rule | Versioned Constitution | Explicit owner ratification |

A lower level may inform a proposal but may never silently promote itself.

## Clover Cells

A Cell is a bounded domain with its own data, retention, security, and disclosure policy.

Initial Cells should include:

- **Public Portfolio Cell** — plans, public project metadata, sanitized receipts.
- **Project Runtime Cells** — each application and its operational data.
- **WarRoom Cell** — raw legal evidence, strategy, deadlines, privilege-candidate and litigation-hold controls.
- **Financial Cell** — connected financial records and minimized planning projections.
- **Health Cell** — connected health records and minimized wellness projections.
- **Family / Personal Cell** — private personal material with explicit sharing rules.
- **Vault Cell** — encrypted secret values and recovery material.
- **Source Archive Cell** — immutable originals and restore evidence.

Cross-Cell movement uses a Knowledge Projection: purpose-bound, minimized, time-limited, attributable, and revocable where feasible.

### Secret reveal correction

Core should know that a secret exists and where it is governed, but the model should not receive plaintext by default.

When the owner asks, for example, “What is my Gmail password?”, the model may initiate an owner-authenticated reveal request. A dedicated reveal broker should display the plaintext directly in a protected owner UI after strong reauthentication. The value should not be written into prompts, model logs, ordinary event payloads, analytics, or the public repository.

This still gives the owner direct retrieval while sharply reducing unnecessary exposure.

## Context Compiler

The Context Compiler is the central efficiency and safety mechanism.

For each request it creates an expiring Context Capsule containing only:

- the exact question and target;
- current applicable constitutional and project policies;
- verified assertions and clearly marked unknowns;
- source pointers and freshness;
- recent relevant decisions;
- current authority boundaries;
- deliberately omitted classes;
- a token and cost budget;
- an expiration time.

Capsules are model-independent. ChatGPT, Codex, or another permitted model can reason over the same bounded evidence without becoming the system of record.

## Self-improvement pipeline

Clover may continually improve itself, but only through a governed evolution loop:

> Detect gap → propose capability → create isolated candidate → run deterministic and bounded model evaluation → compare against acceptance criteria → owner review when required → promote exact version → monitor → rollback if necessary.

The system may autonomously prepare plans, schemas, tests, branches, fixtures, previews, and receipts within an approved envelope. It may not silently widen permissions, move private data, alter the Constitution, increase spend, merge, deploy production, or rewrite its own acceptance criteria.

## Attention Budget

Owner attention is a scarce resource and should be treated as a first-class cost.

Clover Today should normally present:

1. the single most important item;
2. at most two additional material items;
3. only decisions the system cannot safely resolve itself.

Recommendations should expose the factors that drove priority:

- deadline pressure;
- irreversible harm avoided;
- legal, safety, or operational risk;
- near-term cash effect;
- strategic compounding value;
- dependency release;
- confidence and freshness;
- money cost;
- owner time and cognitive load;
- reversibility.

Weights remain owner-adjustable. The system must show why an item rose or fell rather than hiding priority behind an opaque score.

## Daily operating rhythm

### Morning

Ask: **What should I know?**

Clover refreshes permitted sources, identifies material changes, and returns one concise brief.

### Decision

Ask: **Why?** and **What do you recommend?**

Clover shows evidence, uncertainty, consequences, and the smallest high-value next step.

### Execution

Ask: **Do the safe parts.**

Clover performs only actions allowed by the current envelope, normally read, organize, draft, test, branch, preview, and verify. It stops at the next genuine owner gate.

### Closeout

Ask: **What happened?**

Clover returns a receipt and projects the event stream into the human-readable daily log.

The daily log is therefore a readable view of the Event Ledger, not a competing source of truth.

## Usable-today boundary

Today the connected Clover Context Gateway can:

- resolve the target project;
- retrieve canonical public context;
- prepare bounded commands;
- expose source-refresh plans;
- support voice or typed instructions;
- render the Command Center;
- keep production authority off.

Today it must not:

- access or reveal private secrets;
- ingest raw legal, financial, health, guest, staff, or family data into the public repository;
- write production data;
- merge or deploy production;
- change any OpenAI Site, domain, credential, or external system;
- claim continuous monitoring when no recorded monitor is running.

The candidate Today surface adds the five-question operating loop without changing those boundaries.

## Acceptance gates for the next increment

The next increment is accepted only when:

1. the candidate branch and pull request remain isolated from `main`;
2. every new schema and JSONL record passes deterministic validation;
3. no secret-pattern or private-data boundary violation is detected;
4. the Today surface works on desktop and representative mobile widths;
5. the existing command preparation and MCP tests still pass on Node 22 and Node 24;
6. the exact preview deployment is READY, has no production target or custom domain, and is independently read back;
7. the original rollback anchor remains available;
8. no mission or project percentage is changed without milestone evidence;
9. the ratification pointer and receipt match the exact approved Constitution 0.1 hash, and later amendments preserve version 0.1.

## Next safe milestone

Constitution 0.1 is ratified. Next, implement the first private restore-tested ingest Cell using one low-risk, non-secret source. The first proof must demonstrate immutable ingest, provenance, projection, portable export, clean-room restoration, deletion/retention behavior, and a task-specific Context Capsule without changing any production application.
