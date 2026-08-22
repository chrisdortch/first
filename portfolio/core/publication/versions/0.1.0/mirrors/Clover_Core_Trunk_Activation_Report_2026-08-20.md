# Clover Core Trunk Activation and Handoff Gate 0.1

## Final verdict: AMEND

The non-production candidate is published and operational as a read-only owner trunk. PR #17, its exact-head CI, the target-null Gateway 0.3.1 preview, the natural-language Today brief, the Handoff Ledger, and desktop/mobile readback are verified.

The overall gate is not `COMPLETE`: the first truthful implementation-branch Action Envelope does not exist. Action `CLOVER-2026-08-20-002` is deliberately a sanitized, read-only WarRoom identity-reconciliation precursor because the exact WarRoom repository, source, deployment, and rollback are unknown. Affiliated branch activation therefore remains on `HOLD` pending a separate exact gate.

## Exact source and review stack

- Repository: `chrisdortch/first`
- Branch: `platform/clover-core-trunk-activation-v0.1-20260820`
- Head: `2309bbc61dc8fcc7f2167c6c47db4a8b11cd8334`
- Tree: `a027db19d8b177fe52d45fc0c0153ca1189f728e`
- Direct parent: `9006dcb78ee9412b57321cbd0fbdfa617d7bf96c`
- Rollback/base: `364a9a96829f323aa00a679804fdd7ed879043b5`
- Draft PR: [chrisdortch/first#17](https://github.com/chrisdortch/first/pull/17)
- PR state: open, draft, unmerged, mergeable
- Delta: 2 commits, 62 paths, +10,325 / -68

PR #15 and PR #16 remain unchanged, open, draft, and unmerged.

## What works now

The candidate provides a source-bound operating loop for public sanitized governance context:

1. “What matters today?” routes to the portfolio operating brief, not a generic project-evolution flow.
2. Current, live, candidate, historical, blocked, and unknown states remain distinct.
3. The owner sees three transparent priorities, including blocked high-risk work.
4. One eligible next precursor is identified without silently turning it into branch authority.
5. Stable Action IDs resolve through an append-only index to exact envelope hashes.
6. Action 001 demonstrates a completed read-only refresh and receipt.
7. Action 002 remains proposed, pending approval, single-use, unconsumed, and unrevoked.
8. The Gateway remains a read-only public compiler; CloverApps/private ChatGPT remains the intended protected owner window.

The exact owner question returned Command Packet 1.2 with `portfolio_operating_loop / brief`, `requiresProject:false`, a resolved portfolio scope, no project object, no resolution card, and Today as a separately bound sibling.

## Completion methodology and results

The August 17 status and its 41% broad estimate remain historical and byte-preserved. The August 20 candidate uses four non-interchangeable metrics:

| Metric | Result | State | Confidence |
|---|---:|---|---|
| Broad mission completion | 45% | candidate | medium-low |
| Owner-usable operating-loop completion | 25% | current | medium |
| Live production completion | 35% | live | medium-low |
| Verified candidate completion | 70% | candidate | medium |

Each record carries date, scope, weighting, confidence, freshness, exclusions, and state classification in `portfolio/status/candidates/2026-08-20/status.json` and `portfolio/PROGRESS_METHODOLOGY_V0.2_CANDIDATE.md`.

## Priority model

The deterministic engine applies the owner-approved weights across all 19 current Registry 1.0 P0/P1 targets:

- deadline, safety, and continuity risk: 30%;
- owner/collaborator workload reduction: 25%;
- revenue or financial stability: 20%;
- portfolio synergy and unblocking: 15%;
- readiness and cost to finish: 10%.

Unknown factor inputs remain unranked rather than becoming zero. The WIP limit is one Core/trunk task and one affiliated branch task.

Top three overall:

1. Clover Core — 81.5, active.
2. Lakeside Essentials — 79.5, blocked.
3. Boat Rentals — 75, blocked.

WarRoom scores 67.75 as the first eligible affiliated precursor. It was not executed and is not the first implementation branch.

## Branch Capsules and Handoff Ledger

Six minimized public-sanitized capsules were created for Core, CloverApps, WarRoom, Knowledge Hub/Vault, PropertyCare/Booking Central, and Lakeside Essentials. They exclude raw legal, financial, health, customer, guest, staff, credential, message, payment, reservation, and transactional records.

Sealed identities:

- Today session: `56e5d0342c3f4d47dcaf5cec8cf2c6f52341ea57115bdecdc3751e7df7afd208`
- Action 001 envelope: `0f246dfa000fee8c8f7b24a0e21075236fe05f1cc647736747f9f9df8cd4afba`
- Action 001 receipt: `85a80a7aea223d2317477e6975a9f1a34bd5fed8ba2f1f1e48edf2e742a6f3d8`
- Action 002 envelope: `71873de93355ec1301b2a398b34d72860339f19f52c937fffdc3c95638550214`
- Handoff root/index: `136041730e9c8c705c4ac13823d7b568060bf8d454ecf56fd2fc2cd915a0d42c`

The ledger rejects negated or HOLD text as approval, requires canonical affirmative approval bound to one Action ID and envelope hash, enforces expiry/single-use/replay/evidence/rollback/effect checks, and supports append-only approval, consumption, and independent review. This Handoff layer does not bypass hardened Action Envelope v0.2 requirements for actual mutation.

## Exact-head CI

All current-head runs completed successfully at `2309bbc…`:

| Workflow | Run | Jobs | Result |
|---|---:|---|---|
| Validate Clover master plan | `32427471833` | `96612271757` | success |
| Validate Clover Context Gateway | `32427471937` | `96612272190` Node 24; `96612272373` Node 22 | success |
| Validate Clover Core Candidate | `32427471892` | `96612272080` Node 24; `96612272122` Node 22 | success |

Artifacts:

- Gateway Node 24: `9427917664`, SHA-256 `2a1ea1978c8b18b6ab98894b88dd862fc015467bb6ec2f0ac347f3f3d6dfab0f`
- Gateway Node 22: `9427917765`, SHA-256 `d37b1047abf8aec386feea75fe48ae6cbefb6fbfb013f9d700645d95122d5b6e`
- Core Node 24: `9427918607`, SHA-256 `6d18fa57a848822beb98f58a783e0a0f3da729d046e6ffa161cbfe5acfde9305`
- Core Node 22: `9427918903`, SHA-256 `4ae9b5b746abfc4c2ccb03d532e50bad8357d87c2f88db53fa07cd85ef25c82c`

Local evidence also passed: Core 63/63, priority/status 18/18, Registry 5/5, Gateway 38/38, activation/master/Core validators, JSON/JSONL parsing, syntax checks, privacy scans, and `git diff --check`.

## Exact-source Gateway preview

- Deployment: `dpl_bwkBAYEz8XjjNLx4xXrdPAvc8bmS`
- Immutable URL: [Gateway 0.3.1 candidate](https://clover-context-gateway-preview-bah2p1llj-chris-dortchs-projects.vercel.app)
- Project: `prj_z4Y1ONIsFL2g2CFOcvg1umPo4UUM`
- Source: exact `2309bbc61dc8fcc7f2167c6c47db4a8b11cd8334`
- State: `READY`
- Target: `null`
- Aliases: none
- Runtime: read-only; write tools disabled; standing production authority false

Live MCP readback exposed exactly `search`, `fetch`, `prepare_clover_command`, and `render_clover_command_center`; every tool was read-only, non-destructive, closed-world, and idempotent.

The previous preflight deployment `dpl_59fFnw7X5zu1AbKUgZLdnPgQLrS4` at `9006dcb…` is historical/superseded. Its live readback found the natural-language routing defect, which the final commit corrected. It is not reused as current evidence.

The prior Gateway 0.3.0 preview `dpl_6wXMqgh3NETEy35BMpJWFXetESi4` remains unchanged and is the preview rollback anchor.

## Desktop, mobile, and privacy readback

Desktop and mobile command-center readbacks passed:

- title and `Clover Today` heading rendered;
- all five operating questions rendered;
- horizontal overflow: 0 pixels;
- console errors/warnings: 0;
- anonymous owner context remained hidden;
- no anonymous Registry payload, Action ID, or 40/64-character source hashes appeared;
- the normal mobile viewport capture rendered correctly.

The browser tool's mobile full-page capture rendered blank, while its normal mobile viewport capture rendered correctly. DOM, responsive-layout, overflow, privacy, and console checks were independent and passed; this limitation is recorded rather than hidden.

An independent recursive runtime scan found no raw/private records, secrets, credentials, email, phone, token, key, card, or local-path disclosure. API/MCP remain intentionally unauthenticated public compiler surfaces over committed sanitized governance records; they are not an owner-authentication boundary.

## Rollback and preservation

- Core source rollback: `364a9a96829f323aa00a679804fdd7ed879043b5`
- Gateway preview rollback: `dpl_6wXMqgh3NETEy35BMpJWFXetESi4`
- Action 002 rollback: no mutation; retain the existing unknown WarRoom source state

Fresh readback confirmed unchanged:

- PR #15 and PR #16;
- live CloverApps 7.4.2;
- Sites 80 at `b7f6bf19…` and Sites 81 at `029a4a1a…`, with Sites 81 still undeployed;
- Serenity PR #22 at `0c2cddaf…`;
- RollinD production main at `6875efcc…`, PR #3 at `8db83f9c…`, and PR #6 at `ae2f1b0d…`.

## Unknowns and next owner gate

Material unknowns remain:

- WarRoom canonical repository, branch, commit, deployment, backup, and rollback;
- whether a separately authorized WarRoom identity reconciliation will resolve those facts without private-data access;
- exact provider-metered cost for existing-plan GitHub Actions and Vercel execution;
- exact Sites saved-version ID serving the live CloverApps URL (fresh HTML still reports 7.4.2);
- the named Serenity production deployment identity, which was not supplied for direct comparison.

The next owner gate should review Action `CLOVER-2026-08-20-002` as a read-only identity precursor only. No WarRoom branch should be approved until its resulting capsule establishes exact source and rollback, after which a new implementation-branch envelope can be prepared.

## Cost and prohibited actions

No explicit purchase or money movement occurred. Exact provider-metered usage cost is unknown.

No merge, production deployment/promotion, production/private-data access, payment, checkout, message, PR comment, purchase, manual alias/domain/environment/secret/access-policy/permission change, CloverApps save, or mutation to PR #15, PR #16, Serenity, or RollinD occurred.

## Evidence files

- `Clover_Core_Trunk_Activation_Source_Bound_Receipt_2026-08-20.json` — SHA-256 `293188db70f99b738ecb58fec232702079e10ab8234db816d4a28c4e83fae603`
- `Clover_Core_Trunk_Activation_Report_2026-08-20.md`
- `Chat_Pro_Core_Trunk_Activation_Review_Prompt_2026-08-20.md`

Nothing in this report authorizes merge or production promotion.
