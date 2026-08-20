import assert from "node:assert/strict";
import test from "node:test";

import {
  createEvent,
  createPreparedAnchor,
  decodeLedger,
  encodeLedger,
  verifyLedger
} from "../lib/ledger.mjs";

const sourceHash = "1".repeat(64);
const recordedAt = "2026-08-18T20:00:00.000Z";

function eventInput(sequence, eventId, subjectId = "claim:synthetic", overrides = {}) {
  return {
    ledgerId: "ledger:trust-slice:synthetic",
    sequence,
    eventId,
    eventType: "claim_verified",
    recordedAt,
    actor: { actorType: "deterministic-system", actorId: "trust-slice-test" },
    subject: { subjectType: "claim", subjectId },
    truthStatus: "verified",
    sensitivity: "public",
    sources: [{ sourceId: "source:synthetic", contentHash: sourceHash }],
    payload: { value: sequence },
    synthetic: true,
    ...overrides
  };
}

function threeEventLedger() {
  const first = createEvent(eventInput(1, "evt:synthetic:001"));
  const second = createEvent(eventInput(2, "evt:synthetic:002", "claim:synthetic", {
    eventType: "claim_corrected",
    supersedes: [{ eventId: first.eventId, eventHash: first.eventHash }],
    payload: { value: 2, correctionReason: "Synthetic correction" }
  }), first);
  const third = createEvent(eventInput(3, "evt:synthetic:003", "claim:brief", {
    eventType: "projection_published",
    supersedes: []
  }), second);
  return [first, second, third];
}

test("ledger round-trips as canonical JSONL with a verified chain", () => {
  const events = threeEventLedger();
  const encoded = encodeLedger(events);
  assert.deepEqual(decodeLedger(encoded), events);
  const result = verifyLedger(events);
  assert.equal(result.eventCount, 3);
  assert.equal(result.headEventHash, events[2].eventHash);
  assert.throws(() => decodeLedger(`${JSON.stringify(events[0], null, 2)}\n${encodeLedger(events.slice(1))}`), /canonical|sequence|previous/i);
  assert.throws(() => createPreparedAnchor(events, `${encoded} `, recordedAt), /do not match/);
});

test("tamper, deletion, reorder, duplicate sequence, and broken link are rejected", () => {
  const events = threeEventLedger();

  const tampered = structuredClone(events);
  tampered[1].payload.value = 999;
  assert.throws(() => verifyLedger(tampered), /Payload tampering/);

  assert.throws(() => verifyLedger([events[0], events[2]]), /Non-consecutive|Broken previous/);
  assert.throws(() => verifyLedger([events[1], events[0], events[2]]), /Non-consecutive|Broken previous/);

  const duplicateSequence = structuredClone(events);
  duplicateSequence[2].sequence = 2;
  assert.throws(() => verifyLedger(duplicateSequence), /Non-consecutive/);

  const broken = structuredClone(events);
  broken[2].previousEventHash = "f".repeat(64);
  assert.throws(() => verifyLedger(broken), /Broken previous/);
});

test("sources and supersession references must be exact and subject-local", () => {
  assert.throws(() => createEvent(eventInput(1, "evt:bad-source", "claim:synthetic", {
    sources: [{ sourceId: "source:synthetic", contentHash: "not-a-hash" }]
  })), /SHA-256/);

  const first = createEvent(eventInput(1, "evt:synthetic:010"));
  const wrongReference = createEvent(eventInput(2, "evt:synthetic:011", "claim:synthetic", {
    supersedes: [{ eventId: first.eventId, eventHash: "2".repeat(64) }],
    payload: { value: 2, correctionReason: "Synthetic correction" }
  }), first);
  assert.throws(() => verifyLedger([first, wrongReference]), /Invalid supersession/);

  const crossSubject = createEvent(eventInput(2, "evt:synthetic:012", "claim:other", {
    supersedes: [{ eventId: first.eventId, eventHash: first.eventHash }],
    payload: { value: 2, correctionReason: "Synthetic correction" }
  }), first);
  assert.throws(() => verifyLedger([first, crossSubject]), /Cross-subject/);
});

test("a local anchor request is explicitly not an independent anchor", () => {
  const events = threeEventLedger();
  const encoded = encodeLedger(events);
  const anchor = createPreparedAnchor(events, encoded, "2026-08-18T20:05:00.000Z");
  assert.equal(anchor.status, "prepared-unanchored");
  assert.equal(anchor.independentAttestation, null);
  assert.match(anchor.anchorHash, /^[a-f0-9]{64}$/);
});
