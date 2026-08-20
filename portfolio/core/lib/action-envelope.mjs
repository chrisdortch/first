import fs from "node:fs";
import path from "node:path";
import { canonicalize, cloneJson, sha256Bytes, sha256Canonical } from "./canonical-json.mjs";
import { ChallengeStore, verifyAttestation } from "./attestation.mjs";

const ENVELOPE_KEYS = [
  "schemaVersion",
  "envelopeId",
  "requestId",
  "intent",
  "intentHash",
  "createdAt",
  "expiresAt",
  "nonce",
  "singleUse",
  "accountId",
  "projectId",
  "environment",
  "target",
  "operation",
  "handlerId",
  "tool",
  "verifierId",
  "verificationTool",
  "readbackSource",
  "expectedPostcondition",
  "expectedPostconditionHash",
  "parameters",
  "parametersHash",
  "dataClasses",
  "cost",
  "rollback",
  "stopConditions",
  "policy",
  "policyHash",
  "approvalRequired",
  "authorityHash",
  "approval"
];

const POLICY_KEYS = [
  "policyId",
  "policyVersion",
  "allowedOperations",
  "deniedOperations",
  "allowedEnvironments",
  "productionAllowed",
  "allowedDataClasses",
  "maxCostUsd",
  "purchaseApprovalRequiredAboveUsd",
  "rollbackRequired",
  "authenticatedApprovalRequired",
  "requiredStopConditions"
];

const TARGET_KEYS = ["resourceType", "nativeResourceId", "expectedVersion"];
const TOOL_KEYS = ["toolId", "toolVersion"];
const READBACK_SOURCE_KEYS = ["systemId", "nativeResourceId"];
const READBACK_KEYS = ["sourceSystemId", "nativeResourceId", "observedVersion", "postcondition"];
const COST_KEYS = ["currency", "maxUsd", "purchaseApproved"];
const ROLLBACK_KEYS = ["required", "strategyId", "rollbackAnchor"];
const CONTEXT_KEYS = ["accountId", "projectId", "environment"];
const CURRENT_TARGET_KEYS = ["resourceType", "nativeResourceId", "version"];
const HANDLER_ENTRY_KEYS = ["toolId", "toolVersion", "execute", "executeConditional", "compensate"];
const VERIFIER_ENTRY_KEYS = ["toolId", "toolVersion", "sourceSystemId", "verify"];
const STATE_KEYS = [
  "schemaVersion", "envelopeId", "authorityHash", "phase", "terminal", "reservedAt", "authoritySpentAt",
  "sideEffectStartedAt", "sideEffectFinishedAt", "completedAt", "handlerCalls", "readbackCalls",
  "compensationCalls", "effect", "executionMode", "handlerResult", "preflightReadback", "readback",
  "compensation", "error"
];
const HISTORY_RECORD_KEYS = [
  "documentType", "schemaVersion", "sequence", "envelopeId", "authorityHash", "recordedAt",
  "previousRecordHash", "stateHash", "state", "recordHash"
];
const TRUSTED_STATE_TRANSITION = Symbol("clover-trusted-action-state-transition");
const TERMINAL_PHASE_EFFECT = new Map([
  ["failed-before-side-effect", null],
  ["partial-failure-uncompensated", "unknown-or-partial"],
  ["compensation-failed", "unknown-or-partial"],
  ["rollback-unverified", "unknown-or-partial"],
  ["rolled-back", "rolled-back-confirmed"],
  ["succeeded", "applied-confirmed"]
]);
const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000;
const REQUIRED_APPROVER_ROLE = "action-approver";
const REQUIRED_APPROVAL_ASSURANCE = "phishing-resistant-owner-authentication";
const SUPPORTED_STOP_CONDITIONS = new Set([
  "target-version-changed",
  "readback-not-confirmed"
]);

function fail(message, code = "ACTION_ENVELOPE_INVALID", details) {
  throw new ActionEnvelopeError(message, code, details);
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${label} must be a plain object`);
}

function assertExactKeys(value, keys, label) {
  assertPlainObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} has unexpected or missing fields`);
  }
}

function assertAllowedKeys(value, keys, required, label) {
  assertPlainObject(value, label);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} contains unknown field ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(`${label} is missing ${key}`);
  }
}

function assertNonemptyString(value, label, maxLength = 300) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    fail(`${label} must be a non-empty string of at most ${maxLength} characters`);
  }
}

function assertIdentifier(value, label) {
  assertNonemptyString(value, label, 160);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) fail(`${label} contains unsupported characters`);
}

function assertStringList(value, label) {
  if (!Array.isArray(value) || value.length === 0) fail(`${label} must be a non-empty array`);
  const seen = new Set();
  for (const entry of value) {
    assertIdentifier(entry, `${label} entry`);
    if (seen.has(entry)) fail(`${label} contains a duplicate entry`);
    seen.add(entry);
  }
}

function assertStringArray(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    fail(`${label} must be ${allowEmpty ? "an" : "a non-empty"} array`);
  }
  const seen = new Set();
  for (const entry of value) {
    assertNonemptyString(entry, `${label} entry`, 500);
    if (seen.has(entry)) fail(`${label} contains a duplicate entry`);
    seen.add(entry);
  }
}

function timestampMs(value, label) {
  assertNonemptyString(value, label, 80);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(`${label} must be an ISO-compatible timestamp`);
  return parsed;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function errorRecord(error) {
  return {
    name: String(error?.name || "Error").slice(0, 120),
    message: String(error?.message || error || "Unknown failure").slice(0, 500)
  };
}

function evidenceRecord(value, label) {
  try {
    const normalized = value === undefined ? null : cloneJson(value);
    return { label, evidenceHash: sha256Canonical(normalized) };
  } catch (error) {
    throw new ActionEnvelopeError(`${label} must be canonical JSON`, "ACTION_HANDLER_PROTOCOL", {
      cause: errorRecord(error)
    });
  }
}

function authoritativeReadbackEvidence(envelope, value, phase) {
  assertExactKeys(value, READBACK_KEYS, `${phase} readback`);
  assertIdentifier(value.sourceSystemId, `${phase} readback sourceSystemId`);
  assertNonemptyString(value.nativeResourceId, `${phase} readback nativeResourceId`, 500);
  assertNonemptyString(value.observedVersion, `${phase} readback observedVersion`, 300);
  assertPlainObject(value.postcondition, `${phase} readback postcondition`);
  if (value.sourceSystemId !== envelope.readbackSource.systemId ||
      value.nativeResourceId !== envelope.readbackSource.nativeResourceId) {
    fail("Authoritative readback source or target was substituted", "ACTION_VERIFIER_SUBSTITUTION");
  }
  const postconditionHash = sha256Canonical(value.postcondition);
  if (phase === "before-execute") {
    if (value.observedVersion !== envelope.target.expectedVersion) {
      fail("Authoritative target version changed before side effect", "ACTION_STALE_TARGET", {
        expectedVersion: envelope.target.expectedVersion,
        currentVersion: value.observedVersion
      });
    }
  } else if (phase === "after-execute") {
    if (value.observedVersion !== envelope.expectedPostcondition.version ||
        postconditionHash !== envelope.expectedPostconditionHash) {
      fail("Authoritative readback does not match the bound postcondition", "ACTION_POSTCONDITION_MISMATCH");
    }
  } else if (phase === "after-compensation") {
    const expectedRollbackVersion = envelope.rollback.rollbackAnchor ?? envelope.target.expectedVersion;
    if (value.observedVersion !== expectedRollbackVersion || value.postcondition.rolledBack !== true) {
      fail("Authoritative rollback readback was not confirmed", "ACTION_ROLLBACK_UNVERIFIED");
    }
  }
  return {
    ...evidenceRecord(value, `${phase}-authoritative-readback`),
    sourceSystemId: value.sourceSystemId,
    nativeResourceId: value.nativeResourceId,
    observedVersion: value.observedVersion,
    postconditionHash
  };
}

function approvalPayload(envelope) {
  return {
    schemaVersion: "0.2",
    purpose: "clover-action-envelope-approval",
    envelopeId: envelope.envelopeId,
    authorityHash: envelope.authorityHash,
    target: cloneJson(envelope.target),
    verification: {
      verifierId: envelope.verifierId,
      tool: cloneJson(envelope.verificationTool),
      source: cloneJson(envelope.readbackSource),
      expectedPostconditionHash: envelope.expectedPostconditionHash
    },
    nonce: envelope.nonce
  };
}

function authorityRecord(envelope) {
  return {
    schemaVersion: envelope.schemaVersion,
    envelopeId: envelope.envelopeId,
    requestId: envelope.requestId,
    intentHash: envelope.intentHash,
    createdAt: envelope.createdAt,
    expiresAt: envelope.expiresAt,
    nonce: envelope.nonce,
    singleUse: envelope.singleUse,
    accountId: envelope.accountId,
    projectId: envelope.projectId,
    environment: envelope.environment,
    target: envelope.target,
    operation: envelope.operation,
    handlerId: envelope.handlerId,
    tool: envelope.tool,
    verifierId: envelope.verifierId,
    verificationTool: envelope.verificationTool,
    readbackSource: envelope.readbackSource,
    expectedPostconditionHash: envelope.expectedPostconditionHash,
    parametersHash: envelope.parametersHash,
    dataClasses: envelope.dataClasses,
    cost: envelope.cost,
    rollback: envelope.rollback,
    stopConditions: envelope.stopConditions,
    policyHash: envelope.policyHash,
    approvalRequired: envelope.approvalRequired
  };
}

function assertSelfBinding(envelope) {
  if (sha256Canonical(envelope.parameters) !== envelope.parametersHash) fail("Parameters were substituted");
  if (sha256Bytes(envelope.intent) !== envelope.intentHash) fail("Intent was substituted");
  if (sha256Canonical(envelope.expectedPostcondition) !== envelope.expectedPostconditionHash) {
    fail("Expected postcondition was substituted");
  }
  if (sha256Canonical(envelope.policy) !== envelope.policyHash) fail("Policy was substituted");
  if (sha256Canonical(authorityRecord(envelope)) !== envelope.authorityHash) fail("Authority binding was altered");
}

function assertNullableTimestamp(value, label) {
  if (value !== null) timestampMs(value, label);
}

function assertNullableObject(value, label) {
  if (value !== null) assertPlainObject(value, label);
}

function validateStateShape(state, label = "action state") {
  assertExactKeys(state, STATE_KEYS, label);
  if (state.schemaVersion !== "0.2") fail("Action state schema is unsupported", "ACTION_STATE_INVALID");
  assertIdentifier(state.envelopeId, `${label}.envelopeId`);
  if (!/^[a-f0-9]{64}$/.test(state.authorityHash || "")) fail("Action state authorityHash is invalid", "ACTION_STATE_INVALID");
  if (!["reserved", "preflight", "executing", "compensating", ...TERMINAL_PHASE_EFFECT.keys()].includes(state.phase)) {
    fail("Action state phase is invalid", "ACTION_STATE_INVALID");
  }
  if (typeof state.terminal !== "boolean") fail("Action state terminal flag is invalid", "ACTION_STATE_INVALID");
  timestampMs(state.reservedAt, `${label}.reservedAt`);
  timestampMs(state.authoritySpentAt, `${label}.authoritySpentAt`);
  for (const field of ["sideEffectStartedAt", "sideEffectFinishedAt", "completedAt"]) {
    assertNullableTimestamp(state[field], `${label}.${field}`);
  }
  for (const [field, maximum] of [["handlerCalls", 1], ["readbackCalls", 3], ["compensationCalls", 1]]) {
    if (!Number.isInteger(state[field]) || state[field] < 0 || state[field] > maximum) {
      fail(`Action state has an invalid ${field}`, "ACTION_STATE_INVALID");
    }
  }
  if (![null, "in-progress-or-unknown", "unknown-or-partial", "rolled-back-confirmed", "applied-confirmed"].includes(state.effect)) {
    fail("Action state effect is invalid", "ACTION_STATE_INVALID");
  }
  if (![null, "native-conditional-write", "verified-precondition-write"].includes(state.executionMode)) {
    fail("Action state executionMode is invalid", "ACTION_STATE_INVALID");
  }
  for (const field of ["handlerResult", "preflightReadback", "readback", "compensation", "error"]) {
    assertNullableObject(state[field], `${label}.${field}`);
  }
}

function requireState(condition, message) {
  if (!condition) fail(message, "ACTION_STATE_INVALID");
}

function validatePhaseInvariants(state) {
  validateStateShape(state);
  if (state.phase === "reserved") {
    requireState(state.terminal === false && state.handlerCalls === 0 && state.readbackCalls === 0 &&
      state.compensationCalls === 0 && state.effect === null && state.executionMode === null &&
      state.sideEffectStartedAt === null && state.sideEffectFinishedAt === null && state.completedAt === null &&
      state.handlerResult === null && state.preflightReadback === null && state.readback === null &&
      state.compensation === null && state.error === null,
    "Reserved action state contains execution evidence");
    return;
  }
  if (state.phase === "preflight") {
    requireState(state.terminal === false && state.handlerCalls === 0 && state.readbackCalls === 1 &&
      state.compensationCalls === 0 && state.effect === null && state.executionMode === null &&
      state.sideEffectStartedAt === null && state.sideEffectFinishedAt === null && state.completedAt === null &&
      state.handlerResult === null && state.readback === null && state.compensation === null && state.error === null,
    "Preflight action state has invalid phase evidence");
    return;
  }
  if (state.phase === "executing") {
    requireState(state.terminal === false && state.handlerCalls === 1 && state.readbackCalls >= 1 &&
      state.compensationCalls === 0 && state.effect === "in-progress-or-unknown" && state.executionMode !== null &&
      state.sideEffectStartedAt !== null && state.completedAt === null && state.preflightReadback !== null &&
      state.compensation === null && state.error === null,
    "Executing action state has invalid phase evidence");
    return;
  }
  if (state.phase === "compensating") {
    requireState(state.terminal === false && state.handlerCalls === 1 && state.readbackCalls >= 1 &&
      state.compensationCalls === 1 && state.effect === "unknown-or-partial" && state.executionMode !== null &&
      state.sideEffectStartedAt !== null && state.sideEffectFinishedAt !== null && state.completedAt === null &&
      state.preflightReadback !== null && state.error !== null,
    "Compensating action state has invalid phase evidence");
    return;
  }
  validateTerminalState(state);
}

function validateTerminalState(state) {
  validateStateShape(state, "terminal action state");
  if (state.terminal !== true) fail("Action state is not terminal", "ACTION_STATE_NOT_TERMINAL");
  timestampMs(state.completedAt, "state.completedAt");
  if (!TERMINAL_PHASE_EFFECT.has(state.phase) || state.effect !== TERMINAL_PHASE_EFFECT.get(state.phase)) {
    fail("Action state has an invalid terminal phase or effect", "ACTION_STATE_INVALID");
  }
  if (state.phase === "failed-before-side-effect") {
    requireState(state.handlerCalls === 0 && state.compensationCalls === 0 && state.readbackCalls <= 1 &&
      state.executionMode === null && state.sideEffectStartedAt === null && state.sideEffectFinishedAt === null &&
      state.handlerResult === null && state.readback === null && state.compensation === null && state.error !== null,
    "Failed-before-side-effect state claims execution evidence");
  } else if (state.phase === "succeeded") {
    requireState(state.handlerCalls === 1 && state.readbackCalls === 2 && state.compensationCalls === 0 &&
      state.executionMode !== null && state.sideEffectStartedAt !== null && state.sideEffectFinishedAt !== null &&
      state.handlerResult !== null && state.preflightReadback !== null && state.readback !== null &&
      state.compensation === null && state.error === null,
    "Successful action state lacks required execution or readback evidence");
  } else if (state.phase === "partial-failure-uncompensated") {
    requireState(state.handlerCalls === 1 && state.readbackCalls >= 1 && state.compensationCalls === 0 &&
      state.executionMode !== null && state.sideEffectStartedAt !== null && state.sideEffectFinishedAt !== null &&
      state.preflightReadback !== null && state.compensation === null && state.error !== null,
    "Uncompensated partial-failure state lacks required evidence");
  } else if (state.phase === "compensation-failed") {
    requireState(state.handlerCalls === 1 && state.readbackCalls >= 1 && state.compensationCalls === 1 &&
      state.executionMode !== null && state.sideEffectStartedAt !== null && state.sideEffectFinishedAt !== null &&
      state.preflightReadback !== null && state.compensation !== null && state.error !== null,
    "Compensation-failed state lacks required evidence");
  } else if (state.phase === "rollback-unverified") {
    requireState(state.handlerCalls === 1 && state.readbackCalls >= 1 && state.compensationCalls === 1 &&
      state.executionMode !== null && state.sideEffectStartedAt !== null && state.sideEffectFinishedAt !== null &&
      state.preflightReadback !== null && state.compensation !== null && state.readback !== null && state.error !== null,
    "Rollback-unverified state lacks required evidence");
  } else if (state.phase === "rolled-back") {
    requireState(state.handlerCalls === 1 && [2, 3].includes(state.readbackCalls) && state.compensationCalls === 1 &&
      state.executionMode !== null && state.sideEffectStartedAt !== null && state.sideEffectFinishedAt !== null &&
      state.preflightReadback !== null && state.readback !== null && state.compensation !== null && state.error !== null,
    "Rolled-back state lacks required compensation and readback evidence");
  }
}

function validateStateTransition(previous, next) {
  validatePhaseInvariants(previous);
  validatePhaseInvariants(next);
  for (const field of ["schemaVersion", "envelopeId", "authorityHash", "reservedAt", "authoritySpentAt"]) {
    requireState(canonicalize(previous[field]) === canonicalize(next[field]), `Action transition changed immutable field ${field}`);
  }
  for (const field of ["handlerCalls", "readbackCalls", "compensationCalls"]) {
    requireState(next[field] >= previous[field] && next[field] - previous[field] <= 1,
      `Action transition has an invalid ${field} delta`);
  }
  const allowed = {
    reserved: new Set(["preflight", "failed-before-side-effect"]),
    preflight: new Set(["preflight", "executing", "failed-before-side-effect"]),
    executing: new Set(["executing", "compensating", "partial-failure-uncompensated", "succeeded"]),
    compensating: new Set(["compensating", "compensation-failed", "rollback-unverified", "rolled-back"])
  };
  requireState(previous.terminal === false && allowed[previous.phase]?.has(next.phase),
    `Invalid action phase transition ${previous.phase} -> ${next.phase}`);
}

function validatePolicy(policy) {
  assertExactKeys(policy, POLICY_KEYS, "policy");
  assertIdentifier(policy.policyId, "policy.policyId");
  assertIdentifier(policy.policyVersion, "policy.policyVersion");
  assertStringList(policy.allowedOperations, "policy.allowedOperations");
  assertStringList(policy.deniedOperations, "policy.deniedOperations");
  assertStringList(policy.allowedEnvironments, "policy.allowedEnvironments");
  if (typeof policy.productionAllowed !== "boolean") fail("policy.productionAllowed must be boolean");
  assertStringList(policy.allowedDataClasses, "policy.allowedDataClasses");
  if (!Number.isFinite(policy.maxCostUsd) || policy.maxCostUsd < 0) fail("policy.maxCostUsd must be non-negative");
  if (!Number.isFinite(policy.purchaseApprovalRequiredAboveUsd) || policy.purchaseApprovalRequiredAboveUsd < 0) {
    fail("policy.purchaseApprovalRequiredAboveUsd must be non-negative");
  }
  if (typeof policy.rollbackRequired !== "boolean" || typeof policy.authenticatedApprovalRequired !== "boolean") {
    fail("Policy rollback and approval requirements must be boolean");
  }
  assertStringArray(policy.requiredStopConditions, "policy.requiredStopConditions");
  for (const condition of policy.requiredStopConditions) {
    if (!SUPPORTED_STOP_CONDITIONS.has(condition)) {
      fail(`Trusted policy names an unsupported stop condition ${condition}`, "ACTION_POLICY_INVALID");
    }
  }
  const conflicts = policy.allowedOperations.filter((operation) => policy.deniedOperations.includes(operation));
  if (conflicts.length > 0) {
    fail(`Policy allow/deny conflict: ${conflicts.join(", ")}; deny takes precedence`, "ACTION_POLICY_CONFLICT");
  }
}

function validateStructure(envelope) {
  assertExactKeys(envelope, ENVELOPE_KEYS, "action envelope");
  if (envelope.schemaVersion !== "0.2") fail("Unsupported action envelope schema");
  assertIdentifier(envelope.envelopeId, "envelopeId");
  assertNonemptyString(envelope.requestId, "requestId", 200);
  assertNonemptyString(envelope.intent, "intent", 2000);
  if (!/^[a-f0-9]{64}$/.test(envelope.intentHash)) fail("intentHash must be SHA-256 hex");
  timestampMs(envelope.createdAt, "createdAt");
  timestampMs(envelope.expiresAt, "expiresAt");
  assertNonemptyString(envelope.nonce, "nonce", 300);
  if (envelope.singleUse !== true) fail("singleUse must be true");
  assertIdentifier(envelope.accountId, "accountId");
  assertIdentifier(envelope.projectId, "projectId");
  assertIdentifier(envelope.environment, "environment");
  assertExactKeys(envelope.target, TARGET_KEYS, "target");
  assertIdentifier(envelope.target.resourceType, "target.resourceType");
  assertNonemptyString(envelope.target.nativeResourceId, "target.nativeResourceId", 500);
  assertNonemptyString(envelope.target.expectedVersion, "target.expectedVersion", 300);
  assertIdentifier(envelope.operation, "operation");
  assertIdentifier(envelope.handlerId, "handlerId");
  assertExactKeys(envelope.tool, TOOL_KEYS, "tool");
  assertIdentifier(envelope.tool.toolId, "tool.toolId");
  assertIdentifier(envelope.tool.toolVersion, "tool.toolVersion");
  assertIdentifier(envelope.verifierId, "verifierId");
  assertExactKeys(envelope.verificationTool, TOOL_KEYS, "verificationTool");
  assertIdentifier(envelope.verificationTool.toolId, "verificationTool.toolId");
  assertIdentifier(envelope.verificationTool.toolVersion, "verificationTool.toolVersion");
  assertExactKeys(envelope.readbackSource, READBACK_SOURCE_KEYS, "readbackSource");
  assertIdentifier(envelope.readbackSource.systemId, "readbackSource.systemId");
  assertNonemptyString(envelope.readbackSource.nativeResourceId, "readbackSource.nativeResourceId", 500);
  if (envelope.readbackSource.nativeResourceId !== envelope.target.nativeResourceId) {
    fail("Readback source must bind the exact native target", "ACTION_VERIFIER_SUBSTITUTION");
  }
  assertPlainObject(envelope.expectedPostcondition, "expectedPostcondition");
  assertNonemptyString(envelope.expectedPostcondition.version, "expectedPostcondition.version", 300);
  if (!/^[a-f0-9]{64}$/.test(envelope.expectedPostconditionHash)) fail("expectedPostconditionHash must be SHA-256 hex");
  assertPlainObject(envelope.parameters, "parameters");
  canonicalize(envelope.parameters);
  if (!/^[a-f0-9]{64}$/.test(envelope.parametersHash)) fail("parametersHash must be SHA-256 hex");
  assertStringList(envelope.dataClasses, "dataClasses");
  assertExactKeys(envelope.cost, COST_KEYS, "cost");
  if (envelope.cost.currency !== "USD") fail("cost.currency must be USD");
  if (!Number.isFinite(envelope.cost.maxUsd) || envelope.cost.maxUsd < 0) fail("cost.maxUsd must be non-negative");
  if (typeof envelope.cost.purchaseApproved !== "boolean") fail("cost.purchaseApproved must be boolean");
  if (envelope.cost.maxUsd > 0 && envelope.cost.purchaseApproved !== true) {
    fail("A non-zero cost ceiling requires explicit purchase approval", "ACTION_COST_NOT_APPROVED");
  }
  if (envelope.cost.maxUsd > 0 && envelope.approvalRequired !== true) {
    fail("A non-zero cost ceiling requires authenticated approval", "ACTION_APPROVAL_REQUIRED");
  }
  assertExactKeys(envelope.rollback, ROLLBACK_KEYS, "rollback");
  if (typeof envelope.rollback.required !== "boolean") fail("rollback.required must be boolean");
  if (envelope.rollback.strategyId !== null) assertIdentifier(envelope.rollback.strategyId, "rollback.strategyId");
  if (envelope.rollback.rollbackAnchor !== null) assertNonemptyString(envelope.rollback.rollbackAnchor, "rollback.rollbackAnchor", 500);
  if (envelope.rollback.required && (!envelope.rollback.strategyId || !envelope.rollback.rollbackAnchor)) {
    fail("Required rollback needs an exact strategy and anchor");
  }
  assertStringArray(envelope.stopConditions, "stopConditions");
  for (const condition of envelope.stopConditions) {
    if (!SUPPORTED_STOP_CONDITIONS.has(condition)) {
      fail(`Action Envelope names an unsupported stop condition ${condition}`, "ACTION_STOP_CONDITION_UNSUPPORTED");
    }
  }
  validatePolicy(envelope.policy);
  if (!/^[a-f0-9]{64}$/.test(envelope.policyHash)) fail("policyHash must be SHA-256 hex");
  if (typeof envelope.approvalRequired !== "boolean") fail("approvalRequired must be boolean");
  if (!/^[a-f0-9]{64}$/.test(envelope.authorityHash)) fail("authorityHash must be SHA-256 hex");
  if (envelope.approval !== null) assertPlainObject(envelope.approval, "approval");
}

function exactMatch(actual, expected, label) {
  if (actual !== expected) fail(`${label} mismatch`, "ACTION_TARGET_SUBSTITUTION", { actual, expected });
}

function terminalPatch(phase, now, extra = {}) {
  return {
    phase,
    terminal: true,
    completedAt: now,
    ...extra
  };
}

export class ActionEnvelopeError extends Error {
  constructor(message, code = "ACTION_ENVELOPE_INVALID", details) {
    super(message);
    this.name = "ActionEnvelopeError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export class ActionReplayError extends ActionEnvelopeError {
  constructor(envelopeId) {
    super(`Action envelope ${envelopeId} was already reserved or spent`, "ACTION_REPLAY", { envelopeId });
    this.name = "ActionReplayError";
  }
}

export class ActionExecutionError extends ActionEnvelopeError {
  constructor(message, state, cause, receipt = null) {
    super(message, "ACTION_EXECUTION_FAILED", { terminalState: state });
    this.name = "ActionExecutionError";
    this.state = state;
    this.receipt = receipt;
    if (cause) this.cause = cause;
  }
}

export function createActionReceipt(envelope, stateStore) {
  validateStructure(envelope);
  assertSelfBinding(envelope);
  if (!(stateStore instanceof LocalActionStateStore) || Object.getPrototypeOf(stateStore) !== LocalActionStateStore.prototype) {
    fail("An Action Receipt requires a trusted persisted execution history state store", "ACTION_HISTORY_REQUIRED");
  }
  const history = LocalActionStateStore.prototype.history.call(stateStore, envelope.envelopeId);
  if (history.length === 0) fail("Persisted execution history is empty", "ACTION_HISTORY_REQUIRED");
  const state = history.at(-1).state;
  validateTerminalState(state);
  if (state.envelopeId !== envelope.envelopeId || state.authorityHash !== envelope.authorityHash) {
    fail("Terminal state does not match the Action Envelope", "ACTION_STATE_MISMATCH");
  }
  if (state.terminal !== true || typeof state.completedAt !== "string") {
    fail("An Action Receipt requires a terminal state", "ACTION_STATE_NOT_TERMINAL");
  }
  const receipt = {
    documentType: "clover-action-receipt",
    schemaVersion: "0.2",
    envelopeId: envelope.envelopeId,
    authorityHash: envelope.authorityHash,
    target: cloneJson(envelope.target),
    verification: {
      verifierId: envelope.verifierId,
      tool: cloneJson(envelope.verificationTool),
      source: cloneJson(envelope.readbackSource),
      expectedPostconditionHash: envelope.expectedPostconditionHash
    },
    phase: state.phase,
    effect: state.effect,
    terminal: true,
    recordedAt: state.completedAt,
    handlerCalls: state.handlerCalls,
    readbackCalls: state.readbackCalls,
    compensationCalls: state.compensationCalls,
    stateHash: sha256Canonical(state),
    historyLength: history.length,
    historyHash: sha256Canonical(history),
    terminalState: cloneJson(state),
    receiptHash: null
  };
  const { receiptHash: _receiptHash, ...unsigned } = receipt;
  receipt.receiptHash = sha256Canonical(unsigned);
  return deepFreeze(receipt);
}

/**
 * An immutable, construction-time registry. Entries are functions, never command
 * strings, and there is deliberately no register/replace method after creation.
 */
export class ClosedHandlerRegistry {
  #handlers = new Map();

  constructor(entries) {
    assertPlainObject(entries, "handler registry");
    for (const [handlerId, entry] of Object.entries(entries)) {
      assertIdentifier(handlerId, "handlerId");
      assertAllowedKeys(entry, HANDLER_ENTRY_KEYS, ["toolId", "toolVersion", "execute", "compensate"], `handler ${handlerId}`);
      assertIdentifier(entry.toolId, `handler ${handlerId} toolId`);
      assertIdentifier(entry.toolVersion, `handler ${handlerId} toolVersion`);
      if (typeof entry.execute !== "function") {
        fail(`handler ${handlerId} requires an execute function`, "ACTION_HANDLER_INVALID");
      }
      if (entry.compensate !== null && typeof entry.compensate !== "function") {
        fail(`handler ${handlerId} compensation must be a function or null`, "ACTION_HANDLER_INVALID");
      }
      if (entry.executeConditional !== undefined && entry.executeConditional !== null &&
          typeof entry.executeConditional !== "function") {
        fail(`handler ${handlerId} conditional execute must be a function or null`, "ACTION_HANDLER_INVALID");
      }
      this.#handlers.set(handlerId, Object.freeze({ ...entry, executeConditional: entry.executeConditional ?? null }));
    }
    Object.freeze(this);
  }

  resolve(handlerId, tool) {
    const handler = this.#handlers.get(handlerId);
    if (!handler) fail(`Unknown closed handler ${handlerId}`, "ACTION_HANDLER_UNKNOWN");
    if (handler.toolId !== tool.toolId || handler.toolVersion !== tool.toolVersion) {
      fail("Handler/tool identity mismatch", "ACTION_TOOL_SUBSTITUTION");
    }
    return handler;
  }
}

/** A separately constructed, immutable registry for authoritative readback. */
export class ClosedVerifierRegistry {
  #verifiers = new Map();

  constructor(entries) {
    assertPlainObject(entries, "verifier registry");
    for (const [verifierId, entry] of Object.entries(entries)) {
      assertIdentifier(verifierId, "verifierId");
      assertExactKeys(entry, VERIFIER_ENTRY_KEYS, `verifier ${verifierId}`);
      assertIdentifier(entry.toolId, `verifier ${verifierId} toolId`);
      assertIdentifier(entry.toolVersion, `verifier ${verifierId} toolVersion`);
      assertIdentifier(entry.sourceSystemId, `verifier ${verifierId} sourceSystemId`);
      if (typeof entry.verify !== "function") fail(`verifier ${verifierId} requires a verify function`, "ACTION_VERIFIER_INVALID");
      this.#verifiers.set(verifierId, Object.freeze({ ...entry }));
    }
    Object.freeze(this);
  }

  resolve(verifierId, tool, source) {
    const verifier = this.#verifiers.get(verifierId);
    if (!verifier) fail(`Unknown closed verifier ${verifierId}`, "ACTION_VERIFIER_UNKNOWN");
    if (verifier.toolId !== tool.toolId || verifier.toolVersion !== tool.toolVersion ||
        verifier.sourceSystemId !== source.systemId) {
      fail("Verifier identity, tool, or authoritative source mismatch", "ACTION_VERIFIER_SUBSTITUTION");
    }
    return verifier;
  }
}

export function createActionEnvelope(input) {
  const accepted = [
    "envelopeId", "requestId", "intent", "createdAt", "expiresAt", "nonce", "singleUse", "accountId",
    "projectId", "environment", "target", "operation", "handlerId", "tool", "verifierId",
    "verificationTool", "readbackSource", "expectedPostcondition", "parameters",
    "dataClasses", "cost", "rollback", "stopConditions", "policy", "approvalRequired", "approval"
  ];
  const required = accepted.filter((key) => !["singleUse", "approvalRequired", "approval"].includes(key));
  assertAllowedKeys(input, accepted, required, "action envelope input");
  const parameters = cloneJson(input.parameters);
  const policy = cloneJson(input.policy);
  const envelope = {
    schemaVersion: "0.2",
    envelopeId: input.envelopeId,
    requestId: input.requestId,
    intent: input.intent,
    intentHash: sha256Bytes(input.intent),
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    nonce: input.nonce,
    singleUse: input.singleUse ?? true,
    accountId: input.accountId,
    projectId: input.projectId,
    environment: input.environment,
    target: cloneJson(input.target),
    operation: input.operation,
    handlerId: input.handlerId,
    tool: cloneJson(input.tool),
    verifierId: input.verifierId,
    verificationTool: cloneJson(input.verificationTool),
    readbackSource: cloneJson(input.readbackSource),
    expectedPostcondition: cloneJson(input.expectedPostcondition),
    expectedPostconditionHash: sha256Canonical(input.expectedPostcondition),
    parameters,
    parametersHash: sha256Canonical(parameters),
    dataClasses: cloneJson(input.dataClasses),
    cost: cloneJson(input.cost),
    rollback: cloneJson(input.rollback),
    stopConditions: cloneJson(input.stopConditions),
    policy,
    policyHash: sha256Canonical(policy),
    approvalRequired: input.approvalRequired ?? false,
    authorityHash: "0".repeat(64),
    approval: input.approval === undefined ? null : cloneJson(input.approval)
  };
  envelope.authorityHash = sha256Canonical(authorityRecord(envelope));
  validateStructure(envelope);
  return deepFreeze(envelope);
}

export function actionApprovalPayload(envelope) {
  validateStructure(envelope);
  assertSelfBinding(envelope);
  return deepFreeze(approvalPayload(envelope));
}

export function withActionApproval(envelope, approval) {
  validateStructure(envelope);
  const copy = cloneJson(envelope);
  copy.approval = cloneJson(approval);
  validateStructure(copy);
  return deepFreeze(copy);
}

/**
 * Validates both the self-contained binding and caller-supplied current truth.
 * Caller truth is mandatory: an envelope cannot attest its own policy or target.
 */
export function validateActionEnvelope(envelope, options) {
  validateStructure(envelope);
  assertPlainObject(options, "validation options");
  const now = options.now ?? new Date().toISOString();
  const nowMs = timestampMs(now, "now");
  const createdMs = timestampMs(envelope.createdAt, "createdAt");
  const expiresMs = timestampMs(envelope.expiresAt, "expiresAt");
  if (createdMs > nowMs) fail("Action envelope is not yet valid", "ACTION_NOT_YET_VALID");
  if (expiresMs <= nowMs) fail("Action envelope expired", "ACTION_EXPIRED");
  if (expiresMs <= createdMs) fail("Action envelope expiry must follow creation");
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) fail("maxAgeMs must be a non-negative finite number");
  if (nowMs - createdMs > maxAgeMs) fail("Action envelope is stale", "ACTION_STALE");

  assertSelfBinding(envelope);

  assertExactKeys(options.expectedContext, CONTEXT_KEYS, "expectedContext");
  exactMatch(envelope.accountId, options.expectedContext.accountId, "accountId");
  exactMatch(envelope.projectId, options.expectedContext.projectId, "projectId");
  exactMatch(envelope.environment, options.expectedContext.environment, "environment");

  assertExactKeys(options.currentTarget, CURRENT_TARGET_KEYS, "currentTarget");
  exactMatch(envelope.target.resourceType, options.currentTarget.resourceType, "target.resourceType");
  exactMatch(envelope.target.nativeResourceId, options.currentTarget.nativeResourceId, "target.nativeResourceId");
  if (envelope.target.expectedVersion !== options.currentTarget.version) {
    fail("Target version is stale", "ACTION_STALE_TARGET", {
      expectedVersion: envelope.target.expectedVersion,
      currentVersion: options.currentTarget.version
    });
  }

  if (options.trustedPolicy === undefined) fail("An externally loaded trusted policy is required");
  validatePolicy(options.trustedPolicy);
  const trustedPolicyHash = sha256Canonical(options.trustedPolicy);
  exactMatch(envelope.policyHash, trustedPolicyHash, "policyHash");

  if (!envelope.policy.allowedEnvironments.includes(envelope.environment)) {
    fail("Environment is not allowed by policy", "ACTION_POLICY_DENIED");
  }
  if (envelope.policy.deniedOperations.includes(envelope.operation)) {
    fail("Operation is denied by policy; deny overrides allow", "ACTION_POLICY_DENIED");
  }
  if (!envelope.policy.allowedOperations.includes(envelope.operation)) {
    fail("Operation is not allowed by policy", "ACTION_POLICY_DENIED");
  }
  if (envelope.environment === "production") {
    fail("Production execution is disabled in this candidate", "ACTION_POLICY_DENIED");
  }
  for (const dataClass of envelope.dataClasses) {
    if (!options.trustedPolicy.allowedDataClasses.includes(dataClass)) {
      fail(`Data class ${dataClass} is not allowed by policy`, "ACTION_POLICY_DENIED");
    }
  }
  if (envelope.cost.maxUsd > options.trustedPolicy.maxCostUsd) {
    fail("Cost ceiling exceeds trusted policy", "ACTION_POLICY_DENIED");
  }
  if (envelope.cost.maxUsd > options.trustedPolicy.purchaseApprovalRequiredAboveUsd &&
      envelope.cost.purchaseApproved !== true) {
    fail("Trusted policy requires purchase approval", "ACTION_POLICY_DENIED");
  }
  if (options.trustedPolicy.rollbackRequired && !envelope.rollback.required) {
    fail("Trusted policy requires rollback", "ACTION_POLICY_DENIED");
  }
  if (options.trustedPolicy.authenticatedApprovalRequired && !envelope.approvalRequired) {
    fail("Trusted policy requires authenticated approval", "ACTION_POLICY_DENIED");
  }
  for (const condition of options.trustedPolicy.requiredStopConditions) {
    if (!envelope.stopConditions.includes(condition)) {
      fail(`Trusted policy requires stop condition ${condition}`, "ACTION_POLICY_DENIED");
    }
  }

  let handler = null;
  if (options.registry !== undefined) {
    if (!(options.registry instanceof ClosedHandlerRegistry)) fail("registry must be a ClosedHandlerRegistry");
    handler = options.registry.resolve(envelope.handlerId, envelope.tool);
    if (envelope.rollback.required && handler.compensate === null) {
      fail("Required rollback has no closed compensation handler", "ACTION_ROLLBACK_UNAVAILABLE");
    }
  }
  let verifier = null;
  if (options.verifierRegistry !== undefined) {
    if (!(options.verifierRegistry instanceof ClosedVerifierRegistry)) fail("verifierRegistry must be a ClosedVerifierRegistry");
    verifier = options.verifierRegistry.resolve(envelope.verifierId, envelope.verificationTool, envelope.readbackSource);
  }

  let approvalVerification = null;
  if (envelope.approvalRequired || envelope.approval !== null) {
    if (envelope.approval === null) fail("Authenticated approval is required", "ACTION_APPROVAL_REQUIRED");
    approvalVerification = verifyAttestation(envelope.approval, {
      trustedCredentials: options.trustedCredentials ?? [],
      now,
      expectedPurpose: "clover-action-envelope-approval"
    });
    const approvalCredential = (options.trustedCredentials ?? []).find((credential) =>
      credential.credentialId === envelope.approval.credentialId &&
      credential.principalId === envelope.approval.principalId &&
      credential.fingerprint === envelope.approval.credentialFingerprint &&
      credential.status === "active"
    );
    if (!approvalCredential ||
        !Array.isArray(approvalCredential.roles) ||
        !approvalCredential.roles.includes(REQUIRED_APPROVER_ROLE)) {
      fail("Approval credential lacks the action-approver role", "ACTION_APPROVER_SCOPE_DENIED");
    }
    if (approvalCredential.assurance !== REQUIRED_APPROVAL_ASSURANCE) {
      fail("Approval credential does not meet required assurance", "ACTION_APPROVER_SCOPE_DENIED");
    }
    for (const [field, value] of [
      ["accountIds", envelope.accountId],
      ["projectIds", envelope.projectId],
      ["environments", envelope.environment]
    ]) {
      if (!Array.isArray(approvalCredential[field]) || !approvalCredential[field].includes(value)) {
        fail(`Approval credential is not scoped to ${field}=${value}`, "ACTION_APPROVER_SCOPE_DENIED");
      }
    }
    if (canonicalize(envelope.approval.payload) !== canonicalize(approvalPayload(envelope))) {
      fail("Approval is not bound to this exact authority", "ACTION_APPROVAL_MISMATCH");
    }
    if (!(options.challengeStore instanceof ChallengeStore) ||
        Object.getPrototypeOf(options.challengeStore) !== ChallengeStore.prototype) {
      fail(
        "The native process-persistent ChallengeStore is required for approval",
        "ACTION_APPROVAL_CHALLENGE_REQUIRED",
      );
    }
    options.challengeStore.verify(envelope.approval, now);
  }

  return {
    valid: true,
    authorityHash: envelope.authorityHash,
    policyHash: envelope.policyHash,
    parametersHash: envelope.parametersHash,
    intentHash: envelope.intentHash,
    handler,
    verifier,
    approvalVerification
  };
}

export class LocalActionStateStore {
  constructor(directory) {
    assertNonemptyString(directory, "state store directory", 2000);
    Object.defineProperty(this, "directory", {
      value: path.resolve(directory),
      enumerable: true,
      writable: false,
      configurable: false
    });
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    Object.seal(this);
  }

  #paths(envelopeId) {
    const key = sha256Bytes(envelopeId);
    return {
      spent: path.join(this.directory, `${key}.spent`),
      state: path.join(this.directory, `${key}.state.json`),
      history: path.join(this.directory, `${key}.history`)
    };
  }

  #requireTrustedTransition(authority) {
    if (authority !== TRUSTED_STATE_TRANSITION) {
      fail("Action state transitions are restricted to the trusted executor", "ACTION_STATE_TRANSITION_DENIED");
    }
  }

  #syncDirectory(directory) {
    let descriptor;
    try {
      descriptor = fs.openSync(directory, "r");
      fs.fsyncSync(descriptor);
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
  }

  #writeState(statePath, state) {
    const bytes = `${canonicalize(state)}\n`;
    const temporaryPath = `${statePath}.${process.pid}.${sha256Bytes(`${Date.now()}:${Math.random()}`)}.tmp`;
    let fileDescriptor;
    try {
      fileDescriptor = fs.openSync(temporaryPath, "wx", 0o600);
      fs.writeFileSync(fileDescriptor, bytes, "utf8");
      fs.fsyncSync(fileDescriptor);
    } finally {
      if (fileDescriptor !== undefined) fs.closeSync(fileDescriptor);
    }
    try {
      fs.renameSync(temporaryPath, statePath);
      this.#syncDirectory(this.directory);
    } catch (error) {
      try { fs.unlinkSync(temporaryPath); } catch {}
      throw error;
    }
  }

  #appendHistory(envelope, state, recordedAt) {
    validatePhaseInvariants(state);
    timestampMs(recordedAt, "history recordedAt");
    const paths = this.#paths(envelope.envelopeId);
    const existing = this.history(envelope.envelopeId);
    const sequence = existing.length;
    const record = {
      documentType: "clover-action-state-transition",
      schemaVersion: "0.2",
      sequence,
      envelopeId: envelope.envelopeId,
      authorityHash: envelope.authorityHash,
      recordedAt,
      previousRecordHash: sequence === 0 ? null : existing.at(-1).recordHash,
      stateHash: sha256Canonical(state),
      state: cloneJson(state),
      recordHash: null
    };
    const { recordHash: _recordHash, ...unsigned } = record;
    record.recordHash = sha256Canonical(unsigned);
    const recordPath = path.join(paths.history, `${String(sequence).padStart(8, "0")}.json`);
    let descriptor;
    try {
      descriptor = fs.openSync(recordPath, "wx", 0o600);
      fs.writeFileSync(descriptor, `${canonicalize(record)}\n`, "utf8");
      fs.fsyncSync(descriptor);
    } catch (error) {
      if (error?.code === "EEXIST") fail("Action history compare-and-swap failed", "ACTION_STATE_RACE");
      throw error;
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
    this.#syncDirectory(paths.history);
    this.#writeState(paths.state, state);
    return cloneJson(record);
  }

  reserve(envelope, now, authority) {
    this.#requireTrustedTransition(authority);
    const paths = this.#paths(envelope.envelopeId);
    const reservation = {
      schemaVersion: "0.2",
      envelopeId: envelope.envelopeId,
      authorityHash: envelope.authorityHash,
      reservedAt: now
    };
    let fileDescriptor;
    try {
      fileDescriptor = fs.openSync(paths.spent, "wx", 0o600);
      fs.writeFileSync(fileDescriptor, `${canonicalize(reservation)}\n`, "utf8");
      fs.fsyncSync(fileDescriptor);
    } catch (error) {
      if (error?.code === "EEXIST") throw new ActionReplayError(envelope.envelopeId);
      throw error;
    } finally {
      if (fileDescriptor !== undefined) fs.closeSync(fileDescriptor);
    }
    this.#syncDirectory(this.directory);
    fs.mkdirSync(paths.history, { mode: 0o700 });
    this.#syncDirectory(this.directory);

    const state = {
      schemaVersion: "0.2",
      envelopeId: envelope.envelopeId,
      authorityHash: envelope.authorityHash,
      phase: "reserved",
      terminal: false,
      reservedAt: now,
      authoritySpentAt: now,
      sideEffectStartedAt: null,
      sideEffectFinishedAt: null,
      completedAt: null,
      handlerCalls: 0,
      readbackCalls: 0,
      compensationCalls: 0,
      effect: null,
      executionMode: null,
      handlerResult: null,
      preflightReadback: null,
      readback: null,
      compensation: null,
      error: null
    };
    this.#appendHistory(envelope, state, now);
    return cloneJson(state);
  }

  read(envelopeId) {
    const history = this.history(envelopeId);
    if (history.length === 0) fail("Persisted action history is missing", "ACTION_HISTORY_REQUIRED");
    return cloneJson(history.at(-1).state);
  }

  history(envelopeId) {
    const { history } = this.#paths(envelopeId);
    let names;
    try {
      names = fs.readdirSync(history).filter((name) => /^\d{8}\.json$/.test(name)).sort();
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
    const records = [];
    for (const [sequence, name] of names.entries()) {
      const record = JSON.parse(fs.readFileSync(path.join(history, name), "utf8"));
      assertExactKeys(record, HISTORY_RECORD_KEYS, "action history record");
      if (record.documentType !== "clover-action-state-transition" || record.schemaVersion !== "0.2" ||
          record.sequence !== sequence || name !== `${String(sequence).padStart(8, "0")}.json` ||
          record.envelopeId !== envelopeId || !/^[a-f0-9]{64}$/.test(record.authorityHash || "")) {
        fail("Persisted action history identity or sequence is invalid", "ACTION_HISTORY_INVALID");
      }
      timestampMs(record.recordedAt, "history.recordedAt");
      const expectedPrevious = sequence === 0 ? null : records.at(-1).recordHash;
      if (record.previousRecordHash !== expectedPrevious || record.stateHash !== sha256Canonical(record.state)) {
        fail("Persisted action history chain or state hash is invalid", "ACTION_HISTORY_INVALID");
      }
      const { recordHash: _recordHash, ...unsigned } = record;
      if (record.recordHash !== sha256Canonical(unsigned)) {
        fail("Persisted action history record hash is invalid", "ACTION_HISTORY_INVALID");
      }
      if (record.state.envelopeId !== record.envelopeId || record.state.authorityHash !== record.authorityHash) {
        fail("Persisted action history state identity is invalid", "ACTION_HISTORY_INVALID");
      }
      validatePhaseInvariants(record.state);
      if (sequence > 0) validateStateTransition(records.at(-1).state, record.state);
      records.push(record);
    }
    if (records.length > 0 && records[0].state.phase !== "reserved") {
      fail("Persisted action history does not begin with reservation", "ACTION_HISTORY_INVALID");
    }
    return cloneJson(records);
  }

  transition(envelope, patch, recordedAt, authority) {
    this.#requireTrustedTransition(authority);
    const current = this.read(envelope.envelopeId);
    if (current.envelopeId !== envelope.envelopeId || current.authorityHash !== envelope.authorityHash) {
      fail("Persisted action state does not match authority", "ACTION_STATE_MISMATCH");
    }
    if (current.terminal) fail("Terminal action state cannot transition", "ACTION_STATE_TERMINAL");
    const next = { ...current, ...cloneJson(patch) };
    validateStateTransition(current, next);
    this.#appendHistory(envelope, next, recordedAt);
    return cloneJson(next);
  }
}

Object.freeze(LocalActionStateStore.prototype);

async function finishFailure({ envelope, handler, verifier, stateStore, context, cause, result, clock }) {
  const failure = errorRecord(cause);
  if (handler.compensate === null) {
    const finishedAt = clock();
    const state = stateStore.transition(envelope, terminalPatch("partial-failure-uncompensated", finishedAt, {
      sideEffectFinishedAt: finishedAt,
      effect: "unknown-or-partial",
      error: failure
    }), finishedAt, TRUSTED_STATE_TRANSITION);
    throw new ActionExecutionError("Action may be partial and has no compensation handler", state, cause, createActionReceipt(envelope, stateStore));
  }

  const compensationStartedAt = clock();
  stateStore.transition(envelope, {
    phase: "compensating",
    sideEffectFinishedAt: compensationStartedAt,
    effect: "unknown-or-partial",
    error: failure,
    compensationCalls: 1
  }, compensationStartedAt, TRUSTED_STATE_TRANSITION);

  let compensationResult;
  try {
    compensationResult = await handler.compensate({
      ...context,
      phase: "compensation",
      failure,
      result
    });
    const compensation = evidenceRecord(compensationResult, "compensation-result");
    stateStore.transition(envelope, { compensation }, clock(), TRUSTED_STATE_TRANSITION);
  } catch (compensationError) {
    const completedAt = clock();
    const state = stateStore.transition(envelope, terminalPatch("compensation-failed", completedAt, {
      compensation: { ...errorRecord(compensationError), status: "failed" }
    }), completedAt, TRUSTED_STATE_TRANSITION);
    throw new ActionExecutionError("Action failed and compensation also failed", state, cause, createActionReceipt(envelope, stateStore));
  }

  let rollbackReadback;
  try {
    const beforeReadback = stateStore.read(envelope.envelopeId);
    stateStore.transition(envelope, { readbackCalls: beforeReadback.readbackCalls + 1 }, clock(), TRUSTED_STATE_TRANSITION);
    rollbackReadback = await verifier.verify({
      ...context,
      phase: "after-compensation",
      failure,
      result,
      compensationResult
    });
    const evidence = authoritativeReadbackEvidence(envelope, rollbackReadback, "after-compensation");
    stateStore.transition(envelope, { readback: evidence }, clock(), TRUSTED_STATE_TRANSITION);
  } catch (readbackError) {
    const completedAt = clock();
    const state = stateStore.transition(envelope, terminalPatch("rollback-unverified", completedAt, {
      readback: { ...errorRecord(readbackError), status: "unverified" }
    }), completedAt, TRUSTED_STATE_TRANSITION);
    throw new ActionExecutionError("Compensation ran but rollback could not be verified", state, cause, createActionReceipt(envelope, stateStore));
  }

  const completedAt = clock();
  const state = stateStore.transition(envelope, terminalPatch("rolled-back", completedAt, {
    effect: "rolled-back-confirmed"
  }), completedAt, TRUSTED_STATE_TRANSITION);
  throw new ActionExecutionError("Action failed and was rolled back", state, cause, createActionReceipt(envelope, stateStore));
}

/**
 * Reserves (permanently spends) authority synchronously before the first await and
 * before invoking execute. Consequently concurrent calls can enter a handler at
 * most once, including across local processes sharing the state directory.
 */
export async function executeActionEnvelope(envelope, options) {
  assertPlainObject(options, "execution options");
  envelope = deepFreeze(cloneJson(envelope));
  if (!(options.stateStore instanceof LocalActionStateStore) ||
      Object.getPrototypeOf(options.stateStore) !== LocalActionStateStore.prototype) {
    fail("stateStore must be the native persisted LocalActionStateStore");
  }
  if (!(options.registry instanceof ClosedHandlerRegistry)) fail("registry must be a ClosedHandlerRegistry");
  if (!(options.verifierRegistry instanceof ClosedVerifierRegistry)) fail("verifierRegistry must be a ClosedVerifierRegistry");
  const clock = options.clock ?? (() => new Date().toISOString());
  if (typeof clock !== "function") fail("clock must be a function");
  const validationNow = options.now ?? clock();
  const validation = validateActionEnvelope(envelope, { ...options, now: validationNow });
  const handler = validation.handler;
  const verifier = validation.verifier;
  const stateStore = options.stateStore;

  stateStore.reserve(envelope, clock(), TRUSTED_STATE_TRANSITION);
  if (envelope.approval !== null) {
    try {
      options.challengeStore.consume(envelope.approval, clock());
    } catch (error) {
      const completedAt = clock();
      const state = stateStore.transition(envelope, terminalPatch("failed-before-side-effect", completedAt, {
        error: errorRecord(error)
      }), completedAt, TRUSTED_STATE_TRANSITION);
      throw new ActionExecutionError("Approval challenge could not be consumed", state, error, createActionReceipt(envelope, stateStore));
    }
  }

  const context = deepFreeze({
    envelopeId: envelope.envelopeId,
    authorityHash: envelope.authorityHash,
    accountId: envelope.accountId,
    projectId: envelope.projectId,
    environment: envelope.environment,
    target: cloneJson(envelope.target),
    operation: envelope.operation,
    tool: cloneJson(envelope.tool),
    parameters: cloneJson(envelope.parameters),
    dataClasses: cloneJson(envelope.dataClasses),
    cost: cloneJson(envelope.cost),
    rollback: cloneJson(envelope.rollback),
    stopConditions: cloneJson(envelope.stopConditions),
    verification: {
      verifierId: envelope.verifierId,
      tool: cloneJson(envelope.verificationTool),
      source: cloneJson(envelope.readbackSource),
      expectedPostcondition: cloneJson(envelope.expectedPostcondition)
    }
  });

  stateStore.transition(envelope, {
    phase: "preflight",
    readbackCalls: 1
  }, clock(), TRUSTED_STATE_TRANSITION);

  let preflightReadback;
  try {
    preflightReadback = await verifier.verify({ ...context, phase: "before-execute" });
    const evidence = authoritativeReadbackEvidence(envelope, preflightReadback, "before-execute");
    stateStore.transition(envelope, { preflightReadback: evidence }, clock(), TRUSTED_STATE_TRANSITION);
  } catch (error) {
    const completedAt = clock();
    const state = stateStore.transition(envelope, terminalPatch("failed-before-side-effect", completedAt, {
      preflightReadback: { ...errorRecord(error), status: "unverified" },
      error: errorRecord(error)
    }), completedAt, TRUSTED_STATE_TRANSITION);
    throw new ActionExecutionError("Authoritative target preflight failed before side effect", state, error, createActionReceipt(envelope, stateStore));
  }

  const preEffectNow = clock();
  try {
    const preEffectMs = timestampMs(preEffectNow, "pre-effect now");
    if (timestampMs(envelope.expiresAt, "expiresAt") <= preEffectMs) {
      fail("Action envelope expired immediately before side effect", "ACTION_EXPIRED");
    }
    if (preEffectMs - timestampMs(envelope.createdAt, "createdAt") > (options.maxAgeMs ?? DEFAULT_MAX_AGE_MS)) {
      fail("Action envelope became stale immediately before side effect", "ACTION_STALE");
    }
    if (envelope.approval !== null && timestampMs(envelope.approval.expiresAt, "approval.expiresAt") <= preEffectMs) {
      fail("Action approval expired immediately before side effect", "ACTION_EXPIRED");
    }
  } catch (error) {
    const state = stateStore.transition(envelope, terminalPatch("failed-before-side-effect", preEffectNow, {
      error: errorRecord(error)
    }), preEffectNow, TRUSTED_STATE_TRANSITION);
    throw new ActionExecutionError("Action authority was no longer fresh before side effect", state, error, createActionReceipt(envelope, stateStore));
  }

  const conditionalWrite = typeof handler.executeConditional === "function";
  const execute = conditionalWrite ? handler.executeConditional : handler.execute;
  const executionMode = conditionalWrite ? "native-conditional-write" : "verified-precondition-write";
  const precondition = deepFreeze({
    sourceSystemId: envelope.readbackSource.systemId,
    nativeResourceId: envelope.target.nativeResourceId,
    expectedVersion: envelope.target.expectedVersion,
    authoritativeReadbackHash: sha256Canonical(preflightReadback),
    nativeConditionalWriteRequired: conditionalWrite
  });

  stateStore.transition(envelope, {
    phase: "executing",
    sideEffectStartedAt: preEffectNow,
    handlerCalls: 1,
    effect: "in-progress-or-unknown",
    executionMode
  }, preEffectNow, TRUSTED_STATE_TRANSITION);

  let result;
  try {
    result = await execute({ ...context, phase: "execute", precondition });
    const handlerResult = evidenceRecord(result, "handler-result");
    stateStore.transition(envelope, { handlerResult }, clock(), TRUSTED_STATE_TRANSITION);
  } catch (error) {
    return finishFailure({ envelope, handler, verifier, stateStore, context, cause: error, result: null, clock });
  }

  let readback;
  try {
    stateStore.transition(envelope, { readbackCalls: 2 }, clock(), TRUSTED_STATE_TRANSITION);
    readback = await verifier.verify({ ...context, phase: "after-execute", result });
    const evidence = authoritativeReadbackEvidence(envelope, readback, "after-execute");
    const finishedAt = clock();
    stateStore.transition(envelope, {
      readback: evidence,
      sideEffectFinishedAt: finishedAt
    }, finishedAt, TRUSTED_STATE_TRANSITION);
  } catch (error) {
    return finishFailure({ envelope, handler, verifier, stateStore, context, cause: error, result, clock });
  }

  const completedAt = clock();
  const state = stateStore.transition(envelope, terminalPatch("succeeded", completedAt, {
    effect: "applied-confirmed"
  }), completedAt, TRUSTED_STATE_TRANSITION);
  return { result, readback, state, receipt: createActionReceipt(envelope, stateStore) };
}
