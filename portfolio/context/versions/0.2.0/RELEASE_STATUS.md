# Clover Context Gateway 0.2.0 — Release Status

## Current state

Clover Context Gateway 0.2.0 is canonical, publicly reachable, and remotely verified as a read-only preview.

- Canonical gateway merge: `e97191234904efaa7b4ada24331007bac112f053`
- Public-resource hygiene merge: `3e65599458b6a90141b7c47084180750810e95e1`
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

## Canonical isolated Vercel preview

A new Vercel project was created for the gateway without reusing or modifying any existing project.

- Project: `clover-context-gateway-preview`
- Project ID: `prj_z4Y1ONIsFL2g2CFOcvg1umPo4UUM`
- Ready deployment: `dpl_3AzgkYhjvoaatTed2VnUfwp1CZSP`
- URL: `https://clover-context-gateway-preview-c4xo05gmr-chris-dortchs-projects.vercel.app`
- MCP: `https://clover-context-gateway-preview-c4xo05gmr-chris-dortchs-projects.vercel.app/mcp`
- Command Center: `https://clover-context-gateway-preview-c4xo05gmr-chris-dortchs-projects.vercel.app/command-center`
- Target: `null` — preview, not production
- Production alias: none
- Custom domain: none
- Access: public HTTPS for the public/read-only pilot
- Region: `iad1`
- Runtime: Node 24.x

The build fetched each application file from candidate commit `ccedb33ca5a206b6e4139aab4904befcb817b06b`, verified each Git blob identity, installed the pinned lockfile, and passed source syntax checks before packaging. That candidate was later squash-merged as `3e65599458b6a90141b7c47084180750810e95e1`.

## Public-resource correction

The first browser run identified one real console error: `/favicon.ico` returned 404. Vercel also recorded `/robots.txt` probes returning 404.

A one-file adapter patch now:

- serves a self-contained Clover SVG at `/favicon.ico` and `/favicon.svg`;
- serves `robots.txt` with `Disallow: /`;
- delegates all other requests unchanged to the validated gateway handler.

Source workflow `32079417086` passed on Node 22 and Node 24 before the corrected preview was accepted.

## Final public remote verification

Workflow `32079674011` passed against deployment `dpl_3AzgkYhjvoaatTed2VnUfwp1CZSP`.

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
- zero HTTP 4xx/5xx responses during the tested journeys.

Evidence:

- Workflow run: `32079674011`
- GitHub artifact: `9304671380`
- Artifact SHA-256: `c4ff9f430990859d9fe5981736ee1c17717d5dde175df802b72326462fc45503`
- Durable Clover Vault file: `1USpot-UvGOONCAmF2ZeOluwUxCsK2iJU`
- Repository receipt: `portfolio/context/evidence/0.2.0/public-remote-verification-2026-08-17.json`

After the hygiene merge, the same deployment reported canonical context commit `3e65599458b6a90141b7c47084180750810e95e1` from `main`.

## Historical access-boundary finding

Before the owner disabled Vercel Authentication, two external tests stopped at Vercel's browser-login boundary:

- share URL as cookie session: workflow `32075689379`;
- share token as an automation header: workflow `32075807382`.

Those failures are preserved in the prior deployment receipt. They demonstrated that a Vercel review-share link is not equivalent to a machine-usable MCP automation bypass.

## Remaining activation gates

1. In ChatGPT on the web, enable Developer Mode and create a custom app using the public MCP URL above.
2. Confirm that ChatGPT lists exactly the four read-only tools and no write/modify tool.
3. Test “Use CloverApps to evolve RollinD through a preview only.” through the connected app.
4. Add the command interface to a saved review version of the official CloverApps Site through the supported Sites editor; stop before publication until separately approved.

## Authority and cost state

The gateway remains preview-only and read-only. This work did not promote production, assign a domain, change DNS, access production data, change secrets, purchase anything, send messages, or edit an OpenAI Site.

No additional credit purchase is indicated. The remaining ChatGPT and Sites operations are authenticated account-interface gates, not source, deployment, or model-compute deficiencies.
