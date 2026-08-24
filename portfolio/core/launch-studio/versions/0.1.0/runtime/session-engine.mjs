import { canonicalize, cloneJson, sha256Canonical } from "../../../../lib/canonical-json.mjs";
import { APPROVAL_RAILS, CAPABILITY_CLASSES, MATERIAL_PROGRESS_EVENT_TYPES, assertAuthorityReference, assertBuildCharter, assertExecutorWorkOrder, assertSafeRepositoryPath, assertSafeRepositoryPattern, parseCanonicalTimestamp, validateContract } from "./contracts.mjs";

export const SESSION_STATES = Object.freeze([
  "captured", "understanding_pending", "understanding_confirmed", "context_grounded", "impact_scanned",
  "charter_pending", "charter_approved", "execution_proposed", "execution_authority_pending", "worktree_ready",
  "building", "validating", "preview_ready", "preview_review_pending", "revision_requested", "revising",
  "preview_accepted", "merge_proposed", "merge_approved", "merged", "production_proposed", "production_approved",
  "production_completed", "fruit_observation_pending", "completed", "held", "failed", "cancelled", "rolled_back"
]);

export const TERMINAL_STATES = Object.freeze(["completed", "held", "failed", "cancelled", "rolled_back"]);
const TERMINAL_STATE_SET = new Set(TERMINAL_STATES);

const FORWARD = Object.freeze({
  captured: ["understanding_pending"],
  understanding_pending: ["understanding_confirmed"],
  understanding_confirmed: ["context_grounded"],
  context_grounded: ["impact_scanned"],
  impact_scanned: ["charter_pending"],
  charter_pending: ["charter_approved"],
  charter_approved: ["execution_proposed"],
  execution_proposed: ["execution_authority_pending"],
  execution_authority_pending: ["worktree_ready"],
  worktree_ready: ["building"],
  building: ["validating"],
  validating: ["preview_ready", "revision_requested"],
  preview_ready: ["preview_review_pending"],
  preview_review_pending: ["revision_requested", "preview_accepted"],
  revision_requested: ["revising"],
  revising: ["validating"],
  preview_accepted: ["merge_proposed"],
  merge_proposed: ["merge_approved"],
  merge_approved: ["merged"],
  merged: ["production_proposed"],
  production_proposed: ["production_approved"],
  production_approved: ["production_completed"],
  production_completed: ["fruit_observation_pending"],
  fruit_observation_pending: ["completed"]
});

const APPROVAL_FOR_STATE = Object.freeze({
  charter_approved: "APPROVE_BUILD_CHARTER",
  preview_accepted: "ACCEPT_PREVIEW_CANDIDATE",
  merge_approved: "APPROVE_MERGE",
  production_approved: "APPROVE_PRODUCTION"
});
const APPROVAL_SCOPE_FOR_STATE = Object.freeze({ charter_approved: "build-charter", preview_accepted: "preview-candidate", merge_approved: "merge", production_approved: "production" });
const COMPENSATABLE_STATES = new Set([
  "worktree_ready", "building", "validating", "preview_ready", "preview_review_pending", "revision_requested", "revising",
  "preview_accepted", "merge_proposed", "merge_approved", "merged", "production_proposed", "production_approved", "production_completed"
]);
const EFFECTFUL_STATES_UNSUPPORTED_IN_PHASE_A = new Set(["worktree_ready", "preview_ready", "merge_approved", "merged", "production_approved", "production_completed", "rolled_back"]);
const SAME_STATE_PROGRESS = Object.freeze({
  model_resolved: new Set(["execution_proposed", "execution_authority_pending", "worktree_ready", "building", "validating", "revision_requested", "revising"]),
  source_delta_recorded: new Set(["building", "revising"]),
  diagnosis_summary: new Set(["revision_requested", "revising"])
});
const EVENT_TYPES_BY_TRANSITION = Object.freeze({
  "null->captured": ["session_created"], "captured->understanding_pending": ["owner_event_captured", "understanding_proposed"],
  "understanding_pending->understanding_confirmed": ["understanding_confirmed"], "understanding_confirmed->context_grounded": ["context_loaded"],
  "context_grounded->impact_scanned": ["impact_scan_completed"], "impact_scanned->charter_pending": ["charter_proposed"],
  "charter_pending->charter_approved": ["decision_required"], "charter_approved->execution_proposed": ["authority_proposed"],
  "execution_proposed->execution_authority_pending": ["decision_required"], "execution_authority_pending->worktree_ready": ["worktree_created"],
  "worktree_ready->building": ["build_started"], "building->validating": ["tests_started"], "validating->preview_ready": ["tests_completed", "preview_created"],
  "preview_ready->preview_review_pending": ["preview_verified"], "preview_review_pending->revision_requested": ["owner_feedback_received"],
  "revision_requested->revising": ["repair_loop_started"], "revising->validating": ["revision_completed", "repair_loop_completed", "tests_started"],
  "validating->revision_requested": ["failure_detected"],
  "preview_review_pending->preview_accepted": ["decision_required"], "preview_accepted->merge_proposed": ["authority_proposed"],
  "merge_proposed->merge_approved": ["decision_required"], "merge_approved->merged": ["receipt_created"],
  "merged->production_proposed": ["authority_proposed"], "production_proposed->production_approved": ["decision_required"],
  "production_approved->production_completed": ["receipt_created"], "production_completed->fruit_observation_pending": ["receipt_created"],
  "fruit_observation_pending->completed": ["session_completed"]
});

function unsignedEvent(event) {
  const { eventHash: _eventHash, ...unsigned } = event;
  return unsigned;
}

function pathMatchesAllowed(candidate, allowed) {
  return allowed.some((pattern) => pattern.endsWith("/**") ? candidate.startsWith(pattern.slice(0, -2)) && candidate.length > pattern.length - 2 : candidate === pattern);
}

export function createSessionEvent(input, previous = null) {
  const recordedAt = parseCanonicalTimestamp(input.recordedAt, "session event recordedAt");
  const expectedSequence = previous ? previous.sequence + 1 : 1;
  const expectedVersion = previous ? previous.resultingSessionVersion : 0;
  if (input.sequence !== expectedSequence) throw new Error(`Expected event sequence ${expectedSequence}`);
  if (input.expectedSessionVersion !== expectedVersion) throw new Error(`Expected session version ${expectedVersion}`);
  const fromState = previous ? previous.toState : null;
  if (input.fromState !== fromState) throw new Error(`Event fromState must be ${fromState}`);
  if (!SESSION_STATES.includes(input.toState)) throw new Error(`Unsupported session state ${input.toState}`);
  if (!MATERIAL_PROGRESS_EVENT_TYPES.includes(input.eventType)) throw new Error(`Unsupported material-progress event type ${input.eventType}`);
  if (!previous) {
    if (input.eventType !== "session_created" || input.toState !== "captured") throw new Error("First event must create a captured session");
    if (!input.ownerPrincipal || input.ownerPrincipal.role !== "Owner" || canonicalize(input.ownerPrincipal) !== canonicalize(input.actor)) throw new Error("Session genesis must bind the exact Owner principal to its captured owner actor");
  } else {
    if (input.sessionId !== previous.sessionId || input.workspaceId !== previous.workspaceId || input.projectId !== previous.projectId) {
      throw new Error("Session, workspace, or project identity substitution rejected");
    }
    if (TERMINAL_STATE_SET.has(fromState)) throw new Error(`Terminal session state ${fromState} cannot transition`);
    if (!input.sessionBudget || !previous.sessionBudget || canonicalize(input.sessionBudget) !== canonicalize(previous.sessionBudget)) throw new Error("Session budget policy cannot be introduced or substituted after session creation");
    if (!input.ownerPrincipal || canonicalize(input.ownerPrincipal) !== canonicalize(previous.ownerPrincipal)) throw new Error("Session Owner principal binding cannot be introduced or substituted");
    const normal = FORWARD[fromState] || [];
    const interrupt = ["held", "failed", "cancelled"];
    const compensation = COMPENSATABLE_STATES.has(fromState) ? ["rolled_back"] : [];
    const sameStateProgress = input.toState === fromState && SAME_STATE_PROGRESS[input.eventType]?.has(fromState);
    if (!sameStateProgress && ![...normal, ...interrupt, ...compensation].includes(input.toState)) {
      throw new Error(`Illegal transition ${fromState} -> ${input.toState}`);
    }
    if (recordedAt < parseCanonicalTimestamp(previous.recordedAt, "previous session event recordedAt")) throw new Error("Event time cannot move backwards");
  }
  const sameStateEventTypes = input.fromState === input.toState ? Object.entries(SAME_STATE_PROGRESS).filter(([, states]) => states.has(input.fromState)).map(([eventType]) => eventType) : null;
  const expectedEventTypes = sameStateEventTypes || (input.toState === "held" ? ["session_held"] : input.toState === "failed" ? ["failure_detected"] : input.toState === "cancelled" ? ["decision_required"] : input.toState === "rolled_back" ? ["receipt_created"] : EVENT_TYPES_BY_TRANSITION[`${input.fromState}->${input.toState}`]);
  if (!expectedEventTypes?.includes(input.eventType)) throw new Error(`Event type ${input.eventType} is not truthful for transition ${input.fromState} -> ${input.toState}`);
  if (input.eventType === "failure_detected" && !input.failureSignature) throw new Error("failure_detected requires an exact failure signature");
  if (input.eventType !== "failure_detected" && input.failureSignature !== null) throw new Error("Failure signature is only valid on failure_detected events");
  if (input.eventType === "source_delta_recorded" && (!Array.isArray(input.changedPaths) || input.changedPaths.length === 0)) throw new Error("source_delta_recorded requires at least one exact changed path");
  const priorRepairLoopCount = previous ? previous.repairLoopCount : 0;
  if (input.eventType === "repair_loop_started") {
    if (input.repairLoopCount !== priorRepairLoopCount + 1) throw new Error("Repair loop counter must increment exactly when a repair loop starts");
  } else if ((input.repairLoopCount || 0) !== priorRepairLoopCount) throw new Error("Repair loop counter cannot jump, decrease, or reset");
  if (!Array.isArray(input.evidence) || input.evidence.length === 0) throw new Error("Material progress event requires evidence");
  (input.changedPaths || []).forEach((entry) => assertSafeRepositoryPath(entry, "changed path"));
  for (const evidence of input.evidence) {
    if (!evidence.evidenceId || !/^[a-f0-9]{64}$/u.test(evidence.contentHash)) throw new Error("Progress evidence is incomplete");
  }
  const requiredDecision = APPROVAL_FOR_STATE[input.toState];
  if (requiredDecision && input.ownerDecision !== requiredDecision) throw new Error(`${input.toState} requires ${requiredDecision}`);
  if (requiredDecision && (!input.authorityReference || input.authorityReference.scope !== APPROVAL_SCOPE_FOR_STATE[input.toState] || input.authorityReference.approvalRail !== requiredDecision)) throw new Error(`${input.toState} requires an exact ${requiredDecision} Clover Handoff reference`);
  if (requiredDecision && (input.authorityReference.boundSessionId !== input.sessionId || input.authorityReference.boundProjectId !== input.projectId)) throw new Error(`${input.toState} Handoff approval scope does not bind the exact session and project`);
  if (requiredDecision && !input.ownerDecisionBinding) throw new Error(`${input.toState} requires an explicit immutable owner decision binding`);
  if (requiredDecision) {
    const statements = { APPROVE_BUILD_CHARTER: "APPROVE BUILD CHARTER", ACCEPT_PREVIEW_CANDIDATE: "ACCEPT PREVIEW CANDIDATE", APPROVE_MERGE: "APPROVE MERGE", APPROVE_PRODUCTION: "APPROVE PRODUCTION" };
    if (input.actor.role !== "Owner" || canonicalize(input.actor) !== canonicalize(input.ownerPrincipal)) throw new Error(`${input.toState} requires the exact immutable session Owner principal as decision actor`);
    if (input.ownerDecisionBinding.statement !== statements[requiredDecision] || input.ownerDecisionBinding.boundRecordId !== input.authorityReference.boundRecordId || input.ownerDecisionBinding.boundRecordHash !== input.authorityReference.boundRecordHash || canonicalize(input.ownerDecisionBinding.actor) !== canonicalize(input.actor)) throw new Error(`${input.toState} owner decision artifact binding mismatch`);
    const decidedAt = parseCanonicalTimestamp(input.ownerDecisionBinding.decidedAt, "owner decision decidedAt");
    const authorityCreatedAt = parseCanonicalTimestamp(input.authorityReference.createdAt, "approval authority reference createdAt");
    const proposalAt = previous ? parseCanonicalTimestamp(previous.recordedAt, "approval proposal event time") : recordedAt;
    if (decidedAt < proposalAt || decidedAt < authorityCreatedAt || decidedAt > recordedAt) throw new Error("Owner decision chronology must follow its proposal and authority reference and cannot postdate its event");
    if (!input.evidence.some((entry) => entry.contentHash === input.authorityReference.boundRecordHash) || !input.evidence.some((entry) => entry.contentHash === sha256Canonical(input.ownerDecisionBinding))) throw new Error(`${input.toState} evidence does not bind its exact approval artifact and decision`);
    if (input.authorityReference.synthetic === true && input.authorityReference.lifecycle !== "proposed") throw new Error("Synthetic approval reference lifecycle must remain proposed and non-authorizing");
    if (input.authorityReference.synthetic !== true && input.authorityReference.lifecycle !== "approved") throw new Error("Nonsynthetic approval reference lifecycle must be exact Handoff-approved before consideration");
    if (input.toState !== "charter_approved" || input.synthetic !== true || input.ownerDecisionBinding.synthetic !== true || input.ownerDecisionBinding.nonAuthorizing !== true || input.authorityReference.synthetic !== true || input.authorityReference.nonAuthorizing !== true) throw new Error("Phase A supports only an explicit synthetic non-authorizing Charter decision; other approval rails require a later exact Handoff adapter");
  }
  if (!requiredDecision && (input.ownerDecision !== null || input.ownerDecisionBinding !== null)) throw new Error("Owner approval cannot be inherited by another transition");
  if (input.ownerDecision !== null && !APPROVAL_RAILS.includes(input.ownerDecision)) throw new Error("Unknown owner decision rail");
  if (EFFECTFUL_STATES_UNSUPPORTED_IN_PHASE_A.has(input.toState)) throw new Error(`Transition to ${input.toState} is fail-closed in Launch Studio 0.1 until an exact Handoff execution/candidate adapter exists`);
  if (previous?.authorityReference && input.authorityReference && previous.authorityReference.referenceId === input.authorityReference.referenceId && canonicalize(previous.authorityReference) !== canonicalize(input.authorityReference)) throw new Error("Handoff authority reference provenance is immutable across the session event stream");
  if (input.authorityReference !== null) assertAuthorityReference(input.authorityReference, { at: input.recordedAt });
  const approvedBuildCharter = input.approvedBuildCharter || null;
  if (input.toState === "charter_approved") {
    if (!approvedBuildCharter) throw new Error("Charter approval must persist the exact approved Build Charter snapshot");
    assertBuildCharter(approvedBuildCharter);
    if (approvedBuildCharter.sessionId !== input.sessionId ||
        approvedBuildCharter.recordId !== input.authorityReference.boundRecordId ||
        approvedBuildCharter.recordHash !== input.authorityReference.boundRecordHash ||
        approvedBuildCharter.budgetId !== input.sessionBudget?.recordId ||
        sha256Canonical(approvedBuildCharter.allowedPaths) !== input.authorityReference.boundAllowedPathsHash ||
        sha256Canonical(approvedBuildCharter.prohibitedEffects) !== input.authorityReference.boundProhibitedEffectsHash) {
      throw new Error("Approved Build Charter snapshot does not match its exact decision, budget, path, or effect binding");
    }
    if (!previous?.evidence.some((entry) => entry.contentHash === approvedBuildCharter.recordHash)) throw new Error("Charter approval does not descend from the exact proposed Build Charter evidence");
  } else if (approvedBuildCharter !== null) throw new Error("Approved Build Charter snapshot is only valid on the Charter approval transition");
  const workOrder = input.executorWorkOrder || null;
  if (workOrder) {
    if (input.fromState !== "charter_approved" || input.toState !== "execution_proposed" || input.eventType !== "authority_proposed" || previous?.executorWorkOrderBinding !== null) throw new Error("A full Executor Work Order may originate only at the exact execution-proposal transition");
    assertExecutorWorkOrder(workOrder);
    if (workOrder.sessionId !== input.sessionId || workOrder.workspaceId !== input.workspaceId || workOrder.projectId !== input.projectId) throw new Error("Executor Work Order event scope substitution rejected");
    if (workOrder.sessionUsageCeilingId !== input.sessionBudget?.recordId) throw new Error("Executor Work Order does not bind the exact event-bound session budget policy");
    const charter = previous?.approvedBuildCharter;
    if (!charter || previous?.authorityReference?.scope !== "build-charter" || workOrder.charterId !== charter.recordId || charter.recordHash !== previous.authorityReference.boundRecordHash) throw new Error("Executor Work Order does not descend from the exact approved Build Charter");
    assertBuildCharter(charter);
    if (workOrder.handoffAuthorityReferenceId !== input.authorityReference?.referenceId ||
        `${workOrder.repository}@${workOrder.baseCommit}` !== charter.sourceAnchor ||
        workOrder.contextPackHash !== charter.contextPackHash ||
        workOrder.impactScanHash !== charter.impactScanHash ||
        canonicalize(workOrder.allowedPaths) !== canonicalize(charter.allowedPaths) ||
        canonicalize(workOrder.prohibitedEffects) !== canonicalize(charter.prohibitedEffects) ||
        canonicalize(workOrder.deliverables) !== canonicalize(charter.deliverables) ||
        canonicalize(workOrder.testPlan) !== canonicalize(charter.testPlan) ||
        canonicalize(workOrder.progressEventContract) !== canonicalize(charter.progressReportingContract) ||
        canonicalize(workOrder.stopConditions) !== canonicalize(charter.stopConditions) ||
        workOrder.repairLoopBudget !== charter.repairLoopLimit ||
        workOrder.repairLoopBudget > input.sessionBudget.maximumRepairLoops) {
      throw new Error("Executor Work Order widens or substitutes its exact approved Build Charter lineage");
    }
  }
  const derivedWorkOrderBinding = workOrder ? {
    recordId: workOrder.recordId,
    recordHash: workOrder.recordHash,
    repository: workOrder.repository,
    baseCommit: workOrder.baseCommit,
    allowedPaths: cloneJson(workOrder.allowedPaths),
    allowedPathsHash: sha256Canonical(workOrder.allowedPaths),
    prohibitedEffects: cloneJson(workOrder.prohibitedEffects),
    prohibitedEffectsHash: sha256Canonical(workOrder.prohibitedEffects),
    modelCapabilityPolicy: cloneJson(workOrder.modelCapabilityPolicy),
    approvedCharterId: previous.approvedBuildCharter.recordId,
    approvedCharterHash: previous.approvedBuildCharter.recordHash,
    handoffAuthorityReferenceId: workOrder.handoffAuthorityReferenceId,
    handoffAuthorityReferenceHash: sha256Canonical(input.authorityReference),
    contextPackHash: workOrder.contextPackHash,
    impactScanHash: workOrder.impactScanHash,
    sessionUsageCeilingId: workOrder.sessionUsageCeilingId,
    deliverablesHash: sha256Canonical(workOrder.deliverables),
    testPlanHash: sha256Canonical(workOrder.testPlan),
    progressEventContractHash: sha256Canonical(workOrder.progressEventContract),
    stopConditionsHash: sha256Canonical(workOrder.stopConditions),
    repairLoopBudget: workOrder.repairLoopBudget
  } : null;
  const priorWorkOrderBinding = previous?.executorWorkOrderBinding || null;
  if (!workOrder && !priorWorkOrderBinding && input.executorWorkOrderBinding !== null) throw new Error("Executor Work Order binding cannot be introduced without the full validated Work Order at execution proposal");
  if (!workOrder && priorWorkOrderBinding && input.executorWorkOrderBinding !== null && canonicalize(input.executorWorkOrderBinding) !== canonicalize(priorWorkOrderBinding)) throw new Error("Executor Work Order binding substitution rejected");
  if (workOrder && input.executorWorkOrderBinding !== null && canonicalize(input.executorWorkOrderBinding) !== canonicalize(derivedWorkOrderBinding)) throw new Error("Executor Work Order derived binding mismatch");
  const workOrderBinding = derivedWorkOrderBinding || priorWorkOrderBinding;
  if (workOrderBinding) {
    workOrderBinding.allowedPaths.forEach((entry) => assertSafeRepositoryPattern(entry, "bound Executor Work Order path"));
    if (workOrderBinding.allowedPathsHash !== sha256Canonical(workOrderBinding.allowedPaths) || workOrderBinding.prohibitedEffectsHash !== sha256Canonical(workOrderBinding.prohibitedEffects) || new Set(workOrderBinding.modelCapabilityPolicy).size !== workOrderBinding.modelCapabilityPolicy.length || workOrderBinding.modelCapabilityPolicy.some((entry) => !CAPABILITY_CLASSES.includes(entry))) throw new Error("Executor Work Order event binding hash or capability policy mismatch");
  }
  if (["execution_proposed", "execution_authority_pending"].includes(input.toState) || (input.toState === "held" && input.fromState === "execution_authority_pending")) {
    if (!workOrderBinding || !input.authorityReference || input.authorityReference.synthetic !== true || input.authorityReference.nonAuthorizing !== true || input.authorityReference.lifecycle !== "proposed" || input.authorityReference.referenceId !== workOrderBinding.handoffAuthorityReferenceId || sha256Canonical(input.authorityReference) !== workOrderBinding.handoffAuthorityReferenceHash || input.authorityReference.scope !== "executor-work-order" || input.authorityReference.boundRecordId !== workOrderBinding.recordId || input.authorityReference.boundRecordHash !== workOrderBinding.recordHash || input.authorityReference.boundSessionId !== input.sessionId || input.authorityReference.boundProjectId !== input.projectId || input.authorityReference.boundRepository !== workOrderBinding.repository || input.authorityReference.boundBaseCommit !== workOrderBinding.baseCommit || input.authorityReference.boundAllowedPathsHash !== workOrderBinding.allowedPathsHash || input.authorityReference.boundProhibitedEffectsHash !== workOrderBinding.prohibitedEffectsHash || !input.evidence.some((entry) => entry.contentHash === workOrderBinding.recordHash)) throw new Error("Execution proposal/hold event does not bind the exact separate proposed non-authorizing Executor Work Order authority reference");
  }
  if ((input.changedPaths || []).length > 0 && (!workOrderBinding || input.changedPaths.some((entry) => !pathMatchesAllowed(entry, workOrderBinding.allowedPaths)))) throw new Error("Changed path exceeds the exact Executor Work Order allowed paths");
  if ((input.externalEffects || []).length > 0) throw new Error("Launch Studio 0.1 records no performed external effect without an exact Handoff execution-receipt adapter");
  if (input.eventType === "model_resolved") {
    if (!input.modelResolution || !workOrderBinding || !CAPABILITY_CLASSES.includes(input.modelResolution.capabilityClass) || !workOrderBinding.modelCapabilityPolicy.includes(input.modelResolution.capabilityClass) || input.modelResolution.resolvedAt !== input.recordedAt) throw new Error("model_resolved requires an exact Work Order capability, model identity, and event-time binding");
    parseCanonicalTimestamp(input.modelResolution.resolvedAt, "model resolution resolvedAt");
  } else if (input.modelResolution !== null) throw new Error("Model resolution payload is only valid on model_resolved events");
  if (!input.sessionBudget) throw new Error("Session event requires an exact bound budget policy");
  validateContract("session-budget.schema.json", input.sessionBudget, "session event budget");
  const event = {
    documentType: "clover-launch-session-event",
    schemaVersion: "0.1.0",
    eventId: input.eventId,
    idempotencyKey: input.idempotencyKey,
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    sequence: input.sequence,
    expectedSessionVersion: input.expectedSessionVersion,
    resultingSessionVersion: input.expectedSessionVersion + 1,
    predecessorEventHash: previous ? previous.eventHash : null,
    recordedAt: input.recordedAt,
    eventType: input.eventType,
    fromState: input.fromState,
    toState: input.toState,
    actor: cloneJson(input.actor),
    ownerPrincipal: cloneJson(input.ownerPrincipal),
    conciseStatus: input.conciseStatus,
    materialDelta: input.materialDelta,
    evidence: cloneJson(input.evidence),
    changedPaths: cloneJson(input.changedPaths || []),
    testCounts: input.testCounts || null,
    failureSignature: input.failureSignature || null,
    repairLoopCount: input.repairLoopCount || 0,
    knownUnknowns: cloneJson(input.knownUnknowns || []),
    nextOwnerDecision: input.nextOwnerDecision || null,
    ownerDecision: input.ownerDecision,
    ownerDecisionBinding: input.ownerDecisionBinding ? cloneJson(input.ownerDecisionBinding) : null,
    authorityReference: input.authorityReference ? cloneJson(input.authorityReference) : null,
    approvedBuildCharter: approvedBuildCharter ? cloneJson(approvedBuildCharter) : null,
    executorWorkOrder: workOrder ? cloneJson(workOrder) : null,
    executorWorkOrderBinding: workOrderBinding ? cloneJson(workOrderBinding) : null,
    modelResolution: input.modelResolution ? cloneJson(input.modelResolution) : null,
    sessionBudgetId: input.sessionBudget?.recordId,
    sessionBudgetHash: input.sessionBudget ? sha256Canonical(input.sessionBudget) : null,
    sessionBudget: input.sessionBudget ? cloneJson(input.sessionBudget) : null,
    budgetDelta: cloneJson(input.budgetDelta || { modelCalls: 0, implementationAgents: 0, ciRuns: 0, previews: 0, elapsedMinutes: 0, providerUsage: 0, purchaseUsd: 0 }),
    synthetic: input.synthetic === true,
    externalEffects: cloneJson(input.externalEffects || []),
    consequentialAuthorityGranted: false,
    eventHash: null
  };
  event.eventHash = sha256Canonical(unsignedEvent(event));
  validateContract("launch-session-event.schema.json", event, event.eventId);
  return event;
}

export function verifySessionEvents(events, options = {}) {
  if (!Array.isArray(events) || events.length === 0) throw new Error("Session event stream is empty");
  const eventIds = new Set();
  const idempotency = new Map();
  let previous = null;
  let boundBudget = null;
  const approvals = new Map();
  const resolvedModels = new Map();
  const externalEffects = [];
  const effectIds = new Set();
  const failureCounts = new Map();
  let previousFailureEvidenceHash = null;
  let repairBlockedReason = null;
  const budget = { modelCalls: 0, implementationAgents: 0, ciRuns: 0, previews: 0, elapsedMinutes: 0, providerUsage: 0, purchaseUsd: 0, repairLoops: 0 };
  for (const stored of events) {
    if (!stored.sessionBudget) throw new Error("Session event omits its exact budget policy");
    validateContract("session-budget.schema.json", stored.sessionBudget, "session event budget");
    if (stored.sessionBudgetId !== stored.sessionBudget.recordId || stored.sessionBudgetHash !== sha256Canonical(stored.sessionBudget)) throw new Error("Session budget binding mismatch");
    if (boundBudget === null) boundBudget = stored.sessionBudget;
    else if (canonicalize(boundBudget) !== canonicalize(stored.sessionBudget)) throw new Error("Session budget substitution detected");
    validateContract("launch-session-event.schema.json", stored, stored.eventId || "stored session event");
    const rebuilt = createSessionEvent(stored, previous);
    if (canonicalize(rebuilt) !== canonicalize(stored) || rebuilt.eventHash !== stored.eventHash) throw new Error(`Event tampering at ${stored.eventId}`);
    if (eventIds.has(stored.eventId)) throw new Error(`Duplicate event ID ${stored.eventId}`);
    const priorHash = idempotency.get(stored.idempotencyKey);
    if (priorHash && priorHash !== stored.eventHash) throw new Error(`Idempotency replay conflict ${stored.idempotencyKey}`);
    if (priorHash) throw new Error(`Repeated event ${stored.eventId}`);
    eventIds.add(stored.eventId);
    idempotency.set(stored.idempotencyKey, stored.eventHash);
    if (stored.ownerDecision) {
      if (approvals.has(stored.ownerDecision)) throw new Error(`Approval rail ${stored.ownerDecision} was replayed`);
      approvals.set(stored.ownerDecision, stored.eventHash);
    }
    for (const key of ["modelCalls", "implementationAgents", "ciRuns", "previews", "elapsedMinutes", "providerUsage", "purchaseUsd"]) budget[key] += stored.budgetDelta[key];
    if (stored.modelResolution) {
      if (resolvedModels.has(stored.modelResolution.capabilityClass)) throw new Error(`Model capability ${stored.modelResolution.capabilityClass} was resolved more than once`);
      resolvedModels.set(stored.modelResolution.capabilityClass, stored.modelResolution);
    }
    if (stored.eventType === "failure_detected") {
      const count = (failureCounts.get(stored.failureSignature) || 0) + 1;
      failureCounts.set(stored.failureSignature, count);
      const evidenceHash = sha256Canonical(stored.evidence);
      if (count >= 2) repairBlockedReason = "repeated-failure";
      if (previousFailureEvidenceHash === evidenceHash) repairBlockedReason = "no-new-evidence";
      previousFailureEvidenceHash = evidenceHash;
    }
    for (const effect of stored.externalEffects) {
      if (effectIds.has(effect.effectId)) throw new Error(`External effect ${effect.effectId} was replayed`);
      effectIds.add(effect.effectId);
      externalEffects.push(effect);
    }
    const priorRepairLoops = previous ? previous.repairLoopCount : 0;
    if (stored.eventType === "repair_loop_started") {
      if (repairBlockedReason) throw new Error(`Repair loop must stop after ${repairBlockedReason}`);
      if (stored.repairLoopCount !== priorRepairLoops + 1) throw new Error("Repair loop counter must increment exactly when a repair loop starts");
    } else if (stored.repairLoopCount !== priorRepairLoops) throw new Error("Repair loop counter cannot jump, decrease, or reset");
    budget.repairLoops = stored.repairLoopCount;
    previous = stored;
  }
  if (options.budget && canonicalize(options.budget) !== canonicalize(boundBudget)) throw new Error("Caller budget differs from event-bound policy");
  budget.elapsedMinutes = Math.max(budget.elapsedMinutes, Math.ceil((parseCanonicalTimestamp(events.at(-1).recordedAt) - parseCanonicalTimestamp(events[0].recordedAt)) / 60_000));
  enforceBudget(budget, boundBudget);
  return {
    valid: true,
    sessionId: events[0].sessionId,
    workspaceId: events[0].workspaceId,
    projectId: events[0].projectId,
    state: previous.toState,
    version: previous.resultingSessionVersion,
    eventCount: events.length,
    headEventHash: previous.eventHash,
    approvals: Object.fromEntries(approvals),
    resolvedModels: [...resolvedModels.values()],
    externalEffects,
    usage: budget
  };
}

export function appendSessionEvent(events, input, options = {}) {
  if (events.length > 0) verifySessionEvents(events, options);
  const exactIndex = events.findIndex((event) => event.idempotencyKey === input.idempotencyKey);
  const exact = exactIndex === -1 ? null : events[exactIndex];
  if (exact) {
    const candidate = createSessionEvent(input, exactIndex > 0 ? events[exactIndex - 1] : null);
    if (candidate.eventHash === exact.eventHash) return { events, event: exact, idempotent: true };
    throw new Error(`Idempotency conflict for ${input.idempotencyKey}`);
  }
  const event = createSessionEvent(input, events.at(-1) || null);
  const result = [...events, event];
  verifySessionEvents(result, options);
  return { events: result, event, idempotent: false };
}

export function enforceBudget(usage, policy) {
  const limits = [
    ["modelCalls", "maximumModelCalls"], ["implementationAgents", "maximumImplementationAgents"], ["ciRuns", "maximumProviderCiRuns"],
    ["previews", "maximumTargetNullPreviews"], ["elapsedMinutes", "maximumElapsedMinutes"],
    ["repairLoops", "maximumRepairLoops"]
  ];
  for (const [actual, limit] of limits) {
    if (!Number.isInteger(usage[actual]) || usage[actual] < 0) throw new Error(`Session budget usage is invalid: ${actual}`);
    if (usage[actual] > policy[limit]) throw new Error(`Session budget exceeded: ${actual}`);
  }
  if (policy.explicitPurchaseCeilingUsd !== 0 || policy.automaticAdditionalCreditPurchase !== false) {
    throw new Error("Synthetic session budget must prohibit purchases");
  }
  if (!Number.isFinite(usage.providerUsage) || usage.providerUsage < 0 || usage.providerUsage > policy.providerUsageCeiling.maximum) throw new Error("Session budget exceeded: providerUsage");
  if (!Number.isFinite(usage.purchaseUsd) || usage.purchaseUsd < 0 || usage.purchaseUsd > policy.explicitPurchaseCeilingUsd) throw new Error("Session budget exceeded: purchaseUsd");
  return true;
}

export function shouldStopRepair({ repairLoopCount, maximumRepairLoops, repeatedFailureCount, evidenceHash, previousEvidenceHash }) {
  if (repairLoopCount >= maximumRepairLoops) return { stop: true, reason: "repair-loop-limit" };
  if (repeatedFailureCount >= 2) return { stop: true, reason: "repeated-failure" };
  if (previousEvidenceHash && evidenceHash === previousEvidenceHash) return { stop: true, reason: "no-new-evidence" };
  return { stop: false, reason: null };
}

export function reconstructSession(sessionFixture, events) {
  validateContract("synthetic-session-fixture.schema.json", sessionFixture, "synthetic session fixture");
  const replay = verifySessionEvents(events, { budget: sessionFixture.sessionBudget });
  if (replay.sessionId !== sessionFixture.sessionId || replay.workspaceId !== sessionFixture.workspaceId || replay.projectId !== sessionFixture.projectId) {
    throw new Error("Session identity substitution detected");
  }
  return {
    documentType: "clover-launch-session",
    schemaVersion: "0.1.0",
    sessionId: replay.sessionId,
    workspaceId: replay.workspaceId,
    projectId: replay.projectId,
    profileId: sessionFixture.profileId,
    state: replay.state,
    sessionVersion: replay.version,
    eventCount: replay.eventCount,
    headEventHash: replay.headEventHash,
    fixtureHash: sha256Canonical(sessionFixture),
    approvals: replay.approvals,
    resolvedModels: replay.resolvedModels,
    personalChatGptMemoryStored: false,
    sharedTruthAutomaticallyPromoted: false,
    externalEffects: replay.externalEffects,
    synthetic: true,
    consequentialAuthorityGranted: false
  };
}
