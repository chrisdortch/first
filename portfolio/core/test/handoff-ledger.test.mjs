import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256Bytes } from "../lib/canonical-json.mjs";
import {
  assertActionEnvelopeExecutable,
  assertSanitizedHandoffDocument,
  computeHandoffHash,
  createOwnerApprovalAttestation,
  createOwnerApprovedIndexVersion,
  sealHandoffDocument,
  validateActionEnvelope,
  validateExecutionReceipt,
  validateHandoffLedger,
  validateIndependentReviewDecision,
  validateIndexTransition
} from "../lib/handoff-ledger.mjs";
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
