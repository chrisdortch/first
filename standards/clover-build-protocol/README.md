# Clover Build Protocol

The Clover Build Protocol is Chris Dortch's versioned operating model for building and improving software with AI at high quality while using model tokens selectively.

## Current version

[`CURRENT.md`](CURRENT.md) points to the active preserved version. Version **1.0.0** is retained under [`versions/1.0.0/`](versions/1.0.0/).

## Purpose

The protocol separates three kinds of work:

1. **Deterministic verification** for repeatable facts such as compilation, tests, routes, browser errors, image failures, responsive overflow, accessibility signals, and evidence capture.
2. **AI judgment** for architecture, unfamiliar failures, visual quality, product meaning, design hierarchy, copy, and other work that cannot be reduced safely to a fixed assertion.
3. **Owner authority** for merges, production promotion, domains, secrets, paid services, external messages, and production-data mutations.

The system avoids paying a reasoning model to rediscover stable facts on every iteration. Each accepted discovery should become durable documentation, a test, a policy, a baseline, or a project manifest whenever practical.

## Status vocabulary

- `draft`: proposed but not yet tested.
- `pilot-current`: current working standard, tested on bounded pilot projects.
- `adopted`: approved for broad portfolio use.
- `superseded`: retained historically but no longer current.
- `retired`: intentionally no longer used.

A protocol status never authorizes an application release.

## Repository layout

- `CURRENT.md` — pointer to the current preserved version.
- `CHANGELOG.md` — chronological protocol changes.
- `GOVERNANCE.md` — versioning, authority, and revision rules.
- `ROADMAP.md` — controlled adoption sequence.
- `versions/` — immutable historical specifications.
- `registry/projects.json` — verified project-enrollment records.
- `templates/` — reusable adoption and thread-handoff materials.
