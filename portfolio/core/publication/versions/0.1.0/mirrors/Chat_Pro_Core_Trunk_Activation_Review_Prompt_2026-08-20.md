# Independent review prompt — Clover Core Trunk Activation and Handoff Gate 0.1

Use GitHub and Vercel read-only. Review the following exact non-production candidate and its external evidence files. Do not merge, deploy, promote, comment, message, mutate configuration, access private/production data, exercise payments, or spend money.

## Exact candidate

- Repository: `chrisdortch/first`
- Draft PR: [#17](https://github.com/chrisdortch/first/pull/17)
- Head: `2309bbc61dc8fcc7f2167c6c47db4a8b11cd8334`
- Tree: `a027db19d8b177fe52d45fc0c0153ca1189f728e`
- Base/rollback: `364a9a96829f323aa00a679804fdd7ed879043b5`
- Preview: `dpl_bwkBAYEz8XjjNLx4xXrdPAvc8bmS`
- Immutable URL: `https://clover-context-gateway-preview-bah2p1llj-chris-dortchs-projects.vercel.app`
- Expected preview state: `READY`, `target:null`, aliases empty, exact source head

Review these external files together:

1. `Clover_Core_Trunk_Activation_Report_2026-08-20.md`
2. `Clover_Core_Trunk_Activation_Source_Bound_Receipt_2026-08-20.json` — expected SHA-256 `293188db70f99b738ecb58fec232702079e10ab8234db816d4a28c4e83fae603`
3. this prompt

Then inspect the versioned in-repository records named by the receipt, especially:

- `portfolio/status/candidates/2026-08-20/status.json`
- `portfolio/status/candidates/2026-08-20/priority-input.json`
- `portfolio/status/candidates/2026-08-20/priority-output.json`
- `portfolio/core/today/2026-08-20/session.json`
- `portfolio/core/handoff/index.json`
- `portfolio/core/handoff/versions/0.1.0/demonstration/action-001-status-refresh-receipt.json`
- `portfolio/core/handoff/versions/0.1.0/demonstration/action-002-warroom-identity-envelope.json`
- `CLOVER_HANDOFF_LEDGER.md`
- `CLOVER_OWNER_START.md`
- `CODEX_CLOVER_OPERATOR.md`

## Independent checks

Return one decision: `APPROVE`, `AMEND`, or `HOLD` for this candidate evidence package. This is not a merge or production decision.

Verify independently:

1. PR #17 is open, draft, unmerged, based on exact PR #16 head, and its exact head/tree match above.
2. PR #15 and PR #16 remain unchanged.
3. The observed 62-path diff is bounded to candidate status, priority, Handoff, owner/operator instructions, Gateway 0.3.1, tests, and CI.
4. The August 17 41% status is preserved as historical, not silently rewritten.
5. All four August 20 percentages have explicit scope, method, confidence, freshness, exclusions, and state class.
6. The priority engine covers all 19 current P0/P1 targets, preserves null as unknown/unranked, enforces the 1+1 WIP limit, and keeps blocked Lakeside/Boat work visible.
7. Branch Capsules and Handoff records contain only sanitized governance metadata, not raw legal, financial, health, customer, guest, staff, message, payment, reservation, credential, or transactional records.
8. Action 001 and its receipt bind exactly. Action 002 remains proposed/pending/unconsumed/unrevoked and cannot execute from the compact Codex command alone.
9. Approval handling rejects negated/HOLD text and requires a canonical affirmative decision bound to one Action ID and envelope hash.
10. Future index transitions are append-only and support approval, consumption, and independent review without invalidating the dated Today session.
11. The exact owner question “What matters today?” returns `portfolio_operating_loop / brief`, requires no project, and does not add a project-resolution card.
12. Exact-head runs `32427471833`, `32427471937`, and `32427471892` all bind to `2309bbc…` and the four recorded artifact digests match provider metadata.
13. Preview `dpl_bwkBAY…` reports Gateway 0.3.1, exact context commit, read-only mode, write tools disabled, standing production authority false, `target:null`, and aliases empty.
14. Anonymous command-center output contains no registry payload, Action ID, source hashes, local paths, or private/raw data; public API/MCP exposure is accurately described as a sanitized public compiler, not owner authentication.
15. The historical preflight preview `dpl_59fFnw…` is labeled superseded and is not reused as current evidence.
16. CloverApps Sites 80/81, Serenity PR #22, RollinD main/PR #3/PR #6, and Gateway rollback deployment remain unchanged.
17. No explicit purchase or money movement occurred, while exact provider-metered cost remains `unknown` rather than falsely reported as zero.

## Decision boundary

Do not treat Action `CLOVER-2026-08-20-002` as the first implementation-branch Action Envelope. It is a read-only WarRoom public identity/receipt precursor. WarRoom repository, source, deployment, and rollback remain unknown.

Your decision should distinguish:

- whether the published Core trunk candidate is coherent and safely reviewable;
- whether Action 002 is safe to approve as a separate read-only identity-reconciliation gate;
- whether an implementation branch must remain on hold until exact WarRoom source and rollback are established.

If you find a defect, cite the exact file/path, exact current source identity, a reproducible failure, and the smallest correction. Do not publish a comment or mutate any resource.

Nothing in this prompt authorizes merge or production promotion.
