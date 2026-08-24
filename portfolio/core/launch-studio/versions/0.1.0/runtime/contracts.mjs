import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalize, cloneJson, sha256Bytes, sha256Canonical, assertSha256 } from "../../../../lib/canonical-json.mjs";
import { assertSafeRelativePath } from "../../../../lib/artifact-store.mjs";
import { assertActionEnvelopeExecutable } from "../../../../lib/handoff-ledger.mjs";
import { validateJsonSchema } from "../../../../lib/validators.mjs";

export const LAUNCH_STUDIO_VERSION = "0.1.0";
export const CANONICALIZATION = "RFC8785-JCS";
export const HASH_ALGORITHM = "sha256";

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const VERSION_DIRECTORY = path.resolve(MODULE_DIRECTORY, "..");
export const SCHEMA_DIRECTORY = path.join(VERSION_DIRECTORY, "schemas");
export const SYNTHETIC_DIRECTORY = path.join(VERSION_DIRECTORY, "synthetic");
export const IMMUTABLE_INDEX_PATH = path.join(VERSION_DIRECTORY, "indexes/launch-session-index-0001.json");
export const STABLE_INDEX_PATH = path.resolve(VERSION_DIRECTORY, "../../index.json");
export const REPOSITORY_ROOT = path.resolve(VERSION_DIRECTORY, "../../../../..");

export const SCHEMA_FILES = Object.freeze([
  "acceptance-contract.schema.json",
  "authority-reference.schema.json",
  "build-charter.schema.json",
  "collaboration-proposal.schema.json",
  "common.schema.json",
  "executor-progress-event.schema.json",
  "executor-work-order.schema.json",
  "export-manifest.schema.json",
  "fruit-observation.schema.json",
  "impact-scan.schema.json",
  "launch-context-pack.schema.json",
  "launch-profile.schema.json",
  "launch-session.schema.json",
  "launch-session-event.schema.json",
  "launch-session-index.schema.json",
  "offboarding.schema.json",
  "owner-event.schema.json",
  "participant-consent.schema.json",
  "participant-role.schema.json",
  "preview-receipt.schema.json",
  "project-launch-capsule.schema.json",
  "restoration-receipt.schema.json",
  "revocation.schema.json",
  "session-budget.schema.json",
  "shared-project-delta.schema.json",
  "synthetic-replay-receipt.schema.json",
  "synthetic-session-fixture.schema.json",
  "understanding-check.schema.json",
  "understanding-delta.schema.json"
]);

export const TRUTH_CLASSIFICATIONS = Object.freeze([
  "source-fact", "owner-statement", "observation", "verified-claim", "disputed-claim",
  "inference", "assumption", "forecast", "conditional-potential", "unknown",
  "contradiction", "decision", "observed-outcome"
]);
export const PRIVACY_CLASSES = Object.freeze(["public", "synthetic", "private", "sensitive", "restricted"]);
export const VISIBILITIES = Object.freeze([
  "participant-private", "role-restricted", "project-members", "workspace-members", "public-approved"
]);
export const CAPABILITY_CLASSES = Object.freeze(["high-reasoning", "implementation", "mechanical", "deterministic"]);
export const APPROVAL_RAILS = Object.freeze([
  "APPROVE_BUILD_CHARTER", "ACCEPT_PREVIEW_CANDIDATE", "APPROVE_MERGE", "APPROVE_PRODUCTION"
]);
export const MATERIAL_PROGRESS_EVENT_TYPES = Object.freeze([
  "session_created", "owner_event_captured", "understanding_proposed", "understanding_confirmed", "context_loaded",
  "impact_scan_completed", "charter_proposed", "decision_required", "authority_proposed", "worktree_created",
  "build_started", "source_delta_recorded", "tests_started", "tests_completed", "failure_detected", "diagnosis_summary",
  "repair_loop_started", "repair_loop_completed", "preview_created", "preview_verified", "owner_feedback_received",
  "revision_completed", "receipt_created", "model_resolved", "session_held", "session_completed"
]);

export const NONCONSEQUENTIAL_PARTICIPANT_PERMISSIONS = Object.freeze([
  "read-project", "propose-delta", "review", "comment", "export-own", "revoke-consent", "observe-progress"
]);

export function parseCanonicalTimestamp(value, label = "timestamp") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) throw new Error(`${label} must be canonical UTC date-time`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) throw new Error(`${label} must be a real canonical UTC date-time`);
  return milliseconds;
}

const FORBIDDEN_REASONING_KEYS = /^(?:chainOfThought|chain_of_thought|hiddenReasoning|hidden_reasoning|scratchpad|privateDeliberation|private_deliberation|unredactedModelPrompt|unredacted_model_prompt|internalTokenTrace|internal_token_trace)$/u;

function walkValue(value, visit, pointer = "") {
  visit(value, pointer);
  if (Array.isArray(value)) value.forEach((entry, index) => walkValue(entry, visit, `${pointer}/${index}`));
  else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) walkValue(entry, visit, `${pointer}/${key}`);
  }
}

export function assertNoPrivateReasoningFields(value, label = "record") {
  walkValue(value, (entry, pointer) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      for (const key of Object.keys(entry)) {
        if (FORBIDDEN_REASONING_KEYS.test(key)) throw new Error(`${label} contains forbidden private-reasoning field at ${pointer}/${key}`);
      }
    }
  });
  return true;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function readCanonicalJson(filePath) {
  const bytes = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(bytes);
  if (bytes !== `${canonicalize(parsed)}\n`) throw new Error(`${filePath} is not canonical JSON with one terminal newline`);
  return parsed;
}

export function readCanonicalJsonl(filePath) {
  const bytes = fs.readFileSync(filePath, "utf8");
  const lines = bytes.split("\n");
  if (lines.at(-1) !== "") throw new Error(`${filePath} lacks a terminal newline`);
  lines.pop();
  if (lines.some((line) => line.length === 0)) throw new Error(`${filePath} contains an empty JSONL record`);
  const values = lines.map(JSON.parse);
  if (`${values.map(canonicalize).join("\n")}\n` !== bytes) throw new Error(`${filePath} is not canonical JSONL`);
  return values;
}

function inspectClosedSchema(node, location, seen) {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  if (node.type === "object" && node.additionalProperties !== false) {
    throw new Error(`Open object schema at ${location}`);
  }
  for (const [key, child] of Object.entries(node)) {
    if (key === "examples" || key === "default" || key === "const" || key === "enum") continue;
    if (Array.isArray(child)) child.forEach((entry, index) => inspectClosedSchema(entry, `${location}/${key}/${index}`, seen));
    else inspectClosedSchema(child, `${location}/${key}`, seen);
  }
}

export function validateSchemaCatalog() {
  const ids = new Set();
  const digests = {};
  for (const fileName of SCHEMA_FILES) {
    const filePath = path.join(SCHEMA_DIRECTORY, fileName);
    const bytes = fs.readFileSync(filePath);
    const schema = JSON.parse(bytes);
    if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") throw new Error(`${fileName} is not JSON Schema 2020-12`);
    if (!schema.$id?.startsWith("https://cloverapps.ai/schemas/launch-studio/0.1.0/")) throw new Error(`${fileName} has an invalid schema ID`);
    if (ids.has(schema.$id)) throw new Error(`Duplicate schema ID ${schema.$id}`);
    if (schema.type !== "object" || schema.additionalProperties !== false) throw new Error(`${fileName} root is not closed`);
    if (!schema.properties?.schemaVersion || !schema.required?.includes("schemaVersion")) throw new Error(`${fileName} is not explicitly versioned`);
    inspectClosedSchema(schema, fileName, new Set());
    ids.add(schema.$id);
    digests[fileName] = sha256Bytes(bytes);
  }
  return { valid: true, schemaCount: SCHEMA_FILES.length, schemaIds: [...ids].sort(), schemaDigests: digests };
}

export function validateContract(schemaFile, value, label = schemaFile) {
  if (!SCHEMA_FILES.includes(schemaFile)) throw new Error(`Unknown Launch Studio schema ${schemaFile}`);
  const schema = readJson(path.join(SCHEMA_DIRECTORY, schemaFile));
  validateJsonSchema(schema, value, { schemaDirectory: SCHEMA_DIRECTORY, label });
  assertNoPrivateReasoningFields(value, label);
  if (value.schemaVersion !== LAUNCH_STUDIO_VERSION) throw new Error(`${label} schemaVersion is unsupported`);
  if (Object.hasOwn(value, "consequentialAuthorityGranted") && value.consequentialAuthorityGranted !== false) {
    throw new Error(`${label} grants consequential authority`);
  }
  if (Array.isArray(value.externalEffects)) value.externalEffects.forEach((effect) => assertExternalEffectLifecycle(effect));
  return { valid: true, schemaFile, recordHash: sha256Canonical(value) };
}

export function assertExternalEffectLifecycle(effect) {
  const exactPair = (id, hash, label) => {
    if ((id === null) !== (hash === null)) throw new Error(`${label} ID/hash pair is incomplete`);
  };
  exactPair(effect.authorityReferenceId, effect.authorityReferenceHash, "External-effect authority reference");
  exactPair(effect.executionReceiptId, effect.executionReceiptHash, "External-effect execution receipt");
  exactPair(effect.rollback.receiptId, effect.rollback.receiptHash, "External-effect rollback receipt");
  parseCanonicalTimestamp(effect.recordedAt, "external-effect recordedAt");
  const hasAuthority = effect.authorityReferenceId !== null;
  const hasExecution = effect.executionReceiptId !== null;
  const hasRollbackReceipt = effect.rollback.receiptId !== null;
  if (effect.rollback.required === false) {
    if (effect.rollback.status !== "not-required" || hasRollbackReceipt) throw new Error("Nonrequired rollback must be not-required and receipt-free");
  } else {
    if (!["pending", "completed", "failed"].includes(effect.rollback.status)) throw new Error("Required rollback has an impossible lifecycle status");
    if (effect.rollback.status === "pending" && hasRollbackReceipt) throw new Error("Pending rollback cannot carry a receipt");
    if (["completed", "failed"].includes(effect.rollback.status) && !hasRollbackReceipt) throw new Error("Completed or failed rollback requires an exact receipt");
  }
  if (effect.status === "proposed") {
    if (hasExecution) throw new Error("Proposed external effect cannot carry an execution receipt");
    if ((effect.rollback.required && (effect.rollback.status !== "pending" || hasRollbackReceipt)) ||
        (!effect.rollback.required && (effect.rollback.status !== "not-required" || hasRollbackReceipt))) {
      throw new Error("Proposed external effect must keep required rollback pending or mark rollback not-required, without a receipt");
    }
  } else if (["performed", "failed", "compensated"].includes(effect.status) && (!hasAuthority || !hasExecution)) {
    throw new Error(`${effect.status} external effect requires exact authority and execution receipts`);
  }
  if (effect.status === "performed" && ((effect.rollback.required && effect.rollback.status !== "pending") || (!effect.rollback.required && effect.rollback.status !== "not-required"))) throw new Error("Performed external effect must await any required rollback without claiming compensation");
  if (effect.status === "compensated" && (!effect.rollback.required || effect.rollback.status !== "completed" || !hasRollbackReceipt)) throw new Error("Compensated external effect requires an exact completed rollback receipt");
  return true;
}

export function assertAuthorityReference(reference, { requireExecutable = false, at = null, expectedBinding = null } = {}) {
  validateContract("authority-reference.schema.json", reference, "authority reference");
  if (reference.authoritySystem !== "clover-handoff" || reference.independentAuthoritySystemCreated !== false) {
    throw new Error("Launch Studio authority must delegate exclusively to Clover Handoff");
  }
  if (reference.consequentialAuthorityGranted !== false) throw new Error("Authority reference grants consequential authority");
  assertSha256(reference.actionEnvelopeHash, "actionEnvelopeHash");
  for (const [label, relativePath] of [["Action Envelope", reference.actionEnvelopePath], ["branch capsule", reference.branchCapsulePath], ["lifecycle index", reference.lifecycleIndexPath]]) {
    assertSafeRelativePath(relativePath, `${label} path`);
    if (!relativePath.startsWith("portfolio/core/handoff/")) throw new Error(`${label} path is outside Clover Handoff`);
  }
  assertSha256(reference.branchCapsuleHash, "branchCapsuleHash");
  assertSha256(reference.lifecycleIndexHash, "lifecycleIndexHash");
  for (const prefix of ["approvalAttestation", "executionReceipt", "independentReview"]) {
    const values = [reference[`${prefix}Id`], reference[`${prefix}Path`], reference[`${prefix}Hash`]];
    if (values.some((value) => value === null) && !values.every((value) => value === null)) {
      throw new Error(`${prefix} identity/path/hash must be either complete or entirely null`);
    }
    if (values[1] !== null) {
      assertSafeRelativePath(values[1], `${prefix} path`);
      if (!values[1].startsWith("portfolio/core/handoff/")) throw new Error(`${prefix} path is outside Clover Handoff`);
    }
  }
  const createdAt = parseCanonicalTimestamp(reference.createdAt, "authority reference createdAt");
  const expiresAt = reference.expiresAt === null ? null : parseCanonicalTimestamp(reference.expiresAt, "authority reference expiresAt");
  if (expiresAt !== null && expiresAt <= createdAt) throw new Error("Handoff authority reference expiry must follow creation");
  const checkedAt = at === null ? null : parseCanonicalTimestamp(at, "authoritative verification time");
  if (checkedAt !== null && checkedAt < createdAt) throw new Error("Handoff authority reference cannot postdate its authoritative use");
  if (checkedAt !== null && expiresAt !== null && expiresAt <= checkedAt) throw new Error("Handoff authority reference is stale or expired");
  const expectedRail = { "build-charter": "APPROVE_BUILD_CHARTER", "preview-candidate": "ACCEPT_PREVIEW_CANDIDATE", merge: "APPROVE_MERGE", production: "APPROVE_PRODUCTION", "executor-work-order": "APPROVE_BUILD_CHARTER" }[reference.scope];
  if (reference.approvalRail !== expectedRail) throw new Error("Authority reference scope and approval rail do not match");
  const expectedRecordType = { "build-charter": "build-charter", "preview-candidate": "preview-receipt", merge: "merge-candidate", production: "production-candidate", "executor-work-order": "executor-work-order" }[reference.scope];
  if (reference.boundRecordType !== expectedRecordType) throw new Error("Authority reference scope and bound record type do not match");
  for (const field of ["boundRecordHash", "boundAllowedPathsHash", "boundProhibitedEffectsHash"]) assertSha256(reference[field], field);
  if (expectedBinding) {
    for (const [field, expected] of Object.entries(expectedBinding)) if (reference[field] !== expected) throw new Error(`Authority reference ${field} binding mismatch`);
  }
  if (reference.lifecycle === "proposed" && (reference.nonAuthorizing !== true || reference.approvalAttestationId !== null || reference.executionReceiptId !== null)) {
    throw new Error("Proposed Handoff reference must remain non-authorizing and unapproved/unconsumed");
  }
  if (reference.lifecycle === "approved" && reference.approvalAttestationId === null) throw new Error("Approved Handoff reference lacks approval attestation");
  if (reference.lifecycle === "approved" && reference.executionReceiptId !== null) throw new Error("Approved unconsumed Handoff reference cannot carry an execution receipt");
  if (["approved", "consumed"].includes(reference.lifecycle) && reference.lifecycleIndexPath !== "portfolio/core/handoff/index.json") throw new Error("Executable Handoff reference must bind the stable current lifecycle index");
  if (reference.lifecycle === "consumed" && reference.executionReceiptId === null) throw new Error("Consumed Handoff reference lacks execution receipt");
  if (["expired", "revoked"].includes(reference.lifecycle) && reference.nonAuthorizing !== true) throw new Error("Expired or revoked reference cannot authorize execution");
  if (requireExecutable) throw new Error("Executable Handoff authority requires exact repository verification");
  return { valid: true, executable: false, requiresVerifiedHandoff: true };
}

export function resolveRegularRepositoryFile(repositoryRoot, relativePath, label) {
  assertSafeRelativePath(relativePath, `${label} path`);
  const root = path.resolve(repositoryRoot);
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Repository root must be a non-symbolic directory");
  const absolute = path.resolve(root, ...relativePath.split("/"));
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error(`${label} path escapes repository root`);
  let current = root;
  for (const segment of relativePath.split("/")) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) throw new Error(`${label} path does not exist`);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`${label} path crosses a symbolic link`);
  }
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file`);
  return absolute;
}

export function verifyExecutableHandoffReference(reference, { repositoryRoot = REPOSITORY_ROOT, now, expectedBinding = null } = {}) {
  assertAuthorityReference(reference, { at: now, expectedBinding });
  if (reference.synthetic || reference.nonAuthorizing || reference.lifecycle !== "approved") throw new Error("Synthetic, non-authorizing, or unapproved Handoff reference is categorically non-executable");
  if (!now) throw new Error("Executable Handoff verification requires an authoritative time");
  const envelopePath = resolveRegularRepositoryFile(repositoryRoot, reference.actionEnvelopePath, "Action Envelope");
  const capsulePath = resolveRegularRepositoryFile(repositoryRoot, reference.branchCapsulePath, "branch capsule");
  const indexPath = resolveRegularRepositoryFile(repositoryRoot, reference.lifecycleIndexPath, "lifecycle index");
  const envelopeBytes = fs.readFileSync(envelopePath);
  const capsuleBytes = fs.readFileSync(capsulePath);
  const indexBytes = fs.readFileSync(indexPath);
  const envelope = JSON.parse(envelopeBytes);
  const branchCapsule = JSON.parse(capsuleBytes);
  const index = JSON.parse(indexBytes);
  if (envelope.envelopeId !== reference.actionEnvelopeId || envelope.envelopeHash !== reference.actionEnvelopeHash || sha256Canonical(Object.fromEntries(Object.entries(envelope).filter(([key]) => key !== "envelopeHash"))) !== reference.actionEnvelopeHash) throw new Error("Action Envelope file/hash binding failed");
  if (branchCapsule.capsuleId !== reference.branchCapsuleId || branchCapsule.capsuleHash !== reference.branchCapsuleHash) throw new Error("Branch capsule file/hash binding failed");
  if (index.indexHash !== reference.lifecycleIndexHash) throw new Error("Handoff lifecycle index file/hash binding failed");
  const entry = index.entries?.find((candidate) => candidate.envelopeId === reference.actionEnvelopeId);
  if (!entry || entry.envelopeHash !== reference.actionEnvelopeHash || entry.branchCapsuleId !== reference.branchCapsuleId || entry.branchCapsuleHash !== reference.branchCapsuleHash || entry.ownerApproval?.attestationId !== reference.approvalAttestationId || entry.ownerApproval?.attestationHash !== reference.approvalAttestationHash) throw new Error("Handoff lifecycle entry substitution detected");
  const result = assertActionEnvelopeExecutable(envelope, { branchCapsule, index, repositoryRoot, now });
  if (!result.executable) throw new Error("Existing Handoff validator did not establish executable authority");
  if (!envelope.sourceRequirements?.some((source) => source.identityMode === "exact" && source.expectedIdentity === reference.boundRecordHash)) throw new Error("Executable Handoff envelope does not bind the exact Launch Studio artifact hash");
  if (envelope.target.projectId !== reference.boundProjectId || (reference.boundRepository !== null && envelope.target.repository !== reference.boundRepository) || (reference.boundBaseCommit !== null && envelope.target.expectedCommit !== reference.boundBaseCommit)) throw new Error("Executable Handoff target does not bind the Launch Studio record scope");
  if (reference.scope === "executor-work-order" && (envelope.operation !== "prepare-isolated-candidate-branch" || result.effectiveAuthority.createIsolatedBranch !== true || result.effectiveAuthority.mergeAuthorized !== false || result.effectiveAuthority.productionDeploymentAuthorized !== false)) throw new Error("Executable Handoff authority does not match the executor work-order capability boundary");
  throw new Error("Launch Studio 0.1 can validate an existing Handoff record but cannot itself confer executable transition authority; an exact later adapter is required");
}

export function assertOwnerEventIntegrity(event, predecessor = null) {
  validateContract("owner-event.schema.json", event, event.recordId || "Owner Event");
  if (Buffer.byteLength(event.transcript, "utf8") !== event.transcriptUtf8Bytes) throw new Error("Owner Event transcript UTF-8 byte count mismatch");
  if (sha256Bytes(event.transcript) !== event.transcriptSha256) throw new Error("Owner Event transcript hash mismatch");
  if (event.sourcePointer.contentHash !== event.transcriptSha256) throw new Error("Owner Event source pointer does not bind the transcript hash");
  const capturedAt = parseCanonicalTimestamp(event.capturedAt, "Owner Event capturedAt");
  const observedAt = parseCanonicalTimestamp(event.sourcePointer.observedAt, "Owner Event source observedAt");
  if (observedAt > capturedAt) throw new Error("Owner Event source observation cannot postdate capture");
  if (predecessor === null) {
    if (event.editPredecessorId !== null || event.editPredecessorHash !== null || event.supersessionReason !== null) {
      throw new Error("Original Owner Event cannot claim an edit predecessor");
    }
  } else {
    validateContract("owner-event.schema.json", predecessor, predecessor.recordId || "Owner Event predecessor");
    if (Buffer.byteLength(predecessor.transcript, "utf8") !== predecessor.transcriptUtf8Bytes || sha256Bytes(predecessor.transcript) !== predecessor.transcriptSha256 || predecessor.sourcePointer.contentHash !== predecessor.transcriptSha256) throw new Error("Owner Event predecessor integrity failed");
    if (event.recordId === predecessor.recordId || event.editPredecessorId !== predecessor.recordId ||
        event.editPredecessorHash !== sha256Canonical(predecessor) || !event.supersessionReason) {
      throw new Error("Edited Owner Event does not bind an immutable predecessor and reason");
    }
    if (event.workspaceId !== predecessor.workspaceId || event.projectId !== predecessor.projectId || event.actor.participantId !== predecessor.actor.participantId) {
      throw new Error("Edited Owner Event changed actor or scope");
    }
    if (capturedAt < parseCanonicalTimestamp(predecessor.capturedAt, "Owner Event predecessor capturedAt")) throw new Error("Edited Owner Event predates its predecessor");
  }
  return true;
}

export function assertOwnerEventChain(ownerEvents) {
  if (!Array.isArray(ownerEvents) || ownerEvents.length === 0) throw new Error("Owner Event chain is empty");
  const identities = new Set();
  ownerEvents.forEach((event, index) => {
    if (identities.has(event.recordId)) throw new Error("Owner Event chain repeats an identity or contains a cycle");
    identities.add(event.recordId);
    assertOwnerEventIntegrity(event, index === 0 ? null : ownerEvents[index - 1]);
  });
  return { valid: true, eventCount: ownerEvents.length, headRecordId: ownerEvents.at(-1).recordId, headHash: sha256Canonical(ownerEvents.at(-1)) };
}

export function assertParticipantIsolation(record, expected) {
  if (record.workspaceId !== expected.workspaceId || record.projectId !== expected.projectId) {
    throw new Error("Cross-workspace or cross-project substitution rejected");
  }
  if (expected.participantId && record.participantId !== expected.participantId) throw new Error("Cross-participant substitution rejected");
  return true;
}

export function assertVisibilityAccess(record, actor) {
  if (!VISIBILITIES.includes(record.visibility)) throw new Error("Unsupported visibility classification");
  if (actor?.at === undefined || actor?.at === null) throw new Error("Visibility access requires an authoritative validation time");
  parseCanonicalTimestamp(actor.at, "visibility access time");
  const roleRecord = actor?.roleRecord;
  if (!roleRecord) throw new Error("An exact participant-role record is required");
  assertParticipantRole(roleRecord, { at: actor.at });
  if (record.workspaceId !== roleRecord.workspaceId || record.projectId !== roleRecord.projectId) throw new Error("Visibility access scope substitution rejected");
  if (actor.participantId !== roleRecord.participantId || actor.role !== roleRecord.role) throw new Error("Caller identity does not bind the participant-role record");
  if (!roleRecord.permissions.includes("read-project")) throw new Error("Participant role lacks nonconsequential project-read permission");
  const visibilityRank = Object.fromEntries(VISIBILITIES.map((entry, index) => [entry, index]));
  if (visibilityRank[record.visibility] > visibilityRank[roleRecord.visibilityCeiling]) throw new Error("Record visibility exceeds the exact role ceiling");
  const derivedOwner = record.participantId || record.proposerParticipantId || record.actor?.participantId || null;
  if (record.visibility === "participant-private" && (!derivedOwner || actor.participantId !== derivedOwner)) throw new Error("Participant-private access denied");
  if (record.visibility === "role-restricted") {
    const binding = record.roleVisibilityBinding;
    if (!binding || typeof binding !== "object" || Array.isArray(binding) || canonicalize(Object.keys(binding).sort()) !== canonicalize(["participantRoleReferences", "visibleToRoles"])) throw new Error("Role-restricted access denied without a closed record-bound role visibility binding");
    if (!Array.isArray(binding.visibleToRoles) || !Array.isArray(binding.participantRoleReferences) || binding.visibleToRoles.length === 0 || binding.visibleToRoles.length !== binding.participantRoleReferences.length || new Set(binding.visibleToRoles).size !== binding.visibleToRoles.length) throw new Error("Role-restricted visibility binding is incomplete or ambiguous");
    const referencedRoles = new Set();
    for (const reference of binding.participantRoleReferences) {
      if (!reference || typeof reference !== "object" || Array.isArray(reference) || canonicalize(Object.keys(reference).sort()) !== canonicalize(["recordHash", "recordId", "role"])) throw new Error("Role-restricted participant-role reference is not closed");
      if (!binding.visibleToRoles.includes(reference.role) || referencedRoles.has(reference.role)) throw new Error("Role-restricted participant-role references do not bind the exact visible roles");
      referencedRoles.add(reference.role);
    }
    const exactReference = binding.participantRoleReferences.find((reference) => reference.role === actor.role);
    if (!exactReference || exactReference.recordId !== roleRecord.recordId || exactReference.recordHash !== roleRecord.recordHash) throw new Error("Role-restricted access denied without the exact participant-role record reference");
  }
  if (actor.revocation) assertRevocation(actor.revocation, { targetRecord: roleRecord, at: actor.at });
  if (actor.offboarding) {
    assertOffboarding(actor.offboarding, { participantRole: roleRecord, at: actor.at });
    if (actor.offboarding.completedAt !== null) throw new Error("Offboarded participant access denied");
  }
  return true;
}

export function assertTruthSeparation(delta) {
  validateContract("understanding-delta.schema.json", delta, "Understanding Delta");
  if (delta.personalChatGptMemoryIncluded !== false || delta.automaticPromotion !== false) {
    throw new Error("Personal ChatGPT memory cannot become shared project truth automatically");
  }
  const itemIds = new Set(delta.items.map((item) => item.itemId));
  if (itemIds.size !== delta.items.length) throw new Error("Understanding Delta repeats an item identity");
  const dispositions = [...delta.proposedSharedProjectProjections, ...delta.proposedCoreProjections, ...delta.rejectedFromDurablePromotion];
  if (new Set(dispositions).size !== dispositions.length || dispositions.length !== itemIds.size || dispositions.some((id) => !itemIds.has(id))) throw new Error("Understanding Delta promotion disposition must be disjoint and complete");
  for (const item of delta.items) {
    if (!delta.categories.includes(item.category)) throw new Error("Understanding Delta item category is not declared");
    if (!TRUTH_CLASSIFICATIONS.includes(item.classification)) throw new Error(`Unsupported truth classification ${item.classification}`);
    if ((item.classification === "forecast" || item.classification === "conditional-potential") && item.verificationStatus === "verified") {
      throw new Error("Forecast or potential cannot be represented as verified truth");
    }
    if (item.promotionStatus === "accepted" && item.consentReference === null) throw new Error("Shared projection lacks consent");
    if (delta.proposedCoreProjections.includes(item.itemId) && (!['public', 'synthetic'].includes(item.privacyClass) || item.proposedAudience !== 'public-approved')) throw new Error("Proposed Core projection exceeds the public/synthetic privacy gate");
  }
  return true;
}

export function hashBoundRecord(record, hashField) {
  const copy = cloneJson(record);
  delete copy[hashField];
  return { ...copy, [hashField]: sha256Canonical(copy) };
}

export function assertRecordHash(record, hashField = "recordHash") {
  const hash = record[hashField];
  assertSha256(hash, hashField);
  const copy = cloneJson(record);
  delete copy[hashField];
  if (sha256Canonical(copy) !== hash) throw new Error(`${record.recordId || record.documentType} ${hashField} mismatch`);
  return true;
}

export function assertParticipantConsentStructure(consent) {
  validateContract("participant-consent.schema.json", consent, consent.recordId || "participant consent");
  assertRecordHash(consent);
  const grantedAt = parseCanonicalTimestamp(consent.grantedAt, "consent grantedAt");
  const expiresAt = consent.expiresAt === null ? null : parseCanonicalTimestamp(consent.expiresAt, "consent expiresAt");
  const revokedAt = consent.revokedAt === null ? null : parseCanonicalTimestamp(consent.revokedAt, "consent revokedAt");
  if (expiresAt !== null && expiresAt <= grantedAt) throw new Error("Consent expiry must follow grant");
  if (revokedAt !== null && revokedAt < grantedAt) throw new Error("Consent revocation predates grant");
  return { grantedAt, expiresAt, revokedAt };
}

export function assertParticipantConsent(consent, { at, workspaceId, projectId, participantId, audience } = {}) {
  const { grantedAt, expiresAt, revokedAt } = assertParticipantConsentStructure(consent);
  if (workspaceId || projectId || participantId) assertParticipantIsolation(consent, { workspaceId, projectId, participantId });
  if (consent.status !== "granted" || revokedAt !== null) throw new Error("Participant consent is not active");
  if (at === undefined || at === null) throw new Error("Active participant consent validation requires an authoritative validation time");
  const checkedAt = parseCanonicalTimestamp(at, "consent validation time");
  if (checkedAt < grantedAt) throw new Error("Participant consent is not yet effective at the authoritative validation time");
  if (expiresAt && expiresAt <= checkedAt) throw new Error("Participant consent is expired");
  if (audience && consent.audience !== audience) throw new Error("Participant consent audience substitution rejected");
  return true;
}

export function assertSharedProjectDelta(delta, consentRecords, options = {}) {
  validateContract("shared-project-delta.schema.json", delta, delta.recordId || "shared Project Delta");
  if (delta.personalChatGptMemoryIncluded !== false) throw new Error("Personal ChatGPT memory cannot enter shared truth");
  if (delta.promotionStatus === "approved") {
    if (!options.at) throw new Error("Approved shared Project Delta requires an authoritative validation time");
    if (delta.consentReferences.length === 0 || delta.requiredApprovalReferences.length === 0) throw new Error("Approved shared Project Delta requires consent and approval references");
    const consentById = new Map(consentRecords.map((entry) => [entry.recordId, entry]));
    const consentReferenceById = new Map(delta.consentReferences.map((entry) => [entry.recordId, entry]));
    if (consentById.size !== consentRecords.length || consentReferenceById.size !== delta.consentReferences.length || consentRecords.length !== delta.consentReferences.length) throw new Error("Only the exact referenced consents may validate a shared Project Delta");
    const basisHash = sha256Canonical(delta.basis);
    for (const reference of delta.consentReferences) {
      const consent = consentById.get(reference.recordId);
      if (!consent) throw new Error(`Missing participant consent ${reference.recordId}`);
      if (consent.recordHash !== reference.recordHash) throw new Error("Participant consent exact record hash substitution rejected");
      assertParticipantConsent(consent, { ...options, workspaceId: delta.workspaceId, projectId: delta.projectId, participantId: delta.proposerParticipantId, audience: delta.audience });
      for (const [field, expected] of [["projectionId", delta.recordId], ["purpose", delta.purpose], ["retention", delta.retention], ["attribution", delta.attribution], ["ownership", delta.ownership], ["audience", delta.audience], ["sourceHash", basisHash]]) {
        if (consent[field] !== expected) throw new Error(`Participant consent ${field} does not bind the shared Project Delta`);
      }
    }
    throw new Error("Approved shared truth is unsupported until an exact Handoff-backed shared-project approval contract exists");
  }
  return true;
}

export function assertCollaborationProposal(proposal) {
  validateContract("collaboration-proposal.schema.json", proposal, proposal.recordId || "collaboration proposal");
  const ids = proposal.participants.map((entry) => entry.participantId);
  if (new Set(ids).size !== ids.length) throw new Error("Collaboration proposal repeats a participant");
  if (proposal.opaqueWinWinScore !== null) throw new Error("Opaque win-win scoring is prohibited");
  if (proposal.requiredApprovals.length === 0 || proposal.exitTerms.length === 0) throw new Error("Collaboration proposal lacks approvals or exit terms");
  return true;
}

export function assertFruitObservation(record) {
  validateContract("fruit-observation.schema.json", record, record.recordId || "fruit observation");
  if (record.kind === "predicted" && (record.observedValue !== null || record.observedAt !== null || record.classification === "observed-outcome")) {
    throw new Error("Predicted fruit cannot be represented as observed fruit");
  }
  if (record.kind === "observed" && (record.observedValue === null || record.observedAt === null || record.classification !== "observed-outcome" || record.source === null)) {
    throw new Error("Observed fruit requires an observed value, time, source, and observed-outcome classification");
  }
  if (record.causalClaim !== null && record.causalSupport.length === 0) throw new Error("Unsupported causal claim rejected");
  return true;
}

export function assertSafeRepositoryPattern(value, label = "repository path") {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") || value.includes("\\") || path.posix.isAbsolute(value)) throw new Error(`${label} is unsafe`);
  const parts = value.split("/");
  if (value === "**" || parts.some((part) => part === "" || part === "." || part === ".." || (part.includes("*") && part !== "**")) || parts.slice(0, -1).includes("**")) throw new Error(`${label} contains unsafe traversal or wildcard syntax`);
  return true;
}

export function assertSafeRepositoryPath(value, label = "repository path") {
  assertSafeRepositoryPattern(value, label);
  if (/[*?\[\]{}!]/u.test(value)) throw new Error(`${label} must be one exact repository-relative path, not a glob`);
  return true;
}

function assertExactRepositoryIdentity(value, label = "repository identity") {
  if (typeof value !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/u.test(value)) throw new Error(`${label} must be an exact owner/repository identity`);
  return true;
}

function assertExactBranchIdentity(value, label = "branch identity") {
  assertSafeRepositoryPath(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(value) || value.includes("..") || value.includes("//") || value.includes("@{") || value.endsWith(".") || value.endsWith("/") || value.endsWith(".lock")) throw new Error(`${label} must be an exact branch identity`);
  return true;
}

export function assertBuildCharter(record) {
  validateContract("build-charter.schema.json", record, record.recordId || "Build Charter");
  assertRecordHash(record);
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?@[a-f0-9]{40}$/u.test(record.sourceAnchor)) throw new Error("Build Charter sourceAnchor must bind one exact owner/repository and 40-hex base commit");
  [...record.allowedPaths, ...record.prohibitedPaths].forEach((entry) => assertSafeRepositoryPattern(entry, "Build Charter path"));
  if (record.allowedPaths.length === 0) throw new Error("Build Charter requires an exact nonempty allowed-path boundary");
  const patternBase = (pattern) => pattern.endsWith("/**") ? pattern.slice(0, -3) : null;
  const overlaps = (left, right) => {
    if (left === right) return true;
    const leftBase = patternBase(left);
    const rightBase = patternBase(right);
    if (leftBase !== null && rightBase !== null) return leftBase.startsWith(`${rightBase}/`) || rightBase.startsWith(`${leftBase}/`);
    if (leftBase !== null) return right.startsWith(`${leftBase}/`);
    if (rightBase !== null) return left.startsWith(`${rightBase}/`);
    return false;
  };
  if (record.allowedPaths.some((allowed) => record.prohibitedPaths.some((prohibited) => overlaps(allowed, prohibited)))) throw new Error("Build Charter allowed and prohibited path boundaries overlap");
  for (const effect of ["merge", "production-deployment", "private-data-ingestion", "message", "payment", "purchase"]) if (!record.prohibitedEffects.includes(effect)) throw new Error(`Build Charter omits required prohibited effect ${effect}`);
  return true;
}

export function assertExecutorWorkOrder(record) {
  validateContract("executor-work-order.schema.json", record, record.recordId || "Executor Work Order");
  assertRecordHash(record);
  record.allowedPaths.forEach((entry) => assertSafeRepositoryPattern(entry, "Executor Work Order path"));
  assertExactRepositoryIdentity(record.repository, "Executor Work Order repository");
  assertExactBranchIdentity(record.worktreeBranch, "Executor Work Order branch");
  if (record.allowedPaths.length === 0) throw new Error("Executor Work Order lacks an exact allowed-path boundary");
  if (record.executed !== false || !["proposed", "held"].includes(record.status)) throw new Error("Phase A Executor Work Order must remain proposed or held and unexecuted");
  if (!record.handoffAuthorityReferenceId) throw new Error("Executor Work Order lacks a separate Handoff authority reference identity");
  return true;
}

export function assertUnderstandingCheck(record, { ownerEvent = null } = {}) {
  validateContract("understanding-check.schema.json", record, record.recordId || "Understanding Check");
  if (record.confirmedByOwner) {
    if (record.confirmedAt === null) throw new Error("Confirmed Understanding Check requires confirmedAt");
    const confirmedAt = parseCanonicalTimestamp(record.confirmedAt, "Understanding Check confirmedAt");
    if (ownerEvent !== null) {
      validateContract("owner-event.schema.json", ownerEvent, ownerEvent.recordId || "Understanding Check Owner Event");
      if (Buffer.byteLength(ownerEvent.transcript, "utf8") !== ownerEvent.transcriptUtf8Bytes || sha256Bytes(ownerEvent.transcript) !== ownerEvent.transcriptSha256 || ownerEvent.sourcePointer.contentHash !== ownerEvent.transcriptSha256) throw new Error("Understanding Check Owner Event integrity failed");
      if (record.ownerEventId !== ownerEvent.recordId || record.ownerEventHash !== sha256Canonical(ownerEvent)) throw new Error("Understanding Check does not bind the exact Owner Event");
      if (confirmedAt < parseCanonicalTimestamp(ownerEvent.capturedAt, "Understanding Check Owner Event capturedAt")) throw new Error("Understanding Check confirmation predates its referenced Owner Event");
    }
  } else if (record.confirmedAt !== null) throw new Error("Unconfirmed Understanding Check cannot carry confirmedAt");
  return true;
}

export function assertPreviewReceipt(record) {
  validateContract("preview-receipt.schema.json", record, record.recordId || "Preview receipt");
  assertRecordHash(record);
  if (record.previewCreated) {
    if ([record.candidateSource, record.previewIdentity, record.verifiedAt].some((entry) => entry === null)) throw new Error("Created preview requires exact source, identity, and verification time");
    parseCanonicalTimestamp(record.verifiedAt, "preview verifiedAt");
  } else if ([record.candidateSource, record.previewIdentity, record.target, record.verifiedAt, record.ownerAcceptanceAuthorityReferenceId].some((entry) => entry !== null) || record.aliases.length !== 0) throw new Error("Uncreated preview cannot carry provider identities, aliases, or acceptance authority");
  return true;
}

export function assertParticipantRoleStructure(record) {
  validateContract("participant-role.schema.json", record, record.recordId || "participant role");
  assertRecordHash(record);
  const effectiveAt = parseCanonicalTimestamp(record.effectiveAt, "participant role effectiveAt");
  const expiresAt = record.expiresAt === null ? null : parseCanonicalTimestamp(record.expiresAt, "participant role expiresAt");
  const revokedAt = record.revokedAt === null ? null : parseCanonicalTimestamp(record.revokedAt, "participant role revokedAt");
  if (expiresAt !== null && expiresAt <= effectiveAt) throw new Error("Participant role expiry must follow activation");
  if (revokedAt !== null && (revokedAt < effectiveAt || (expiresAt !== null && revokedAt > expiresAt))) throw new Error("Participant role revocation chronology is invalid");
  if (record.permissions.some((permission) => !NONCONSEQUENTIAL_PARTICIPANT_PERMISSIONS.includes(permission))) throw new Error("Participant role contains an action-like or unsupported permission");
  return { effectiveAt, expiresAt, revokedAt };
}

export function assertParticipantRole(record, { at = null } = {}) {
  const { effectiveAt, expiresAt, revokedAt } = assertParticipantRoleStructure(record);
  if (at !== null) {
    const checkedAt = parseCanonicalTimestamp(at, "participant role access time");
    if (checkedAt < effectiveAt || (expiresAt !== null && checkedAt >= expiresAt) || (revokedAt !== null && checkedAt >= revokedAt)) throw new Error("Participant role is inactive, expired, or revoked");
  }
  return true;
}

export function assertRevocation(record, { targetRecord = null, at = null } = {}) {
  validateContract("revocation.schema.json", record, record.recordId || "revocation");
  const revokedAt = parseCanonicalTimestamp(record.revokedAt, "revocation revokedAt");
  if (targetRecord) {
    if (record.workspaceId !== targetRecord.workspaceId || record.projectId !== targetRecord.projectId || record.participantId !== targetRecord.participantId || record.targetRecordId !== targetRecord.recordId || record.targetRecordHash !== sha256Canonical(targetRecord)) throw new Error("Revocation target or scope substitution rejected");
  }
  if (at !== null && parseCanonicalTimestamp(at, "revocation access time") >= revokedAt) throw new Error("Future access denied by revocation");
  return true;
}

export function assertOffboarding(record, { participantRole = null, exportManifest = null, restorationReceipt = null, at = null } = {}) {
  validateContract("offboarding.schema.json", record, record.recordId || "offboarding receipt");
  const initiatedAt = parseCanonicalTimestamp(record.initiatedAt, "offboarding initiatedAt");
  if (record.completedAt !== null) {
    const completedAt = parseCanonicalTimestamp(record.completedAt, "offboarding completedAt");
    if (completedAt < initiatedAt) throw new Error("Offboarding completion predates initiation");
    if (!record.accessRevoked || !record.consentsRevoked || record.exportReference === null || record.restorationTestReference === null) throw new Error("Completed offboarding lacks revocation, export, or restoration proof");
    if (participantRole && (record.workspaceId !== participantRole.workspaceId || record.projectId !== participantRole.projectId || record.participantId !== participantRole.participantId)) throw new Error("Offboarding scope substitution rejected");
    if (exportManifest && (record.exportReference !== exportManifest.exportId || record.workspaceId !== exportManifest.workspaceId || record.projectId !== exportManifest.projectId)) throw new Error("Offboarding export binding failed");
    if (restorationReceipt && (record.restorationTestReference !== restorationReceipt.restorationId || restorationReceipt.exportId !== record.exportReference || restorationReceipt.identityEqual !== true)) throw new Error("Offboarding restoration binding failed");
    if (at !== null && parseCanonicalTimestamp(at, "offboarding access time") >= completedAt) throw new Error("Future access denied after offboarding");
  }
  return true;
}
