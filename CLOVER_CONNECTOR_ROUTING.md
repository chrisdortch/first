# Clover Connector Routing

Use the smallest connector set that can prove the current decision. Connector access is read-only unless an exact approved Action Envelope and a capable execution lane explicitly authorize a write. Never request or expose secret values.

| Source | Use it for | Minimum read | Do not infer |
|---|---|---|---|
| Clover Context Gateway | Canonical v1 pointers, current status and projects; optional candidate status, Registry 2.0, Today session, Handoff index, and operator guides | Search first, then fetch only stable IDs needed for the target; retain exact source metadata | Candidate availability, freshness, or execution authority when an artifact is missing |
| GitHub | Repository, default branch, exact commit/tree, pull request, diff, workflow, job, artifact, and rollback identity | Exact target repository and branch/PR only; changed paths before file bodies; current run metadata before logs | That an old receipt, branch name, preview, or green run belongs to the current head |
| Vercel | Project and deployment identity, exact source binding, state, target, aliases, and preview readback | Exact project/deployment named by the action; metadata before logs | Production state from a preview, or source identity from an alias alone |
| OpenAI Sites | Saved/deployed Site identity and an owner-authenticated save or deployment gate | Exact Site and version only when the owner task requires it | That saved source is previewed, deployed, or authorized for production |
| Browser verification | Visible desktop/mobile state, console/page errors, and bounded journeys | Exact source-bound preview after deterministic tests | Source correctness, private authentication, or production authority from appearance |
| Sovereign Cell connector | A minimized authorized projection unavailable in public Core | Named Cell, named fields, stated purpose, and shortest useful time range | Authority to open raw records or copy them into Core |

## Routing sequence

1. Read the exact Core/Today/Handoff pointer through the Gateway.
2. Inspect connector availability, coverage, freshness, and delta metadata.
3. Refresh only facts that can materially change the requested decision.
4. Bind every material claim to an exact identity and observation time.
5. Label missing, stale, or contradictory sources `unknown`; do not substitute memory or a canonical/current record for a missing candidate.
6. Return minimized facts, connector coverage, and receipts to the owner window. Keep raw source content in its responsible Cell.

Email, Drive, Calendar, financial systems, private legal records, production databases, analytics, messaging, payments, and secret stores are not default Clover Today sources. Do not scan them. Use one only when the owner names the need, the minimum fields and purpose are clear, and the applicable authority boundary permits the read. Production writes, messages, purchases, payments, domain/alias changes, permission changes, persistent environment changes, and secret mutations always require their own exact gate.

The Context Gateway has no write tools and no standing production authority. GitHub, Vercel, Sites, browser, or another connector being available does not grant permission to mutate it.
