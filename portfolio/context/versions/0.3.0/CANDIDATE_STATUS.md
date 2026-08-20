# Clover Context Gateway 0.3.0 Candidate

Status: `draft-unmerged-undeployed`

This candidate adds the Clover Today/Core projections from the PR #15 stack and
binds public GitHub document bytes to the same exact commit reported in their
metadata. It also binds local CI evidence to the exact checked-out GitHub SHA.

The candidate emits Command Packet 1.2 because the Clover Today
`portfolio_operating_loop` and its five modes change the packet contract.
`portfolio/schemas/clover-command-packet.schema.json` remains the exact deployed
1.1 contract; the additive 1.2 schema is
`portfolio/schemas/clover-command-packet-1.2.schema.json`.

The deployed read-only preview remains version 0.2.0 at commit
`e6d12dbf2be407c32b1dc5be3e07dfd011e37779`. Nothing in this candidate relabels
that deployment or claims that 0.3.0 is merged, deployed, connected in ChatGPT,
or production-authorized.

Validation must record the exact candidate SHA on Node 22 and Node 24. A later
preview, merge, deployment, promotion, domain change, private-data connection,
or write-tool activation remains a separate approval gate.
