import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalize, sha256Bytes, sha256Canonical } from "../lib/canonical-json.mjs";
import {
  assertActionEnvelopeExecutable,
  assertSanitizedHandoffDocument,
  canonicalOwnerApprovalStatement,
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
const phaseB02bProposalRoot = path.join(versionRoot, "proposals/launch-studio-phase-b-0.2b");
const action005IndexPath = path.join(versionRoot, "indexes/action-receipt-index-0003.json");
const action004Revocation = readJson(path.join(phaseB02bProposalRoot, "action-004-revocation.json"));
const action005 = readJson(path.join(phaseB02bProposalRoot, "action-005-source-envelope.json"));
const action005ContextPack = readJson(path.join(phaseB02bProposalRoot, "phase-b-0.2b-context-pack.json"));
const action005ImpactScan = readJson(path.join(phaseB02bProposalRoot, "phase-b-0.2b-impact-scan.json"));
const action005Budget = readJson(path.join(phaseB02bProposalRoot, "phase-b-0.2b-budget.json"));
const action005Acceptance = readJson(path.join(phaseB02bProposalRoot, "phase-b-0.2b-acceptance-contract.json"));
const action005Charter = readJson(path.join(phaseB02bProposalRoot, "phase-b-0.2b-build-charter.json"));
const action005WorkOrder = readJson(path.join(phaseB02bProposalRoot, "phase-b-0.2b-executor-work-order.json"));
const action005Manifest = readJson(path.join(phaseB02bProposalRoot, "phase-b-0.2b-proposal-manifest.json"));
const action005Report = fs.readFileSync(path.join(phaseB02bProposalRoot, "PHASE_B_0.2B_PROPOSAL.md"), "utf8");
const index0003 = readJson(action005IndexPath);
const phaseB02cProposalRoot = path.join(versionRoot, "proposals/launch-studio-phase-b-0.2c");
const action006IndexPath = path.join(versionRoot, "indexes/action-receipt-index-0004.json");
const action005Revocation = readJson(path.join(phaseB02cProposalRoot, "action-005-revocation.json"));
const action006 = readJson(path.join(phaseB02cProposalRoot, "action-006-source-envelope.json"));
const action006ContextPack = readJson(path.join(phaseB02cProposalRoot, "phase-b-0.2c-context-pack.json"));
const action006ImpactScan = readJson(path.join(phaseB02cProposalRoot, "phase-b-0.2c-impact-scan.json"));
const action006Budget = readJson(path.join(phaseB02cProposalRoot, "phase-b-0.2c-budget.json"));
const action006Acceptance = readJson(path.join(phaseB02cProposalRoot, "phase-b-0.2c-acceptance-contract.json"));
const action006Charter = readJson(path.join(phaseB02cProposalRoot, "phase-b-0.2c-build-charter.json"));
const action006WorkOrder = readJson(path.join(phaseB02cProposalRoot, "phase-b-0.2c-executor-work-order.json"));
const action006Manifest = readJson(path.join(phaseB02cProposalRoot, "phase-b-0.2c-proposal-manifest.json"));
const action006Report = fs.readFileSync(path.join(phaseB02cProposalRoot, "PHASE_B_0.2C_PROPOSAL.md"), "utf8");
const index0004 = readJson(action006IndexPath);

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
  assert.equal(fs.readFileSync(stableIndexPath).equals(fs.readFileSync(action006IndexPath)), true);
  const chain = validateHandoffIndexChain(repositoryRoot, { historicalIndexHash: genesisIndexHash });
  assert.equal(chain.depth, 4);
  assert.equal(chain.currentSnapshotPath, "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0004.json");

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

const expectedAction005Paths = Object.freeze([
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2b/action-004-revocation.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2b/phase-b-0.2b-context-pack.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2b/phase-b-0.2b-impact-scan.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2b/phase-b-0.2b-budget.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2b/phase-b-0.2b-acceptance-contract.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2b/phase-b-0.2b-build-charter.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2b/phase-b-0.2b-executor-work-order.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2b/action-005-source-envelope.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2b/phase-b-0.2b-proposal-manifest.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2b/PHASE_B_0.2B_PROPOSAL.md",
  "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0003.json",
  "portfolio/core/handoff/index.json",
  "portfolio/core/test/handoff-ledger.test.mjs",
  "portfolio/core/test/publication-finalization.test.mjs"
]);

const expectedAction005AllowedActions = Object.freeze([
  "read-public-metadata",
  "verify-exact-identity",
  "verify-local-cleanliness",
  "verify-source-ancestry",
  "create-isolated-branch",
  "commit-candidate",
  "record-handoff-artifacts"
]);

const expectedAction005RecordingPaths = Object.freeze([
  "portfolio/core/handoff/versions/0.1.0/receipts/action-005-launch-studio-phase-b-source-receipt.json",
  "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0005.json",
  "portfolio/core/handoff/index.json"
]);

const expectedAction005ApprovalPaths = Object.freeze([
  "portfolio/core/handoff/versions/0.1.0/approvals/action-005-launch-studio-phase-b-source-approval.json",
  "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0004.json",
  "portfolio/core/handoff/index.json"
]);

const expectedAction005Destination = [
  "feature",
  "clover-launch-studio-private-owner-app-v0.2b-20260824"
].join("/");

const expectedAction005FailureStops = Object.freeze([
  "Stop after the same failure signature occurs twice.",
  "Stop after one repair loop produces no new evidence.",
  "Maximum future repair loops remains three; Action 005 has no repair authority."
]);

function assertFutureAction005ReceiptContract(receipt) {
  assert.deepEqual(receipt.source, {
    bindingRole: "target-source",
    repository: action005.target.repository,
    branch: action005.target.branch,
    commit: action005.target.expectedCommit,
    tree: action004Capsule.identities.current.tree
  });
  assert.deepEqual(receipt.candidateEffects.branch, {
    performed: true,
    repository: action005WorkOrder.repository,
    branch: action005WorkOrder.worktreeBranch,
    baseCommit: action005WorkOrder.baseCommit
  });
  assert.equal(receipt.candidateEffects.commit.performed, true);
  assert.match(receipt.candidateEffects.commit.commit, /^[a-f0-9]{40}$/u);
  assert.match(receipt.candidateEffects.commit.tree, /^[a-f0-9]{40}$/u);
  assert.notEqual(receipt.candidateEffects.commit.commit, receipt.source.commit);
  assert.ok(receipt.changes.changedPaths.length > 0);
  assert.equal(new Set(receipt.changes.changedPaths).size, receipt.changes.changedPaths.length);
  assert.ok(receipt.changes.changedPaths.every((entry) => action005WorkOrder.allowedPaths.includes(entry)));
  assert.deepEqual(receipt.changes.recordedHandoffPaths, expectedAction005RecordingPaths);
  assert.equal(receipt.changes.changedPaths.includes(".github/workflows/clover-required-main-gate.yml"), false);
  return true;
}

test("Action 005 persists one closed 14-path successor proposal with exact hashes, truth and zero authority", () => {
  const schemaRecords = [
    ["launch-context-pack.schema.json", action005ContextPack],
    ["impact-scan.schema.json", action005ImpactScan],
    ["session-budget.schema.json", action005Budget],
    ["acceptance-contract.schema.json", action005Acceptance],
    ["build-charter.schema.json", action005Charter],
    ["executor-work-order.schema.json", action005WorkOrder]
  ];
  for (const [schema, record] of schemaRecords) assert.equal(validateContract(schema, record, record.recordId).valid, true);
  for (const record of [action005ContextPack, action005ImpactScan, action005Acceptance, action005Charter, action005WorkOrder]) {
    assert.equal(assertRecordHash(record), true);
  }
  assert.equal(assertBuildCharter(action005Charter), true);
  assert.equal(assertExecutorWorkOrder(action005WorkOrder), true);
  assert.equal(assertSanitizedHandoffDocument(action004Revocation, "Action 004 proposal-local revocation evidence"), true);

  assert.deepEqual(action005Manifest.artifactPaths, expectedAction005Paths);
  assert.equal(action005Manifest.artifactPaths.length, 14);
  assert.equal(action005Manifest.artifactPathListHash, sha256Canonical(expectedAction005Paths));
  assert.deepEqual(action005Manifest.generatedDocumentPaths, expectedAction005Paths.slice(0, 12));
  for (const relativePath of expectedAction005Paths) {
    const stat = fs.lstatSync(path.join(repositoryRoot, relativePath));
    assert.equal(stat.isFile(), true);
    assert.equal(stat.isSymbolicLink(), false);
  }

  assert.deepEqual(Object.keys(action004Revocation).sort(), [
    "consequentialAuthorityGranted", "documentType", "historicalRecordRewritten", "reason", "recordId",
    "revocationHash", "revokedAt", "schemaVersion", "successorActionId", "synthetic",
    "targetActionId", "targetEnvelopeHash", "targetEnvelopeId"
  ].sort());
  const unsignedRevocation = clone(action004Revocation);
  delete unsignedRevocation.revocationHash;
  assert.equal(action004Revocation.revocationHash, sha256Canonical(unsignedRevocation));
  assert.equal(action004Revocation.documentType, "clover-handoff-action-revocation-evidence");
  assert.equal(action004Revocation.schemaVersion, "0.2b");
  assert.equal(action004Revocation.recordId, "handoff-revocation:004:action-005-successor");
  assert.equal(action004Revocation.targetActionId, action004.actionId);
  assert.equal(action004Revocation.targetEnvelopeId, action004.envelopeId);
  assert.equal(action004Revocation.targetEnvelopeHash, action004.envelopeHash);
  assert.equal(action004Revocation.reason, "execution-consumption-index-path-not-authorized");
  assert.equal(action004Revocation.synthetic, false);
  assert.equal(action004Revocation.historicalRecordRewritten, false);
  assert.equal(action004Revocation.consequentialAuthorityGranted, false);
  assert.equal(action004Revocation.successorActionId, action005.actionId);

  const manifestUnsigned = clone(action005Manifest);
  delete manifestUnsigned.manifestHash;
  assert.equal(action005Manifest.manifestHash, sha256Canonical(manifestUnsigned));
  assert.deepEqual(Object.keys(action005Manifest).sort(), [
    "actionSource", "artifactPathListHash", "artifactPaths", "authority", "createdAt", "documentType",
    "embeddedTruthStatuses", "futureSessionControls", "generatedDocumentPaths", "humanReport", "indexSuccessor",
    "lifecyclePlan", "manifestHash", "manifestId", "proposalVersion", "providerClassifications",
    "publicationGate", "records", "schemaVersion", "source", "sourceDestinationSeparation"
  ].sort());
  assert.equal(action005Manifest.records.length, 9);
  assert.equal(action005Manifest.records.some((binding) => binding.path === expectedAction005Paths[8]), false);
  assert.equal(action005Manifest.records.some((binding) => [
    expectedAction005Paths[9], expectedAction005Paths[10], expectedAction005Paths[11],
    expectedAction005Paths[12], expectedAction005Paths[13]
  ].includes(binding.path)), false);
  for (const binding of action005Manifest.records) {
    assert.deepEqual(Object.keys(binding).sort(), [
      "canonicalRecordHashIncludingSelfHash", "documentType", "path", "rawByteSha256",
      "recordId", "selfHashExcludingOwnField", "selfHashField"
    ].sort());
    const bytes = fs.readFileSync(path.join(repositoryRoot, binding.path));
    const record = JSON.parse(bytes);
    assert.equal(sha256Bytes(bytes), binding.rawByteSha256);
    assert.equal(sha256Canonical(record), binding.canonicalRecordHashIncludingSelfHash);
    if (binding.selfHashField === null) assert.equal(binding.selfHashExcludingOwnField, null);
    else {
      const unsigned = clone(record);
      delete unsigned[binding.selfHashField];
      assert.equal(record[binding.selfHashField], binding.selfHashExcludingOwnField);
      assert.equal(record[binding.selfHashField], sha256Canonical(unsigned));
    }
  }
  const revocationBindings = action005Manifest.records.filter((binding) =>
    binding.path === expectedAction005Paths[0]);
  assert.equal(revocationBindings.length, 1);
  assert.equal(revocationBindings[0].documentType, action004Revocation.documentType);
  assert.equal(revocationBindings[0].recordId, action004Revocation.recordId);
  assert.equal(revocationBindings[0].selfHashField, "revocationHash");
  assert.equal(revocationBindings[0].selfHashExcludingOwnField, action004Revocation.revocationHash);
  assert.deepEqual(action005Manifest.lifecyclePlan, {
    revokedActionId: action004.actionId,
    revocationEvidencePath: expectedAction005Paths[0],
    revocationEvidenceHash: action004Revocation.revocationHash,
    proposedIndexPath: expectedAction005Paths[10],
    approvalAttestationPath: expectedAction005ApprovalPaths[0],
    approvalIndexPath: expectedAction005ApprovalPaths[1],
    executionReceiptPath: expectedAction005RecordingPaths[0],
    consumptionIndexPath: expectedAction005RecordingPaths[1],
    stableRootPath: expectedAction005RecordingPaths[2],
    approvalPathsAreExecutionEffects: false,
    syntheticRehearsalPersisted: false
  });
  const reportBytes = fs.readFileSync(path.join(repositoryRoot, action005Manifest.humanReport.path));
  assert.equal(sha256Bytes(reportBytes), action005Manifest.humanReport.rawByteSha256);
  assert.equal(Buffer.byteLength(action005Report), action005Manifest.humanReport.utf8Bytes);
  assert.match(action005Report, /no native revocation-record schema or evidence resolver/u);
  assert.match(action005Report, /Synthetic approval and receipt records are not persisted/u);

  assert.deepEqual(action005Acceptance.tests.map((entry) => entry.testId), expectedAction004AcceptanceIds);
  assert.equal(action005Acceptance.tests.length, 30);
  assert.deepEqual(action005Charter.allowedPaths, expectedAction004AppPaths);
  assert.deepEqual(action005WorkOrder.allowedPaths, expectedAction004AppPaths);
  assert.deepEqual(action005.scope.allowedWritePaths, expectedAction004AppPaths);
  assert.equal(action005.scope.allowedWritePaths.length, 31);
  assert.equal(action005.scope.allowedWritePaths.includes(".github/workflows/clover-required-main-gate.yml"), false);
  assert.deepEqual(action005.scope.allowedActions, expectedAction005AllowedActions);
  assert.equal(action005.scope.allowedActions.includes("assemble-sanitized-receipt"), false);
  assert.deepEqual(action005.scope.allowedRecordingPaths, expectedAction005RecordingPaths);
  assert.equal(action005.scope.allowedRecordingPaths.includes(expectedAction005ApprovalPaths[0]), false);
  assert.equal(action005.scope.allowedRecordingPaths.includes(expectedAction005ApprovalPaths[1]), false);
  assert.equal(action005.scope.allowedRecordingPaths.includes(expectedAction005Paths[10]), false);

  assert.deepEqual(action005.target, {
    projectId: "clover-launch-studio-private-owner",
    repository: "chrisdortch/first",
    branch: "main",
    expectedCommit: "e5688c771d384d80a8c723cfa655298ce8257889",
    environment: "local-checkout"
  });
  assert.equal(action005WorkOrder.repository, action005.target.repository);
  assert.equal(action005WorkOrder.baseCommit, action005.target.expectedCommit);
  assert.equal(action005WorkOrder.worktreeBranch, expectedAction005Destination);
  const destinationBearingDocuments = expectedAction005Paths.slice(0, 12).filter((relativePath) =>
    fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8").includes(expectedAction005Destination));
  assert.deepEqual(destinationBearingDocuments, [expectedAction005Paths[4], expectedAction005Paths[6]]);
  assert.equal(JSON.stringify(action005Acceptance).includes(expectedAction005Destination), true);
  assert.equal(JSON.stringify(action005WorkOrder).includes(expectedAction005Destination), true);
  assert.deepEqual(action005Manifest.sourceDestinationSeparation, {
    envelopeTargetBranch: action005.target.branch,
    envelopeTargetCommit: action005.target.expectedCommit,
    destinationDefinitionPath: expectedAction005Paths[6],
    destinationBranchExists: false,
    destinationRepresentedAsVerified: false
  });
  assert.equal(action005Manifest.source.commit, "3bf01627272d6c3a3da578dc7080b441e4fa3d47");
  assert.equal(action005Manifest.source.tree, "e30153603796d12539444d88c4ca7f36ffc8fd04");
  assert.deepEqual(action005Manifest.source.orderedParents, [
    "e5688c771d384d80a8c723cfa655298ce8257889",
    "c7a2720e6c60b0cfce945ef315d0df7ae010e892"
  ]);
  assert.equal(action005ContextPack.sources[0].sourceId, "source_owner_authorization_action_005_v02b_14_path_001");
  assert.equal(action005ContextPack.sources[0].contentHash, "d3f34519bae23cd5e459eb5b387c6a6c2f8277a7602fe024317803622d4fee83");
  assert.equal(action005ImpactScan.contextPackHash, sha256Canonical(action005ContextPack));
  assert.equal(action005Charter.contextPackHash, sha256Canonical(action005ContextPack));
  assert.equal(action005Charter.impactScanHash, sha256Canonical(action005ImpactScan));
  assert.equal(action005Charter.acceptanceContractHash, sha256Canonical(action005Acceptance));
  assert.equal(action005WorkOrder.charterId, action005Charter.recordId);
  assert.equal(action005WorkOrder.contextPackHash, sha256Canonical(action005ContextPack));
  assert.equal(action005WorkOrder.impactScanHash, sha256Canonical(action005ImpactScan));
  assert.equal(action005WorkOrder.handoffAuthorityReferenceId, action005.envelopeId);

  const expectedBoundHashes = new Map([
    ["context-pack", sha256Canonical(action005ContextPack)],
    ["impact-scan", sha256Canonical(action005ImpactScan)],
    ["budget", sha256Canonical(action005Budget)],
    ["acceptance-contract", sha256Canonical(action005Acceptance)],
    ["build-charter", sha256Canonical(action005Charter)],
    ["executor-work-order", sha256Canonical(action005WorkOrder)]
  ]);
  for (const [kind, hash] of expectedBoundHashes) {
    assert.equal(action005.sourceRequirements.some((entry) => entry.expectedIdentity === `${kind}:canonical:${hash}`), true);
    assert.equal(action005.readbackRequirements.some((entry) => entry.expectedIdentity === `${kind}:canonical:${hash}`), true);
  }
  assert.equal(action005.sourceRequirements.some((entry) => entry.expectedIdentity.includes(action005Manifest.manifestHash)), false);
  assert.equal(action005.readbackRequirements.some((entry) => entry.expectedIdentity.includes(action005Manifest.manifestHash)), false);

  assert.deepEqual({
    maximumModelCalls: action005Budget.maximumModelCalls,
    maximumImplementationAgents: action005Budget.maximumImplementationAgents,
    maximumRepairLoops: action005Budget.maximumRepairLoops,
    maximumElapsedMinutes: action005Budget.maximumElapsedMinutes,
    maximumProviderCiRuns: action005Budget.maximumProviderCiRuns,
    maximumTargetNullPreviews: action005Budget.maximumTargetNullPreviews,
    explicitPurchaseCeilingUsd: action005Budget.explicitPurchaseCeilingUsd,
    automaticAdditionalCreditPurchase: action005Budget.automaticAdditionalCreditPurchase
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
  assert.equal(action005Budget.repeatedFailureStop, true);
  assert.equal(action005Budget.noNewEvidenceStop, true);
  assert.equal(action005.requestedAuthority.runNonProductionChecks, false);
  assert.equal(action005.requestedAuthority.createNonProductionPreview, false);
  assert.equal(action005WorkOrder.repairLoopBudget, 0);
  assert.deepEqual(action005Charter.stopConditions.slice(-3), expectedAction005FailureStops);
  assert.deepEqual(action005WorkOrder.stopConditions.slice(-3), expectedAction005FailureStops);
  assert.equal(action005Manifest.futureSessionControls.repeatedFailureStop, expectedAction005FailureStops[0]);
  assert.equal(action005Manifest.futureSessionControls.noNewEvidenceStop, expectedAction005FailureStops[1]);
  assert.equal(action005Manifest.futureSessionControls.action005ValidationRepairCiPreviewAuthority, false);

  assert.deepEqual(action005ContextPack.sharedResources.providers, expectedAction004ProviderClassifications);
  assert.deepEqual(action005ImpactScan.authenticationBoundaries.filter((entry) =>
    expectedAction004ProviderClassifications.includes(entry)), expectedAction004ProviderClassifications);
  assert.deepEqual(action005Charter.scope.filter((entry) =>
    expectedAction004ProviderClassifications.includes(entry)), expectedAction004ProviderClassifications);
  assert.deepEqual(action005WorkOrder.testPlan.filter((entry) =>
    expectedAction004ProviderClassifications.includes(entry)), expectedAction004ProviderClassifications);
  assert.deepEqual(action005Manifest.providerClassifications, expectedAction004ProviderClassifications);
  for (const classification of expectedAction004ProviderClassifications) assert.equal(action005Report.includes(classification), true);

  const { providerStorage, speech, repair } = action005Manifest.embeddedTruthStatuses;
  for (const status of [providerStorage, speech, repair]) {
    const unsigned = clone(status);
    delete unsigned.recordHash;
    assert.equal(status.recordHash, sha256Canonical(unsigned));
  }
  assert.deepEqual(providerStorage.candidates.map(({ provider, status }) => [provider, status]), [
    ["Clerk", "candidate-unselected"],
    ["Neon", "candidate-unselected"],
    ["Vercel Blob", "candidate-unselected"],
    ["Vercel hosting", "candidate-unprovisioned"]
  ]);
  assert.equal(providerStorage.resourcesProvisioned, false);
  assert.deepEqual(providerStorage.selectedProviders, []);
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
  assert.equal(Object.values(action005.authority).every((value) => value === false), true);
  assert.deepEqual(Object.entries(action005.requestedAuthority).filter(([, enabled]) => enabled)
    .map(([field]) => field).sort(), [
    "commitCandidate", "createIsolatedBranch", "readPublicMetadata", "recordHandoffArtifacts"
  ]);
  assert.equal(Date.parse(action005.expiresAt) - Date.parse(action005.createdAt), 72 * 60 * 60 * 1000);
});

test("Action 005 index 0003 revokes Action 004, appends one proposal and preserves history", () => {
  assert.deepEqual(validateIndexTransition(index0002, index0003), {
    valid: true,
    transitionedEntries: 1,
    appendedEntries: 1
  });
  assert.equal(index0003.previousIndexPath, "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0002.json");
  assert.equal(index0003.previousIndexHash, "80cf1221d705eb7c62f50e2d9e63f849d82a42bc35365b3f730975bdff5729a9");
  assert.deepEqual(index0003.entries.slice(0, 2), index0002.entries.slice(0, 2));
  assert.equal(sha256Canonical(index0003.entries[0]), "28d6cd8a65375c4bff902d2d048b114c335041cbc50332769c9b271b165354a0");
  assert.equal(sha256Canonical(index0003.entries[1]), "0f0e94e337c57629278cddd303ae31675a70b5be6ee8a499357e1739eaa223f5");
  assert.equal(index0003.entries.some((entry) => entry.actionId === "CLOVER-2026-08-24-003"), false);

  const before004 = index0002.entries[2];
  const revoked004 = index0003.entries[2];
  assert.deepEqual({
    sequence: revoked004.sequence,
    actionId: revoked004.actionId,
    branchCapsuleId: revoked004.branchCapsuleId,
    branchCapsuleHash: revoked004.branchCapsuleHash,
    envelopeId: revoked004.envelopeId,
    envelopePath: revoked004.envelopePath,
    envelopeHash: revoked004.envelopeHash
  }, {
    sequence: before004.sequence,
    actionId: before004.actionId,
    branchCapsuleId: before004.branchCapsuleId,
    branchCapsuleHash: before004.branchCapsuleHash,
    envelopeId: before004.envelopeId,
    envelopePath: before004.envelopePath,
    envelopeHash: before004.envelopeHash
  });
  assert.equal(revoked004.status, "pending");
  assert.equal(revoked004.lifecycle.state, "revoked");
  assert.equal(revoked004.lifecycle.revokedAt, action004Revocation.revokedAt);
  assert.equal(revoked004.lifecycle.revokedAt, index0003.createdAt);
  assert.equal(revoked004.recordedAt, index0003.createdAt);
  assert.equal(revoked004.lifecycle.revocationEvidenceHash, action004Revocation.revocationHash);
  assert.equal(revoked004.lifecycle.consumedAt, null);
  assert.equal(revoked004.lifecycle.consumedByReceiptId, null);
  assert.deepEqual(revoked004.ownerApproval, before004.ownerApproval);
  assert.equal(revoked004.receiptId, before004.receiptId);
  assert.equal(revoked004.receiptPath, before004.receiptPath);
  assert.equal(revoked004.receiptHash, before004.receiptHash);
  assert.equal(revoked004.outcome, before004.outcome);
  assert.deepEqual(revoked004.review, before004.review);

  const proposed005 = index0003.entries[3];
  assert.equal(proposed005.sequence, 4);
  assert.equal(proposed005.actionId, action005.actionId);
  assert.equal(proposed005.envelopeId, action005.envelopeId);
  assert.equal(proposed005.envelopeHash, action005.envelopeHash);
  assert.equal(proposed005.status, "pending");
  assert.equal(proposed005.lifecycle.state, "proposed");
  assert.equal(proposed005.lifecycle.revokedAt, null);
  assert.equal(proposed005.lifecycle.revocationEvidenceHash, null);
  assert.equal(proposed005.ownerApproval.status, "pending");
  assert.equal(proposed005.receiptId, null);
  assert.equal(proposed005.outcome, "pending");
  assert.equal(proposed005.review.status, "pending");
  assert.equal(fs.readFileSync(stableIndexPath).equals(fs.readFileSync(action005IndexPath)), false);
  assert.equal(fs.readFileSync(stableIndexPath).equals(fs.readFileSync(action006IndexPath)), true);

  const pending = validateActionEnvelope(action005, {
    branchCapsule: action004Capsule,
    index: index0003,
    repositoryRoot,
    now: new Date(Date.parse(action005.createdAt) + 1_000).toISOString()
  });
  assert.deepEqual(pending, {
    valid: true,
    executable: false,
    reason: "owner-approval-required",
    effectiveAuthority: action005.authority
  });
  assert.throws(() => assertActionEnvelopeExecutable(action005, {
    branchCapsule: action004Capsule,
    index: index0003,
    repositoryRoot,
    now: new Date(Date.parse(action005.createdAt) + 1_000).toISOString()
  }), (error) => error.code === "HANDOFF_DEFAULT_DENY");
  assert.throws(() => assertActionEnvelopeExecutable(action004, {
    branchCapsule: action004Capsule,
    index: index0003,
    repositoryRoot,
    now: new Date(Date.parse(action005.createdAt) + 1_000).toISOString()
  }), (error) => error.code === "HANDOFF_REVOKED");

  const chain = validateHandoffIndexChain(repositoryRoot, { historicalIndexHash: genesisIndexHash });
  assert.equal(chain.depth, 4);
  assert.equal(chain.currentIndexHash, index0004.indexHash);
  assert.equal(chain.currentSnapshotPath, "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0004.json");
  assert.equal(fs.existsSync(path.join(repositoryRoot,
    "portfolio/core/handoff/versions/0.1.0/approvals/action-005-launch-studio-phase-b-source-approval.json")), false);
  assert.equal(fs.existsSync(path.join(repositoryRoot,
    "portfolio/core/handoff/versions/0.1.0/receipts/action-005-launch-studio-phase-b-source-receipt.json")), false);
  assert.equal(fs.existsSync(path.join(repositoryRoot, "apps/clover-launch-studio")), false);
});

test("Action 005 deterministic synthetic approval and consumption rehearsal is lifecycle-complete and fail-closed", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clover-action005-lifecycle-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const approvalPath = "portfolio/core/handoff/versions/0.1.0/approvals/action-005-launch-studio-phase-b-source-approval.json";
  const approvalIndexPath = "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0004.json";
  const receiptPath = expectedAction005RecordingPaths[0];
  const consumptionIndexPath = expectedAction005RecordingPaths[1];
  const approvedAt = new Date(Date.parse(action005.createdAt) + 60_000).toISOString();
  const approvalIndexCreatedAt = new Date(Date.parse(action005.createdAt) + 120_000).toISOString();
  const executionStartedAt = new Date(Date.parse(action005.createdAt) + 180_000).toISOString();
  const executionCompletedAt = new Date(Date.parse(action005.createdAt) + 240_000).toISOString();
  const consumptionIndexCreatedAt = new Date(Date.parse(action005.createdAt) + 300_000).toISOString();
  const candidateCommit = "5".repeat(40);
  const candidateTree = "6".repeat(40);

  const approvalStatement = canonicalOwnerApprovalStatement(action005);
  assert.equal(approvalStatement, `APPROVE ${action005.actionId} ${action005.envelopeHash}`);
  const attestation = createOwnerApprovalAttestation(action005, {
    attestationId: "handoff-approval:006:synthetic-lifecycle-rehearsal",
    ownerId: "owner:chris-dortch",
    decision: "approve",
    approvalStatement,
    approvedAt,
    recordingLane: "codex-bounded-approval-recording",
    recordingAuthorizationEvidenceHash: sha256Canonical({ basis: "synthetic-action005-lifecycle-rehearsal" })
  });
  writeJson(tempRoot, approvalPath, attestation);
  const approvedIndex = createOwnerApprovedIndexVersion(index0003, action005, attestation, {
    indexId: "handoff-index:action-005-synthetic-approved:20260824",
    createdAt: approvalIndexCreatedAt,
    previousIndexPath: "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0003.json",
    attestationPath: approvalPath
  });
  assert.deepEqual(validateIndexTransition(index0003, approvedIndex), {
    valid: true,
    transitionedEntries: 1,
    appendedEntries: 0
  });
  assert.equal(approvedIndex.previousIndexPath, "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0003.json");
  assert.equal(approvedIndex.previousIndexHash, index0003.indexHash);
  assert.equal(approvedIndex.entries[2].lifecycle.state, "revoked");
  assert.equal(approvedIndex.entries[2].lifecycle.revocationEvidenceHash, action004Revocation.revocationHash);
  assert.equal(approvedIndex.entries[3].status, "pending");
  assert.equal(approvedIndex.entries[3].lifecycle.state, "available");
  assert.equal(approvedIndex.entries[3].ownerApproval.status, "approved");
  assert.equal(approvedIndex.entries[3].ownerApproval.attestationPath, approvalPath);
  assert.equal(approvedIndex.entries[3].ownerApproval.attestationHash, attestation.attestationHash);

  const executable = assertActionEnvelopeExecutable(action005, {
    branchCapsule: action004Capsule,
    index: approvedIndex,
    repositoryRoot: tempRoot,
    now: executionStartedAt
  });
  assert.equal(executable.executable, true);
  assert.deepEqual(Object.entries(executable.effectiveAuthority).filter(([, enabled]) => enabled)
    .map(([field]) => field).sort(), [
    "commitCandidate", "createIsolatedBranch", "readPublicMetadata", "recordHandoffArtifacts"
  ]);
  assert.throws(() => assertActionEnvelopeExecutable(action005, {
    branchCapsule: action004Capsule,
    index: approvedIndex,
    repositoryRoot: tempRoot,
    now: action005.expiresAt
  }), (error) => error.code === "HANDOFF_EXPIRED");
  assert.throws(() => assertActionEnvelopeExecutable(action005, {
    branchCapsule: action004Capsule,
    index: index0003,
    repositoryRoot: tempRoot,
    now: executionStartedAt
  }), (error) => error.code === "HANDOFF_DEFAULT_DENY");
  assert.throws(() => assertActionEnvelopeExecutable(action004, {
    branchCapsule: action004Capsule,
    index: approvedIndex,
    repositoryRoot: tempRoot,
    now: executionStartedAt
  }), (error) => error.code === "HANDOFF_REVOKED");

  const observations = action005.readbackRequirements.map((readback, offset) => {
    const sourceRequirement = action005.sourceRequirements[offset];
    assert.equal(readback.connector, sourceRequirement.sourceId);
    assert.equal(readback.expectedIdentity, sourceRequirement.expectedIdentity);
    return sealNested({
      observationId: `observation:action005-source-${offset + 1}`,
      sourceId: readback.connector,
      subject: readback.subject,
      observedIdentity: readback.expectedIdentity,
      identityKey: readback.expectedIdentity,
      availability: "available",
      identityResolution: "exact-resolved",
      state: "synthetic exact source and canonical record identity verified",
      observedAt: executionStartedAt,
      evidenceRef: `synthetic-action005-readback:${offset + 1}`
    }, "evidenceHash");
  });
  const cleanlinessCheck = sealNested({
    checkId: "check:action005-synthetic-cleanliness",
    conclusion: "passed",
    summary: "Synthetic source checkout is clean before the isolated candidate branch is created."
  }, "checkHash");
  const ancestryCheck = sealNested({
    checkId: "check:action005-synthetic-ancestry",
    conclusion: "passed",
    summary: "Synthetic candidate branch base binds exact immutable source commit e5688c771d384d80a8c723cfa655298ce8257889."
  }, "checkHash");
  const resultingState = {
    projectId: action005.target.projectId,
    sourceCommit: candidateCommit,
    summary: "Synthetic source-only candidate identity recorded; validation, push, PR, provider and preview remain absent.",
    persistedReceiptRef: receiptPath,
    productionStateChanged: false,
    unknowns: []
  };
  const syntheticReceipt = sealHandoffDocument({
    documentType: "clover-handoff-execution-receipt",
    schemaVersion: "0.1.0",
    actionId: action005.actionId,
    receiptId: "handoff-receipt:005:synthetic-lifecycle-rehearsal",
    envelopeId: action005.envelopeId,
    envelopeHash: action005.envelopeHash,
    branchCapsuleId: action004Capsule.capsuleId,
    branchCapsuleHash: action004Capsule.capsuleHash,
    startedAt: executionStartedAt,
    completedAt: executionCompletedAt,
    executorLane: "codex-bounded-execution",
    source: {
      bindingRole: "target-source",
      repository: action005.target.repository,
      branch: action005.target.branch,
      commit: action005.target.expectedCommit,
      tree: action004Capsule.identities.current.tree
    },
    reconciliation: {
      status: "not-applicable",
      inputCapsuleId: action004Capsule.capsuleId,
      inputCapsuleHash: action004Capsule.capsuleHash,
      resultCapsuleId: null,
      resultCapsulePath: null,
      resultCapsuleHash: null
    },
    outcome: "succeeded",
    observations,
    checks: [cleanlinessCheck, ancestryCheck],
    actionsPerformed: expectedAction005AllowedActions,
    evidenceBindings: [
      {
        evidenceId: "evidence:action-005-source-identity",
        kind: "source-identity",
        bindingType: "observation",
        boundHashes: observations.map((entry) => entry.evidenceHash)
      },
      {
        evidenceId: "evidence:action-005-cleanliness",
        kind: "cleanliness",
        bindingType: "check",
        boundHashes: [cleanlinessCheck.checkHash]
      },
      {
        evidenceId: "evidence:action-005-ancestry",
        kind: "ancestry",
        bindingType: "check",
        boundHashes: [ancestryCheck.checkHash]
      },
      {
        evidenceId: "evidence:action-005-receipt",
        kind: "receipt",
        bindingType: "resulting-state",
        boundHashes: [sha256Canonical(resultingState)]
      }
    ],
    changes: {
      targetSourceMutationPerformed: true,
      changedPaths: [
        expectedAction004AppPaths[0],
        expectedAction004AppPaths[4],
        expectedAction004AppPaths.at(-1)
      ],
      recordedHandoffPaths: expectedAction005RecordingPaths,
      summary: "Synthetic source-only candidate commit and exact Handoff receipt lifecycle; no validation, publication or provider effect."
    },
    candidateEffects: {
      branch: {
        performed: true,
        repository: action005WorkOrder.repository,
        branch: action005WorkOrder.worktreeBranch,
        baseCommit: action005WorkOrder.baseCommit
      },
      commit: { performed: true, commit: candidateCommit, tree: candidateTree },
      push: { performed: false, remoteBranch: null, commit: null },
      draftPullRequest: {
        performed: false,
        repository: null,
        number: null,
        url: null,
        baseBranch: null,
        headBranch: null,
        headCommit: null
      }
    },
    previews: [],
    resultingState,
    authorityUsed: {
      readPublicMetadata: true,
      createIsolatedBranch: true,
      commitCandidate: true,
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
      anchorType: "git-commit",
      anchorIdentity: action005.target.expectedCommit,
      required: true,
      exercised: false
    },
    unknowns: []
  }, "receiptHash");
  assert.equal(validateExecutionReceipt(syntheticReceipt, {
    branchCapsule: action004Capsule,
    envelope: action005,
    index: approvedIndex,
    repositoryRoot: tempRoot,
    executionNow: executionStartedAt
  }).valid, true);
  assert.equal(assertFutureAction005ReceiptContract(syntheticReceipt), true);

  const substitutedApprovalIndexReceipt = clone(syntheticReceipt);
  substitutedApprovalIndexReceipt.changes.recordedHandoffPaths[1] = approvalIndexPath;
  assert.throws(() => validateExecutionReceipt(
    sealHandoffDocument(substitutedApprovalIndexReceipt, "receiptHash"), {
      branchCapsule: action004Capsule,
      envelope: action005,
      index: approvedIndex,
      repositoryRoot: tempRoot,
      executionNow: executionStartedAt
    }
  ), (error) => error.code === "HANDOFF_AUTHORITY_DENIED");
  const substitutedProposalIndexReceipt = clone(syntheticReceipt);
  substitutedProposalIndexReceipt.changes.recordedHandoffPaths[1] =
    "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0003.json";
  assert.throws(() => validateExecutionReceipt(
    sealHandoffDocument(substitutedProposalIndexReceipt, "receiptHash"), {
      branchCapsule: action004Capsule,
      envelope: action005,
      index: approvedIndex,
      repositoryRoot: tempRoot,
      executionNow: executionStartedAt
    }
  ), (error) => error.code === "HANDOFF_AUTHORITY_DENIED");
  const escapedReceipt = clone(syntheticReceipt);
  escapedReceipt.changes.changedPaths.push("../escape");
  assert.throws(() => validateExecutionReceipt(sealHandoffDocument(escapedReceipt, "receiptHash"), {
    branchCapsule: action004Capsule,
    envelope: action005,
    index: approvedIndex,
    repositoryRoot: tempRoot,
    executionNow: executionStartedAt
  }), /closed JSON schema|outside its envelope/u);

  const consumedValue = clone(approvedIndex);
  consumedValue.indexId = "handoff-index:action-005-synthetic-consumed:20260824";
  consumedValue.createdAt = consumptionIndexCreatedAt;
  consumedValue.previousIndexPath = approvalIndexPath;
  consumedValue.previousIndexHash = approvedIndex.indexHash;
  const consumedEntry = consumedValue.entries[3];
  consumedEntry.recordedAt = consumptionIndexCreatedAt;
  consumedEntry.status = "completed";
  consumedEntry.lifecycle.state = "consumed";
  consumedEntry.lifecycle.consumedAt = syntheticReceipt.completedAt;
  consumedEntry.lifecycle.consumedByReceiptId = syntheticReceipt.receiptId;
  consumedEntry.receiptId = syntheticReceipt.receiptId;
  consumedEntry.receiptPath = syntheticReceipt.resultingState.persistedReceiptRef;
  consumedEntry.receiptHash = syntheticReceipt.receiptHash;
  consumedEntry.outcome = syntheticReceipt.outcome;
  const consumedIndex = sealHandoffDocument(consumedValue, "indexHash");
  assert.deepEqual(validateIndexTransition(approvedIndex, consumedIndex), {
    valid: true,
    transitionedEntries: 1,
    appendedEntries: 0
  });
  assert.equal(consumedIndex.previousIndexPath, approvalIndexPath);
  assert.equal(consumedIndex.previousIndexHash, approvedIndex.indexHash);
  assert.equal(consumedIndex.entries[2].lifecycle.state, "revoked");
  assert.equal(consumedIndex.entries[3].status, "completed");
  assert.equal(consumedIndex.entries[3].lifecycle.state, "consumed");
  assert.equal(consumedIndex.entries[3].lifecycle.consumedByReceiptId, syntheticReceipt.receiptId);
  assert.equal(consumedIndex.entries[3].receiptHash, syntheticReceipt.receiptHash);

  const collapsedValue = clone(index0003);
  collapsedValue.indexId = "handoff-index:action-005-invalid-collapsed:20260824";
  collapsedValue.createdAt = consumptionIndexCreatedAt;
  collapsedValue.previousIndexPath = "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0003.json";
  collapsedValue.previousIndexHash = index0003.indexHash;
  const collapsedEntry = collapsedValue.entries[3];
  collapsedEntry.recordedAt = consumptionIndexCreatedAt;
  collapsedEntry.status = "completed";
  collapsedEntry.lifecycle.state = "consumed";
  collapsedEntry.lifecycle.consumedAt = syntheticReceipt.completedAt;
  collapsedEntry.lifecycle.consumedByReceiptId = syntheticReceipt.receiptId;
  collapsedEntry.receiptId = syntheticReceipt.receiptId;
  collapsedEntry.receiptPath = receiptPath;
  collapsedEntry.receiptHash = syntheticReceipt.receiptHash;
  collapsedEntry.outcome = syntheticReceipt.outcome;
  assert.throws(() => validateIndexTransition(index0003,
    sealHandoffDocument(collapsedValue, "indexHash")),
  (error) => error.code === "HANDOFF_INDEX_TRANSITION_INVALID");
  assert.throws(() => assertActionEnvelopeExecutable(action005, {
    branchCapsule: action004Capsule,
    index: consumedIndex,
    repositoryRoot: tempRoot,
    now: new Date(Date.parse(executionCompletedAt) + 120_000).toISOString()
  }), (error) => error.code === "HANDOFF_REPLAY_DENIED");

  assert.throws(() => assertSafeRepositoryPath("../escape"), /unsafe|traversal/u);
  assert.throws(() => resolveRegularRepositoryFile(tempRoot, "../escape", "Action 005 artifact"), /unsafe|traversal/u);
  const isolatedRoot = path.join(tempRoot, "isolated");
  fs.mkdirSync(isolatedRoot);
  fs.writeFileSync(path.join(tempRoot, "outside.json"), "{}\n");
  fs.symlinkSync("../outside.json", path.join(isolatedRoot, "linked.json"));
  assert.throws(() => resolveRegularRepositoryFile(isolatedRoot, "linked.json", "Action 005 artifact"), /symbolic link/u);

  assert.equal(fs.existsSync(path.join(repositoryRoot, approvalPath)), false);
  assert.equal(fs.existsSync(path.join(repositoryRoot, receiptPath)), false);
  assert.equal(fs.existsSync(path.join(repositoryRoot, approvalIndexPath)), true);
  assert.equal(fs.readFileSync(path.join(repositoryRoot, approvalIndexPath)).equals(
    fs.readFileSync(action006IndexPath)), true);
  assert.equal(fs.existsSync(path.join(repositoryRoot, consumptionIndexPath)), false);
  assert.equal(fs.existsSync(path.join(repositoryRoot, "apps/clover-launch-studio")), false);
  const localFutureBranch = spawnSync("git", [
    "show-ref", "--verify", "--quiet", `refs/heads/${action005WorkOrder.worktreeBranch}`
  ], { cwd: repositoryRoot });
  const remoteFutureBranch = spawnSync("git", [
    "show-ref", "--verify", "--quiet", `refs/remotes/origin/${action005WorkOrder.worktreeBranch}`
  ], { cwd: repositoryRoot });
  assert.equal(localFutureBranch.status, 1);
  assert.equal(remoteFutureBranch.status, 1);
});
const expectedAction006Paths = Object.freeze([
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2c/action-005-revocation.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2c/phase-b-0.2c-context-pack.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2c/phase-b-0.2c-impact-scan.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2c/phase-b-0.2c-budget.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2c/phase-b-0.2c-acceptance-contract.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2c/phase-b-0.2c-build-charter.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2c/phase-b-0.2c-executor-work-order.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2c/action-006-source-envelope.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2c/phase-b-0.2c-proposal-manifest.json",
  "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2c/PHASE_B_0.2C_PROPOSAL.md",
  "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0004.json",
  "portfolio/core/handoff/index.json",
  "portfolio/core/test/handoff-ledger.test.mjs"
]);

const expectedAction006AcceptanceIds = Object.freeze(expectedAction004AcceptanceIds.flatMap((testId) =>
  testId === "accept_event_append_only"
    ? [testId, "accept_handoff_lifecycle_append_only"]
    : [testId]
));

const expectedAction006ProviderClassifications = Object.freeze([
  "Clerk: candidate/unselected",
  "Neon: candidate/unselected",
  "Vercel Blob: candidate/unselected",
  "Vercel hosting: candidate/unprovisioned"
]);

const expectedAction006AllowedActions = Object.freeze([
  "read-public-metadata",
  "verify-exact-identity",
  "verify-local-cleanliness",
  "verify-source-ancestry",
  "create-isolated-branch",
  "commit-candidate",
  "record-handoff-artifacts"
]);

const expectedAction006RecordingPaths = Object.freeze([
  "portfolio/core/handoff/versions/0.1.0/receipts/action-006-launch-studio-phase-b-source-receipt.json",
  "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0006.json",
  "portfolio/core/handoff/index.json"
]);

const expectedAction006ApprovalPaths = Object.freeze([
  "portfolio/core/handoff/versions/0.1.0/approvals/action-006-launch-studio-phase-b-source-approval.json",
  "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0005.json",
  "portfolio/core/handoff/index.json"
]);

const expectedAction006Destination = [
  "feature",
  "clover-launch-studio-private-owner-app-v0.2c-20260824"
].join("/");

const expectedAction006FailureStops = Object.freeze([
  "Stop after the same failure signature occurs twice.",
  "Stop after one repair loop produces no new evidence.",
  "Maximum future repair loops remains three; Action 006 has no repair authority."
]);

function assertFutureAction006ReceiptContract(receipt) {
  assert.deepEqual(receipt.source, {
    bindingRole: "target-source",
    repository: action006.target.repository,
    branch: action006.target.branch,
    commit: action006.target.expectedCommit,
    tree: action004Capsule.identities.current.tree
  });
  assert.deepEqual(receipt.candidateEffects.branch, {
    performed: true,
    repository: action006WorkOrder.repository,
    branch: action006WorkOrder.worktreeBranch,
    baseCommit: action006WorkOrder.baseCommit
  });
  assert.equal(receipt.candidateEffects.commit.performed, true);
  assert.match(receipt.candidateEffects.commit.commit, /^[a-f0-9]{40}$/u);
  assert.match(receipt.candidateEffects.commit.tree, /^[a-f0-9]{40}$/u);
  assert.notEqual(receipt.candidateEffects.commit.commit, receipt.source.commit);
  assert.ok(receipt.changes.changedPaths.length > 0);
  assert.equal(new Set(receipt.changes.changedPaths).size, receipt.changes.changedPaths.length);
  assert.ok(receipt.changes.changedPaths.every((entry) => action006WorkOrder.allowedPaths.includes(entry)));
  assert.deepEqual(receipt.changes.recordedHandoffPaths, expectedAction006RecordingPaths);
  assert.equal(receipt.changes.changedPaths.includes(".github/workflows/clover-required-main-gate.yml"), false);
  return true;
}

test("Action 006 persists one closed 13-path successor proposal with corrected acceptance and zero authority", () => {
  const schemaRecords = [
    ["launch-context-pack.schema.json", action006ContextPack],
    ["impact-scan.schema.json", action006ImpactScan],
    ["session-budget.schema.json", action006Budget],
    ["acceptance-contract.schema.json", action006Acceptance],
    ["build-charter.schema.json", action006Charter],
    ["executor-work-order.schema.json", action006WorkOrder]
  ];
  for (const [schema, record] of schemaRecords) assert.equal(validateContract(schema, record, record.recordId).valid, true);
  for (const record of [action006ContextPack, action006ImpactScan, action006Acceptance, action006Charter, action006WorkOrder]) {
    assert.equal(assertRecordHash(record), true);
  }
  assert.equal(assertBuildCharter(action006Charter), true);
  assert.equal(assertExecutorWorkOrder(action006WorkOrder), true);
  assert.equal(assertSanitizedHandoffDocument(action005Revocation, "Action 005 proposal-local revocation evidence"), true);

  assert.deepEqual(action006Manifest.artifactPaths, expectedAction006Paths);
  assert.equal(action006Manifest.artifactPaths.length, 13);
  assert.equal(action006Manifest.artifactPathListHash, sha256Canonical(expectedAction006Paths));
  assert.deepEqual(action006Manifest.generatedDocumentPaths, expectedAction006Paths.slice(0, 12));
  for (const relativePath of expectedAction006Paths) {
    const stat = fs.lstatSync(path.join(repositoryRoot, relativePath));
    assert.equal(stat.isFile(), true);
    assert.equal(stat.isSymbolicLink(), false);
  }

  assert.deepEqual(Object.keys(action005Revocation).sort(), [
    "consequentialAuthorityGranted", "documentType", "historicalRecordRewritten", "reason", "recordId",
    "revocationHash", "revokedAt", "schemaVersion", "sourceFinding", "successorActionId", "synthetic",
    "targetActionId", "targetEnvelopeHash", "targetEnvelopeId"
  ].sort());
  const unsignedRevocation = clone(action005Revocation);
  delete unsignedRevocation.revocationHash;
  assert.equal(action005Revocation.revocationHash, sha256Canonical(unsignedRevocation));
  assert.equal(action005Revocation.documentType, "clover-handoff-action-revocation-evidence");
  assert.equal(action005Revocation.schemaVersion, "0.2c");
  assert.equal(action005Revocation.recordId, "handoff-revocation:005:action-006-successor");
  assert.equal(action005Revocation.targetActionId, action005.actionId);
  assert.equal(action005Revocation.targetEnvelopeId, action005.envelopeId);
  assert.equal(action005Revocation.targetEnvelopeHash, action005.envelopeHash);
  assert.equal(action005Revocation.reason, "acceptance-contract-launch-session-append-only-coverage-omitted");
  assert.equal(action005Revocation.sourceFinding, "PR #29 review thread PRRT_kwDOSWXoYM6b41Fx");
  assert.equal(action005Revocation.synthetic, false);
  assert.equal(action005Revocation.historicalRecordRewritten, false);
  assert.equal(action005Revocation.consequentialAuthorityGranted, false);
  assert.equal(action005Revocation.successorActionId, action006.actionId);

  const manifestUnsigned = clone(action006Manifest);
  delete manifestUnsigned.manifestHash;
  assert.equal(action006Manifest.manifestHash, sha256Canonical(manifestUnsigned));
  assert.deepEqual(Object.keys(action006Manifest).sort(), [
    "acceptanceTests", "actionSource", "applicationSourceBoundary", "artifactPathListHash", "artifactPaths", "authority", "createdAt", "documentType",
    "embeddedTruthStatuses", "futureSessionControls", "generatedDocumentPaths", "humanReport", "indexSuccessor",
    "lifecyclePlan", "manifestHash", "manifestId", "proposalVersion", "providerClassifications",
    "publicationGate", "records", "reviewFinding", "schemaVersion", "source", "sourceDestinationSeparation"
  ].sort());
  assert.equal(action006Manifest.records.length, 9);
  assert.equal(action006Manifest.records.some((binding) => binding.path === expectedAction006Paths[8]), false);
  assert.equal(action006Manifest.records.some((binding) => [
    expectedAction006Paths[9], expectedAction006Paths[10], expectedAction006Paths[11],
    expectedAction006Paths[12]
  ].includes(binding.path)), false);
  for (const binding of action006Manifest.records) {
    assert.deepEqual(Object.keys(binding).sort(), [
      "canonicalRecordHashIncludingSelfHash", "documentType", "path", "rawByteSha256",
      "recordId", "selfHashExcludingOwnField", "selfHashField"
    ].sort());
    const bytes = fs.readFileSync(path.join(repositoryRoot, binding.path));
    const record = JSON.parse(bytes);
    assert.equal(sha256Bytes(bytes), binding.rawByteSha256);
    assert.equal(sha256Canonical(record), binding.canonicalRecordHashIncludingSelfHash);
    if (binding.selfHashField === null) assert.equal(binding.selfHashExcludingOwnField, null);
    else {
      const unsigned = clone(record);
      delete unsigned[binding.selfHashField];
      assert.equal(record[binding.selfHashField], binding.selfHashExcludingOwnField);
      assert.equal(record[binding.selfHashField], sha256Canonical(unsigned));
    }
  }
  const revocationBindings = action006Manifest.records.filter((binding) =>
    binding.path === expectedAction006Paths[0]);
  assert.equal(revocationBindings.length, 1);
  assert.equal(revocationBindings[0].documentType, action005Revocation.documentType);
  assert.equal(revocationBindings[0].recordId, action005Revocation.recordId);
  assert.equal(revocationBindings[0].selfHashField, "revocationHash");
  assert.equal(revocationBindings[0].selfHashExcludingOwnField, action005Revocation.revocationHash);
  assert.deepEqual(action006Manifest.lifecyclePlan, {
    revokedActionId: action005.actionId,
    revocationEvidencePath: expectedAction006Paths[0],
    revocationEvidenceHash: action005Revocation.revocationHash,
    proposedIndexPath: expectedAction006Paths[10],
    approvalAttestationPath: expectedAction006ApprovalPaths[0],
    approvalIndexPath: expectedAction006ApprovalPaths[1],
    executionReceiptPath: expectedAction006RecordingPaths[0],
    consumptionIndexPath: expectedAction006RecordingPaths[1],
    stableRootPath: expectedAction006RecordingPaths[2],
    approvalPathsAreExecutionEffects: false,
    syntheticRehearsalPersisted: false
  });
  const reportBytes = fs.readFileSync(path.join(repositoryRoot, action006Manifest.humanReport.path));
  assert.equal(sha256Bytes(reportBytes), action006Manifest.humanReport.rawByteSha256);
  assert.equal(Buffer.byteLength(action006Report), action006Manifest.humanReport.utf8Bytes);
  assert.match(action006Report, /no native revocation-record schema or evidence resolver/u);
  assert.match(action006Report, /Synthetic approval, receipt and successor index records are not persisted/u);

  assert.deepEqual(action006Acceptance.tests.map((entry) => entry.testId), expectedAction006AcceptanceIds);
  assert.equal(action006Acceptance.tests.length, 31);
  assert.equal(new Set(action006Acceptance.tests.map((entry) => entry.testId)).size, 31);
  assert.equal(action006Acceptance.tests.every((entry) => entry.material === true), true);
  assert.deepEqual(action006Charter.testPlan, expectedAction006AcceptanceIds);
  assert.deepEqual(action006Acceptance.tests.find((entry) => entry.testId === "accept_event_append_only"), {
    expected: "Rewrite, delete, reorder, duplicate, fork, predecessor substitution, predecessor omission, replay, idempotency collision, sequence gap, and stale expected-version attempts fail closed for every Launch Session event type.",
    material: true,
    method: "unit",
    requirement: "Append every Launch Session event with exact expected session version, monotonic sequence, exact predecessor event ID and canonical predecessor hash, and idempotency binding.",
    testId: "accept_event_append_only"
  });
  assert.deepEqual(action006Acceptance.tests.find((entry) => entry.testId === "accept_handoff_lifecycle_append_only"), {
    expected: "Index 0003→0004 performs exactly one existing-entry revocation and one contiguous append; synthetic 0004→0005 approval and 0005→0006 consumption each transition only Action 006. Direct 0004→0006, replay, wrong-index, substitution, path widening, traversal, symlink, expired approval, and revoked-Action execution fail closed.",
    material: true,
    method: "unit",
    requirement: "Preserve immutable index 0003, transition Action 005 to revoked while appending proposed Action 006 in index 0004, then rehearse separate approval index 0005 and consumption index 0006 transitions.",
    testId: "accept_handoff_lifecycle_append_only"
  });
  assert.notEqual(
    action006Acceptance.tests.find((entry) => entry.testId === "accept_event_append_only").requirement,
    action006Acceptance.tests.find((entry) => entry.testId === "accept_handoff_lifecycle_append_only").requirement
  );
  assert.deepEqual(action006Manifest.acceptanceTests, {
    count: 31,
    ids: expectedAction006AcceptanceIds,
    idListHash: sha256Canonical(expectedAction006AcceptanceIds)
  });
  assert.deepEqual(action006Manifest.applicationSourceBoundary, {
    count: 31,
    paths: expectedAction004AppPaths,
    pathListHash: sha256Canonical(expectedAction004AppPaths)
  });
  assert.deepEqual(action006Manifest.reviewFinding, {
    pullRequest: 29,
    threadId: "PRRT_kwDOSWXoYM6b41Fx",
    commentId: "PRRC_kwDOSWXoYM7lYPp0",
    path: "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2b/phase-b-0.2b-acceptance-contract.json",
    severity: "P2",
    reviewedCommit: "5882c421bc37e4dc944e56a3502706a31d35a69d",
    status: "unresolved"
  });
  assert.deepEqual(action006Charter.allowedPaths, expectedAction004AppPaths);
  assert.deepEqual(action006WorkOrder.allowedPaths, expectedAction004AppPaths);
  assert.deepEqual(action006.scope.allowedWritePaths, expectedAction004AppPaths);
  assert.equal(action006.scope.allowedWritePaths.length, 31);
  assert.equal(action006.scope.allowedWritePaths.includes(".github/workflows/clover-required-main-gate.yml"), false);
  assert.deepEqual(action006.scope.allowedActions, expectedAction006AllowedActions);
  assert.equal(action006.scope.allowedActions.includes("assemble-sanitized-receipt"), false);
  assert.deepEqual(action006.scope.allowedRecordingPaths, expectedAction006RecordingPaths);
  assert.equal(action006.scope.allowedRecordingPaths.includes(expectedAction006ApprovalPaths[0]), false);
  assert.equal(action006.scope.allowedRecordingPaths.includes(expectedAction006ApprovalPaths[1]), false);
  assert.equal(action006.scope.allowedRecordingPaths.includes(expectedAction006Paths[10]), false);

  assert.deepEqual(action006.target, {
    projectId: "clover-launch-studio-private-owner",
    repository: "chrisdortch/first",
    branch: "main",
    expectedCommit: "e5688c771d384d80a8c723cfa655298ce8257889",
    environment: "local-checkout"
  });
  assert.equal(action006WorkOrder.repository, action006.target.repository);
  assert.equal(action006WorkOrder.baseCommit, action006.target.expectedCommit);
  assert.equal(action006WorkOrder.worktreeBranch, expectedAction006Destination);
  const destinationBearingDocuments = expectedAction006Paths.slice(0, 12).filter((relativePath) =>
    fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8").includes(expectedAction006Destination));
  assert.deepEqual(destinationBearingDocuments, [expectedAction006Paths[4], expectedAction006Paths[6]]);
  assert.equal(JSON.stringify(action006Acceptance).includes(expectedAction006Destination), true);
  assert.equal(JSON.stringify(action006WorkOrder).includes(expectedAction006Destination), true);
  assert.deepEqual(action006Manifest.sourceDestinationSeparation, {
    envelopeTargetBranch: action006.target.branch,
    envelopeTargetCommit: action006.target.expectedCommit,
    destinationDefinitionPath: expectedAction006Paths[6],
    destinationBranchExists: false,
    destinationRepresentedAsVerified: false
  });
  assert.equal(action006Manifest.source.commit, "50faeb470893d926393937418b3b0b67a286ec99");
  assert.equal(action006Manifest.source.tree, "09907780237a23d68b2555d83485bfba69d09994");
  assert.deepEqual(action006Manifest.source.orderedParents, [
    "3bf01627272d6c3a3da578dc7080b441e4fa3d47",
    "5882c421bc37e4dc944e56a3502706a31d35a69d"
  ]);
  assert.equal(action006ContextPack.sources[0].sourceId, "source_owner_authorization_action_006_v02c_13_path_001");
  assert.equal(action006ContextPack.sources[0].contentHash, "bde609d5b30172f2780a6546c515a28f2f5ddfdec11bbde5b577566dd885c877");
  assert.equal(action006ImpactScan.contextPackHash, sha256Canonical(action006ContextPack));
  assert.equal(action006Charter.contextPackHash, sha256Canonical(action006ContextPack));
  assert.equal(action006Charter.impactScanHash, sha256Canonical(action006ImpactScan));
  assert.equal(action006Charter.acceptanceContractHash, sha256Canonical(action006Acceptance));
  assert.equal(action006WorkOrder.charterId, action006Charter.recordId);
  assert.equal(action006WorkOrder.contextPackHash, sha256Canonical(action006ContextPack));
  assert.equal(action006WorkOrder.impactScanHash, sha256Canonical(action006ImpactScan));
  assert.equal(action006WorkOrder.handoffAuthorityReferenceId, action006.envelopeId);

  const expectedBoundHashes = new Map([
    ["context-pack", sha256Canonical(action006ContextPack)],
    ["impact-scan", sha256Canonical(action006ImpactScan)],
    ["budget", sha256Canonical(action006Budget)],
    ["acceptance-contract", sha256Canonical(action006Acceptance)],
    ["build-charter", sha256Canonical(action006Charter)],
    ["executor-work-order", sha256Canonical(action006WorkOrder)]
  ]);
  for (const [kind, hash] of expectedBoundHashes) {
    assert.equal(action006.sourceRequirements.some((entry) => entry.expectedIdentity === `${kind}:canonical:${hash}`), true);
    assert.equal(action006.readbackRequirements.some((entry) => entry.expectedIdentity === `${kind}:canonical:${hash}`), true);
  }
  assert.equal(action006.sourceRequirements.some((entry) => entry.expectedIdentity.includes(action006Manifest.manifestHash)), false);
  assert.equal(action006.readbackRequirements.some((entry) => entry.expectedIdentity.includes(action006Manifest.manifestHash)), false);

  assert.deepEqual({
    maximumModelCalls: action006Budget.maximumModelCalls,
    maximumImplementationAgents: action006Budget.maximumImplementationAgents,
    maximumRepairLoops: action006Budget.maximumRepairLoops,
    maximumElapsedMinutes: action006Budget.maximumElapsedMinutes,
    maximumProviderCiRuns: action006Budget.maximumProviderCiRuns,
    maximumTargetNullPreviews: action006Budget.maximumTargetNullPreviews,
    explicitPurchaseCeilingUsd: action006Budget.explicitPurchaseCeilingUsd,
    automaticAdditionalCreditPurchase: action006Budget.automaticAdditionalCreditPurchase
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
  assert.equal(action006Budget.repeatedFailureStop, true);
  assert.equal(action006Budget.noNewEvidenceStop, true);
  assert.equal(action006.requestedAuthority.runNonProductionChecks, false);
  assert.equal(action006.requestedAuthority.createNonProductionPreview, false);
  assert.equal(action006WorkOrder.repairLoopBudget, 0);
  assert.deepEqual(action006Charter.stopConditions.slice(-3), expectedAction006FailureStops);
  assert.deepEqual(action006WorkOrder.stopConditions.slice(-3), expectedAction006FailureStops);
  assert.equal(action006Manifest.futureSessionControls.repeatedFailureStop, expectedAction006FailureStops[0]);
  assert.equal(action006Manifest.futureSessionControls.noNewEvidenceStop, expectedAction006FailureStops[1]);
  assert.equal(action006Manifest.futureSessionControls.action006ValidationRepairCiPreviewAuthority, false);

  assert.deepEqual(action006ContextPack.sharedResources.providers, expectedAction006ProviderClassifications);
  assert.deepEqual(action006ImpactScan.authenticationBoundaries.filter((entry) =>
    expectedAction006ProviderClassifications.includes(entry)), expectedAction006ProviderClassifications);
  assert.deepEqual(action006Charter.scope.filter((entry) =>
    expectedAction006ProviderClassifications.includes(entry)), expectedAction006ProviderClassifications);
  assert.deepEqual(action006WorkOrder.testPlan.filter((entry) =>
    expectedAction006ProviderClassifications.includes(entry)), expectedAction006ProviderClassifications);
  assert.deepEqual(action006Manifest.providerClassifications, expectedAction006ProviderClassifications);
  for (const classification of expectedAction006ProviderClassifications) assert.equal(action006Report.includes(classification), true);

  const { providerStorage, speech, repair } = action006Manifest.embeddedTruthStatuses;
  for (const status of [providerStorage, speech, repair]) {
    const unsigned = clone(status);
    delete unsigned.recordHash;
    assert.equal(status.recordHash, sha256Canonical(unsigned));
  }
  assert.deepEqual(providerStorage.candidates.map(({ provider, status }) => [provider, status]), [
    ["Clerk", "candidate-unselected"],
    ["Neon", "candidate-unselected"],
    ["Vercel Blob", "candidate-unselected"],
    ["Vercel hosting", "candidate-unprovisioned"]
  ]);
  assert.equal(providerStorage.resourcesProvisioned, false);
  assert.deepEqual(providerStorage.selectedProviders, []);
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
  assert.equal(Object.values(action006.authority).every((value) => value === false), true);
  assert.deepEqual(Object.entries(action006.requestedAuthority).filter(([, enabled]) => enabled)
    .map(([field]) => field).sort(), [
    "commitCandidate", "createIsolatedBranch", "readPublicMetadata", "recordHandoffArtifacts"
  ]);
  assert.equal(Date.parse(action006.expiresAt) - Date.parse(action006.createdAt), 72 * 60 * 60 * 1000);
});

test("Action 006 index 0004 revokes Action 005, appends one proposal and preserves history", () => {
  assert.deepEqual(validateIndexTransition(index0003, index0004), {
    valid: true,
    transitionedEntries: 1,
    appendedEntries: 1
  });
  assert.equal(index0004.previousIndexPath,
    "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0003.json");
  assert.equal(index0004.previousIndexHash,
    "915ae90d41f8fff62681c213f230424d2a7e86049d362081883f276562ca3115");
  assert.deepEqual(index0004.entries.slice(0, 3), index0003.entries.slice(0, 3));
  assert.equal(sha256Canonical(index0004.entries[0]),
    "28d6cd8a65375c4bff902d2d048b114c335041cbc50332769c9b271b165354a0");
  assert.equal(sha256Canonical(index0004.entries[1]),
    "0f0e94e337c57629278cddd303ae31675a70b5be6ee8a499357e1739eaa223f5");
  assert.deepEqual(index0004.entries[2], index0003.entries[2]);
  assert.equal(index0004.entries.some((entry) => entry.actionId === "CLOVER-2026-08-24-003"), false);

  const before005 = index0003.entries[3];
  const revoked005 = index0004.entries[3];
  assert.deepEqual({
    sequence: revoked005.sequence,
    actionId: revoked005.actionId,
    branchCapsuleId: revoked005.branchCapsuleId,
    branchCapsuleHash: revoked005.branchCapsuleHash,
    envelopeId: revoked005.envelopeId,
    envelopePath: revoked005.envelopePath,
    envelopeHash: revoked005.envelopeHash
  }, {
    sequence: before005.sequence,
    actionId: before005.actionId,
    branchCapsuleId: before005.branchCapsuleId,
    branchCapsuleHash: before005.branchCapsuleHash,
    envelopeId: before005.envelopeId,
    envelopePath: before005.envelopePath,
    envelopeHash: before005.envelopeHash
  });
  assert.equal(revoked005.status, "pending");
  assert.equal(revoked005.lifecycle.state, "revoked");
  assert.equal(revoked005.lifecycle.revokedAt, action005Revocation.revokedAt);
  assert.equal(revoked005.lifecycle.revokedAt, index0004.createdAt);
  assert.equal(revoked005.recordedAt, index0004.createdAt);
  assert.equal(revoked005.lifecycle.revocationEvidenceHash, action005Revocation.revocationHash);
  assert.equal(revoked005.lifecycle.consumedAt, null);
  assert.equal(revoked005.lifecycle.consumedByReceiptId, null);
  assert.deepEqual(revoked005.ownerApproval, before005.ownerApproval);
  assert.equal(revoked005.receiptId, before005.receiptId);
  assert.equal(revoked005.receiptPath, before005.receiptPath);
  assert.equal(revoked005.receiptHash, before005.receiptHash);
  assert.equal(revoked005.outcome, before005.outcome);
  assert.deepEqual(revoked005.review, before005.review);

  const proposed006 = index0004.entries[4];
  assert.equal(proposed006.sequence, 5);
  assert.equal(proposed006.actionId, action006.actionId);
  assert.equal(proposed006.envelopeId, action006.envelopeId);
  assert.equal(proposed006.envelopeHash, action006.envelopeHash);
  assert.equal(proposed006.status, "pending");
  assert.equal(proposed006.lifecycle.state, "proposed");
  assert.equal(proposed006.lifecycle.revokedAt, null);
  assert.equal(proposed006.lifecycle.revocationEvidenceHash, null);
  assert.equal(proposed006.ownerApproval.status, "pending");
  assert.equal(proposed006.receiptId, null);
  assert.equal(proposed006.receiptPath, null);
  assert.equal(proposed006.receiptHash, null);
  assert.equal(proposed006.outcome, "pending");
  assert.equal(proposed006.review.status, "pending");
  assert.equal(action005.envelopeHash,
    "cc1626a1d8e2bbc77ee64352a4521d9a8394a66bfbb70d43bcf5662aff28ce44");
  assert.equal(fs.readFileSync(stableIndexPath).equals(fs.readFileSync(action006IndexPath)), true);

  const pending = validateActionEnvelope(action006, {
    branchCapsule: action004Capsule,
    index: index0004,
    repositoryRoot,
    now: new Date(Date.parse(action006.createdAt) + 1_000).toISOString()
  });
  assert.deepEqual(pending, {
    valid: true,
    executable: false,
    reason: "owner-approval-required",
    effectiveAuthority: action006.authority
  });
  assert.throws(() => assertActionEnvelopeExecutable(action006, {
    branchCapsule: action004Capsule,
    index: index0004,
    repositoryRoot,
    now: new Date(Date.parse(action006.createdAt) + 1_000).toISOString()
  }), (error) => error.code === "HANDOFF_DEFAULT_DENY");
  assert.throws(() => assertActionEnvelopeExecutable(action005, {
    branchCapsule: action004Capsule,
    index: index0004,
    repositoryRoot,
    now: new Date(Date.parse(action006.createdAt) + 1_000).toISOString()
  }), (error) => error.code === "HANDOFF_REVOKED");
  assert.throws(() => assertActionEnvelopeExecutable(action004, {
    branchCapsule: action004Capsule,
    index: index0004,
    repositoryRoot,
    now: new Date(Date.parse(action006.createdAt) + 1_000).toISOString()
  }), (error) => error.code === "HANDOFF_REVOKED");

  const chain = validateHandoffIndexChain(repositoryRoot, { historicalIndexHash: genesisIndexHash });
  assert.equal(chain.depth, 4);
  assert.equal(chain.currentIndexHash, index0004.indexHash);
  assert.equal(chain.currentSnapshotPath,
    "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0004.json");
  assert.equal(fs.existsSync(path.join(repositoryRoot,
    "portfolio/core/handoff/versions/0.1.0/approvals/action-006-launch-studio-phase-b-source-approval.json")), false);
  assert.equal(fs.existsSync(path.join(repositoryRoot,
    "portfolio/core/handoff/versions/0.1.0/receipts/action-006-launch-studio-phase-b-source-receipt.json")), false);
  assert.equal(fs.existsSync(path.join(repositoryRoot,
    "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0005.json")), false);
  assert.equal(fs.existsSync(path.join(repositoryRoot,
    "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0006.json")), false);
  assert.equal(fs.existsSync(path.join(repositoryRoot, "apps/clover-launch-studio")), false);
});

test("Action 006 deterministic synthetic approval and consumption rehearsal is lifecycle-complete and fail-closed", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clover-action006-lifecycle-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const approvalPath = "portfolio/core/handoff/versions/0.1.0/approvals/action-006-launch-studio-phase-b-source-approval.json";
  const approvalIndexPath = "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0005.json";
  const receiptPath = expectedAction006RecordingPaths[0];
  const consumptionIndexPath = expectedAction006RecordingPaths[1];
  const approvedAt = new Date(Date.parse(action006.createdAt) + 60_000).toISOString();
  const approvalIndexCreatedAt = new Date(Date.parse(action006.createdAt) + 120_000).toISOString();
  const executionStartedAt = new Date(Date.parse(action006.createdAt) + 180_000).toISOString();
  const executionCompletedAt = new Date(Date.parse(action006.createdAt) + 240_000).toISOString();
  const consumptionIndexCreatedAt = new Date(Date.parse(action006.createdAt) + 300_000).toISOString();
  const candidateCommit = "5".repeat(40);
  const candidateTree = "6".repeat(40);

  const approvalStatement = canonicalOwnerApprovalStatement(action006);
  assert.equal(approvalStatement, `APPROVE ${action006.actionId} ${action006.envelopeHash}`);
  const attestation = createOwnerApprovalAttestation(action006, {
    attestationId: "handoff-approval:005:synthetic-lifecycle-rehearsal",
    ownerId: "owner:chris-dortch",
    decision: "approve",
    approvalStatement,
    approvedAt,
    recordingLane: "codex-bounded-approval-recording",
    recordingAuthorizationEvidenceHash: sha256Canonical({ basis: "synthetic-action006-lifecycle-rehearsal" })
  });
  writeJson(tempRoot, approvalPath, attestation);
  const approvedIndex = createOwnerApprovedIndexVersion(index0004, action006, attestation, {
    indexId: "handoff-index:action-006-synthetic-approved:20260824",
    createdAt: approvalIndexCreatedAt,
    previousIndexPath: "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0004.json",
    attestationPath: approvalPath
  });
  assert.deepEqual(validateIndexTransition(index0004, approvedIndex), {
    valid: true,
    transitionedEntries: 1,
    appendedEntries: 0
  });
  assert.equal(approvedIndex.previousIndexPath, "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0004.json");
  assert.equal(approvedIndex.previousIndexHash, index0004.indexHash);
  assert.deepEqual(approvedIndex.entries.slice(0, 4), index0004.entries.slice(0, 4));
  assert.equal(approvedIndex.entries[2].lifecycle.state, "revoked");
  assert.equal(approvedIndex.entries[3].lifecycle.state, "revoked");
  assert.equal(approvedIndex.entries[3].lifecycle.revocationEvidenceHash, action005Revocation.revocationHash);
  assert.equal(approvedIndex.entries[4].status, "pending");
  assert.equal(approvedIndex.entries[4].lifecycle.state, "available");
  assert.equal(approvedIndex.entries[4].ownerApproval.status, "approved");
  assert.equal(approvedIndex.entries[4].ownerApproval.attestationPath, approvalPath);
  assert.equal(approvedIndex.entries[4].ownerApproval.attestationHash, attestation.attestationHash);

  const executable = assertActionEnvelopeExecutable(action006, {
    branchCapsule: action004Capsule,
    index: approvedIndex,
    repositoryRoot: tempRoot,
    now: executionStartedAt
  });
  assert.equal(executable.executable, true);
  assert.deepEqual(Object.entries(executable.effectiveAuthority).filter(([, enabled]) => enabled)
    .map(([field]) => field).sort(), [
    "commitCandidate", "createIsolatedBranch", "readPublicMetadata", "recordHandoffArtifacts"
  ]);
  assert.throws(() => assertActionEnvelopeExecutable(action006, {
    branchCapsule: action004Capsule,
    index: approvedIndex,
    repositoryRoot: tempRoot,
    now: action006.expiresAt
  }), (error) => error.code === "HANDOFF_EXPIRED");
  assert.throws(() => assertActionEnvelopeExecutable(action006, {
    branchCapsule: action004Capsule,
    index: index0004,
    repositoryRoot: tempRoot,
    now: executionStartedAt
  }), (error) => error.code === "HANDOFF_DEFAULT_DENY");
  assert.throws(() => assertActionEnvelopeExecutable(action006, {
    branchCapsule: action004Capsule,
    index: index0003,
    repositoryRoot: tempRoot,
    now: executionStartedAt
  }), /exact lifecycle|substitut/u);
  assert.throws(() => assertActionEnvelopeExecutable(action005, {
    branchCapsule: action004Capsule,
    index: approvedIndex,
    repositoryRoot: tempRoot,
    now: executionStartedAt
  }), (error) => error.code === "HANDOFF_REVOKED");

  const observations = action006.readbackRequirements.map((readback, offset) => {
    const sourceRequirement = action006.sourceRequirements[offset];
    assert.equal(readback.connector, sourceRequirement.sourceId);
    assert.equal(readback.expectedIdentity, sourceRequirement.expectedIdentity);
    return sealNested({
      observationId: `observation:action006-source-${offset + 1}`,
      sourceId: readback.connector,
      subject: readback.subject,
      observedIdentity: readback.expectedIdentity,
      identityKey: readback.expectedIdentity,
      availability: "available",
      identityResolution: "exact-resolved",
      state: "synthetic exact source and canonical record identity verified",
      observedAt: executionStartedAt,
      evidenceRef: `synthetic-action006-readback:${offset + 1}`
    }, "evidenceHash");
  });
  const cleanlinessCheck = sealNested({
    checkId: "check:action006-synthetic-cleanliness",
    conclusion: "passed",
    summary: "Synthetic source checkout is clean before the isolated candidate branch is created."
  }, "checkHash");
  const ancestryCheck = sealNested({
    checkId: "check:action006-synthetic-ancestry",
    conclusion: "passed",
    summary: "Synthetic candidate branch base binds exact immutable source commit e5688c771d384d80a8c723cfa655298ce8257889."
  }, "checkHash");
  const resultingState = {
    projectId: action006.target.projectId,
    sourceCommit: candidateCommit,
    summary: "Synthetic source-only candidate identity recorded; validation, push, PR, provider and preview remain absent.",
    persistedReceiptRef: receiptPath,
    productionStateChanged: false,
    unknowns: []
  };
  const syntheticReceipt = sealHandoffDocument({
    documentType: "clover-handoff-execution-receipt",
    schemaVersion: "0.1.0",
    actionId: action006.actionId,
    receiptId: "handoff-receipt:006:synthetic-lifecycle-rehearsal",
    envelopeId: action006.envelopeId,
    envelopeHash: action006.envelopeHash,
    branchCapsuleId: action004Capsule.capsuleId,
    branchCapsuleHash: action004Capsule.capsuleHash,
    startedAt: executionStartedAt,
    completedAt: executionCompletedAt,
    executorLane: "codex-bounded-execution",
    source: {
      bindingRole: "target-source",
      repository: action006.target.repository,
      branch: action006.target.branch,
      commit: action006.target.expectedCommit,
      tree: action004Capsule.identities.current.tree
    },
    reconciliation: {
      status: "not-applicable",
      inputCapsuleId: action004Capsule.capsuleId,
      inputCapsuleHash: action004Capsule.capsuleHash,
      resultCapsuleId: null,
      resultCapsulePath: null,
      resultCapsuleHash: null
    },
    outcome: "succeeded",
    observations,
    checks: [cleanlinessCheck, ancestryCheck],
    actionsPerformed: expectedAction006AllowedActions,
    evidenceBindings: [
      {
        evidenceId: "evidence:action-006-source-identity",
        kind: "source-identity",
        bindingType: "observation",
        boundHashes: observations.map((entry) => entry.evidenceHash)
      },
      {
        evidenceId: "evidence:action-006-cleanliness",
        kind: "cleanliness",
        bindingType: "check",
        boundHashes: [cleanlinessCheck.checkHash]
      },
      {
        evidenceId: "evidence:action-006-ancestry",
        kind: "ancestry",
        bindingType: "check",
        boundHashes: [ancestryCheck.checkHash]
      },
      {
        evidenceId: "evidence:action-006-receipt",
        kind: "receipt",
        bindingType: "resulting-state",
        boundHashes: [sha256Canonical(resultingState)]
      }
    ],
    changes: {
      targetSourceMutationPerformed: true,
      changedPaths: [
        expectedAction004AppPaths[0],
        expectedAction004AppPaths[4],
        expectedAction004AppPaths.at(-1)
      ],
      recordedHandoffPaths: expectedAction006RecordingPaths,
      summary: "Synthetic source-only candidate commit and exact Handoff receipt lifecycle; no validation, publication or provider effect."
    },
    candidateEffects: {
      branch: {
        performed: true,
        repository: action006WorkOrder.repository,
        branch: action006WorkOrder.worktreeBranch,
        baseCommit: action006WorkOrder.baseCommit
      },
      commit: { performed: true, commit: candidateCommit, tree: candidateTree },
      push: { performed: false, remoteBranch: null, commit: null },
      draftPullRequest: {
        performed: false,
        repository: null,
        number: null,
        url: null,
        baseBranch: null,
        headBranch: null,
        headCommit: null
      }
    },
    previews: [],
    resultingState,
    authorityUsed: {
      readPublicMetadata: true,
      createIsolatedBranch: true,
      commitCandidate: true,
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
      anchorType: "git-commit",
      anchorIdentity: action006.target.expectedCommit,
      required: true,
      exercised: false
    },
    unknowns: []
  }, "receiptHash");
  assert.equal(validateExecutionReceipt(syntheticReceipt, {
    branchCapsule: action004Capsule,
    envelope: action006,
    index: approvedIndex,
    repositoryRoot: tempRoot,
    executionNow: executionStartedAt
  }).valid, true);
  assert.equal(assertFutureAction006ReceiptContract(syntheticReceipt), true);

  const substitutedSourceReceipt = clone(syntheticReceipt);
  substitutedSourceReceipt.source.commit = "7".repeat(40);
  assert.throws(() => validateExecutionReceipt(
    sealHandoffDocument(substitutedSourceReceipt, "receiptHash"), {
      branchCapsule: action004Capsule,
      envelope: action006,
      index: approvedIndex,
      repositoryRoot: tempRoot,
      executionNow: executionStartedAt
    }
  ), /source|substitut|identity/u);
  const substitutedDestinationReceipt = clone(syntheticReceipt);
  substitutedDestinationReceipt.candidateEffects.branch.branch = "feature/substituted";
  assert.throws(() => assertFutureAction006ReceiptContract(substitutedDestinationReceipt));
  const widenedReceipt = clone(syntheticReceipt);
  widenedReceipt.changes.changedPaths.push("portfolio/core/status.json");
  assert.throws(() => validateExecutionReceipt(sealHandoffDocument(widenedReceipt, "receiptHash"), {
    branchCapsule: action004Capsule,
    envelope: action006,
    index: approvedIndex,
    repositoryRoot: tempRoot,
    executionNow: executionStartedAt
  }), /outside|authority|scope/u);

  const substitutedApprovalIndexReceipt = clone(syntheticReceipt);
  substitutedApprovalIndexReceipt.changes.recordedHandoffPaths[1] = approvalIndexPath;
  assert.throws(() => validateExecutionReceipt(
    sealHandoffDocument(substitutedApprovalIndexReceipt, "receiptHash"), {
      branchCapsule: action004Capsule,
      envelope: action006,
      index: approvedIndex,
      repositoryRoot: tempRoot,
      executionNow: executionStartedAt
    }
  ), (error) => error.code === "HANDOFF_AUTHORITY_DENIED");
  const substitutedProposalIndexReceipt = clone(syntheticReceipt);
  substitutedProposalIndexReceipt.changes.recordedHandoffPaths[1] =
    "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0004.json";
  assert.throws(() => validateExecutionReceipt(
    sealHandoffDocument(substitutedProposalIndexReceipt, "receiptHash"), {
      branchCapsule: action004Capsule,
      envelope: action006,
      index: approvedIndex,
      repositoryRoot: tempRoot,
      executionNow: executionStartedAt
    }
  ), (error) => error.code === "HANDOFF_AUTHORITY_DENIED");
  const escapedReceipt = clone(syntheticReceipt);
  escapedReceipt.changes.changedPaths.push("../escape");
  assert.throws(() => validateExecutionReceipt(sealHandoffDocument(escapedReceipt, "receiptHash"), {
    branchCapsule: action004Capsule,
    envelope: action006,
    index: approvedIndex,
    repositoryRoot: tempRoot,
    executionNow: executionStartedAt
  }), /closed JSON schema|outside its envelope/u);

  const consumedValue = clone(approvedIndex);
  consumedValue.indexId = "handoff-index:action-006-synthetic-consumed:20260824";
  consumedValue.createdAt = consumptionIndexCreatedAt;
  consumedValue.previousIndexPath = approvalIndexPath;
  consumedValue.previousIndexHash = approvedIndex.indexHash;
  const consumedEntry = consumedValue.entries[4];
  consumedEntry.recordedAt = consumptionIndexCreatedAt;
  consumedEntry.status = "completed";
  consumedEntry.lifecycle.state = "consumed";
  consumedEntry.lifecycle.consumedAt = syntheticReceipt.completedAt;
  consumedEntry.lifecycle.consumedByReceiptId = syntheticReceipt.receiptId;
  consumedEntry.receiptId = syntheticReceipt.receiptId;
  consumedEntry.receiptPath = syntheticReceipt.resultingState.persistedReceiptRef;
  consumedEntry.receiptHash = syntheticReceipt.receiptHash;
  consumedEntry.outcome = syntheticReceipt.outcome;
  const consumedIndex = sealHandoffDocument(consumedValue, "indexHash");
  assert.deepEqual(validateIndexTransition(approvedIndex, consumedIndex), {
    valid: true,
    transitionedEntries: 1,
    appendedEntries: 0
  });
  assert.equal(consumedIndex.previousIndexPath, approvalIndexPath);
  assert.equal(consumedIndex.previousIndexHash, approvedIndex.indexHash);
  assert.equal(consumedIndex.entries[2].lifecycle.state, "revoked");
  assert.equal(consumedIndex.entries[3].lifecycle.state, "revoked");
  assert.equal(consumedIndex.entries[4].status, "completed");
  assert.equal(consumedIndex.entries[4].lifecycle.state, "consumed");
  assert.equal(consumedIndex.entries[4].lifecycle.consumedByReceiptId, syntheticReceipt.receiptId);
  assert.equal(consumedIndex.entries[4].receiptHash, syntheticReceipt.receiptHash);

  const collapsedValue = clone(index0004);
  collapsedValue.indexId = "handoff-index:action-006-invalid-collapsed:20260824";
  collapsedValue.createdAt = consumptionIndexCreatedAt;
  collapsedValue.previousIndexPath = "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0004.json";
  collapsedValue.previousIndexHash = index0004.indexHash;
  const collapsedEntry = collapsedValue.entries[4];
  collapsedEntry.recordedAt = consumptionIndexCreatedAt;
  collapsedEntry.status = "completed";
  collapsedEntry.lifecycle.state = "consumed";
  collapsedEntry.lifecycle.consumedAt = syntheticReceipt.completedAt;
  collapsedEntry.lifecycle.consumedByReceiptId = syntheticReceipt.receiptId;
  collapsedEntry.receiptId = syntheticReceipt.receiptId;
  collapsedEntry.receiptPath = receiptPath;
  collapsedEntry.receiptHash = syntheticReceipt.receiptHash;
  collapsedEntry.outcome = syntheticReceipt.outcome;
  assert.throws(() => validateIndexTransition(index0004,
    sealHandoffDocument(collapsedValue, "indexHash")),
  (error) => error.code === "HANDOFF_INDEX_TRANSITION_INVALID");
  assert.throws(() => assertActionEnvelopeExecutable(action006, {
    branchCapsule: action004Capsule,
    index: consumedIndex,
    repositoryRoot: tempRoot,
    now: new Date(Date.parse(executionCompletedAt) + 120_000).toISOString()
  }), (error) => error.code === "HANDOFF_REPLAY_DENIED");

  assert.throws(() => assertSafeRepositoryPath("../escape"), /unsafe|traversal/u);
  assert.throws(() => resolveRegularRepositoryFile(tempRoot, "../escape", "Action 006 artifact"), /unsafe|traversal/u);
  const isolatedRoot = path.join(tempRoot, "isolated");
  fs.mkdirSync(isolatedRoot);
  fs.writeFileSync(path.join(tempRoot, "outside.json"), "{}\n");
  fs.symlinkSync("../outside.json", path.join(isolatedRoot, "linked.json"));
  assert.throws(() => resolveRegularRepositoryFile(isolatedRoot, "linked.json", "Action 006 artifact"), /symbolic link/u);

  assert.equal(fs.existsSync(path.join(repositoryRoot, approvalPath)), false);
  assert.equal(fs.existsSync(path.join(repositoryRoot, receiptPath)), false);
  assert.equal(fs.existsSync(path.join(repositoryRoot, approvalIndexPath)), false);
  assert.equal(fs.existsSync(path.join(repositoryRoot, consumptionIndexPath)), false);
  assert.equal(fs.existsSync(path.join(repositoryRoot, "apps/clover-launch-studio")), false);
  const localFutureBranch = spawnSync("git", [
    "show-ref", "--verify", "--quiet", `refs/heads/${action006WorkOrder.worktreeBranch}`
  ], { cwd: repositoryRoot });
  const remoteFutureBranch = spawnSync("git", [
    "show-ref", "--verify", "--quiet", `refs/remotes/origin/${action006WorkOrder.worktreeBranch}`
  ], { cwd: repositoryRoot });
  assert.equal(localFutureBranch.status, 1);
  assert.equal(remoteFutureBranch.status, 1);
});
