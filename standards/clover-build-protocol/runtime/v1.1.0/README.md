# Clover reusable runtime 1.1.0

The runtime is executed only through the centrally pinned reusable workflow.

It provides:

- fail-closed branch, baseline, production-anchor, changed-file, and sensitive-path validation;
- formal JSON Schema validation;
- captured install and verification commands;
- navigation-only Chromium and WebKit audits;
- screenshots, compact contact sheets, and structured receipts;
- an explicit `not-authorized` release state.

Project repositories should not copy or edit these scripts. They reference an exact central commit and supply only a project policy and caller workflow.
