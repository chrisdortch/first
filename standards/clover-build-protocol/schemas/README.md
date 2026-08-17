# Formal schemas

Version 1.1.0 defines JSON Schemas for:

- project policies;
- the central project registry;
- build packets;
- build receipts;
- owner-approved visual baselines;
- the current protocol pointer.

The central validation workflow checks the pointer and registry on every relevant commit. Each enrolled project validates its policy before project verification and validates its final receipt before the workflow may pass.
