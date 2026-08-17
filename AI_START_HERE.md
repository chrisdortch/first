# AI Start Here

You are reading Chris Dortch's durable AI knowledge and operating-standards repository.

## Required first steps

1. Identify the exact project the user is asking about.
2. Read the applicable current standard and its machine-readable manifest.
3. Inspect the project's actual repository, current branch, deployment, data stores, and existing safety boundaries before proposing or making changes.
4. Treat every stored plan as versioned guidance, not as a standing authorization for a new merge, deployment, purchase, message, data mutation, credential change, or production action.
5. Prefer the smallest reversible change on an isolated branch or preview.
6. Produce evidence tied to exact commits and exact test runs.
7. Preserve the user's authority over irreversible actions.

## Current software-build standard

Read, in this order:

1. [`CLOVER_BUILD_PROTOCOL_POINTER.json`](CLOVER_BUILD_PROTOCOL_POINTER.json)
2. [`standards/clover-build-protocol/CURRENT.md`](standards/clover-build-protocol/CURRENT.md)
3. The numbered version referenced by `CURRENT.md`
4. [`standards/clover-build-protocol/registry/projects.json`](standards/clover-build-protocol/registry/projects.json) when the project may already be enrolled

## User objective

Build at a high professional level while conserving model tokens and attention. Routine, repeatable verification should be deterministic. AI reasoning and browser control should be reserved for novel defects, design judgment, architecture, ambiguity, authenticated owner-only flows, and final acceptance.

## Conflict and revision rule

The user's current explicit instruction governs the present task, subject to safety and law. A later approved protocol version may supersede the current pointer, but historical version directories must not be rewritten to pretend the earlier process never existed.

When changing the protocol:

- create a new numbered version;
- update the changelog and current pointer;
- explain the reason and migration effect;
- preserve prior versions and implementation records;
- never reinterpret a protocol update as production approval for an application.
