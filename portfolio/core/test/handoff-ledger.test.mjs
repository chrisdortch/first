import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalize, sha256Bytes, sha256Canonical } from "../lib/canonical-json.mjs";
import {
  assertActionEnvelopeExecutable,
  assertSanitizedHandoffDocument,
  computeHandoffHash,
  createOwnerApprovalAttestation,
  createOwnerApprovedIndexVersion,
  sealHandoffDocument,
  validateActionEnvelope,
  validateBranchCapsule,
  validateExecutionReceipt,
  validateHandoffLedger,
  validateIndependentReviewDecision,
  validateIndexTransition
} from "../lib/handoff-ledger.mjs";
import {
  assertBuildCharter,
  assertExecutorWorkOrder,
  assertRecordHash,
  assertSafeRepositoryPattern,
  assertSafeRepositoryPath,
  resolveRegularRepositoryFile,
  validateContract
} from "../launch-studio/versions/0.1.0/runtime/contracts.mjs";
import { validateHandoffIndexChain } from "../lib/publication-finalization.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const handoffRoot = path.join(repositoryRoot, "portfolio/core/handoff");
const versionRoot = path.join(handoffRoot, "versions/0.1.0");
const demonstrationRoot = path.join(versionRoot, "demonstration");
const stableIndexPath = path.join(handoffRoot, "index.json");
const genesisIndexPath = path.join(versionRoot, "indexes/action-receipt-index-0001.json");
const genesisIndexHash = "136041730e9c8c705c4ac13823d7b568060bf8d454ecf56fd2fc2cd915a0d42c";
const genesisIndexByteHash = "da4b60605402cf4197f8073c312c84a4a374daec35e11664bac86593bd8152ff";

const readJson = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));
const clone = (value) => structuredClone(value);
const sealNested = (value, hashField) => sealHandoffDocument(value, hashField);
const cells = fs.readdirSync(path.join(versionRoot, "cells")).sort()
  .map((filename) => readJson(path.join(versionRoot, "cells", filename)));
const coreCapsule = cells.find((entry) => entry.project.projectId === "clover-core");
const warroomCapsule = cells.find((entry) => entry.project.projectId === "clover-warroom");
const action001 = readJson(path.join(demonstrationRoot, "action-001-status-refresh-envelope.json"));
const action002 = readJson(path.join(demonstrationRoot, "action-002-warroom-identity-envelope.json"));
const receipt001 = readJson(path.join(demonstrationRoot, "action-001-status-refresh-receipt.json"));
const index0001 = readJson(genesisIndexPath);
const phaseBProposalRoot = path.join(versionRoot, "proposals/launch-studio-phase-b-0.2a");
const action004CapsulePath = path.join(versionRoot, "cells/clover-launch-studio-private-owner.branch-capsule.json");
const action004IndexPath = path.join(versionRoot, "indexes/action-receipt-index-0002.json");
const action004Capsule = readJson(action004CapsulePath);
const action004 = readJson(path.join(phaseBProposalRoot, "action-004-source-envelope.json"));
const action004ContextPack = readJson(path.join(phaseBProposalRoot, "phase-b-0.2a-context-pack.json"));
const action004ImpactScan = readJson(path.join(phaseBProposalRoot, "phase-b-0.2a-impact-scan.json"));
const action004Budget = readJson(path.join(phaseBProposalRoot, "phase-b-0.2a-budget.json"));
const action004Acceptance = readJson(path.join(phaseBProposalRoot, "phase-b-0.2a-acceptance-contract.json"));
const action004Charter = readJson(path.join(phaseBProposalRoot, "phase-b-0.2a-build-charter.json"));
const action004WorkOrder = readJson(path.join(phaseBProposalRoot, "phase-b-0.2a-executor-work-order.json"));
const action004Manifest = readJson(path.join(phaseBProposalRoot, "phase-b-0.2a-proposal-manifest.json"));
const action004Report = fs.readFileSync(path.join(phaseBProposalRoot, "PHASE_B_0.2A_PROPOSAL.md"), "utf8");
const index0002 = readJson(action004IndexPath);

function resealReceipt(receipt) {
  return sealHandoffDocument(receipt, "receiptHash");
}

function writeJson(root, relativePath, value) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function readRepositoryJson(relativePath) {
  assert.equal(path.isAbsolute(relativePath), false);
  const absolute = path.resolve(repositoryRoot, relativePath);
  assert.ok(absolute.startsWith(`${repositoryRoot}${path.sep}`));
  return readJson(absolute);
}

function makeObservation({ id, sourceId, subject, identityKey, state }) {
  return sealNested({
    observationId: id,
    sourceId,
    subject,
    observedIdentity: identityKey,
    identityKey,
    availability: "available",
    identityResolution: "exact-resolved",
    state,
    observedAt: "2026-08-20T21:26:00.000Z",
    evidenceRef: `synthetic-public-readback:${id}`
  }, "evidenceHash");
}

test("persisted Handoff Ledger keeps immutable genesis and resolves the stable root to the latest valid snapshot", () => {
  const stableIndex = readJson(stableIndexPath);
  const chain = validateHandoffIndexChain(repositoryRoot, { historicalIndexHash: genesisIndexHash });
  const persistedEnvelopes = stableIndex.entries.map((entry) => readRepositoryJson(entry.envelopePath));
  const persistedReceipts = stableIndex.entries
    .filter((entry) => entry.receiptPath !== null)
    .map((entry) => readRepositoryJson(entry.receiptPath));
  const persistedReviews = stableIndex.entries
    .filter((entry) => entry.review.status === "completed")
    .map((entry) => readRepositoryJson(entry.review.decisionPath));
  const result = validateHandoffLedger({
    branchCapsules: cells,
    envelopes: persistedEnvelopes,
    receipts: persistedReceipts,
    reviews: persistedReviews,
    index: stableIndex
  }, { repositoryRoot });
  assert.equal(result.valid, true);
  assert.equal(result.indexHash, stableIndex.indexHash);
  assert.equal(chain.status, "passed");
  assert.equal(chain.currentIndexHash, stableIndex.indexHash);
  assert.equal(chain.historicalIndexHash, genesisIndexHash);
  assert.equal(chain.historicalSnapshotPath,
    "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0001.json");
  assert.equal(computeHandoffHash(index0001, "indexHash"), genesisIndexHash);
  assert.equal(sha256Bytes(fs.readFileSync(genesisIndexPath)), genesisIndexByteHash);
  assert.deepEqual(index0001.entries.map((entry) => entry.actionId), [
    "CLOVER-2026-08-20-001",
    "CLOVER-2026-08-20-002"
  ]);
  assert.equal(index0001.entries[0].lifecycle.state, "consumed");
  assert.equal(index0001.entries[1].lifecycle.state, "proposed");

  if (stableIndex.indexHash === genesisIndexHash) {
    assert.equal(chain.depth, 1);
    assert.equal(
      fs.readFileSync(stableIndexPath, "utf8"),
      fs.readFileSync(genesisIndexPath, "utf8")
    );
  } else {
    assert.ok(chain.depth > 1);
    assert.notEqual(chain.currentSnapshotPath, chain.historicalSnapshotPath);
  }
});

test("execution is default-deny without exact lifecycle state and blocks replay, pending approval, and expiry", () => {
  assert.throws(() => assertActionEnvelopeExecutable(action001, {
    branchCapsule: coreCapsule,
    now: "2026-08-20T21:20:00.000Z"
  }), /lifecycle-index-required/i);
  assert.throws(() => assertActionEnvelopeExecutable(action001, {
    branchCapsule: coreCapsule,
    index: index0001,
    now: "2026-08-20T21:20:00.000Z"
  }), /single-use-consumed/i);
  assert.throws(() => assertActionEnvelopeExecutable(action002, {
    branchCapsule: warroomCapsule,
    index: index0001,
    repositoryRoot,
    now: "2026-08-20T21:20:00.000Z"
  }), /owner-approval-required/i);
  assert.throws(() => assertActionEnvelopeExecutable(action002, {
    branchCapsule: warroomCapsule,
    index: index0001,
    repositoryRoot,
    now: action002.expiresAt
  }), /expired/i);
});

test("scope narrowing removes omitted capabilities from effective authority", () => {
  const envelope = clone(action001);
  envelope.scope.allowedActions = ["read-public-metadata", "record-handoff-artifacts"];
  const narrowed = sealHandoffDocument(envelope, "envelopeHash");
  validateActionEnvelope(narrowed, { branchCapsule: coreCapsule, now: "2026-08-20T21:20:00.000Z" });
  const index = clone(index0001);
  const entry = index.entries[0];
  entry.envelopeHash = narrowed.envelopeHash;
  entry.status = "pending";
  entry.lifecycle.state = "available";
  entry.lifecycle.consumedAt = null;
  entry.lifecycle.consumedByReceiptId = null;
  entry.receiptId = null;
  entry.receiptPath = null;
  entry.receiptHash = null;
  entry.outcome = "pending";
  const narrowedIndex = sealHandoffDocument(index, "indexHash");
  const execution = assertActionEnvelopeExecutable(narrowed, {
    branchCapsule: coreCapsule,
    index: narrowedIndex,
    now: "2026-08-20T21:20:00.000Z"
  });
  assert.equal(execution.executable, true);
  assert.equal(execution.effectiveAuthority.readPublicMetadata, true);
  assert.equal(execution.effectiveAuthority.recordHandoffArtifacts, true);
  assert.equal(execution.effectiveAuthority.pushCandidateBranch, false);
  assert.equal(execution.effectiveAuthority.createNonProductionPreview, false);
});

test("capsule, Action ID, and exact source substitutions fail closed", () => {
  const substitutedCapsule = sealHandoffDocument({ ...clone(action001), branchCapsuleHash: warroomCapsule.capsuleHash }, "envelopeHash");
  assert.throws(() => validateActionEnvelope(substitutedCapsule, {
    branchCapsule: coreCapsule,
    now: "2026-08-20T21:20:00.000Z"
  }), /capsule/i);

  const changedAction = sealHandoffDocument({ ...clone(action001), actionId: "CLOVER-2026-08-20-099" }, "envelopeHash");
  assert.throws(() => assertActionEnvelopeExecutable(changedAction, {
    branchCapsule: coreCapsule,
    index: index0001,
    now: "2026-08-20T21:20:00.000Z"
  }), /substitut|exact lifecycle/i);

  const receipt = clone(receipt001);
  const observation = receipt.observations.find((entry) => entry.observationId === "observation:github-pr16");
  const oldHash = observation.evidenceHash;
  observation.identityKey = `x${observation.identityKey}x`;
  Object.assign(observation, sealNested(observation, "evidenceHash"));
  for (const binding of receipt.evidenceBindings) {
    binding.boundHashes = binding.boundHashes.map((hash) => hash === oldHash ? observation.evidenceHash : hash);
  }
  assert.throws(() => validateExecutionReceipt(resealReceipt(receipt), {
    branchCapsule: coreCapsule,
    envelope: action001,
    index: index0001,
    repositoryRoot,
    executionNow: receipt.startedAt
  }), /substitut/i);
});

test("evidence omission and evidence hash substitution fail closed", () => {
  const omitted = clone(receipt001);
  omitted.evidenceBindings.pop();
  assert.throws(() => validateExecutionReceipt(resealReceipt(omitted), {
    branchCapsule: coreCapsule,
    envelope: action001,
    index: index0001,
    repositoryRoot,
    executionNow: omitted.startedAt
  }), /evidence|cardinality/i);

  const substituted = clone(receipt001);
  substituted.evidenceBindings[0].boundHashes[0] = computeHandoffHash({ substituted: true }, "unused");
  assert.throws(() => validateExecutionReceipt(resealReceipt(substituted), {
    branchCapsule: coreCapsule,
    envelope: action001,
    index: index0001,
    repositoryRoot,
    executionNow: substituted.startedAt
  }), /evidence|substitut/i);
});

test("unavailable required source and out-of-scope action/effect claims fail closed", () => {
  const unavailable = clone(receipt001);
  const observation = unavailable.observations[0];
  const oldHash = observation.evidenceHash;
  observation.availability = "unavailable";
  observation.identityResolution = "unknown";
  Object.assign(observation, sealNested(observation, "evidenceHash"));
  for (const binding of unavailable.evidenceBindings) {
    binding.boundHashes = binding.boundHashes.map((hash) => hash === oldHash ? observation.evidenceHash : hash);
  }
  assert.throws(() => validateExecutionReceipt(resealReceipt(unavailable), {
    branchCapsule: coreCapsule,
    envelope: action001,
    index: index0001,
    repositoryRoot,
    executionNow: unavailable.startedAt
  }), /unavailable|resolve|substitut/i);

  const effect = clone(receipt001);
  effect.actionsPerformed.push("push-candidate-branch");
  effect.authorityUsed.pushCandidateBranch = true;
  effect.candidateEffects.push = {
    performed: true,
    remoteBranch: "synthetic/out-of-scope",
    commit: receipt001.source.commit
  };
  assert.throws(() => validateExecutionReceipt(resealReceipt(effect), {
    branchCapsule: coreCapsule,
    envelope: action001,
    index: index0001,
    repositoryRoot,
    executionNow: effect.startedAt
  }), /outside|unauthorized|authority/i);
});

test("sensitive keys and secret-shaped values are rejected recursively", () => {
  assert.throws(() => assertSanitizedHandoffDocument({ nested: { password: "synthetic" } }), /sensitive/i);
  assert.throws(() => assertSanitizedHandoffDocument({ note: "Bearer abcdefghijklmnopqrstuvwxyz" }), /sensitive/i);
});

test("independent review binds the exact receipt and envelope hashes", () => {
  const review = sealHandoffDocument({
    documentType: "clover-handoff-independent-review-decision",
    schemaVersion: "0.1.0",
    decisionId: "handoff-review:001:synthetic",
    reviewedAt: "2026-08-20T21:19:45.000Z",
    reviewer: { reviewerId: "reviewer:synthetic-independent", independenceDeclared: true, executionLaneDifferent: true },
    receiptId: receipt001.receiptId,
    receiptHash: receipt001.receiptHash,
    envelopeId: action001.envelopeId,
    envelopeHash: action001.envelopeHash,
    decision: "approve",
    findings: [],
    authority: {
      decisionIsMergeApproval: false,
      decisionIsProductionDeploymentApproval: false,
      decisionIsProductionDataApproval: false,
      decisionIsStandingAuthority: false
    }
  }, "decisionHash");
  assert.equal(validateIndependentReviewDecision(review, { receipt: receipt001, envelope: action001 }).valid, true);
  const substituted = sealHandoffDocument({ ...review, receiptHash: computeHandoffHash({ wrong: true }, "unused") }, "decisionHash");
  assert.throws(() => validateIndependentReviewDecision(substituted, {
    receipt: receipt001,
    envelope: action001
  }), /exact receipt/i);
});

test("a completed action accepts one append-only source-bound independent review transition", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clover-handoff-review-test-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const decisionPath = "portfolio/core/handoff/versions/0.1.0/reviews/action-001.synthetic.json";
  const review = sealHandoffDocument({
    documentType: "clover-handoff-independent-review-decision",
    schemaVersion: "0.1.0",
    decisionId: "handoff-review:001:synthetic-indexed",
    reviewedAt: "2026-08-20T21:19:45.500Z",
    reviewer: { reviewerId: "reviewer:synthetic-independent", independenceDeclared: true, executionLaneDifferent: true },
    receiptId: receipt001.receiptId,
    receiptHash: receipt001.receiptHash,
    envelopeId: action001.envelopeId,
    envelopeHash: action001.envelopeHash,
    decision: "approve",
    findings: [],
    authority: {
      decisionIsMergeApproval: false,
      decisionIsProductionDeploymentApproval: false,
      decisionIsProductionDataApproval: false,
      decisionIsStandingAuthority: false
    }
  }, "decisionHash");
  const reviewedValue = clone(index0001);
  reviewedValue.indexId = "handoff-index:synthetic-reviewed:20260820";
  reviewedValue.createdAt = "2026-08-20T21:19:46.000Z";
  reviewedValue.previousIndexPath = "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0001.json";
  reviewedValue.previousIndexHash = index0001.indexHash;
  reviewedValue.entries[0].recordedAt = reviewedValue.createdAt;
  reviewedValue.entries[0].review = {
    status: "completed",
    decisionId: review.decisionId,
    decisionPath,
    decisionHash: review.decisionHash
  };
  const reviewedIndex = sealHandoffDocument(reviewedValue, "indexHash");
  assert.deepEqual(validateIndexTransition(index0001, reviewedIndex), {
    valid: true,
    transitionedEntries: 1,
    appendedEntries: 0
  });

  for (const [relativePath, value] of [
    ["portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0001.json", index0001],
    [index0001.entries[0].envelopePath, action001],
    [index0001.entries[1].envelopePath, action002],
    [index0001.entries[0].receiptPath, receipt001],
    [decisionPath, review]
  ]) writeJson(tempRoot, relativePath, value);
  assert.equal(validateHandoffLedger({
    branchCapsules: cells,
    envelopes: [action001, action002],
    receipts: [receipt001],
    reviews: [review],
    index: reviewedIndex
  }, { repositoryRoot: tempRoot, now: "2026-08-20T21:25:00.000Z" }).valid, true);

  const earlyValue = clone(reviewedIndex);
  earlyValue.entries[0].recordedAt = "2026-08-20T21:19:45.000Z";
  const earlyIndex = sealHandoffDocument(earlyValue, "indexHash");
  assert.throws(() => validateHandoffLedger({
    branchCapsules: cells,
    envelopes: [action001, action002],
    receipts: [receipt001],
    reviews: [review],
    index: earlyIndex
  }, { repositoryRoot: tempRoot, now: "2026-08-20T21:25:00.000Z" }), /predates.*decision|predates.*review/i);

  const approvalChangedValue = clone(reviewedIndex);
  approvalChangedValue.entries[0].ownerApproval.approverId = "owner:substituted";
  const approvalChanged = sealHandoffDocument(approvalChangedValue, "indexHash");
  assert.throws(() => validateIndexTransition(index0001, approvalChanged), /owner approval/i);
});

test("append-only index transitions reject deletion, reorder, and Action ID reuse", () => {
  const deleted = sealHandoffDocument({
    ...clone(index0001),
    indexId: "handoff-index:synthetic-deleted",
    createdAt: "2026-08-20T21:20:00.000Z",
    previousIndexPath: "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0001.json",
    previousIndexHash: index0001.indexHash,
    entries: [clone(index0001.entries[0])]
  }, "indexHash");
  assert.throws(() => validateIndexTransition(index0001, deleted), /append-only/i);

  const reorderedValue = clone(index0001);
  reorderedValue.indexId = "handoff-index:synthetic-reordered";
  reorderedValue.createdAt = "2026-08-20T21:20:00.000Z";
  reorderedValue.previousIndexPath = "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0001.json";
  reorderedValue.previousIndexHash = index0001.indexHash;
  reorderedValue.entries.reverse();
  const reordered = sealHandoffDocument(reorderedValue, "indexHash");
  assert.throws(() => validateIndexTransition(index0001, reordered), /reordered|substituted/i);

  const reusedValue = clone(index0001);
  reusedValue.indexId = "handoff-index:synthetic-reused";
  reusedValue.createdAt = "2026-08-20T21:20:00.000Z";
  reusedValue.previousIndexPath = "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0001.json";
  reusedValue.previousIndexHash = index0001.indexHash;
  reusedValue.entries[1].actionId = reusedValue.entries[0].actionId;
  const reused = sealHandoffDocument(reusedValue, "indexHash");
  assert.throws(() => validateIndexTransition(index0001, reused), /substituted|Action ID/i);

  const widenedValue = clone(index0001);
  widenedValue.indexId = "handoff-index:synthetic-lifecycle-widened";
  widenedValue.createdAt = "2026-08-20T21:20:00.000Z";
  widenedValue.previousIndexPath = "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0001.json";
  widenedValue.previousIndexHash = index0001.indexHash;
  widenedValue.entries[1].recordedAt = widenedValue.createdAt;
  widenedValue.entries[1].status = "completed";
  widenedValue.entries[1].lifecycle.state = "consumed";
  widenedValue.entries[1].lifecycle.consumedAt = widenedValue.createdAt;
  widenedValue.entries[1].lifecycle.consumedByReceiptId = "handoff-receipt:002:synthetic-widened";
  widenedValue.entries[1].receiptId = "handoff-receipt:002:synthetic-widened";
  widenedValue.entries[1].receiptPath = "portfolio/core/handoff/versions/0.1.0/demonstration/action-002.synthetic-widened.json";
  widenedValue.entries[1].receiptHash = "f".repeat(64);
  widenedValue.entries[1].outcome = "succeeded";
  const widened = sealHandoffDocument(widenedValue, "indexHash");
  assert.throws(() => validateIndexTransition(index0001, widened), /allowed lifecycle transition/i);
});

test("Action 002 synthetic approved, consumed, and reviewed successors remain append-only and source-bound", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clover-handoff-test-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const genesisRelativePath = "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0001.json";
  const approvedRelativePath = "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0002.json";
  const consumedRelativePath = "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0003.json";
  const reviewedRelativePath = "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0004.json";
  const stableRelativePath = "portfolio/core/handoff/index.json";
  const indexSchemaRelativePath = "portfolio/core/handoff/versions/0.1.0/schemas/action-receipt-index.schema.json";
  const attestationPath = "portfolio/core/handoff/versions/0.1.0/approvals/action-002.synthetic.json";
  const resultCapsulePath = "portfolio/core/handoff/versions/0.1.0/cells/clover-warroom.synthetic-reconciled.branch-capsule.json";
  const commit = "1111111111111111111111111111111111111111";
  const tree = "2222222222222222222222222222222222222222";
  const deploymentId = "dpl_syntheticWarRoomPublicMetadata";
  const attestation = createOwnerApprovalAttestation(action002, {
    attestationId: "handoff-approval:002:synthetic",
    ownerId: "owner:chris-dortch",
    decision: "approve",
    approvalStatement: `APPROVE ${action002.actionId} ${action002.envelopeHash}`,
    approvedAt: "2026-08-20T21:25:00.000Z",
    recordingLane: "codex-bounded-approval-recording",
    recordingAuthorizationEvidenceHash: computeHandoffHash({ basis: "synthetic-test-authorization" }, "unused")
  });
  writeJson(tempRoot, attestationPath, attestation);
  const approvedIndex = createOwnerApprovedIndexVersion(index0001, action002, attestation, {
    indexId: "handoff-index:synthetic-approved:20260820",
    createdAt: "2026-08-20T21:25:30.000Z",
    previousIndexPath: genesisRelativePath,
    attestationPath
  });
  assert.deepEqual(validateIndexTransition(index0001, approvedIndex), {
    valid: true,
    transitionedEntries: 1,
    appendedEntries: 0
  });
  const authority = assertActionEnvelopeExecutable(action002, {
    branchCapsule: warroomCapsule,
    index: approvedIndex,
    repositoryRoot: tempRoot,
    now: "2026-08-20T21:26:00.000Z"
  });
  assert.equal(authority.executable, true);
  assert.equal(authority.effectiveAuthority.readPublicMetadata, true);
  assert.equal(authority.effectiveAuthority.recordHandoffArtifacts, true);
  assert.equal(authority.effectiveAuthority.pushCandidateBranch, false);

  assert.throws(() => createOwnerApprovalAttestation(action002, {
    attestationId: "handoff-approval:002:negated",
    ownerId: "owner:chris-dortch",
    decision: "approve",
    approvalStatement: `I do NOT approve ${action002.actionId} ${action002.envelopeHash}; HOLD.`,
    approvedAt: "2026-08-20T21:25:00.000Z",
    recordingLane: "codex-bounded-approval-recording",
    recordingAuthorizationEvidenceHash: computeHandoffHash({ basis: "synthetic-test-authorization" }, "unused")
  }), /exact structured affirmative/i);
  assert.throws(() => createOwnerApprovalAttestation(action002, {
    attestationId: "handoff-approval:002:hold",
    ownerId: "owner:chris-dortch",
    decision: "hold",
    approvalStatement: `APPROVE ${action002.actionId} ${action002.envelopeHash}`,
    approvedAt: "2026-08-20T21:25:00.000Z",
    recordingLane: "codex-bounded-approval-recording",
    recordingAuthorizationEvidenceHash: computeHandoffHash({ basis: "synthetic-test-authorization" }, "unused")
  }), /exact structured affirmative/i);
  assert.throws(() => createOwnerApprovedIndexVersion(approvedIndex, action002, attestation, {
    indexId: "handoff-index:synthetic-replayed-approval",
    createdAt: "2026-08-20T21:25:45.000Z",
    previousIndexPath: "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0002.json",
    attestationPath
  }), /only one|replay/i);

  fs.unlinkSync(path.join(tempRoot, attestationPath));
  assert.throws(() => assertActionEnvelopeExecutable(action002, {
    branchCapsule: warroomCapsule,
    index: approvedIndex,
    repositoryRoot: tempRoot,
    now: "2026-08-20T21:26:00.000Z"
  }), /resolvable.*attestation|approval/i);
  writeJson(tempRoot, attestationPath, attestation);
  const substitutedAttestation = sealHandoffDocument({ ...clone(attestation), ownerId: "owner:substituted" }, "attestationHash");
  writeJson(tempRoot, attestationPath, substitutedAttestation);
  assert.throws(() => assertActionEnvelopeExecutable(action002, {
    branchCapsule: warroomCapsule,
    index: approvedIndex,
    repositoryRoot: tempRoot,
    now: "2026-08-20T21:26:00.000Z"
  }), /approval|owner-gated|substitut/i);
  writeJson(tempRoot, attestationPath, attestation);

  const resultCapsule = sealHandoffDocument({
    ...clone(warroomCapsule),
    capsuleId: "cell-capsule:clover-warroom:synthetic-reconciled",
    recordedAt: "2026-08-20T21:26:30.000Z",
    identities: {
      live: clone(warroomCapsule.identities.live),
      current: {
        status: "verified",
        repository: "chrisdortch/clover-warroom",
        branch: "main",
        commit,
        tree,
        version: null,
        deploymentId: null,
        url: "https://github.com/chrisdortch/clover-warroom",
        observedAt: "2026-08-20T21:26:00.000Z",
        sourceRef: "synthetic-public-github-readback",
        confidence: "high"
      },
      candidate: {
        status: "verified",
        repository: "chrisdortch/clover-warroom",
        branch: "main",
        commit,
        tree,
        version: null,
        deploymentId,
        url: "https://example.invalid/warroom-synthetic-preview",
        observedAt: "2026-08-20T21:26:00.000Z",
        sourceRef: "synthetic-public-vercel-readback",
        confidence: "high"
      }
    },
    links: {
      repository: "chrisdortch/clover-warroom",
      publicUrl: "https://example.invalid/warroom-synthetic-preview",
      sources: [
        { kind: "registry", ref: "portfolio/registry/projects.json#clover-warroom", status: "verified" },
        { kind: "repository", ref: "https://github.com/chrisdortch/clover-warroom", status: "verified" },
        { kind: "deployment", ref: deploymentId, status: "verified" }
      ]
    },
    verification: {
      asOf: "2026-08-20T21:26:00.000Z",
      freshness: "current",
      checkedSources: ["core-registry", "github", "vercel", "clover-context-gateway"],
      unavailableSources: []
    },
    health: { state: "verified-candidate", blockers: [], unknowns: [] },
    rollbackAnchors: [
      { anchorType: "git-commit", identity: commit, status: "verified", sourceRef: "synthetic-public-github-readback" }
    ]
  }, "capsuleHash");
  writeJson(tempRoot, resultCapsulePath, resultCapsule);

  const observations = [
    makeObservation({ id: "observation:warroom-registry", sourceId: "local-canonical-checkout", subject: "portfolio registry WarRoom record", identityKey: "clover-warroom", state: "exact project record resolved" }),
    makeObservation({ id: "observation:warroom-github", sourceId: "github", subject: "public canonical WarRoom repository and branches", identityKey: "chrisdortch/clover-warroom", state: "exact public repository resolved" }),
    makeObservation({ id: "observation:warroom-vercel", sourceId: "vercel", subject: "public WarRoom deployment metadata", identityKey: deploymentId, state: "exact public deployment resolved" }),
    makeObservation({ id: "observation:warroom-gateway", sourceId: "clover-context-gateway", subject: "minimized WarRoom project record", identityKey: "clover-warroom", state: "exact minimized project record resolved" })
  ];
  const check = sealNested({
    checkId: "check:warroom-public-boundary",
    conclusion: "passed",
    summary: "Synthetic public identities were reconciled without private project data or target mutation."
  }, "checkHash");
  const resultingState = {
    projectId: "clover-warroom",
    sourceCommit: commit,
    summary: "Synthetic public repository and deployment identities were reconciled into a new minimized output capsule.",
    persistedReceiptRef: "portfolio/core/handoff/versions/0.1.0/demonstration/action-002-warroom-identity-receipt.json",
    productionStateChanged: false,
    unknowns: []
  };
  const receipt = sealHandoffDocument({
    documentType: "clover-handoff-execution-receipt",
    schemaVersion: "0.1.0",
    actionId: action002.actionId,
    receiptId: "handoff-receipt:002:synthetic-reconciliation",
    envelopeId: action002.envelopeId,
    envelopeHash: action002.envelopeHash,
    branchCapsuleId: warroomCapsule.capsuleId,
    branchCapsuleHash: warroomCapsule.capsuleHash,
    startedAt: "2026-08-20T21:26:00.000Z",
    completedAt: "2026-08-20T21:27:00.000Z",
    executorLane: "codex-bounded-execution",
    source: { bindingRole: "input-capsule", repository: null, branch: null, commit: null, tree: null },
    reconciliation: {
      status: "discovered",
      inputCapsuleId: warroomCapsule.capsuleId,
      inputCapsuleHash: warroomCapsule.capsuleHash,
      resultCapsuleId: resultCapsule.capsuleId,
      resultCapsulePath,
      resultCapsuleHash: resultCapsule.capsuleHash
    },
    outcome: "succeeded",
    observations,
    checks: [check],
    actionsPerformed: ["read-public-metadata", "verify-exact-identity", "assemble-sanitized-receipt", "record-handoff-artifacts"],
    evidenceBindings: [
      { evidenceId: "evidence:warroom-source-identity", kind: "source-identity", bindingType: "observation", boundHashes: observations.map((entry) => entry.evidenceHash) },
      { evidenceId: "evidence:warroom-sanitized-receipt", kind: "receipt", bindingType: "resulting-state", boundHashes: [computeHandoffHash(resultingState, "unused")] }
    ],
    changes: {
      targetSourceMutationPerformed: false,
      changedPaths: [],
      recordedHandoffPaths: [
        resultCapsulePath,
        "portfolio/core/handoff/versions/0.1.0/demonstration/action-002-warroom-identity-receipt.json",
        consumedRelativePath,
        "portfolio/core/handoff/index.json"
      ],
      summary: "Only source-bound Handoff Ledger artifacts were recorded; the target project was not changed."
    },
    candidateEffects: {
      branch: { performed: false, repository: null, branch: null, baseCommit: null },
      commit: { performed: false, commit: null, tree: null },
      push: { performed: false, remoteBranch: null, commit: null },
      draftPullRequest: { performed: false, repository: null, number: null, url: null, baseBranch: null, headBranch: null, headCommit: null }
    },
    previews: [],
    resultingState,
    authorityUsed: {
      readPublicMetadata: true,
      createIsolatedBranch: false,
      commitCandidate: false,
      pushCandidateBranch: false,
      openDraftPullRequest: false,
      runNonProductionChecks: false,
      createNonProductionPreview: false,
      recordHandoffArtifacts: true
    },
    sideEffects: {
      mergePerformed: false,
      productionDeploymentPerformed: false,
      productionDataAccessed: false,
      persistentConfigurationChanged: false,
      domainOrAliasChanged: false,
      secretChanged: false,
      externalMessageSent: false,
      paymentExercised: false,
      purchaseMade: false,
      handoffLedgerArtifactsRecorded: true,
      productionTargetChanged: false
    },
    cost: {
      lane: "existing-local-compute",
      explicitPurchaseOrMoneyMovementUsd: 0,
      providerMeteredUsageCostUsd: null,
      providerMeteredUsageCostStatus: "unknown",
      paidExternalServicePurchased: false
    },
    rollback: {
      anchorType: "no-mutation",
      anchorIdentity: "No WarRoom state may change during identity reconciliation",
      required: false,
      exercised: false
    },
    unknowns: []
  }, "receiptHash");
  assert.equal(validateExecutionReceipt(receipt, {
    branchCapsule: warroomCapsule,
    envelope: action002,
    index: approvedIndex,
    repositoryRoot: tempRoot,
    executionNow: receipt.startedAt
  }).valid, true);

  const consumedValue = clone(approvedIndex);
  consumedValue.indexId = "handoff-index:synthetic-consumed:20260820";
  consumedValue.createdAt = "2026-08-20T21:27:30.000Z";
  consumedValue.previousIndexPath = approvedRelativePath;
  consumedValue.previousIndexHash = approvedIndex.indexHash;
  const consumedEntry = consumedValue.entries[1];
  consumedEntry.recordedAt = consumedValue.createdAt;
  consumedEntry.status = "completed";
  consumedEntry.lifecycle.state = "consumed";
  consumedEntry.lifecycle.consumedAt = receipt.completedAt;
  consumedEntry.lifecycle.consumedByReceiptId = receipt.receiptId;
  consumedEntry.receiptId = receipt.receiptId;
  consumedEntry.receiptPath = receipt.resultingState.persistedReceiptRef;
  consumedEntry.receiptHash = receipt.receiptHash;
  consumedEntry.outcome = receipt.outcome;
  const consumedIndex = sealHandoffDocument(consumedValue, "indexHash");
  assert.deepEqual(validateIndexTransition(approvedIndex, consumedIndex), {
    valid: true,
    transitionedEntries: 1,
    appendedEntries: 0
  });

  const reviewPath = "portfolio/core/handoff/versions/0.1.0/reviews/action-002.synthetic.json";
  const review = sealHandoffDocument({
    documentType: "clover-handoff-independent-review-decision",
    schemaVersion: "0.1.0",
    decisionId: "handoff-review:002:synthetic-indexed",
    reviewedAt: "2026-08-20T21:28:00.000Z",
    reviewer: { reviewerId: "reviewer:synthetic-independent", independenceDeclared: true, executionLaneDifferent: true },
    receiptId: receipt.receiptId,
    receiptHash: receipt.receiptHash,
    envelopeId: action002.envelopeId,
    envelopeHash: action002.envelopeHash,
    decision: "approve",
    findings: [],
    authority: {
      decisionIsMergeApproval: false,
      decisionIsProductionDeploymentApproval: false,
      decisionIsProductionDataApproval: false,
      decisionIsStandingAuthority: false
    }
  }, "decisionHash");
  const reviewedValue = clone(consumedIndex);
  reviewedValue.indexId = "handoff-index:synthetic-reviewed:20260820";
  reviewedValue.createdAt = "2026-08-20T21:28:30.000Z";
  reviewedValue.previousIndexPath = consumedRelativePath;
  reviewedValue.previousIndexHash = consumedIndex.indexHash;
  reviewedValue.entries[1].recordedAt = reviewedValue.createdAt;
  reviewedValue.entries[1].review = {
    status: "completed",
    decisionId: review.decisionId,
    decisionPath: reviewPath,
    decisionHash: review.decisionHash
  };
  const reviewedIndex = sealHandoffDocument(reviewedValue, "indexHash");
  assert.deepEqual(validateIndexTransition(consumedIndex, reviewedIndex), {
    valid: true,
    transitionedEntries: 1,
    appendedEntries: 0
  });

  for (const [relativePath, value] of [
    [genesisRelativePath, index0001],
    [index0001.entries[0].envelopePath, action001],
    [index0001.entries[1].envelopePath, action002],
    [index0001.entries[0].receiptPath, receipt001],
    [receipt.resultingState.persistedReceiptRef, receipt],
    [reviewPath, review]
  ]) writeJson(tempRoot, relativePath, value);
  const schemaTarget = path.join(tempRoot, indexSchemaRelativePath);
  fs.mkdirSync(path.dirname(schemaTarget), { recursive: true });
  fs.copyFileSync(path.join(versionRoot, "schemas/action-receipt-index.schema.json"), schemaTarget);
  const immutableSnapshotBytes = new Map([
    [genesisRelativePath, fs.readFileSync(path.join(tempRoot, genesisRelativePath))]
  ]);

  for (const [latest, expectedDepth, expectedSnapshotPath, receipts, reviews] of [
    [approvedIndex, 2, approvedRelativePath, [receipt001], []],
    [consumedIndex, 3, consumedRelativePath, [receipt001, receipt], []],
    [reviewedIndex, 4, reviewedRelativePath, [receipt001, receipt], [review]]
  ]) {
    writeJson(tempRoot, expectedSnapshotPath, latest);
    immutableSnapshotBytes.set(expectedSnapshotPath, fs.readFileSync(path.join(tempRoot, expectedSnapshotPath)));
    writeJson(tempRoot, stableRelativePath, latest);
    const chain = validateHandoffIndexChain(tempRoot, { historicalIndexHash: genesisIndexHash });
    assert.equal(chain.status, "passed");
    assert.equal(chain.depth, expectedDepth);
    assert.equal(chain.currentIndexHash, latest.indexHash);
    assert.equal(chain.currentSnapshotPath, expectedSnapshotPath);
    assert.equal(chain.historicalIndexHash, genesisIndexHash);
    assert.equal(chain.historicalSnapshotPath, genesisRelativePath);
    if (expectedDepth > 1) assert.notEqual(chain.currentSnapshotPath, chain.historicalSnapshotPath);
    for (const [snapshotPath, originalBytes] of immutableSnapshotBytes) {
      assert.equal(fs.readFileSync(path.join(tempRoot, snapshotPath)).equals(originalBytes), true);
    }
    assert.equal(validateHandoffLedger({
      branchCapsules: cells,
      envelopes: [action001, action002],
      receipts,
      reviews,
      index: latest
    }, { repositoryRoot: tempRoot, now: "2026-08-20T21:29:00.000Z" }).valid, true);
  }
  assert.equal(review.authority.decisionIsMergeApproval, false);
  assert.equal(review.authority.decisionIsProductionDeploymentApproval, false);
  assert.equal(review.authority.decisionIsProductionDataApproval, false);
  assert.equal(review.authority.decisionIsStandingAuthority, false);

  const unresolvedCapsule = sealHandoffDocument({
    ...clone(resultCapsule),
    identities: clone(warroomCapsule.identities),
    rollbackAnchors: clone(warroomCapsule.rollbackAnchors)
  }, "capsuleHash");
  writeJson(tempRoot, resultCapsulePath, unresolvedCapsule);
  const invalidReceipt = resealReceipt({
    ...clone(receipt),
    reconciliation: {
      ...clone(receipt.reconciliation),
      resultCapsuleId: unresolvedCapsule.capsuleId,
      resultCapsuleHash: unresolvedCapsule.capsuleHash
    }
  });
  assert.throws(() => validateExecutionReceipt(invalidReceipt, {
    branchCapsule: warroomCapsule,
    envelope: action002,
    index: approvedIndex,
    repositoryRoot: tempRoot,
    executionNow: invalidReceipt.startedAt
  }), /verified public source|verified repository|reconciliation/i);

  const expiredAttestation = clone(attestation);
  expiredAttestation.approvedAt = action002.expiresAt;
  assert.throws(() => createOwnerApprovedIndexVersion(index0001, action002, sealHandoffDocument(expiredAttestation, "attestationHash"), {
    indexId: "handoff-index:synthetic-expired",
    createdAt: action002.expiresAt,
    previousIndexPath: "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0001.json",
    attestationPath
  }), /expired|validity/i);
});

const expectedAction004Paths = Object.freeze([
  "portfolio/core/handoff/versions/0.1.0/cells/clover-launch-studio-private-owner.branch-capsule.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2a/phase-b-0.2a-context-pack.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2a/phase-b-0.2a-impact-scan.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2a/phase-b-0.2a-budget.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2a/phase-b-0.2a-acceptance-contract.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2a/phase-b-0.2a-build-charter.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2a/phase-b-0.2a-executor-work-order.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2a/action-004-source-envelope.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2a/phase-b-0.2a-proposal-manifest.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2a/PHASE_B_0.2A_PROPOSAL.md",
  "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0002.json",
  "portfolio/core/handoff/index.json",
  "portfolio/core/test/handoff-ledger.test.mjs",
  "portfolio/core/test/publication-finalization.test.mjs"
]);

const expectedAction004AppPaths = Object.freeze([
  "apps/clover-launch-studio/package.json",
  "apps/clover-launch-studio/package-lock.json",
  "apps/clover-launch-studio/tsconfig.json",
  "apps/clover-launch-studio/next.config.mjs",
  "apps/clover-launch-studio/src/app/layout.tsx",
  "apps/clover-launch-studio/src/app/page.tsx",
  "apps/clover-launch-studio/src/app/globals.css",
  "apps/clover-launch-studio/src/app/api/health/route.ts",
  "apps/clover-launch-studio/src/middleware.ts",
  "apps/clover-launch-studio/src/app/sign-in/[[...sign-in]]/page.tsx",
  "apps/clover-launch-studio/src/app/access-denied/page.tsx",
  "apps/clover-launch-studio/src/app/api/sessions/route.ts",
  "apps/clover-launch-studio/src/app/api/sessions/[sessionId]/route.ts",
  "apps/clover-launch-studio/src/app/api/sessions/[sessionId]/events/route.ts",
  "apps/clover-launch-studio/src/app/api/sessions/[sessionId]/export/route.ts",
  "apps/clover-launch-studio/src/app/api/sessions/[sessionId]/restore/route.ts",
  "apps/clover-launch-studio/src/app/api/sessions/[sessionId]/handoff/route.ts",
  "apps/clover-launch-studio/src/components/launch-studio-shell.tsx",
  "apps/clover-launch-studio/src/components/transcript-editor.tsx",
  "apps/clover-launch-studio/src/components/progress-timeline.tsx",
  "apps/clover-launch-studio/src/components/decision-rail.tsx",
  "apps/clover-launch-studio/src/components/preview-pane.tsx",
  "apps/clover-launch-studio/src/lib/config.ts",
  "apps/clover-launch-studio/src/lib/auth.ts",
  "apps/clover-launch-studio/src/lib/acl.ts",
  "apps/clover-launch-studio/src/lib/crypto.ts",
  "apps/clover-launch-studio/src/lib/storage.ts",
  "apps/clover-launch-studio/src/lib/launch-session-service.ts",
  "apps/clover-launch-studio/src/lib/handoff-codex-adapter.ts",
  "apps/clover-launch-studio/test/launch-studio-app.test.mjs",
  "apps/clover-launch-studio/test/launch-studio-browser.test.mjs"
]);

const expectedAction004AcceptanceIds = Object.freeze([
  "accept_auth_anonymous_deny",
  "accept_auth_clerk_validation",
  "accept_auth_subject_binding",
  "accept_acl_isolation",
  "accept_event_append_only",
  "accept_storage_encryption",
  "accept_artifact_cas",
  "accept_transcript_integrity",
  "accept_transcript_successor",
  "accept_raw_audio_false",
  "accept_retention_deletion",
  "accept_export_restore",
  "accept_memory_separation",
  "accept_chatgpt_read_only",
  "accept_handoff_default_deny",
  "accept_approval_noninheritance",
  "accept_codex_boundary",
  "accept_progress_evidence",
  "accept_budget_structural",
  "accept_budget_failure_stop",
  "accept_purchase_zero",
  "accept_local_node_matrix",
  "accept_browser_desktop",
  "accept_browser_mobile",
  "accept_accessibility",
  "accept_browser_runtime",
  "accept_workflow_integrity",
  "accept_privacy_authority",
  "accept_stage_one_no_provider",
  "accept_source_rollback"
]);

const expectedAction004AllowedActions = Object.freeze([
  "read-public-metadata",
  "verify-exact-identity",
  "verify-local-cleanliness",
  "verify-source-ancestry",
  "create-isolated-branch",
  "commit-candidate",
  "record-handoff-artifacts"
]);

const expectedAction004ProviderClassifications = Object.freeze([
  "Clerk: candidate provider, unselected",
  "Neon: candidate provider, unselected",
  "Vercel Blob: candidate provider, unselected",
  "Vercel hosting: candidate provider, unprovisioned"
]);

const expectedAction004FailureStops = Object.freeze([
  "Stop after the same failure signature occurs twice.",
  "Stop after one repair loop produces no new evidence.",
  "Maximum future repair loops remains three; Action 004 has no repair authority."
]);

function listFilesRecursively(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFilesRecursively(absolute));
    else files.push(absolute);
  }
  return files;
}

function assertFutureAction004ReceiptContract(receipt) {
  assert.deepEqual(receipt.source, {
    bindingRole: "target-source",
    repository: action004.target.repository,
    branch: action004.target.branch,
    commit: action004.target.expectedCommit,
    tree: action004Capsule.identities.current.tree
  });
  assert.deepEqual(receipt.candidateEffects.branch, {
    performed: true,
    repository: action004WorkOrder.repository,
    branch: action004WorkOrder.worktreeBranch,
    baseCommit: action004WorkOrder.baseCommit
  });
  assert.equal(receipt.candidateEffects.commit.performed, true);
  assert.match(receipt.candidateEffects.commit.commit, /^[a-f0-9]{40}$/u);
  assert.match(receipt.candidateEffects.commit.tree, /^[a-f0-9]{40}$/u);
  assert.notEqual(receipt.candidateEffects.commit.commit, receipt.source.commit);
  assert.ok(receipt.changes.changedPaths.length > 0);
  assert.equal(new Set(receipt.changes.changedPaths).size, receipt.changes.changedPaths.length);
  assert.ok(receipt.changes.changedPaths.every((entry) => action004WorkOrder.allowedPaths.includes(entry)));
  assert.equal(receipt.changes.changedPaths.includes(".github/workflows/clover-required-main-gate.yml"), false);
  return true;
}

test("Action 004 persists one closed 14-path source-bound proposal and immutable index successor", () => {
  const schemaRecords = [
    ["launch-context-pack.schema.json", action004ContextPack],
    ["impact-scan.schema.json", action004ImpactScan],
    ["session-budget.schema.json", action004Budget],
    ["acceptance-contract.schema.json", action004Acceptance],
    ["build-charter.schema.json", action004Charter],
    ["executor-work-order.schema.json", action004WorkOrder]
  ];
  for (const [schema, record] of schemaRecords) assert.equal(validateContract(schema, record, record.recordId).valid, true);
  for (const record of [action004ContextPack, action004ImpactScan, action004Acceptance, action004Charter, action004WorkOrder]) {
    assert.equal(assertRecordHash(record), true);
  }
  assert.equal(assertBuildCharter(action004Charter), true);
  assert.equal(assertExecutorWorkOrder(action004WorkOrder), true);
  assert.equal(validateBranchCapsule(action004Capsule).valid, true);

  assert.deepEqual(action004Manifest.artifactPaths, expectedAction004Paths);
  assert.equal(action004Manifest.artifactPaths.length, 14);
  assert.equal(action004Manifest.artifactPathListHash, sha256Canonical(expectedAction004Paths));
  assert.deepEqual(action004Manifest.generatedDocumentPaths, expectedAction004Paths.slice(0, 12));
  for (const relativePath of expectedAction004Paths) {
    const stat = fs.lstatSync(path.join(repositoryRoot, relativePath));
    assert.equal(stat.isFile(), true);
    assert.equal(stat.isSymbolicLink(), false);
  }

  const manifestUnsigned = clone(action004Manifest);
  delete manifestUnsigned.manifestHash;
  assert.equal(action004Manifest.manifestHash, sha256Canonical(manifestUnsigned));
  assert.deepEqual(Object.keys(action004Manifest).sort(), [
    "artifactPathListHash", "artifactPaths", "authority", "createdAt", "documentType",
    "embeddedTruthStatuses", "generatedDocumentPaths", "humanReport", "indexSuccessor",
    "manifestHash", "manifestId", "proposalVersion", "providerClassifications", "futureSessionControls", "publicationGate", "records",
    "schemaVersion", "source", "sourceDestinationSeparation"
  ].sort());
  assert.equal(action004Manifest.records.length, 8);
  for (const binding of action004Manifest.records) {
    assert.deepEqual(Object.keys(binding).sort(), [
      "canonicalRecordHashIncludingSelfHash", "documentType", "path", "rawByteSha256",
      "recordId", "selfHashExcludingOwnField", "selfHashField"
    ].sort());
    const bytes = fs.readFileSync(path.join(repositoryRoot, binding.path));
    const record = JSON.parse(bytes);
    assert.equal(sha256Bytes(bytes), binding.rawByteSha256);
    assert.equal(sha256Canonical(record), binding.canonicalRecordHashIncludingSelfHash);
    if (binding.selfHashField === null) assert.equal(binding.selfHashExcludingOwnField, null);
    else assert.equal(record[binding.selfHashField], binding.selfHashExcludingOwnField);
  }
  const reportBytes = fs.readFileSync(path.join(repositoryRoot, action004Manifest.humanReport.path));
  assert.equal(sha256Bytes(reportBytes), action004Manifest.humanReport.rawByteSha256);

  for (const [status, expectedKeys] of [
    [action004Manifest.embeddedTruthStatuses.providerStorage, [
      "blobStoreRequired", "candidates", "consequentialAuthorityGranted", "databaseRequired", "deletionStatus",
      "deploymentRequired", "documentType", "domainRequired", "encryptionHierarchyStatus", "environmentVariableRequired",
      "keyDestructionStatus", "localAdaptersRequired", "oauthRegistrationRequired", "providerAccountRequired",
      "providerNeutralPorts", "purchaseRequired", "recordHash", "recordId", "resourcesProvisioned", "retentionStatus",
      "schemaVersion", "secretRequired", "selectedProviders", "syntheticAdaptersRequired"
    ]],
    [action004Manifest.embeddedTruthStatuses.speech, [
      "consequentialAuthorityGranted", "documentType", "exactReviewedTranscriptRequired",
      "hostAssistedSpeechToReviewedTranscript", "nativeInAppVoiceImplemented", "personalChatGptMemoryIngested",
      "rawAudioRetained", "recordHash", "recordId", "schemaVersion", "textFallbackRequired", "truthLabel"
    ]],
    [action004Manifest.embeddedTruthStatuses.repair, [
      "automaticDiagnoseFixRetestSupportedByCurrentAction", "consequentialAuthorityGranted", "currentHandoffVersion",
      "currentOperation", "documentType", "failedValidationRequiresSeparateRepairAuthority", "futureOptions",
      "maximumFutureRepairLoops", "previewAuthorized", "pushAuthorized", "recordHash", "recordId",
      "schemaVersion", "separateValidationActionRequired"
    ]]
  ]) {
    assert.deepEqual(Object.keys(status).sort(), expectedKeys.sort());
    const unsigned = clone(status);
    delete unsigned.recordHash;
    assert.equal(status.recordHash, sha256Canonical(unsigned));
  }
  for (const candidate of action004Manifest.embeddedTruthStatuses.providerStorage.candidates) {
    assert.deepEqual(Object.keys(candidate).sort(), ["provider", "role", "status"]);
  }

  assert.deepEqual(validateIndexTransition(index0001, index0002), {
    valid: true,
    transitionedEntries: 0,
    appendedEntries: 1
  });
  assert.equal(sha256Canonical(index0001.entries[0]), "28d6cd8a65375c4bff902d2d048b114c335041cbc50332769c9b271b165354a0");
  assert.equal(sha256Canonical(index0001.entries[1]), "0f0e94e337c57629278cddd303ae31675a70b5be6ee8a499357e1739eaa223f5");
  assert.deepEqual(index0002.entries.slice(0, 2), index0001.entries);
  assert.equal(fs.readFileSync(stableIndexPath).equals(fs.readFileSync(action004IndexPath)), true);
  const chain = validateHandoffIndexChain(repositoryRoot, { historicalIndexHash: genesisIndexHash });
  assert.equal(chain.depth, 2);
  assert.equal(chain.currentSnapshotPath, "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0002.json");

  const absentActionId = ["CLOVER", "2026", "08", "24", "003"].join("-");
  const absentEnvelopePrefix = ["handoff-action", "003"].join(":");
  const handoffText = listFilesRecursively(handoffRoot).map((filename) => fs.readFileSync(filename, "utf8")).join("\n");
  assert.equal(handoffText.includes(absentActionId), false);
  assert.equal(handoffText.includes(absentEnvelopePrefix), false);
  assert.equal(index0002.entries.filter((entry) => entry.actionId === action004.actionId).length, 1);
  assert.equal(fs.existsSync(path.join(repositoryRoot, "apps/clover-launch-studio")), false);
});

test("Action 004 separates verified main from the future branch and safely narrows one unsupported action", () => {
  const destination = "feature/clover-launch-studio-private-owner-app-v0.2a-20260824";
  assert.deepEqual(action004.target, {
    projectId: "clover-launch-studio-private-owner",
    repository: "chrisdortch/first",
    branch: "main",
    expectedCommit: "e5688c771d384d80a8c723cfa655298ce8257889",
    environment: "local-checkout"
  });
  assert.deepEqual(action004Capsule.identities.current, {
    status: "verified",
    repository: "chrisdortch/first",
    branch: "main",
    commit: "e5688c771d384d80a8c723cfa655298ce8257889",
    tree: "4c84129b4fb5ea098ac9d2325bc2cb387857a471",
    version: "source-baseline-only",
    deploymentId: null,
    url: null,
    observedAt: action004.createdAt,
    sourceRef: "github:chrisdortch/first#main@e5688c771d384d80a8c723cfa655298ce8257889",
    confidence: "high"
  });
  for (const [role, status] of [["live", "not-applicable"], ["candidate", "unknown"]]) {
    const identity = action004Capsule.identities[role];
    assert.equal(identity.status, status);
    for (const field of ["repository", "branch", "commit", "tree", "version", "deploymentId", "url", "observedAt", "sourceRef"]) {
      assert.equal(identity[field], null);
    }
    assert.equal(identity.confidence, "unknown");
  }
  assert.equal(Object.values(action004Capsule.identities).some((identity) => identity.branch === destination), false);
  assert.equal(action004WorkOrder.worktreeBranch, destination);
  assert.equal(action004WorkOrder.repository, action004.target.repository);
  assert.equal(action004WorkOrder.baseCommit, action004.target.expectedCommit);
  assert.deepEqual(action004.scope.allowedActions, expectedAction004AllowedActions);
  assert.deepEqual(Object.entries(action004.requestedAuthority).filter(([, enabled]) => enabled).map(([field]) => field).sort(), [
    "commitCandidate", "createIsolatedBranch", "readPublicMetadata", "recordHandoffArtifacts"
  ]);
  assert.equal(Object.values(action004.authority).every((value) => value === false), true);

  const pending = validateActionEnvelope(action004, {
    branchCapsule: action004Capsule,
    index: index0002,
    repositoryRoot,
    now: new Date(Date.parse(action004.createdAt) + 1_000).toISOString()
  });
  assert.deepEqual(pending, {
    valid: true,
    executable: false,
    reason: "owner-approval-required",
    effectiveAuthority: action004.authority
  });
  const substitutedTarget = sealHandoffDocument({
    ...clone(action004),
    target: { ...action004.target, branch: destination }
  }, "envelopeHash");
  assert.throws(() => validateActionEnvelope(substitutedTarget, { branchCapsule: action004Capsule }),
    (error) => error.code === "HANDOFF_TARGET_SUBSTITUTION");
  const substitutedSource = sealHandoffDocument({
    ...clone(action004),
    target: { ...action004.target, expectedCommit: "f".repeat(40) }
  }, "envelopeHash");
  assert.throws(() => validateActionEnvelope(substitutedSource, { branchCapsule: action004Capsule }),
    (error) => error.code === "HANDOFF_TARGET_SUBSTITUTION");

  const unsupported = clone(action004);
  unsupported.scope.allowedActions.splice(6, 0, "assemble-sanitized-receipt");
  assert.throws(() => validateActionEnvelope(sealHandoffDocument(unsupported, "envelopeHash"), {
    branchCapsule: action004Capsule
  }), (error) => error.code === "HANDOFF_OPERATION_DENIED" && /outside the operation/u.test(error.message));
  const report = fs.readFileSync(path.join(phaseBProposalRoot, "PHASE_B_0.2A_PROPOSAL.md"), "utf8");
  assert.match(report, /does not enroll `assemble-sanitized-receipt`/u);
  assert.match(report, /safely narrowed to the exact seven runtime-enrolled actions/u);
  assert.match(report, /No authority is widened/u);
  assert.match(report, /`record-handoff-artifacts` remains requested/u);

  assert.throws(() => validateActionEnvelope(action004, {
    branchCapsule: action004Capsule,
    index: index0002,
    repositoryRoot,
    now: action004.expiresAt
  }), (error) => error.code === "HANDOFF_EXPIRED");
  assert.equal(Date.parse(action004.expiresAt) - Date.parse(action004.createdAt), 72 * 60 * 60 * 1000);
  const entry = index0002.entries[2];
  assert.equal(entry.status, "pending");
  assert.equal(entry.lifecycle.state, "proposed");
  assert.equal(entry.ownerApproval.status, "pending");
  for (const field of ["approvedAt", "approvedEnvelopeHash", "approvalEvidenceHash", "attestationId", "attestationPath", "attestationHash"]) {
    assert.equal(entry.ownerApproval[field], null);
  }
  assert.equal(entry.receiptId, null);
});

test("Action 004 hash graph, 30-test contract, provider truth and future receipt contract stay exact", () => {
  assert.deepEqual(action004Acceptance.tests.map((entry) => entry.testId), expectedAction004AcceptanceIds);
  assert.equal(action004Acceptance.tests.length, 30);
  assert.deepEqual(action004Charter.allowedPaths, expectedAction004AppPaths);
  assert.deepEqual(action004WorkOrder.allowedPaths, expectedAction004AppPaths);
  assert.deepEqual(action004.scope.allowedWritePaths, expectedAction004AppPaths);
  assert.equal(expectedAction004AppPaths.length, 31);
  assert.equal(expectedAction004AppPaths.includes(".github/workflows/clover-required-main-gate.yml"), false);
  expectedAction004AppPaths.forEach((entry) => assert.equal(assertSafeRepositoryPattern(entry), true));
  assert.equal(action004Charter.prohibitedPaths.includes(".github/workflows/clover-required-main-gate.yml"), true);

  assert.equal(action004ImpactScan.contextPackHash, sha256Canonical(action004ContextPack));
  assert.equal(action004Charter.contextPackHash, sha256Canonical(action004ContextPack));
  assert.equal(action004Charter.impactScanHash, sha256Canonical(action004ImpactScan));
  assert.equal(action004Charter.acceptanceContractHash, sha256Canonical(action004Acceptance));
  assert.equal(action004Charter.budgetId, action004Budget.recordId);
  assert.equal(action004WorkOrder.charterId, action004Charter.recordId);
  assert.equal(action004WorkOrder.contextPackHash, sha256Canonical(action004ContextPack));
  assert.equal(action004WorkOrder.impactScanHash, sha256Canonical(action004ImpactScan));
  assert.equal(action004WorkOrder.sessionUsageCeilingId, action004Budget.recordId);
  assert.equal(action004WorkOrder.handoffAuthorityReferenceId, action004.envelopeId);

  const expectedBoundHashes = new Map([
    ["context-pack", sha256Canonical(action004ContextPack)],
    ["impact-scan", sha256Canonical(action004ImpactScan)],
    ["budget", sha256Canonical(action004Budget)],
    ["acceptance-contract", sha256Canonical(action004Acceptance)],
    ["build-charter", sha256Canonical(action004Charter)],
    ["executor-work-order", sha256Canonical(action004WorkOrder)]
  ]);
  for (const [kind, hash] of expectedBoundHashes) {
    const expectedIdentity = `${kind}:canonical:${hash}`;
    assert.equal(action004.sourceRequirements.some((entry) => entry.expectedIdentity === expectedIdentity), true);
    assert.equal(action004.readbackRequirements.some((entry) => entry.expectedIdentity === expectedIdentity), true);
  }
  assert.equal(action004.sourceRequirements.some((entry) => entry.expectedIdentity.includes(action004Manifest.manifestHash)), false);
  assert.equal(action004.readbackRequirements.some((entry) => entry.expectedIdentity.includes(action004Manifest.manifestHash)), false);

  assert.deepEqual({
    maximumModelCalls: action004Budget.maximumModelCalls,
    maximumImplementationAgents: action004Budget.maximumImplementationAgents,
    maximumRepairLoops: action004Budget.maximumRepairLoops,
    maximumElapsedMinutes: action004Budget.maximumElapsedMinutes,
    maximumProviderCiRuns: action004Budget.maximumProviderCiRuns,
    maximumTargetNullPreviews: action004Budget.maximumTargetNullPreviews,
    explicitPurchaseCeilingUsd: action004Budget.explicitPurchaseCeilingUsd,
    automaticAdditionalCreditPurchase: action004Budget.automaticAdditionalCreditPurchase
  }, {
    maximumModelCalls: 12,
    maximumImplementationAgents: 2,
    maximumRepairLoops: 3,
    maximumElapsedMinutes: 120,
    maximumProviderCiRuns: 1,
    maximumTargetNullPreviews: 1,
    explicitPurchaseCeilingUsd: 0,
    automaticAdditionalCreditPurchase: false
  });
  assert.equal(action004Budget.repeatedFailureStop, true);
  assert.equal(action004Budget.noNewEvidenceStop, true);
  assert.equal(action004.requestedAuthority.runNonProductionChecks, false);
  assert.equal(action004.requestedAuthority.createNonProductionPreview, false);
  assert.equal(action004WorkOrder.repairLoopBudget, 0);

  assert.deepEqual(action004ContextPack.sharedResources.providers, expectedAction004ProviderClassifications);
  assert.deepEqual(action004ImpactScan.authenticationBoundaries.filter((entry) => expectedAction004ProviderClassifications.includes(entry)), expectedAction004ProviderClassifications);
  assert.deepEqual(action004Charter.scope.filter((entry) => expectedAction004ProviderClassifications.includes(entry)), expectedAction004ProviderClassifications);
  assert.deepEqual(action004WorkOrder.testPlan.filter((entry) => expectedAction004ProviderClassifications.includes(entry)), expectedAction004ProviderClassifications);
  assert.deepEqual(action004Manifest.providerClassifications, expectedAction004ProviderClassifications);
  for (const classification of expectedAction004ProviderClassifications) assert.equal(action004Report.includes(classification), true);
  assert.deepEqual(action004Charter.stopConditions.slice(-3), expectedAction004FailureStops);
  assert.deepEqual(action004WorkOrder.stopConditions.slice(-3), expectedAction004FailureStops);
  const failureTest = action004Acceptance.tests.find((entry) => entry.testId === "accept_budget_failure_stop");
  assert.equal(failureTest.requirement, "Stop after the same failure signature occurs twice; stop after one repair loop produces no new evidence; maximum future repair loops remains three.");
  assert.equal(action004Manifest.futureSessionControls.repeatedFailureStop, expectedAction004FailureStops[0]);
  assert.equal(action004Manifest.futureSessionControls.noNewEvidenceStop, expectedAction004FailureStops[1]);
  assert.equal(action004Manifest.futureSessionControls.action004ValidationRepairCiPreviewAuthority, false);
  assert.equal(action004Report.includes(expectedAction004FailureStops[0]), true);
  assert.equal(action004Report.includes(expectedAction004FailureStops[1]), true);

  const { providerStorage, speech, repair } = action004Manifest.embeddedTruthStatuses;
  assert.deepEqual(providerStorage.candidates.map(({ provider, status }) => [provider, status]), [
    ["Clerk", "candidate-unselected"],
    ["Neon", "candidate-unselected"],
    ["Vercel Blob", "candidate-unselected"],
    ["Vercel hosting", "candidate-unprovisioned"]
  ]);
  assert.equal(providerStorage.resourcesProvisioned, false);
  assert.deepEqual(providerStorage.selectedProviders, []);
  assert.equal(providerStorage.providerAccountRequired, false);
  assert.equal(providerStorage.databaseRequired, false);
  assert.equal(providerStorage.blobStoreRequired, false);
  assert.equal(providerStorage.secretRequired, false);
  assert.deepEqual({
    hostAssistedSpeechToReviewedTranscript: speech.hostAssistedSpeechToReviewedTranscript,
    nativeInAppVoiceImplemented: speech.nativeInAppVoiceImplemented,
    rawAudioRetained: speech.rawAudioRetained,
    exactReviewedTranscriptRequired: speech.exactReviewedTranscriptRequired,
    textFallbackRequired: speech.textFallbackRequired,
    personalChatGptMemoryIngested: speech.personalChatGptMemoryIngested
  }, {
    hostAssistedSpeechToReviewedTranscript: true,
    nativeInAppVoiceImplemented: false,
    rawAudioRetained: false,
    exactReviewedTranscriptRequired: true,
    textFallbackRequired: true,
    personalChatGptMemoryIngested: false
  });
  assert.deepEqual({
    automaticDiagnoseFixRetestSupportedByCurrentAction: repair.automaticDiagnoseFixRetestSupportedByCurrentAction,
    separateValidationActionRequired: repair.separateValidationActionRequired,
    failedValidationRequiresSeparateRepairAuthority: repair.failedValidationRequiresSeparateRepairAuthority,
    maximumFutureRepairLoops: repair.maximumFutureRepairLoops,
    pushAuthorized: repair.pushAuthorized,
    previewAuthorized: repair.previewAuthorized
  }, {
    automaticDiagnoseFixRetestSupportedByCurrentAction: false,
    separateValidationActionRequired: true,
    failedValidationRequiresSeparateRepairAuthority: true,
    maximumFutureRepairLoops: 3,
    pushAuthorized: false,
    previewAuthorized: false
  });

  const receipt = {
    source: {
      bindingRole: "target-source",
      repository: "chrisdortch/first",
      branch: "main",
      commit: "e5688c771d384d80a8c723cfa655298ce8257889",
      tree: "4c84129b4fb5ea098ac9d2325bc2cb387857a471"
    },
    candidateEffects: {
      branch: {
        performed: true,
        repository: "chrisdortch/first",
        branch: "feature/clover-launch-studio-private-owner-app-v0.2a-20260824",
        baseCommit: "e5688c771d384d80a8c723cfa655298ce8257889"
      },
      commit: { performed: true, commit: "a".repeat(40), tree: "b".repeat(40) }
    },
    changes: { changedPaths: [expectedAction004AppPaths[0], expectedAction004AppPaths.at(-1)] }
  };
  assert.equal(assertFutureAction004ReceiptContract(receipt), true);
  for (const mutate of [
    (copy) => { copy.source.branch = action004WorkOrder.worktreeBranch; },
    (copy) => { copy.source.tree = "c".repeat(40); },
    (copy) => { copy.candidateEffects.branch.repository = "other/repository"; },
    (copy) => { copy.candidateEffects.branch.branch = "feature/substituted"; },
    (copy) => { copy.candidateEffects.branch.baseCommit = "d".repeat(40); },
    (copy) => { copy.candidateEffects.commit.commit = null; },
    (copy) => { copy.candidateEffects.commit.tree = null; },
    (copy) => { copy.changes.changedPaths.push(".github/workflows/clover-required-main-gate.yml"); },
    (copy) => { copy.changes.changedPaths.push("../escape"); }
  ]) {
    const substituted = clone(receipt);
    mutate(substituted);
    assert.throws(() => assertFutureAction004ReceiptContract(substituted));
  }
  assert.ok(action004WorkOrder.returnReceiptRequirements.some((entry) => entry.includes(action004WorkOrder.worktreeBranch)));
  assert.ok(action004WorkOrder.returnReceiptRequirements.some((entry) => entry.includes(action004Capsule.identities.current.tree)));
  assert.ok(action004WorkOrder.returnReceiptRequirements.some((entry) => entry.includes("exact subset")));
});

test("Action 004 expiry, single use, traversal and symlink boundaries fail closed", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clover-action004-boundary-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const actionCreatedAt = Date.parse(action004.createdAt);
  const approvedAt = new Date(actionCreatedAt + 60_000).toISOString();
  const approvedIndexCreatedAt = new Date(actionCreatedAt + 120_000).toISOString();
  const executableAt = new Date(actionCreatedAt + 180_000).toISOString();
  const consumedAt = new Date(actionCreatedAt + 3_600_000).toISOString();
  const consumedIndexCreatedAt = new Date(actionCreatedAt + 3_600_001).toISOString();
  const replayAt = new Date(actionCreatedAt + 3_660_000).toISOString();
  const attestationPath = "portfolio/core/handoff/versions/0.1.0/approvals/action-004.synthetic.json";
  const attestation = createOwnerApprovalAttestation(action004, {
    attestationId: "handoff-approval:004:synthetic",
    ownerId: "owner:chris-dortch",
    decision: "approve",
    approvalStatement: `APPROVE ${action004.actionId} ${action004.envelopeHash}`,
    approvedAt,
    recordingLane: "codex-bounded-approval-recording",
    recordingAuthorizationEvidenceHash: sha256Canonical({ basis: "synthetic-action004-test" })
  });
  writeJson(tempRoot, attestationPath, attestation);
  const approvedIndex = createOwnerApprovedIndexVersion(index0002, action004, attestation, {
    indexId: "handoff-index:action-004-synthetic-approved",
    createdAt: approvedIndexCreatedAt,
    previousIndexPath: "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0002.json",
    attestationPath
  });
  const approved = assertActionEnvelopeExecutable(action004, {
    branchCapsule: action004Capsule,
    index: approvedIndex,
    repositoryRoot: tempRoot,
    now: executableAt
  });
  assert.equal(approved.executable, true);
  assert.deepEqual(Object.entries(approved.effectiveAuthority).filter(([, enabled]) => enabled).map(([field]) => field).sort(), [
    "commitCandidate", "createIsolatedBranch", "readPublicMetadata", "recordHandoffArtifacts"
  ]);

  const consumedValue = clone(approvedIndex);
  consumedValue.indexId = "handoff-index:action-004-synthetic-consumed";
  consumedValue.createdAt = consumedIndexCreatedAt;
  consumedValue.previousIndexPath = "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0003.json";
  consumedValue.previousIndexHash = approvedIndex.indexHash;
  const entry = consumedValue.entries[2];
  entry.recordedAt = consumedValue.createdAt;
  entry.status = "completed";
  entry.lifecycle.state = "consumed";
  entry.lifecycle.consumedAt = consumedAt;
  entry.lifecycle.consumedByReceiptId = "handoff-receipt:004:synthetic";
  entry.receiptId = "handoff-receipt:004:synthetic";
  entry.receiptPath = "portfolio/core/handoff/versions/0.1.0/receipts/action-004.synthetic.json";
  entry.receiptHash = "e".repeat(64);
  entry.outcome = "succeeded";
  const consumedIndex = sealHandoffDocument(consumedValue, "indexHash");
  assert.throws(() => assertActionEnvelopeExecutable(action004, {
    branchCapsule: action004Capsule,
    index: consumedIndex,
    repositoryRoot: tempRoot,
    now: replayAt
  }), (error) => error.code === "HANDOFF_REPLAY_DENIED");

  assert.throws(() => assertSafeRepositoryPath("../escape"), /unsafe|traversal/u);
  assert.throws(() => resolveRegularRepositoryFile(tempRoot, "../escape", "Action 004 artifact"), /unsafe|traversal/u);
  const isolatedRoot = path.join(tempRoot, "isolated");
  fs.mkdirSync(isolatedRoot);
  fs.writeFileSync(path.join(tempRoot, "outside.json"), "{}\n");
  fs.symlinkSync("../outside.json", path.join(isolatedRoot, "linked.json"));
  assert.throws(() => resolveRegularRepositoryFile(isolatedRoot, "linked.json", "Action 004 artifact"), /symbolic link/u);
});
