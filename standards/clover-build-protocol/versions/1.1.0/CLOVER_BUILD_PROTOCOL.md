# Clover Build Protocol 1.1.0

## Purpose

Provide a portable, versioned development system that produces high-quality preview candidates while minimizing model usage and preventing accidental effects on production.

## Governing principle

**Use deterministic systems for repetition and certainty, models for interpretation and invention, and the owner for irreversible authority.**

## Required lifecycle

1. Identify one exact project, repository, production branch, production commit, deployment, domains, data resources, and risk class.
2. Bind the task to an exact baseline commit and isolated branch.
3. Reference one exact central protocol commit.
4. Validate branch, baseline ancestry, unchanged production anchor, allowed changed files, and sensitive paths before running project commands.
5. Install from locked project dependencies where available.
6. Run the project's existing verification contract.
7. Run navigation-only desktop Chromium and mobile WebKit checks without credentials, clicks, form submissions, or external writes.
8. Produce structured command, browser, and final receipts plus bounded screenshots and a contact sheet.
9. Escalate to model visual review only for UI changes, warnings, novel failures, authenticated flows, or final acceptance.
10. Obtain separate owner approval for the exact candidate before any merge or release.
11. Verify production independently after any separately authorized release.
12. Preserve the receipt and rollback anchor.

## Centralization

The executable runtime and reusable workflow live in `chrisdortch/first`. Enrolled projects contain only a small project policy and caller workflow. Both pin the exact central commit. A later protocol change therefore cannot silently alter an earlier candidate run.

## Release state

Every v1.1 preview receipt must state:

- `releaseState: not-authorized`
- `productionEligible: false`

Passing validation means the candidate is reviewable. It never means merge or deployment is approved.

## Data boundary

Version 1.1.0 does not authorize database, object-storage, payment, waiver, reservation, legal-evidence, customer-record, or credential mutations. Sensitive projects require a separate data-change protocol and disposable test resources before write testing.
