import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sha256Canonical } from "../lib/canonical-json.mjs";
import { sealHandoffDocument } from "../lib/handoff-ledger.mjs";
import { validateJsonSchema } from "../lib/validators.mjs";
import {
  CONNECTOR_SCOPE_ANCHOR_HASH,
  CONNECTOR_SCOPE_ANCHOR_PATH,
  assertBranchCapsuleReachability,
  assertPostAnchorProspectiveConsumptions,
  assertTodayHandoffBinding,
  validateCoreActivation,
} from "../../runtime/validate-core-activation.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIRECTORY, "../../..");
const SCHEMA_DIRECTORY = path.join(ROOT, "portfolio/core/schemas");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));

const PROSPECTIVE_ENVELOPE_PATH = "portfolio/core/handoff/versions/0.1.0/prospective/action-008-envelope.json";
const PROSPECTIVE_RECEIPT_PATH = "portfolio/core/handoff/versions/0.1.0/prospective/action-008-receipt.json";

function writeTempJson(root, relativePath, value) {
  const absolute = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);
}

function createProspectiveActivationFixture({ outOfScope = false } = {}) {
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clover-activation-scope-"));
  const anchor = readJson(CONNECTOR_SCOPE_ANCHOR_PATH);
  const originalEnvelope = readJson(
    "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2c/action-006-source-envelope.json");
  const originalReceipt = readJson(
    "portfolio/core/handoff/versions/0.1.0/receipts/action-006-launch-studio-phase-b-source-receipt.json");
  const actionId = "CLOVER-2026-08-27-008";
  const envelopeId = "handoff-action:008:prospective-scope";
  const receiptId = "handoff-receipt:008:prospective-scope";
  const envelope = sealHandoffDocument({ ...structuredClone(originalEnvelope), actionId, envelopeId }, "envelopeHash");
  const receipt = sealHandoffDocument({
    ...structuredClone(originalReceipt),
    actionId,
    envelopeId,
    envelopeHash: envelope.envelopeHash,
    receiptId,
    observations: outOfScope
      ? structuredClone(originalReceipt.observations)
      : originalReceipt.observations.filter(({ sourceId }) => sourceId !== "vercel"),
  }, "receiptHash");
  const available = structuredClone(anchor);
  available.indexId = "handoff-index:prospective-action-008-available";
  available.createdAt = "2026-08-27T12:00:00.000Z";
  available.previousIndexPath = CONNECTOR_SCOPE_ANCHOR_PATH;
  available.previousIndexHash = anchor.indexHash;
  const ownerApproval = structuredClone(anchor.entries.at(-1).ownerApproval);
  ownerApproval.approvedEnvelopeHash = envelope.envelopeHash;
  available.entries.push({
    sequence: anchor.entries.length + 1,
    recordedAt: available.createdAt,
    actionId,
    branchCapsuleId: envelope.branchCapsuleId,
    branchCapsuleHash: envelope.branchCapsuleHash,
    envelopeId,
    envelopePath: PROSPECTIVE_ENVELOPE_PATH,
    envelopeHash: envelope.envelopeHash,
    status: "pending",
    lifecycle: {
      state: "available",
      singleUse: true,
      consumedAt: null,
      consumedByReceiptId: null,
      revokedAt: null,
      revocationEvidenceHash: null,
    },
    ownerApproval,
    receiptId: null,
    receiptPath: null,
    receiptHash: null,
    outcome: "pending",
    review: { status: "pending", decisionId: null, decisionPath: null, decisionHash: null },
  });
  const sealedAvailable = sealHandoffDocument(available, "indexHash");
  const consumed = structuredClone(sealedAvailable);
  consumed.indexId = "handoff-index:prospective-action-008-consumed";
  consumed.createdAt = "2026-08-27T12:01:00.000Z";
  consumed.previousIndexPath = "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0008.json";
  consumed.previousIndexHash = sealedAvailable.indexHash;
  const entry = consumed.entries.at(-1);
  entry.recordedAt = consumed.createdAt;
  entry.status = "completed";
  entry.lifecycle = {
    state: "consumed",
    singleUse: true,
    consumedAt: receipt.completedAt,
    consumedByReceiptId: receipt.receiptId,
    revokedAt: null,
    revocationEvidenceHash: null,
  };
  entry.receiptId = receipt.receiptId;
  entry.receiptPath = PROSPECTIVE_RECEIPT_PATH;
  entry.receiptHash = receipt.receiptHash;
  entry.outcome = receipt.outcome;
  const fixture = {
    repositoryRoot,
    anchor,
    envelope,
    receipt,
    available: sealedAvailable,
    consumed: sealHandoffDocument(consumed, "indexHash"),
  };
  syncActivationFixture(fixture);
  return fixture;
}

function syncActivationFixture(fixture) {
  writeTempJson(fixture.repositoryRoot, PROSPECTIVE_ENVELOPE_PATH, fixture.envelope);
  writeTempJson(fixture.repositoryRoot, PROSPECTIVE_RECEIPT_PATH, fixture.receipt);
  fixture.discovered = {
    documents: [
      { path: PROSPECTIVE_ENVELOPE_PATH, data: fixture.envelope },
      { path: PROSPECTIVE_RECEIPT_PATH, data: fixture.receipt },
    ],
    envelopes: [{ path: PROSPECTIVE_ENVELOPE_PATH, data: fixture.envelope }],
    receipts: [{ path: PROSPECTIVE_RECEIPT_PATH, data: fixture.receipt }],
  };
  fixture.chain = [
    { path: "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0009.json", index: fixture.consumed },
    { path: "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0008.json", index: fixture.available },
    { path: CONNECTOR_SCOPE_ANCHOR_PATH, index: fixture.anchor },
  ];
}

function resealActivationIndexes(fixture) {
  fixture.available = sealHandoffDocument(fixture.available, "indexHash");
  fixture.consumed.previousIndexHash = fixture.available.indexHash;
  fixture.consumed = sealHandoffDocument(fixture.consumed, "indexHash");
}

function validateActivationFixture(fixture, chain = fixture.chain) {
  return assertPostAnchorProspectiveConsumptions(chain, fixture.discovered, {
    repositoryRoot: fixture.repositoryRoot,
  });
}

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

test("Core activation preserves historical Action 006 HOLD and validates allowed post-anchor consumption", () => {
  const activation = validateCoreActivation();
  assert.equal(activation.handoffIndexHash, CONNECTOR_SCOPE_ANCHOR_HASH);
  const anchor = readJson(CONNECTOR_SCOPE_ANCHOR_PATH);
  const action006 = anchor.entries.find(({ actionId }) => actionId === "CLOVER-2026-08-24-006");
  assert.equal(action006.lifecycle.state, "consumed");
  assert.equal(action006.outcome, "succeeded");
  assert.equal(action006.review.status, "completed");
  assert.equal(action006.review.decisionId, "handoff-review:006:connector-scope-hold");

  const fixture = createProspectiveActivationFixture();
  const before = structuredClone({ envelope: fixture.envelope, receipt: fixture.receipt, chain: fixture.chain });
  assert.deepEqual(validateActivationFixture(fixture), {
    status: "passed",
    anchorIndexHash: CONNECTOR_SCOPE_ANCHOR_HASH,
    evaluatedConsumptions: 1,
  });
  assert.deepEqual({ envelope: fixture.envelope, receipt: fixture.receipt, chain: fixture.chain }, before);
  assert.equal(fixture.consumed.entries.at(-1).ownerApproval.status, "approved");
  assert.equal(fixture.consumed.entries.at(-1).review.status, "pending");
});

test("Core activation rejects out-of-scope and directly appended consumed entries", () => {
  {
    const fixture = createProspectiveActivationFixture({ outOfScope: true });
    assert.throws(
      () => validateActivationFixture(fixture),
      (error) => error?.code === "HANDOFF_CONNECTOR_SCOPE_VIOLATION" && /vercel/u.test(error.message),
    );
  }
  {
    const fixture = createProspectiveActivationFixture();
    const direct = structuredClone(fixture.consumed);
    direct.indexId = "handoff-index:prospective-action-008-direct-consumed";
    direct.previousIndexPath = CONNECTOR_SCOPE_ANCHOR_PATH;
    direct.previousIndexHash = fixture.anchor.indexHash;
    direct.createdAt = "2026-08-27T12:01:00.000Z";
    const chain = [
      { path: "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0008.json", index: sealHandoffDocument(direct, "indexHash") },
      { path: CONNECTOR_SCOPE_ANCHOR_PATH, index: fixture.anchor },
    ];
    assert.throws(
      () => validateActivationFixture(fixture, chain),
      (error) => error?.code === "HANDOFF_INDEX_TRANSITION_INVALID" && /appended an already-consumed entry/u.test(error.message),
    );
  }
});

test("Core activation fails closed on every post-anchor indexed-document substitution", () => {
  const cases = [
    ["stale envelope hash", (fixture) => {
      fixture.envelope.scope.allowedConnectors.push("vercel");
    }, /envelopeHash|canonical document/u],
    ["stale receipt hash", (fixture) => {
      fixture.receipt.observations[0].subject = "stale receipt mutation";
    }, /receiptHash|canonical document/u],
    ["resealed envelope substitution", (fixture) => {
      fixture.envelope.scope.allowedConnectors.push("vercel");
      fixture.envelope = sealHandoffDocument(fixture.envelope, "envelopeHash");
    }, /envelope.*path was substituted/u],
    ["resealed receipt substitution", (fixture) => {
      fixture.receipt.observations[0].subject = "resealed receipt substitution";
      fixture.receipt = sealHandoffDocument(fixture.receipt, "receiptHash");
    }, /receipt.*path was substituted/u],
    ["envelope-path substitution", (fixture) => {
      fixture.available.entries.at(-1).envelopePath = PROSPECTIVE_RECEIPT_PATH;
      fixture.consumed.entries.at(-1).envelopePath = PROSPECTIVE_RECEIPT_PATH;
      resealActivationIndexes(fixture);
    }, /envelope.*path was substituted/u],
    ["receipt-path substitution", (fixture) => {
      fixture.consumed.entries.at(-1).receiptPath = PROSPECTIVE_ENVELOPE_PATH;
      fixture.consumed = sealHandoffDocument(fixture.consumed, "indexHash");
    }, /receipt.*path was substituted/u],
    ["action identity substitution", (fixture) => {
      fixture.available.entries.at(-1).actionId = "CLOVER-2026-08-27-009";
      fixture.consumed.entries.at(-1).actionId = "CLOVER-2026-08-27-009";
      resealActivationIndexes(fixture);
    }, /envelope.*substituted|unique indexed envelope/u],
    ["envelope identity substitution", (fixture) => {
      fixture.available.entries.at(-1).envelopeId = "handoff-action:009:substituted";
      fixture.consumed.entries.at(-1).envelopeId = "handoff-action:009:substituted";
      resealActivationIndexes(fixture);
    }, /envelope.*path was substituted|unique indexed envelope/u],
    ["receipt identity substitution", (fixture) => {
      const entry = fixture.consumed.entries.at(-1);
      entry.receiptId = "handoff-receipt:009:substituted";
      entry.lifecycle.consumedByReceiptId = entry.receiptId;
      fixture.consumed = sealHandoffDocument(fixture.consumed, "indexHash");
    }, /receipt.*path was substituted|unique indexed envelope and receipt/u],
  ];
  for (const [label, mutate, expected] of cases) {
    const fixture = createProspectiveActivationFixture();
    mutate(fixture);
    syncActivationFixture(fixture);
    assert.throws(() => validateActivationFixture(fixture), expected, label);
  }

  const duplicate = createProspectiveActivationFixture();
  const duplicatePath = "portfolio/core/handoff/versions/0.1.0/prospective/duplicate-envelope.json";
  writeTempJson(duplicate.repositoryRoot, duplicatePath, duplicate.envelope);
  duplicate.discovered.documents.push({ path: duplicatePath, data: duplicate.envelope });
  duplicate.discovered.envelopes.push({ path: duplicatePath, data: duplicate.envelope });
  assert.throws(() => validateActivationFixture(duplicate), /unique indexed envelope and receipt/u);
});

test("Core activation rejects traversal, symlink, missing-anchor, and rewritten-anchor defects", () => {
  {
    const fixture = createProspectiveActivationFixture();
    fixture.available.entries.at(-1).envelopePath = "portfolio/core/handoff/versions/0.1.0/prospective/../action-008-envelope.json";
    fixture.consumed.entries.at(-1).envelopePath = fixture.available.entries.at(-1).envelopePath;
    resealActivationIndexes(fixture);
    syncActivationFixture(fixture);
    assert.throws(() => validateActivationFixture(fixture), /canonical immutable Handoff path/u);
  }
  {
    const fixture = createProspectiveActivationFixture();
    const envelopePath = path.join(fixture.repositoryRoot, PROSPECTIVE_ENVELOPE_PATH);
    const target = `${envelopePath}.actual`;
    fs.renameSync(envelopePath, target);
    fs.symlinkSync(path.basename(target), envelopePath);
    assert.throws(() => validateActivationFixture(fixture), /symbolic link/u);
  }
  {
    const fixture = createProspectiveActivationFixture();
    assert.throws(() => validateActivationFixture(fixture, fixture.chain.slice(0, 2)), /anchor index 0007 is missing or rewritten/u);
  }
  {
    const fixture = createProspectiveActivationFixture();
    const rewritten = sealHandoffDocument({ ...structuredClone(fixture.anchor), indexId: "handoff-index:rewritten-anchor-0007" }, "indexHash");
    const chain = [...fixture.chain.slice(0, 2), { path: CONNECTOR_SCOPE_ANCHOR_PATH, index: rewritten }];
    assert.throws(() => validateActivationFixture(fixture, chain), /anchor index 0007 is missing or rewritten/u);
  }
});

test("Core activation accepts post-anchor non-consumption transitions without authority or source widening", () => {
  const fixture = createProspectiveActivationFixture();
  const before = structuredClone(fixture.available);
  const chain = [fixture.chain[1], fixture.chain[2]];
  assert.deepEqual(validateActivationFixture(fixture, chain), {
    status: "passed",
    anchorIndexHash: CONNECTOR_SCOPE_ANCHOR_HASH,
    evaluatedConsumptions: 0,
  });
  assert.deepEqual(fixture.available, before);
  assert.equal(fixture.available.entries.at(-1).ownerApproval.status, "approved");
  assert.equal(fixture.available.entries.at(-1).receiptId, null);
});
