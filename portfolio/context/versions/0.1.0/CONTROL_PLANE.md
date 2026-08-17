# Clover Context Control Plane 0.1.0

## Goal

Let the owner begin with a compact instruction such as:

```text
Use CloverApps to evolve RollinD through a preview only.
```

The instruction should not require the owner to paste the Master Plan, project registry, build rules, data rules, prior decisions, completion percentages, or safety boundaries into every conversation.

## Architecture

Clover uses three distinct layers.

### 1. Canonical context

The public operating record in `chrisdortch/first` preserves versioned, non-secret information:

- Master Plan and current status;
- canonical project IDs and aliases;
- completion estimates and confidence;
- prioritized work;
- Build and Data Change Protocols;
- public receipts and rollback identities;
- AI handoff instructions.

This repository is authoritative for the public plan and operating rules. It is not the only backup of application source or private evidence.

### 2. Live refresh

Canonical context is not proof that a live system is unchanged. Before mutation, the executing AI must refresh the sources required by the command packet, such as:

- current repository branch and commit;
- open pull requests and issues;
- Vercel production and preview deployments;
- build and runtime errors;
- current domain/alias identity;
- backup and restore-test status;
- permitted Drive or evidence sources;
- current OpenAI Site identity and allowance when relevant.

The gateway marks missing or contradictory sources as unknown. It never fills gaps by guessing.

### 3. Execution

The gateway is read-only. It produces a bounded command packet and a compact execution prompt. ChatGPT, Codex, Work, CI, or another approved executor performs only the operations available to it and only within the packet boundaries.

The default flow is:

```text
owner voice or text
  → real-time transcript
  → Clover intent and project resolution
  → canonical context load
  → required live-source refresh
  → cost and authority classification
  → isolated preview work
  → deterministic checks
  → bounded model or browser review when warranted
  → owner release card
  → exact owner approval for irreversible action
  → receipt and progress update
```

## Command classes

Version 0.1 recognizes:

- plant or launch a new seed;
- evolve an existing project;
- diagnose errors or logs;
- inspect status and completion;
- back up a project or portfolio;
- restore-test a backup;
- review a preview;
- prepare a release candidate;
- prepare an OpenAI Site update;
- perform research.

Project aliases are resolved to canonical project IDs. Ambiguous project identity stops execution.

## Freshness rule

A live fact is current only when:

1. the executing thread reads the authoritative provider during the present task; or
2. it imports a still-valid receipt whose source identity and expiration can be verified.

Static context can identify what to inspect. It cannot replace current readback.

## Token-efficiency policy

Use the least expensive capable lane:

1. deterministic parsing, repository files, CI, logs, and provider APIs;
2. ordinary Chat Pro reasoning and connected tools;
3. bounded screenshot or diff review;
4. full browser control for authenticated or ambiguous visual work;
5. Codex, Work, or OpenAI Sites only for operations unavailable in the lower lanes.

Every useful model finding should become a durable test, rule, alias, project field, or receipt so it need not be rediscovered repeatedly.

## Voice and transcript

The interface may use the browser or host application's speech-to-text capability to display a live transcript. Transcription and command parsing are separate from execution. The owner can correct the transcript before submitting a command packet.

A transcript does not itself grant authority. The packet's explicit authority fields govern execution.

## Data boundaries

The public context gateway must not store:

- secret values or session cookies;
- customer, guest, or staff records;
- private legal evidence or communications;
- financial or health information;
- production database contents;
- private audio transcripts unless routed to an approved private store.

Private project context must be retrieved through permission-scoped connected sources or a future authenticated private Clover service.

## Completion and reporting

Every completed task should return:

- command ID;
- exact target and source baseline;
- live sources refreshed and their timestamps;
- cost lane used;
- branch, commit, preview, and changed files when applicable;
- checks attempted, passed, failed, or unavailable;
- known limitations;
- authority state;
- backup and rollback anchor;
- progress evidence and any proposed percentage change.

Passing checks are evidence, not release authority.

## Current limitation

Version 0.1 reads canonical repository context and prepares safe commands. It relies on the executing ChatGPT/Codex environment and its connected tools to refresh private GitHub repositories, Vercel observability, Drive, and other live sources. A standalone CloverApps website will need authenticated, read-only provider adapters before it can perform that refresh without ChatGPT orchestration.
