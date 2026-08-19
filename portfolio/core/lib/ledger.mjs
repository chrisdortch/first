import fs from "node:fs";
import { canonicalize, sha256Bytes, sha256Canonical, assertSha256 } from "./canonical-json.mjs";

function eventWithoutHash(event) {
  const { eventHash: _eventHash, ...unsigned } = event;
  return unsigned;
}

export function createEvent(input, previousEvent = null) {
  const expectedSequence = previousEvent ? previousEvent.sequence + 1 : 1;
  if (input.sequence !== expectedSequence) throw new Error(`Expected sequence ${expectedSequence}`);
  if (!input.ledgerId || !input.eventId || !input.eventType || !input.recordedAt || !input.actor || !input.subject || !input.payload) {
    throw new TypeError("Event is missing required identity, actor, subject, or payload fields");
  }
  if (!Number.isFinite(Date.parse(input.recordedAt))) throw new TypeError("Event recordedAt must be a valid date-time");
  if (previousEvent && previousEvent.ledgerId !== input.ledgerId) throw new Error("Ledger ID cannot change within a chain");
  const sources = input.sources || [];
  for (const source of sources) {
    if (typeof source.sourceId !== "string" || source.sourceId.length === 0) throw new TypeError("Event sourceId is required");
    assertSha256(source.contentHash, `source ${source.sourceId} contentHash`);
  }
  const event = {
    schemaVersion: "0.2",
    canonicalization: "RFC8785-JCS",
    hashAlgorithm: "sha256",
    ledgerId: input.ledgerId,
    sequence: input.sequence,
    eventId: input.eventId,
    eventType: input.eventType,
    recordedAt: input.recordedAt,
    actor: input.actor,
    subject: input.subject,
    truthStatus: input.truthStatus || "not-applicable",
    sensitivity: input.sensitivity || "public",
    sources,
    supersedes: input.supersedes || [],
    previousEventHash: previousEvent ? previousEvent.eventHash : null,
    payloadHash: sha256Canonical(input.payload),
    payload: input.payload,
    synthetic: input.synthetic === true,
    eventHash: null
  };
  event.eventHash = sha256Canonical(eventWithoutHash(event));
  return event;
}

export function verifyLedger(events) {
  if (!Array.isArray(events) || events.length === 0) throw new Error("Ledger must contain events");
  const ids = new Map();
  let previous = null;
  for (const event of events) {
    if (event.schemaVersion !== "0.2") throw new Error(`Unsupported event schema at ${event.eventId}`);
    if (event.canonicalization !== "RFC8785-JCS" || event.hashAlgorithm !== "sha256") {
      throw new Error(`Unsupported canonicalization or hash algorithm at ${event.eventId}`);
    }
    if (!event.ledgerId || !event.eventId || !Number.isFinite(Date.parse(event.recordedAt))) {
      throw new Error(`Invalid event identity or timestamp at ${event.eventId}`);
    }
    if (previous && event.ledgerId !== previous.ledgerId) throw new Error(`Ledger ID changed at ${event.eventId}`);
    if (event.sequence !== (previous ? previous.sequence + 1 : 1)) throw new Error(`Non-consecutive sequence at ${event.eventId}`);
    if (event.previousEventHash !== (previous ? previous.eventHash : null)) throw new Error(`Broken previous hash at ${event.eventId}`);
    if (sha256Canonical(event.payload) !== event.payloadHash) throw new Error(`Payload tampering at ${event.eventId}`);
    if (sha256Canonical(eventWithoutHash(event)) !== event.eventHash) throw new Error(`Event tampering at ${event.eventId}`);
    if (ids.has(event.eventId)) throw new Error(`Duplicate event ID ${event.eventId}`);
    for (const source of event.sources || []) assertSha256(source.contentHash, `source ${source.sourceId} contentHash`);
    for (const reference of event.supersedes || []) {
      const earlier = ids.get(reference.eventId);
      if (!earlier || earlier.eventHash !== reference.eventHash) throw new Error(`Invalid supersession from ${event.eventId}`);
      if (canonicalize(earlier.subject) !== canonicalize(event.subject)) {
        throw new Error(`Cross-subject supersession from ${event.eventId}`);
      }
    }
    if ((event.supersedes || []).length > 0) {
      if (!/(?:correct|supersed|disput|revok|replace)/i.test(event.eventType)) {
        throw new Error(`Event type cannot supersede prior events at ${event.eventId}`);
      }
      if (typeof event.payload.correctionReason !== "string" && typeof event.payload.supersessionReason !== "string") {
        throw new Error(`Supersession reason is required at ${event.eventId}`);
      }
    }
    ids.set(event.eventId, event);
    previous = event;
  }
  return { valid: true, eventCount: events.length, headEventHash: previous.eventHash, lastSequence: previous.sequence };
}

export function encodeLedger(events) {
  verifyLedger(events);
  return `${events.map((event) => canonicalize(event)).join("\n")}\n`;
}

export function decodeLedger(text) {
  const raw = String(text);
  const events = raw.split("\n").filter((line) => line.length > 0).map(JSON.parse);
  verifyLedger(events);
  if (raw !== encodeLedger(events)) throw new Error("Ledger bytes are not canonical JSONL");
  return events;
}

export function readLedger(filePath) {
  return decodeLedger(fs.readFileSync(filePath, "utf8"));
}

export function createPreparedAnchor(events, ledgerBytes, recordedAt) {
  const verification = verifyLedger(events);
  const exactLedgerBytes = Buffer.isBuffer(ledgerBytes) ? ledgerBytes.toString("utf8") : String(ledgerBytes);
  if (exactLedgerBytes !== encodeLedger(events)) throw new Error("Anchor bytes do not match canonical ledger events");
  const anchor = {
    documentType: "clover-ledger-anchor-request",
    schemaVersion: "0.2",
    status: "prepared-unanchored",
    ledgerId: events[0].ledgerId,
    eventCount: verification.eventCount,
    firstSequence: 1,
    lastSequence: verification.lastSequence,
    headEventHash: verification.headEventHash,
    ledgerFileSha256: sha256Bytes(ledgerBytes),
    recordedAt,
    independentAttestation: null,
    anchorHash: null
  };
  const { anchorHash: _anchorHash, ...unsigned } = anchor;
  anchor.anchorHash = sha256Canonical(unsigned);
  return anchor;
}
