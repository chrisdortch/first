# Clover Context and Command Control Plane 0.2

## Goal

The owner should be able to say:

> Use CloverApps to evolve SongAndStage toward the strongest show-night experience.

without repasting project history or the master plan.

The control plane must then:

1. resolve the intended project or show a visible unresolved/ambiguous state;
2. bind the request to the current Master Plan, status, project registry, and applicable protocols;
3. fetch only the target project and policies needed for that intent;
4. refresh live repository, deployment, logs, errors, backup, data, Site, and analytics facts through the supported native connectors;
5. assign the lowest adequate cost lane;
6. prepare a non-authorizing command packet;
7. perform supported reversible preview work;
8. return exact evidence and receipts;
9. update percentages only when evidence changes state.

## One brain, many representations

The public canonical repository stores portable plans, policies, project metadata, source identities, sanitized receipts, and history. CloverApps, WarRoom, the command center, and future OpenAI Sites are interfaces over that record; none is allowed to become the only copy.

Private legal, guest, staff, financial, health, credential, and production-data context belongs in authenticated private systems. It is referenced through minimized source identities and receipts, not copied into this public repository.

## Components

### Canonical repository

`chrisdortch/first` is the portable public source for:

- the Master Plan and current weighted status;
- canonical project IDs, goals, priorities, confidence, and next milestones;
- Build, Data Change, backup, freshness, and cost policies;
- append-only decisions and progress history;
- public/sanitized receipts and source identities.

### Clover Context Gateway

`apps/clover-context-gateway` is a remote read-only MCP app and standalone command interface.

It exposes:

- standard `search` and `fetch` tools;
- `prepare_clover_command`;
- `render_clover_command_center`;
- `/api/context`, `/api/search`, `/api/fetch`, and `/api/prepare-command` for CloverApps integration;
- optional browser speech recognition with device dictation and ChatGPT Voice fallbacks.

The gateway supplies context and routing. It does not contain write authority.

### Live adapters

The gateway does not attempt to copy all current logs, traffic, deployments, and private evidence into one stale database. Instead, every command packet includes a source plan from `LIVE_ADAPTER_REGISTRY.json`.

Examples:

- GitHub — repositories, branches, commits, pull requests, Actions, issues;
- Vercel — deployments, build/runtime logs, grouped runtime errors, comments, supported observability;
- Google Drive — exact approved source documents and Vault receipts;
- official OpenAI Sites editor — exact Site identity and saved/deployed versions;
- database/storage providers — engine/schema/backup identity under the Data Change Protocol;
- analytics providers — traffic only when a verified supported provider exists;
- web — current primary or authoritative external research.

A fact that cannot be refreshed is `unknown`, not inferred.

### Execution surfaces

- Ordinary Chat Pro handles reasoning and bounded work through available native connectors.
- GitHub Actions and browser/data test runners handle repeatable deterministic checks without OpenAI model calls.
- Full browser/Codex/Work is an escalation for novel visual judgment, authenticated UI, or execution not exposed in ordinary Chat.
- OpenAI Sites remains the official authenticated save/deploy gate for Sites.

### CloverApps interface

CloverApps should call the gateway before showing a build action. Its project/seed interface should display:

- resolved project and canonical ID;
- current canonical version and status date;
- current/stale/unknown/contradictory live-source coverage;
- exact command packet and cost lane;
- transcript and owner guidance;
- preview/build receipt;
- errors, logs, traffic, backup, and version links from their authoritative source;
- owner-only action cards;
- evidence-backed progress impact.

CloverApps is the owner-facing control plane and operational mirror, not the sole source of truth.

## Voice

The lowest-cost sequence is:

1. ChatGPT Voice, device dictation, or browser speech recognition;
2. local interim transcript;
3. deterministic command packet;
4. one compact model turn using target-only context;
5. native connector refresh;
6. deterministic checks and receipts.

API-billed realtime transcription is optional when browser/device accuracy is insufficient.

## Current boundary

Version 0.2 is public-context-only and read-only. Deployment and private ChatGPT connection remain pending. It cannot edit OpenAI Sites, access production databases, or expose private legal, guest, staff, financial, health, or credential data.
