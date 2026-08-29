import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertSha256, canonicalize, sha256Bytes, sha256Canonical } from "../../../../lib/canonical-json.mjs";
import { validateJsonSchema } from "../../../../lib/validators.mjs";
import {
  IMMUTABLE_INDEX_PATH, REPOSITORY_ROOT, SCHEMA_FILES, STABLE_INDEX_PATH, SYNTHETIC_DIRECTORY,
  readCanonicalJson, readCanonicalJsonl, resolveRegularRepositoryFile, validateContract,
  validateSchemaCatalog, assertTruthSeparation, assertAuthorityReference, assertOwnerEventChain,
  assertRecordHash, assertFruitObservation, assertBuildCharter, assertExecutorWorkOrder,
  assertUnderstandingCheck, assertPreviewReceipt, parseCanonicalTimestamp
} from "./contracts.mjs";
import { reconstructSession, verifySessionEvents } from "./session-engine.mjs";
import { buildExportManifest, restoreExportDirectory, writeExportBundle } from "./session-archive.mjs";

const MODULE_PATH = fileURLToPath(import.meta.url);

export const SYNTHETIC_FILES = Object.freeze({
  fixture: "owner-only-retreat-session.json",
  events: "launch-session-events.jsonl",
  final: "launch-session-final.json",
  exportManifest: "export-manifest.json",
  restorationReceipt: "restoration-receipt.json",
  replayReceipt: "replay-receipt.json",
  timeline: "material-progress-timeline.jsonl",
  report: "SYNTHETIC_SESSION_REPORT.md"
});

export function loadSyntheticInputs(directory = SYNTHETIC_DIRECTORY) {
  return {
    fixture: readCanonicalJson(path.join(directory, SYNTHETIC_FILES.fixture)),
    events: readCanonicalJsonl(path.join(directory, SYNTHETIC_FILES.events))
  };
}

export function renderTimeline(events) {
  return events.map((event) => ({
    schemaVersion: "0.1.0",
    sequence: event.sequence,
    recordedAt: event.recordedAt,
    eventType: event.eventType,
    state: event.toState,
    conciseStatus: event.conciseStatus,
    materialDelta: event.materialDelta,
    evidenceIds: event.evidence.map((entry) => entry.evidenceId),
    nextOwnerDecision: event.nextOwnerDecision,
    consequentialAuthorityGranted: false
  }));
}

export function renderReport(fixture, finalSession, events, manifest) {
  const first = fixture.ownerEvents[0];
  const successor = fixture.ownerEvents[1];
  return `# Clover Launch Studio Synthetic Session Report\n\n` +
    `Status: **HELD — awaiting real execution authority**\n\n` +
    `- Session: \`${fixture.sessionId}\`\n` +
    `- Workspace/project: \`${fixture.workspaceId}\` / \`${fixture.projectId}\`\n` +
    `- Profile: \`${fixture.profileId}\`\n` +
    `- Final state/version: \`${finalSession.state}\` / \`${finalSession.sessionVersion}\`\n` +
    `- Events: ${events.length}\n` +
    `- Original transcript bytes/hash: ${first.transcriptUtf8Bytes} / \`${first.transcriptSha256}\`\n` +
    `- Edited transcript bytes/hash: ${successor.transcriptUtf8Bytes} / \`${successor.transcriptSha256}\`\n` +
    `- Build Charter: \`${fixture.buildCharter.recordId}\`\n` +
    `- Proposed preview external effects: ${fixture.previewProposal.externalEffects.length}\n` +
    `- Export ID: \`${manifest.exportId}\`\n` +
    `- Personal ChatGPT memory stored or shared: no\n` +
    `- Consequential authority granted: no\n\n` +
    `## Intended fruit\n\n${fixture.predictedFruit.statement}\n\n` +
    `This record is synthetic, text-only, preview-proposal-only, and performs no worktree, provider build, deployment, message, purchase, or other external effect.\n`;
}

function exportFiles(fixture, events, finalSession, timeline, report) {
  return [
    { path: "session/fixture.json", bytes: `${canonicalize(fixture)}\n` },
    { path: "session/events.jsonl", bytes: `${events.map(canonicalize).join("\n")}\n` },
    { path: "session/final.json", bytes: `${canonicalize(finalSession)}\n` },
    { path: "session/material-progress-timeline.jsonl", bytes: `${timeline.map(canonicalize).join("\n")}\n` },
    { path: "session/SYNTHETIC_SESSION_REPORT.md", bytes: report }
  ];
}

export function deriveSyntheticOutputs(fixture, events) {
  validateContract("synthetic-session-fixture.schema.json", fixture, "synthetic fixture");
  assertFixtureGraph(fixture, events);
  assertOwnerEventChain(fixture.ownerEvents);
  assertUnderstandingCheck(fixture.understandingCheck, { ownerEvent: fixture.ownerEvents[1] });
  validateContract("launch-context-pack.schema.json", fixture.contextPack, "Context Pack");
  validateContract("impact-scan.schema.json", fixture.impactScan, "Impact Scan");
  validateContract("acceptance-contract.schema.json", fixture.acceptanceContract, "Acceptance Contract");
  assertBuildCharter(fixture.buildCharter);
  assertExecutorWorkOrder(fixture.executorWorkOrder);
  assertPreviewReceipt(fixture.previewProposal);
  assertFruitObservation(fixture.predictedFruit);
  for (const record of [fixture.contextPack, fixture.impactScan, fixture.acceptanceContract, fixture.buildCharter, fixture.executorWorkOrder, fixture.previewProposal]) assertRecordHash(record);
  assertTruthSeparation(fixture.understandingDelta);
  assertAuthorityReference(fixture.charterAuthorityReference);
  assertAuthorityReference(fixture.executionAuthorityReference);
  if (fixture.buildCharter.contextPackHash !== sha256Canonical(fixture.contextPack) ||
      fixture.buildCharter.impactScanHash !== sha256Canonical(fixture.impactScan) ||
      fixture.buildCharter.acceptanceContractHash !== sha256Canonical(fixture.acceptanceContract)) {
    throw new Error("Build Charter dependency hash substitution detected");
  }
  if (fixture.previewProposal.externalEffects.length !== 0 || fixture.previewProposal.previewCreated !== false) throw new Error("Phase A cannot create a preview");
  const replay = verifySessionEvents(events, { budget: fixture.sessionBudget });
  const finalSession = reconstructSession(fixture, events);
  if (finalSession.state !== "held") throw new Error("Synthetic Phase A session must finish held");
  const timeline = renderTimeline(events);
  const report = renderReport(fixture, finalSession, events, fixture.exportMetadata);
  const files = exportFiles(fixture, events, finalSession, timeline, report);
  const { manifest } = buildExportManifest(files, fixture.exportMetadata);
  const restorationUnsigned = {
    documentType: "clover-launch-session-restoration-receipt",
    schemaVersion: "0.1.0",
    restorationId: fixture.restorationId,
    exportId: manifest.exportId,
    sessionId: fixture.sessionId,
    restoredAt: fixture.restoredAt,
    sourceManifestHash: manifest.manifestHash,
    restoredManifestHash: manifest.manifestHash,
    sourceStateHash: sha256Canonical(finalSession),
    restoredStateHash: sha256Canonical(finalSession),
    sourceEventStreamHash: sha256Bytes(`${events.map(canonicalize).join("\n")}\n`),
    restoredEventStreamHash: sha256Bytes(`${events.map(canonicalize).join("\n")}\n`),
    identityEqual: true,
    cleanDestination: true,
    privateDataAccessed: false,
    externalEffects: [],
    synthetic: true,
    consequentialAuthorityGranted: false
  };
  const restorationReceipt = { ...restorationUnsigned, receiptHash: sha256Canonical(restorationUnsigned) };
  const replayUnsigned = {
    documentType: "clover-launch-studio-synthetic-replay-receipt",
    schemaVersion: "0.1.0",
    replayId: fixture.replayId,
    sessionId: fixture.sessionId,
    generatedAt: fixture.replayGeneratedAt,
    finalState: finalSession.state,
    finalSessionHash: sha256Canonical(finalSession),
    eventCount: events.length,
    eventStreamHash: restorationReceipt.sourceEventStreamHash,
    headEventHash: replay.headEventHash,
    timelineHash: sha256Bytes(`${timeline.map(canonicalize).join("\n")}\n`),
    reportHash: sha256Bytes(report),
    exportManifestHash: manifest.manifestHash,
    restorationReceiptHash: restorationReceipt.receiptHash,
    stateEqualAfterRestore: true,
    eventsEqualAfterRestore: true,
    artifactsEqualAfterRestore: true,
    outputsEqualAfterRestore: true,
    deterministic: true,
    privateDataAccessed: false,
    providerCalls: 0,
    externalEffects: [],
    consequentialAuthorityGranted: false
  };
  const replayReceipt = { ...replayUnsigned, receiptHash: sha256Canonical(replayUnsigned) };
  return { finalSession, timeline, report, exportFiles: files, exportManifest: manifest, restorationReceipt, replayReceipt };
}

export function assertFixtureGraph(fixture, events = []) {
  validateContract("synthetic-session-fixture.schema.json", fixture, "synthetic fixture graph");
  const [original, edited] = fixture.ownerEvents;
  const exactIdea = "Build a tiny app that helps a fictional retreat guest see today’s activities and choose one next activity.";
  if (original.modality !== "text" || original.transcript !== exactIdea || !edited.transcript.startsWith(exactIdea) || edited.modality !== "text") throw new Error("Synthetic fixture substituted the exact fictional owner-only idea or text-only modality");
  const sessionRecords = [fixture.understandingCheck, fixture.contextPack, fixture.impactScan, fixture.acceptanceContract, fixture.buildCharter, fixture.executorWorkOrder, fixture.previewProposal, fixture.predictedFruit];
  for (const record of sessionRecords) if (record.sessionId !== fixture.sessionId) throw new Error(`${record.documentType} session identity substitution detected`);
  for (const ownerEvent of fixture.ownerEvents) if (ownerEvent.workspaceId !== fixture.workspaceId || ownerEvent.projectId !== fixture.projectId) throw new Error("Owner Event workspace/project substitution detected");
  for (const event of events) if (canonicalize(event.ownerPrincipal) !== canonicalize(edited.actor)) throw new Error("Session event Owner principal does not bind the immutable synthetic Owner Event actor");
  if (fixture.understandingDelta.workspaceId !== fixture.workspaceId || fixture.understandingDelta.projectId !== fixture.projectId || fixture.understandingDelta.participantId !== edited.actor.participantId) throw new Error("Understanding Delta scope substitution detected");
  if (fixture.understandingCheck.ownerEventId !== edited.recordId || fixture.understandingCheck.ownerEventHash !== sha256Canonical(edited)) throw new Error("Understanding Check does not bind the exact edited Owner Event");
  if (parseCanonicalTimestamp(fixture.understandingCheck.confirmedAt, "Understanding Check confirmedAt") < parseCanonicalTimestamp(edited.capturedAt, "edited Owner Event capturedAt")) throw new Error("Understanding Check confirmation predates the referenced edited Owner Event");
  if (fixture.contextPack.targetProject !== fixture.projectId || fixture.contextPack.exactOwnerRequest !== edited.transcript || !fixture.contextPack.sources.some((source) => canonicalize(source) === canonicalize(edited.sourcePointer))) throw new Error("Context Pack owner request/source binding failed");
  if (fixture.impactScan.contextPackHash !== sha256Canonical(fixture.contextPack)) throw new Error("Impact Scan does not bind the Context Pack");
  if (fixture.buildCharter.contextPackHash !== sha256Canonical(fixture.contextPack) || fixture.buildCharter.impactScanHash !== sha256Canonical(fixture.impactScan) || fixture.buildCharter.acceptanceContractHash !== sha256Canonical(fixture.acceptanceContract) || fixture.buildCharter.budgetId !== fixture.sessionBudget.recordId || fixture.buildCharter.charterApprovalAuthorityReferenceId !== fixture.charterAuthorityReference.referenceId) throw new Error("Build Charter graph binding failed");
  const charterBinding = { boundRecordType: "build-charter", boundRecordId: fixture.buildCharter.recordId, boundRecordHash: fixture.buildCharter.recordHash, boundSessionId: fixture.sessionId, boundProjectId: fixture.projectId, boundRepository: null, boundBaseCommit: null, boundAllowedPathsHash: sha256Canonical(fixture.buildCharter.allowedPaths), boundProhibitedEffectsHash: sha256Canonical(fixture.buildCharter.prohibitedEffects) };
  assertAuthorityReference(fixture.charterAuthorityReference, { expectedBinding: charterBinding });
  const exactSyntheticCharterReference = { referenceId: "authority_ref_synthetic_charter_001", actionEnvelopeId: "handoff_action_synthetic_unapproved_001", actionEnvelopePath: "portfolio/core/handoff/versions/0.1.0/synthetic-proposals/launch-studio-action-envelope.json", actionEnvelopeHash: sha256Bytes("synthetic non-authorizing Handoff Action Envelope proposal"), branchCapsuleId: "handoff_capsule_synthetic_unapproved_001", branchCapsulePath: "portfolio/core/handoff/versions/0.1.0/synthetic-proposals/launch-studio-branch-capsule.json", branchCapsuleHash: sha256Bytes("synthetic non-authorizing branch capsule proposal"), lifecycleIndexPath: "portfolio/core/handoff/versions/0.1.0/synthetic-proposals/launch-studio-lifecycle-index.json", lifecycleIndexHash: sha256Bytes("synthetic non-authorizing lifecycle index proposal") };
  for (const [field, expected] of Object.entries(exactSyntheticCharterReference)) if (fixture.charterAuthorityReference[field] !== expected) throw new Error(`Synthetic Charter authority ${field} substitution detected`);
  if (fixture.syntheticCharterDecision.statement !== "APPROVE BUILD CHARTER" || fixture.syntheticCharterDecision.charterId !== fixture.buildCharter.recordId || fixture.syntheticCharterDecision.charterHash !== fixture.buildCharter.recordHash || canonicalize(fixture.syntheticCharterDecision.actor) !== canonicalize(edited.actor) || fixture.syntheticCharterDecision.synthetic !== true || fixture.syntheticCharterDecision.nonAuthorizing !== true) throw new Error("Synthetic Charter decision is absent, inferred, or substituted");
  const decisionAt = parseCanonicalTimestamp(fixture.syntheticCharterDecision.decidedAt, "synthetic Charter decision time");
  if (decisionAt < parseCanonicalTimestamp(edited.capturedAt, "edited Owner Event time")) throw new Error("Synthetic Charter decision predates the owner request");
  const workOrder = fixture.executorWorkOrder;
  if (workOrder.charterId !== fixture.buildCharter.recordId || workOrder.workspaceId !== fixture.workspaceId || workOrder.projectId !== fixture.projectId || workOrder.contextPackHash !== sha256Canonical(fixture.contextPack) || workOrder.impactScanHash !== sha256Canonical(fixture.impactScan) || workOrder.sessionUsageCeilingId !== fixture.sessionBudget.recordId || workOrder.handoffAuthorityReferenceId !== fixture.executionAuthorityReference.referenceId || `${workOrder.repository}@${workOrder.baseCommit}` !== fixture.buildCharter.sourceAnchor || canonicalize(workOrder.allowedPaths) !== canonicalize(fixture.buildCharter.allowedPaths) || canonicalize(workOrder.prohibitedEffects) !== canonicalize(fixture.buildCharter.prohibitedEffects) || canonicalize(workOrder.deliverables) !== canonicalize(fixture.buildCharter.deliverables) || canonicalize(workOrder.testPlan) !== canonicalize(fixture.buildCharter.testPlan) || canonicalize(workOrder.progressEventContract) !== canonicalize(fixture.buildCharter.progressReportingContract) || canonicalize(workOrder.stopConditions) !== canonicalize(fixture.buildCharter.stopConditions) || workOrder.repairLoopBudget !== fixture.buildCharter.repairLoopLimit || workOrder.repairLoopBudget > fixture.sessionBudget.maximumRepairLoops) throw new Error("Executor Work Order widens or substitutes the Build Charter graph binding");
  const executionBinding = { boundRecordType: "executor-work-order", boundRecordId: workOrder.recordId, boundRecordHash: workOrder.recordHash, boundSessionId: fixture.sessionId, boundProjectId: fixture.projectId, boundRepository: workOrder.repository, boundBaseCommit: workOrder.baseCommit, boundAllowedPathsHash: sha256Canonical(workOrder.allowedPaths), boundProhibitedEffectsHash: sha256Canonical(workOrder.prohibitedEffects) };
  assertAuthorityReference(fixture.executionAuthorityReference, { expectedBinding: executionBinding });
  const exactSyntheticExecutionReference = { referenceId: "authority_ref_synthetic_execution_001", actionEnvelopeId: "handoff_action_synthetic_execution_unapproved_001", actionEnvelopePath: "portfolio/core/handoff/versions/0.1.0/synthetic-proposals/launch-studio-execution-action-envelope.json", actionEnvelopeHash: sha256Bytes("synthetic non-authorizing executor Action Envelope proposal"), branchCapsuleId: "handoff_capsule_synthetic_execution_unapproved_001", branchCapsulePath: "portfolio/core/handoff/versions/0.1.0/synthetic-proposals/launch-studio-execution-branch-capsule.json", branchCapsuleHash: sha256Bytes("synthetic non-authorizing executor branch capsule proposal"), lifecycleIndexPath: "portfolio/core/handoff/versions/0.1.0/synthetic-proposals/launch-studio-execution-lifecycle-index.json", lifecycleIndexHash: sha256Bytes("synthetic non-authorizing executor lifecycle index proposal") };
  for (const [field, expected] of Object.entries(exactSyntheticExecutionReference)) if (fixture.executionAuthorityReference[field] !== expected) throw new Error(`Synthetic execution authority ${field} substitution detected`);
  if (fixture.executionAuthorityReference.referenceId === fixture.charterAuthorityReference.referenceId || fixture.executionAuthorityReference.scope !== "executor-work-order" || fixture.executionAuthorityReference.nonAuthorizing !== true) throw new Error("Charter decision and execution authority were conflated");
  if (fixture.exportMetadata.sessionId !== fixture.sessionId || fixture.exportMetadata.workspaceId !== fixture.workspaceId || fixture.exportMetadata.projectId !== fixture.projectId) throw new Error("Export metadata scope substitution detected");
  const exportAt = parseCanonicalTimestamp(fixture.exportMetadata.createdAt, "export metadata createdAt");
  const restoredAt = parseCanonicalTimestamp(fixture.restoredAt, "restoration time");
  const replayAt = parseCanonicalTimestamp(fixture.replayGeneratedAt, "replay generatedAt");
  if (!(exportAt < restoredAt && restoredAt < replayAt)) throw new Error("Export, restoration, and replay chronology is invalid");
  const acceptanceIds = fixture.acceptanceContract.tests.map((entry) => entry.testId);
  const previewIds = fixture.previewProposal.acceptanceResults.map((entry) => entry.testId);
  const bytewise = (left, right) => left < right ? -1 : left > right ? 1 : 0;
  if (new Set(acceptanceIds).size !== acceptanceIds.length || new Set(previewIds).size !== previewIds.length || acceptanceIds.length !== previewIds.length || canonicalize([...acceptanceIds].sort(bytewise)) !== canonicalize([...previewIds].sort(bytewise))) throw new Error("Preview acceptance results do not bind the exact Acceptance Contract tests");
  for (const result of fixture.previewProposal.acceptanceResults) {
    if (!fixture.previewProposal.previewCreated && (result.status !== "not-run" || result.evidenceHash !== null)) throw new Error("Uncreated preview cannot claim acceptance evidence");
    if (fixture.previewProposal.previewCreated && (result.status === "not-run" || result.evidenceHash === null)) throw new Error("Created preview acceptance result lacks exact evidence");
  }
  const ownerById = new Map(fixture.ownerEvents.map((ownerEvent) => [ownerEvent.recordId, ownerEvent]));
  for (const item of fixture.understandingDelta.items) {
    const ownerEvent = ownerById.get(item.provenanceOwnerEventId);
    if (!ownerEvent || item.provenanceOwnerEventHash !== sha256Canonical(ownerEvent) || canonicalize(item.provenance) !== canonicalize(ownerEvent.sourcePointer) || ownerEvent.actor.participantId !== fixture.understandingDelta.participantId) throw new Error("Understanding Delta item provenance is unreferenced or substituted");
    if (fixture.understandingDelta.proposedSharedProjectProjections.includes(item.itemId) && !["project-members", "workspace-members", "public-approved"].includes(item.proposedAudience)) throw new Error("Proposed shared projection has a participant-private or invalid audience");
    if (fixture.understandingDelta.rejectedFromDurablePromotion.includes(item.itemId) && item.promotionStatus !== "rejected") throw new Error("Rejected durable promotion lacks rejected item status");
  }
  if (fixture.externalEffects.length !== 0 || fixture.previewProposal.externalEffects.length !== 0) throw new Error("Synthetic fixture contains an external effect");
  if (events.length > 0) {
    const exactEarlyEvidence = [
      ["evidence_session_capture_001", sha256Canonical(original)],
      ["evidence_owner_edit_001", sha256Canonical(edited)],
      ["evidence_understanding_001", sha256Canonical(fixture.understandingCheck)],
      ["evidence_context_001", sha256Canonical(fixture.contextPack)],
      ["evidence_impact_001", sha256Canonical(fixture.impactScan)],
      ["evidence_charter_001", fixture.buildCharter.recordHash]
    ];
    for (const [index, [evidenceId, contentHash]] of exactEarlyEvidence.entries()) {
      const evidence = events[index]?.evidence;
      if (!Array.isArray(evidence) || evidence.length !== 1 || evidence[0].evidenceId !== evidenceId || evidence[0].contentHash !== contentHash || evidence[0].sourceType !== "synthetic-core-record") throw new Error(`Synthetic early event ${index + 1} evidence is not bound to the exact fixture record`);
    }
    const charterEvents = events.filter((event) => event.toState === "charter_approved");
    if (charterEvents.length !== 1) throw new Error("Synthetic event stream lacks exactly one Charter decision");
    const charterEvent = charterEvents[0];
    const decisionBinding = { decisionId: fixture.syntheticCharterDecision.decisionId, statement: fixture.syntheticCharterDecision.statement, boundRecordId: fixture.syntheticCharterDecision.charterId, boundRecordHash: fixture.syntheticCharterDecision.charterHash, decidedAt: fixture.syntheticCharterDecision.decidedAt, actor: fixture.syntheticCharterDecision.actor, synthetic: true, nonAuthorizing: true };
    if (canonicalize(charterEvent.ownerDecisionBinding) !== canonicalize(decisionBinding) || canonicalize(charterEvent.authorityReference) !== canonicalize(fixture.charterAuthorityReference) || canonicalize(charterEvent.approvedBuildCharter) !== canonicalize(fixture.buildCharter) || !charterEvent.evidence.some((entry) => entry.contentHash === sha256Canonical(decisionBinding)) || !charterEvent.evidence.some((entry) => entry.contentHash === fixture.buildCharter.recordHash)) throw new Error("Synthetic Charter event inferred or substituted its owner decision or approved Charter snapshot");
    const executionEvents = events.filter((event) => ["execution_proposed", "execution_authority_pending"].includes(event.toState) || (event.toState === "held" && event.fromState === "execution_authority_pending"));
    if (executionEvents.length !== 3 || executionEvents.some((event) => canonicalize(event.authorityReference) !== canonicalize(fixture.executionAuthorityReference) || event.executorWorkOrderBinding?.recordHash !== workOrder.recordHash || !event.evidence.some((entry) => entry.contentHash === workOrder.recordHash))) throw new Error("Execution proposal stream does not bind the separate Work Order authority reference");
  }
  if (!fixture.restorationId || !fixture.replayId || !fixture.exportMetadata.exportId) throw new Error("Export/restoration/replay identities are incomplete");
  if (original.recordId === edited.recordId) throw new Error("Owner Event successor identity was reused");
  return true;
}

function assertExactIndexOptions(options, allowed, label) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError(`${label} options must be an object`);
  const unknown = Object.keys(options).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${label} rejects caller-supplied verifier or unknown option ${unknown[0]}`);
}

const INDEX_SCHEMA_PATHS = Object.freeze({
  "0.1.0": "portfolio/core/launch-studio/versions/0.1.0/schemas/launch-session-index.schema.json",
  "0.2.0": "portfolio/core/launch-studio/versions/0.2.0/schemas/launch-session-index.schema.json"
});

function launchIndexSchemaBinding(index) {
  if (index.schemaVersion === "0.1.0") {
    const matches = Array.isArray(index.schemas)
      ? index.schemas.filter((entry) => entry?.path === INDEX_SCHEMA_PATHS["0.1.0"])
      : [];
    if (matches.length !== 1) {
      throw new Error("Launch Studio 0.1.0 index lacks one exact recorded launch-session-index schema binding");
    }
    assertSha256(matches[0].sha256, "Launch Studio 0.1.0 index schema digest");
    return { schemaVersion: index.schemaVersion, path: matches[0].path, sha256: matches[0].sha256 };
  }
  if (index.schemaVersion === "0.2.0") {
    if (!index.indexSchema || typeof index.indexSchema !== "object" || Array.isArray(index.indexSchema) ||
        typeof index.indexSchema.path !== "string") {
      throw new Error("Launch Studio 0.2.0 index lacks an exact indexSchema path and digest binding");
    }
    if (index.indexSchema.path !== INDEX_SCHEMA_PATHS["0.2.0"]) {
      throw new Error("Launch Studio 0.2.0 index schema path substitution detected");
    }
    assertSha256(index.indexSchema.sha256, "Launch Studio 0.2.0 index schema digest");
    return { schemaVersion: index.schemaVersion, path: index.indexSchema.path, sha256: index.indexSchema.sha256 };
  }
  throw new Error(`Unsupported Launch Studio index schema version ${index.schemaVersion}`);
}

function verifyRecordedLaunchSchemas(index, repositoryRoot) {
  const expectedSchemaPaths = new Set(
    SCHEMA_FILES.map((name) => `portfolio/core/launch-studio/versions/0.1.0/schemas/${name}`));
  if (!Array.isArray(index.schemas) || index.schemas.length !== expectedSchemaPaths.size ||
      new Set(index.schemas.map((entry) => entry?.path)).size !== index.schemas.length) {
    throw new Error("Launch Studio schema index cardinality is inconsistent");
  }
  for (const schemaEntry of index.schemas) {
    if (!schemaEntry || !expectedSchemaPaths.delete(schemaEntry.path)) {
      throw new Error(`Unexpected or substituted schema path ${schemaEntry?.path}`);
    }
    assertSha256(schemaEntry.sha256, `Launch Studio schema digest at ${schemaEntry.path}`);
    const bytes = fs.readFileSync(
      resolveRegularRepositoryFile(repositoryRoot, schemaEntry.path, "Launch Studio schema"));
    if (sha256Bytes(bytes) !== schemaEntry.sha256) {
      throw new Error(`Launch Studio schema digest mismatch at ${schemaEntry.path}`);
    }
  }
  if (expectedSchemaPaths.size !== 0) throw new Error("Launch Studio index omits a schema");
}

function sameLaunchIndexSchemaBinding(left, right) {
  return left.schemaVersion === right.schemaVersion && left.path === right.path && left.sha256 === right.sha256;
}

function validateLaunchIndexSchema(index, repositoryRoot) {
  const binding = launchIndexSchemaBinding(index);
  const absoluteSchemaPath = resolveRegularRepositoryFile(repositoryRoot, binding.path, "Launch Studio index schema");
  const schemaBytes = fs.readFileSync(absoluteSchemaPath);
  if (sha256Bytes(schemaBytes) !== binding.sha256) {
    throw new Error(`Launch Studio index schema digest mismatch for exact recorded binding ${binding.path}`);
  }
  const schema = JSON.parse(schemaBytes);
  validateJsonSchema(schema, index, { schemaDirectory: path.dirname(absoluteSchemaPath), label: "Launch Studio index" });
  return binding;
}

function dependencyCatalog(index) {
  return [...index.engine.runtimeModules, ...index.engine.coreDependencies];
}

function cloneDependencyHistory(history = new Map()) {
  return new Map([...history].map(([key, values]) => [key, [...values]]));
}

function assertLaunchIndexSuccessor(previous, current, previousVerification, currentIndexSchemaBinding) {
  if (!current.successorMode) throw new Error("Launch Studio successor mode is required");
  const previousIndexSchemaBinding = previousVerification.indexSchemaBinding;
  const indexSchemaBindingChanged = !sameLaunchIndexSchemaBinding(
    previousIndexSchemaBinding, currentIndexSchemaBinding);
  if (previous.schemaVersion === current.schemaVersion && indexSchemaBindingChanged) {
    throw new Error("Launch Studio same-version successor changed its index schema path or digest binding");
  }
  if (previous.schemaVersion !== current.schemaVersion && !indexSchemaBindingChanged) {
    throw new Error("Launch Studio index schema version changed without a new path and digest binding");
  }
  if (indexSchemaBindingChanged && previousVerification.indexSchemaHistory.some((binding) =>
    sameLaunchIndexSchemaBinding(binding, currentIndexSchemaBinding))) {
    throw new Error("Launch Studio index schema binding rollback detected");
  }
  const previousDependencies = dependencyCatalog(previous);
  const currentDependencies = dependencyCatalog(current);
  if (previousDependencies.length !== currentDependencies.length ||
      previousDependencies.some((entry, offset) => entry.path !== currentDependencies[offset].path)) {
    throw new Error("Launch Studio successor removed, reordered, duplicated, or substituted a dependency path");
  }
  const entriesEqual = canonicalize(previous.entries) === canonicalize(current.entries);
  const entriesAppend = current.entries.length > previous.entries.length &&
    previous.entries.every((entry, offset) => canonicalize(entry) === canonicalize(current.entries[offset]));
  const dependenciesEqual = canonicalize(previousDependencies) === canonicalize(currentDependencies);
  const changedDependencies = currentDependencies.filter((entry, offset) =>
    entry.sha256 !== previousDependencies[offset].sha256);
  if (current.successorMode === "session-append") {
    if (!entriesAppend || !dependenciesEqual || indexSchemaBindingChanged ||
        current.engine.runtimeVersion !== previous.engine.runtimeVersion) {
      throw new Error("Launch Studio session-append successor mixed session and dependency-pin changes");
    }
  } else if (current.successorMode === "dependency-pin-rollover") {
    if (!entriesEqual || (changedDependencies.length === 0 && !indexSchemaBindingChanged)) {
      throw new Error("Launch Studio dependency-pin-rollover successor must preserve sessions and change a dependency pin");
    }
    const history = previousVerification.dependencyHistory;
    for (const changed of changedDependencies) {
      if ((history.get(changed.path) || []).includes(changed.sha256)) {
        throw new Error(`Launch Studio dependency pin rollback detected at ${changed.path}`);
      }
    }
  } else {
    throw new Error(`Unsupported Launch Studio successor mode ${current.successorMode}`);
  }
  for (const field of ["profiles", "profileCatalog", "schemas", "syntheticSession", "sourceBoundary",
    "rawPrivateDataAllowedInCore", "personalChatGptMemoryIsSharedTruth", "standingConsequentialAuthority"]) {
    if (canonicalize(previous[field]) !== canonicalize(current[field])) {
      throw new Error(`Launch Studio successor substituted immutable ${field}`);
    }
  }
}

function verifyLaunchIndexDocumentInternal(index, { repositoryRoot, seenIndexHashes, liveRuntimeDependencyVerification }) {
  verifyRecordedLaunchSchemas(index, repositoryRoot);
  const indexSchemaBinding = validateLaunchIndexSchema(index, repositoryRoot);
  const { indexHash, ...unsigned } = index;
  assertSha256(indexHash, "indexHash");
  if (sha256Canonical(unsigned) !== indexHash) throw new Error("Launch Studio index hash mismatch");
  const indexCreatedAt = parseCanonicalTimestamp(index.createdAt, "Launch Studio index createdAt");
  if (seenIndexHashes.has(indexHash)) throw new Error("Launch Studio index chain contains a cycle");
  seenIndexHashes.add(indexHash);
  if ((index.previousIndexPath === null) !== (index.previousIndexHash === null)) throw new Error("Previous Launch Studio index path/hash pair is incomplete");
  const exactProfiles = ["Idea", "Build", "Repair", "Release", "Improvement", "Strategy", "Collaboration"];
  const exactSourceBoundary = ["portfolio/core/launch-studio/**", "portfolio/core/test/launch-studio-session-engine.test.mjs"];
  const liveDependencyErrors = [];
  if (index.engine.stateCount !== 29 || canonicalize(index.profiles) !== canonicalize(exactProfiles) || canonicalize(index.sourceBoundary) !== canonicalize(exactSourceBoundary)) throw new Error("Launch Studio index engine, profiles, or source boundary was substituted");
  const expectedRuntimePaths = ["contracts.mjs", "replay.mjs", "session-archive.mjs", "session-engine.mjs"].map((name) => `portfolio/core/launch-studio/versions/0.1.0/runtime/${name}`);
  if (index.engine.runtimeModules.length !== expectedRuntimePaths.length || new Set(index.engine.runtimeModules.map((entry) => entry.path)).size !== expectedRuntimePaths.length) throw new Error("Launch Studio runtime module catalog cardinality is inconsistent");
  for (const [offset, runtimePath] of expectedRuntimePaths.entries()) {
    const runtimeEntry = index.engine.runtimeModules[offset];
    if (runtimeEntry.path !== runtimePath) throw new Error("Launch Studio runtime module path order/substitution detected");
    assertSha256(runtimeEntry.sha256, "Launch Studio runtime module digest");
    if (liveRuntimeDependencyVerification) {
      const bytes = fs.readFileSync(resolveRegularRepositoryFile(repositoryRoot, runtimePath, "Launch Studio runtime module"));
      if (sha256Bytes(bytes) !== runtimeEntry.sha256) liveDependencyErrors.push("Launch Studio runtime module digest mismatch");
    }
  }
  const expectedCoreDependencyPaths = ["artifact-store.mjs", "canonical-json.mjs", "handoff-ledger.mjs", "validators.mjs"].map((name) => `portfolio/core/lib/${name}`);
  if (index.engine.coreDependencies.length !== expectedCoreDependencyPaths.length || new Set(index.engine.coreDependencies.map((entry) => entry.path)).size !== expectedCoreDependencyPaths.length) throw new Error("Launch Studio transitive Core dependency catalog cardinality is inconsistent");
  for (const [offset, dependencyPath] of expectedCoreDependencyPaths.entries()) {
    const dependencyEntry = index.engine.coreDependencies[offset];
    if (dependencyEntry.path !== dependencyPath) throw new Error("Launch Studio transitive Core dependency path order/substitution detected");
    assertSha256(dependencyEntry.sha256, "Launch Studio transitive Core dependency digest");
    if (liveRuntimeDependencyVerification) {
      const bytes = fs.readFileSync(resolveRegularRepositoryFile(repositoryRoot, dependencyPath, "Launch Studio transitive Core dependency"));
      if (sha256Bytes(bytes) !== dependencyEntry.sha256) liveDependencyErrors.push("Launch Studio transitive Core dependency digest mismatch");
    }
  }
  if (index.profileCatalog.path !== "portfolio/core/launch-studio/versions/0.1.0/profiles/launch-profiles.json") throw new Error("Launch Studio profile catalog path substitution detected");
  const profileBytes = fs.readFileSync(resolveRegularRepositoryFile(repositoryRoot, index.profileCatalog.path, "Launch Studio profile catalog"));
  if (sha256Bytes(profileBytes) !== index.profileCatalog.sha256) throw new Error("Launch Studio profile catalog digest mismatch");
  const profileCatalog = JSON.parse(profileBytes);
  if (`${canonicalize(profileCatalog)}\n` !== String(profileBytes) || profileCatalog.documentType !== "clover-launch-profile-catalog" || profileCatalog.schemaVersion !== "0.1.0" || profileCatalog.profiles.length !== 7 || canonicalize(profileCatalog.profiles.map((profile) => profile.displayName)) !== canonicalize(exactProfiles)) throw new Error("Launch Studio profile catalog content substitution detected");
  const profileIds = new Set();
  for (const profile of profileCatalog.profiles) {
    validateContract("launch-profile.schema.json", profile, profile.recordId);
    if (profile.mayWeakenInvariants !== false || profileIds.has(profile.recordId)) throw new Error("Launch profile weakens invariants or repeats an identity");
    profileIds.add(profile.recordId);
  }
  let previousIndex = null;
  let previousIndexCreatedAt = null;
  let previousVerification = null;
  if (index.previousIndexPath !== null) {
    const previousPath = resolveRegularRepositoryFile(repositoryRoot, index.previousIndexPath, "previous Launch Studio index");
    const previousBytes = fs.readFileSync(previousPath);
    const previous = JSON.parse(previousBytes);
    if (String(previousBytes) !== `${canonicalize(previous)}\n`) throw new Error("Previous Launch Studio index is not canonical JSON");
    if (previous.indexHash !== index.previousIndexHash || sha256Canonical(Object.fromEntries(Object.entries(previous).filter(([key]) => key !== "indexHash"))) !== index.previousIndexHash) throw new Error("Previous Launch Studio index hash substitution detected");
    previousIndexCreatedAt = parseCanonicalTimestamp(previous.createdAt, "previous Launch Studio index createdAt");
    if (indexCreatedAt <= previousIndexCreatedAt) throw new Error("Launch Studio index chronology is not increasing");
    previousVerification = verifyLaunchIndexDocumentInternal(previous, {
      repositoryRoot,
      seenIndexHashes,
      liveRuntimeDependencyVerification: false
    });
    previousIndex = previous;
  }
  const entrySessions = new Set();
  let firstReplayReceipt = null;
  let priorEntryRecordedAt = null;
  index.entries.forEach((entry, offset) => {
    if (entry.sequence !== offset + 1) throw new Error("Launch Studio index sequence is not contiguous");
    const entryRecordedAt = parseCanonicalTimestamp(entry.recordedAt, `Launch Studio index entry ${entry.sequence} recordedAt`);
    if (priorEntryRecordedAt !== null && entryRecordedAt <= priorEntryRecordedAt) throw new Error("Launch Studio index entry chronology is not strictly increasing");
    if (entryRecordedAt > indexCreatedAt) throw new Error("Launch Studio index entry cannot postdate its containing index");
    if (previousIndex !== null && offset >= previousIndex.entries.length && entryRecordedAt <= previousIndexCreatedAt) throw new Error("New Launch Studio index entry must postdate its predecessor index");
    priorEntryRecordedAt = entryRecordedAt;
    if (entrySessions.has(entry.sessionId)) throw new Error("Launch Studio index repeats a session identity");
    entrySessions.add(entry.sessionId);
    const fixtureBytes = fs.readFileSync(resolveRegularRepositoryFile(repositoryRoot, entry.fixturePath, "synthetic fixture"));
    const eventBytes = fs.readFileSync(resolveRegularRepositoryFile(repositoryRoot, entry.eventStreamPath, "synthetic event stream"));
    const finalBytes = fs.readFileSync(resolveRegularRepositoryFile(repositoryRoot, entry.finalStatePath, "synthetic final state"));
    const exportManifestBytes = fs.readFileSync(resolveRegularRepositoryFile(repositoryRoot, entry.exportManifestPath, "synthetic export manifest"));
    const restorationReceiptBytes = fs.readFileSync(resolveRegularRepositoryFile(repositoryRoot, entry.restorationReceiptPath, "synthetic restoration receipt"));
    const timelineBytes = fs.readFileSync(resolveRegularRepositoryFile(repositoryRoot, entry.timelinePath, "synthetic material-progress timeline"));
    const reportBytes = fs.readFileSync(resolveRegularRepositoryFile(repositoryRoot, entry.reportPath, "synthetic session report"));
    const replayBytes = fs.readFileSync(resolveRegularRepositoryFile(repositoryRoot, entry.replayReceiptPath, "synthetic replay receipt"));
    if (sha256Bytes(fixtureBytes) !== entry.fixtureHash || sha256Bytes(eventBytes) !== entry.eventStreamHash || sha256Bytes(finalBytes) !== entry.finalStateHash || sha256Bytes(exportManifestBytes) !== entry.exportManifestHash || sha256Bytes(restorationReceiptBytes) !== entry.restorationReceiptHash || sha256Bytes(timelineBytes) !== entry.timelineHash || sha256Bytes(reportBytes) !== entry.reportHash || sha256Bytes(replayBytes) !== entry.replayReceiptHash) throw new Error("Launch Studio indexed artifact byte hash mismatch");
    const fixture = JSON.parse(fixtureBytes);
    const events = String(eventBytes).trimEnd().split("\n").map(JSON.parse);
    const finalSession = JSON.parse(finalBytes);
    const exportManifest = JSON.parse(exportManifestBytes);
    const restorationReceipt = JSON.parse(restorationReceiptBytes);
    const timeline = String(timelineBytes).trimEnd().split("\n").map(JSON.parse);
    const report = String(reportBytes);
    const replayReceipt = JSON.parse(replayBytes);
    if (offset === 0) firstReplayReceipt = replayReceipt;
    if (`${canonicalize(fixture)}\n` !== String(fixtureBytes) || `${events.map(canonicalize).join("\n")}\n` !== String(eventBytes) || `${canonicalize(finalSession)}\n` !== String(finalBytes) || `${canonicalize(exportManifest)}\n` !== String(exportManifestBytes) || `${canonicalize(restorationReceipt)}\n` !== String(restorationReceiptBytes) || `${timeline.map(canonicalize).join("\n")}\n` !== String(timelineBytes) || `${canonicalize(replayReceipt)}\n` !== String(replayBytes)) throw new Error("Launch Studio indexed artifact is not canonical");
    validateContract("synthetic-session-fixture.schema.json", fixture, "indexed synthetic fixture");
    validateContract("launch-session.schema.json", finalSession, "indexed final session");
    validateContract("export-manifest.schema.json", exportManifest, "indexed export manifest");
    validateContract("restoration-receipt.schema.json", restorationReceipt, "indexed restoration receipt");
    validateContract("synthetic-replay-receipt.schema.json", replayReceipt, "indexed replay receipt");
    assertFixtureGraph(fixture, events);
    const streamResult = verifySessionEvents(events, { budget: fixture.sessionBudget });
    const previous = events.at(-1);
    const lastEventAt = parseCanonicalTimestamp(previous.recordedAt, "indexed session final event time");
    const exportAt = parseCanonicalTimestamp(fixture.exportMetadata.createdAt, "indexed export time");
    const restoredAt = parseCanonicalTimestamp(fixture.restoredAt, "indexed restoration time");
    const replayAt = parseCanonicalTimestamp(fixture.replayGeneratedAt, "indexed replay time");
    if (!(lastEventAt <= exportAt && exportAt < restoredAt && restoredAt < replayAt && replayAt <= entryRecordedAt && entryRecordedAt <= indexCreatedAt)) throw new Error("Launch Studio session, export, restoration, replay, entry, and index chronology is inconsistent");
    if (streamResult.sessionId !== entry.sessionId || streamResult.workspaceId !== fixture.workspaceId || streamResult.projectId !== fixture.projectId || streamResult.state !== "held" || streamResult.version !== events.length || streamResult.headEventHash !== previous.eventHash) throw new Error("Launch Studio indexed event scope, state, budget, or head binding failed");
    if (fixture.sessionId !== entry.sessionId || !profileIds.has(fixture.profileId) || finalSession.sessionId !== entry.sessionId || replayReceipt.sessionId !== entry.sessionId || previous.toState !== "held" || entry.status !== "held-awaiting-real-execution-authority") throw new Error("Launch Studio indexed session/profile/final-state binding failed");
    if (finalSession.state !== "held" || finalSession.eventCount !== events.length || finalSession.sessionVersion !== events.length || finalSession.headEventHash !== previous.eventHash || finalSession.fixtureHash !== sha256Canonical(fixture)) throw new Error("Launch Studio final session reconstruction binding failed");
    const derived = deriveSyntheticOutputs(fixture, events);
    if (canonicalize(derived.finalSession) !== canonicalize(finalSession) || canonicalize(derived.exportManifest) !== canonicalize(exportManifest) || canonicalize(derived.restorationReceipt) !== canonicalize(restorationReceipt) || canonicalize(derived.timeline) !== canonicalize(timeline) || derived.report !== report || canonicalize(derived.replayReceipt) !== canonicalize(replayReceipt)) throw new Error("Launch Studio indexed deterministic output reproduction failed");
    const { receiptHash, ...receiptUnsigned } = replayReceipt;
    if (sha256Canonical(receiptUnsigned) !== receiptHash || replayReceipt.finalState !== "held" || replayReceipt.finalSessionHash !== sha256Canonical(finalSession) || replayReceipt.eventCount !== events.length || replayReceipt.eventStreamHash !== sha256Bytes(eventBytes) || replayReceipt.headEventHash !== previous.eventHash || replayReceipt.deterministic !== true || replayReceipt.consequentialAuthorityGranted !== false) throw new Error("Launch Studio replay receipt cross-binding failed");
  });
  if (previousIndex !== null) {
    assertLaunchIndexSuccessor(previousIndex, index, previousVerification, indexSchemaBinding);
  }
  if (liveDependencyErrors.length > 0) throw new Error(liveDependencyErrors[0]);
  if (index.syntheticSession.sessionId !== index.entries[0].sessionId || index.syntheticSession.finalState !== "held" || index.syntheticSession.replayReceiptPath !== index.entries[0].replayReceiptPath) throw new Error("Launch Studio index synthetic-session pointer substitution detected");
  const reportBytes = fs.readFileSync(resolveRegularRepositoryFile(repositoryRoot, index.syntheticSession.reportPath, "synthetic session report"));
  const report = String(reportBytes);
  if (index.syntheticSession.reportPath !== index.entries[0].reportPath || sha256Bytes(reportBytes) !== index.entries[0].reportHash || sha256Bytes(reportBytes) !== firstReplayReceipt.reportHash || !report.includes(index.syntheticSession.sessionId) || !report.includes("HELD — awaiting real execution authority")) throw new Error("Launch Studio synthetic report cross-binding failed");
  const dependencyHistory = cloneDependencyHistory(previousVerification?.dependencyHistory);
  for (const dependency of dependencyCatalog(index)) {
    const values = dependencyHistory.get(dependency.path) || [];
    values.push(dependency.sha256);
    dependencyHistory.set(dependency.path, values);
  }
  const indexSchemaHistory = [
    ...(previousVerification?.indexSchemaHistory || []),
    { ...indexSchemaBinding }
  ];
  return {
    valid: true,
    indexHash,
    entryCount: index.entries.length,
    schemaCount: index.schemas.length,
    dependencyHistory,
    indexSchemaBinding,
    indexSchemaHistory
  };
}

export function verifyLaunchIndexDocument(index, options = {}) {
  assertExactIndexOptions(options, ["repositoryRoot"], "Launch Studio index verification");
  const {
    dependencyHistory: _dependencyHistory,
    indexSchemaBinding: _indexSchemaBinding,
    indexSchemaHistory: _indexSchemaHistory,
    ...result
  } = verifyLaunchIndexDocumentInternal(index, {
    repositoryRoot: options.repositoryRoot ?? REPOSITORY_ROOT,
    seenIndexHashes: new Set(),
    liveRuntimeDependencyVerification: true
  });
  return result;
}

export function verifyStableIndex(options = {}) {
  assertExactIndexOptions(options, ["immutableIndexPath", "repositoryRoot", "stableIndexPath"], "Stable Launch Studio index verification");
  const repositoryRoot = path.resolve(options.repositoryRoot ?? REPOSITORY_ROOT);
  const resolveConfiguredIndexPath = (candidate, fallback, label) => {
    const absolute = path.resolve(candidate ?? fallback);
    const platformRelative = path.relative(repositoryRoot, absolute);
    if (platformRelative === "" || path.isAbsolute(platformRelative)) throw new Error(`${label} must be a strict repository-root descendant`);
    const relative = platformRelative.split(path.sep).join("/");
    return resolveRegularRepositoryFile(repositoryRoot, relative, label);
  };
  const immutableIndexPath = resolveConfiguredIndexPath(options.immutableIndexPath, IMMUTABLE_INDEX_PATH, "immutable Launch Studio index");
  const stableIndexPath = resolveConfiguredIndexPath(options.stableIndexPath, STABLE_INDEX_PATH, "stable Launch Studio index");
  const indexDirectory = path.dirname(immutableIndexPath);
  const numbered = fs.readdirSync(indexDirectory, { withFileTypes: true })
    .filter((entry) => /^launch-session-index-\d{4}\.json$/u.test(entry.name))
    .map((entry) => path.join(indexDirectory, entry.name))
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  if (numbered.length === 0) throw new Error("Launch Studio has no immutable numbered index snapshots");
  let priorSnapshot = null;
  for (const [snapshotOffset, snapshotPath] of numbered.entries()) {
    const expectedName = `launch-session-index-${String(snapshotOffset + 1).padStart(4, "0")}.json`;
    if (path.basename(snapshotPath) !== expectedName) throw new Error(`Numbered Launch Studio index snapshots must start at 0001 and remain contiguous; expected ${expectedName}`);
    const stat = fs.lstatSync(snapshotPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Numbered Launch Studio index must be a regular non-symbolic file");
    const snapshotBytes = fs.readFileSync(snapshotPath);
    const snapshot = JSON.parse(snapshotBytes);
    if (String(snapshotBytes) !== `${canonicalize(snapshot)}\n`) throw new Error("Numbered Launch Studio index is not canonical JSON");
    if (priorSnapshot === null) {
      if (snapshot.previousIndexPath !== null || snapshot.previousIndexHash !== null) throw new Error("First numbered Launch Studio index must be the chain genesis");
    } else {
      const expectedPreviousPath = path.relative(repositoryRoot, priorSnapshot.path).split(path.sep).join("/");
      if (snapshot.previousIndexPath !== expectedPreviousPath || snapshot.previousIndexHash !== priorSnapshot.index.indexHash) throw new Error("Numbered Launch Studio index chain skips, reorders, or substitutes a snapshot");
    }
    priorSnapshot = { path: snapshotPath, index: snapshot };
  }
  const latestIndexPath = numbered.at(-1);
  for (const [label, filePath] of [["stable Launch Studio index", stableIndexPath], ["latest immutable Launch Studio index", latestIndexPath]]) {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular non-symbolic file`);
  }
  const stableBytes = fs.readFileSync(stableIndexPath);
  const immutableBytes = fs.readFileSync(latestIndexPath);
  if (!stableBytes.equals(immutableBytes)) throw new Error("Stable Launch Studio index differs from the latest immutable snapshot");
  const index = JSON.parse(stableBytes);
  if (String(stableBytes) !== `${canonicalize(index)}\n`) throw new Error("Stable Launch Studio index is not canonical JSON");
  const {
    dependencyHistory: _dependencyHistory,
    indexSchemaBinding: _indexSchemaBinding,
    indexSchemaHistory: _indexSchemaHistory,
    ...result
  } = verifyLaunchIndexDocumentInternal(index, {
    repositoryRoot,
    seenIndexHashes: new Set(),
    liveRuntimeDependencyVerification: true
  });
  return { ...result, latestIndexPath, fileSha256: sha256Bytes(stableBytes) };
}

export function verifyCommittedSynthetic(directory = SYNTHETIC_DIRECTORY) {
  validateSchemaCatalog();
  verifyStableIndex();
  const { fixture, events } = loadSyntheticInputs(directory);
  const derived = deriveSyntheticOutputs(fixture, events);
  const expectedJson = [
    [SYNTHETIC_FILES.final, derived.finalSession, "launch-session.schema.json"],
    [SYNTHETIC_FILES.exportManifest, derived.exportManifest, "export-manifest.schema.json"],
    [SYNTHETIC_FILES.restorationReceipt, derived.restorationReceipt, "restoration-receipt.schema.json"],
    [SYNTHETIC_FILES.replayReceipt, derived.replayReceipt, "synthetic-replay-receipt.schema.json"]
  ];
  for (const [fileName, expected, schema] of expectedJson) {
    const actual = readCanonicalJson(path.join(directory, fileName));
    if (canonicalize(actual) !== canonicalize(expected)) throw new Error(`${fileName} does not reproduce deterministically`);
    validateContract(schema, actual, fileName);
  }
  const actualTimeline = readCanonicalJsonl(path.join(directory, SYNTHETIC_FILES.timeline));
  if (canonicalize(actualTimeline) !== canonicalize(derived.timeline)) throw new Error("Timeline does not reproduce deterministically");
  const actualReport = fs.readFileSync(path.join(directory, SYNTHETIC_FILES.report), "utf8");
  if (actualReport !== derived.report) throw new Error("Human-readable report does not reproduce deterministically");
  return { valid: true, ...derived };
}

export function verifyExportRestoreReplay() {
  const { fixture, events } = loadSyntheticInputs();
  const derived = deriveSyntheticOutputs(fixture, events);
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clover-launch-replay-"));
  const exportDirectory = path.join(temporaryRoot, "export");
  const restoreDirectory = path.join(temporaryRoot, "restore");
  try {
    writeExportBundle(exportDirectory, derived.exportFiles, derived.exportManifest, { trustedBaseDirectory: temporaryRoot });
    const restoration = restoreExportDirectory(exportDirectory, restoreDirectory, { exportTrustedBaseDirectory: temporaryRoot, restoreTrustedBaseDirectory: temporaryRoot });
    const restoredFixture = JSON.parse(fs.readFileSync(path.join(restoreDirectory, "session/fixture.json"), "utf8"));
    const restoredEvents = fs.readFileSync(path.join(restoreDirectory, "session/events.jsonl"), "utf8").trimEnd().split("\n").map(JSON.parse);
    const restored = deriveSyntheticOutputs(restoredFixture, restoredEvents);
    if (sha256Canonical(restored.finalSession) !== sha256Canonical(derived.finalSession) ||
        sha256Canonical(restored.exportManifest) !== sha256Canonical(derived.exportManifest) ||
        sha256Canonical(restoration.manifest) !== sha256Canonical(derived.exportManifest)) throw new Error("Restored replay identity differs");
    return { valid: true, receipt: derived.replayReceipt };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function main() {
  const command = process.argv[2] || "verify";
  if (command === "validate") console.log(canonicalize(validateSchemaCatalog()));
  else if (command === "replay") console.log(canonicalize(deriveSyntheticOutputs(...Object.values(loadSyntheticInputs())).replayReceipt));
  else if (command === "report") process.stdout.write(deriveSyntheticOutputs(...Object.values(loadSyntheticInputs())).report);
  else if (command === "verify") console.log(canonicalize({ committed: verifyCommittedSynthetic().valid, restored: verifyExportRestoreReplay().valid }));
  else throw new Error(`Unknown replay command ${command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(MODULE_PATH)) main();
