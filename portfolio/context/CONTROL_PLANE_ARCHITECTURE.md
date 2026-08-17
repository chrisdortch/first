# Clover Context and Command Control Plane 0.1

## Goal

Allow the owner to say:

> Use CloverApps to evolve SongAndStage toward the strongest show-night experience.

and have the system automatically:

1. resolve the exact project;
2. read the current master plan and project record;
3. refresh live repository, deployment, log, error, backup, and data boundaries;
4. identify the appropriate cost lane;
5. prepare a safe command packet;
6. perform supported preview-only work;
7. return a receipt;
8. update the canonical status only when evidence changed.

## Components

### Canonical repository

`chrisdortch/first` remains the portable source for public process, plans, registries, schemas, decisions, and dated status.

### Clover Context Gateway

A remote read-only MCP server and web command interface in `apps/clover-context-gateway`.

It exposes:

- standard `search` and `fetch` tools;
- `prepare_clover_command`;
- `render_clover_command_center`;
- a standalone `/command-center` with optional browser speech recognition;
- `/api/context` and `/api/prepare-command` for CloverApps integration.

### Live adapters

The first gateway uses the canonical repository. Read-only adapters should then be added for:

- GitHub;
- Vercel;
- backup/Vault receipts;
- Google Drive references;
- OpenAI Site receipts;
- analytics providers when supported.

Private adapters require owner authentication and a private deployment. Secret values never enter the public repository.

### Chat execution

On ChatGPT Pro, the custom MCP app supplies read/fetch context. Ordinary Chat can then use built-in GitHub, Vercel, Drive, and other connected tools when available. The custom app does not need write permission to make Chat context-aware.

### CloverApps execution

CloverApps should call the gateway before presenting a build action. It should display:

- resolved project;
- current/stale/unknown source coverage;
- command packet;
- cost lane;
- owner-only actions;
- preview/build receipt;
- progress impact.

CloverApps is the interface and operational mirror, not the sole source of truth.

## Voice

The lowest-cost path is:

1. ChatGPT Voice, device dictation, or browser speech recognition;
2. live interim transcript shown locally;
3. deterministic command packet;
4. one model turn with compact current context.

OpenAI Realtime transcription is an optional reliability upgrade with API usage charges.

## Current boundary

The gateway is read-only and public-context-only. It cannot edit OpenAI Sites or expose private legal, guest, financial, health, or credential data. Those capabilities require separate authenticated lanes.
