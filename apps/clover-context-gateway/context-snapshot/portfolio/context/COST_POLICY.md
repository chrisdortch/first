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

- local terminal or development environment access not exposed here;
- full authenticated browser/computer control;
- official OpenAI Site save or deployment;
- complex multi-file execution better suited to Codex;
- final deployment connection or custom app setup that cannot be completed with current tools.

A purchase request must identify the exact task, repository, baseline, expected artifact, stop condition, and estimated reason for the escalation. Do not ask the user to buy generic credits.

## Lane 4 — optional API-billed voice or agents

Reliable cross-browser realtime transcription and an independent always-on AI interface may use the OpenAI API and incur API charges. The first interface should use ChatGPT Voice, device dictation, or the browser Speech Recognition API where acceptable. API voice is an optional reliability upgrade, not a prerequisite.
