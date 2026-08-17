# Clover Context Gateway 0.2.0 — Release Status

## Current state

Clover Context Gateway 0.2.0 is canonical, publicly reachable, serverless-safe, and remotely verified as a read-only preview.

- Canonical gateway merge: `e97191234904efaa7b4ada24331007bac112f053`
- Public-resource hygiene merge: `3e65599458b6a90141b7c47084180750810e95e1`
- Serverless MCP transport merge: `e6d12dbf2be407c32b1dc5be3e07dfd011e37779`
- Completion estimate: **90%**, high confidence
- Broad Clover mission estimate: **41%**, unchanged

The remaining gateway work is the owner-authenticated ChatGPT custom-app connection and the later saved-review integration into the official CloverApps Site.

## Read-only tool surface

The remote MCP endpoint exposes exactly:

- `search`
- `fetch`
- `prepare_clover_command`
- `render_clover_command_center`

All four tools advertise read-only and non-destructive annotations. No custom write tools exist.

The instruction:

> Use CloverApps to evolve RollinD through a preview only.

resolves `rollindd`, not the CloverApps control plane. A request that does not identify a project fails closed with `needs-project-resolution`.

## Final canonical Vercel preview

A new Vercel project was created for the gateway without reusing or modifying any existing project.

- Project: `clover-context-gateway-preview`
- Project ID: `prj_z4Y1ONIsFL2g2CFOcvg1umPo4UUM`
- Ready deployment: `dpl_7nhkHzYK5tRJjKNRZCiqmjvJFwTn`
- URL: `https://clover-context-gateway-preview-6p1wy8ncf-chris-dortchs-projects.vercel.app`
- MCP: `https://clover-context-gateway-preview-6p1wy8ncf-chris-dortchs-projects.vercel.app/mcp`
- Command Center: `https://clover-context-gateway-preview-6p1wy8ncf-chris-dortchs-projects.vercel.app/command-center`
- Deployed and canonical source: `e6d12dbf2be407c32b1dc5be3e07dfd011e37779`
- Target: `null` — preview, not production
- Production alias: none
- Custom domain: none
- Access: public HTTPS for the public/read-only pilot
- Region: `iad1`
- Runtime: Node 24.x

The build fetched each application file from the exact merged commit, verified each Git blob identity, installed the pinned lockfile, and passed the serverless transport regression tests before packaging.

## Public-resource correction

The first browser run identified one real console error: `/favicon.ico` returned 404. Vercel also recorded `/robots.txt` probes returning 404.

A one-file adapter patch now:

- serves a self-contained Clover SVG at `/favicon.ico` and `/favicon.svg`;
- serves `robots.txt` with `Disallow: /`;
- delegates all other requests unchanged to the validated gateway handler.

Source workflow `32079417086` passed on Node 22 and Node 24 before the corrected preview was accepted.

## Public HTTP, MCP, and visual verification

Workflow `32079674011` passed against the corrected public gateway.

Verified:

- public root health and security boundaries;
- live canonical GitHub context;
- 28 project records;
- favicon and crawler policy;
- search and fetch;
- command packet schema 1.1;
- RollinD target resolution;
- ambiguous-target rejection;
- exact four-tool MCP inventory;
- read-only and non-destructive tool annotations;
- desktop Chromium at 1440×1000;
- mobile Chromium at 390×844;
- zero horizontal overflow;
- 44-pixel action controls;
- zero console errors;
- zero page errors;
- zero failed requests;
- zero HTTP 4xx/5xx responses during the tested UI journeys.

Evidence:

- Workflow run: `32079674011`
- GitHub artifact: `9304671380`
- Artifact SHA-256: `c4ff9f430990859d9fe5981736ee1c17717d5dde175df802b72326462fc45503`
- Durable Clover Vault file: `1USpot-UvGOONCAmF2ZeOluwUxCsK2iJU`
- Repository receipt: `portfolio/context/evidence/0.2.0/public-remote-verification-2026-08-17.json`

## ChatGPT Apps contract verification

Workflow `32080401810` verified the endpoint as a ChatGPT Apps/MCP app rather than merely as a website.

It confirmed:

- the exact four read-only tools;
- the `render_clover_command_center` tool;
- resource discovery at `ui://clover/command-center.html`;
- MIME type `text/html;profile=mcp-app`;
- retrieval of the widget HTML;
- the `window.openai` Apps bridge;
- RollinD target resolution with production authority false.

Evidence:

- GitHub artifact: `9304911072`
- Artifact SHA-256: `8684d45982f5b90a0d267d80ac79809e743f29a2da888e37704a9ab269e71a3d`
- Durable Clover Vault file: `1ChwHX0HqykAPzHUVMXx4rsL9v3xsIUsb`

## Serverless MCP transport correction

The final Vercel error sweep exposed ten 30-second function timeouts even though MCP tool calls succeeded. The optional standalone GET/SSE stream remained open by design and outlived Vercel's 30-second serverless function limit.

The official MCP TypeScript client treats HTTP 405 on the standalone GET stream as an expected indication that the server does not offer the optional SSE stream. The gateway therefore now uses stateless POST request/response MCP:

- `POST /mcp` remains fully functional;
- `GET /mcp` returns an immediate JSON-RPC HTTP 405;
- `DELETE /mcp` returns an immediate JSON-RPC HTTP 405;
- `Allow: POST, OPTIONS` is returned;
- no function-duration increase was used to conceal the defect.

Source validation workflow `32081207406` passed on Node 22 and Node 24. Each runtime passed eleven deterministic tests, POST MCP, GET/DELETE regression checks, command routing, pointer/schema validation, and all authority invariants.

Candidate remote workflow `32081400326` passed the complete MCP/widget contract and remained open for 35 seconds beyond the former timeout threshold. Vercel then reported no runtime errors.

The final merged deployment was independently verified by workflow `32081743038`, again with a 35-second observation window and a clean Vercel runtime-error sweep.

Final transport evidence:

- Candidate artifact: `9305236347`
- Candidate artifact SHA-256: `2952167d5d613079b4e53e6625e29de7fc70ffbdcc80c7faa80adaec2ab73776`
- Candidate Vault file: `1W53RrPlqrbbdFNUKCeJMht7kdcLvbkOC`
- Final canonical artifact: `9305340249`
- Final canonical artifact SHA-256: `588ff94a7d36d42edb997998f3e2e9b653c9352073ebc3e696147ac280bf61d2`
- Final canonical Vault file: `1apnU79oCGq5ZvmyY3vsWdpXheED8TG8K`
- Repository receipt: `portfolio/context/evidence/0.2.0/serverless-final-verification-2026-08-17.json`

## Historical access-boundary finding

Before the owner disabled Vercel Authentication, two external tests stopped at Vercel's browser-login boundary:

- share URL as cookie session: workflow `32075689379`;
- share token as an automation header: workflow `32075807382`.

Those failures are preserved in the prior deployment receipt. They demonstrated that a Vercel review-share link is not equivalent to a machine-usable MCP automation bypass.

## Remaining activation gates

1. In ChatGPT on the web, enable Developer Mode and create a custom app using the final public MCP URL above.
2. Confirm that ChatGPT lists exactly the four read-only tools and no write/modify tool.
3. Test “Use CloverApps to evolve RollinD through a preview only.” through the connected app.
4. Add the command interface to a saved review version of the official CloverApps Site through the supported Sites editor; stop before publication until separately approved.

## Authority and cost state

The gateway remains preview-only and read-only. This work did not promote production, assign a domain, change DNS, access production data, change secrets, purchase anything, send messages, or edit an OpenAI Site.

No additional credit purchase is indicated. The remaining ChatGPT and Sites operations are authenticated account-interface gates, not source, deployment, transport, or model-compute deficiencies.
