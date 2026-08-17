# Progress Methodology

## Purpose

Percentages are planning instruments, not claims of certainty. They exist to expose remaining work, compare progress over time, and prevent a polished preview from being confused with a complete, recoverable, operational system.

## Mission score

The broad mission score is a weighted average of the program areas in `portfolio/status/current.json`.

For each area:

```text
contribution = weight × completionEstimate ÷ 100
```

The weights must total 100. The displayed mission score is the nearest whole number to the unrounded weighted result.

A status update must not change a percentage without also changing at least one of:

- evidence;
- state;
- completed milestone;
- definition-of-done progress;
- verified blocker removal.

## Project score

Project completion should eventually use these weighted dimensions:

| Dimension | Weight |
|---|---:|
| Product definition and scope | 10 |
| Core user journeys | 25 |
| Data and integrations | 15 |
| UX and accessibility | 10 |
| Security, privacy, and legal controls | 10 |
| Build, deployment, and production verification | 10 |
| Backup, restore, and portability | 10 |
| Monitoring, documentation, and operations | 10 |

Until a live audit applies that model, historical project estimates remain labeled with their date and confidence.

## Percentage anchors

- **0%** — idea only.
- **10%** — problem and intended user are defined.
- **20%** — canonical project identity and initial source exist.
- **35%** — core prototype exists.
- **50%** — principal journey works in an isolated environment.
- **65%** — preview is usable and deterministically validated.
- **80%** — production candidate, with security and data boundaries addressed.
- **90%** — stable production use, monitoring, documentation, and rollback.
- **100%** — agreed scope is operationally complete, backed up, restore-tested, documented, monitored, and reflected in the registry.

A project may move backward when scope expands, evidence contradicts prior assumptions, production breaks, or backup/restore readiness is lost.

## Confidence

- **high** — exact repository/deployment readback and current verification.
- **medium** — recent evidence exists but not every surface was rechecked.
- **medium-low** — multiple partial sources or historical estimates.
- **low** — inferred from incomplete records.
- **concept-only** — no completion score.

## Historical snapshots

Never overwrite history. Add a new snapshot to `portfolio/ledger/progress-history.jsonl`. Explain material scope or methodology changes so percentages remain interpretable.

## Authority

No percentage grants authority to merge, deploy, migrate, read or write production data, change credentials, purchase services, or send messages.
