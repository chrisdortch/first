# Clover Cost and Token Policy 1.0

The objective is not zero intelligence. It is to spend intelligence only where it changes the result.

## Lane 0 — deterministic, no OpenAI inference

Use for repeatable operations:

- schema and registry validation;
- lint, typecheck, build, unit, integration, and browser tests;
- log collection and error clustering;
- project inventory and checksum generation;
- screenshot capture and contact-sheet generation;
- completion-percentage arithmetic;
- command-packet assembly from known context;
- backup packaging and restore verification.

This lane may use GitHub, Vercel, storage, or CI quotas, but it makes no OpenAI model call.

## Lane 1 — ordinary Chat Pro

Use for:

- architecture and prioritization;
- source-grounded reasoning;
- bounded repository changes through connected tools;
- interpreting receipts and logs;
- drafting changes and exact acceptance criteria;
- deciding which deterministic tests to add.

This uses ordinary ChatGPT plan/model usage. It is not a Work/Codex/Sites credit workaround for capabilities that remain gated.

## Lane 2 — bounded model vision or full browser

Use only for:

- novel design judgment;
- ambiguous visual failures;
- authenticated admin workflows;
- complex stateful interactions;
- final acceptance of an important release.

First present a compact contact sheet, receipt, changed route, and relevant diff. Do not feed the model the entire repository and every screenshot by default.

## Lane 3 — Work, Codex, or official Sites gate

Use only when the required capability is unavailable in ordinary Chat, such as:

- local terminal/development access not exposed in the current conversation;
- full authenticated browser/computer control;
- official OpenAI Site save or deployment;
- complex multi-file execution better suited to Codex;
- final hosted deployment or custom-app connection unavailable through current tools.

A purchase request must identify the exact task, repository, baseline, expected artifact, stop condition, and reason for escalation. Do not ask the owner to buy generic credits.

## Lane 4 — optional API-billed voice or agents

Reliable cross-browser realtime transcription and an independent always-on AI interface may use the OpenAI API and incur API charges. The first interface uses ChatGPT Voice, device dictation, or browser Speech Recognition where acceptable. API voice is an optional reliability upgrade, not a prerequisite.

## Context budget

Every model turn starts pointer-first and target-only:

1. master pointer and current status;
2. one target project record or new-seed context;
3. only the protocol sections needed for the intent;
4. compact live-source receipts;
5. detailed logs, traces, images, and source only after a concrete failure or ambiguity.

This is the principal token-saving mechanism.
