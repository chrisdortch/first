import crypto from "node:crypto";

const FACTOR_KEYS = Object.freeze([
  "deadlineSafetyContinuityRisk",
  "ownerCollaboratorWorkloadReduction",
  "revenueFinancialStability",
  "portfolioSynergyUnblockingValue",
  "readinessAndCostToFinish"
]);

export const PRIORITY_MODEL_VERSION = "0.1-candidate";
export const PRIORITY_WEIGHTS = Object.freeze({
  deadlineSafetyContinuityRisk: 30,
  ownerCollaboratorWorkloadReduction: 25,
  revenueFinancialStability: 20,
  portfolioSynergyUnblockingValue: 15,
  readinessAndCostToFinish: 10
});
export const WIP_LIMITS = Object.freeze({ coreTrunk: 1, affiliatedBranch: 1 });

const PRIORITY_ORDER = Object.freeze({ P0: 0, P1: 1 });
const LANE_KEYS = Object.freeze(Object.keys(WIP_LIMITS));
const EVIDENCE_STATUSES = new Set(["verified", "partially-verified", "reported", "unverified", "unknown"]);
const EVIDENCE_CLASSIFICATIONS = new Set(["source-fact", "owner-direction", "AI-inference", "unknown"]);
const FRESHNESS_LABELS = new Set(["current-task", "same-day", "historical", "unknown"]);
const STATE_CLASSES = new Set(["live", "current", "candidate", "historical"]);
const ELIGIBILITY = new Set(["eligible", "blocked"]);
const REQUESTED_STATES = new Set(["active", "not-started"]);
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._:@/-]*$/;
const FORBIDDEN_SENSITIVE_KEY_PARTS = Object.freeze([
  "address", "contact", "credential", "customer", "email", "financialrecord", "guest",
  "healthrecord", "legalrecord", "message", "order", "password", "payment", "person",
  "phone", "secret", "staff", "token", "transaction"
]);

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
function invariant(condition, message) { if (!condition) throw new Error(message); }
function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function assertAllowedKeys(value, allowed, label) {
  for (const key of Object.keys(value)) invariant(allowed.has(key), `${label} contains unsupported field: ${key}`);
}
function normalizedKey(key) { return key.toLowerCase().replace(/[^a-z0-9]/g, ""); }

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!plainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function computeSelfHash(document, fieldName) {
  invariant(plainObject(document), "self-bound document must be an object");
  const clone = structuredClone(document);
  delete clone[fieldName];
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(canonicalize(clone))).digest("hex")}`;
}

export function assertSanitizedPriorityPayload(value, path = "priorityPayload") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSanitizedPriorityPayload(entry, `${path}[${index}]`));
    return true;
  }
  if (!plainObject(value)) return true;
  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    invariant(!FORBIDDEN_SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part)), `${path}.${key} is a prohibited raw-sensitive field`);
    assertSanitizedPriorityPayload(child, `${path}.${key}`);
  }
  return true;
}

function validateIdentifier(value, label) {
  invariant(typeof value === "string" && IDENTIFIER_PATTERN.test(value), `${label} must be a minimized identifier`);
}
function validateFreshness(value, label) {
  invariant(plainObject(value), `${label} must be an object`);
  assertAllowedKeys(value, new Set(["label", "observedAt"]), label);
  invariant(FRESHNESS_LABELS.has(value.label), `${label}.label is invalid`);
  invariant(value.observedAt === null || /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value.observedAt), `${label}.observedAt is invalid`);
  if (value.label === "unknown") invariant(value.observedAt === null, `${label} with unknown freshness must not claim an observation time`);
}
function validateSource(value, label) {
  invariant(plainObject(value), `${label} must be an object`);
  assertAllowedKeys(value, new Set(["sourceId", "observedAt", "evidenceStatus", "freshness", "stateClass", "exactIdentity"]), label);
  validateIdentifier(value.sourceId, `${label}.sourceId`);
  invariant(value.observedAt === null || /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value.observedAt), `${label}.observedAt is invalid`);
  invariant(EVIDENCE_STATUSES.has(value.evidenceStatus), `${label}.evidenceStatus is invalid`);
  invariant(FRESHNESS_LABELS.has(value.freshness), `${label}.freshness is invalid`);
  invariant(STATE_CLASSES.has(value.stateClass), `${label}.stateClass is invalid`);
  invariant(value.exactIdentity === null || typeof value.exactIdentity === "string", `${label}.exactIdentity is invalid`);
  if (value.freshness === "unknown") invariant(value.observedAt === null, `${label} with unknown freshness must not claim an observation time`);
  if (["unknown", "unverified"].includes(value.evidenceStatus)) invariant(value.exactIdentity === null, `${label} with ${value.evidenceStatus} evidence must not claim an exact identity`);
}
function validateFactor(value, label, sourceIds) {
  invariant(plainObject(value), `${label} must be an object`);
  assertAllowedKeys(value, new Set(["value", "rationale", "evidenceClassification", "evidenceRefs"]), label);
  invariant(value.value === null || (Number.isInteger(value.value) && value.value >= 0 && value.value <= 100), `${label}.value must be null or an integer from 0 to 100`);
  invariant(typeof value.rationale === "string" && value.rationale.length > 0 && value.rationale.length <= 240, `${label}.rationale is invalid`);
  invariant(EVIDENCE_CLASSIFICATIONS.has(value.evidenceClassification), `${label}.evidenceClassification is invalid`);
  invariant(Array.isArray(value.evidenceRefs), `${label}.evidenceRefs must be an array`);
  value.evidenceRefs.forEach((sourceId, index) => {
    validateIdentifier(sourceId, `${label}.evidenceRefs[${index}]`);
    invariant(sourceIds.has(sourceId), `${label}.evidenceRefs references unknown source: ${sourceId}`);
  });
  if (value.value === null) invariant(value.evidenceClassification === "unknown", `${label} with null value must use unknown classification`);
  else {
    invariant(value.evidenceClassification !== "unknown", `${label} with a score must not use unknown classification`);
    invariant(value.evidenceRefs.length > 0, `${label} with a score requires evidenceRefs`);
  }
}

export function validatePriorityInput(input) {
  invariant(plainObject(input), "priority input must be an object");
  assertSanitizedPriorityPayload(input);
  assertAllowedKeys(input, new Set(["schemaVersion", "modelVersion", "priorityInputHash", "asOf", "timezone", "scope", "sourceFreshness", "wipLimits", "sources", "targets"]), "priority input");
  invariant(input.schemaVersion === "0.1", "priority input schemaVersion must be 0.1");
  invariant(input.modelVersion === PRIORITY_MODEL_VERSION, `priority input modelVersion must be ${PRIORITY_MODEL_VERSION}`);
  invariant(input.priorityInputHash === computeSelfHash(input, "priorityInputHash"), "priority input self-hash is stale");
  invariant(/^\d{4}-\d{2}-\d{2}$/.test(input.asOf), "priority input asOf must be YYYY-MM-DD");
  invariant(input.timezone === "America/Chicago", "priority input timezone must be America/Chicago");
  validateIdentifier(input.scope, "priority input scope");
  validateFreshness(input.sourceFreshness, "priority input sourceFreshness");
  invariant(plainObject(input.wipLimits), "priority input wipLimits must be an object");
  assertAllowedKeys(input.wipLimits, new Set(LANE_KEYS), "priority input wipLimits");
  invariant(LANE_KEYS.every((lane) => input.wipLimits[lane] === WIP_LIMITS[lane]), "priority input must use the August 20 candidate WIP limits");

  invariant(Array.isArray(input.sources) && input.sources.length > 0, "priority input sources must be non-empty");
  const sourceIds = new Set();
  input.sources.forEach((source, index) => {
    validateSource(source, `priority input sources[${index}]`);
    invariant(!sourceIds.has(source.sourceId), `priority input source is duplicated: ${source.sourceId}`);
    sourceIds.add(source.sourceId);
  });

  invariant(Array.isArray(input.targets) && input.targets.length > 0, "priority input targets must be non-empty");
  const targetIds = new Set();
  const activeCounts = Object.fromEntries(LANE_KEYS.map((lane) => [lane, 0]));
  input.targets.forEach((target, index) => {
    const label = `priority input targets[${index}]`;
    invariant(plainObject(target), `${label} must be an object`);
    assertAllowedKeys(target, new Set(["targetId", "priority", "lane", "eligibility", "eligibilityReason", "requestedState", "factors", "provenance", "freshness", "unknowns"]), label);
    validateIdentifier(target.targetId, `${label}.targetId`);
    invariant(!targetIds.has(target.targetId), `${label}.targetId is duplicated`);
    targetIds.add(target.targetId);
    invariant(Object.hasOwn(PRIORITY_ORDER, target.priority), `${label}.priority must be P0 or P1`);
    invariant(LANE_KEYS.includes(target.lane), `${label}.lane is invalid`);
    invariant(ELIGIBILITY.has(target.eligibility), `${label}.eligibility is invalid`);
    validateIdentifier(target.eligibilityReason, `${label}.eligibilityReason`);
    invariant(REQUESTED_STATES.has(target.requestedState), `${label}.requestedState is invalid`);
    if (target.requestedState === "active") activeCounts[target.lane] += 1;
    invariant(plainObject(target.factors), `${label}.factors must be an object`);
    assertAllowedKeys(target.factors, new Set(FACTOR_KEYS), `${label}.factors`);
    invariant(Object.keys(target.factors).length === FACTOR_KEYS.length, `${label}.factors must contain all five dimensions`);
    FACTOR_KEYS.forEach((key) => validateFactor(target.factors[key], `${label}.factors.${key}`, sourceIds));
    invariant(Array.isArray(target.provenance) && target.provenance.length > 0, `${label}.provenance must be non-empty`);
    target.provenance.forEach((sourceId, provenanceIndex) => {
      validateIdentifier(sourceId, `${label}.provenance[${provenanceIndex}]`);
      invariant(sourceIds.has(sourceId), `${label}.provenance references unknown source: ${sourceId}`);
    });
    validateFreshness(target.freshness, `${label}.freshness`);
    invariant(Array.isArray(target.unknowns), `${label}.unknowns must be an array`);
    target.unknowns.forEach((entry, unknownIndex) => validateIdentifier(entry, `${label}.unknowns[${unknownIndex}]`));
  });
  LANE_KEYS.forEach((lane) => invariant(activeCounts[lane] <= WIP_LIMITS[lane], `${lane} active work exceeds WIP limit`));
  return true;
}

function compareRankable(left, right) {
  return PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority] || right.weightedScore - left.weightedScore || left.targetId.localeCompare(right.targetId, "en");
}

export function scorePriorityTargets(input) {
  validatePriorityInput(input);
  const evaluated = input.targets.map((target) => {
    const factorResults = Object.fromEntries(FACTOR_KEYS.map((key) => {
      const factor = target.factors[key];
      return [key, {
        value: factor.value,
        weight: PRIORITY_WEIGHTS[key],
        contribution: factor.value === null ? null : round2(factor.value * PRIORITY_WEIGHTS[key] / 100),
        rationale: factor.rationale,
        evidenceClassification: factor.evidenceClassification,
        evidenceRefs: factor.evidenceRefs
      }];
    }));
    const hasUnknownFactor = Object.values(factorResults).some((factor) => factor.value === null);
    const weightedScore = hasUnknownFactor ? null : round2(Object.values(factorResults).reduce((sum, factor) => sum + factor.contribution, 0));
    return {
      targetId: target.targetId, priority: target.priority, lane: target.lane,
      eligibility: target.eligibility, eligibilityReason: target.eligibilityReason,
      requestedState: target.requestedState, weightedScore, hasUnknownFactor, factorResults,
      freshness: target.freshness, provenance: target.provenance,
      unknowns: target.unknowns
    };
  });
  const rankable = evaluated.filter((target) => !target.hasUnknownFactor).sort(compareRankable);
  const unranked = evaluated.filter((target) => target.hasUnknownFactor)
    .sort((left, right) => PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority] || left.targetId.localeCompare(right.targetId, "en"));
  const eligibleRanked = rankable.filter((target) => target.eligibility === "eligible");
  const recommendedAffiliate = eligibleRanked.find((target) => target.lane === "affiliatedBranch") ?? null;
  const activeByLane = Object.fromEntries(LANE_KEYS.map((lane) => [lane, []]));
  for (const target of rankable) {
    if (target.requestedState === "active" && target.eligibility === "eligible") activeByLane[target.lane].push(target.targetId);
  }
  const reservedByLane = Object.fromEntries(LANE_KEYS.map((lane) => [lane, []]));
  if (recommendedAffiliate && activeByLane.affiliatedBranch.length < WIP_LIMITS.affiliatedBranch) reservedByLane.affiliatedBranch.push(recommendedAffiliate.targetId);

  const ranking = [...rankable, ...unranked].map((target) => {
    const rank = target.hasUnknownFactor ? null : rankable.findIndex((entry) => entry.targetId === target.targetId) + 1;
    const isRecommendedAffiliate = recommendedAffiliate?.targetId === target.targetId;
    let status = "queued";
    if (target.hasUnknownFactor) status = "blocked-unknown";
    else if (target.eligibility === "blocked") status = "blocked";
    else if (target.requestedState === "active") status = "active";
    else if (isRecommendedAffiliate) status = "selected-pending-owner-gate";
    const factorContributions = Object.fromEntries(Object.entries(target.factorResults).map(([key, factor]) => [key, factor.contribution]));
    const factorEvidenceClassifications = Object.fromEntries(Object.entries(target.factorResults).map(([key, factor]) => [key, factor.evidenceClassification]));
    const factorRationales = Object.fromEntries(Object.entries(target.factorResults).map(([key, factor]) => [key, factor.rationale]));
    const { factorResults: omittedFactorResults, ...publicTarget } = target;
    void omittedFactorResults;
    return {
      ...publicTarget,
      factorContributions,
      factorEvidenceClassifications,
      factorRationales,
      rank,
      selected: target.requestedState === "active" || isRecommendedAffiliate,
      laneReservation: isRecommendedAffiliate,
      status
    };
  });
  const output = {
    schemaVersion: "0.1", modelVersion: PRIORITY_MODEL_VERSION, asOf: input.asOf,
    priorityInputHash: input.priorityInputHash,
    timezone: input.timezone, scope: input.scope, sourceFreshness: input.sourceFreshness,
    weights: PRIORITY_WEIGHTS, wipLimits: WIP_LIMITS, ranking,
    top3Overall: ranking.filter((target) => target.rank !== null).slice(0, 3).map((target) => ({
      targetId: target.targetId,
      overallRank: target.rank,
      weightedScore: target.weightedScore,
      eligibility: target.eligibility,
      status: target.status,
      rationales: target.factorRationales
    })),
    top3Eligible: eligibleRanked.slice(0, 3).map((target, index) => ({
      targetId: target.targetId,
      eligibleRank: index + 1,
      overallRank: rankable.findIndex((entry) => entry.targetId === target.targetId) + 1,
      weightedScore: target.weightedScore
    })),
    recommendedAffiliatedTargetId: recommendedAffiliate?.targetId ?? null,
    activeByLane, reservedByLane
  };
  return { ...output, priorityOutputHash: computeSelfHash(output, "priorityOutputHash") };
}

export function calculateWeightedMetric(components) {
  invariant(Array.isArray(components) && components.length > 0, "metric components must be non-empty");
  const ids = new Set();
  let totalWeight = 0;
  let weightedRaw = 0;
  components.forEach((component, index) => {
    const label = `metric component[${index}]`;
    invariant(plainObject(component), `${label} must be an object`);
    validateIdentifier(component.id, `${label}.id`);
    invariant(!ids.has(component.id), `${label}.id is duplicated`);
    ids.add(component.id);
    invariant(Number.isFinite(component.weight) && component.weight > 0, `${label}.weight is invalid`);
    invariant(Number.isFinite(component.completionEstimate) && component.completionEstimate >= 0 && component.completionEstimate <= 100, `${label}.completionEstimate is invalid`);
    totalWeight += component.weight;
    weightedRaw += component.weight * component.completionEstimate / 100;
  });
  invariant(round2(totalWeight) === 100, `metric component weights total ${round2(totalWeight)}, not 100`);
  return { weightedRawCompletion: round2(weightedRaw), completionEstimate: Math.round(weightedRaw) };
}
