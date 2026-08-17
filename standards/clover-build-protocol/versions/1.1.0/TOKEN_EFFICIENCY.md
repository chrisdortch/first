# Token-efficiency policy 1.1.0

## Default: deterministic only

Clean builds run repository tests and browser checks without OpenAI model inference.

## Bounded model review

Use model vision when UI files or visual fingerprints changed, a warning exists, a new state was added, or subjective judgment is needed. Begin with the contact sheet and receipt, not the full artifact set.

## Full browser control

Reserve full AI browser control for novel interfaces, authenticated owner flows, difficult defects, significant design refinement, and final acceptance of important releases.

## Convert discoveries into durable tests

When a model finds a repeatable defect, encode it as a deterministic assertion, route contract, budget, schema rule, or owner-approved baseline. The same defect should not repeatedly consume model tokens.

## Cost separation

Report model tokens, CI minutes, artifact storage, hosting, APIs, and paid services separately. "No OpenAI tokens" does not mean "zero infrastructure cost."
