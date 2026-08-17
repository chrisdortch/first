# Implementation Record — Version 1.1.0

Verified through **2026-08-17T03:20:01Z**.

## Central standard

- Repository: `chrisdortch/first`
- Candidate branch: `protocol/clover-build-protocol-v1.1.0-candidate-20260816`
- Validated reusable runtime commit: `ec7b7b42aead7ce9178b6be2bec3fa1293b4e9cb`
- Standard-validation workflow run: `31990651793`
- Conclusion: `success`
- Version 1.0.0 files: unchanged and validated against `V1_0_0_IMMUTABILITY_MANIFEST.json`
- Reusable workflow: `.github/workflows/clover-preview-v1.1.yml`
- Schemas: `standards/clover-build-protocol/schemas/`
- Runtime: `standards/clover-build-protocol/runtime/v1.1.0/`

## Third portability pilot — Poolside Pulse

- Repository: `chrisdortch/serenity-shores-poolside-pulse`
- Production branch: `main`
- Production commit before and after pilot: `d04e8d767903b0fdb084042bd65301407eb0359c`
- Production Vercel deployment: `dpl_BdaY7XkhSqP6v6t5QLDVSBe7KAQk`
- Pilot branch: `chatpro/clover-v1.1-poolside-pilot-20260816`
- Pilot commit: `a062183511acc74d5b228334e14a70b5ef6f4167`
- Changed files: `.clover/project-policy.json` and `.github/workflows/clover-preview.yml` only
- Reusable protocol pin: `ec7b7b42aead7ce9178b6be2bec3fa1293b4e9cb`
- Workflow run: `31990711953`
- Workflow conclusion: `success`
- Evidence artifact ID: `9275237650`
- Evidence digest: `sha256:dfb50511f1632cd21ba9ad585b5cf6c968f694413a42412ed3ce0a70443102f0`
- Preview deployment: `dpl_3rtT3u1dV6wQnL3noqk21TdA9kqf`
- Preview state: `READY`
- Preview target: none; not production
- Browser coverage: desktop Chromium and mobile WebKit, two routes each, 4/4 passed
- Visual finding: the mobile Back button measured 56×34 CSS pixels, below the 40-pixel height advisory. It was recorded without changing application code.

The artifact receipt explicitly reports `releaseState: not-authorized` and `productionEligible: false`.

## Portability conclusion

The third pilot proves that a project can enroll with only a two-file footprint while the executable workflow, schemas, and browser audit remain centrally versioned and pinned. It also proves the detector can be corrected centrally and rerun without copying runtime files into the project.

## Scope statement

No project was merged to production. No production deployment was promoted. No application source, production data, KV state, audio command, Spotify control, TTS operation, domain, DNS record, secret, external message, purchase, or OpenAI Site was changed.
