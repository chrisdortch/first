import { sha256Bytes, sha256Canonical } from "./canonical-json.mjs";
import { verifyLedger } from "./ledger.mjs";

const REQUIRED_SOURCE_FIELDS = ["sourceId", "observedAt", "projectId", "status", "nextMilestone"];

function parseTimestamp(value, label) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError(`${label} must be an ISO-8601 timestamp`);
  return timestamp;
}

export function extractAllowlistedClaim(sourceBytes, artifact, options) {
  const exactBytesHash = sha256Bytes(sourceBytes);
  if (exactBytesHash !== artifact.contentHash) throw new Error("Source bytes do not match the captured artifact");
  let source;
  try {
    source = JSON.parse(Buffer.from(sourceBytes).toString("utf8"));
  } catch {
    throw new Error("Synthetic source must be valid JSON");
  }
  if (!source || Array.isArray(source) || typeof source !== "object") throw new TypeError("Synthetic source must be an object");
  if (source.synthetic !== true) throw new Error("Trust Slice accepts only explicitly synthetic sources");
  for (const field of REQUIRED_SOURCE_FIELDS) {
    if (typeof source[field] !== "string" || source[field].length === 0) throw new TypeError(`Source ${field} is required`);
  }
  if (source.sourceId !== artifact.sourceId || source.observedAt !== artifact.observedAt) {
    throw new Error("Source identity does not match capture metadata");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(source.projectId)) {
    throw new Error("Source projectId must be a non-instructional native identifier");
  }
  const observedAt = parseTimestamp(source.observedAt, "source observedAt");
  const asOf = parseTimestamp(options.asOf, "asOf");
  if (!Number.isFinite(options.maxAgeMs) || options.maxAgeMs < 0) throw new TypeError("maxAgeMs must be non-negative");
  if (observedAt > asOf) throw new Error("Source observation is from the future");
  if (asOf - observedAt > options.maxAgeMs) throw new Error("Source observation is stale");

  const claim = {
    claimType: "synthetic-project-status",
    claimId: `claim-${artifact.contentHash}`,
    synthetic: true,
    subject: { projectId: source.projectId },
    assertedAt: source.observedAt,
    facts: {
      status: source.status,
      nextMilestone: source.nextMilestone
    },
    provenance: {
      sourceId: source.sourceId,
      contentHash: artifact.contentHash,
      observedAt: source.observedAt
    }
  };
  if (typeof source.correctionReason === "string" && source.correctionReason.length > 0) {
    claim.correctionReason = source.correctionReason;
  }
  return claim;
}

export function projectCurrentClaims(events) {
  verifyLedger(events);
  const claimEvents = events.filter((event) => event.eventType === "claim.observed" || event.eventType === "claim.corrected");
  const claimsById = new Map(claimEvents.map((event) => [event.eventId, event]));
  const supersededIds = new Set();
  for (const event of claimEvents.filter((entry) => entry.eventType === "claim.corrected")) {
    if (event.supersedes.length !== 1) throw new Error(`Correction ${event.eventId} must supersede exactly one claim`);
    const prior = claimsById.get(event.supersedes[0].eventId);
    if (!prior || prior.sequence >= event.sequence) throw new Error(`Correction ${event.eventId} has an invalid prior claim`);
    if (prior.payload?.subject?.projectId !== event.payload?.subject?.projectId) {
      throw new Error(`Correction ${event.eventId} attempts cross-project claim substitution`);
    }
    if (typeof event.payload.correctionReason !== "string" || event.payload.correctionReason.length === 0) {
      throw new Error(`Correction ${event.eventId} requires a correction reason`);
    }
    supersededIds.add(prior.eventId);
  }
  const active = claimEvents.filter((event) => !supersededIds.has(event.eventId));
  const byProject = new Map();
  for (const event of active) {
    const projectId = event.payload?.subject?.projectId;
    if (typeof projectId !== "string") throw new Error(`Claim event ${event.eventId} has no project subject`);
    if (byProject.has(projectId)) throw new Error(`Conflicting current claims for ${projectId}`);
    byProject.set(projectId, { event, claim: event.payload });
  }
  return [...byProject.values()].sort((left, right) =>
    left.claim.subject.projectId < right.claim.subject.projectId ? -1 :
      left.claim.subject.projectId > right.claim.subject.projectId ? 1 : 0
  );
}

function importedQuotation(value) {
  return {
    value,
    trust: "untrusted-imported-source-data",
    permittedUse: "display-and-reasoning-evidence-only",
    canSetPolicy: false,
    canApprove: false,
    canInvokeTools: false
  };
}

export function buildContextCapsule(events, options) {
  const verification = verifyLedger(events);
  const current = projectCurrentClaims(events);
  const capsule = {
    documentType: "clover-minimum-context-capsule",
    schemaVersion: "0.2",
    synthetic: true,
    asOf: options.asOf,
    ledgerId: events[0].ledgerId,
    ledgerHeadEventHash: verification.headEventHash,
    items: current.map(({ event, claim }) => ({
      projectId: claim.subject.projectId,
      status: importedQuotation(claim.facts.status),
      nextMilestone: importedQuotation(claim.facts.nextMilestone),
      assertedAt: claim.assertedAt,
      claimEventId: event.eventId,
      claimEventHash: event.eventHash,
      sourceId: claim.provenance.sourceId,
      sourceContentHash: claim.provenance.contentHash
    })),
    unknowns: current.length === 0 ? ["No current synthetic project status is available."] : [],
    limitations: ["This synthetic informational projection grants no permission to act."],
    capsuleHash: null
  };
  const { capsuleHash: _capsuleHash, ...unsigned } = capsule;
  capsule.capsuleHash = sha256Canonical(unsigned);
  return capsule;
}

export function buildTodayBrief(capsule) {
  const brief = {
    documentType: "clover-today-brief",
    schemaVersion: "0.2",
    synthetic: true,
    asOf: capsule.asOf,
    basedOnCapsuleHash: capsule.capsuleHash,
    projects: capsule.items.map((item) => ({
      projectId: item.projectId,
      status: { ...item.status },
      nextMilestone: { ...item.nextMilestone },
      freshness: { observedAt: item.assertedAt, asOf: capsule.asOf },
      sourceContentHash: item.sourceContentHash
    })),
    unknowns: [...capsule.unknowns],
    limitations: [...capsule.limitations],
    briefHash: null
  };
  const { briefHash: _briefHash, ...unsigned } = brief;
  brief.briefHash = sha256Canonical(unsigned);
  return brief;
}

export function rebuildDerivedState(events, options) {
  const capsule = buildContextCapsule(events, options);
  const today = buildTodayBrief(capsule);
  const derived = {
    documentType: "clover-trust-slice-derived-state",
    schemaVersion: "0.2",
    synthetic: true,
    asOf: options.asOf,
    capsule,
    today,
    derivedStateHash: null
  };
  const { derivedStateHash: _derivedStateHash, ...unsigned } = derived;
  derived.derivedStateHash = sha256Canonical(unsigned);
  return derived;
}
