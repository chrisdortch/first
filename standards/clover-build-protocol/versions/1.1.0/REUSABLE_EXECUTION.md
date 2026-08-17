# Reusable execution model

## Central workflow

`.github/workflows/clover-preview-v1.1.yml` is a `workflow_call` workflow. A project references it by exact 40-character commit and supplies only its policy path.

The workflow:

1. checks out the exact candidate;
2. checks out the exact protocol commit;
3. validates changed-file and authority boundaries;
4. installs project dependencies;
5. installs exact-version audit tooling without changing manifests;
6. validates the project policy against the formal schema;
7. runs the project verification command;
8. installs Chromium and WebKit;
9. runs a navigation-only visual audit;
10. assembles and validates the final receipt;
11. uploads bounded evidence;
12. fails unless every required check passed.

## Project footprint

An enrolled project should normally add only:

- `.clover/project-policy.json`
- `.github/workflows/clover-preview.yml`

Project-specific journeys may be added later, but the central runtime must not be copied into every repository.

## Fail-closed behavior

The workflow stops before project commands when:

- the branch prefix is unauthorized;
- the candidate is the production branch;
- the baseline is not an ancestor;
- the recorded production commit changed;
- a changed file is outside the allowlist;
- a sensitive path changed.
