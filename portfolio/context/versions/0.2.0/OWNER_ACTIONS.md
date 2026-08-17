# Clover Context Gateway 0.2.0 — Owner Actions

The source, isolated Vercel project, and protected preview now exist. Additional ChatGPT credits are not the blocker. The remaining gates require the owner's authenticated Vercel and ChatGPT settings screens, which are not exposed to this conversation's connectors.

## Current verified state

- Repository: `chrisdortch/first`
- Draft PR: `https://github.com/chrisdortch/first/pull/5`
- Candidate branch: `platform/clover-context-gateway-v0.2.0-preview-20260817`
- Current deployment-aware candidate commit: `52cd3c7d6b411bc31986f5efb4ad78c90234b16f`
- Application source candidate: `eb5d1270e9698cb67c3fdd007387c3c6302294ef`
- Application root: `apps/clover-context-gateway`
- Vercel team: `team_kx19aCrSTnej6wpz0fLgmYDY`
- Dedicated Vercel project: `clover-context-gateway-preview`
- Project ID: `prj_z4Y1ONIsFL2g2CFOcvg1umPo4UUM`
- Ready preview deployment: `dpl_8NFprUjZQbWX87bDfzxTtj4yr7kz`
- Preview URL: `https://clover-context-gateway-preview-pep108ni4-chris-dortchs-projects.vercel.app`
- Target: preview (`null`), not production
- Production alias: none
- Custom domain: none
- Access state: Vercel Authentication protected
- ChatGPT custom app: not connected
- OpenAI Sites integration: not performed
- Additional API/transcription tokens required: no

The deployment was created as a brand-new project. No existing Vercel project was reused or changed.

## Owner Gate 1 — Make only this read-only pilot remotely reachable

In Vercel, open project **`clover-context-gateway-preview`** and its Deployment Protection settings.

Choose exactly one:

### Simplest public/read-only pilot

Disable **Vercel Authentication** only for `clover-context-gateway-preview`.

This pilot contains only public repository context and four read-only MCP tools. Do not change protection on any other project. Do not add a custom domain, secret, database, storage resource, or production alias.

### Authenticated alternative

Keep Vercel Authentication and add a supported OAuth layer or a separately generated Vercel automation-bypass secret suitable for non-browser MCP clients.

Do not use a normal Vercel share link as an MCP credential. Two external tests proved that the generated share link still requires browser/account authentication.

## Owner Gate 2 — Connect the read-only ChatGPT app

After `/mcp` is reachable through public HTTPS or supported OAuth:

1. Use ChatGPT on the web.
2. Open **Settings → Apps → Advanced Settings → Developer Mode**.
3. Create a custom app with:

   `https://clover-context-gateway-preview-pep108ni4-chris-dortchs-projects.vercel.app/mcp`

4. Confirm the tool list is exactly:
   - `search`
   - `fetch`
   - `prepare_clover_command`
   - `render_clover_command_center`
5. Reject the connection if any write, modify, deploy, send, purchase, data-write, or secret-management tool appears.
6. Test:

   `Use CloverApps to evolve RollinD through a preview only.`

7. Confirm:
   - target project: `rollindd`;
   - schema: `1.1`;
   - a live native-connector refresh plan is present;
   - merge, production deployment, production data access, domains, secrets, purchases, messages, and publication all remain false.

## What happens immediately after those two gates

The external verification suite can then run:

- `/`
- `/command-center`
- `/api/context`
- `/api/search?q=RollinD`
- `/api/fetch?id=clover://project/rollindd`
- POST `/api/prepare-command`
- MCP initialize, tool list, search, fetch, command preparation, and UI-resource read
- desktop and mobile command-center screenshots
- console, runtime, network, and horizontal-overflow checks

The resulting receipt should be added to `portfolio/context/evidence/0.2.0/` and Clover Vault.

## OpenAI Sites gate

Do not update the live CloverApps OpenAI Site until the remote MCP connection passes. The Site update belongs in the official authenticated Sites editor and should create a saved review version before publication.

## Credit policy

The owner's 500 purchased ChatGPT credits are not required for either settings action. Credits provide model compute for supported agentic tasks; they do not grant this chat access to authenticated Vercel protection settings or ChatGPT Developer Mode.

No further credit purchase or auto top-up is recommended.
