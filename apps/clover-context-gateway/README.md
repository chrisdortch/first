# Clover Context Gateway 0.2.0

A read-only MCP app and standalone command interface that lets the owner say **“Use CloverApps to…”** without pasting the master plan into every prompt.

## Archetype

`interactive-decoupled`: standard read-only `search`/`fetch` tools, a deterministic command-packet tool, and an optional voice-capable command-center widget.

## What it does

- Reads the canonical Clover Master Plan, status, project registry, priorities, protocols, and cost/freshness rules from `chrisdortch/first`.
- Resolves plain-language project references and fails closed when a target is ambiguous or unresolved.
- Produces a compact, preview-first command packet with the exact native connector required to refresh each live fact.
- Distinguishes canonical vision from live repository, deployment, error, log, traffic, backup, database, and OpenAI Site state.
- Uses a pointer-first, target-only context budget so the model does not ingest the whole portfolio on every request.
- Provides a standalone/browser widget with optional browser speech recognition and ChatGPT follow-up messaging.
- Returns exact conditional owner action cards when an official Sites or other owner-only gate is required.

It does **not** modify projects, merge code, deploy production, access production data, change domains, change secrets, purchase anything, or send messages.

## Context modes

### Local monorepo mode

When `CLOVER_MASTER_PLAN_POINTER.json` exists two levels above the app, the gateway reads that exact checkout. This is used by CI and local development.

### Public GitHub mode

When the canonical files are not locally available, the gateway reads the public `chrisdortch/first` repository at `CONTEXT_SOURCE_REF` and caches results briefly. Search loads only the registry and lightweight document metadata; full documents are fetched only when requested. The gateway attempts to bind results to the current Git commit.

Private material is intentionally excluded. Private context requires a separately authenticated relay.

## Tools

- `search(query, limit?)` — returns stable canonical IDs.
- `fetch(id)` — fetches one complete canonical item.
- `prepare_clover_command(request)` — creates a non-authorizing command packet, freshness plan, cost lane, and exact owner-only action cards.
- `render_clover_command_center(request?)` — renders the optional command-center widget.

## HTTP interface

- `/` — health, source mode, and authority state.
- `/mcp` — stateless Streamable HTTP MCP endpoint.
- `/command-center` — standalone command UI.
- `/api/context` — current public snapshot.
- `/api/search?q=...` — stable context search.
- `/api/fetch?id=...` — one context item.
- `/api/prepare-command` — deterministic command packet.

## Run locally

```bash
npm ci
npm run validate
npm start
```

Then:

```bash
curl http://127.0.0.1:8787/
curl 'http://127.0.0.1:8787/api/search?q=RollinD'
curl -H 'content-type: application/json' \
  -d '{"request":"Use CloverApps to evolve RollinD through a preview only"}' \
  http://127.0.0.1:8787/api/prepare-command
npm run smoke:mcp
```

## Vercel-compatible preview

This directory includes `api/index.js` and `vercel.json`. Create a **new dedicated Vercel project** from `chrisdortch/first` with root directory `apps/clover-context-gateway`. Do not reuse another project. The default deployed context mode is public GitHub read-only.

Required configuration:

```text
Framework preset: Other
Root directory: apps/clover-context-gateway
Install command: npm ci
Build command: npm run vercel-build
Production deployment: do not promote during the pilot
Custom domain: none during the pilot
```

## ChatGPT connection

After a stable HTTPS preview exists:

1. Enable Developer Mode in ChatGPT web.
2. Create a private custom app using `https://<preview-host>/mcp`.
3. Confirm the tool snapshot contains only `search`, `fetch`, `prepare_clover_command`, and `render_clover_command_center` and all are read-only.
4. Test:
   - `Use CloverApps to show my current portfolio status.`
   - `Use CloverApps to evolve RollinD through a preview only.`
   - `Use CloverApps to plant a new seed for a communication app.`

Pro can use this read/fetch app, but full custom MCP write tools are not part of this design. Native connected tools perform bounded work only after live refresh and the applicable Clover protocol.

## Voice and cost

The command-center page first uses browser speech recognition when available. Device dictation and ChatGPT Voice are valid alternatives. This path makes no OpenAI API call from the page. API-billed realtime transcription is optional and should only be added if browser/device transcription is not reliable enough.

## Deployment and authority boundary

A passing app test or connected read-only app does not authorize:

- a merge or production promotion;
- an OpenAI Site save/deploy;
- production-data access or migration;
- domains, DNS, secrets, permissions, purchases, or messages;
- private legal, guest, staff, financial, health, or credential context.
