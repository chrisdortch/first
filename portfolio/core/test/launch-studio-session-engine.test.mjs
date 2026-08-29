import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalize, sha256Bytes, sha256Canonical } from "../lib/canonical-json.mjs";
import {
  APPROVAL_RAILS, CAPABILITY_CLASSES, SCHEMA_FILES,
  SYNTHETIC_DIRECTORY, VERSION_DIRECTORY, assertAuthorityReference, assertCollaborationProposal,
  assertBuildCharter, assertExecutorWorkOrder, assertFruitObservation, assertNoPrivateReasoningFields, assertOffboarding, assertOwnerEventChain, assertOwnerEventIntegrity,
  assertParticipantConsent, assertParticipantIsolation, assertParticipantRole, assertPreviewReceipt, assertRecordHash, assertRevocation, assertSharedProjectDelta, assertUnderstandingCheck,
  assertTruthSeparation, assertVisibilityAccess, readCanonicalJson, readCanonicalJsonl,
  parseCanonicalTimestamp, validateContract, validateSchemaCatalog, verifyExecutableHandoffReference
} from "../launch-studio/versions/0.1.0/runtime/contracts.mjs";
import {
  SESSION_STATES, TERMINAL_STATES, appendSessionEvent, createSessionEvent, enforceBudget, reconstructSession,
  shouldStopRepair, verifySessionEvents
} from "../launch-studio/versions/0.1.0/runtime/session-engine.mjs";
import {
  assertSanitizedSyntheticText, buildExportManifest, restoreExportDirectory, verifyExportDirectory, writeExportBundle
} from "../launch-studio/versions/0.1.0/runtime/session-archive.mjs";
import {
  assertFixtureGraph, deriveSyntheticOutputs, loadSyntheticInputs, verifyCommittedSynthetic, verifyExportRestoreReplay,
  verifyLaunchIndexDocument, verifyStableIndex
} from "../launch-studio/versions/0.1.0/runtime/replay.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, "../../..");
const { fixture, events } = loadSyntheticInputs();

function clone(value) { return structuredClone(value); }
function selfHash(value) { return { ...value, recordHash: sha256Canonical(value) }; }
function reseal(value) { const copy = clone(value); delete copy.recordHash; return selfHash(copy); }
function sealIndex(value) { const copy = clone(value); delete copy.indexHash; return { ...copy, indexHash: sha256Canonical(copy) }; }
function tempRoot(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function eventBytes(list = events) { return `${list.map(canonicalize).join("\n")}\n`; }
const launchIndexPath = (number) =>
  `portfolio/core/launch-studio/versions/0.1.0/indexes/launch-session-index-${String(number).padStart(4, "0")}.json`;
const stableLaunchIndexPath = "portfolio/core/launch-studio/index.json";

function indexSchemaBinding(index) {
  return index.schemaVersion === "0.1.0"
    ? index.schemas.find(({ path: schemaPath }) => schemaPath.endsWith("/launch-session-index.schema.json"))
    : index.indexSchema;
}

function copyRepositoryFile(root, relativePath) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(REPOSITORY_ROOT, relativePath), target);
}

function writeCanonicalJson(root, relativePath, value) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${canonicalize(value)}\n`);
}

function createLaunchIndexFixtureRoot(prefix) {
  const root = tempRoot(prefix);
  const latest = readCanonicalJson(path.join(REPOSITORY_ROOT, stableLaunchIndexPath));
  const referencedPaths = new Set([
    indexSchemaBinding(latest).path,
    ...latest.engine.runtimeModules.map((entry) => entry.path),
    ...latest.engine.coreDependencies.map((entry) => entry.path),
    ...latest.schemas.map((entry) => entry.path),
    latest.profileCatalog.path,
    latest.syntheticSession.reportPath,
    ...latest.entries.flatMap((entry) => Object.entries(entry)
      .filter(([key]) => key.endsWith("Path")).map(([, value]) => value))
  ]);
  for (const relativePath of referencedPaths) copyRepositoryFile(root, relativePath);
  for (const number of [1, 2, 3, 4]) copyRepositoryFile(root, launchIndexPath(number));
  copyRepositoryFile(root, stableLaunchIndexPath);
  return {
    root,
    latest,
    stablePath: path.join(root, stableLaunchIndexPath),
    immutablePath: path.join(root, launchIndexPath(4)),
    verificationOptions: {
      repositoryRoot: root,
      stableIndexPath: path.join(root, stableLaunchIndexPath),
      immutableIndexPath: path.join(root, launchIndexPath(4))
    }
  };
}

function createIndexSchemaFixtureRoot(index, prefix) {
  const root = tempRoot(prefix);
  const schemaPaths = new Set([
    ...index.schemas.map((entry) => entry.path),
    indexSchemaBinding(index).path
  ]);
  for (const relativePath of schemaPaths) copyRepositoryFile(root, relativePath);
  return root;
}
const INDEX_VERIFY_OPTIONS = {};
const ZERO_USAGE = { modelCalls: 0, implementationAgents: 0, ciRuns: 0, previews: 0, elapsedMinutes: 0, providerUsage: 0, purchaseUsd: 0, repairLoops: 0 };

function participantRole(overrides = {}) {
  const unsigned = { documentType: "clover-participant-role", schemaVersion: "0.1.0", recordId: "participant_role_synthetic_owner_001", workspaceId: fixture.workspaceId, projectId: fixture.projectId, participantId: fixture.ownerEvents[1].actor.participantId, displayName: "Synthetic Owner", role: "Owner", visibilityCeiling: "workspace-members", permissions: ["read-project", "propose-delta", "review", "observe-progress"], attributionRequired: true, effectiveAt: "2026-08-23T11:00:00.000Z", expiresAt: "2026-08-24T11:00:00.000Z", revokedAt: null, synthetic: true, consequentialAuthorityGranted: false, ...overrides };
  return { ...unsigned, recordHash: sha256Canonical(unsigned) };
}

test("the append-only dependency-pin successor contains exactly 50 authorized paths", () => {
  function walk(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(absolute) : [path.relative(REPOSITORY_ROOT, absolute).split(path.sep).join("/")];
    });
  }
  const paths = [...walk(path.join(REPOSITORY_ROOT, "portfolio/core/launch-studio")), "portfolio/core/test/launch-studio-session-engine.test.mjs"].sort();
  assert.equal(paths.length, 50);
  assert.ok(paths.every((entry) => entry.startsWith("portfolio/core/launch-studio/") || entry === "portfolio/core/test/launch-studio-session-engine.test.mjs"));
  assert.equal(SCHEMA_FILES.length, 29);
});

test("all 29 contracts are versioned, closed, uniquely identified, and reject unknown root fields", () => {
  const catalog = validateSchemaCatalog();
  assert.equal(catalog.schemaCount, 29);
  const unknown = clone(fixture.ownerEvents[0]);
  unknown.unknownField = true;
  assert.throws(() => validateContract("owner-event.schema.json", unknown), /additional property|unexpected/i);
  assert.throws(() => validateContract("not-a-schema.schema.json", {}), /Unknown Launch Studio schema/);
});

test("schema-level lifecycle conditionals reject impossible record combinations", () => {
  const understanding = clone(fixture.understandingCheck); understanding.confirmedAt = null;
  assert.throws(() => validateContract("understanding-check.schema.json", understanding), /not.*null|type string|Schema violation/i);
  const preview = clone(fixture.previewProposal); preview.previewCreated = true;
  assert.throws(() => validateContract("preview-receipt.schema.json", preview), /candidateSource|previewIdentity|verifiedAt/);
  const consent = { documentType: "clover-participant-consent", schemaVersion: "0.1.0", recordId: "consent_synthetic_impossible_001", workspaceId: fixture.workspaceId, projectId: fixture.projectId, participantId: fixture.ownerEvents[1].actor.participantId, projectionId: "projection_synthetic_001", audience: "project-members", purpose: "Synthetic test", retention: "session", attribution: "Synthetic Owner", ownership: "participant", grantedAt: "2026-08-23T12:00:00.000Z", expiresAt: null, revokedAt: "2026-08-23T13:00:00.000Z", status: "granted", sourceHash: sha256Bytes("source"), recordHash: "0".repeat(64), synthetic: true, consequentialAuthorityGranted: false };
  assert.throws(() => validateContract("participant-consent.schema.json", consent), /const null/);
  assert.throws(() => validateContract("participant-consent.schema.json", { ...consent, status: "expired", revokedAt: null }), /type string/);
  assert.throws(() => validateContract("participant-consent.schema.json", { ...consent, status: "revoked", revokedAt: null }), /type string/);
  const workOrder = clone(fixture.executorWorkOrder); workOrder.executed = true; workOrder.status = "completed";
  assert.throws(() => validateContract("executor-work-order.schema.json", workOrder), /const false|enum/);
  const missingModelResolution = { ...clone(events[7]), eventType: "model_resolved", modelResolution: null };
  assert.throws(() => validateContract("launch-session-event.schema.json", missingModelResolution), /type object/);
  const missingDecisionBinding = { ...clone(events[6]), ownerDecisionBinding: null };
  assert.throws(() => validateContract("launch-session-event.schema.json", missingDecisionBinding), /type object/);
  const impossibleObservedFruit = { ...clone(fixture.predictedFruit), kind: "observed", classification: "observed-outcome" };
  assert.throws(() => validateContract("fruit-observation.schema.json", impossibleObservedFruit), /type number,string|type string|type object/);
  assert.throws(() => validateContract("launch-session-event.schema.json", { ...clone(events[1]), toState: "invented_state" }), /enum|Schema violation/);
  assert.throws(() => validateContract("launch-session.schema.json", { ...reconstructSession(fixture, events), state: "invented_state" }), /enum|Schema violation/);
  const proposedEffect = { effectId: "effect_proposed_synthetic_001", effectType: "target-null-preview", status: "proposed", sourceIdentity: "commit:0000000000000000000000000000000000000000", targetIdentity: null, authorityReferenceId: null, authorityReferenceHash: null, executionReceiptId: null, executionReceiptHash: null, recordedAt: "2026-08-23T13:00:00.000Z", rollback: { required: true, status: "pending", receiptId: null, receiptHash: null } };
  const effectSession = { ...reconstructSession(fixture, events), synthetic: false, externalEffects: [proposedEffect] };
  assert.doesNotThrow(() => validateContract("launch-session.schema.json", effectSession));
  const exactEffectEvidence = { authorityReferenceId: "authority_effect_synthetic_001", authorityReferenceHash: "a".repeat(64), executionReceiptId: "receipt_effect_synthetic_001", executionReceiptHash: "b".repeat(64) };
  const performedEffect = { ...proposedEffect, ...exactEffectEvidence, status: "performed" };
  assert.doesNotThrow(() => validateContract("launch-session.schema.json", { ...effectSession, externalEffects: [performedEffect] }));
  const compensatedEffect = { ...performedEffect, status: "compensated", rollback: { required: true, status: "completed", receiptId: "rollback_receipt_synthetic_001", receiptHash: "c".repeat(64) } };
  assert.doesNotThrow(() => validateContract("launch-session.schema.json", { ...effectSession, externalEffects: [compensatedEffect] }));
  for (const invalidEffect of [
    { ...proposedEffect, authorityReferenceId: "half_pair_001" },
    { ...proposedEffect, executionReceiptId: "receipt_early_001", executionReceiptHash: "b".repeat(64) },
    { ...proposedEffect, status: "performed" },
    { ...performedEffect, rollback: compensatedEffect.rollback },
    { ...compensatedEffect, rollback: { required: true, status: "pending", receiptId: null, receiptHash: null } },
    { ...proposedEffect, rollback: { required: false, status: "pending", receiptId: null, receiptHash: null } },
    { ...proposedEffect, rollback: { required: true, status: "completed", receiptId: null, receiptHash: null } },
    { ...proposedEffect, rollback: { required: true, status: "completed", receiptId: "rollback_receipt_early_001", receiptHash: "c".repeat(64) } },
    { ...proposedEffect, rollback: { required: false, status: "completed", receiptId: "rollback_receipt_impossible_001", receiptHash: "c".repeat(64) } },
    { ...proposedEffect, status: "failed" }
  ]) assert.throws(() => validateContract("launch-session.schema.json", { ...effectSession, externalEffects: [invalidEffect] }), /Schema violation|pair|receipt|rollback|requires exact/i);
});

test("canonical hashing preserves Unicode, CRLF, and meaningful whitespace exactly", () => {
  const transcript = "Café ☘\r\n  choose one  ";
  const event = clone(fixture.ownerEvents[0]);
  event.recordId = "owner_event_unicode_crlf_001";
  event.transcript = transcript;
  event.transcriptUtf8Bytes = Buffer.byteLength(transcript, "utf8");
  event.transcriptSha256 = sha256Bytes(transcript);
  event.sourcePointer.contentHash = event.transcriptSha256;
  assertOwnerEventIntegrity(event);
  assert.notEqual(sha256Bytes(transcript), sha256Bytes(transcript.replace("\r\n", "\n")));
  assert.notEqual(sha256Bytes(transcript), sha256Bytes(transcript.trim()));
  const tampered = clone(event);
  tampered.transcript = transcript.replace("  choose", " choose");
  assert.throws(() => assertOwnerEventIntegrity(tampered), /byte count mismatch|hash mismatch/);
});

test("authority and chronology paths accept only real millisecond-precision UTC timestamps", () => {
  assert.equal(parseCanonicalTimestamp("2026-08-23T12:00:00.000Z"), Date.parse("2026-08-23T12:00:00.000Z"));
  for (const invalid of [0, "0", "2026-08-23", "2026-08-23T12:00:00", "2026-02-30T12:00:00.000Z", "NaN"]) assert.throws(() => parseCanonicalTimestamp(invalid), /canonical UTC|real canonical/);
  assert.throws(() => assertAuthorityReference(fixture.charterAuthorityReference, { at: "2026-08-23" }), /canonical UTC/);
  const noExpiry = { ...fixture.charterAuthorityReference, expiresAt: null };
  assert.throws(() => assertAuthorityReference(noExpiry, { at: "not-a-time" }), /canonical UTC/);
});

test("Owner Event edits are immutable successors with exact predecessor binding", () => {
  assertOwnerEventIntegrity(fixture.ownerEvents[0], null);
  assertOwnerEventIntegrity(fixture.ownerEvents[1], fixture.ownerEvents[0]);
  const rewrittenOriginal = clone(fixture.ownerEvents[0]);
  rewrittenOriginal.editPredecessorId = "owner_event_fake_001";
  assert.throws(() => assertOwnerEventIntegrity(rewrittenOriginal), /Original Owner Event|Schema violation/);
  const substituted = clone(fixture.ownerEvents[1]);
  substituted.editPredecessorHash = "0".repeat(64);
  assert.throws(() => assertOwnerEventIntegrity(substituted, fixture.ownerEvents[0]), /immutable predecessor/);
  const third = clone(fixture.ownerEvents[1]);
  third.recordId = "owner_event_synthetic_003";
  third.transcript += " Preserve the original request.";
  third.transcriptUtf8Bytes = Buffer.byteLength(third.transcript, "utf8");
  third.transcriptSha256 = sha256Bytes(third.transcript);
  third.sourcePointer = { ...third.sourcePointer, sourceId: "source_synthetic_owner_text_003", contentHash: third.transcriptSha256, observedAt: "2026-08-23T12:02:00.000Z" };
  third.capturedAt = "2026-08-23T12:02:00.000Z";
  third.editPredecessorId = fixture.ownerEvents[1].recordId;
  third.editPredecessorHash = sha256Canonical(fixture.ownerEvents[1]);
  assertOwnerEventIntegrity(third, fixture.ownerEvents[1]);
  assert.equal(assertOwnerEventChain([...fixture.ownerEvents, third]).eventCount, 3);
  const sourceSubstitution = clone(third); sourceSubstitution.sourcePointer.contentHash = "0".repeat(64);
  assert.throws(() => assertOwnerEventIntegrity(sourceSubstitution, fixture.ownerEvents[1]), /source pointer/);
  const futureObserved = clone(fixture.ownerEvents[0]); futureObserved.sourcePointer.observedAt = "2026-08-23T12:00:00.001Z";
  assert.throws(() => assertOwnerEventIntegrity(futureObserved), /observation cannot postdate capture/);
  const prematureUnderstanding = { ...clone(fixture.understandingCheck), confirmedAt: "2026-08-23T12:00:59.999Z" };
  assert.throws(() => assertUnderstandingCheck(prematureUnderstanding, { ownerEvent: fixture.ownerEvents[1] }), /confirmation predates/);
});

test("the exact 29-state machine replays to held and rejects illegal transitions and concurrency", () => {
  assert.equal(SESSION_STATES.length, 29);
  assert.equal(Object.isFrozen(TERMINAL_STATES), true);
  assert.throws(() => TERMINAL_STATES.push("captured"), /read only|extensible|object is not extensible/i);
  const replay = verifySessionEvents(events, { budget: fixture.sessionBudget });
  assert.equal(replay.state, "held");
  assert.equal(replay.version, 10);
  assert.equal(reconstructSession(fixture, events).consequentialAuthorityGranted, false);
  const illegal = clone(events[1]);
  illegal.toState = "building";
  assert.throws(() => createSessionEvent(illegal, events[0]), /Illegal transition/);
  const stale = clone(events[1]);
  stale.expectedSessionVersion = 0;
  assert.throws(() => createSessionEvent(stale, events[0]), /Expected session version 1/);
  const afterTerminal = clone(events[9]);
  afterTerminal.sequence = 11;
  afterTerminal.expectedSessionVersion = 10;
  afterTerminal.fromState = "held";
  afterTerminal.toState = "completed";
  afterTerminal.eventId = "launch_event_after_terminal_001";
  afterTerminal.idempotencyKey = "launch_idempotency_after_terminal_001";
  assert.throws(() => createSessionEvent(afterTerminal, events[9]), /Terminal session state/);
});

test("idempotency recognizes an exact historical retry and rejects changed replay content", () => {
  const exact = appendSessionEvent(events, events[3]);
  assert.equal(exact.idempotent, true);
  assert.equal(exact.events, events);
  const conflict = clone(events[3]);
  conflict.materialDelta = "changed replay";
  assert.throws(() => appendSessionEvent(events, conflict), /Idempotency conflict/);
  const tamperedSuffix = clone(events); tamperedSuffix[8].materialDelta = "tampered later suffix";
  assert.throws(() => appendSessionEvent(tamperedSuffix, tamperedSuffix[3]), /tampering/);
  const priorId = clone(events[8]);
  priorId.eventId = events[2].eventId;
  priorId.idempotencyKey = "launch_idempotency_duplicate_event_id_001";
  assert.throws(() => appendSessionEvent(events.slice(0, 8), priorId), /Duplicate event ID|tampering/);
});

test("event verification rejects tamper, delete, reorder, substitution, cycles, and unknown fields", () => {
  const tampered = clone(events); tampered[4].materialDelta = "tampered";
  assert.throws(() => verifySessionEvents(tampered), /tampering/);
  const deleted = events.filter((_, index) => index !== 4);
  assert.throws(() => verifySessionEvents(deleted), /sequence|fromState|predecessor/i);
  const reordered = clone(events); [reordered[3], reordered[4]] = [reordered[4], reordered[3]];
  assert.throws(() => verifySessionEvents(reordered), /sequence|fromState|predecessor/i);
  const substituted = clone(events); substituted[2].projectId = "project_substituted_001";
  assert.throws(() => verifySessionEvents(substituted), /substitution|tampering/i);
  const unknown = clone(events); unknown[1].unknownField = true;
  assert.throws(() => verifySessionEvents(unknown), /additional property/);
  const cycle = clone(events[1]); cycle.actor.loop = cycle;
  assert.throws(() => createSessionEvent(cycle, events[0]), /cycle|unsupported|additional/i);
});

test("all four approval rails are distinct and no approval inherits into another transition", () => {
  assert.deepEqual(APPROVAL_RAILS, ["APPROVE_BUILD_CHARTER", "ACCEPT_PREVIEW_CANDIDATE", "APPROVE_MERGE", "APPROVE_PRODUCTION"]);
  const wrongRail = clone(events[6]);
  wrongRail.ownerDecision = "APPROVE_PRODUCTION";
  assert.throws(() => createSessionEvent(wrongRail, events[5]), /requires APPROVE_BUILD_CHARTER/);
  const inherited = clone(events[7]);
  inherited.ownerDecision = "APPROVE_BUILD_CHARTER";
  assert.throws(() => createSessionEvent(inherited, events[6]), /cannot be inherited/);
});

test("Handoff remains the sole authority system and stale, substituted, or impossible references fail closed", () => {
  const reference = fixture.charterAuthorityReference;
  assert.deepEqual(assertAuthorityReference(reference), { valid: true, executable: false, requiresVerifiedHandoff: true });
  assert.throws(() => assertAuthorityReference(reference, { requireExecutable: true }), /exact repository verification/);
  assert.throws(() => assertAuthorityReference(reference, { at: "2026-08-25T00:00:00.000Z" }), /stale or expired/);
  const futureCreated = { ...reference, createdAt: "2026-08-23T14:00:00.000Z", expiresAt: "2026-08-24T14:00:00.000Z" };
  assert.throws(() => assertAuthorityReference(futureCreated, { at: "2026-08-23T13:00:00.000Z" }), /cannot postdate/);
  const substituted = clone(reference); substituted.authoritySystem = "launch-studio";
  assert.throws(() => assertAuthorityReference(substituted), /clover-handoff|delegate/i);
  const partial = clone(reference); partial.approvalAttestationId = "attestation_partial_001";
  assert.throws(() => assertAuthorityReference(partial), /entirely null|const null/);
  const falseApproval = clone(reference); falseApproval.lifecycle = "approved";
  assert.throws(() => assertAuthorityReference(falseApproval), /Approved Handoff reference lacks|must have type string/);
  const traversal = clone(reference); traversal.actionEnvelopePath = "portfolio/core/handoff/../forged.json";
  assert.throws(() => assertAuthorityReference(traversal), /unsafe segment/);
  const forged = clone(reference);
  Object.assign(forged, { synthetic: false, nonAuthorizing: false, lifecycle: "approved", lifecycleIndexPath: "portfolio/core/handoff/index.json", lifecycleIndexHash: "1".repeat(64), approvalAttestationId: "attestation_forged_001", approvalAttestationPath: "portfolio/core/handoff/versions/0.1.0/forged-attestation.json", approvalAttestationHash: "2".repeat(64) });
  assert.throws(() => verifyExecutableHandoffReference(forged, { now: "2026-08-23T13:00:00.000Z" }), /does not exist|binding failed/);
  const syntheticExecutableClaim = { ...forged, synthetic: true };
  assert.throws(() => verifyExecutableHandoffReference(syntheticExecutableClaim, { now: "2026-08-23T13:00:00.000Z" }), /categorically non-executable/);
  const provenanceSwap = clone(events[8]);
  Object.assign(provenanceSwap.authorityReference, { actionEnvelopeId: "handoff_action_synthetic_substituted_001", actionEnvelopePath: "portfolio/core/handoff/versions/0.1.0/synthetic-proposals/substituted-action-envelope.json", actionEnvelopeHash: "d".repeat(64), expiresAt: "2026-08-25T12:09:00.000Z" });
  assert.throws(() => createSessionEvent(provenanceSwap, events[7]), /authority reference provenance is immutable|exact separate proposed/);
  const resealedSwap = clone(provenanceSwap); delete resealedSwap.eventHash; resealedSwap.eventHash = sha256Canonical(resealedSwap);
  assert.throws(() => verifySessionEvents([...events.slice(0, 8), resealedSwap]), /authority reference provenance is immutable|exact separate proposed/);
});

test("session budgets enforce every ceiling and repeated/no-new-evidence stops", () => {
  enforceBudget({ modelCalls: 12, implementationAgents: 2, ciRuns: 1, previews: 1, elapsedMinutes: 120, providerUsage: 0, purchaseUsd: 0, repairLoops: 3 }, fixture.sessionBudget);
  assert.throws(() => enforceBudget({ ...ZERO_USAGE, modelCalls: 13 }, fixture.sessionBudget), /modelCalls/);
  assert.throws(() => enforceBudget({ ...ZERO_USAGE, implementationAgents: 3 }, fixture.sessionBudget), /implementationAgents/);
  assert.throws(() => enforceBudget({ ...ZERO_USAGE, ciRuns: 2 }, fixture.sessionBudget), /ciRuns/);
  assert.throws(() => enforceBudget({ ...ZERO_USAGE, previews: 2 }, fixture.sessionBudget), /previews/);
  assert.throws(() => enforceBudget({ ...ZERO_USAGE, elapsedMinutes: 121 }, fixture.sessionBudget), /elapsedMinutes/);
  assert.throws(() => enforceBudget({ ...ZERO_USAGE, repairLoops: 4 }, fixture.sessionBudget), /repairLoops/);
  assert.throws(() => enforceBudget({ ...ZERO_USAGE, providerUsage: 1 }, fixture.sessionBudget), /providerUsage/);
  assert.throws(() => enforceBudget({ ...ZERO_USAGE, purchaseUsd: 1 }, fixture.sessionBudget), /purchaseUsd/);
  assert.equal(shouldStopRepair({ repairLoopCount: 3, maximumRepairLoops: 3, repeatedFailureCount: 0, evidenceHash: "a", previousEvidenceHash: "b" }).reason, "repair-loop-limit");
  assert.equal(shouldStopRepair({ repairLoopCount: 1, maximumRepairLoops: 3, repeatedFailureCount: 2, evidenceHash: "a", previousEvidenceHash: "b" }).reason, "repeated-failure");
  assert.equal(shouldStopRepair({ repairLoopCount: 1, maximumRepairLoops: 3, repeatedFailureCount: 0, evidenceHash: "a", previousEvidenceHash: "a" }).reason, "no-new-evidence");
  const purchase = clone(fixture.sessionBudget); purchase.explicitPurchaseCeilingUsd = 1;
  assert.throws(() => enforceBudget(ZERO_USAGE, purchase), /prohibit purchases/);
  const previous = { ...events[7], sequence: 20, resultingSessionVersion: 20, toState: "revision_requested", recordedAt: "2026-08-23T13:00:00.000Z", eventHash: "a".repeat(64), repairLoopCount: 2 };
  const repair = { ...clone(events[7]), eventId: "repair_loop_event_003", idempotencyKey: "repair_loop_idempotency_003", sequence: 21, expectedSessionVersion: 20, recordedAt: "2026-08-23T13:01:00.000Z", eventType: "repair_loop_started", fromState: "revision_requested", toState: "revising", repairLoopCount: 3, authorityReference: null, executorWorkOrder: null, executorWorkOrderBinding: null, evidence: [{ evidenceId: "repair_evidence_003", contentHash: sha256Bytes("new diagnosis"), sourceType: "synthetic-diagnosis" }] };
  assert.doesNotThrow(() => createSessionEvent(repair, previous));
  assert.throws(() => createSessionEvent({ ...repair, repairLoopCount: 0 }, previous), /increment exactly|cannot jump/);
  assert.throws(() => createSessionEvent({ ...repair, repairLoopCount: 4 }, previous), /increment exactly/);
  const over = createSessionEvent({ ...clone(events[0]), eventId: "budget_over_event_001", idempotencyKey: "budget_over_idempotency_001", budgetDelta: { ...events[0].budgetDelta, modelCalls: 999 } }, null);
  assert.throws(() => verifySessionEvents([over]), /modelCalls/);
  assert.throws(() => createSessionEvent({ ...events[0], sessionBudget: null }, null), /requires an exact bound budget/);
});

test("material progress requires evidence and rejects private reasoning fields", () => {
  assertNoPrivateReasoningFields(events);
  assert.throws(() => assertNoPrivateReasoningFields({ chainOfThought: "not allowed" }), /forbidden private-reasoning/);
  const noEvidence = clone(events[1]); noEvidence.evidence = [];
  assert.throws(() => createSessionEvent(noEvidence, events[0]), /requires evidence/);
  assert.ok(events.every((event) => typeof event.conciseStatus === "string" && event.materialDelta.length > 0));
  const falseClaim = { ...clone(events[1]), eventType: "preview_created" };
  assert.throws(() => createSessionEvent(falseClaim, events[0]), /not truthful/);
  const unsafePath = { ...clone(events[1]), changedPaths: ["/Users/private/source.js"] };
  assert.throws(() => createSessionEvent(unsafePath, events[0]), /unsafe/);
  const buildingPrevious = { ...clone(events[7]), sequence: 20, resultingSessionVersion: 20, toState: "building", recordedAt: "2026-08-23T13:00:00.000Z", eventHash: "a".repeat(64) };
  const sourceDeltaInput = { ...clone(events[8]), eventId: "launch_event_source_delta_001", idempotencyKey: "launch_idempotency_source_delta_001", sequence: 21, expectedSessionVersion: 20, recordedAt: "2026-08-23T13:01:00.000Z", eventType: "source_delta_recorded", fromState: "building", toState: "building", conciseStatus: "Source delta recorded", materialDelta: "Recorded one exact bounded changed path.", changedPaths: ["future-isolated-app/src/activity.js"], evidence: [{ evidenceId: "evidence_source_delta_001", contentHash: sha256Bytes("synthetic source delta"), sourceType: "synthetic-source-delta" }] };
  const sourceDelta = createSessionEvent(sourceDeltaInput, buildingPrevious);
  assert.equal(sourceDelta.eventHash, createSessionEvent(sourceDeltaInput, buildingPrevious).eventHash);
  assert.throws(() => createSessionEvent({ ...sourceDeltaInput, changedPaths: [] }, buildingPrevious), /requires at least one exact changed path/);
  assert.throws(() => createSessionEvent({ ...sourceDeltaInput, changedPaths: ["future-isolated-app/**"] }, buildingPrevious), /exact repository-relative path|not a glob/);
  const diagnosisPrevious = { ...buildingPrevious, toState: "revision_requested" };
  const diagnosisInput = { ...sourceDeltaInput, eventId: "launch_event_diagnosis_001", idempotencyKey: "launch_idempotency_diagnosis_001", eventType: "diagnosis_summary", fromState: "revision_requested", toState: "revision_requested", conciseStatus: "Diagnosis summarized", materialDelta: "Bound a concise evidence-backed diagnosis without hidden reasoning.", changedPaths: [], authorityReference: null, evidence: [{ evidenceId: "evidence_diagnosis_001", contentHash: sha256Bytes("synthetic diagnosis evidence"), sourceType: "synthetic-diagnosis" }] };
  assert.doesNotThrow(() => createSessionEvent(diagnosisInput, diagnosisPrevious));
  assert.throws(() => createSessionEvent({ ...diagnosisInput, fromState: "validating", toState: "validating" }, { ...diagnosisPrevious, toState: "validating" }), /Illegal transition/);
});

test("capability policy is model-name independent and runtime resolution starts empty", () => {
  assert.deepEqual(CAPABILITY_CLASSES, ["high-reasoning", "implementation", "mechanical", "deterministic"]);
  assert.deepEqual(fixture.executorWorkOrder.modelCapabilityPolicy, CAPABILITY_CLASSES);
  assert.equal(fixture.executorWorkOrder.resolvedModelId, null);
  assert.deepEqual(reconstructSession(fixture, events).resolvedModels, []);
});

test("resolved model identities are append-only, Work-Order-bound runtime facts", () => {
  const input = { ...clone(events[7]), eventId: "launch_event_model_resolution_001", idempotencyKey: "launch_idempotency_model_resolution_001", sequence: 9, expectedSessionVersion: 8, recordedAt: "2026-08-23T12:10:30.000Z", eventType: "model_resolved", fromState: "execution_proposed", toState: "execution_proposed", conciseStatus: "Implementation model resolved", materialDelta: "Recorded the runtime-resolved model identity without changing capability policy.", executorWorkOrder: null, modelResolution: { capabilityClass: "implementation", resolvedModelId: "runtime-model-synthetic-001", resolvedAt: "2026-08-23T12:10:30.000Z" } };
  const resolution = createSessionEvent(input, events[7]);
  const stream = [...events.slice(0, 8), resolution];
  assert.deepEqual(verifySessionEvents(stream).resolvedModels, [input.modelResolution]);
  assert.deepEqual(reconstructSession(fixture, stream).resolvedModels, [input.modelResolution]);
  const duplicateInput = { ...clone(resolution), eventId: "launch_event_model_resolution_002", idempotencyKey: "launch_idempotency_model_resolution_002", sequence: 10, expectedSessionVersion: 9, recordedAt: "2026-08-23T12:10:31.000Z", predecessorEventHash: resolution.eventHash, modelResolution: { ...input.modelResolution, resolvedAt: "2026-08-23T12:10:31.000Z" }, eventHash: null };
  const duplicate = createSessionEvent(duplicateInput, resolution);
  assert.throws(() => verifySessionEvents([...stream, duplicate]), /resolved more than once/);
  assert.throws(() => createSessionEvent({ ...input, modelResolution: { ...input.modelResolution, capabilityClass: "unsupported" } }, events[7]), /Work Order capability|enum/);
  const forgedIntroduction = { ...clone(events[1]), eventId: "launch_event_model_forged_001", idempotencyKey: "launch_idempotency_model_forged_001", sequence: 2, expectedSessionVersion: 1, recordedAt: "2026-08-23T12:03:30.000Z", eventType: "model_resolved", fromState: "captured", toState: "captured", executorWorkOrder: null, executorWorkOrderBinding: clone(events[7].executorWorkOrderBinding), modelResolution: { capabilityClass: "implementation", resolvedModelId: "runtime-model-forged-001", resolvedAt: "2026-08-23T12:03:30.000Z" } };
  assert.throws(() => createSessionEvent(forgedIntroduction, events[0]), /Illegal transition|cannot be introduced without the full validated Work Order/);
  assert.throws(() => createSessionEvent({ ...input, executorWorkOrder: clone(fixture.executorWorkOrder) }, events[7]), /may originate only at the exact execution-proposal transition/);
  assert.throws(() => createSessionEvent({ ...input, changedPaths: ["portfolio/core/launch-studio-escape/file.js"] }, events[7]), /exceeds the exact Executor Work Order/);
});

test("workspace, project, participant, and visibility boundaries deny cross-scope access", () => {
  const record = { workspaceId: fixture.workspaceId, projectId: fixture.projectId, participantId: "participant_synthetic_owner_001", visibility: "participant-private" };
  assertParticipantIsolation(record, record);
  assert.throws(() => assertParticipantIsolation(record, { ...record, projectId: "project_other_001" }), /Cross-workspace or cross-project/);
  const roleRecord = participantRole();
  assertVisibilityAccess(record, { participantId: record.participantId, role: "Owner", roleRecord, at: "2026-08-23T13:00:00.000Z" });
  assert.throws(() => assertVisibilityAccess(record, { participantId: record.participantId, role: "Owner", roleRecord }), /authoritative validation time/);
  assert.throws(() => assertVisibilityAccess(record, { participantId: record.participantId, role: "Owner", roleRecord, at: "invalid" }), /canonical UTC/);
  const expiredRole = participantRole({ expiresAt: "2026-08-23T12:30:00.000Z" });
  assert.throws(() => assertVisibilityAccess(record, { participantId: record.participantId, role: "Owner", roleRecord: expiredRole, at: "2026-08-23T13:00:00.000Z" }), /inactive, expired, or revoked/);
  const roleRestricted = { ...record, visibility: "role-restricted", roleVisibilityBinding: { visibleToRoles: ["Owner"], participantRoleReferences: [{ recordId: roleRecord.recordId, recordHash: roleRecord.recordHash, role: "Owner" }] } };
  assertVisibilityAccess(roleRestricted, { participantId: record.participantId, role: "Owner", roleRecord, at: "2026-08-23T13:00:00.000Z" });
  const schemaRoleRestricted = { ...clone(fixture.ownerEvents[0]), visibility: "role-restricted", roleVisibilityBinding: clone(roleRestricted.roleVisibilityBinding) };
  validateContract("owner-event.schema.json", schemaRoleRestricted, "role-restricted Owner Event");
  assert.throws(() => assertVisibilityAccess({ ...roleRestricted, roleVisibilityBinding: { ...roleRestricted.roleVisibilityBinding, participantRoleReferences: [{ ...roleRestricted.roleVisibilityBinding.participantRoleReferences[0], recordHash: "0".repeat(64) }] } }, { participantId: record.participantId, role: "Owner", roleRecord, at: "2026-08-23T13:00:00.000Z" }), /exact participant-role record reference/);
  assert.throws(() => assertVisibilityAccess(record, { participantId: "participant_other_001", role: "Owner", roleRecord, at: "2026-08-23T13:00:00.000Z" }), /Caller identity|access denied/);
  assert.throws(() => assertVisibilityAccess({ ...record, projectId: "project_other_001", visibility: "project-members" }, { participantId: record.participantId, role: "Owner", roleRecord, at: "2026-08-23T13:00:00.000Z" }), /scope substitution/);
  assert.throws(() => assertParticipantRole(participantRole({ permissions: ["merge", "payment"] })), /enum|action-like|unsupported/);
  const revocation = { documentType: "clover-revocation", schemaVersion: "0.1.0", recordId: "revocation_synthetic_role_001", workspaceId: roleRecord.workspaceId, projectId: roleRecord.projectId, participantId: roleRecord.participantId, targetRecordId: roleRecord.recordId, targetRecordHash: sha256Canonical(roleRecord), reason: "Synthetic access revocation", revokedAt: "2026-08-23T12:30:00.000Z", effectiveScope: ["future access"], historicalRecordRewritten: false, synthetic: true, consequentialAuthorityGranted: false };
  assert.throws(() => assertVisibilityAccess(record, { participantId: record.participantId, role: "Owner", roleRecord, revocation, at: "2026-08-23T13:00:00.000Z" }), /Future access denied/);
  const offboarding = { documentType: "clover-offboarding", schemaVersion: "0.1.0", recordId: "offboarding_synthetic_access_001", workspaceId: roleRecord.workspaceId, projectId: roleRecord.projectId, participantId: roleRecord.participantId, initiatedAt: "2026-08-23T12:00:00.000Z", completedAt: "2026-08-23T12:30:00.000Z", accessRevoked: true, consentsRevoked: true, ownedRecordsDisposition: ["Synthetic export retained."], attributionPreserved: true, exportReference: fixture.exportMetadata.exportId, restorationTestReference: fixture.restorationId, openObligations: [], synthetic: true, consequentialAuthorityGranted: false };
  assert.throws(() => assertVisibilityAccess(record, { participantId: record.participantId, role: "Owner", roleRecord, offboarding, at: "2026-08-23T13:00:00.000Z" }), /Future access denied|Offboarded/);
});

test("consent, revocation, attribution, offboarding, and shared truth stay explicit", () => {
  const consent = selfHash({
    documentType: "clover-participant-consent", schemaVersion: "0.1.0", recordId: "consent_synthetic_001", workspaceId: fixture.workspaceId, projectId: fixture.projectId,
    participantId: "participant_synthetic_owner_001", projectionId: "shared_delta_synthetic_001", audience: "project-members", purpose: "Synthetic collaboration test",
    retention: "session", attribution: "Synthetic Owner", ownership: "participant", grantedAt: "2026-08-23T12:00:00.000Z", expiresAt: "2026-08-24T12:00:00.000Z",
    revokedAt: null, status: "granted", sourceHash: sha256Canonical([fixture.ownerEvents[1].sourcePointer]), synthetic: true, consequentialAuthorityGranted: false
  });
  assertParticipantConsent(consent, { at: "2026-08-23T13:00:00.000Z", workspaceId: fixture.workspaceId, projectId: fixture.projectId, participantId: consent.participantId, audience: "project-members" });
  assert.throws(() => assertParticipantConsent(consent), /authoritative validation time/);
  assert.throws(() => assertParticipantConsent(consent, { at: "invalid" }), /canonical UTC/);
  assert.throws(() => assertParticipantConsent(consent, { at: "2026-08-23T11:59:59.999Z" }), /not yet effective/);
  assert.throws(() => assertParticipantConsent(consent, { at: "2026-08-25T00:00:00.000Z" }), /expired/);
  const revoked = reseal({ ...consent, status: "revoked", revokedAt: "2026-08-23T13:00:00.000Z" });
  assert.throws(() => assertParticipantConsent(revoked, { at: "2026-08-23T13:01:00.000Z" }), /not active/);
  const delta = {
    documentType: "clover-shared-project-delta", schemaVersion: "0.1.0", recordId: "shared_delta_synthetic_001", workspaceId: fixture.workspaceId, projectId: fixture.projectId,
    proposerParticipantId: consent.participantId, basis: [fixture.ownerEvents[1].sourcePointer], classification: "owner-statement", statement: "Synthetic project statement.", audience: "project-members",
    purpose: consent.purpose, retention: consent.retention, attribution: consent.attribution, ownership: consent.ownership, consentReferences: [{ recordId: consent.recordId, recordHash: consent.recordHash }], requiredApprovalReferences: ["approval_synthetic_001"],
    correctionOf: null, supersedes: null, revocationReference: null, promotionStatus: "approved", personalChatGptMemoryIncluded: false, synthetic: true, consequentialAuthorityGranted: false
  };
  assert.throws(() => assertSharedProjectDelta(delta, [consent], { at: "2026-08-23T13:00:00.000Z" }), /unsupported until an exact Handoff-backed/);
  const memoryLeak = clone(delta); memoryLeak.personalChatGptMemoryIncluded = true;
  assert.throws(() => assertSharedProjectDelta(memoryLeak, [consent]), /const false|memory/i);
  validateContract("revocation.schema.json", { documentType: "clover-revocation", schemaVersion: "0.1.0", recordId: "revocation_synthetic_001", workspaceId: fixture.workspaceId, projectId: fixture.projectId, participantId: consent.participantId, targetRecordId: delta.recordId, targetRecordHash: sha256Canonical(delta), reason: "Synthetic revocation test", revokedAt: "2026-08-23T14:00:00.000Z", effectiveScope: ["future use"], historicalRecordRewritten: false, synthetic: true, consequentialAuthorityGranted: false });
  validateContract("offboarding.schema.json", { documentType: "clover-offboarding", schemaVersion: "0.1.0", recordId: "offboarding_synthetic_001", workspaceId: fixture.workspaceId, projectId: fixture.projectId, participantId: consent.participantId, initiatedAt: "2026-08-23T14:00:00.000Z", completedAt: "2026-08-23T14:01:00.000Z", accessRevoked: true, consentsRevoked: true, ownedRecordsDisposition: ["Exported synthetic records."], attributionPreserved: true, exportReference: fixture.exportMetadata.exportId, restorationTestReference: fixture.restorationId, openObligations: [], synthetic: true, consequentialAuthorityGranted: false });
});

test("collaboration proposals expose participant effects instead of an opaque win-win score", () => {
  const proposal = {
    documentType: "clover-collaboration-proposal", schemaVersion: "0.1.0", recordId: "collaboration_synthetic_001", workspaceId: fixture.workspaceId, projectId: fixture.projectId,
    participants: [{ participantId: "participant_synthetic_owner_001", benefit: "A tested synthetic workflow.", contribution: "Defines acceptance.", cost: "No purchase.", obligation: "Review the preview proposal." }, { participantId: "participant_synthetic_builder_001", benefit: "A bounded charter.", contribution: "Future isolated build.", cost: "Bounded time.", obligation: "Return exact evidence." }],
    sharedBenefit: "Transparent synthetic collaboration.", costAndObligation: ["No spending."], ownershipAndAttribution: ["Each contribution remains attributed."], dataExposure: ["Synthetic records only."],
    conflicts: [], risks: ["Role confusion if consent is omitted."], exitTerms: ["Either participant may revoke future access and export records."], supportingEvidence: events[0].evidence,
    unknowns: ["No real pilot participants exist."], requiredApprovals: ["Each participant consent.", "Exact Handoff authority for any future effect."], opaqueWinWinScore: null, synthetic: true, consequentialAuthorityGranted: false
  };
  assertCollaborationProposal(proposal);
  const opaque = clone(proposal); opaque.opaqueWinWinScore = 99;
  assert.throws(() => assertCollaborationProposal(opaque), /const null|Opaque/);
});

test("Understanding Delta is proposed, privacy-bound, and never auto-promotes personal memory", () => {
  assertTruthSeparation(fixture.understandingDelta);
  assert.equal(fixture.understandingDelta.personalChatGptMemoryIncluded, false);
  assert.equal(fixture.understandingDelta.automaticPromotion, false);
  const forecast = clone(fixture.understandingDelta); forecast.items[0].classification = "forecast"; forecast.items[0].verificationStatus = "verified";
  assert.throws(() => assertTruthSeparation(forecast), /cannot be represented as verified truth/);
  const duplicateDisposition = clone(fixture.understandingDelta); duplicateDisposition.proposedCoreProjections = [duplicateDisposition.proposedSharedProjectProjections[0]];
  assert.throws(() => assertTruthSeparation(duplicateDisposition), /disjoint and complete/);
  const privateCore = clone(fixture.understandingDelta); privateCore.proposedSharedProjectProjections = []; privateCore.proposedCoreProjections = [privateCore.items[0].itemId]; privateCore.items[0].privacyClass = "private"; privateCore.items[0].proposedAudience = "public-approved";
  assert.throws(() => assertTruthSeparation(privateCore), /privacy gate/);
  const forgedProvenance = clone(fixture); forgedProvenance.understandingDelta.items[0].provenanceOwnerEventHash = "0".repeat(64);
  assert.throws(() => assertFixtureGraph(forgedProvenance, events), /provenance/);
});

test("predicted and observed fruit remain separate and unsupported causal claims fail", () => {
  assertFruitObservation(fixture.predictedFruit);
  const falseObserved = clone(fixture.predictedFruit); falseObserved.kind = "observed";
  assert.throws(() => assertFruitObservation(falseObserved), /Observed fruit requires|observed-outcome/);
  const unsupported = clone(fixture.predictedFruit); unsupported.causalClaim = "The app caused the outcome.";
  assert.throws(() => assertFruitObservation(unsupported), /Unsupported causal claim/);
});

test("preview proposal binds the Acceptance Contract one-to-one and cannot claim an uncreated pass", () => {
  assertPreviewReceipt(fixture.previewProposal);
  for (const mutate of [
    (copy) => copy.previewProposal.acceptanceResults.pop(),
    (copy) => copy.previewProposal.acceptanceResults.push(clone(copy.previewProposal.acceptanceResults[0])),
    (copy) => { copy.previewProposal.acceptanceResults[0].testId = "nonexistent_test_001"; },
    (copy) => { copy.previewProposal.acceptanceResults[0].status = "pass"; copy.previewProposal.acceptanceResults[0].evidenceHash = sha256Bytes("false pass"); }
  ]) {
    const copy = clone(fixture); mutate(copy); copy.previewProposal.recordHash = sha256Canonical(Object.fromEntries(Object.entries(copy.previewProposal).filter(([key]) => key !== "recordHash")));
    assert.throws(() => assertFixtureGraph(copy, events), /acceptance|Uncreated preview/i);
  }
  const impossible = clone(fixture.previewProposal); impossible.previewCreated = true; impossible.recordHash = sha256Canonical(Object.fromEntries(Object.entries(impossible).filter(([key]) => key !== "recordHash")));
  assert.throws(() => assertPreviewReceipt(impossible), /exact source|Schema violation/);
  const aliasWithoutPreview = reseal({ ...fixture.previewProposal, aliases: ["synthetic.example.invalid"] });
  assert.throws(() => validateContract("preview-receipt.schema.json", aliasWithoutPreview), /too many|at most|Schema violation/i);
  assert.throws(() => assertPreviewReceipt(aliasWithoutPreview), /aliases|Schema violation/i);
  const acceptanceWithoutPreview = reseal({ ...fixture.previewProposal, ownerAcceptanceAuthorityReferenceId: "authority_preview_impossible_001" });
  assert.throws(() => validateContract("preview-receipt.schema.json", acceptanceWithoutPreview), /must equal const null|Schema violation/i);
  assert.throws(() => assertPreviewReceipt(acceptanceWithoutPreview), /acceptance authority|Schema violation/i);
});

test("hash-bound records reject source, charter, and authority substitution", () => {
  for (const record of [fixture.contextPack, fixture.impactScan, fixture.acceptanceContract, fixture.buildCharter, fixture.executorWorkOrder, fixture.previewProposal]) assertRecordHash(record);
  const substituted = clone(fixture.buildCharter); substituted.sourceAnchor = "substituted/source";
  assert.throws(() => assertRecordHash(substituted), /recordHash mismatch/);
  const badFixture = clone(fixture); badFixture.buildCharter.contextPackHash = "0".repeat(64); badFixture.buildCharter.recordHash = sha256Canonical(Object.fromEntries(Object.entries(badFixture.buildCharter).filter(([key]) => key !== "recordHash")));
  assert.throws(() => deriveSyntheticOutputs(badFixture, events), /graph binding|dependency hash substitution/);
});

test("Charter and Work Order path/effect boundaries reject widening and traversal", () => {
  assertBuildCharter(fixture.buildCharter);
  assertExecutorWorkOrder(fixture.executorWorkOrder);
  for (const sourceAnchor of ["synthetic/**@" + "0".repeat(40), "../repository@" + "0".repeat(40), "synthetic/repository-placeholder@abc", "synthetic/repository-placeholder@" + "0".repeat(39)]) {
    assert.throws(() => assertBuildCharter(reseal({ ...fixture.buildCharter, sourceAnchor })), /sourceAnchor|pattern/);
  }
  for (const [field, value] of [["repository", "synthetic/**"], ["repository", "../repository"], ["worktreeBranch", "synthetic/**"], ["worktreeBranch", "synthetic/../branch"], ["worktreeBranch", "synthetic/branch.lock"]]) {
    assert.throws(() => assertExecutorWorkOrder(reseal({ ...fixture.executorWorkOrder, [field]: value })), /exact owner\/repository|exact branch|pattern|glob|unsafe/);
  }
  for (const unsafe of ["**", "../escape", "/absolute/path", "folder\\escape", "safe/../escape", "nul\0path"]) {
    const copy = clone(fixture.executorWorkOrder); copy.allowedPaths = [unsafe]; copy.recordHash = sha256Canonical(Object.fromEntries(Object.entries(copy).filter(([key]) => key !== "recordHash")));
    assert.throws(() => assertExecutorWorkOrder(copy), /unsafe|traversal|wildcard/);
  }
  for (const [allowedPaths, prohibitedPaths] of [
    [["future-isolated-app/**"], ["future-isolated-app/private/**"]],
    [["future-isolated-app/private/file.js"], ["future-isolated-app/**"]]
  ]) {
    const overlap = reseal({ ...fixture.buildCharter, allowedPaths, prohibitedPaths });
    assert.throws(() => assertBuildCharter(overlap), /boundaries overlap/);
  }
  const widened = clone(fixture); widened.executorWorkOrder.allowedPaths = ["different/**"]; widened.executorWorkOrder.recordHash = sha256Canonical(Object.fromEntries(Object.entries(widened.executorWorkOrder).filter(([key]) => key !== "recordHash")));
  widened.executionAuthorityReference.boundRecordHash = widened.executorWorkOrder.recordHash; widened.executionAuthorityReference.boundAllowedPathsHash = sha256Canonical(widened.executorWorkOrder.allowedPaths);
  assert.throws(() => assertFixtureGraph(widened, events), /widens or substitutes/);
  const unrelated = clone(events[7]);
  unrelated.executorWorkOrder.charterId = "build_charter_unrelated_001";
  unrelated.executorWorkOrder.recordHash = sha256Canonical(Object.fromEntries(Object.entries(unrelated.executorWorkOrder).filter(([key]) => key !== "recordHash")));
  unrelated.executorWorkOrderBinding.recordHash = unrelated.executorWorkOrder.recordHash;
  unrelated.authorityReference.boundRecordHash = unrelated.executorWorkOrder.recordHash;
  unrelated.evidence[0].contentHash = unrelated.executorWorkOrder.recordHash;
  assert.throws(() => createSessionEvent(unrelated, events[6]), /exact approved Build Charter/);
  const alienBudget = clone(events[7]);
  alienBudget.sessionBudget.recordId = "launch_budget_alien_001";
  alienBudget.executorWorkOrder.sessionUsageCeilingId = alienBudget.sessionBudget.recordId;
  alienBudget.executorWorkOrder.recordHash = sha256Canonical(Object.fromEntries(Object.entries(alienBudget.executorWorkOrder).filter(([key]) => key !== "recordHash")));
  alienBudget.executorWorkOrderBinding.recordHash = alienBudget.executorWorkOrder.recordHash;
  alienBudget.authorityReference.boundRecordHash = alienBudget.executorWorkOrder.recordHash;
  alienBudget.evidence[0].contentHash = alienBudget.executorWorkOrder.recordHash;
  assert.throws(() => createSessionEvent(alienBudget, events[6]), /budget policy cannot be introduced or substituted/);
  for (const mutate of [
    (copy) => { copy.executorWorkOrder.allowedPaths = ["everything/**"]; copy.authorityReference.boundAllowedPathsHash = sha256Canonical(copy.executorWorkOrder.allowedPaths); },
    (copy) => { copy.executorWorkOrder.prohibitedEffects = []; copy.authorityReference.boundProhibitedEffectsHash = sha256Canonical(copy.executorWorkOrder.prohibitedEffects); },
    (copy) => { copy.executorWorkOrder.handoffAuthorityReferenceId = "authority_ref_alien_execution_001"; }
  ]) {
    const widenedEvent = clone(events[7]);
    mutate(widenedEvent);
    widenedEvent.executorWorkOrder = reseal(widenedEvent.executorWorkOrder);
    widenedEvent.executorWorkOrderBinding = null;
    widenedEvent.authorityReference.boundRecordHash = widenedEvent.executorWorkOrder.recordHash;
    widenedEvent.evidence[0].contentHash = widenedEvent.executorWorkOrder.recordHash;
    assert.throws(() => createSessionEvent(widenedEvent, events[6]), /widens or substitutes|exact separate Executor Work Order authority reference/);
  }
  for (const toState of ["worktree_ready", "preview_ready", "merge_approved", "merged", "production_approved", "production_completed", "rolled_back"]) {
    const fromState = { worktree_ready: "execution_authority_pending", preview_ready: "validating", merge_approved: "merge_proposed", merged: "merge_approved", production_approved: "production_proposed", production_completed: "production_approved", rolled_back: "building" }[toState];
    const previous = { ...events[7], sequence: 30, resultingSessionVersion: 30, fromState: "charter_approved", toState: fromState, recordedAt: "2026-08-23T13:00:00.000Z", eventHash: "a".repeat(64) };
    const attempt = { ...clone(events[8]), eventId: `effect_claim_${toState}`, idempotencyKey: `effect_claim_idempotency_${toState}`, sequence: 31, expectedSessionVersion: 30, fromState, toState, recordedAt: "2026-08-23T13:01:00.000Z", eventType: toState === "worktree_ready" ? "worktree_created" : ["preview_ready"].includes(toState) ? "preview_created" : ["merge_approved", "production_approved"].includes(toState) ? "decision_required" : "receipt_created", ownerDecision: null, ownerDecisionBinding: null };
    assert.throws(() => createSessionEvent(attempt, previous), /fail-closed|later exact Handoff adapter|requires APPROVE/);
  }
  const futureSession = reconstructSession(fixture, events);
  futureSession.synthetic = false;
  futureSession.externalEffects = [{ effectId: "effect_future_preview_001", effectType: "target-null-preview", status: "proposed", sourceIdentity: "commit:0000000000000000000000000000000000000000", targetIdentity: null, authorityReferenceId: null, authorityReferenceHash: null, executionReceiptId: null, executionReceiptHash: null, recordedAt: "2026-08-23T13:00:00.000Z", rollback: { required: true, status: "pending", receiptId: null, receiptHash: null } }];
  assert.doesNotThrow(() => validateContract("launch-session.schema.json", futureSession));
  const effectClaim = { ...clone(events[1]), synthetic: false, externalEffects: futureSession.externalEffects };
  assert.throws(() => createSessionEvent(effectClaim, events[0]), /no performed external effect/);
});

test("each non-inheriting approval transition requires its exact Handoff rail and scope", () => {
  assert.doesNotThrow(() => createSessionEvent(events[6], events[5]));
  assert.throws(() => createSessionEvent({ ...events[6], authorityReference: null }, events[5]), /exact .* Clover Handoff reference/);
  assert.throws(() => createSessionEvent({ ...events[6], ownerDecisionBinding: null }, events[5]), /explicit immutable owner decision/);
  const builderDecision = clone(events[6]); builderDecision.actor.role = "Builder"; builderDecision.ownerDecisionBinding.actor.role = "Builder"; builderDecision.evidence[1].contentHash = sha256Canonical(builderDecision.ownerDecisionBinding);
  assert.throws(() => createSessionEvent(builderDecision, events[5]), /immutable session Owner principal/);
  const attackerActor = { participantId: "participant_attacker_001", role: "Owner", displayName: "Attacker" };
  const attackerDecisionBinding = { ...events[6].ownerDecisionBinding, actor: attackerActor };
  const attackerDecision = { ...clone(events[6]), actor: attackerActor, ownerDecisionBinding: attackerDecisionBinding, evidence: events[6].evidence.map((entry) => entry.sourceType === "synthetic-owner-decision" ? { ...entry, contentHash: sha256Canonical(attackerDecisionBinding) } : entry) };
  assert.throws(() => createSessionEvent(attackerDecision, events[5]), /immutable session Owner principal/);
  const prematureDecision = clone(events[6]); prematureDecision.ownerDecisionBinding.decidedAt = "2020-01-01T00:00:00.000Z"; prematureDecision.evidence[1].contentHash = sha256Canonical(prematureDecision.ownerDecisionBinding);
  assert.throws(() => createSessionEvent(prematureDecision, events[5]), /decision chronology/);
  const futureReference = clone(events[6]); futureReference.authorityReference.createdAt = "2026-08-23T12:10:00.000Z"; futureReference.authorityReference.expiresAt = "2026-08-24T12:10:00.000Z";
  assert.throws(() => createSessionEvent(futureReference, events[5]), /cannot postdate|decision chronology/);
  for (const lifecycle of ["revoked", "expired"]) {
    const inactive = clone(events[6]); inactive.authorityReference.lifecycle = lifecycle;
    assert.throws(() => createSessionEvent(inactive, events[5]), /lifecycle must remain proposed/);
  }
  const alienPrevious = { ...clone(events[5]), sessionId: "launch_session_alien_001", eventHash: "a".repeat(64) };
  assert.throws(() => createSessionEvent({ ...clone(events[6]), sessionId: alienPrevious.sessionId }, alienPrevious), /exact session and project/);
  for (const [fromState, toState, decision, scope, recordType, statement] of [
    ["preview_review_pending", "preview_accepted", "ACCEPT_PREVIEW_CANDIDATE", "preview-candidate", "preview-receipt", "ACCEPT PREVIEW CANDIDATE"],
    ["merge_proposed", "merge_approved", "APPROVE_MERGE", "merge", "merge-candidate", "APPROVE MERGE"],
    ["production_proposed", "production_approved", "APPROVE_PRODUCTION", "production", "production-candidate", "APPROVE PRODUCTION"]
  ]) {
    const previous = { ...events[5], sequence: 20, resultingSessionVersion: 20, toState: fromState, recordedAt: "2026-08-23T13:00:00.000Z", eventHash: "a".repeat(64) };
    const recordHash = sha256Bytes(`${scope} exact candidate`);
    const authorityReference = { ...clone(fixture.charterAuthorityReference), referenceId: `reference_${scope}_001`, scope, approvalRail: decision, boundRecordType: recordType, boundRecordId: `record_${scope}_001`, boundRecordHash: recordHash };
    const ownerDecisionBinding = { decisionId: `decision_${scope}_001`, statement, boundRecordId: authorityReference.boundRecordId, boundRecordHash: recordHash, decidedAt: "2026-08-23T13:01:00.000Z", actor: events[6].actor, synthetic: true, nonAuthorizing: true };
    const input = { ...clone(events[6]), eventId: `event_${scope}_001`, idempotencyKey: `idempotency_${scope}_001`, sequence: 21, expectedSessionVersion: 20, recordedAt: "2026-08-23T13:01:00.000Z", fromState, toState, ownerDecision: decision, ownerDecisionBinding, authorityReference, evidence: [{ evidenceId: `evidence_${scope}_record`, contentHash: recordHash, sourceType: "synthetic-core-record" }, { evidenceId: `evidence_${scope}_decision`, contentHash: sha256Canonical(ownerDecisionBinding), sourceType: "synthetic-owner-decision" }] };
    assert.throws(() => createSessionEvent(input, previous), /later exact Handoff adapter|fail-closed/);
    assert.throws(() => createSessionEvent({ ...input, authorityReference: fixture.charterAuthorityReference }, previous), /exact .* Clover Handoff reference/);
    const inactiveRail = clone(input); inactiveRail.authorityReference.lifecycle = "revoked";
    assert.throws(() => createSessionEvent(inactiveRail, previous), /lifecycle must remain proposed/);
  }
});

test("approved shared Project Delta rejects absent, unrelated, substituted, or expired consent", () => {
  const basis = [fixture.ownerEvents[1].sourcePointer];
  const consent = selfHash({ documentType: "clover-participant-consent", schemaVersion: "0.1.0", recordId: "consent_strict_001", workspaceId: fixture.workspaceId, projectId: fixture.projectId, participantId: "participant_synthetic_owner_001", projectionId: "shared_delta_strict_001", audience: "project-members", purpose: "Strict binding test", retention: "session", attribution: "Synthetic Owner", ownership: "participant", grantedAt: "2026-08-23T12:00:00.000Z", expiresAt: "2026-08-24T12:00:00.000Z", revokedAt: null, status: "granted", sourceHash: sha256Canonical(basis), synthetic: true, consequentialAuthorityGranted: false });
  const delta = { documentType: "clover-shared-project-delta", schemaVersion: "0.1.0", recordId: "shared_delta_strict_001", workspaceId: fixture.workspaceId, projectId: fixture.projectId, proposerParticipantId: "participant_synthetic_owner_001", basis, classification: "owner-statement", statement: "Strict synthetic projection.", audience: "project-members", purpose: "Strict binding test", retention: "session", attribution: "Synthetic Owner", ownership: "participant", consentReferences: [{ recordId: consent.recordId, recordHash: consent.recordHash }], requiredApprovalReferences: ["approval_strict_001"], correctionOf: null, supersedes: null, revocationReference: null, promotionStatus: "approved", personalChatGptMemoryIncluded: false, synthetic: true, consequentialAuthorityGranted: false };
  assert.throws(() => assertSharedProjectDelta(delta, [consent], { at: "2026-08-23T13:00:00.000Z" }), /unsupported until an exact Handoff-backed/);
  assert.throws(() => assertSharedProjectDelta(delta, [consent]), /authoritative validation time/);
  assert.throws(() => assertSharedProjectDelta({ ...delta, consentReferences: [] }, [], { at: "2026-08-23T13:00:00.000Z" }), /consent|too few/i);
  assert.throws(() => assertSharedProjectDelta(delta, [], { at: "2026-08-23T13:00:00.000Z" }), /exact referenced consents|Missing/);
  assert.throws(() => assertSharedProjectDelta(delta, [reseal({ ...consent, projectionId: "shared_delta_other_001" })], { at: "2026-08-23T13:00:00.000Z" }), /record hash substitution|projectionId/);
  assert.throws(() => assertSharedProjectDelta(delta, [reseal({ ...consent, purpose: "substituted" })], { at: "2026-08-23T13:00:00.000Z" }), /record hash substitution|purpose/);
  assert.throws(() => assertSharedProjectDelta(delta, [reseal({ ...consent, participantId: "participant_other_001" })], { at: "2026-08-23T13:00:00.000Z" }), /record hash substitution|Cross-participant/);
  assert.throws(() => assertSharedProjectDelta(delta, [consent], { at: "2026-08-25T13:00:00.000Z" }), /expired/);
  const extended = reseal({ ...consent, expiresAt: "2026-08-30T12:00:00.000Z" });
  assert.throws(() => assertSharedProjectDelta(delta, [extended], { at: "2026-08-25T13:00:00.000Z" }), /record hash substitution/);
});

test("fixture graph rejects independently resealed scope, source, and record substitutions", () => {
  assert.throws(() => assertFixtureGraph({ ...clone(fixture), fakePreviewAuthority: true }, events), /unknown property|additional/i);
  const mutations = [
    (copy) => { copy.executorWorkOrder.sessionId = "launch_session_other_001"; copy.executorWorkOrder.recordHash = sha256Canonical(Object.fromEntries(Object.entries(copy.executorWorkOrder).filter(([key]) => key !== "recordHash"))); },
    (copy) => { copy.previewProposal.sessionId = "launch_session_other_001"; copy.previewProposal.recordHash = sha256Canonical(Object.fromEntries(Object.entries(copy.previewProposal).filter(([key]) => key !== "recordHash"))); },
    (copy) => { copy.understandingDelta.workspaceId = "workspace_other_001"; },
    (copy) => { copy.understandingCheck.ownerEventId = "owner_event_other_001"; copy.understandingCheck.ownerEventHash = "0".repeat(64); },
    (copy) => { copy.executionAuthorityReference.boundRecordHash = "3".repeat(64); },
    (copy) => { copy.syntheticCharterDecision.charterHash = "4".repeat(64); },
    (copy) => { copy.executionAuthorityReference.referenceId = copy.charterAuthorityReference.referenceId; copy.executorWorkOrder.handoffAuthorityReferenceId = copy.charterAuthorityReference.referenceId; copy.executorWorkOrder.recordHash = sha256Canonical(Object.fromEntries(Object.entries(copy.executorWorkOrder).filter(([key]) => key !== "recordHash"))); copy.executionAuthorityReference.boundRecordHash = copy.executorWorkOrder.recordHash; },
    (copy) => { copy.exportMetadata.projectId = "project_other_001"; }
  ];
  for (const mutate of mutations) {
    const copy = clone(fixture); mutate(copy);
    assert.throws(() => deriveSyntheticOutputs(copy, events), /substitution|substituted|binding failed|graph binding|does not bind|widens|mismatch/);
  }
  const earlyEvidence = clone(events);
  earlyEvidence[0].evidence[0].contentHash = sha256Bytes("unrelated but well-formed evidence");
  assert.throws(() => assertFixtureGraph(fixture, earlyEvidence), /early event 1 evidence/);
});

test("every historical and current index requires its exact recorded schema file bytes", () => {
  for (const number of [1, 2, 3, 4]) {
    const index = readCanonicalJson(path.join(REPOSITORY_ROOT, launchIndexPath(number)));
    const binding = indexSchemaBinding(index);

    {
      const root = createIndexSchemaFixtureRoot(index, `launch-index-${number}-altered-schema-`);
      try {
        fs.appendFileSync(path.join(root, binding.path), " ");
        assert.throws(() => verifyLaunchIndexDocument(index, { repositoryRoot: root }),
          /schema digest mismatch/iu);
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }

    {
      const root = createIndexSchemaFixtureRoot(index, `launch-index-${number}-stale-schema-pin-`);
      try {
        const stale = clone(index);
        indexSchemaBinding(stale).sha256 = "0".repeat(64);
        assert.throws(() => verifyLaunchIndexDocument(sealIndex(stale), { repositoryRoot: root }),
          /schema digest mismatch/iu);
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }

    {
      const root = createIndexSchemaFixtureRoot(index, `launch-index-${number}-schema-path-`);
      try {
        const substituted = clone(index);
        indexSchemaBinding(substituted).path =
          "portfolio/core/launch-studio/versions/0.1.0/schemas/substituted-index.schema.json";
        assert.throws(() => verifyLaunchIndexDocument(sealIndex(substituted), { repositoryRoot: root }),
          /substituted schema path|schema path substitution/iu);
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }

    {
      const root = createIndexSchemaFixtureRoot(index, `launch-index-${number}-missing-schema-`);
      try {
        fs.unlinkSync(path.join(root, binding.path));
        assert.throws(() => verifyLaunchIndexDocument(index, { repositoryRoot: root }),
          /schema path does not exist/iu);
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }

    {
      const root = createIndexSchemaFixtureRoot(index, `launch-index-${number}-schema-symlink-`);
      try {
        const schemaPath = path.join(root, binding.path);
        fs.unlinkSync(schemaPath);
        fs.symlinkSync(path.join(REPOSITORY_ROOT, binding.path), schemaPath);
        assert.throws(() => verifyLaunchIndexDocument(index, { repositoryRoot: root }),
          /schema path crosses a symbolic link/iu);
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }
  }
});

test("stable index rejects resealed hash, path, missing, symlink, schema, and report substitution", () => {
  const index = readCanonicalJson(path.join(REPOSITORY_ROOT, "portfolio/core/launch-studio/index.json"));
  const reseal = (value) => { const copy = clone(value); delete copy.indexHash; return { ...copy, indexHash: sha256Canonical(copy) }; };
  const invalidIndexTime = clone(index); invalidIndexTime.createdAt = "2026-02-30T12:23:00.000Z";
  assert.throws(() => verifyLaunchIndexDocument(reseal(invalidIndexTime), INDEX_VERIFY_OPTIONS), /real canonical|index createdAt/);
  const futureEntry = clone(index);
  futureEntry.entries[0].recordedAt = new Date(Date.parse(index.createdAt) + 1).toISOString();
  assert.throws(() => verifyLaunchIndexDocument(reseal(futureEntry), INDEX_VERIFY_OPTIONS), /cannot postdate its containing index/);
  const prematureEntry = clone(index); prematureEntry.entries[0].recordedAt = "2026-08-23T12:21:59.999Z";
  assert.throws(() => verifyLaunchIndexDocument(reseal(prematureEntry), INDEX_VERIFY_OPTIONS), /chronology is inconsistent/);
  const nonIncreasingSuccessor = clone(index);
  nonIncreasingSuccessor.createdAt = "2026-08-23T12:23:00.000Z";
  assert.throws(() => verifyLaunchIndexDocument(reseal(nonIncreasingSuccessor), INDEX_VERIFY_OPTIONS), /index chronology is not increasing/);
  assert.throws(() => verifyLaunchIndexDocument(index, { eventStreamVerifier: () => ({ valid: true }), fixtureGraphVerifier: () => true }), /rejects caller-supplied verifier/);
  const zero = clone(index); zero.schemas[0].sha256 = "0".repeat(64);
  assert.throws(() => verifyLaunchIndexDocument(reseal(zero), INDEX_VERIFY_OPTIONS), /schema digest mismatch/);
  const escape = clone(index); escape.schemas[0].path = "../escape.schema.json";
  assert.throws(() => verifyLaunchIndexDocument(reseal(escape), INDEX_VERIFY_OPTIONS), /Unexpected|unsafe|escape/);
  const missing = clone(index); missing.entries[0].fixturePath = "portfolio/core/launch-studio/versions/0.1.0/synthetic/missing.json";
  assert.throws(() => verifyLaunchIndexDocument(reseal(missing), INDEX_VERIFY_OPTIONS), /does not exist/);
  const reportSubstitution = clone(index); reportSubstitution.syntheticSession.reportPath = reportSubstitution.entries[0].fixturePath;
  assert.throws(() => verifyLaunchIndexDocument(reseal(reportSubstitution), INDEX_VERIFY_OPTIONS),
    /successor substituted immutable syntheticSession/);
  for (const mutate of [
    (copy) => { copy.engine.stateCount = 1; },
    (copy) => { copy.profiles[0] = "Bogus"; },
    (copy) => { copy.sourceBoundary = ["elsewhere/**"]; },
    (copy) => { copy.engine.runtimeModules[0].sha256 = "0".repeat(64); },
    (copy) => { copy.engine.coreDependencies[3].sha256 = "0".repeat(64); },
    (copy) => { copy.profileCatalog.sha256 = "0".repeat(64); }
  ]) {
    const changed = clone(index); mutate(changed);
    assert.throws(() => verifyLaunchIndexDocument(reseal(changed), INDEX_VERIFY_OPTIONS), /substituted|digest mismatch|const 29|must equal const/);
  }
  const temp = createIndexSchemaFixtureRoot(index, "launch-index-symlink-");
  try {
    const schemaPath = index.indexSchema.path;
    const link = path.join(temp, schemaPath);
    fs.unlinkSync(link);
    fs.symlinkSync(path.join(REPOSITORY_ROOT, schemaPath), link);
    assert.throws(() => verifyLaunchIndexDocument(index, { ...INDEX_VERIFY_OPTIONS, repositoryRoot: temp }), /symbolic link/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  const parentLinkRoot = tempRoot("launch-index-parent-link-");
  try {
    const realIndexDirectory = path.join(REPOSITORY_ROOT, "portfolio/core/launch-studio/versions/0.1.0/indexes");
    const linkedDirectory = path.join(parentLinkRoot, "linked-indexes");
    fs.symlinkSync(realIndexDirectory, linkedDirectory);
    assert.throws(() => verifyStableIndex({ repositoryRoot: parentLinkRoot, immutableIndexPath: path.join(linkedDirectory, "launch-session-index-0001.json"), stableIndexPath: path.join(parentLinkRoot, "stable.json") }), /symbolic link/);
  } finally { fs.rmSync(parentLinkRoot, { recursive: true, force: true }); }
  for (const names of [["launch-session-index-0002.json"], ["launch-session-index-0001.json", "launch-session-index-0003.json"]]) {
    const numberingRoot = tempRoot("launch-index-numbering-");
    try {
      const indexDirectory = path.join(numberingRoot, "indexes");
      fs.mkdirSync(indexDirectory);
      const sourceIndex = path.join(REPOSITORY_ROOT, "portfolio/core/launch-studio/versions/0.1.0/indexes/launch-session-index-0001.json");
      for (const name of names) fs.copyFileSync(sourceIndex, path.join(indexDirectory, name));
      const stableCopy = path.join(numberingRoot, "stable.json");
      fs.copyFileSync(sourceIndex, stableCopy);
      assert.throws(() => verifyStableIndex({ repositoryRoot: numberingRoot, immutableIndexPath: path.join(indexDirectory, names.at(-1)), stableIndexPath: stableCopy }), /start at 0001 and remain contiguous/);
    } finally { fs.rmSync(numberingRoot, { recursive: true, force: true }); }
  }
  const integrityFixture = createLaunchIndexFixtureRoot("launch-index-full-integrity-");
  try {
    const { root: integrityRoot, verificationOptions } = integrityFixture;
    assert.equal(verifyStableIndex(verificationOptions).valid, true);

    const schemaPath = path.join(integrityRoot, index.indexSchema.path);
    const immutablePath = path.join(integrityRoot, launchIndexPath(4));
    const originalSchemaBytes = fs.readFileSync(schemaPath);
    const originalImmutableBytes = fs.readFileSync(immutablePath);
    const alteredSchema = JSON.parse(originalSchemaBytes);
    alteredSchema.$comment = "synthetic historical schema-binding substitution";
    const alteredSchemaBytes = `${canonicalize(alteredSchema)}\n`;
    fs.writeFileSync(schemaPath, alteredSchemaBytes);
    const shiftedLatest = clone(index);
    shiftedLatest.indexSchema.sha256 = sha256Bytes(alteredSchemaBytes);
    const sealedShiftedLatest = sealIndex(shiftedLatest);
    writeCanonicalJson(integrityRoot, launchIndexPath(4), sealedShiftedLatest);
    writeCanonicalJson(integrityRoot, stableLaunchIndexPath, sealedShiftedLatest);
    assert.throws(() => verifyStableIndex(verificationOptions),
      /index schema digest mismatch for exact recorded binding/iu);
    fs.writeFileSync(schemaPath, originalSchemaBytes);
    fs.writeFileSync(immutablePath, originalImmutableBytes);
    fs.writeFileSync(integrityFixture.stablePath, originalImmutableBytes);
    assert.equal(verifyStableIndex(verificationOptions).valid, true);

    const validatorPath = path.join(integrityRoot, "portfolio/core/lib/validators.mjs");
    fs.appendFileSync(validatorPath, "\n// synthetic mutation\n");
    assert.throws(() => verifyStableIndex(verificationOptions), /transitive Core dependency digest mismatch/);
    fs.copyFileSync(path.join(REPOSITORY_ROOT, "portfolio/core/lib/validators.mjs"), validatorPath);
    for (const field of ["exportManifestPath", "restorationReceiptPath", "timelinePath"]) {
      const artifactPath = path.join(integrityRoot, index.entries[0][field]);
      const originalBytes = fs.readFileSync(artifactPath);
      fs.writeFileSync(artifactPath, "not-json\n");
      assert.throws(() => verifyStableIndex(verificationOptions), /indexed artifact byte hash mismatch|JSON/);
      fs.writeFileSync(artifactPath, originalBytes);
    }
  } finally { fs.rmSync(integrityFixture.root, { recursive: true, force: true }); }
});

test("dependency-pin rollovers preserve the exact four-index chain and reject every rollback or substitution", () => {
  const relativePaths = [1, 2, 3, 4].map(launchIndexPath);
  const absolutePaths = relativePaths.map((relativePath) => path.join(REPOSITORY_ROOT, relativePath));
  const [genesis, firstSuccessor, secondSuccessor, latestSuccessor] =
    absolutePaths.map((indexPath) => readCanonicalJson(indexPath));
  const stablePath = path.join(REPOSITORY_ROOT, stableLaunchIndexPath);

  const immutableIdentities = [
    ["c66011d11ea16f5b12784828761f0f1668c5353b5de03d398336e25e8f60274a",
      "97febc922dc70fca6e488d08cd83f8d6e06ca86de79b3732053e59173e68ee89"],
    ["44d17cdb17fb3d96366f13880f109d6a65534e21aabc812a054bf7ab9ea0383f",
      "f890fc80f851a7dbf4693c482fe84b47d406b0fed40b846c841b8588a8862a04"],
    ["9cb9ec902ddea6fbb6f0d410667a3cfbd8fbff4d6e789d4844d6956e25357960",
      "71e96c08c1cca497b8929a3c265817fa20a533833d7dca57e79e3f7ef99f4102"],
    ["251b792c3f6be8e4c15779c32f122c20ddfb2a96c9fdd6c7d1d92c484d6d104b",
      "a0f33f7c59e1f43d67351972cd9caf3f02767c6938fb84744cb280f89d49ce67"]
  ];
  for (const [offset, indexPath] of absolutePaths.entries()) {
    assert.equal(sha256Bytes(fs.readFileSync(indexPath)), immutableIdentities[offset][0]);
    assert.equal([genesis, firstSuccessor, secondSuccessor, latestSuccessor][offset].indexHash,
      immutableIdentities[offset][1]);
  }

  assert.equal(genesis.previousIndexPath, null);
  assert.equal(genesis.previousIndexHash, null);
  for (const offset of [1, 2, 3]) {
    const previous = [genesis, firstSuccessor, secondSuccessor][offset - 1];
    const current = [firstSuccessor, secondSuccessor, latestSuccessor][offset - 1];
    assert.equal(current.previousIndexPath, relativePaths[offset - 1]);
    assert.equal(current.previousIndexHash, previous.indexHash);
    assert.equal(current.successorMode, "dependency-pin-rollover");
    assert.deepEqual(current.entries, previous.entries);
  }

  const legacySchemaBinding = {
    path: "portfolio/core/launch-studio/versions/0.1.0/schemas/launch-session-index.schema.json",
    sha256: "0eda0a38b9b91c6009aa0072f0fe3e2a7d1c8a0fd073440aa829571a1cd10853"
  };
  const currentSchemaBinding = {
    path: "portfolio/core/launch-studio/versions/0.2.0/schemas/launch-session-index.schema.json",
    sha256: "5457c18ee1619ca8a391ce4103ead75111e726d445d166324a6b02b42c725f05"
  };
  assert.deepEqual([genesis, firstSuccessor, secondSuccessor, latestSuccessor].map(indexSchemaBinding),
    [legacySchemaBinding, currentSchemaBinding, currentSchemaBinding, currentSchemaBinding]);
  assert.equal(fs.readFileSync(stablePath).equals(fs.readFileSync(absolutePaths[2])), false);
  assert.equal(fs.readFileSync(stablePath).equals(fs.readFileSync(absolutePaths[3])), true);

  const stableVerification = verifyStableIndex(INDEX_VERIFY_OPTIONS);
  assert.equal(stableVerification.valid, true);
  assert.equal(stableVerification.latestIndexPath, absolutePaths[3]);
  assert.equal(stableVerification.fileSha256, immutableIdentities[3][0]);

  const handoffChanges = secondSuccessor.engine.coreDependencies.filter((entry, offset) =>
    entry.sha256 !== firstSuccessor.engine.coreDependencies[offset].sha256);
  assert.deepEqual(handoffChanges, [{
    path: "portfolio/core/lib/handoff-ledger.mjs",
    sha256: "41709cfecfcab62cf393d7490e0e41729ca748d7c6cae739594e7816d4f789a9"
  }]);
  const latestChangedTopLevelFields = Object.keys(latestSuccessor).filter((key) =>
    canonicalize(latestSuccessor[key]) !== canonicalize(secondSuccessor[key])).sort();
  assert.deepEqual(latestChangedTopLevelFields,
    ["createdAt", "engine", "indexHash", "indexId", "previousIndexHash", "previousIndexPath"]);
  assert.deepEqual(Object.keys(latestSuccessor.engine).filter((key) =>
    canonicalize(latestSuccessor.engine[key]) !== canonicalize(secondSuccessor.engine[key])),
  ["runtimeModules"]);
  const replayChanges = latestSuccessor.engine.runtimeModules.filter((entry, offset) =>
    canonicalize(entry) !== canonicalize(secondSuccessor.engine.runtimeModules[offset]));
  assert.deepEqual(replayChanges, [{
    path: "portfolio/core/launch-studio/versions/0.1.0/runtime/replay.mjs",
    sha256: sha256Bytes(fs.readFileSync(path.join(REPOSITORY_ROOT,
      "portfolio/core/launch-studio/versions/0.1.0/runtime/replay.mjs")))
  }]);
  assert.deepEqual(latestSuccessor.engine.coreDependencies, secondSuccessor.engine.coreDependencies);
  assert.equal(latestSuccessor.rawPrivateDataAllowedInCore, false);
  assert.equal(latestSuccessor.personalChatGptMemoryIsSharedTruth, false);
  assert.equal(latestSuccessor.standingConsequentialAuthority, false);

  const mixed = clone(latestSuccessor);
  mixed.successorMode = "session-append";
  assert.throws(() => verifyLaunchIndexDocument(sealIndex(mixed), INDEX_VERIFY_OPTIONS), /mixed session and dependency-pin changes/);

  for (const mutate of [
    (copy) => { copy.engine.coreDependencies.pop(); },
    (copy) => { copy.engine.coreDependencies[1] = clone(copy.engine.coreDependencies[0]); },
    (copy) => { copy.engine.coreDependencies[0].path = "portfolio/core/lib/substituted.mjs"; }
  ]) {
    const invalid = clone(latestSuccessor);
    mutate(invalid);
    assert.throws(() => verifyLaunchIndexDocument(sealIndex(invalid), INDEX_VERIFY_OPTIONS),
      /too few|unique|removed|duplicated|substituted|cardinality|path order/iu);
  }

  const rollback = clone(latestSuccessor);
  rollback.indexId = "launch_studio_index_0005";
  rollback.createdAt = "2026-08-29T14:36:30.000Z";
  rollback.previousIndexPath = launchIndexPath(4);
  rollback.previousIndexHash = latestSuccessor.indexHash;
  rollback.engine.runtimeModules.find(({ path: dependencyPath }) =>
    dependencyPath.endsWith("/replay.mjs")).sha256 =
      secondSuccessor.engine.runtimeModules.find(({ path: dependencyPath }) =>
        dependencyPath.endsWith("/replay.mjs")).sha256;
  assert.throws(() => verifyLaunchIndexDocument(sealIndex(rollback), INDEX_VERIFY_OPTIONS),
    /dependency pin rollback/);

  const schemaPathSubstitution = clone(latestSuccessor);
  schemaPathSubstitution.indexSchema.path = "../launch-session-index.schema.json";
  assert.throws(() => verifyLaunchIndexDocument(sealIndex(schemaPathSubstitution), INDEX_VERIFY_OPTIONS),
    /schema path substitution/);
  const schemaRollback = clone(latestSuccessor);
  schemaRollback.indexSchema = clone(legacySchemaBinding);
  assert.throws(() => verifyLaunchIndexDocument(sealIndex(schemaRollback), INDEX_VERIFY_OPTIONS),
    /schema path substitution|schema binding rollback/);
  assert.throws(() => verifyLaunchIndexDocument({ ...latestSuccessor, indexHash: "0".repeat(64) }, INDEX_VERIFY_OPTIONS),
    /index hash mismatch/);
});

test("export rejects traversal, duplicate paths, tamper, path escape, and symbolic links", () => {
  assert.throws(() => buildExportManifest([{ path: "../escape", bytes: "x" }], fixture.exportMetadata), /unsafe|segment/);
  assert.throws(() => buildExportManifest([{ path: "a", bytes: "x" }, { path: "a", bytes: "y" }], fixture.exportMetadata), /Duplicate/);
  const derived = deriveSyntheticOutputs(fixture, events);
  const privateFiles = derived.exportFiles.map((entry) => ({ ...entry }));
  privateFiles.find((entry) => entry.path.endsWith("REPORT.md")).bytes += `\n${["gh", "p_", "A".repeat(24)].join("")}\n`;
  assert.throws(() => buildExportManifest(privateFiles, fixture.exportMetadata), /high-risk GitHub token/);
  const piiFiles = derived.exportFiles.map((entry) => ({ ...entry }));
  const fixtureEntry = piiFiles.find((entry) => entry.path === "session/fixture.json");
  const finalEntry = piiFiles.find((entry) => entry.path === "session/final.json");
  const piiFixture = JSON.parse(fixtureEntry.bytes);
  piiFixture.contextPack.unknowns.push(["123", "45", "6789"].join("-"));
  fixtureEntry.bytes = `${canonicalize(piiFixture)}\n`;
  const piiFinal = JSON.parse(finalEntry.bytes);
  piiFinal.fixtureHash = sha256Canonical(piiFixture);
  finalEntry.bytes = `${canonicalize(piiFinal)}\n`;
  assert.throws(() => buildExportManifest(piiFiles, fixture.exportMetadata), /Social Security number/);
  assert.throws(() => assertSanitizedSyntheticText(["123", "45", "6789"].join("-")), /Social Security number/);
  assert.throws(() => buildExportManifest([...derived.exportFiles, { path: "session/extra.json", bytes: "{}\n" }], fixture.exportMetadata), /exact approved synthetic artifact set/);
  assertSanitizedSyntheticText(["git", "github.com:owner/repository.git"].join("@"));
  assert.throws(() => assertSanitizedSyntheticText(["someone", "github.com"].join("@")), /email address/);
  const root = tempRoot("launch-export-negative-");
  try {
    const exportDir = path.join(root, "export");
    writeExportBundle(exportDir, derived.exportFiles, derived.exportManifest, { trustedBaseDirectory: root });
    fs.appendFileSync(path.join(exportDir, derived.exportManifest.files[0].path), "tamper");
    assert.throws(() => verifyExportDirectory(exportDir, { trustedBaseDirectory: root }), /integrity/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  const linkRoot = tempRoot("launch-export-link-");
  try {
    const exportDir = path.join(linkRoot, "export");
    writeExportBundle(exportDir, derived.exportFiles, derived.exportManifest, { trustedBaseDirectory: linkRoot });
    fs.symlinkSync(path.join(linkRoot, "outside"), path.join(exportDir, "escape-link"));
    assert.throws(() => verifyExportDirectory(exportDir, { trustedBaseDirectory: linkRoot }), /symbolic link/);
  } finally { fs.rmSync(linkRoot, { recursive: true, force: true }); }
  const ancestorRoot = tempRoot("launch-export-ancestor-link-");
  try {
    const outside = path.join(ancestorRoot, "outside"); fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(ancestorRoot, "link"));
    assert.throws(() => writeExportBundle(path.join(ancestorRoot, "link/export"), derived.exportFiles, derived.exportManifest, { trustedBaseDirectory: ancestorRoot }), /symbolic-link ancestor/);
  } finally { fs.rmSync(ancestorRoot, { recursive: true, force: true }); }
});

test("clean export restoration and replay preserve state, events, artifacts, and outputs", () => {
  const first = verifyCommittedSynthetic();
  const second = verifyCommittedSynthetic();
  assert.equal(first.replayReceipt.receiptHash, second.replayReceipt.receiptHash);
  assert.equal(verifyExportRestoreReplay().valid, true);
  const derived = deriveSyntheticOutputs(fixture, events);
  const root = tempRoot("launch-export-restore-");
  try {
    const exportDir = path.join(root, "export"); const restoreDir = path.join(root, "restore");
    writeExportBundle(exportDir, derived.exportFiles, derived.exportManifest, { trustedBaseDirectory: root });
    const restored = restoreExportDirectory(exportDir, restoreDir, { exportTrustedBaseDirectory: root, restoreTrustedBaseDirectory: root });
    assert.equal(restored.manifest.manifestHash, derived.exportManifest.manifestHash);
    assert.throws(() => restoreExportDirectory(exportDir, restoreDir, { exportTrustedBaseDirectory: root, restoreTrustedBaseDirectory: root }), /must be empty/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("committed fixture, JSONL, report, timeline, receipts, and stable index are exact", () => {
  const committed = verifyCommittedSynthetic();
  assert.equal(committed.finalSession.state, "held");
  assert.equal(committed.exportManifest.files.length, 5);
  assert.equal(committed.replayReceipt.providerCalls, 0);
  assert.equal(committed.replayReceipt.deterministic, true);
  assert.equal(verifyStableIndex(INDEX_VERIFY_OPTIONS).entryCount, 1);
  assert.deepEqual(readCanonicalJsonl(path.join(SYNTHETIC_DIRECTORY, "launch-session-events.jsonl")), events);
  assert.equal(readCanonicalJson(path.join(SYNTHETIC_DIRECTORY, "launch-session-final.json")).externalEffects.length, 0);
});

test("every synthetic authority/effect assertion remains default deny", () => {
  let authorityTrue = 0;
  let nonemptyEffects = 0;
  function walk(value) {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== "object") return;
    if (value.consequentialAuthorityGranted === true) authorityTrue += 1;
    if (Array.isArray(value.externalEffects) && value.externalEffects.length > 0) nonemptyEffects += 1;
    Object.values(value).forEach(walk);
  }
  walk(fixture); walk(events); walk(deriveSyntheticOutputs(fixture, events));
  for (const number of [1, 2, 3, 4]) {
    walk(readCanonicalJson(path.join(REPOSITORY_ROOT, launchIndexPath(number))));
  }
  assert.equal(authorityTrue, 0);
  assert.equal(nonemptyEffects, 0);
  assert.equal(fixture.executorWorkOrder.executed, false);
  assert.equal(fixture.previewProposal.previewCreated, false);
});
