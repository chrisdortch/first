# Clover repository instructions

Before planning or changing anything in this repository, read `AI_START_HERE.md`.

When a user says **“Use CloverApps to…”**:

1. Read `CLOVER_CONTEXT_GATEWAY_POINTER.json` and the current context/control-plane documents.
2. Resolve the exact project through `portfolio/registry/projects.json`; do not treat the phrase “CloverApps” as the project unless the instruction explicitly targets CloverApps itself.
3. Read only the target project record and protocols relevant to the requested intent.
4. Refresh materially relevant live facts through the native connected source named in `portfolio/context/LIVE_ADAPTER_REGISTRY.json`.
5. Treat stale, unavailable, or contradictory facts as visible states, not guesses.
6. Work preview-first and preserve exact source, test, preview, receipt, backup, and rollback identities.
7. Do not infer authority to merge, deploy production, read or write production data, change domains/DNS/secrets/permissions, purchase services, send messages, accept terms, or publish private information.

This public repository may contain public plans, policies, project metadata, and sanitized receipts. It must not contain secret values, guest/customer/staff records, private legal evidence, private communications, health information, financial records, or production credentials.
