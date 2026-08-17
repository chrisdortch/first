# Clover Context Efficiency Measurement 0.1.0

The purpose of the gateway is not merely to shorten prompts. It should reduce repeated discovery while preserving or improving correctness.

## Record per command

Store a privacy-minimized receipt containing:

- command ID and timestamp;
- canonical project ID and intent;
- canonical context commit/version;
- live sources requested and successfully refreshed;
- stale, missing, or contradictory sources;
- execution lane: deterministic, Chat Pro, bounded vision, full browser, Codex, Work, Sites, or API;
- approximate owner-input characters;
- approximate context characters returned;
- number of provider/tool calls;
- CI duration and result;
- model/browser escalation reason;
- agentic credits or API cost when observable;
- wall-clock duration;
- final state: prepared, previewed, verified, owner-blocked, released, failed, or abandoned;
- whether the result created a durable test, rule, registry update, or receipt.

Do not store private command text or provider responses in this public repository. Store only aggregate metrics and public evidence here; route private metrics to an approved private Clover store.

## Baseline comparison

Compare the gateway workflow against the previous pattern:

```text
long owner prompt
+ repeated portfolio explanation
+ repeated project discovery
+ broad model/browser work
```

Measure at least:

1. owner words required to begin;
2. time to identify the correct project and current baseline;
3. number of repeated context tokens;
4. number of high-cost agent/browser turns;
5. percentage of runs resolved by deterministic checks and ordinary connected tools;
6. regression and wrong-project incidents;
7. time from instruction to reviewable preview;
8. owner interventions required;
9. cost per verified candidate;
10. percentage of findings converted into durable tests or rules.

## Optimization rule

Do not optimize for fewer tokens at the expense of stale context, missing evidence, or unsafe authority. The objective is:

```text
minimum total cost for a correct, current, reviewable, recoverable result
```

## Escalation threshold

Use a higher-cost lane only when the receipt records a concrete reason, such as:

- authenticated browser state is required;
- visual judgment cannot be represented by deterministic rules;
- repository mutation is unavailable to Chat Pro;
- a complex failure remains after logs and tests;
- an official OpenAI Site save/deploy action is required;
- the owner specifically requests the higher-cost lane after seeing expected scope.

## Review cadence

After the first 20 meaningful commands, review the aggregate results and propose a versioned change to routing, freshness, or escalation policy. Preserve the original metrics and methodology.
