import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalize, cloneJson, sha256Canonical } from "./canonical-json.mjs";
import { validateJsonSchema } from "./validators.mjs";

export const HANDOFF_SCHEMA_VERSION = "0.1.0";

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY_ROOT = path.resolve(MODULE_DIRECTORY, "../../..");
export const HANDOFF_SCHEMA_DIRECTORY = path.resolve(
  MODULE_DIRECTORY,
  "../handoff/versions/0.1.0/schemas"
);

const SCHEMA_FILES = Object.freeze({
  branchCapsule: "branch-capsule.schema.json",
  actionEnvelope: "action-envelope.schema.json",
  executionReceipt: "execution-receipt.schema.json",
  ownerApprovalAttestation: "owner-approval-attestation.schema.json",
  independentReviewDecision: "independent-review-decision.schema.json",
  actionReceiptIndex: "action-receipt-index.schema.json"
});

const HASH_FIELDS = Object.freeze({
  "clover-handoff-branch-capsule": "capsuleHash",
  "clover-handoff-action-envelope": "envelopeHash",
  "clover-handoff-execution-receipt": "receiptHash",
  "clover-handoff-owner-approval-attestation": "attestationHash",
  "clover-handoff-independent-review-decision": "decisionHash",
  "clover-handoff-action-receipt-index": "indexHash"
});

const CAPABILITY_FIELDS = Object.freeze([
  "readPublicMetadata",
  "createIsolatedBranch",
  "commitCandidate",
  "pushCandidateBranch",
  "openDraftPullRequest",
  "runNonProductionChecks",
  "createNonProductionPreview",
  "recordHandoffArtifacts"
]);

const OPERATION_CAPABILITIES = Object.freeze({
  "refresh-public-candidate-status": ["readPublicMetadata", "recordHandoffArtifacts"],
  "reconcile-public-project-identity": ["readPublicMetadata", "recordHandoffArtifacts"],
  "prepare-isolated-candidate-branch": [
    "readPublicMetadata",
    "createIsolatedBranch",
    "commitCandidate",
    "pushCandidateBranch",
    "openDraftPullRequest",
    "recordHandoffArtifacts"
  ],
  "run-non-production-validation": [
    "readPublicMetadata",
    "runNonProductionChecks",
    "createNonProductionPreview",
    "recordHandoffArtifacts"
  ],
  "prepare-source-bound-receipt": ["readPublicMetadata", "recordHandoffArtifacts"]
});

const OPERATION_ALLOWED_ACTIONS = Object.freeze({
  "refresh-public-candidate-status": new Set([
    "read-public-metadata",
    "verify-exact-identity",
    "verify-local-cleanliness",
    "verify-source-ancestry",
    "assemble-sanitized-receipt",
    "record-handoff-artifacts"
  ]),
  "reconcile-public-project-identity": new Set([
    "read-public-metadata",
    "verify-exact-identity",
    "assemble-sanitized-receipt",
    "record-handoff-artifacts"
  ]),
  "prepare-isolated-candidate-branch": new Set([
    "read-public-metadata",
    "verify-exact-identity",
    "verify-local-cleanliness",
    "verify-source-ancestry",
    "create-isolated-branch",
    "commit-candidate",
    "push-candidate-branch",
    "open-draft-pull-request",
    "record-handoff-artifacts"
  ]),
  "run-non-production-validation": new Set([
    "read-public-metadata",
    "verify-exact-identity",
    "run-local-validation",
    "create-non-production-preview",
    "assemble-sanitized-receipt",
    "record-handoff-artifacts"
  ]),
  "prepare-source-bound-receipt": new Set([
    "read-public-metadata",
    "verify-exact-identity",
    "assemble-sanitized-receipt",
    "record-handoff-artifacts"
  ])
});

const OWNER_APPROVAL_OPERATIONS = new Set([
  "reconcile-public-project-identity",
  "prepare-isolated-candidate-branch",
  "run-non-production-validation"
]);

const READ_ONLY_OPERATIONS = new Set([
  "refresh-public-candidate-status",
  "reconcile-public-project-identity",
  "prepare-source-bound-receipt"
]);

const ACTION_CAPABILITIES = Object.freeze({
  "read-public-metadata": ["readPublicMetadata"],
  "verify-exact-identity": ["readPublicMetadata"],
  "verify-local-cleanliness": ["readPublicMetadata"],
  "verify-source-ancestry": ["readPublicMetadata"],
  "assemble-sanitized-receipt": ["readPublicMetadata"],
  "record-handoff-artifacts": ["recordHandoffArtifacts"],
  "create-isolated-branch": ["createIsolatedBranch"],
  "commit-candidate": ["commitCandidate"],
  "push-candidate-branch": ["pushCandidateBranch"],
  "open-draft-pull-request": ["openDraftPullRequest"],
  "run-local-validation": ["runNonProductionChecks"],
  "create-non-production-preview": ["createNonProductionPreview"]
});

const REQUIRED_PROHIBITIONS = Object.freeze([
  "merge",
  "production-deployment",
  "production-data-access",
  "persistent-configuration-change",
  "domain-or-alias-change",
  "secret-change",
  "external-message",
  "payment-exercise",
  "purchase"
]);

const SENSITIVE_KEYS = new Set([
  "secret",
  "secrets",
  "secretvalue",
  "password",
  "credential",
  "credentials",
  "token",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "cookie",
  "rawdata",
  "customerdata",
  "guestdata",
  "staffdata",
  "legaldata",
  "healthdata",
  "financialdata",
  "paymentdata",
  "transactiondata",
  "emailbody",
  "messagebody"
]);

const SENSITIVE_VALUE_PATTERNS = Object.freeze([
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{10,}/iu,
  /\b(?:sk|pk|ghp|github_pat|vercel)_[A-Za-z0-9_-]{12,}\b/iu,
  /[?&](?:access_?token|auth|authorization|secret|password)=/iu
]);

export class HandoffLedgerError extends Error {
  constructor(message, code = "HANDOFF_LEDGER_INVALID", details = null) {
    super(message);
    this.name = "HandoffLedgerError";
    this.code = code;
    this.details = details;
  }
}

function fail(message, code = "HANDOFF_LEDGER_INVALID", details = null) {
  throw new HandoffLedgerError(message, code, details);
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${label} must be a plain object`);
}

function timestampMs(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(`${label} is not a valid timestamp`, "HANDOFF_TIME_INVALID");
  return parsed;
}

function assertChronology(start, end, startLabel, endLabel) {
  if (timestampMs(start, startLabel) >= timestampMs(end, endLabel)) {
    fail(`${endLabel} must be later than ${startLabel}`, "HANDOFF_TIME_INVALID");
  }
}

function normalizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/gu, "");
}

function inspectSanitized(value, location, seen) {
  if (typeof value === "string") {
    for (const pattern of SENSITIVE_VALUE_PATTERNS) {
      if (pattern.test(value)) fail(`Sensitive-looking value rejected at ${location}`, "HANDOFF_SENSITIVE_CONTENT");
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) fail(`Cycle rejected at ${location}`, "HANDOFF_SENSITIVE_CONTENT");
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectSanitized(entry, `${location}/${index}`, seen));
  } else {
    for (const [key, entry] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(normalizeKey(key))) {
        fail(`Sensitive field ${key} rejected at ${location}`, "HANDOFF_SENSITIVE_CONTENT");
      }
      inspectSanitized(entry, `${location}/${key}`, seen);
    }
  }
  seen.delete(value);
}

export function assertSanitizedHandoffDocument(value, label = "handoff document") {
  inspectSanitized(value, label, new Set());
  return true;
}

export function canonicalHandoffJson(value) {
  return canonicalize(value);
}

export function computeHandoffHash(value, hashField) {
  assertPlainObject(value, "hash input");
  if (typeof hashField !== "string" || hashField.length === 0) {
    fail("hashField must be a non-empty string", "HANDOFF_HASH_INVALID");
  }
  const unsigned = cloneJson(value);
  delete unsigned[hashField];
  return sha256Canonical(unsigned);
}

export function sealHandoffDocument(value, hashField) {
  const sealed = cloneJson(value);
  delete sealed[hashField];
  sealed[hashField] = computeHandoffHash(sealed, hashField);
  return sealed;
}

export function assertHandoffHash(value, hashField, label = "handoff document") {
  assertPlainObject(value, label);
  const observed = value[hashField];
  if (!/^[a-f0-9]{64}$/.test(String(observed || ""))) {
    fail(`${label}.${hashField} is not a lowercase SHA-256 digest`, "HANDOFF_HASH_INVALID");
  }
  const expected = computeHandoffHash(value, hashField);
  if (observed !== expected) {
    fail(`${label}.${hashField} does not bind the canonical document`, "HANDOFF_HASH_MISMATCH", {
      expected,
      observed
    });
  }
  return true;
}

function readSchema(kind) {
  const fileName = SCHEMA_FILES[kind];
  if (!fileName) fail(`Unknown handoff schema kind ${kind}`, "HANDOFF_SCHEMA_UNKNOWN");
  return JSON.parse(fs.readFileSync(path.join(HANDOFF_SCHEMA_DIRECTORY, fileName), "utf8"));
}

function validateSchema(kind, value, label) {
  try {
    validateJsonSchema(readSchema(kind), value, {
      schemaDirectory: HANDOFF_SCHEMA_DIRECTORY,
      label
    });
  } catch (error) {
    if (error instanceof HandoffLedgerError) throw error;
    fail(`${label} failed its closed JSON schema: ${error.message}`, "HANDOFF_SCHEMA_VIOLATION", {
      cause: error.message
    });
  }
}

function inspectClosedSchema(schema, location) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes("object") && schema.additionalProperties !== false) {
    fail(`${location} is not a closed object schema`, "HANDOFF_SCHEMA_OPEN_OBJECT");
  }
  for (const group of ["properties", "$defs"]) {
    for (const [key, child] of Object.entries(schema[group] || {})) {
      inspectClosedSchema(child, `${location}/${group}/${key}`);
    }
  }
  for (const key of ["items", "contains", "if", "then", "else"]) {
    if (schema[key]) inspectClosedSchema(schema[key], `${location}/${key}`);
  }
  for (const key of ["allOf", "oneOf", "anyOf"]) {
    (schema[key] || []).forEach((child, index) => inspectClosedSchema(child, `${location}/${key}/${index}`));
  }
}

export function verifyHandoffSchemaCatalog() {
  const ids = new Set();
  for (const [kind, fileName] of Object.entries(SCHEMA_FILES)) {
    const schema = readSchema(kind);
    if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
      fail(`${fileName} does not declare JSON Schema 2020-12`, "HANDOFF_SCHEMA_INVALID");
    }
    if (typeof schema.$id !== "string" || !schema.$id.startsWith("https://cloverapps.ai/schemas/")) {
      fail(`${fileName} has no canonical schema ID`, "HANDOFF_SCHEMA_INVALID");
    }
    if (ids.has(schema.$id)) fail(`Duplicate handoff schema ID ${schema.$id}`, "HANDOFF_SCHEMA_INVALID");
    ids.add(schema.$id);
    inspectClosedSchema(schema, kind);
  }
  return { valid: true, schemaCount: ids.size, schemaIds: [...ids].sort() };
}

function assertSelfHash(document, expectedType, hashField, label) {
  if (document.documentType !== expectedType) {
    fail(`${label}.documentType is unsupported`, "HANDOFF_DOCUMENT_TYPE_INVALID");
  }
  if (HASH_FIELDS[document.documentType] !== hashField) {
    fail(`${label} has an unsupported hash contract`, "HANDOFF_HASH_INVALID");
  }
  assertHandoffHash(document, hashField, label);
}

function assertCapabilitySet(authority, enabled, label) {
  const enabledSet = new Set(enabled);
  for (const field of CAPABILITY_FIELDS) {
    if (authority[field] !== enabledSet.has(field)) {
      fail(`${label}.${field} violates the exact operation authority`, "HANDOFF_AUTHORITY_DENIED");
    }
  }
}

function assertExactSet(observed, expected, label) {
  if (observed.length !== expected.length || expected.some((entry) => !observed.includes(entry))) {
    fail(`${label} is not the exact required set`, "HANDOFF_DEFAULT_DENY");
  }
}

function identityHasExactField(identity) {
  return ["repository", "branch", "commit", "tree", "version", "deploymentId", "url"]
    .some((field) => identity[field] !== null);
}

function assertCapsuleRecordSemantics(capsule) {
  for (const [role, identity] of Object.entries(capsule.identities)) {
    if (["verified", "reported"].includes(identity.status)) {
      if (!identityHasExactField(identity) || identity.observedAt === null || identity.sourceRef === null ||
          identity.confidence === "unknown") {
        fail(`Capsule ${role} identity lacks exact evidence`, "HANDOFF_IDENTITY_INVALID");
      }
    } else if (identityHasExactField(identity)) {
      fail(`Capsule ${role} identity claims fields while ${identity.status}`, "HANDOFF_IDENTITY_INVALID");
    }
  }

  const receipt = capsule.latestAcceptedReceipt;
  if (receipt.status === "accepted") {
    if (!receipt.receiptId || !receipt.receiptHash || !receipt.sourceRef) {
      fail("Accepted capsule receipt is incomplete", "HANDOFF_RECEIPT_BINDING_INVALID");
    }
  } else if (receipt.receiptId !== null || receipt.receiptHash !== null || receipt.sourceRef !== null) {
    fail("Unaccepted capsule receipt must not imply an identity", "HANDOFF_RECEIPT_BINDING_INVALID");
  }

  const decision = capsule.activeOwnerDecision;
  if (decision.status === "active") {
    if (!decision.decisionId || !decision.sourceRef) fail("Active owner decision lacks evidence", "HANDOFF_APPROVAL_INVALID");
  } else if (decision.decisionId !== null || decision.sourceRef !== null) {
    fail("Inactive owner decision must not imply an identity", "HANDOFF_APPROVAL_INVALID");
  }

  const rollbackIds = capsule.rollbackAnchors.map((entry) => `${entry.anchorType}:${entry.identity}`);
  if (new Set(rollbackIds).size !== rollbackIds.length) {
    fail("Capsule rollback anchors are duplicated", "HANDOFF_ROLLBACK_MISMATCH");
  }
}

export function validateBranchCapsule(capsule, options = {}) {
  const label = options.label || "branch capsule";
  validateSchema("branchCapsule", capsule, label);
  assertSanitizedHandoffDocument(capsule, label);
  assertSelfHash(capsule, "clover-handoff-branch-capsule", "capsuleHash", label);
  assertCapsuleRecordSemantics(capsule);
  return { valid: true, projectId: capsule.project.projectId };
}

function targetMatchesCapsule(target, capsule, operation) {
  if (target.projectId !== capsule.project.projectId) return false;
  const exactFields = [target.repository, target.branch, target.expectedCommit].filter((entry) => entry !== null);
  if (exactFields.length === 0) {
    return Object.values(capsule.identities).every((identity) =>
      identity.repository === null && identity.branch === null && identity.commit === null
    );
  }
  return Object.values(capsule.identities).some((identity) => {
    const acceptedStates = READ_ONLY_OPERATIONS.has(operation) ? ["verified", "reported"] : ["verified"];
    if (!acceptedStates.includes(identity.status)) return false;
    if (target.repository !== null && identity.repository !== target.repository) return false;
    if (target.branch !== null && identity.branch !== target.branch) return false;
    if (target.expectedCommit !== null && identity.commit !== target.expectedCommit) return false;
    return true;
  });
}

function assertActionScope(envelope) {
  const allowedActions = OPERATION_ALLOWED_ACTIONS[envelope.operation];
  if (!allowedActions) fail("Operation is not enrolled", "HANDOFF_OPERATION_DENIED");
  for (const action of envelope.scope.allowedActions) {
    if (!allowedActions.has(action)) fail(`Action ${action} is outside the operation`, "HANDOFF_OPERATION_DENIED");
  }
  assertExactSet(envelope.scope.prohibitedActions, REQUIRED_PROHIBITIONS, "prohibitedActions");

  const connectors = new Set(envelope.scope.allowedConnectors);
  const sourceRequirementIds = new Set();
  for (const source of envelope.sourceRequirements) {
    if (!connectors.has(source.sourceId)) fail("Source connector is outside allowedConnectors", "HANDOFF_CONNECTOR_DENIED");
    if (sourceRequirementIds.has(source.sourceRequirementId)) {
      fail("Source requirement identity is duplicated", "HANDOFF_EVIDENCE_INCOMPLETE");
    }
    sourceRequirementIds.add(source.sourceRequirementId);
    if ((source.identityMode === "exact") !== (source.expectedIdentity !== null)) {
      fail("Source requirement identity mode is inconsistent", "HANDOFF_EVIDENCE_INCOMPLETE");
    }
  }
  for (const readback of envelope.readbackRequirements) {
    if (!connectors.has(readback.connector)) fail("Readback connector is outside allowedConnectors", "HANDOFF_CONNECTOR_DENIED");
  }
  for (const evidence of envelope.evidenceRequirements) {
    if (!evidence.required || !evidence.exactSourceRequired || !evidence.sourceBoundRequired) {
      fail("Every enrolled evidence requirement must be exact and source-bound", "HANDOFF_EVIDENCE_INCOMPLETE");
    }
  }
  if (envelope.scope.allowedWritePaths.length > 0 && !envelope.requestedAuthority.commitCandidate) {
    fail("Write paths require explicit candidate commit authority", "HANDOFF_AUTHORITY_DENIED");
  }
  if (envelope.scope.allowedRecordingPaths.length > 0 && !envelope.requestedAuthority.recordHandoffArtifacts) {
    fail("Handoff recording paths require explicit artifact-recording authority", "HANDOFF_AUTHORITY_DENIED");
  }
}

function capabilitiesForActions(actions) {
  const capabilities = new Set();
  for (const action of actions) {
    const mapped = ACTION_CAPABILITIES[action];
    if (!mapped) fail(`Action ${action} has no capability mapping`, "HANDOFF_OPERATION_DENIED");
    mapped.forEach((capability) => capabilities.add(capability));
  }
  return CAPABILITY_FIELDS.filter((capability) => capabilities.has(capability));
}

function assertEnvelopeIssuance(envelope) {
  const expectedCapabilities = OPERATION_CAPABILITIES[envelope.operation];
  if (!expectedCapabilities) fail("Operation is not enrolled", "HANDOFF_OPERATION_DENIED");
  const scopedCapabilities = capabilitiesForActions(envelope.scope.allowedActions);
  if (scopedCapabilities.some((capability) => !expectedCapabilities.includes(capability))) {
    fail("Action scope requests a capability outside the operation maximum", "HANDOFF_OPERATION_DENIED");
  }
  assertCapabilitySet(envelope.requestedAuthority, scopedCapabilities, "requested authority");

  const approvalRequired = OWNER_APPROVAL_OPERATIONS.has(envelope.operation);
  if (approvalRequired) {
    if (!envelope.approval.required || envelope.approval.status !== "proposed-unapproved" ||
        envelope.approval.approvalEvidenceHash !== null || envelope.lifecycle.issuanceState !== "proposed") {
      fail("Owner-gated envelope is not an immutable proposal", "HANDOFF_APPROVAL_INVALID");
    }
    assertCapabilitySet(envelope.authority, [], "proposal effective authority");
  } else {
    if (envelope.approval.required || envelope.approval.status !== "not-required" ||
        envelope.approval.approvalEvidenceHash !== null || envelope.lifecycle.issuanceState !== "available") {
      fail("Non-gated envelope approval fields are inconsistent", "HANDOFF_APPROVAL_INVALID");
    }
    assertCapabilitySet(envelope.authority, scopedCapabilities, "effective authority");
  }

  if (envelope.lifecycle.revocationStatus === "revoked") {
    if (!envelope.lifecycle.revokedAt || !envelope.lifecycle.revocationEvidenceHash) {
      fail("Revoked envelope lacks exact revocation evidence", "HANDOFF_LIFECYCLE_INVALID");
    }
  } else if (envelope.lifecycle.revokedAt !== null || envelope.lifecycle.revocationEvidenceHash !== null) {
    fail("Unrevoked envelope carries revocation evidence", "HANDOFF_LIFECYCLE_INVALID");
  }

  return { approvalRequired, expectedCapabilities: scopedCapabilities };
}

function assertIndexIdentity(index, label = "action receipt index") {
  validateSchema("actionReceiptIndex", index, label);
  assertSanitizedHandoffDocument(index, label);
  assertSelfHash(index, "clover-handoff-action-receipt-index", "indexHash", label);
}

function findEnvelopeIndexEntry(index, envelope) {
  const entries = index.entries.filter((entry) => entry.actionId === envelope.actionId ||
    entry.envelopeId === envelope.envelopeId);
  if (entries.length !== 1) fail("Envelope does not have one exact lifecycle entry", "HANDOFF_INDEX_INCONSISTENT");
  const entry = entries[0];
  if (entry.actionId !== envelope.actionId || entry.envelopeId !== envelope.envelopeId ||
      entry.envelopeHash !== envelope.envelopeHash) {
    fail("Action ID or envelope hash was substituted in the lifecycle index", "HANDOFF_ENVELOPE_SUBSTITUTION");
  }
  return entry;
}

function resolveEnvelopeAuthority(envelope, options, issuance) {
  if (envelope.lifecycle.revocationStatus === "revoked") {
    return { executable: false, reason: "revoked", effectiveAuthority: envelope.authority };
  }

  if (!options.index) {
    return { executable: false, reason: "lifecycle-index-required", effectiveAuthority: envelope.authority };
  }
  assertIndexIdentity(options.index);
  const entry = findEnvelopeIndexEntry(options.index, envelope);
  if (entry.lifecycle.state === "revoked") {
    return { executable: false, reason: "revoked", effectiveAuthority: envelope.authority };
  }
  if (!issuance.approvalRequired) {
    if (entry.ownerApproval.status !== "not-required") {
      fail("Non-gated action has inconsistent indexed approval", "HANDOFF_APPROVAL_INVALID");
    }
    if (entry.lifecycle.state === "consumed" && entry.receiptId !== options.allowConsumedByReceiptId) {
      return { executable: false, reason: "single-use-consumed", effectiveAuthority: envelope.authority };
    }
    if (!['available', 'consumed'].includes(entry.lifecycle.state)) {
      return { executable: false, reason: "lifecycle-not-available", effectiveAuthority: envelope.authority };
    }
    return { executable: true, reason: null, effectiveAuthority: envelope.authority };
  }
  if (entry.ownerApproval.status !== "approved") {
    return { executable: false, reason: "owner-approval-required", effectiveAuthority: envelope.authority };
  }
  if (entry.ownerApproval.approverId !== envelope.approval.requiredApproverId ||
      entry.ownerApproval.approvedEnvelopeHash !== envelope.envelopeHash) {
    fail("Owner approval does not bind the exact immutable envelope", "HANDOFF_APPROVAL_INVALID");
  }
  if (timestampMs(entry.ownerApproval.approvedAt, "approvedAt") >= timestampMs(envelope.expiresAt, "expiresAt")) {
    fail("Owner approval occurred after envelope expiry", "HANDOFF_EXPIRED");
  }
  resolveIndexedApprovalAttestation(entry, envelope, options.repositoryRoot || DEFAULT_REPOSITORY_ROOT);
  if (entry.lifecycle.state === "consumed" && entry.receiptId !== options.allowConsumedByReceiptId) {
    return { executable: false, reason: "single-use-consumed", effectiveAuthority: envelope.requestedAuthority };
  }
  if (!['available', 'consumed'].includes(entry.lifecycle.state)) {
    return { executable: false, reason: "owner-approval-required", effectiveAuthority: envelope.authority };
  }
  return { executable: true, reason: null, effectiveAuthority: envelope.requestedAuthority };
}

export function validateActionEnvelope(envelope, options = {}) {
  if (!options.branchCapsule) fail("branchCapsule is required", "HANDOFF_CONTEXT_REQUIRED");
  validateBranchCapsule(options.branchCapsule);
  const label = options.label || "action envelope";
  validateSchema("actionEnvelope", envelope, label);
  assertSanitizedHandoffDocument(envelope, label);
  assertSelfHash(envelope, "clover-handoff-action-envelope", "envelopeHash", label);
  assertChronology(envelope.createdAt, envelope.expiresAt, "action envelope createdAt", "action envelope expiresAt");
  if (options.now !== undefined && timestampMs(options.now, "now") >= timestampMs(envelope.expiresAt, "expiresAt")) {
    fail("Action envelope has expired", "HANDOFF_EXPIRED");
  }
  if (envelope.branchCapsuleId !== options.branchCapsule.capsuleId ||
      envelope.branchCapsuleHash !== options.branchCapsule.capsuleHash) {
    fail("Action envelope does not bind the exact branch capsule", "HANDOFF_CAPSULE_SUBSTITUTION");
  }
  if (!targetMatchesCapsule(envelope.target, options.branchCapsule, envelope.operation)) {
    fail("Action envelope target was substituted or remains unbound", "HANDOFF_TARGET_SUBSTITUTION");
  }
  assertActionScope(envelope);
  const issuance = assertEnvelopeIssuance(envelope);
  const resolved = resolveEnvelopeAuthority(envelope, options, issuance);
  return { valid: true, ...resolved };
}

export function assertActionEnvelopeExecutable(envelope, options = {}) {
  const result = validateActionEnvelope(envelope, options);
  if (!result.executable) {
    const code = result.reason === "single-use-consumed" ? "HANDOFF_REPLAY_DENIED" :
      result.reason === "revoked" ? "HANDOFF_REVOKED" : "HANDOFF_DEFAULT_DENY";
    fail(`Action envelope is not executable: ${result.reason}`, code);
  }
  return result;
}

function assertNestedRecordHashes(receipt) {
  for (const observation of receipt.observations) {
    assertHandoffHash(observation, "evidenceHash", `observation ${observation.observationId}`);
  }
  for (const check of receipt.checks) assertHandoffHash(check, "checkHash", `check ${check.checkId}`);
}

function sourceMatchesCapsule(source, capsule, operation) {
  return Object.values(capsule.identities).some((identity) =>
    (READ_ONLY_OPERATIONS.has(operation) ? ["verified", "reported"] : ["verified"]).includes(identity.status) &&
    identity.repository === source.repository && identity.branch === source.branch &&
    identity.commit === source.commit && identity.tree === source.tree
  );
}

function loadReconciledCapsule(reconciliation, inputCapsule, receipt, envelope, repositoryRoot) {
  const root = path.resolve(repositoryRoot || DEFAULT_REPOSITORY_ROOT);
  const absolute = path.resolve(root, reconciliation.resultCapsulePath);
  if (!absolute.startsWith(`${root}${path.sep}`) || !fs.existsSync(absolute)) {
    fail("Reconciliation result capsule is not resolvable", "HANDOFF_RECONCILIATION_INVALID");
  }
  const result = JSON.parse(fs.readFileSync(absolute, "utf8"));
  validateBranchCapsule(result, { label: "reconciliation result capsule" });
  if (result.capsuleId !== reconciliation.resultCapsuleId ||
      result.capsuleHash !== reconciliation.resultCapsuleHash ||
      result.project.projectId !== inputCapsule.project.projectId ||
      result.capsuleHash === inputCapsule.capsuleHash) {
    fail("Reconciliation result does not bind a new exact project capsule", "HANDOFF_RECONCILIATION_INVALID");
  }
  const verifiedIdentities = Object.values(result.identities).filter((identity) => identity.status === "verified");
  if (!verifiedIdentities.some((identity) => identity.repository !== null &&
      [identity.branch, identity.commit, identity.deploymentId, identity.url].some((entry) => entry !== null))) {
    fail("Successful reconciliation result has no verified public source identity", "HANDOFF_RECONCILIATION_INVALID");
  }
  const identityValues = new Set(verifiedIdentities.flatMap((identity) =>
    [identity.repository, identity.branch, identity.commit, identity.tree, identity.version,
      identity.deploymentId, identity.url].filter((entry) => entry !== null)
  ));
  for (const requirement of envelope.sourceRequirements.filter((entry) => entry.identityMode === "discover")) {
    const observation = receipt.observations.find((entry) => entry.sourceId === requirement.sourceId &&
      entry.availability === "available" && entry.identityResolution === "exact-resolved");
    if (!observation || !identityValues.has(observation.identityKey)) {
      fail(`Result capsule omits discovered identity ${requirement.sourceRequirementId}`, "HANDOFF_RECONCILIATION_INVALID");
    }
  }
  const verifiedGitIdentities = verifiedIdentities.filter((identity) =>
    identity.repository !== null && identity.branch !== null && identity.commit !== null
  );
  if (verifiedGitIdentities.length === 0) {
    fail("Successful reconciliation result has no verified repository, branch, and commit identity", "HANDOFF_RECONCILIATION_INVALID");
  }
  if (!result.rollbackAnchors.some((entry) => entry.anchorType === "git-commit" &&
      entry.status === "verified" && verifiedGitIdentities.some((identity) => identity.commit === entry.identity))) {
    fail("Successful reconciliation result has no verified Git rollback anchor", "HANDOFF_ROLLBACK_MISMATCH");
  }
  return result;
}

function assertReceiptSourceAndReconciliation(receipt, envelope, capsule, repositoryRoot) {
  const reconciliation = receipt.reconciliation;
  if (reconciliation.inputCapsuleId !== capsule.capsuleId ||
      reconciliation.inputCapsuleHash !== capsule.capsuleHash) {
    fail("Receipt reconciliation input capsule was substituted", "HANDOFF_CAPSULE_SUBSTITUTION");
  }
  if (envelope.operation === "reconcile-public-project-identity") {
    if (receipt.source.bindingRole !== "input-capsule" ||
        [receipt.source.repository, receipt.source.branch, receipt.source.commit, receipt.source.tree]
          .some((entry) => entry !== null)) {
      fail("Identity reconciliation must bind its immutable input capsule, not invent a source", "HANDOFF_RECONCILIATION_INVALID");
    }
    if (receipt.outcome === "succeeded") {
      if (reconciliation.status !== "discovered" || !reconciliation.resultCapsuleId ||
          !reconciliation.resultCapsulePath || !reconciliation.resultCapsuleHash) {
        fail("Successful reconciliation lacks an exact output capsule", "HANDOFF_RECONCILIATION_INVALID");
      }
      const result = loadReconciledCapsule(reconciliation, capsule, receipt, envelope, repositoryRoot);
      if (receipt.resultingState.sourceCommit !== null &&
          !Object.values(result.identities).some((identity) => identity.commit === receipt.resultingState.sourceCommit)) {
        fail("Reconciliation resulting source is absent from the output capsule", "HANDOFF_SOURCE_SUBSTITUTION");
      }
    } else if (reconciliation.status !== "blocked" || reconciliation.resultCapsuleId !== null ||
        reconciliation.resultCapsulePath !== null || reconciliation.resultCapsuleHash !== null) {
      fail("Unsuccessful reconciliation must fail closed without a result capsule", "HANDOFF_RECONCILIATION_INVALID");
    }
    return;
  }

  if (receipt.source.bindingRole !== "target-source" ||
      [receipt.source.repository, receipt.source.branch, receipt.source.commit, receipt.source.tree]
        .some((entry) => entry === null) ||
      !sourceMatchesCapsule(receipt.source, capsule, envelope.operation)) {
    fail("Execution receipt target source was substituted", "HANDOFF_SOURCE_SUBSTITUTION");
  }
  if (reconciliation.status !== "not-applicable" || reconciliation.resultCapsuleId !== null ||
      reconciliation.resultCapsulePath !== null || reconciliation.resultCapsuleHash !== null) {
    fail("Non-reconciliation receipt contains a result capsule", "HANDOFF_RECONCILIATION_INVALID");
  }
  for (const [receiptField, targetField] of [["repository", "repository"], ["branch", "branch"], ["commit", "expectedCommit"]]) {
    if (envelope.target[targetField] !== null && receipt.source[receiptField] !== envelope.target[targetField]) {
      fail(`Execution receipt source ${receiptField} differs from the action target`, "HANDOFF_SOURCE_SUBSTITUTION");
    }
  }
}

function assertCandidateEffects(receipt, envelope, executionAuthority) {
  const performedActions = new Set(receipt.actionsPerformed);
  const effectContracts = [
    [receipt.candidateEffects.branch, "create-isolated-branch", "createIsolatedBranch"],
    [receipt.candidateEffects.commit, "commit-candidate", "commitCandidate"],
    [receipt.candidateEffects.push, "push-candidate-branch", "pushCandidateBranch"],
    [receipt.candidateEffects.draftPullRequest, "open-draft-pull-request", "openDraftPullRequest"]
  ];
  for (const [effect, action, capability] of effectContracts) {
    const details = Object.entries(effect).filter(([key]) => key !== "performed").map(([, value]) => value);
    if (effect.performed) {
      if (!performedActions.has(action) || !executionAuthority.effectiveAuthority[capability] ||
          details.some((entry) => entry === null)) {
        fail(`Candidate effect ${action} lacks exact scope, authority, or identity`, "HANDOFF_AUTHORITY_DENIED");
      }
    } else if (details.some((entry) => entry !== null)) {
      fail(`Unperformed candidate effect ${action} contains identities`, "HANDOFF_OUTCOME_INCONSISTENT");
    }
    if (receipt.outcome === "succeeded" && performedActions.has(action) !== effect.performed) {
      fail(`Successful receipt does not truthfully bind ${action}`, "HANDOFF_OUTCOME_INCONSISTENT");
    }
  }
  const targetMutation = effectContracts.some(([effect]) => effect.performed);
  if (receipt.changes.targetSourceMutationPerformed !== targetMutation) {
    fail("Target source mutation summary differs from exact candidate effects", "HANDOFF_OUTCOME_INCONSISTENT");
  }
  if (receipt.candidateEffects.commit.performed && receipt.changes.changedPaths.length === 0) {
    fail("Candidate commit effect contains no changed path boundary", "HANDOFF_OUTCOME_INCONSISTENT");
  }
  if (!receipt.candidateEffects.commit.performed && receipt.changes.changedPaths.length !== 0) {
    fail("Changed paths are present without a candidate commit effect", "HANDOFF_OUTCOME_INCONSISTENT");
  }
  return receipt.candidateEffects.commit.performed ? receipt.candidateEffects.commit.commit : receipt.source.commit;
}

function pathAllowed(candidate, allowedPaths) {
  return allowedPaths.some((allowed) => {
    if (allowed === candidate) return true;
    if (allowed.endsWith("/**")) return candidate.startsWith(allowed.slice(0, -3));
    return false;
  });
}

const CONNECTOR_IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/u;

function normalizeConnectorIdentifier(value, label) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim() ||
      !CONNECTOR_IDENTIFIER_PATTERN.test(value)) {
    fail(`${label} is not an exact connector identifier`, "HANDOFF_CONNECTOR_SCOPE_VIOLATION");
  }
  return value;
}

function bytewise(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function assessReceiptEvidenceScope(receipt, envelope) {
  assertPlainObject(receipt, "execution receipt");
  assertPlainObject(envelope, "action envelope");
  if (!Array.isArray(receipt.observations) || !Array.isArray(envelope.scope?.allowedConnectors)) {
    fail("Receipt observations and envelope allowedConnectors are required",
      "HANDOFF_CONNECTOR_SCOPE_VIOLATION");
  }
  const allowedSequence = envelope.scope.allowedConnectors.map((connector, offset) =>
    normalizeConnectorIdentifier(connector, `allowedConnectors[${offset}]`));
  if (new Set(allowedSequence).size !== allowedSequence.length) {
    fail("Envelope allowedConnectors contains a duplicate connector",
      "HANDOFF_CONNECTOR_SCOPE_VIOLATION");
  }
  const evidenceSequence = receipt.observations.map((observation, offset) => {
    assertPlainObject(observation, `execution receipt observation ${offset}`);
    return normalizeConnectorIdentifier(observation.sourceId, `observations[${offset}].sourceId`);
  });
  const allowed = new Set(allowedSequence);
  const evidenceSourceIds = [...new Set(evidenceSequence)].sort(bytewise);
  const outOfScopeSourceIds = evidenceSourceIds.filter((sourceId) => !allowed.has(sourceId));
  return {
    compliant: outOfScopeSourceIds.length === 0,
    allowedConnectors: [...allowed].sort(bytewise),
    evidenceSourceIds,
    outOfScopeSourceIds
  };
}

export function assertReceiptEvidenceScope(receipt, envelope) {
  const assessment = assessReceiptEvidenceScope(receipt, envelope);
  if (!assessment.compliant) {
    fail(`Receipt evidence uses connector(s) outside the immutable envelope: ${assessment.outOfScopeSourceIds.join(", ")}`,
      "HANDOFF_CONNECTOR_SCOPE_VIOLATION", assessment);
  }
  return assessment;
}

function assertReceiptEvidence(receipt, envelope) {
  for (const source of envelope.sourceRequirements) {
    const observations = receipt.observations.filter((entry) => entry.sourceId === source.sourceId);
    if (observations.length === 0) {
      fail(`Receipt omits source ${source.sourceRequirementId}`, "HANDOFF_EVIDENCE_INCOMPLETE");
    }
    const resolved = observations.filter((entry) => entry.availability === "available" &&
      entry.identityResolution === "exact-resolved");
    if (receipt.outcome === "succeeded" && resolved.length === 0) {
      fail(`Successful receipt did not resolve source ${source.sourceRequirementId}`, "HANDOFF_EVIDENCE_INCOMPLETE");
    }
    if (source.identityMode === "exact" && receipt.outcome === "succeeded" &&
        !resolved.some((entry) => entry.identityKey === source.expectedIdentity)) {
      fail(`Receipt substitutes source ${source.sourceRequirementId}`, "HANDOFF_SOURCE_SUBSTITUTION");
    }
  }
  for (const readback of envelope.readbackRequirements) {
    const observation = receipt.observations.find((entry) =>
      entry.sourceId === readback.connector && entry.subject === readback.subject
    );
    if (!observation) fail(`Receipt omits readback ${readback.readbackId}`, "HANDOFF_EVIDENCE_INCOMPLETE");
    if (observation.availability === "unavailable" && receipt.outcome === "succeeded") {
      fail(`Successful receipt claims unavailable readback ${readback.readbackId}`, "HANDOFF_EVIDENCE_INCOMPLETE");
    }
    if (observation.availability === "available" && observation.identityResolution !== "exact-resolved") {
      fail(`Available readback ${readback.readbackId} is not exactly resolved`, "HANDOFF_EVIDENCE_INCOMPLETE");
    }
    if (readback.expectedIdentity !== null && observation.availability === "available" &&
        observation.identityKey !== readback.expectedIdentity) {
      fail(`Readback ${readback.readbackId} did not prove its exact identity`, "HANDOFF_SOURCE_SUBSTITUTION");
    }
  }

  if (receipt.evidenceBindings.length !== envelope.evidenceRequirements.length) {
    fail("Receipt evidence binding cardinality is incomplete", "HANDOFF_EVIDENCE_INCOMPLETE");
  }
  const observations = new Set(receipt.observations.map((entry) => entry.evidenceHash));
  const checks = new Set(receipt.checks.map((entry) => entry.checkHash));
  const resultingStateHash = sha256Canonical(receipt.resultingState);
  const bindingTypes = {
    "source-identity": "observation",
    "deployment": "observation",
    "cleanliness": "check",
    "ancestry": "check",
    "receipt": "resulting-state"
  };
  const seen = new Set();
  for (const requirement of envelope.evidenceRequirements) {
    const binding = receipt.evidenceBindings.find((entry) => entry.evidenceId === requirement.evidenceId);
    if (!binding || seen.has(binding.evidenceId) || binding.kind !== requirement.kind) {
      fail(`Receipt omits exact evidence binding ${requirement.evidenceId}`, "HANDOFF_EVIDENCE_INCOMPLETE");
    }
    seen.add(binding.evidenceId);
    if (binding.bindingType !== bindingTypes[requirement.kind]) {
      fail(`Evidence binding ${binding.evidenceId} uses the wrong source type`, "HANDOFF_EVIDENCE_SUBSTITUTION");
    }
    let allowedHashes;
    if (binding.bindingType === "observation") allowedHashes = observations;
    else if (binding.bindingType === "check") allowedHashes = checks;
    else allowedHashes = new Set([resultingStateHash]);
    if (binding.boundHashes.some((hash) => !allowedHashes.has(hash))) {
      fail(`Evidence binding ${binding.evidenceId} contains a substituted hash`, "HANDOFF_EVIDENCE_SUBSTITUTION");
    }
  }
}

export function validateExecutionReceipt(receipt, options = {}) {
  if (!options.branchCapsule || !options.envelope) {
    fail("branchCapsule and envelope are required", "HANDOFF_CONTEXT_REQUIRED");
  }
  const executionAuthority = assertActionEnvelopeExecutable(options.envelope, {
    branchCapsule: options.branchCapsule,
    index: options.index,
    repositoryRoot: options.repositoryRoot,
    allowConsumedByReceiptId: receipt.receiptId,
    now: options.executionNow || receipt.startedAt
  });
  const label = options.label || "execution receipt";
  validateSchema("executionReceipt", receipt, label);
  assertSanitizedHandoffDocument(receipt, label);
  assertSelfHash(receipt, "clover-handoff-execution-receipt", "receiptHash", label);
  assertNestedRecordHashes(receipt);
  assertChronology(receipt.startedAt, receipt.completedAt, "execution receipt startedAt", "execution receipt completedAt");

  const { envelope, branchCapsule: capsule } = options;
  if (receipt.actionId !== envelope.actionId || receipt.envelopeId !== envelope.envelopeId ||
      receipt.envelopeHash !== envelope.envelopeHash) {
    fail("Execution receipt does not bind the exact action and envelope", "HANDOFF_ENVELOPE_SUBSTITUTION");
  }
  if (receipt.branchCapsuleId !== capsule.capsuleId || receipt.branchCapsuleHash !== capsule.capsuleHash) {
    fail("Execution receipt does not bind the exact branch capsule", "HANDOFF_CAPSULE_SUBSTITUTION");
  }
  assertReceiptSourceAndReconciliation(receipt, envelope, capsule, options.repositoryRoot);
  const receiptRollback = capsule.rollbackAnchors.find((entry) =>
    entry.anchorType === receipt.rollback.anchorType && entry.identity === receipt.rollback.anchorIdentity &&
    ["verified", "reported"].includes(entry.status)
  );
  if (!receiptRollback) {
    fail("Execution receipt rollback anchor is not present in the Cell capsule", "HANDOFF_ROLLBACK_MISMATCH");
  }
  for (const field of CAPABILITY_FIELDS) {
    if (receipt.authorityUsed[field] && !executionAuthority.effectiveAuthority[field]) {
      fail(`Receipt claims unauthorized capability ${field}`, "HANDOFF_AUTHORITY_DENIED");
    }
  }
  const allowedActions = new Set(envelope.scope.allowedActions);
  if (receipt.actionsPerformed.some((action) => !allowedActions.has(action))) {
    fail("Receipt performed an action outside the exact envelope scope", "HANDOFF_AUTHORITY_DENIED");
  }
  const performedCapabilities = new Set(capabilitiesForActions(receipt.actionsPerformed));
  for (const field of CAPABILITY_FIELDS) {
    if (receipt.authorityUsed[field] !== performedCapabilities.has(field)) {
      fail(`Receipt authorityUsed does not match actionsPerformed for ${field}`, "HANDOFF_AUTHORITY_DENIED");
    }
  }
  const outputCommit = assertCandidateEffects(receipt, envelope, executionAuthority);
  const createdCandidateState = receipt.changes.targetSourceMutationPerformed || receipt.previews.length > 0;
  if (createdCandidateState && (!receipt.rollback.required || receipt.rollback.anchorType === "no-mutation" ||
      receiptRollback.status !== "verified")) {
    fail("Candidate source or preview effects require a verified non-no-mutation rollback anchor", "HANDOFF_ROLLBACK_MISMATCH");
  }
  if (receipt.changes.changedPaths.some((entry) => !pathAllowed(entry, envelope.scope.allowedWritePaths))) {
    fail("Receipt contains a source mutation outside its envelope", "HANDOFF_AUTHORITY_DENIED");
  }
  if (!executionAuthority.effectiveAuthority.recordHandoffArtifacts ||
      receipt.changes.recordedHandoffPaths.some((entry) =>
        !pathAllowed(entry, envelope.scope.allowedRecordingPaths))) {
    fail("Receipt records Handoff Ledger artifacts outside its exact recording scope", "HANDOFF_AUTHORITY_DENIED");
  }
  if (!receipt.changes.recordedHandoffPaths.includes(receipt.resultingState.persistedReceiptRef)) {
    fail("Receipt does not record its own exact durable path", "HANDOFF_OUTCOME_INCONSISTENT");
  }
  if (receipt.previews.length > 0 && !executionAuthority.effectiveAuthority.createNonProductionPreview) {
    fail("Receipt claims an unauthorized preview", "HANDOFF_AUTHORITY_DENIED");
  }
  for (const preview of receipt.previews) {
    if (!receipt.actionsPerformed.includes("create-non-production-preview") || preview.sourceCommit !== outputCommit) {
      fail("Preview source does not bind the receipt source", "HANDOFF_SOURCE_SUBSTITUTION");
    }
  }
  if (receipt.outcome === "succeeded" && receipt.actionsPerformed.includes("create-non-production-preview") &&
      receipt.previews.length === 0) {
    fail("Successful preview action has no exact preview effect", "HANDOFF_OUTCOME_INCONSISTENT");
  }
  if (envelope.operation !== "reconcile-public-project-identity" &&
      receipt.resultingState.sourceCommit !== outputCommit) {
    fail("Resulting source commit differs from the exact candidate effect", "HANDOFF_SOURCE_SUBSTITUTION");
  }
  if (receipt.resultingState.projectId !== capsule.project.projectId) {
    fail("Resulting state was substituted", "HANDOFF_SOURCE_SUBSTITUTION");
  }
  assertReceiptEvidence(receipt, envelope);
  if (receipt.outcome === "succeeded" && receipt.checks.some((check) => check.conclusion !== "passed")) {
    fail("Successful receipt contains a non-passing check", "HANDOFF_OUTCOME_INCONSISTENT");
  }
  return { valid: true };
}

export function validateIndependentReviewDecision(decision, options = {}) {
  if (!options.receipt || !options.envelope) {
    fail("receipt and envelope are required", "HANDOFF_CONTEXT_REQUIRED");
  }
  const label = options.label || "independent review decision";
  validateSchema("independentReviewDecision", decision, label);
  assertSanitizedHandoffDocument(decision, label);
  assertSelfHash(decision, "clover-handoff-independent-review-decision", "decisionHash", label);
  const { receipt, envelope } = options;
  if (decision.receiptId !== receipt.receiptId || decision.receiptHash !== receipt.receiptHash) {
    fail("Independent review does not bind the exact receipt", "HANDOFF_RECEIPT_SUBSTITUTION");
  }
  if (decision.envelopeId !== envelope.envelopeId || decision.envelopeHash !== envelope.envelopeHash) {
    fail("Independent review does not bind the exact envelope", "HANDOFF_ENVELOPE_SUBSTITUTION");
  }
  if (timestampMs(decision.reviewedAt, "reviewedAt") < timestampMs(receipt.completedAt, "receipt completedAt")) {
    fail("Independent review predates the receipt", "HANDOFF_TIME_INVALID");
  }
  const connectorScope = assessReceiptEvidenceScope(receipt, envelope);
  if (!connectorScope.compliant && decision.decision === "approve") {
    fail("Independent review cannot approve a connector-scope-noncompliant receipt",
      "HANDOFF_CONNECTOR_SCOPE_VIOLATION", connectorScope);
  }
  return { valid: true };
}

export function validateOwnerApprovalAttestation(attestation, options = {}) {
  if (!options.envelope) fail("envelope is required", "HANDOFF_CONTEXT_REQUIRED");
  const label = options.label || "owner approval attestation";
  validateSchema("ownerApprovalAttestation", attestation, label);
  assertSanitizedHandoffDocument(attestation, label);
  assertSelfHash(attestation, "clover-handoff-owner-approval-attestation", "attestationHash", label);
  const { envelope } = options;
  validateSchema("actionEnvelope", envelope, "approval envelope");
  assertSelfHash(envelope, "clover-handoff-action-envelope", "envelopeHash", "approval envelope");
  const issuance = assertEnvelopeIssuance(envelope);
  if (!issuance.approvalRequired || attestation.actionId !== envelope.actionId ||
      attestation.envelopeId !== envelope.envelopeId || attestation.envelopeHash !== envelope.envelopeHash ||
      attestation.ownerId !== envelope.approval.requiredApproverId) {
    fail("Approval attestation does not bind the exact owner-gated envelope", "HANDOFF_APPROVAL_INVALID");
  }
  const expectedStatement = canonicalOwnerApprovalStatement(envelope);
  if (attestation.decision !== "approve" || attestation.approvalStatement !== expectedStatement) {
    fail("Approval attestation is not the exact structured affirmative decision", "HANDOFF_APPROVAL_INVALID");
  }
  if (attestation.statementHash !== sha256Canonical(attestation.approvalStatement)) {
    fail("Approval statement hash is invalid", "HANDOFF_APPROVAL_INVALID");
  }
  if (timestampMs(attestation.approvedAt, "approvedAt") < timestampMs(envelope.createdAt, "createdAt") ||
      timestampMs(attestation.approvedAt, "approvedAt") >= timestampMs(envelope.expiresAt, "expiresAt") ||
      attestation.validUntil !== envelope.expiresAt) {
    fail("Approval attestation is outside the envelope validity window", "HANDOFF_EXPIRED");
  }
  return { valid: true };
}

export function canonicalOwnerApprovalStatement(envelope) {
  return `APPROVE ${envelope.actionId} ${envelope.envelopeHash}`;
}

export function createOwnerApprovalAttestation(envelope, input = {}) {
  validateSchema("actionEnvelope", envelope, "approval envelope");
  assertSelfHash(envelope, "clover-handoff-action-envelope", "envelopeHash", "approval envelope");
  const issuance = assertEnvelopeIssuance(envelope);
  if (!issuance.approvalRequired) fail("Envelope does not require owner approval", "HANDOFF_APPROVAL_INVALID");
  const expectedStatement = canonicalOwnerApprovalStatement(envelope);
  if (input.decision !== "approve" || input.approvalStatement !== expectedStatement) {
    fail("Approval recording requires the exact structured affirmative decision", "HANDOFF_APPROVAL_INVALID");
  }
  const attestation = sealHandoffDocument({
    documentType: "clover-handoff-owner-approval-attestation",
    schemaVersion: HANDOFF_SCHEMA_VERSION,
    attestationId: input.attestationId,
    actionId: envelope.actionId,
    envelopeId: envelope.envelopeId,
    envelopeHash: envelope.envelopeHash,
    ownerId: input.ownerId,
    decision: "approve",
    approvalStatement: expectedStatement,
    statementHash: sha256Canonical(expectedStatement),
    approvedAt: input.approvedAt,
    validUntil: envelope.expiresAt,
    recordingLane: input.recordingLane,
    recordingAuthorizationEvidenceHash: input.recordingAuthorizationEvidenceHash,
    assurance: {
      identityBasis: "owner-provided-exact-authorization-record",
      cryptographicOwnerIdentityVerified: false,
      nonProductionCandidateAuthorityOnly: true
    },
    authority: {
      recordsApprovalOnly: true,
      standingWriteAuthority: false,
      mergeAuthority: false,
      productionDeploymentAuthority: false,
      productionDataAuthority: false
    }
  }, "attestationHash");
  validateOwnerApprovalAttestation(attestation, { envelope });
  return attestation;
}

export function createOwnerApprovedIndexVersion(index, envelope, attestation, input = {}) {
  assertIndexIdentity(index);
  validateOwnerApprovalAttestation(attestation, { envelope });
  const current = findEnvelopeIndexEntry(index, envelope);
  if (current.status !== "pending" || current.lifecycle.state !== "proposed" ||
      current.ownerApproval.status !== "pending" || current.receiptId !== null) {
    fail("Only one unconsumed pending proposal can be approved", "HANDOFF_REPLAY_DENIED");
  }
  if (timestampMs(input.createdAt, "new index createdAt") < timestampMs(attestation.approvedAt, "approvedAt") ||
      timestampMs(input.createdAt, "new index createdAt") >= timestampMs(envelope.expiresAt, "expiresAt")) {
    fail("Approval index transition is outside the action validity window", "HANDOFF_EXPIRED");
  }
  const next = cloneJson(index);
  next.indexId = input.indexId;
  next.createdAt = input.createdAt;
  next.previousIndexPath = input.previousIndexPath;
  next.previousIndexHash = index.indexHash;
  const entry = next.entries.find((candidate) => candidate.envelopeId === envelope.envelopeId);
  entry.recordedAt = input.createdAt;
  entry.lifecycle.state = "available";
  entry.ownerApproval = {
    status: "approved",
    approverId: attestation.ownerId,
    approvedAt: attestation.approvedAt,
    approvedEnvelopeHash: envelope.envelopeHash,
    approvalEvidenceHash: attestation.statementHash,
    attestationId: attestation.attestationId,
    attestationPath: input.attestationPath,
    attestationHash: attestation.attestationHash
  };
  const sealed = sealHandoffDocument(next, "indexHash");
  assertIndexIdentity(sealed);
  return sealed;
}

function immutableIndexEntryIdentity(entry) {
  return {
    sequence: entry.sequence,
    actionId: entry.actionId,
    branchCapsuleId: entry.branchCapsuleId,
    branchCapsuleHash: entry.branchCapsuleHash,
    envelopeId: entry.envelopeId,
    envelopePath: entry.envelopePath,
    envelopeHash: entry.envelopeHash
  };
}

export function validateIndexTransition(previous, current) {
  assertIndexIdentity(previous, "previous action receipt index");
  assertIndexIdentity(current, "current action receipt index");
  if (current.previousIndexHash !== previous.indexHash || current.previousIndexPath === null ||
      timestampMs(current.createdAt, "current index createdAt") < timestampMs(previous.createdAt, "previous index createdAt") ||
      current.entries.length < previous.entries.length) {
    fail("Index does not form an append-only transition", "HANDOFF_INDEX_TRANSITION_INVALID");
  }
  let transitions = 0;
  for (let offset = 0; offset < previous.entries.length; offset += 1) {
    const before = previous.entries[offset];
    const after = current.entries[offset];
    if (canonicalize(immutableIndexEntryIdentity(before)) !== canonicalize(immutableIndexEntryIdentity(after))) {
      fail("Index reordered or substituted an existing Action ID", "HANDOFF_INDEX_TRANSITION_INVALID");
    }
    if (canonicalize(before) === canonicalize(after)) continue;
    transitions += 1;
    const approvalTransition = before.status === "pending" && before.lifecycle.state === "proposed" &&
      before.ownerApproval.status === "pending" && after.status === "pending" &&
      after.lifecycle.state === "available" && after.ownerApproval.status === "approved" &&
      after.receiptId === null && after.review.status === "pending";
    const consumptionTransition = before.status === "pending" && before.lifecycle.state === "available" &&
      after.status === "completed" && after.lifecycle.state === "consumed" && after.receiptId !== null;
    const revocationTransition = before.status === "pending" && after.status === "pending" &&
      after.lifecycle.state === "revoked" && after.lifecycle.revokedAt !== null &&
      after.lifecycle.revocationEvidenceHash !== null && after.receiptId === null;
    const reviewTransition = before.status === "completed" && after.status === "completed" &&
      before.lifecycle.state === "consumed" && after.lifecycle.state === "consumed" &&
      before.review.status === "pending" && after.review.status === "completed";
    if (!approvalTransition && !consumptionTransition && !revocationTransition && !reviewTransition) {
      fail("Index rewrote an existing entry outside an allowed lifecycle transition", "HANDOFF_INDEX_TRANSITION_INVALID");
    }
    if ((consumptionTransition || revocationTransition || reviewTransition) &&
        canonicalize(before.ownerApproval) !== canonicalize(after.ownerApproval)) {
      fail("Index lifecycle transition changed immutable owner approval", "HANDOFF_INDEX_TRANSITION_INVALID");
    }
    if (reviewTransition) {
      const beforeStable = cloneJson(before);
      const afterStable = cloneJson(after);
      delete beforeStable.recordedAt;
      delete afterStable.recordedAt;
      delete beforeStable.review;
      delete afterStable.review;
      if (canonicalize(beforeStable) !== canonicalize(afterStable)) {
        fail("Independent-review transition changed execution or lifecycle evidence", "HANDOFF_INDEX_TRANSITION_INVALID");
      }
    }
  }
  if (transitions > 1) fail("One index version may transition only one existing action", "HANDOFF_INDEX_TRANSITION_INVALID");
  for (let offset = previous.entries.length; offset < current.entries.length; offset += 1) {
    if (current.entries[offset].sequence !== offset + 1) {
      fail("Appended index sequence is not contiguous", "HANDOFF_INDEX_TRANSITION_INVALID");
    }
  }
  return { valid: true, transitionedEntries: transitions, appendedEntries: current.entries.length - previous.entries.length };
}

export function validateProspectiveConsumptionTransition(previous, current, options = {}) {
  const transition = validateIndexTransition(previous, current);
  if (!Array.isArray(options.envelopes) || !Array.isArray(options.receipts)) {
    fail("Prospective consumption validation requires envelopes and receipts",
      "HANDOFF_CONTEXT_REQUIRED");
  }
  const consumed = current.entries.filter((entry, offset) => {
    const before = previous.entries[offset];
    return before && before.lifecycle.state === "available" && entry.lifecycle.state === "consumed";
  });
  if (consumed.length !== 1) {
    fail("Prospective consumption must contain exactly one available-to-consumed transition",
      "HANDOFF_INDEX_TRANSITION_INVALID");
  }
  const entry = consumed[0];
  const envelope = options.envelopes.find((candidate) => candidate.envelopeId === entry.envelopeId);
  const receipt = options.receipts.find((candidate) => candidate.receiptId === entry.receiptId);
  if (!envelope || !receipt || receipt.envelopeId !== envelope.envelopeId ||
      receipt.envelopeHash !== envelope.envelopeHash || receipt.actionId !== entry.actionId) {
    fail("Prospective consumption lacks the exact envelope and receipt binding",
      "HANDOFF_INDEX_INCONSISTENT");
  }
  const connectorScope = assertReceiptEvidenceScope(receipt, envelope);
  return { ...transition, connectorScope };
}

function resolveIndexedApprovalAttestation(entry, envelope, repositoryRoot) {
  const root = path.resolve(repositoryRoot);
  const absolute = path.resolve(root, entry.ownerApproval.attestationPath);
  if (!absolute.startsWith(`${root}${path.sep}`) || !fs.existsSync(absolute)) {
    fail("Approved action has no resolvable immutable approval attestation", "HANDOFF_APPROVAL_REQUIRED");
  }
  const attestation = JSON.parse(fs.readFileSync(absolute, "utf8"));
  validateOwnerApprovalAttestation(attestation, { envelope });
  if (attestation.attestationId !== entry.ownerApproval.attestationId ||
      attestation.attestationHash !== entry.ownerApproval.attestationHash ||
      attestation.statementHash !== entry.ownerApproval.approvalEvidenceHash ||
      attestation.approvedAt !== entry.ownerApproval.approvedAt) {
    fail("Indexed approval attestation was substituted", "HANDOFF_APPROVAL_INVALID");
  }
  return attestation;
}

function loadIndexedDocument(relativePath, repositoryRoot, expectedType, expectedId, expectedHash) {
  const root = path.resolve(repositoryRoot);
  const absolute = path.resolve(root, relativePath);
  if (!absolute.startsWith(`${root}${path.sep}`) || !fs.existsSync(absolute)) {
    fail(`Indexed path ${relativePath} is not resolvable`, "HANDOFF_INDEX_INCONSISTENT");
  }
  const document = JSON.parse(fs.readFileSync(absolute, "utf8"));
  const idFields = {
    "clover-handoff-action-envelope": "envelopeId",
    "clover-handoff-execution-receipt": "receiptId",
    "clover-handoff-owner-approval-attestation": "attestationId",
    "clover-handoff-independent-review-decision": "decisionId"
  };
  const idField = idFields[expectedType];
  const hashField = HASH_FIELDS[expectedType];
  if (document.documentType !== expectedType || document[idField] !== expectedId || document[hashField] !== expectedHash) {
    fail(`Indexed path ${relativePath} does not resolve to the exact document`, "HANDOFF_INDEX_INCONSISTENT");
  }
  assertHandoffHash(document, hashField, relativePath);
}

function assertOwnerApprovalEntry(entry, envelope, repositoryRoot) {
  if (entry.ownerApproval.approverId !== envelope.approval.requiredApproverId) {
    fail("Index owner approver was substituted", "HANDOFF_APPROVAL_INVALID");
  }
  if (!envelope.approval.required) {
    if (entry.ownerApproval.status !== "not-required") {
      fail("Index invents approval for a non-gated action", "HANDOFF_APPROVAL_INVALID");
    }
    return;
  }
  if (entry.ownerApproval.status === "not-required") {
    fail("Index bypasses required owner approval", "HANDOFF_APPROVAL_INVALID");
  }
  if (entry.ownerApproval.status === "approved" &&
      entry.ownerApproval.approvedEnvelopeHash !== envelope.envelopeHash) {
    fail("Index approval does not bind the exact envelope hash", "HANDOFF_APPROVAL_INVALID");
  }
  if (entry.ownerApproval.status === "approved") {
    resolveIndexedApprovalAttestation(entry, envelope, repositoryRoot);
  }
}

export function validateActionReceiptIndex(index, options = {}) {
  if (!Array.isArray(options.branchCapsules) || !Array.isArray(options.envelopes) ||
      !Array.isArray(options.receipts) || !Array.isArray(options.reviews)) {
    fail("branchCapsules, envelopes, receipts, and reviews are required", "HANDOFF_CONTEXT_REQUIRED");
  }
  assertIndexIdentity(index, options.label || "action receipt index");
  if ((index.previousIndexPath === null) !== (index.previousIndexHash === null)) {
    fail("Previous index path/hash pair is incomplete", "HANDOFF_INDEX_TRANSITION_INVALID");
  }
  const repositoryRoot = options.repositoryRoot || DEFAULT_REPOSITORY_ROOT;
  if (index.previousIndexPath !== null) {
    const root = path.resolve(repositoryRoot);
    const previousPath = path.resolve(root, index.previousIndexPath);
    if (!previousPath.startsWith(`${root}${path.sep}`) || !fs.existsSync(previousPath)) {
      fail("Previous index path is not resolvable", "HANDOFF_INDEX_TRANSITION_INVALID");
    }
    const previous = JSON.parse(fs.readFileSync(previousPath, "utf8"));
    if (previous.indexHash !== index.previousIndexHash) {
      fail("Previous index hash was substituted", "HANDOFF_INDEX_TRANSITION_INVALID");
    }
    validateIndexTransition(previous, index);
  }
  if (index.entries.length !== options.envelopes.length) {
    fail("Action/receipt index envelope cardinality is inconsistent", "HANDOFF_INDEX_INCONSISTENT");
  }

  const capsules = new Map(options.branchCapsules.map((entry) => [entry.capsuleId, entry]));
  const envelopes = new Map(options.envelopes.map((entry) => [entry.envelopeId, entry]));
  const receipts = new Map(options.receipts.map((entry) => [entry.receiptId, entry]));
  const reviews = new Map(options.reviews.map((entry) => [entry.decisionId, entry]));
  if (capsules.size !== options.branchCapsules.length || envelopes.size !== options.envelopes.length ||
      receipts.size !== options.receipts.length || reviews.size !== options.reviews.length) {
    fail("Duplicate handoff document identity", "HANDOFF_INDEX_INCONSISTENT");
  }

  const actionIds = new Set();
  const usedEnvelopes = new Set();
  const usedReceipts = new Set();
  const usedReviews = new Set();
  index.entries.forEach((entry, offset) => {
    if (entry.sequence !== offset + 1) fail("Index sequence is not contiguous", "HANDOFF_INDEX_INCONSISTENT");
    if (actionIds.has(entry.actionId)) fail("Index duplicates a stable Action ID", "HANDOFF_INDEX_INCONSISTENT");
    actionIds.add(entry.actionId);
    const envelope = envelopes.get(entry.envelopeId);
    const capsule = capsules.get(entry.branchCapsuleId);
    if (!envelope || !capsule) fail("Index references an unavailable envelope or capsule", "HANDOFF_INDEX_INCONSISTENT");
    if (usedEnvelopes.has(entry.envelopeId)) fail("Index duplicates an envelope", "HANDOFF_INDEX_INCONSISTENT");
    usedEnvelopes.add(entry.envelopeId);
    if (entry.actionId !== envelope.actionId || entry.envelopeHash !== envelope.envelopeHash ||
        entry.branchCapsuleHash !== capsule.capsuleHash || envelope.branchCapsuleId !== capsule.capsuleId ||
        envelope.branchCapsuleHash !== capsule.capsuleHash) {
      fail("Index action, envelope, or capsule binding is inconsistent", "HANDOFF_INDEX_INCONSISTENT");
    }
    loadIndexedDocument(entry.envelopePath, repositoryRoot, "clover-handoff-action-envelope",
      envelope.envelopeId, envelope.envelopeHash);
    assertOwnerApprovalEntry(entry, envelope, repositoryRoot);

    if (entry.status === "pending") {
      if (options.receipts.some((receipt) => receipt.envelopeId === envelope.envelopeId)) {
        fail("Pending index entry has an execution receipt", "HANDOFF_INDEX_INCONSISTENT");
      }
      if (entry.lifecycle.state === "proposed" && entry.ownerApproval.status !== "pending") {
        fail("Proposed lifecycle does not have pending approval", "HANDOFF_LIFECYCLE_INVALID");
      }
      if (entry.lifecycle.state === "available" && envelope.approval.required &&
          entry.ownerApproval.status !== "approved") {
        fail("Available owner-gated action lacks approval", "HANDOFF_APPROVAL_REQUIRED");
      }
      if (entry.lifecycle.state === "revoked") {
        if (!entry.lifecycle.revokedAt || !entry.lifecycle.revocationEvidenceHash) {
          fail("Revoked lifecycle lacks evidence", "HANDOFF_LIFECYCLE_INVALID");
        }
      } else if (entry.lifecycle.revokedAt !== null || entry.lifecycle.revocationEvidenceHash !== null) {
        fail("Unrevoked lifecycle carries revocation evidence", "HANDOFF_LIFECYCLE_INVALID");
      }
      if (options.reviews.some((review) => review.envelopeId === envelope.envelopeId)) {
        fail("Pending action has an independent review", "HANDOFF_INDEX_INCONSISTENT");
      }
      return;
    }

    const receipt = receipts.get(entry.receiptId);
    if (!receipt || usedReceipts.has(entry.receiptId)) {
      fail("Completed index entry lacks one unique receipt", "HANDOFF_INDEX_INCONSISTENT");
    }
    usedReceipts.add(entry.receiptId);
    if (entry.actionId !== receipt.actionId || entry.receiptHash !== receipt.receiptHash ||
        receipt.envelopeId !== envelope.envelopeId || receipt.envelopeHash !== envelope.envelopeHash ||
        entry.outcome !== receipt.outcome) {
      fail("Index receipt binding or outcome is inconsistent", "HANDOFF_INDEX_INCONSISTENT");
    }
    if (entry.lifecycle.state !== "consumed" || entry.lifecycle.consumedByReceiptId !== receipt.receiptId ||
        entry.lifecycle.consumedAt !== receipt.completedAt) {
      fail("Completed action lacks an exact single-use consumption binding", "HANDOFF_LIFECYCLE_INVALID");
    }
    if (entry.receiptPath !== receipt.resultingState.persistedReceiptRef) {
      fail("Receipt path differs from the resulting-state pointer", "HANDOFF_INDEX_INCONSISTENT");
    }
    loadIndexedDocument(entry.receiptPath, repositoryRoot, "clover-handoff-execution-receipt",
      receipt.receiptId, receipt.receiptHash);
    if (timestampMs(entry.recordedAt, "index recordedAt") < timestampMs(receipt.completedAt, "receipt completedAt")) {
      fail("Index entry predates its receipt", "HANDOFF_TIME_INVALID");
    }
    if (entry.review.status === "pending") {
      if (options.reviews.some((review) => review.receiptId === receipt.receiptId)) {
        fail("Index marks an available review as pending", "HANDOFF_INDEX_INCONSISTENT");
      }
    } else {
      const review = reviews.get(entry.review.decisionId);
      if (!review || entry.review.decisionHash !== review.decisionHash || review.receiptId !== receipt.receiptId ||
          review.receiptHash !== receipt.receiptHash) {
        fail("Index review binding is inconsistent", "HANDOFF_INDEX_INCONSISTENT");
      }
      loadIndexedDocument(entry.review.decisionPath, repositoryRoot,
        "clover-handoff-independent-review-decision", review.decisionId, review.decisionHash);
      validateIndependentReviewDecision(review, { receipt, envelope });
      if (timestampMs(entry.recordedAt, "index recordedAt") < timestampMs(review.reviewedAt, "reviewedAt")) {
        fail("Index review transition predates the independent decision", "HANDOFF_TIME_INVALID");
      }
      usedReviews.add(review.decisionId);
    }
  });
  if (usedEnvelopes.size !== envelopes.size || usedReceipts.size !== receipts.size || usedReviews.size !== reviews.size) {
    fail("Index omits a supplied handoff document", "HANDOFF_INDEX_INCONSISTENT");
  }
  return { valid: true };
}

export function validateHandoffLedger({ branchCapsules, envelopes, receipts, reviews = [], index }, options = {}) {
  if (!Array.isArray(branchCapsules)) fail("branchCapsules must be an array", "HANDOFF_CONTEXT_REQUIRED");
  for (const capsule of branchCapsules) validateBranchCapsule(capsule);
  const capsuleById = new Map(branchCapsules.map((entry) => [entry.capsuleId, entry]));
  for (const envelope of envelopes) {
    const capsule = capsuleById.get(envelope.branchCapsuleId);
    if (!capsule) fail("Envelope has no matching Cell capsule", "HANDOFF_INDEX_INCONSISTENT");
    validateActionEnvelope(envelope, { branchCapsule: capsule, now: options.now });
  }
  for (const receipt of receipts) {
    const envelope = envelopes.find((entry) => entry.envelopeId === receipt.envelopeId);
    const capsule = envelope && capsuleById.get(envelope.branchCapsuleId);
    if (!envelope || !capsule) fail("Receipt has no matching envelope and capsule", "HANDOFF_INDEX_INCONSISTENT");
    validateExecutionReceipt(receipt, {
      branchCapsule: capsule,
      envelope,
      index,
      repositoryRoot: options.repositoryRoot,
      executionNow: receipt.startedAt
    });
  }
  for (const review of reviews) {
    const receipt = receipts.find((entry) => entry.receiptId === review.receiptId);
    const envelope = envelopes.find((entry) => entry.envelopeId === review.envelopeId);
    if (!receipt || !envelope) fail("Review has no matching receipt and envelope", "HANDOFF_INDEX_INCONSISTENT");
    validateIndependentReviewDecision(review, { receipt, envelope });
  }
  validateActionReceiptIndex(index, {
    branchCapsules,
    envelopes,
    receipts,
    reviews,
    repositoryRoot: options.repositoryRoot
  });
  return {
    valid: true,
    branchCapsuleHashes: branchCapsules.map((entry) => entry.capsuleHash),
    indexHash: index.indexHash,
    envelopes: envelopes.length,
    receipts: receipts.length,
    reviews: reviews.length
  };
}
