# Clover Context Gateway 0.3.1 Candidate

Status: `draft-unmerged-undeployed`

Version 0.3.1 is the additive Gateway surface for Clover Core Trunk Activation
and Handoff Gate 0.1. It preserves the 0.3.0 candidate source and preview as a
separately identified historical candidate.

This version:

- keeps canonical v1 status and Registry 1.0 as the current snapshot;
- loads the August 20 candidate status, Registry 2.0 projection, Today session,
  and Handoff Ledger only as optional, source-bound siblings;
- fails those optional records closed when missing, malformed, or incomplete;
- returns the Today sibling beside, never inside, Command Packet 1.2;
- keeps the exact four-tool MCP surface read-only and non-destructive; and
- renders owner-session data only through the connected app output path while
  leaving the static anonymous command-center document free of embedded
  registry data, project names, and source hashes.

The candidate contains only public, minimized governance and project metadata.
It contains no raw legal, financial, health, customer, guest, staff,
credential, email, message, payment, reservation, or transactional records.

The existing 0.3.0 preview at deployment
`dpl_6wXMqgh3NETEy35BMpJWFXetESi4` remains bound to commit
`364a9a96829f323aa00a679804fdd7ed879043b5`. It must not be relabeled as
0.3.1. The 0.3.1 preview, if created, must be a new `target: null` deployment
bound to the exact trunk-activation commit, with no manual alias, domain,
persistent environment, secret, access-policy, or production change.

Passing source, CI, MCP, desktop, or mobile checks grants no merge, production,
private-data, messaging, payment, purchase, domain, environment, secret, or
permission authority.
