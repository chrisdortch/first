# Controlled Adoption Roadmap

Version 1.0.0 is a bounded pilot, not an automatic portfolio-wide rollout.

## Recommended sequence

1. Public, low-side-effect applications.
2. Read-mostly or static private applications.
3. Operational applications using isolated test data.
4. Waiver, reservation, and messaging applications with explicit no-send and test-data controls.
5. Payment, customer-data, legal-evidence, or other high-impact systems only after sandbox, mutation, and rollback controls are project-specific and proven.

## Adoption rule

Do not copy a pilot workflow blindly. Before enrollment, identify and record:

- exact repository and production branch;
- current production deployment and domains;
- writable databases, storage, queues, email, SMS, payment, and third-party APIs;
- sensitive paths and owner-only routes;
- safe fixture or test-data strategy;
- commands for install, lint, type checking, build, tests, and server startup;
- required desktop and mobile journeys;
- known acceptable network or console behavior;
- release and rollback procedure.

Use the project adoption checklist in `templates/PROJECT_ADOPTION_CHECKLIST.md`.

## Planned improvements

- central reusable workflow with pinned action versions;
- a formal JSON Schema for project policy files;
- baseline approval and change-review rules;
- artifact retention outside expiring CI storage;
- automated registry validation;
- project-class profiles for static, authenticated, data-backed, payment, and messaging systems;
- measured token and CI-cost reporting;
- explicit disaster-recovery and rollback drills.
