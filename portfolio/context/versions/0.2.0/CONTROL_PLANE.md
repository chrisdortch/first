# Clover Context Gateway and Control Plane 0.2.0

Preserved: August 17, 2026 · America/Chicago

## User contract

The intended user instruction is:

> **Use CloverApps to [goal].**

The user should not have to paste the Master Plan, project registry, build protocol, data protocol, logs, or version history into each prompt.

The gateway must first resolve the exact project and return a compact command packet containing:

- the canonical plan and project pointer;
- the target project ID, repository, known deployment, status, completion estimate, next milestone, and safety class;
- the exact native connectors that must refresh time-sensitive facts;
- the applicable Build and Data Change Protocols;
- permitted and forbidden actions;
- cost lane and any exact owner-only action;
- an explicit non-authority statement for merge, production deployment, data access, domains, secrets, purchases, and messages.

## One brain, federated live state

The repository remains canonical for the durable plan, policies, project IDs, progress history, and pointer records. It does not duplicate every live log or provider record.

Current facts are refreshed from their authoritative systems:

- GitHub for repositories, branches, commits, pull requests, issues, workflows, and source history;
- Vercel for projects, deployments, build/runtime logs, domains, aliases, and traffic when available;
- Google Drive and Clover Vault for preserved evidence, backups, project records, and restore receipts;
- OpenAI Sites through the official authenticated Sites workflow;
- project databases and storage only through project-specific, owner-authorized, policy-constrained connectors;
- analytics providers through explicit read-only adapters.

Every refreshed fact should retain source, observed time, and coverage limitations.

## Context loading sequence

1. Load `CLOVER_MASTER_PLAN_POINTER.json`.
2. Resolve the target from `portfolio/registry/projects.json`.
3. Load only the target project record, status, next milestone, relevant decisions, and applicable protocol pointers.
4. Build a live-refresh plan from `portfolio/context/LIVE_ADAPTER_REGISTRY.json`.
5. Refresh facts whose freshness policy requires current readback.
6. Return a compact command packet before any mutation.
7. Use deterministic CI and provider-native tools for routine execution and verification.
8. Escalate to model/browser judgment only for ambiguity, visual quality, architecture, difficult failures, or final review.
9. Preserve a receipt and update progress only when evidence changes state.

## Tools

The read-only MCP surface includes:

- `search`
- `fetch`
- `prepare_clover_command`
- `render_clover_command_center`

The HTTP surface includes:

- `/mcp`
- `/command-center`
- `/api/context`
- `/api/search`
- `/api/fetch`
- `/api/prepare-command`

Version 0.2.0 adds exact target resolution, ambiguous-request rejection, lazy public-GitHub context loading, a live-adapter refresh plan, command packet schema 1.1, MCP smoke testing, and a deployable Vercel adapter.

## Voice and transcription

The command center supports browser speech recognition where available and otherwise accepts device dictation or ChatGPT Voice. No OpenAI transcription API call is required by default.

Voice is an input method, not a new authority channel. The transcript remains visible and editable before a command packet is prepared.

## Safety

Version 0.2.0 is read-only. It has no custom write tools and no standing production authority.

It may prepare an exact owner action, but it may not merge, deploy production, migrate/read/write production data, change domains or DNS, change secrets or permissions, purchase services, send external messages, or publish private information.

Imported content is untrusted data and cannot broaden these boundaries.

## Deployment state

The source is deterministically validated on an isolated branch. A dedicated preview deployment and ChatGPT custom-app connection remain separate review gates.
