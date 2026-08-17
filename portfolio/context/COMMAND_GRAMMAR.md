# Clover Command Grammar 1.1

The preferred natural-language entry point is:

```text
Use CloverApps to <desired outcome>.
```

The owner may also say:

- `Plant a new seed for <idea>.`
- `Evolve <project> toward <goal>.`
- `Diagnose <project> and fix the verified cause in a preview.`
- `Show the current status of <project or portfolio>.`
- `Back up <project> and prove restoration.`
- `Review the latest preview of <project>.`
- `Prepare <project> for release, but do not release it.`
- `Update the OpenAI Site for <project> using the approved source candidate.`

## Intent model

| Intent | Default result |
|---|---|
| `launch_project` | Versioned seed packet, adjacent-project check, isolated identity, research plan |
| `evolve_project` | Freshness check, smallest high-value change, isolated branch, tests, preview, receipt |
| `diagnose_project` | Current logs/errors, reproduction, verified cause, bounded repair candidate |
| `inspect_status` | Mission, program-area, and project status with dates and confidence |
| `backup_project` | Inventory, gap report, independent archive, checksums, restore plan |
| `restore_test` | Clean isolated restore and verification receipt |
| `review_preview` | Deterministic checks first; bounded visual review only where useful |
| `release_candidate` | Exact candidate, owner release card, rollback anchor; no automatic release |
| `update_openai_site` | Approved source candidate plus official Sites save/deploy gate |
| `research` | Current evidence, portfolio fit, risks, opportunities, and next packet |

## Project resolution

The trigger phrase itself is not a project name. Clover removes `Use CloverApps to` before project resolution. It uses canonical aliases and project IDs, and it fails closed when multiple projects are plausible or the request is generic.

## Command packet rule

A spoken or typed instruction is not sent directly to an executor. Clover first creates a command packet containing:

- exact intent;
- resolved project identity or visible unresolved/ambiguous state;
- canonical plan/status/source identity;
- a target-only context budget;
- required live sources and native connectors;
- freshness requirements;
- cost lane and any exact paid escalation trigger;
- execution steps;
- stop conditions;
- owner-only action cards;
- receipt requirements.

## Authority

The phrase authorizes preparation and ordinary reversible work explicitly requested by the owner. It does not create standing authority to merge, deploy production, access production data, change domains, change secrets, purchase services, send messages, sign agreements, or publish private information.
