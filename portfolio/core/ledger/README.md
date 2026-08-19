# Clover Core v0.2 Candidate Ledger

`event-ledger.v0.2.candidate.jsonl` starts a new hash-chained ledger without rewriting the six legacy v0.1 events.

Sequence 1 anchors the complete legacy ledger by SHA-256. Sequence 2 records the correct SHA-256 for the ratification receipt because the legacy daily-log event labeled that receipt as its source while storing the Constitution hash. Sequence 3 records the portable-to-canonical history reconciliation.

Every v0.2 event uses canonical JSON, SHA-256 payload and event hashes, an exact previous-event hash, consecutive sequence, and source content hashes. Supersession is explicit and restricted to a previously recorded exact event hash with the same subject.

`anchors/first-v0.2.anchor-request.json` is only a local prepared request. Its `prepared-unanchored` status must not be interpreted as independent attestation. A later anchor must bind the exact ledger-file hash through an independently read-back remote Git object or an external authenticated signer.
