# Clover Build Protocol 1.2.0 candidate runtime

This runtime is unvalidated until exact-head CI records a passing candidate commit. It is additive; runtime 1.1.0 remains unchanged.

Security order:

1. `validate-json.mjs` validates central enrollment and project policy.
2. `verify-boundaries.mjs` binds policy bytes and source anchors to the enrolled record.
3. `snapshot-state.mjs` captures the initial source state.
4. `run-command.mjs` executes structured argv without a shell and verifies state after each group.
5. `browser-audit.mjs` starts the structured preview command without a shell and verifies state.
6. `verify-state.mjs` compares the final source state to the initial snapshot.
7. `assemble-receipt.mjs` requires the complete fixed check set, sealed core artifacts, and sealed browser screenshots before it can emit `passed`.
8. `verify-final-receipt.mjs`, loaded from an independent exact protocol checkout, rehashes the final receipt and every recorded artifact after schema validation.

None of these programs grants release authority.
