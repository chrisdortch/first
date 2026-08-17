# Token-Efficiency Policy — Version 1.0.0

## Objective

Spend model tokens on reasoning and judgment, not on repeatable mechanical verification.

## Evidence ladder

Use the least expensive sufficient evidence in this order:

1. Existing project manifest and prior accepted decision record.
2. Git diff, changed-file inventory, and exact commit metadata.
3. Deterministic source checks.
4. Deterministic interaction and browser checks.
5. Compact JSON receipt and contact sheet.
6. Individual failing screenshots or trace.
7. Focused model review.
8. Full AI-controlled browser session.
9. Broad repository or portfolio re-analysis only when the task genuinely requires it.

Do not jump to a later rung when an earlier rung can answer the question reliably.

## Model-review triggers

A model review is warranted for:

- intentional visual changes;
- an unapproved initial visual baseline;
- novel or ambiguous failures;
- architecture and security decisions;
- product and market judgment;
- difficult copy or interaction design;
- authenticated flows that cannot be safely fixture-driven;
- final acceptance of a consequential release.

Documentation-only, test-only, workflow-only, and known-safe mechanical changes may remain deterministic-only when the project policy permits it.

## Context discipline

A review packet should contain:

- the objective;
- immutable project identity;
- candidate and production commits;
- scoped diff summary;
- deterministic receipt;
- at most four initial screenshots;
- the specific question requiring judgment.

Do not begin by sending an entire repository, every screenshot, every trace, and every historical conversation.

## Durable learning

After a finding is accepted:

- add a deterministic assertion when possible;
- update the project policy or known-exceptions list;
- preserve a decision record when judgment cannot be automated;
- update the visual baseline only after owner acceptance;
- avoid paying to rediscover the same fact on later builds.

## Cost honesty

This protocol reduces model inference; it does not make builds free. CI computation, browser downloads, artifact storage, hosting, databases, and third-party services may still carry cost. New recurring cost remains owner-approved.
