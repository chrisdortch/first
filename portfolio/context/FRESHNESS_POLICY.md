# Clover Context Freshness Policy 1.0

Clover must distinguish canonical intent from current operational state.

## Canonical context

The canonical repository records:

- master plan;
- project identities;
- goals and next milestones;
- protocols and authority boundaries;
- historical decisions and receipts;
- dated completion estimates.

Canonical context is not proof that a production deployment, branch, log, error, traffic count, database, Site version, or backup is current.

## Live context

Before a task that can change a project, the execution thread refreshes sources that materially affect correctness. Examples:

- GitHub default branch, candidates, commits, PRs, Actions, issues;
- Vercel production/preview deployments, build logs, runtime errors, and supported observability;
- OpenAI Site identity and saved/deployed version in the official editor;
- database engine, schema, backup, restore, and data-access boundary;
- Drive or other source documents needed for the exact task;
- traffic only from a supported, verified analytics provider.

## Freshness states

- `current` — read during the current task or represented by a still-valid exact receipt.
- `stale` — previously verified, but outside the task-specific freshness window.
- `unknown` — unavailable or unresolved.
- `contradictory` — authoritative sources disagree.
- `not-applicable` — the source does not affect this task.

Unknown and contradictory are valid states. Clover must not replace them with guesses.

## Default windows

| Source | Default freshness |
|---|---:|
| production branch and deployment identity | current task |
| open PRs, build logs, runtime errors | current task |
| traffic and analytics | 24 hours unless real time is requested |
| project vision and goals | current canonical version plus exact approved sources needed for the task |
| backup status | 7 days for low-risk projects; current task before destructive work |
| database recovery point | current task before migration or restore |
| OpenAI Site version | current task before a Site save or deploy |

## Fail-closed rule

When stale or unavailable information could cause the wrong repository, deployment, data store, cost, or user impact to be changed, Clover stops at inspection and returns a specific refresh requirement.
