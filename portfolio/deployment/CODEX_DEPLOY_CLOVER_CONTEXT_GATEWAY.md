# Exact execution task — deploy and connect Clover Context Gateway

Use only after the gateway source is committed and its GitHub validation passes. A manual Vercel import and ChatGPT Developer Mode connection should be tried first because they do not require a generic token purchase.

```text
Use $build-chatgpt-app with $openai-docs.

TARGET
Repository: chrisdortch/first
Directory: apps/clover-context-gateway
Canonical baseline: [insert exact passing commit]

OBJECTIVE
Deploy the existing read-only Clover Context Gateway to a new dedicated, non-production HTTPS preview and verify it as a private ChatGPT custom app for Chris Dortch. Preserve the current tool contracts and safety boundaries.

REQUIRED WORK
1. Read AGENTS.md, AI_START_HERE.md, CLOVER_CONTEXT_GATEWAY_POINTER.json, portfolio/context/*, and the gateway README.
2. Verify the exact repository and baseline commit.
3. Confirm package.json and package-lock.json are aligned and do not upgrade pinned dependencies.
4. Run npm ci and npm run validate.
5. Start the server and test GET /, GET /command-center, GET /api/search, GET /api/fetch, POST /api/prepare-command, and /mcp.
6. Run npm run smoke:mcp or MCP Inspector to verify search, fetch, prepare_clover_command, and render_clover_command_center.
7. Create a NEW dedicated Vercel project. Do not reuse or modify an existing application project.
8. Use root directory apps/clover-context-gateway and deploy a non-production HTTPS preview. Do not attach a domain.
9. Configure only required non-secret settings. Do not add private source tokens.
10. Connect the preview in ChatGPT web Developer Mode as a private read-only app if the current account UI permits it.
11. Test:
   - Use CloverApps to show my current portfolio status.
   - Use CloverApps to evolve RollinD through a preview only.
   - Use CloverApps to plant a new seed for a communication app.
12. Confirm the tool snapshot is read-only and that no command claims production authority.
13. Return the deployment/MCP URLs, exact commit, tests, app connection state, limitations, and rollback instructions.

FORBIDDEN
- No merge or production promotion without separate approval.
- No reuse of an existing Vercel project.
- No OpenAI Site edit/deployment.
- No production data or private legal/guest/staff/financial/health context.
- No secret values in source or logs.
- No domain, DNS, purchase, message, permission, or credential changes.
- No write-capable MCP tools.
- No replacement of chrisdortch/first as the canonical source.

STOP CONDITIONS
Stop if repository identity, baseline, read-only annotations, dedicated preview project, HTTPS endpoint, or ChatGPT app permissions cannot be verified.
```
