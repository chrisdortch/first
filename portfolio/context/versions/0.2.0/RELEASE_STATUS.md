# Clover Context Gateway 0.2.0 — Release Status

## Completed

- Source upgraded from 0.1.0 on top of canonical `main` commit `8e5c8b92ac3968c8a6f009d8faf682b9393595b4`.
- Gateway source installation commit: `459a6c7c4547b12c4deea4331478ebb78009a066`.
- Bootstrap validation run: `32050038832` — success.
- Permanent validation candidate commit: `7260d75517aa8dfb3ac5ac314636172e5d562c38`.
- Permanent validation run: `32050433993` — success.
- Validation artifact: `9294476497`.
- Validation artifact SHA-256: `1da1eb9e3643825d8a236eb973d478cf6409f6091e516fed5b94c3327b6ef904`.
- Checksum-bound source payload verified.
- Pinned dependency installation passed.
- Source syntax and nine deterministic tests passed.
- HTTP health, command center, search, fetch, and command packet tests passed in isolated CI.
- MCP initialization, tool listing, search, fetch, command preparation, and UI-resource tests passed in isolated CI.
- MCP tools are exactly `search`, `fetch`, `prepare_clover_command`, and `render_clover_command_center`.
- “Use CloverApps to evolve RollinD” resolves RollinD rather than the CloverApps control plane.
- The resulting command packet uses schema 1.1 and includes target-only context, native live-refresh routes, cost lane, stop conditions, and owner-only gates.
- Ambiguous project requests fail closed.
- All irreversible authority flags remain false.

## Isolated Vercel preview

A brand-new Vercel project was created without reusing or changing any existing project:

- Project: `clover-context-gateway-preview`
- Project ID: `prj_z4Y1ONIsFL2g2CFOcvg1umPo4UUM`
- Ready preview deployment: `dpl_8NFprUjZQbWX87bDfzxTtj4yr7kz`
- Target: `null` — preview, not production
- Production alias: none
- Custom domain: none
- Region: `iad1`
- Access: Vercel Authentication protected

The deployment build fetched every application file from candidate commit `eb5d1270e9698cb67c3fdd007387c3c6302294ef`, verified each Git blob identity, installed the pinned lockfile, and passed source syntax checks before packaging.

An initial configuration probe failed before publishing a function because `includeFiles` used the wrong Vercel JSON type. The corrected deployments are preview-only and ready. The failed probe is preserved in the deployment receipt rather than hidden.

## Remote access result

Two external automation tests were attempted against the protected preview:

1. Vercel-generated share URL as a cookie session — workflow `32075689379`.
2. The share token as an automation-bypass header — workflow `32075807382`.

Both stopped at Vercel Authentication before reaching the gateway. The first received the Vercel dashboard authentication HTML; the second received HTTP 302. This confirms that the generated share link is not a machine-usable automation bypass.

No gateway runtime errors were observed. No unauthenticated request reached the application function.

Complete evidence: `portfolio/context/evidence/0.2.0/vercel-preview-2026-08-17.json`.

## Remaining review gates

1. Review draft pull request #5.
2. Decide whether to merge the source into the canonical repository; no merge is implied by a passing preview.
3. In Vercel, change access only for `clover-context-gateway-preview` by choosing one of:
   - disable Vercel Authentication for this public/read-only pilot;
   - configure supported OAuth; or
   - create a Vercel automation-bypass secret suitable for a remote MCP client.
4. Re-run external GET, POST, MCP, and desktop/mobile visual tests after the access boundary is changed.
5. Connect the reachable `/mcp` endpoint as a read-only custom ChatGPT app in Developer Mode.
6. Integrate the interface into the official CloverApps OpenAI Site only through the supported Sites editor.
7. Any future write-capable tools require a new protocol version, exact action scopes, confirmations, receipts, and plan eligibility.

## Cost state

The source, CI, deployment, and current diagnosis did not require an OpenAI transcription API or additional model API key.

The purchased ChatGPT credits do not grant this conversation access to the owner's Vercel protection settings or ChatGPT Developer Mode screens. No additional credit purchase is indicated. The remaining access and app-connection gates are account-authenticated UI operations, not token-compute shortages.
