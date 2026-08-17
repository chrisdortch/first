# Governance and Versioning

## Authority

Chris Dortch is the protocol owner. Stored protocol text informs future work but does not replace current, project-specific owner authorization.

The following always require explicit current authorization for the exact project and action:

- merge to a production branch;
- production deployment or alias promotion;
- custom-domain or DNS change;
- production database or customer-record mutation;
- environment-variable, secret, access, or credential change;
- purchase, subscription, or recurring cost;
- external email, text, social post, legal filing, or other message;
- acceptance of terms or expansion of public access.

## Versioning

The protocol uses semantic versioning:

- Patch: clarification or correction that does not change authority or required stages.
- Minor: backward-compatible new checks, evidence, or adoption guidance.
- Major: changed authority boundaries, stage model, or incompatible project contract.

Every approved change must:

1. create a new version directory;
2. describe the reason and migration effect in `CHANGELOG.md`;
3. update `CURRENT.md` and the root pointer;
4. update affected project registry entries;
5. preserve all older version directories;
6. state whether enrolled projects remain compliant, require migration, or are unaffected.

## Evidence discipline

Claims of implementation or success must be tied to exact repository names, branches, commit SHAs, workflow run IDs, and conclusions. Branch names that cannot be read back from GitHub must not be recorded as implemented.

Artifacts may expire. The permanent record should therefore retain the artifact name, digest, originating run, and the deterministic assertions it represented.

## Corrections

When a prior conversational summary conflicts with repository evidence, repository evidence controls. Record the correction plainly rather than silently propagating the conversational claim.
