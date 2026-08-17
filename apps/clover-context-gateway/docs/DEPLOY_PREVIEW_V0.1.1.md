# Clover Context Gateway 0.1.1 — Preview Activation

This candidate is self-contained for a Vercel project whose root directory is `apps/clover-context-gateway`.

## Safety state

- Read-only public Clover context only.
- No GitHub, Vercel, OpenAI, database, Gmail, Drive, or Sites credentials.
- No production-data access.
- No custom domain.
- No automatic Git deployments (`vercel.json` disables them).
- No merge, publication, purchase, or external-message authority.

## Import the existing repository

In Vercel, create a new project from the existing repository `chrisdortch/first` and use:

```text
Project name: clover-context-gateway
Root directory: apps/clover-context-gateway
Framework preset: Other
Install command: npm install --ignore-scripts --no-audit --no-fund
Build command: npm run validate
Node.js: 22.x
Custom domain: none
Environment variables: none for the first deployment
```

The committed context snapshot lets the root directory deploy without reading files outside the project root. GitHub Actions verifies that the snapshot exactly matches the canonical files whenever the repository source is available.

Create only a review deployment. Do not promote or assign a custom domain.

## Verify the deployment

Open:

```text
https://<deployment>/
https://<deployment>/command-center
```

Then test the MCP endpoint with ChatGPT Developer Mode:

```text
https://<deployment>/mcp
```

Test prompts:

```text
Use CloverApps to report current portfolio status.
Use CloverApps to show the canonical record for RollinD.
Use CloverApps to prepare, but not execute, a preview-only RollinD improvement.
Use CloverApps to plant a new seed called Test Seed and stop before repository creation.
```

Every resulting command packet must leave all irreversible authority fields false.

## Failure handling

If the deployment fails, preserve the exact build log and deployment ID. Do not add credentials, alter existing Vercel projects, change domains, or weaken validation. Repair only this isolated gateway candidate.
