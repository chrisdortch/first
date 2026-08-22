# Clover Core publication finalization 0.1.0

This directory is the additive, connector-readable publication layer for the
Clover Core trunk activation candidate. It does not rewrite the dated Today,
status, Handoff, or historical records.

The exact externally issued report, source-bound receipt, and review prompt are
mirrored byte-for-byte under `versions/0.1.0/mirrors/`. Their raw SHA-256
digests are preserved in the publication index. The structured review pointer
records the owner-provided ChatGPT Personal Pro `AMEND` review as
noncryptographic evidence, not approval. The readback overlay supplies the
later exact-head CI, artifact, and target-null preview facts that the immutable
prepublication Today snapshot left pending.

`index.json` is the stable connector pointer. It must initially be byte-identical
to `versions/0.1.0/records/core-publication-index-0001.json`. Mirrored artifact
hashes cover raw bytes. Structured record hashes cover canonical JSON after
removing only that record's self-hash field. A successor must preserve the
numbered snapshots, append immutable records, bind the exact previous snapshot
path and hash, and then advance the stable root. The overlay's precedence is
limited to publication readback; it cannot supersede owner authority, Handoff
lifecycle, production state, or historical records.

The reviewed implementation head is
`2309bbc61dc8fcc7f2167c6c47db4a8b11cd8334`. That head identifies the code and
provider evidence reviewed. It is not the later commit that first contains
these finalization bytes. A later external publication receipt must bind that
container commit and tree after they exist.

## Connector-first independent review

ChatGPT Personal Pro should work read-only and use connectors instead of local
attachments:

1. Refresh PR #17 in `chrisdortch/first` and identify its current exact head,
   base, open/draft/unmerged state, exact-head GitHub Actions, artifacts, and
   target-null Vercel preview.
2. Fetch and hash-verify these stable IDs through the Clover Context Gateway:
   `clover://publication/report`, `clover://publication/receipt`,
   `clover://publication/review-prompt`,
   `clover://publication/review-decision`, and
   `clover://publication/readback`. If a connector ID is unavailable, use the
   exact path resolved by `portfolio/core/publication/index.json` from the
   refreshed PR head; do not use a local path or conversational memory.
3. Confirm the index is self-hashed, its stable root equals its numbered
   snapshot, every pointer resolves exactly once, all raw-byte and canonical
   hashes match, and the readback binds the exact reviewed head, CI artifacts,
   preview, source records, and pending Action 002 lifecycle.
4. Return exactly `APPROVE`, `AMEND`, or `HOLD`, with source facts, unknowns,
   authority still required, and the exact receipt/readback hashes. This review
   does not authorize merge, production, Action 002, or any external effect.

Do not embed or infer the future container commit. After these bytes are
committed, bind it through refreshed GitHub/Vercel/PR source metadata and a
post-commit source-bound readback; an optional later append-only record may
persist that evidence. Never use a local attachment as the binding source.
