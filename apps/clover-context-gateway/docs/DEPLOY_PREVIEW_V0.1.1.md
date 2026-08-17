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

The root response must identify `clover-context-gateway`, version `0.1.1`, and read-only mode. The Command Center must load without credentials.

## Connect from ChatGPT Pro

Use ChatGPT on the web. Custom MCP apps are not currently available in the mobile app.

1. Open **Settings → Apps → Advanced Settings**.
2. Enable **Developer mode**.
3. Create a private custom app using:

```text
https://<deployment>/mcp
```

4. Keep the app private and in developer mode. Do not publish it.
5. Verify `search` and `fetch` first. ChatGPT Pro currently supports read/fetch MCP use; broader custom MCP capabilities may differ from Business or Enterprise/Edu.
6. If `prepare_clover_command` or the interactive widget is not exposed on Pro, continue using `search` and `fetch` for canonical context and let the current chat execute the bounded work. Do not purchase credits merely to bypass a plan limitation.

Test prompts:

```text
Use CloverApps to report current portfolio status.
Use CloverApps to show the canonical record for RollinD.
Use CloverApps to prepare, but not execute, a preview-only RollinD improvement.
Use CloverApps to plant a new seed called Test Seed and stop before repository creation.
```

Every resulting command packet must leave all irreversible authority fields false.

## Cost boundary

No OpenAI API key or separate token purchase is required for the first preview and read-only ChatGPT Pro test. Vercel and GitHub may consume their ordinary included hosting and CI allowances.

## Failure handling

If the deployment fails, preserve the exact build log and deployment ID. Do not add credentials, alter existing Vercel projects, change domains, weaken validation, or buy credits. Repair only this isolated gateway candidate.
