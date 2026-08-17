# Project Adoption Checklist

Complete this checklist separately for each project. Do not infer one project's answers from another.

## Identity

- [ ] Exact repository
- [ ] Production branch
- [ ] Current production commit
- [ ] Hosting project and deployment
- [ ] Production domains
- [ ] Owner
- [ ] Risk class

## Side effects and protected resources

- [ ] Databases and storage identified
- [ ] Payment systems identified
- [ ] Email, SMS, and notification systems identified
- [ ] External APIs and webhooks identified
- [ ] Secrets and environment variables identified without disclosing values
- [ ] Customer, guest, legal, health, or financial data identified
- [ ] Sensitive source paths listed
- [ ] No-send, no-purchase, and no-production-write boundaries encoded

## Reproducible build

- [ ] Runtime and package manager pinned
- [ ] Locked install command
- [ ] Lint or static-analysis command
- [ ] Type-check command
- [ ] Production build command
- [ ] Unit and integration commands
- [ ] Safe server-start command
- [ ] Browser engines and versions defined

## Safe verification

- [ ] Deterministic fixture or test-data strategy
- [ ] Desktop journey
- [ ] Mobile journey
- [ ] Required routes and states
- [ ] Known acceptable console and network behavior
- [ ] Screenshot states and budget
- [ ] Accessibility enforcement level
- [ ] No owner credentials required for routine CI
- [ ] Tests cannot send, buy, publish, or mutate production

## Release

- [ ] Preview mechanism
- [ ] Evidence packet
- [ ] Owner acceptance step
- [ ] Exact release procedure
- [ ] Rollback procedure
- [ ] Post-release smoke checks
- [ ] Registry entry prepared
