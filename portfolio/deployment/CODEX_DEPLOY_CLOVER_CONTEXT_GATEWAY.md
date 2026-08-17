# Exact Codex task — deploy and connect Clover Context Gateway

Use this only after the gateway scaffold is committed and its GitHub validation passes.

```text
Use $build-chatgpt-app with $openai-docs.

TARGET
Repository: chrisdortch/first
Directory: apps/clover-context-gateway
Canonical baseline: [insert exact passing commit from main]

OBJECTIVE
Deploy the existing read-only Clover Context Gateway to a stable, non-production HTTPS preview and verify it as a private ChatGPT custom app for Chris Dortch. Preserve the current tool contracts and safety boundaries.

REQUIRED WORK
1. Read AI_START_HERE.md, CLOVER_MASTER_PLAN_POINTER.json, portfolio/context/*, and the gateway README.
2. Verify the exact repository and baseline commit.
3. Generate and commit a deterministic package-lock.json without upgrading the pinned package versions.
4. Run npm run validate.
5. Start the server and test GET /, GET /command-center, POST /api/prepare-command, and /mcp.
6. Use MCP Inspector to verify search, fetch, prepare_clover_command, and render_clover_command_center.
7. Deploy a non-production HTTPS preview. Do not attach a custom domain.
8. Configure only required non-secret settings. Do not add private source tokens yet.
9. Connect the preview in ChatGPT Developer Mode as a private read-only app if the current account UI permits it.
10. Test these prompts:
   - Use CloverApps to show my current portfolio status.
   - Use CloverApps to evolve RollinD through a preview only.
   - Use CloverApps to plant a new seed for a communication app.
11. Confirm that the app never claims write authority and that Pro exposes only read-only actions.
12. Return the deployment URL, MCP URL, exact commit, test results, app connection state, limitations, and rollback instructions.

FORBIDDEN
- No merge or production promotion without separate approval.
- No OpenAI Site edit or deployment.
- No production data or private legal/guest/financial/health context.
- No GitHub, Vercel, Drive, or other secret values in source or logs.
- No domain, DNS, purchase, message, permission, or credential changes.
- No write-capable MCP tools.
- No replacement of chrisdortch/first as the canonical source.

STOP CONDITIONS
Stop if repository identity, baseline, read-only tool annotations, HTTPS deployment, or ChatGPT app permissions cannot be verified.
```
