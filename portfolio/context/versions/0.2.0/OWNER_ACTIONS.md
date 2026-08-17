# Clover Context Gateway 0.2.0 — Owner Actions

The source candidate is validated. These remaining actions are intentionally separated because the connected tools cannot safely name and create a brand-new Vercel project with an exact Git repository, root directory, branch, and preview target.

## Current state

- Repository: `chrisdortch/first`
- Draft PR: `https://github.com/chrisdortch/first/pull/5`
- Candidate branch: `platform/clover-context-gateway-v0.2.0-preview-20260817`
- Stable application-source installation commit: `459a6c7c4547b12c4deea4331478ebb78009a066`
- Application root: `apps/clover-context-gateway`
- Dedicated Vercel project: not created
- ChatGPT custom app: not connected
- OpenAI Sites integration: not performed
- Tokens or API transcription required now: no

Subsequent commits on PR #5 change validation, pointers, and versioned documentation—not the gateway application root. Before deployment, verify:

```text
git diff --exit-code 459a6c7c4547b12c4deea4331478ebb78009a066...<CURRENT_PR_HEAD> -- apps/clover-context-gateway
```

The command must produce no diff.

Do **not** reuse the existing Vercel project named `nextjs-boilerplate`. Its source identity remains unresolved.

## Gate 1 — Review source

Review draft PR #5. It is read-only, unmerged, and does not change an application deployment.

Do not merge merely to test the gateway; the candidate branch can be deployed independently.

## Gate 2 — Create one isolated Vercel preview

Preferred zero-agentic-credit path:

1. In Vercel, create a **new** project named `clover-context-gateway-preview`.
2. Select GitHub repository `chrisdortch/first`.
3. Set Root Directory to `apps/clover-context-gateway`.
4. Select branch `platform/clover-context-gateway-v0.2.0-preview-20260817` at the current PR head.
5. Verify the gateway application root has no diff from source installation commit `459a6c7c4547b12c4deea4331478ebb78009a066`.
6. Create a preview deployment only. Do not use `--prod`, promote the deployment, assign a production alias, or add a custom domain.
7. During visual review, Vercel Authentication may remain enabled.
8. Before connecting ChatGPT, choose one supported remote-access path:
   - **Public read-only pilot:** disable Vercel Authentication for this dedicated high-entropy preview URL after confirming that it exposes only public repository context and exactly four read-only MCP tools; or
   - **Authenticated pilot:** add a supported OAuth/authentication layer before connection.
9. Do not assume ChatGPT can pass through Vercel's ordinary browser-login protection.
10. Do not add secrets for the public read-only pilot; version 0.2.0 uses public canonical context only.
11. Record the Vercel project ID, deployment ID, exact commit, preview URL, build result, access mode, and protection state in the release receipt.

If the Vercel interface cannot guarantee the exact branch/current PR head and preview target before deployment, stop rather than deploying `main` or reusing another project.

## Gate 3 — Connect as a read-only ChatGPT app

After the preview is verified and its MCP endpoint is reachable through public HTTPS or supported OAuth:

1. Use ChatGPT on the web.
2. Enable Developer Mode under Settings → Apps → Advanced Settings when available for the account.
3. Create a custom app using the remote MCP URL:

   `https://<preview-host>/mcp`

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

> Work only in `chrisdortch/first`, PR #5, branch `platform/clover-context-gateway-v0.2.0-preview-20260817`, application root `apps/clover-context-gateway`. Read the current PR head and verify that this application root has no diff from source installation commit `459a6c7c4547b12c4deea4331478ebb78009a066`. Create a brand-new Vercel project named `clover-context-gateway-preview` and one preview deployment from the current PR head. Do not merge, deploy or promote production, reuse an existing Vercel project, add a custom domain, change DNS, add secrets, access production data, send messages, purchase services, or edit an OpenAI Site. First verify the preview with Vercel Authentication enabled. Then, because the gateway exposes only public repository context and exactly four read-only tools, either make only this dedicated high-entropy preview endpoint publicly reachable over HTTPS for the MCP connection or add supported OAuth; do not assume ChatGPT can use Vercel's browser-login page. Verify `/`, `/command-center`, `/api/search?q=RollinD`, `/api/fetch?id=clover://project/rollindd`, `/api/prepare-command`, and `/mcp`. Return the Vercel project ID, deployment ID, exact commit, preview URL, access mode, build/runtime logs, tool list, test results, cost, and rollback/deletion instructions, then stop.

Do not buy credits merely for discussion, planning, code review, deterministic tests, or ordinary use of the read-only gateway after it is connected.
