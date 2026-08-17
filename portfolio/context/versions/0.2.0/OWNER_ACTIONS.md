# Clover Context Gateway 0.2.0 — Owner Actions

The source candidate is validated. These remaining actions are intentionally separated because the connected tools cannot safely name and create a brand-new Vercel project with an exact Git repository, root directory, branch, and preview target.

## Current state

- Repository: `chrisdortch/first`
- Draft PR: `https://github.com/chrisdortch/first/pull/5`
- Candidate branch: `platform/clover-context-gateway-v0.2.0-preview-20260817`
- Candidate commit: `904b599fedd4b5a1d8bf178416fc542a2b92a616`
- Application root: `apps/clover-context-gateway`
- Dedicated Vercel project: not created
- ChatGPT custom app: not connected
- OpenAI Sites integration: not performed
- Tokens or API transcription required now: no

Do **not** reuse the existing Vercel project named `nextjs-boilerplate`. Its source identity remains unresolved.

## Gate 1 — Review source

Review draft PR #5. It is read-only, unmerged, and does not change an application deployment.

Do not merge merely to test the gateway; the candidate branch can be deployed independently.

## Gate 2 — Create one isolated Vercel preview

Preferred zero-agentic-credit path:

1. In Vercel, create a **new** project named `clover-context-gateway-preview`.
2. Select GitHub repository `chrisdortch/first`.
3. Set Root Directory to `apps/clover-context-gateway`.
4. Ensure the deployment source is branch `platform/clover-context-gateway-v0.2.0-preview-20260817` at commit `904b599fedd4b5a1d8bf178416fc542a2b92a616`.
5. Create a preview deployment only. Do not use `--prod`, promote the deployment, assign a production alias, or add a custom domain.
6. Keep Vercel Authentication or equivalent deployment protection enabled during review.
7. Do not add secrets; version 0.2.0 uses public canonical context only.
8. Record the Vercel project ID, deployment ID, exact commit, preview URL, build result, and protection state in the release receipt.

If the Vercel interface cannot guarantee the exact branch/commit and preview target before deployment, stop rather than deploying `main` or reusing another project.

## Gate 3 — Connect as a read-only ChatGPT app

After the protected preview is verified:

1. Use ChatGPT on the web.
2. Enable Developer Mode under Settings → Apps → Advanced Settings when available for the account.
3. Create a custom app using the remote MCP URL:

   `https://<protected-preview-host>/mcp`

4. Permit read/fetch behavior only.
5. Confirm the listed tools are exactly:
   - `search`
   - `fetch`
   - `prepare_clover_command`
   - `render_clover_command_center`
6. Reject the connection if any write/modify tool appears.
7. Test:

   `Use CloverApps to evolve RollinD through a preview only.`

8. Confirm the target is `rollindd`, the live-refresh plan names native connectors, and every irreversible authority flag is false.

Custom MCP apps are currently a web experience, not a mobile-app experience. On mobile, use the hosted command center, device dictation, or ordinary ChatGPT Voice and preserve the resulting text as the request.

## Gate 4 — Optional OpenAI Sites interface

The live CloverApps OpenAI Site should be updated only after the gateway preview and ChatGPT app connection pass.

That step requires the official Sites editor. It should use one exact, saved-version-only instruction and stop before publication.

## Exact paid agentic prompt, only if manual deployment is undesirable

Purchase or use agentic credits only for this bounded task:

> Work only in `chrisdortch/first` at commit `904b599fedd4b5a1d8bf178416fc542a2b92a616`, application root `apps/clover-context-gateway`. Create a brand-new Vercel project named `clover-context-gateway-preview` and one protected preview deployment from that exact commit. Do not merge, deploy or promote production, reuse an existing Vercel project, add a custom domain, change DNS, add secrets, access production data, send messages, purchase services, or edit an OpenAI Site. Verify `/`, `/command-center`, `/api/search?q=RollinD`, `/api/fetch?id=clover://project/rollindd`, `/api/prepare-command`, and `/mcp`. Return the Vercel project ID, deployment ID, exact commit, protected preview URL, build/runtime logs, tool list, test results, cost, and rollback/deletion instructions, then stop.

Do not buy credits merely for discussion, planning, code review, deterministic tests, or ordinary use of the read-only gateway after it is connected.
