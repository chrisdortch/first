# Clover Context Gateway 0.1.0

A read-only MCP app and standalone command interface that lets a user say **“Use CloverApps to…”** without pasting the master plan into every prompt.

## Archetype

`interactive-decoupled`: canonical search/fetch data tools, a read-only command-packet tool, and an optional command-center widget.

## What it does

- Reads the canonical Clover Master Plan, status, project registry, priorities, and safety protocols from `chrisdortch/first`.
- Implements standard read-only `search` and `fetch` tools for ChatGPT knowledge compatibility.
- Resolves plain-language project references and prepares a bounded, preview-first command packet.
- Marks required live sources so ChatGPT or CloverApps must refresh repository, deployment, logs, errors, backup, or Site state before acting.
- Assigns a cost lane so deterministic work and Chat Pro are used before Work, Codex, full browser, Sites, or API-billed voice.
- Provides a standalone/browser widget with optional Web Speech API transcription and ChatGPT follow-up messaging.

It does **not** modify projects, merge code, deploy production, access production data, change domains, change secrets, purchase anything, or send messages.

## Current limitation

This public gateway exposes public process and portfolio metadata only. Private project data requires a separately authenticated private context relay. OpenAI Sites still requires its official authenticated save/deploy workflow.

## Run locally

```bash
npm install
npm run validate
npm start
```

- Health: `http://localhost:8787/`
- MCP: `http://localhost:8787/mcp`
- Command center: `http://localhost:8787/command-center`

The app expects to live at `apps/clover-context-gateway` inside `chrisdortch/first`. Set `CONTEXT_ROOT` when running elsewhere.

## Tools

- `search(query)` — standard read-only knowledge search.
- `fetch(id)` — standard read-only item fetch.
- `prepare_clover_command(request)` — creates a non-authorizing command packet.
- `render_clover_command_center(request?)` — renders the optional widget.

## Deployment gate

Before deployment:

1. Generate and commit a lockfile.
2. Run MCP Inspector against `/mcp`.
3. Deploy to a stable HTTPS preview.
4. Connect it in ChatGPT Developer Mode.
5. Verify Pro access is read-only.
6. Add authentication before exposing private context.
7. Preserve the exact deployment and app snapshot in the Clover registry.

No token purchase is needed to maintain or test the deterministic parts. A small Codex/Work task may be useful only for the final hosted deployment and ChatGPT app connection if those controls are unavailable from ordinary Chat.
