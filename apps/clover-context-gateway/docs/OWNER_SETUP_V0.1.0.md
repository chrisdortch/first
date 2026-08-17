# Clover Context Gateway 0.1.0 — Owner Setup

This document separates routine use from one-time setup and from operations that may consume OpenAI agentic credits.

## What works after connection

After the gateway is hosted and connected to ChatGPT as a read-only app, the owner can begin with short instructions such as:

```text
Use CloverApps to show me what matters most now.
Use CloverApps to evolve Lakeside Essentials through a preview only.
Use CloverApps to plant a new seed for a communication app.
Use CloverApps to diagnose the latest RollinD errors.
Use CloverApps to prepare a backup and restore-test plan for Boat Rentals.
```

The app supplies the canonical plan, status, registry, protocols, aliases, completion context, priorities, and authority boundaries. The executing AI must still refresh the exact live repository, deployment, logs, errors, backups, and other required sources before changing anything.

## One-time setup A — Host the read-only gateway

Preferred target: a new non-production Vercel project imported from GitHub.

Use these exact settings:

```text
Repository: chrisdortch/first
Branch for first preview: platform/clover-context-gateway-v0.1.0-candidate-20260817
Root directory: apps/clover-context-gateway
Install command: npm ci
Build command: leave empty
Start command: npm start
Node.js: 22
Deployment environment: Preview
Custom domain: none
Production promotion: no
```

Set only this non-secret variable for the first preview:

```text
PUBLIC_BASE_URL=https://<the-preview-hostname>
```

Do not add GitHub, Vercel, OpenAI, database, or other provider tokens for the 0.1.0 preview. The gateway does not need them for canonical context and command routing.

Manual Vercel import and deployment does not require an OpenAI Work/Codex task. It may use ordinary Vercel build/hosting quota.

## One-time setup B — Connect it as a ChatGPT app

After the HTTPS preview passes review:

1. Open ChatGPT app/developer settings on web or desktop.
2. Enable Developer Mode when required by the current interface.
3. Create a private app using:

```text
https://<the-preview-hostname>/mcp
```

4. Keep the app private/internal.
5. Confirm that its exposed tools are read-only except for command preparation, which creates no external side effect.
6. Refresh the app after tool metadata changes.
7. Test the commands below.

Initial test commands:

```text
Use CloverApps to report current portfolio status.
Use CloverApps to show the canonical record for RollinD.
Use CloverApps to prepare, but not execute, a preview-only RollinD improvement.
Use CloverApps to plant a new seed called Test Seed and stop before repository creation.
```

Expected safety result: every command packet leaves merge, production deployment, production-data access, domains, secrets, purchases, and external messages unapproved.

## One-time setup C — Optional live provider adapters

Do not perform this during the 0.1.0 preview.

A future authenticated Clover service may add read-only adapters for private GitHub repositories, Vercel deployments/logs/traffic, Drive, and other systems. Prefer OAuth or installation-scoped apps over broad personal access tokens. Each adapter must have:

- least-privilege read scope;
- explicit account and project allowlists;
- no credential values in Git or prompts;
- audit logs;
- revocation instructions;
- freshness timestamps;
- provider-rate and cost limits;
- tests proving that write endpoints are unavailable.

Until those adapters exist, ChatGPT should use the already connected GitHub, Vercel, Drive, Gmail, Calendar, and other approved tools to perform live readback after the gateway prepares a command.

## Routine low-cost lane

Routine commands should use:

```text
Clover canonical context
+ connected read tools
+ deterministic CI/tests
+ ordinary Chat Pro reasoning
```

This avoids repeated long prompts and avoids spending Work/Sites capacity on discovery, status inspection, ordinary source changes, and deterministic validation.

## Tasks that may need agentic credits

Only use Work/Codex/Sites when a lower lane cannot perform the operation.

### Full authenticated browser inspection

Use for difficult UI judgment, owner-only admin flows, browser-console/network diagnosis, or final visual acceptance.

Exact prompt:

```text
Use the connected Clover context app first. Target only [PROJECT ID / NAME].
Refresh the current repository, production deployment, preview, logs, errors, backup status, and open work.
Open the exact isolated preview in the authenticated browser and inspect only the approved journey: [JOURNEY].
Do not merge, deploy production, change domains or DNS, alter secrets, purchase anything, send messages, or read/write production data.
Return screenshots, console/network findings, exact proposed changes, tests, remaining risks, and the minimum next action. Stop before applying any irreversible action.
```

### Repository engineering unavailable to Chat Pro

Exact Codex prompt:

```text
Read the Clover context app and chrisdortch/first/AI_START_HERE.md first.
Target only [EXACT REPOSITORY] at [BASE COMMIT].
Implement [ONE APPROVED OUTCOME] on a new isolated branch.
Use the current Clover Build Protocol and, when applicable, the Data Change Protocol.
Create a preview, run deterministic checks, preserve evidence, and open a draft review request.
Do not merge, promote, alter production data, domains, DNS, secrets, paid services, permissions, or external communications.
Return the branch, commit, diff, tests, preview, receipt, rollback anchor, and any owner-only next action.
```

### Final OpenAI Site save/deploy gate

Exact Sites prompt after a source candidate has already been validated:

```text
Read the referenced Site identity and the Clover-approved candidate packet first.
Target only [EXACT SITE] and approved source commit/version [IDENTITY].
Verify that the current Site baseline still matches the packet.
Build or import that exact candidate and save a new reviewable Site version only.
Do not deploy, publish, change audience, custom domain, DNS, secrets, storage, or production data.
Return the saved version identity, actual changes, tests, failures, limitations, and rollback candidate, then stop.
```

Publishing requires a separate instruction naming the exact saved Site version.

## When to purchase credits

Do not purchase credits merely to inspect status, prepare a command, read canonical context, modify a supported GitHub branch from Chat Pro, run CI, or obtain a Vercel preview.

Consider a small manual credit purchase only when all of the following are true:

1. the exact project and current baseline are verified;
2. an isolated candidate already exists or the task genuinely requires an authenticated agentic browser/Codex operation;
3. deterministic checks have already reduced the work to one bounded task;
4. the expected output and stop condition are written explicitly;
5. no lower-cost connected tool can complete it;
6. automatic top-up is disabled unless the owner separately chooses otherwise.

## Voice workflow

The preferred interaction is:

```text
Speak → inspect/correct live transcript → submit → receive command packet → approve only the next bounded action
```

Voice transcription can be supplied by the ChatGPT host or by browser speech recognition in the command-center UI. Transcription itself should not trigger execution. The transcript remains editable until submission.

## Known 0.1.0 limitations

- The gateway is read-only and does not execute repository, deployment, database, domain, message, purchase, or Sites mutations.
- It does not itself authenticate to private GitHub or Vercel providers.
- Traffic, runtime errors, and deployment logs are current only after the executing AI refreshes the connected provider.
- It does not replace Clover Vault backups.
- It does not eliminate model inference cost; it eliminates repeated context-pasting and reduces unnecessary high-cost agent/browser turns.
