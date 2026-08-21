import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sha256Canonical } from "../lib/canonical-json.mjs";
import { validateJsonSchema } from "../lib/validators.mjs";
import {
  assertBranchCapsuleReachability,
  assertTodayHandoffBinding,
  validateCoreActivation,
} from "../../runtime/validate-core-activation.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIRECTORY, "../../..");
const SCHEMA_DIRECTORY = path.join(ROOT, "portfolio/core/schemas");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));

function syntheticCapsuleReachability() {
  const projectId = "synthetic-project";
  const rootCapsule = {
    path: `portfolio/core/handoff/versions/0.1.0/cells/${projectId}.branch-capsule.json`,
    data: {
      capsuleId: "cell-capsule:synthetic-project:root",
      capsuleHash: "a".repeat(64),
      recordedAt: "2026-08-20T20:00:00.000Z",
      project: { projectId },
    },
  };
  const resultCapsule = {
    path: `portfolio/core/handoff/versions/0.1.0/cells/${projectId}.reconciled.branch-capsule.json`,
    data: {
      capsuleId: "cell-capsule:synthetic-project:reconciled",
      capsuleHash: "b".repeat(64),
      recordedAt: "2026-08-20T21:00:30.000Z",
      project: { projectId },
    },
  };
  const envelope = {
    path: "portfolio/core/handoff/versions/0.1.0/demonstration/synthetic-envelope.json",
    data: {
      envelopeId: "handoff-action:synthetic",
      envelopeHash: "c".repeat(64),
      branchCapsuleId: rootCapsule.data.capsuleId,
      branchCapsuleHash: rootCapsule.data.capsuleHash,
    },
  };
  const receipt = {
    path: "portfolio/core/handoff/versions/0.1.0/demonstration/synthetic-receipt.json",
    data: {
      receiptId: "handoff-receipt:synthetic",
      receiptHash: "d".repeat(64),
      branchCapsuleId: rootCapsule.data.capsuleId,
      branchCapsuleHash: rootCapsule.data.capsuleHash,
      startedAt: "2026-08-20T21:00:00.000Z",
      completedAt: "2026-08-20T21:01:00.000Z",
      outcome: "succeeded",
      reconciliation: {
        status: "discovered",
        inputCapsuleId: rootCapsule.data.capsuleId,
        inputCapsuleHash: rootCapsule.data.capsuleHash,
        resultCapsuleId: resultCapsule.data.capsuleId,
        resultCapsulePath: resultCapsule.path,
        resultCapsuleHash: resultCapsule.data.capsuleHash,
      },
      resultingState: { projectId },
    },
  };
  const index = {
    entries: [{
      envelopeId: envelope.data.envelopeId,
      envelopeHash: envelope.data.envelopeHash,
      branchCapsuleId: rootCapsule.data.capsuleId,
      branchCapsuleHash: rootCapsule.data.capsuleHash,
      receiptId: receipt.data.receiptId,
      receiptHash: receipt.data.receiptHash,
    }],
  };
  return {
    branchCapsules: [rootCapsule, resultCapsule],
    envelopes: [envelope],
    receipts: [receipt],
    index,
  };
}

test("the integrated Core activation candidate is source-bound and fail-closed", () => {
  const result = validateCoreActivation();
  assert.equal(result.status, "passed");
  assert.equal(result.actionId, "CLOVER-2026-08-20-002");
  assert.match(result.envelopeHash, /^[a-f0-9]{64}$/);
  assert.equal(result.protectedArtifactCount, 11);
  const capsuleDirectory = path.join(ROOT, "portfolio/core/handoff/versions/0.1.0/cells");
  const persistedCapsules = fs.readdirSync(capsuleDirectory).sort().map((filename) => ({
    filename,
    data: JSON.parse(fs.readFileSync(path.join(capsuleDirectory, filename), "utf8")),
  })).filter(({ data }) => data.documentType === "clover-handoff-branch-capsule");
  const catalogRoots = persistedCapsules.filter(({ filename, data }) =>
    filename === `${data.project.projectId}.branch-capsule.json`);
  const currentIndex = readJson("portfolio/core/handoff/index.json");
  const inputCapsules = new Set(currentIndex.entries.map((entry) => `${entry.branchCapsuleId}:${entry.branchCapsuleHash}`));
  assert.equal(result.branchCapsuleCount, persistedCapsules.length);
  assert.equal(result.catalogRootCapsuleCount, catalogRoots.length);
  assert.equal(result.inputBranchCapsuleCount, inputCapsules.size);
  assert.equal(result.resultBranchCapsuleCount, persistedCapsules.length - catalogRoots.length);
  assert.equal(result.branchCapsuleCount, result.catalogRootCapsuleCount + result.resultBranchCapsuleCount);
  assert.deepEqual(result.authorityGranted, []);
  assert.equal(result.mergePerformed, false);
  assert.equal(result.productionDeploymentPerformed, false);
});

test("branch capsule reachability permits only canonical roots and exact successful receipt results", () => {
  const valid = syntheticCapsuleReachability();
  assert.deepEqual(assertBranchCapsuleReachability(valid, valid.index), {
    valid: true,
    branchCapsuleCount: 2,
    catalogRootCapsuleCount: 1,
    inputCapsuleCount: 1,
    resultCapsuleCount: 1,
    catalogRootCapsuleHashes: ["a".repeat(64)],
    inputCapsuleHashes: ["a".repeat(64)],
    resultCapsuleHashes: ["b".repeat(64)],
  });

  const orphaned = structuredClone(valid);
  orphaned.branchCapsules.push({
    path: "portfolio/core/handoff/versions/0.1.0/cells/synthetic-project.orphan.branch-capsule.json",
    data: {
      ...structuredClone(valid.branchCapsules[1].data),
      capsuleId: "cell-capsule:synthetic-project:orphan",
      capsuleHash: "e".repeat(64),
    },
  });
  assert.throws(() => assertBranchCapsuleReachability(orphaned, orphaned.index), /not reachable/i);

  const nonSuccess = structuredClone(valid);
  nonSuccess.receipts[0].data.outcome = "partial";
  assert.throws(() => assertBranchCapsuleReachability(nonSuccess, nonSuccess.index), /did not succeed/i);

  const blockedPartial = structuredClone(valid);
  blockedPartial.branchCapsules = [blockedPartial.branchCapsules[0]];
  blockedPartial.receipts[0].data.outcome = "partial";
  blockedPartial.receipts[0].data.reconciliation = {
    ...blockedPartial.receipts[0].data.reconciliation,
    status: "blocked",
    resultCapsuleId: null,
    resultCapsulePath: null,
    resultCapsuleHash: null,
  };
  assert.deepEqual(assertBranchCapsuleReachability(blockedPartial, blockedPartial.index), {
    valid: true,
    branchCapsuleCount: 1,
    catalogRootCapsuleCount: 1,
    inputCapsuleCount: 1,
    resultCapsuleCount: 0,
    catalogRootCapsuleHashes: ["a".repeat(64)],
    inputCapsuleHashes: ["a".repeat(64)],
    resultCapsuleHashes: [],
  });

  for (const [field, value] of [
    ["resultCapsulePath", "portfolio/core/handoff/versions/0.1.0/cells/wrong.branch-capsule.json"],
    ["resultCapsuleId", "cell-capsule:synthetic-project:wrong"],
    ["resultCapsuleHash", "e".repeat(64)],
  ]) {
    const wrongResultBinding = structuredClone(valid);
    wrongResultBinding.receipts[0].data.reconciliation[field] = value;
    assert.throws(() => assertBranchCapsuleReachability(wrongResultBinding, wrongResultBinding.index),
      /result capsule.*must resolve exactly once/i);
  }

  const wrongResultProject = structuredClone(valid);
  wrongResultProject.branchCapsules[1].data.project.projectId = "substituted-project";
  assert.throws(() => assertBranchCapsuleReachability(wrongResultProject, wrongResultProject.index),
    /changed the receipt project identity/i);

  for (const [location, field, value] of [
    ["receipt", "branchCapsuleId", "cell-capsule:synthetic-project:substituted"],
    ["receipt", "branchCapsuleHash", "f".repeat(64)],
    ["reconciliation", "inputCapsuleId", "cell-capsule:synthetic-project:substituted"],
    ["reconciliation", "inputCapsuleHash", "f".repeat(64)],
  ]) {
    const substitutedReceiptInput = structuredClone(valid);
    const receipt = substitutedReceiptInput.receipts[0].data;
    (location === "receipt" ? receipt : receipt.reconciliation)[field] = value;
    assert.throws(() => assertBranchCapsuleReachability(substitutedReceiptInput, substitutedReceiptInput.index),
      /receipt.*changed its input capsule binding/i);
  }

  for (const [field, value] of [
    ["resultCapsuleId", valid.branchCapsules[0].data.capsuleId],
    ["resultCapsuleHash", valid.branchCapsules[0].data.capsuleHash],
  ]) {
    const reusedInputIdentity = structuredClone(valid);
    reusedInputIdentity.receipts[0].data.reconciliation[field] = value;
    assert.throws(() => assertBranchCapsuleReachability(reusedInputIdentity, reusedInputIdentity.index),
      /reuses its input capsule/i);
  }

  const missingInput = structuredClone(valid);
  missingInput.index.entries[0].branchCapsuleHash = "f".repeat(64);
  assert.throws(() => assertBranchCapsuleReachability(missingInput, missingInput.index), /input capsule binding/i);

  const duplicateResult = structuredClone(valid);
  duplicateResult.envelopes.push({
    path: "portfolio/core/handoff/versions/0.1.0/demonstration/synthetic-envelope-two.json",
    data: {
      ...structuredClone(valid.envelopes[0].data),
      envelopeId: "handoff-action:synthetic-two",
      envelopeHash: "1".repeat(64),
    },
  });
  duplicateResult.receipts.push({
    path: "portfolio/core/handoff/versions/0.1.0/demonstration/synthetic-receipt-two.json",
    data: {
      ...structuredClone(valid.receipts[0].data),
      receiptId: "handoff-receipt:synthetic-two",
      receiptHash: "2".repeat(64),
    },
  });
  duplicateResult.index.entries.push({
    ...structuredClone(valid.index.entries[0]),
    envelopeId: "handoff-action:synthetic-two",
    envelopeHash: "1".repeat(64),
    receiptId: "handoff-receipt:synthetic-two",
    receiptHash: "2".repeat(64),
  });
  assert.throws(() => assertBranchCapsuleReachability(duplicateResult, duplicateResult.index), /more than one successful receipt/i);
});

test("Today is self-bound and rejects widened privacy or malformed identity", () => {
  const schema = readJson("portfolio/core/schemas/today-session.v0.1.schema.json");
  const session = readJson("portfolio/core/today/2026-08-20/session.json");
  const unsigned = structuredClone(session);
  delete unsigned.sessionHash;
  assert.equal(session.sessionHash, sha256Canonical(unsigned));
  validateJsonSchema(schema, session, { schemaDirectory: SCHEMA_DIRECTORY, label: "today-session" });

  for (const mutate of [
    (value) => { value.privacy.containsRawCellData = true; },
    (value) => { value.sessionId = "clover-today:malformed.0.1"; },
    (value) => { value.topPriorities[0].customerRecords = []; },
  ]) {
    const changed = structuredClone(session);
    mutate(changed);
    assert.throws(() => validateJsonSchema(schema, changed, {
      schemaDirectory: SCHEMA_DIRECTORY,
      label: "mutated-today-session",
    }), /JSON Schema violation/);
  }
});

test("the first proposed action resolves exactly once and remains non-authorizing", () => {
  const session = readJson("portfolio/core/today/2026-08-20/session.json");
  const index = readJson(session.handoffIndexPath);
  const matching = index.entries.filter((entry) => entry.actionId === session.actionId);
  assert.equal(matching.length, 1);
  const [entry] = matching;
  assert.equal(entry.envelopePath, session.envelopePath);
  assert.equal(entry.envelopeHash, session.envelopeHash);
  assert.equal(entry.status, "pending");
  assert.equal(entry.lifecycle.state, "proposed");
  assert.equal(entry.lifecycle.singleUse, true);
  assert.equal(entry.lifecycle.consumedAt, null);
  assert.equal(entry.lifecycle.revokedAt, null);
  assert.equal(entry.ownerApproval.status, "pending");
  assert.equal(entry.receiptHash, null);
});

test("a dated Today snapshot remains valid beneath an append-only successor root", () => {
  const session = readJson("portfolio/core/today/2026-08-20/session.json");
  const snapshot = readJson(session.handoffIndexPath);
  const successor = structuredClone(snapshot);
  successor.indexHash = "f".repeat(64);
  successor.previousIndexPath = session.handoffIndexPath;
  successor.previousIndexHash = snapshot.indexHash;
  const chain = [
    { path: "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0002.json", index: successor },
    { path: session.handoffIndexPath, index: snapshot },
  ];
  assert.equal(assertTodayHandoffBinding(session, snapshot, chain).actionId, session.actionId);
  assert.throws(() => assertTodayHandoffBinding(session, snapshot, chain.slice(0, 1)), /not in the current append-only index chain/);
  const substituted = structuredClone(snapshot);
  substituted.indexHash = "0".repeat(64);
  assert.throws(() => assertTodayHandoffBinding(session, substituted, chain), /snapshot hash is stale/);
});
