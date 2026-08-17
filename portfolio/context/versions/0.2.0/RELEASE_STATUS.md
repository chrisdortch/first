# Clover Context Gateway 0.2.0 — Release Status

## Canonical source

Clover Context Gateway 0.2.0 is canonical on `chrisdortch/first` `main` at:

```text
e97191234904efaa7b4ada24331007bac112f053
```

Pull request #5 was squash-merged only after:

- exact changed-file boundary review;
- source syntax and nine deterministic tests;
- HTTP search/fetch/command-packet smoke tests;
- MCP initialization, tool-list, search, fetch, command, and UI-resource smoke tests;
- dual-runtime validation on Node 22 and Node 24;
- confirmation that no existing application repository or deployment is linked to `chrisdortch/first` in a way that this merge could trigger.

The four MCP tools remain exactly:

- `search`
- `fetch`
- `prepare_clover_command`
- `render_clover_command_center`

All are read-only. “Use CloverApps to evolve RollinD” resolves `rollindd`, not the CloverApps control plane. Ambiguous targets fail closed.

## Validation evidence

- Source evidence artifact: `9294476497`
- Source evidence SHA-256: `1da1eb9e3643825d8a236eb973d478cf6409f6091e516fed5b94c3327b6ef904`
- Dual-runtime validation commit: `d04dcf2cdb5b34455ab0e63b87c18f14cc57aa98`
- Dual-runtime workflow: `32076713871` — success
- Node 22 artifact: `9303689990`
- Node 22 digest: `7ce878e6698848bcd4e0afca81e001b3dfc4faf3147b01e26b9b7db06114ee65`
- Node 24 artifact: `9303687011`
- Node 24 digest: `917ef77836fcbc1b51a529645e838d02da61d253189cedb9a8780e5a846712d2`
- Master Plan validation: `32076713999` — success

## Canonical isolated Vercel preview

A brand-new Vercel project was created without reusing or changing any existing project:

- Project: `clover-context-gateway-preview`
- Project ID: `prj_z4Y1ONIsFL2g2CFOcvg1umPo4UUM`
- Canonical ready preview: `dpl_ErcfTuFmSHaa99ozqsazgubMEV6c`
- Source commit: `e97191234904efaa7b4ada24331007bac112f053`
- URL: `https://clover-context-gateway-preview-aj7435hwm-chris-dortchs-projects.vercel.app`
- Target: `null` — preview, not production
- Production alias: none
- Custom domain: none
- Region: `iad1`
- Runtime: Node 24.x
- Access: Vercel Authentication protected

The deployment build fetched every application file from the exact canonical commit, verified each Git blob identity, installed the pinned lockfile, and passed source syntax checks before packaging.

An initial configuration probe failed before publishing a function because `includeFiles` used the wrong Vercel JSON type. That failure is preserved in the deployment receipt rather than hidden.

## Remote access result

Two external automation tests were attempted against the protected preview:

1. Vercel-generated share URL as a cookie session — workflow `32075689379`.
2. The share token as an automation-bypass header — workflow `32075807382`.

Both stopped at Vercel Authentication before reaching the gateway. The first received Vercel dashboard authentication HTML; the second received HTTP 302. The generated share link is therefore not a machine-usable MCP bypass.

No gateway runtime errors were observed. No unauthenticated request reached the application function.

Complete evidence: `portfolio/context/evidence/0.2.0/vercel-preview-2026-08-17.json`.

## Remaining activation gates

1. In Vercel, change access only for `clover-context-gateway-preview` by choosing one of:
   - disable Vercel Authentication for this public/read-only pilot;
   - configure supported OAuth; or
   - create a Vercel automation-bypass secret suitable for a remote MCP client.
2. Re-run external GET, POST, MCP, and desktop/mobile visual tests after the access boundary is changed.
3. Connect the reachable `/mcp` endpoint as a read-only custom ChatGPT app in Developer Mode.
4. Integrate the interface into the official CloverApps OpenAI Site only through the supported Sites editor.
5. Any future write-capable tools require a new protocol version, exact action scopes, confirmations, receipts, and plan eligibility.

## Authority and cost state

The canonical-source merge is complete. It did not deploy or promote production, assign a domain, access production data, change secrets, purchase anything, send messages, or edit an OpenAI Site.

The purchased ChatGPT credits do not grant this conversation access to the owner's Vercel protection settings or ChatGPT Developer Mode screens. No additional credit purchase is indicated. The remaining two settings operations are account-authenticated UI actions, not model-compute shortages.
