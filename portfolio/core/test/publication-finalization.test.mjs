import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sha256Bytes, sha256Canonical } from "../lib/canonical-json.mjs";
import { sealHandoffDocument, validateIndexTransition } from "../lib/handoff-ledger.mjs";
import {
  ACTION_002_HASH,
  CONNECTOR_SCOPE_ANCHOR_HASH,
  CONNECTOR_SCOPE_ANCHOR_PATH,
  HANDOFF_INDEX_DIRECTORY,
  HANDOFF_INDEX_PATH,
  HISTORICAL_RECEIPT_HASH,
  HISTORICAL_REPORT_HASH,
  HISTORICAL_HANDOFF_INDEX_BYTE_HASH,
  HISTORICAL_HANDOFF_INDEX_HASH,
  HISTORICAL_REVIEW_PROMPT_HASH,
  PUBLICATION_INDEX_PATH,
  assertSanitizedPublicationMirror,
  loadPublicationCatalog,
  publicationRecordHash,
  validateHandoffIndexChain,
  validatePublicationFinalization,
  validatePublicationIndexChain,
  validatePublicationIndexTransition,
} from "../lib/publication-finalization.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIRECTORY, "../../..");

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function writeJson(root, relativePath, value) {
  const absolute = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clover-publication-test-"));
  for (const relativePath of [
    "portfolio/core/publication",
    "portfolio/core/today/2026-08-20/session.json",
    "portfolio/core/handoff/index.json",
    "portfolio/core/handoff/versions/0.1.0/indexes",
    "portfolio/core/handoff/versions/0.1.0/schemas/action-receipt-index.schema.json",
    "portfolio/status/candidates/2026-08-20/status.json",
  ]) {
    const source = path.join(ROOT, relativePath);
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true });
  }
  return root;
}

function seal(value, field) {
  const unsigned = structuredClone(value);
  delete unsigned[field];
  value[field] = sha256Canonical(unsigned);
  return value[field];
}

function writeReboundReadback(root, mutate) {
  const index = readJson(root, PUBLICATION_INDEX_PATH);
  const readback = readJson(root, index.current.publicationReadback.path);
  mutate(readback);
  const readbackHash = seal(readback, "publicationReadbackHash");
  writeJson(root, index.current.publicationReadback.path, readback);
  index.current.publicationReadback.hash = readbackHash;
  index.connectorIds["clover://publication/readback"].hash = readbackHash;
  index.entries.find((entry) => entry.recordId === index.current.publicationReadback.recordId).hash = readbackHash;
  seal(index, "publicationIndexHash");
  writeJson(root, PUBLICATION_INDEX_PATH, index);
  writeJson(root, index.lifecycle.immutableSnapshotPath, index);
}

function makeSuccessor(previous) {
  const next = structuredClone(previous);
  next.updatedAt = "2026-08-21T01:00:00Z";
  next.lifecycle.sequence = previous.lifecycle.sequence + 1;
  next.lifecycle.immutableSnapshotPath = "portfolio/core/publication/versions/0.1.0/records/core-publication-index-0002.json";
  next.lifecycle.previousIndexPath = previous.lifecycle.immutableSnapshotPath;
  next.lifecycle.previousIndexHash = previous.publicationIndexHash;
  const priorReadback = next.entries.find((entry) => entry.recordId === next.current.publicationReadback.recordId);
  priorReadback.status = "superseded";
  const pointer = {
    artifactType: "publication-readback",
    recordId: "core-trunk-activation-publication-readback:2026-08-20:0002",
    path: "portfolio/core/publication/versions/0.1.0/records/core-trunk-activation-publication-readback-0002.json",
    hash: previous.current.publicationReadback.hash,
    hashMode: "sha256-canonical-without-self-hash-field",
    mediaType: "application/json",
  };
  next.current.publicationReadback = structuredClone(pointer);
  next.connectorIds["clover://publication/readback"] = structuredClone(pointer);
  next.entries.push({ sequence: 6, ...pointer, recordedAt: "2026-08-21T01:00:00Z", status: "current" });
  seal(next, "publicationIndexHash");
  return next;
}

function handoffSnapshotPath(sequence) {
  return `${HANDOFF_INDEX_DIRECTORY}/action-receipt-index-${String(sequence).padStart(4, "0")}.json`;
}

function numberedHandoffSnapshotPaths(root) {
  return fs.readdirSync(path.join(root, HANDOFF_INDEX_DIRECTORY))
    .filter((name) => /^action-receipt-index-\d{4}\.json$/u.test(name))
    .sort()
    .map((name) => HANDOFF_INDEX_DIRECTORY + "/" + name);
}

function handoffSnapshotSequence(relativePath) {
  return Number.parseInt(relativePath.match(/(\d{4})\.json$/u)[1], 10);
}

function createGenesisHandoffRoot() {
  const root = createTempRoot();
  const genesisPath = handoffSnapshotPath(1);
  for (const relativePath of numberedHandoffSnapshotPaths(root)) {
    if (relativePath !== genesisPath) fs.unlinkSync(path.join(root, relativePath));
  }
  fs.copyFileSync(path.join(root, genesisPath), path.join(root, HANDOFF_INDEX_PATH));
  const chain = validateHandoffIndexChain(root);
  assert.equal(chain.depth, 1);
  assert.equal(chain.currentSnapshotPath, genesisPath);
  assert.deepEqual(numberedHandoffSnapshotPaths(root), [genesisPath]);
  assert.deepEqual(
    fs.readFileSync(path.join(root, HANDOFF_INDEX_PATH)),
    fs.readFileSync(path.join(root, genesisPath)),
  );
  return root;
}

function makeApprovedHandoffSuccessor(previous, sequence = 2) {
  const next = structuredClone(previous);
  next.indexId = `handoff-index:synthetic-approved-${sequence}:20260820`;
  next.createdAt = `2026-08-20T21:${String(18 + sequence).padStart(2, "0")}:00.000Z`;
  next.previousIndexPath = handoffSnapshotPath(sequence - 1);
  next.previousIndexHash = previous.indexHash;
  const action = next.entries.find((entry) => entry.actionId === "CLOVER-2026-08-20-002");
  action.recordedAt = next.createdAt;
  action.lifecycle.state = "available";
  action.ownerApproval = {
    status: "approved",
    approverId: "owner:chris-dortch",
    approvedAt: "2026-08-20T21:19:50.000Z",
    approvedEnvelopeHash: ACTION_002_HASH,
    approvalEvidenceHash: "a".repeat(64),
    attestationId: "handoff-approval:002:synthetic",
    attestationPath: "portfolio/core/handoff/versions/0.1.0/approvals/action-002.synthetic.json",
    attestationHash: "b".repeat(64),
  };
  return sealHandoffDocument(next, "indexHash");
}

function makeConsumedHandoffSuccessor(previous, sequence = 3) {
  const next = structuredClone(previous);
  next.indexId = `handoff-index:synthetic-consumed-${sequence}:20260820`;
  next.createdAt = `2026-08-20T21:${String(18 + sequence).padStart(2, "0")}:00.000Z`;
  next.previousIndexPath = handoffSnapshotPath(sequence - 1);
  next.previousIndexHash = previous.indexHash;
  const action = next.entries.find((entry) => entry.actionId === "CLOVER-2026-08-20-002");
  action.recordedAt = next.createdAt;
  action.status = "completed";
  action.lifecycle = {
    state: "consumed",
    singleUse: true,
    consumedAt: "2026-08-20T21:20:30.000Z",
    consumedByReceiptId: "handoff-receipt:002:synthetic",
    revokedAt: null,
    revocationEvidenceHash: null,
  };
  action.receiptId = "handoff-receipt:002:synthetic";
  action.receiptPath = "portfolio/core/handoff/versions/0.1.0/demonstration/action-002.synthetic-receipt.json";
  action.receiptHash = "c".repeat(64);
  action.outcome = "partial";
  return sealHandoffDocument(next, "indexHash");
}

function makeReviewedHandoffSuccessor(previous, sequence = 4) {
  const next = structuredClone(previous);
  next.indexId = `handoff-index:synthetic-reviewed-${sequence}:20260820`;
  next.createdAt = `2026-08-20T21:${String(18 + sequence).padStart(2, "0")}:00.000Z`;
  next.previousIndexPath = handoffSnapshotPath(sequence - 1);
  next.previousIndexHash = previous.indexHash;
  const action = next.entries.find((entry) => entry.actionId === "CLOVER-2026-08-20-002");
  action.recordedAt = next.createdAt;
  action.review = {
    status: "completed",
    decisionId: "handoff-review:002:synthetic",
    decisionPath: "portfolio/core/handoff/versions/0.1.0/reviews/action-002.synthetic.json",
    decisionHash: "d".repeat(64),
  };
  return sealHandoffDocument(next, "indexHash");
}

function installHandoffChain(root, indexes) {
  for (const relativePath of numberedHandoffSnapshotPaths(root)) {
    fs.unlinkSync(path.join(root, relativePath));
  }
  indexes.forEach((index, offset) => writeJson(root, handoffSnapshotPath(offset + 1), index));
  writeJson(root, HANDOFF_INDEX_PATH, indexes.at(-1));
  assert.deepEqual(
    numberedHandoffSnapshotPaths(root),
    indexes.map((_, offset) => handoffSnapshotPath(offset + 1)),
  );
  assert.deepEqual(
    fs.readFileSync(path.join(root, HANDOFF_INDEX_PATH)),
    fs.readFileSync(path.join(root, handoffSnapshotPath(indexes.length))),
  );
  assert.equal(validateHandoffIndexChain(root).depth, indexes.length);
}

function installLatestHandoffIndex(root, index, sequence) {
  for (let ancestor = 1; ancestor < sequence; ancestor += 1) {
    assert.equal(fs.existsSync(path.join(root, handoffSnapshotPath(ancestor))), true);
  }
  for (const relativePath of numberedHandoffSnapshotPaths(root)) {
    if (handoffSnapshotSequence(relativePath) > sequence) fs.unlinkSync(path.join(root, relativePath));
  }
  writeJson(root, handoffSnapshotPath(sequence), index);
  writeJson(root, HANDOFF_INDEX_PATH, index);
  assert.deepEqual(
    fs.readFileSync(path.join(root, HANDOFF_INDEX_PATH)),
    fs.readFileSync(path.join(root, handoffSnapshotPath(sequence))),
  );
}

const PROSPECTIVE_ENVELOPE_PATH = "portfolio/core/handoff/versions/0.1.0/prospective/action-008-envelope.json";
const PROSPECTIVE_RECEIPT_PATH = "portfolio/core/handoff/versions/0.1.0/prospective/action-008-receipt.json";

function createProspectiveConsumptionFixture(root, { outOfScope = false } = {}) {
  const anchor = readJson(root, CONNECTOR_SCOPE_ANCHOR_PATH);
  const originalEnvelope = readJson(ROOT,
    "portfolio/core/handoff/versions/0.1.0/proposals/launch-studio-phase-b-0.2c/action-006-source-envelope.json");
  const originalReceipt = readJson(ROOT,
    "portfolio/core/handoff/versions/0.1.0/receipts/action-006-launch-studio-phase-b-source-receipt.json");
  const actionId = "CLOVER-2026-08-27-008";
  const envelopeId = "handoff-action:008:prospective-scope";
  const receiptId = "handoff-receipt:008:prospective-scope";
  const envelope = sealHandoffDocument({ ...structuredClone(originalEnvelope), actionId, envelopeId }, "envelopeHash");
  const observations = outOfScope
    ? structuredClone(originalReceipt.observations)
    : originalReceipt.observations.filter(({ sourceId }) => sourceId !== "vercel");
  const receipt = sealHandoffDocument({
    ...structuredClone(originalReceipt),
    actionId,
    envelopeId,
    envelopeHash: envelope.envelopeHash,
    receiptId,
    observations,
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
  consumed.previousIndexPath = handoffSnapshotPath(8);
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
  const sealedConsumed = sealHandoffDocument(consumed, "indexHash");

  writeJson(root, PROSPECTIVE_ENVELOPE_PATH, envelope);
  writeJson(root, PROSPECTIVE_RECEIPT_PATH, receipt);
  writeJson(root, handoffSnapshotPath(8), sealedAvailable);
  writeJson(root, handoffSnapshotPath(9), sealedConsumed);
  writeJson(root, HANDOFF_INDEX_PATH, sealedConsumed);
  return { anchor, envelope, receipt, available: sealedAvailable, consumed: sealedConsumed };
}

function installProspectiveFixture(root, fixture) {
  writeJson(root, PROSPECTIVE_ENVELOPE_PATH, fixture.envelope);
  writeJson(root, PROSPECTIVE_RECEIPT_PATH, fixture.receipt);
  writeJson(root, handoffSnapshotPath(8), fixture.available);
  writeJson(root, handoffSnapshotPath(9), fixture.consumed);
  writeJson(root, HANDOFF_INDEX_PATH, fixture.consumed);
}

function resealProspectiveIndexes(fixture) {
  fixture.available = sealHandoffDocument(fixture.available, "indexHash");
  fixture.consumed.previousIndexHash = fixture.available.indexHash;
  fixture.consumed = sealHandoffDocument(fixture.consumed, "indexHash");
}

function createHandoffSuccessorRoot(state = "approved") {
  const root = createGenesisHandoffRoot();
  const genesis = readJson(root, handoffSnapshotPath(1));
  const approved = makeApprovedHandoffSuccessor(genesis);
  const indexes = [genesis, approved];
  if (["consumed", "reviewed"].includes(state)) indexes.push(makeConsumedHandoffSuccessor(approved));
  if (state === "reviewed") indexes.push(makeReviewedHandoffSuccessor(indexes.at(-1)));
  installHandoffChain(root, indexes);
  return { root, indexes };
}

test("the persisted publication catalog is closed, source-bound, and non-authorizing", () => {
  const result = validatePublicationFinalization(ROOT);
  const handoff = validateHandoffIndexChain(ROOT);
  assert.equal(result.status, "passed");
  assert.equal(result.verdict, "AMEND");
  assert.equal(result.historicalExternalReceiptHash, HISTORICAL_RECEIPT_HASH);
  assert.equal(result.action002Status, "pending");
  assert.equal(result.containerBindingStatus, "pending-external-publication-receipt");
  assert.equal(result.chainDepth, 1);
  assert.equal(result.handoffChainDepth, handoff.depth);
  assert.equal(result.currentHandoffIndexHash, handoff.currentIndexHash);
  assert.equal(result.historicalHandoffIndexHash, HISTORICAL_HANDOFF_INDEX_HASH);
});

test("the three externally issued artifacts are mirrored byte-for-byte", () => {
  const index = readJson(ROOT, PUBLICATION_INDEX_PATH);
  for (const [currentName, expected] of Object.entries({
    finalReport: HISTORICAL_REPORT_HASH,
    sourceBoundReceipt: HISTORICAL_RECEIPT_HASH,
    reviewPrompt: HISTORICAL_REVIEW_PROMPT_HASH,
  })) {
    const pointer = index.current[currentName];
    assert.equal(pointer.hashMode, "sha256-bytes");
    assert.equal(sha256Bytes(fs.readFileSync(path.join(ROOT, pointer.path))), expected);
    assert.equal(pointer.hash, expected);
  }
});

test("the root index is byte-identical to immutable index 0001 and connector IDs resolve exact pointers", () => {
  const index = readJson(ROOT, PUBLICATION_INDEX_PATH);
  assert.deepEqual(
    fs.readFileSync(path.join(ROOT, PUBLICATION_INDEX_PATH)),
    fs.readFileSync(path.join(ROOT, index.lifecycle.immutableSnapshotPath)),
  );
  assert.deepEqual(index.connectorIds["clover://publication/report"], index.current.finalReport);
  assert.deepEqual(index.connectorIds["clover://publication/receipt"], index.current.sourceBoundReceipt);
  assert.deepEqual(index.connectorIds["clover://publication/review-prompt"], index.current.reviewPrompt);
  assert.deepEqual(index.connectorIds["clover://publication/review-decision"], index.current.reviewPointer);
  assert.deepEqual(index.connectorIds["clover://publication/readback"], index.current.publicationReadback);
});

test("the current Handoff root resolves to its latest immutable snapshot and preserves genesis index 0001", () => {
  const chain = validateHandoffIndexChain(ROOT);
  assert.equal(chain.status, "passed");
  assert.equal(chain.currentSnapshotPath, handoffSnapshotPath(chain.depth));
  assert.deepEqual(
    fs.readFileSync(path.join(ROOT, HANDOFF_INDEX_PATH)),
    fs.readFileSync(path.join(ROOT, chain.currentSnapshotPath)),
  );
  assert.equal(chain.historicalSnapshotPath, handoffSnapshotPath(1));
  assert.equal(chain.historicalIndexHash, HISTORICAL_HANDOFF_INDEX_HASH);
  assert.equal(sha256Bytes(fs.readFileSync(path.join(ROOT, handoffSnapshotPath(1)))), HISTORICAL_HANDOFF_INDEX_BYTE_HASH);
  if (chain.depth === 1) {
    assert.equal(chain.currentIndexHash, chain.historicalIndexHash);
    assert.equal(chain.currentSnapshotPath, chain.historicalSnapshotPath);
  } else {
    assert.notEqual(chain.currentIndexHash, chain.historicalIndexHash);
    assert.notEqual(chain.currentSnapshotPath, chain.historicalSnapshotPath);
  }
});

test("pre-anchor structural histories remain readable but cannot substitute for the canonical enforcement anchor", () => {
  for (const [state, depth] of [["approved", 2], ["consumed", 3], ["reviewed", 4]]) {
    const { root, indexes } = createHandoffSuccessorRoot(state);
    const chain = validateHandoffIndexChain(root);
    assert.equal(chain.depth, depth);
    assert.equal(chain.currentIndexHash, indexes.at(-1).indexHash);
    assert.equal(chain.currentSnapshotPath, handoffSnapshotPath(depth));
    assert.equal(chain.historicalIndexHash, HISTORICAL_HANDOFF_INDEX_HASH);
    assert.equal(chain.historicalSnapshotPath, handoffSnapshotPath(1));
    assert.notEqual(chain.currentIndexHash, chain.historicalIndexHash);

    assert.throws(() => validatePublicationFinalization(root), /anchor index 0007 is missing or rewritten/u);
  }
});

test("publication finalization preserves historical Action 006 HOLD and enforces only post-anchor consumptions", () => {
  const current = validateHandoffIndexChain(ROOT, { enforceProspectiveEvidenceScope: true });
  assert.equal(current.currentSnapshotPath, CONNECTOR_SCOPE_ANCHOR_PATH);
  assert.deepEqual(current.prospectiveEvidenceScope, {
    status: "passed",
    anchorIndexHash: CONNECTOR_SCOPE_ANCHOR_HASH,
    evaluatedConsumptions: 0,
  });
  const action006 = current.currentIndex.entries.find(({ actionId }) => actionId === "CLOVER-2026-08-24-006");
  assert.equal(action006.lifecycle.state, "consumed");
  assert.equal(action006.outcome, "succeeded");
  assert.equal(action006.review.status, "completed");
  assert.equal(action006.review.decisionId, "handoff-review:006:connector-scope-hold");
  assert.equal(readJson(ROOT, action006.receiptPath).receiptHash, action006.receiptHash);

  const root = createTempRoot();
  const fixture = createProspectiveConsumptionFixture(root);
  const before = structuredClone(fixture);
  const result = validateHandoffIndexChain(root, { enforceProspectiveEvidenceScope: true });
  assert.equal(result.currentSnapshotPath, handoffSnapshotPath(9));
  assert.equal(result.prospectiveEvidenceScope.evaluatedConsumptions, 1);
  assert.deepEqual(fixture, before);
  const publication = validatePublicationFinalization(root);
  assert.equal(publication.status, "passed");
  assert.equal(publication.currentHandoffIndexHash, fixture.consumed.indexHash);
  assert.equal(fixture.consumed.entries.at(-1).ownerApproval.status, "approved");
  assert.equal(fixture.consumed.entries.at(-1).review.status, "pending");
});

test("publication finalization rejects post-anchor out-of-scope evidence before the stable root is accepted", () => {
  const root = createTempRoot();
  const fixture = createProspectiveConsumptionFixture(root, { outOfScope: true });
  const stableBytes = fs.readFileSync(path.join(root, HANDOFF_INDEX_PATH));
  assert.throws(
    () => validatePublicationFinalization(root),
    (error) => error?.code === "HANDOFF_CONNECTOR_SCOPE_VIOLATION" && /vercel/u.test(error.message),
  );
  assert.deepEqual(fs.readFileSync(path.join(root, HANDOFF_INDEX_PATH)), stableBytes);
  assert.equal(readJson(root, HANDOFF_INDEX_PATH).indexHash, fixture.consumed.indexHash);
});

test("publication finalization rejects a post-anchor entry appended already consumed", () => {
  const root = createTempRoot();
  const fixture = createProspectiveConsumptionFixture(root);
  const direct = structuredClone(fixture.consumed);
  direct.indexId = "handoff-index:prospective-action-008-direct-consumed";
  direct.previousIndexPath = CONNECTOR_SCOPE_ANCHOR_PATH;
  direct.previousIndexHash = fixture.anchor.indexHash;
  direct.createdAt = "2026-08-27T12:01:00.000Z";
  const sealed = sealHandoffDocument(direct, "indexHash");
  writeJson(root, handoffSnapshotPath(8), sealed);
  fs.unlinkSync(path.join(root, handoffSnapshotPath(9)));
  writeJson(root, HANDOFF_INDEX_PATH, sealed);
  assert.throws(
    () => validatePublicationFinalization(root),
    (error) => error?.code === "HANDOFF_INDEX_TRANSITION_INVALID" && /appended an already-consumed entry/u.test(error.message),
  );
});

test("publication finalization fails closed on every post-anchor indexed-document substitution", () => {
  const cases = [
    ["stale envelope hash", (root, fixture) => {
      fixture.envelope.scope.allowedConnectors.push("vercel");
    }, /envelopeHash|canonical document/u],
    ["stale receipt hash", (root, fixture) => {
      fixture.receipt.observations[0].subject = "stale receipt mutation";
    }, /receiptHash|canonical document/u],
    ["resealed envelope substitution", (root, fixture) => {
      fixture.envelope.scope.allowedConnectors.push("vercel");
      fixture.envelope = sealHandoffDocument(fixture.envelope, "envelopeHash");
    }, /envelope.*substituted/u],
    ["resealed receipt substitution", (root, fixture) => {
      fixture.receipt.observations[0].subject = "resealed receipt substitution";
      fixture.receipt = sealHandoffDocument(fixture.receipt, "receiptHash");
    }, /receipt.*substituted/u],
    ["envelope-path substitution", (root, fixture) => {
      fixture.available.entries.at(-1).envelopePath = PROSPECTIVE_RECEIPT_PATH;
      fixture.consumed.entries.at(-1).envelopePath = PROSPECTIVE_RECEIPT_PATH;
      resealProspectiveIndexes(fixture);
    }, /envelope.*path was substituted/u],
    ["receipt-path substitution", (root, fixture) => {
      fixture.consumed.entries.at(-1).receiptPath = PROSPECTIVE_ENVELOPE_PATH;
      fixture.consumed = sealHandoffDocument(fixture.consumed, "indexHash");
    }, /receipt.*path was substituted/u],
    ["action identity substitution", (root, fixture) => {
      fixture.available.entries.at(-1).actionId = "CLOVER-2026-08-27-009";
      fixture.consumed.entries.at(-1).actionId = "CLOVER-2026-08-27-009";
      resealProspectiveIndexes(fixture);
    }, /envelope.*substituted|unique indexed envelope/u],
    ["envelope identity substitution", (root, fixture) => {
      fixture.available.entries.at(-1).envelopeId = "handoff-action:009:substituted";
      fixture.consumed.entries.at(-1).envelopeId = "handoff-action:009:substituted";
      resealProspectiveIndexes(fixture);
    }, /envelope.*path was substituted|unique indexed envelope/u],
    ["receipt identity substitution", (root, fixture) => {
      const entry = fixture.consumed.entries.at(-1);
      entry.receiptId = "handoff-receipt:009:substituted";
      entry.lifecycle.consumedByReceiptId = entry.receiptId;
      fixture.consumed = sealHandoffDocument(fixture.consumed, "indexHash");
    }, /receipt.*path was substituted|unique indexed envelope and receipt/u],
    ["duplicate candidate envelope", (root, fixture) => {
      writeJson(root, "portfolio/core/handoff/versions/0.1.0/prospective/duplicate-envelope.json", fixture.envelope);
    }, /unique indexed envelope and receipt/u],
  ];
  for (const [label, mutate, expected] of cases) {
    const root = createTempRoot();
    const fixture = createProspectiveConsumptionFixture(root);
    mutate(root, fixture);
    installProspectiveFixture(root, fixture);
    assert.throws(() => validatePublicationFinalization(root), expected, label);
  }
});

test("publication finalization rejects traversal, symlink, missing-anchor, and rewritten-anchor defects", () => {
  {
    const root = createTempRoot();
    const fixture = createProspectiveConsumptionFixture(root);
    fixture.available.entries.at(-1).envelopePath = "portfolio/core/handoff/versions/0.1.0/prospective/../action-008-envelope.json";
    fixture.consumed.entries.at(-1).envelopePath = fixture.available.entries.at(-1).envelopePath;
    resealProspectiveIndexes(fixture);
    installProspectiveFixture(root, fixture);
    assert.throws(() => validatePublicationFinalization(root), /Schema violation|canonical repository-relative path/u);
  }
  {
    const root = createTempRoot();
    createProspectiveConsumptionFixture(root);
    const envelopePath = path.join(root, PROSPECTIVE_ENVELOPE_PATH);
    const target = `${envelopePath}.actual`;
    fs.renameSync(envelopePath, target);
    fs.symlinkSync(path.basename(target), envelopePath);
    assert.throws(() => validatePublicationFinalization(root), /symbolic link/u);
  }
  {
    const root = createTempRoot();
    fs.unlinkSync(path.join(root, CONNECTOR_SCOPE_ANCHOR_PATH));
    fs.copyFileSync(path.join(root, handoffSnapshotPath(6)), path.join(root, HANDOFF_INDEX_PATH));
    assert.throws(() => validatePublicationFinalization(root), /anchor index 0007 is missing or rewritten/u);
  }
  {
    const root = createTempRoot();
    const rewritten = readJson(root, CONNECTOR_SCOPE_ANCHOR_PATH);
    rewritten.indexId = "handoff-index:rewritten-anchor-0007";
    const sealed = sealHandoffDocument(rewritten, "indexHash");
    writeJson(root, CONNECTOR_SCOPE_ANCHOR_PATH, sealed);
    writeJson(root, HANDOFF_INDEX_PATH, sealed);
    assert.throws(() => validatePublicationFinalization(root), /anchor index 0007 is missing or rewritten/u);
  }
});

test("publication finalization accepts post-anchor non-consumption transitions without widening authority", () => {
  const root = createTempRoot();
  const fixture = createProspectiveConsumptionFixture(root);
  fs.unlinkSync(path.join(root, handoffSnapshotPath(9)));
  writeJson(root, HANDOFF_INDEX_PATH, fixture.available);
  const before = structuredClone(fixture.available.entries);
  const chain = validateHandoffIndexChain(root, { enforceProspectiveEvidenceScope: true });
  assert.equal(chain.prospectiveEvidenceScope.evaluatedConsumptions, 0);
  assert.deepEqual(fixture.available.entries, before);
  assert.equal(fixture.available.entries.at(-1).ownerApproval.status, "approved");
  assert.equal(fixture.available.entries.at(-1).lifecycle.state, "available");
});

test("both production validators delegate connector-scope enforcement to the existing prospective helper", () => {
  const publicationSource = fs.readFileSync(path.join(ROOT, "portfolio/core/lib/publication-finalization.mjs"), "utf8");
  const activationSource = fs.readFileSync(path.join(ROOT, "portfolio/runtime/validate-core-activation.mjs"), "utf8");
  const verifyCoreSource = fs.readFileSync(path.join(ROOT, "portfolio/core/scripts/verify-core.mjs"), "utf8");
  for (const [label, source] of [["publication", publicationSource], ["activation", activationSource]]) {
    assert.match(source, /import[\s\S]*validateProspectiveConsumptionTransition[\s\S]*from ["'][^"']*handoff-ledger\.mjs["']/u, label);
    assert.match(source, /validateProspectiveConsumptionTransition\(previous, successor\.(?:value|index), \{ envelopes, receipts \}\)/u, label);
    assert.doesNotMatch(source, /HANDOFF_CONNECTOR_SCOPE_VIOLATION|function\s+assessReceiptEvidenceScope/u, label);
  }
  assert.match(verifyCoreSource, /validateCoreActivation\(\)/u);
  assert.doesNotMatch(verifyCoreSource, /validateProspectiveConsumptionTransition|assertReceiptEvidenceScope/u);
});

test("an approved current root cannot become the historical publication root or grant authority", () => {
  const { root, indexes } = createHandoffSuccessorRoot("approved");
  const index = readJson(root, PUBLICATION_INDEX_PATH);
  const readback = readJson(root, index.current.publicationReadback.path);
  const reviewPointer = readJson(root, index.current.reviewPointer.path);
  const currentAction = indexes.at(-1).entries.find((entry) => entry.actionId === "CLOVER-2026-08-20-002");
  const historicalAction = validateHandoffIndexChain(root).historicalIndex.entries
    .find((entry) => entry.actionId === "CLOVER-2026-08-20-002");
  assert.equal(currentAction.lifecycle.state, "available");
  assert.equal(currentAction.ownerApproval.status, "approved");
  assert.equal(historicalAction.lifecycle.state, "proposed");
  assert.equal(historicalAction.ownerApproval.status, "pending");
  assert.equal(readback.action002.status, "pending");
  assert.equal(reviewPointer.authority.mergeApproved, false);
  assert.equal(reviewPointer.authority.productionApproved, false);
  assert.equal(reviewPointer.authority.action002Approved, false);
});

test("Handoff history rejects missing or rewritten ancestors and broken predecessor hashes", () => {
  {
    const { root } = createHandoffSuccessorRoot("approved");
    fs.unlinkSync(path.join(root, handoffSnapshotPath(1)));
    assert.throws(() => validateHandoffIndexChain(root), /unavailable|ENOENT|missing/u);
  }
  {
    const { root, indexes } = createHandoffSuccessorRoot("approved");
    const rewritten = structuredClone(indexes[0]);
    rewritten.entries[0].recordedAt = "2026-08-20T21:19:44.000Z";
    writeJson(root, handoffSnapshotPath(1), sealHandoffDocument(rewritten, "indexHash"));
    assert.throws(() => validateHandoffIndexChain(root), /previousIndexHash mismatch/u);
  }
  {
    const { root } = createHandoffSuccessorRoot("approved");
    fs.appendFileSync(path.join(root, handoffSnapshotPath(1)), " \n");
    assert.throws(() => validateHandoffIndexChain(root), /genesis index 0001 bytes were rewritten/u);
  }
  {
    const { root, indexes } = createHandoffSuccessorRoot("approved");
    const broken = structuredClone(indexes[1]);
    broken.previousIndexHash = "f".repeat(64);
    installLatestHandoffIndex(root, sealHandoffDocument(broken, "indexHash"), 2);
    assert.throws(() => validateHandoffIndexChain(root), /previousIndexHash mismatch/u);
  }
});

test("Handoff history rejects duplicate hashes, predecessor-path reuse, and cycles", () => {
  {
    const root = createGenesisHandoffRoot();
    fs.copyFileSync(path.join(root, handoffSnapshotPath(1)), path.join(root, handoffSnapshotPath(2)));
    assert.throws(() => validateHandoffIndexChain(root), /exactly one numbered immutable snapshot/u);
  }
  {
    const { root, indexes } = createHandoffSuccessorRoot("approved");
    const cyclic = structuredClone(indexes[1]);
    cyclic.previousIndexPath = handoffSnapshotPath(2);
    cyclic.previousIndexHash = cyclic.indexHash;
    installLatestHandoffIndex(root, sealHandoffDocument(cyclic, "indexHash"), 2);
    assert.throws(() => validateHandoffIndexChain(root), /cycle or reused path/u);
  }
  {
    const { root, indexes } = createHandoffSuccessorRoot("consumed");
    const reused = structuredClone(indexes[2]);
    reused.previousIndexPath = handoffSnapshotPath(1);
    reused.previousIndexHash = indexes[0].indexHash;
    installLatestHandoffIndex(root, sealHandoffDocument(reused, "indexHash"), 3);
    assert.throws(() => validateHandoffIndexChain(root), /numbering is not contiguous/u);
  }
});

test("Handoff history rejects deleted, reordered, or substituted prior entries and chronology", () => {
  const mutations = [
    [(next) => { next.entries.pop(); }, /append-only|transition/u],
    [(next) => { next.entries.reverse(); }, /reordered|substituted/u],
    [(next) => { next.entries[0].envelopeHash = "e".repeat(64); }, /reordered|substituted/u],
    [(next) => { next.createdAt = "2026-08-20T21:19:44.000Z"; }, /append-only|transition/u],
  ];
  for (const [mutate, expected] of mutations) {
    const root = createGenesisHandoffRoot();
    const genesis = readJson(root, handoffSnapshotPath(1));
    const next = makeApprovedHandoffSuccessor(genesis);
    mutate(next);
    installLatestHandoffIndex(root, sealHandoffDocument(next, "indexHash"), 2);
    assert.throws(() => validateHandoffIndexChain(root), expected);
  }
});

test("Handoff history rejects path escape and symlinked immutable ancestors", () => {
  {
    const { root, indexes } = createHandoffSuccessorRoot("approved");
    const escaped = structuredClone(indexes[1]);
    escaped.previousIndexPath = "portfolio/core/handoff/versions/0.1.0/indexes/../action-receipt-index-0001.json";
    installLatestHandoffIndex(root, sealHandoffDocument(escaped, "indexHash"), 2);
    assert.throws(() => validateHandoffIndexChain(root), /Schema violation|outside|invalid/u);
  }
  {
    const { root } = createHandoffSuccessorRoot("approved");
    const ancestor = path.join(root, handoffSnapshotPath(1));
    const target = `${ancestor}.actual`;
    fs.renameSync(ancestor, target);
    fs.symlinkSync(path.basename(target), ancestor);
    assert.throws(() => validateHandoffIndexChain(root), /symbolic link/u);
  }
});

test("Handoff history rejects stable-root substitution, orphaned snapshots, and lifecycle widening", () => {
  {
    const { root, indexes } = createHandoffSuccessorRoot("approved");
    const substitutedRoot = structuredClone(indexes[1]);
    substitutedRoot.indexId = "handoff-index:synthetic-substituted-root";
    writeJson(root, HANDOFF_INDEX_PATH, sealHandoffDocument(substitutedRoot, "indexHash"));
    assert.throws(() => validateHandoffIndexChain(root), /does not resolve byte-for-byte/u);
  }
  {
    const assertSuccessorAwareOrphan = (root) => {
      const stableRootPath = path.join(root, HANDOFF_INDEX_PATH);
      const stableRootBytes = fs.readFileSync(stableRootPath);
      const current = JSON.parse(stableRootBytes);
      const immutablePaths = fs.readdirSync(path.join(root, HANDOFF_INDEX_DIRECTORY))
        .filter((name) => /^action-receipt-index-\d{4}\.json$/u.test(name))
        .map((name) => `${HANDOFF_INDEX_DIRECTORY}/${name}`);
      const currentMatches = immutablePaths.filter((relativePath) =>
        fs.readFileSync(path.join(root, relativePath)).equals(stableRootBytes));
      assert.equal(currentMatches.length, 1);
      const currentSnapshotPath = currentMatches[0];
      const currentSequence = Number.parseInt(currentSnapshotPath.match(/(\d{4})\.json$/u)[1], 10);
      const nextSequence = currentSequence + 1;
      const nextSnapshotPath = handoffSnapshotPath(nextSequence);
      const next = structuredClone(current);
      const nextCreatedAt = new Date(Date.parse(current.createdAt) + 60_000).toISOString();
      next.indexId = `handoff-index:synthetic-orphan-${nextSequence}:20260824`;
      next.createdAt = nextCreatedAt;
      next.previousIndexPath = currentSnapshotPath;
      next.previousIndexHash = current.indexHash;
      const action = next.entries.find((entry) => entry.actionId === "CLOVER-2026-08-20-002");
      action.recordedAt = nextCreatedAt;
      action.lifecycle.state = "available";
      action.ownerApproval = {
        status: "approved",
        approverId: "owner:chris-dortch",
        approvedAt: nextCreatedAt,
        approvedEnvelopeHash: ACTION_002_HASH,
        approvalEvidenceHash: "a".repeat(64),
        attestationId: "handoff-approval:002:synthetic-orphan",
        attestationPath: "portfolio/core/handoff/versions/0.1.0/approvals/action-002.synthetic-orphan.json",
        attestationHash: "b".repeat(64),
      };
      const sealed = sealHandoffDocument(next, "indexHash");
      assert.deepEqual(validateIndexTransition(current, sealed), {
        valid: true,
        transitionedEntries: 1,
        appendedEntries: 0,
      });
      writeJson(root, nextSnapshotPath, sealed);
      assert.equal(fs.readFileSync(stableRootPath).equals(stableRootBytes), true);
      assert.throws(() => validateHandoffIndexChain(root), /orphaned|ambiguous/u);
      return { currentSequence, nextSequence };
    };

    const genesisRoot = createGenesisHandoffRoot();
    assert.deepEqual(assertSuccessorAwareOrphan(genesisRoot), { currentSequence: 1, nextSequence: 2 });

    const successorRoot = createTempRoot();
    const currentChain = validateHandoffIndexChain(successorRoot);
    const currentSequence = handoffSnapshotSequence(currentChain.currentSnapshotPath);
    assert.equal(currentChain.depth, currentSequence);
    assert.deepEqual(assertSuccessorAwareOrphan(successorRoot), {
      currentSequence,
      nextSequence: currentSequence + 1,
    });
  }
  {
    const root = createGenesisHandoffRoot();
    const genesis = readJson(root, handoffSnapshotPath(1));
    const widened = makeApprovedHandoffSuccessor(genesis);
    const action = widened.entries.find((entry) => entry.actionId === "CLOVER-2026-08-20-002");
    action.status = "completed";
    action.lifecycle = {
      state: "consumed",
      singleUse: true,
      consumedAt: "2026-08-20T21:19:55.000Z",
      consumedByReceiptId: "handoff-receipt:002:synthetic-direct",
      revokedAt: null,
      revocationEvidenceHash: null,
    };
    action.receiptId = "handoff-receipt:002:synthetic-direct";
    action.receiptPath = "portfolio/core/handoff/versions/0.1.0/demonstration/action-002.synthetic-direct.json";
    action.receiptHash = "f".repeat(64);
    action.outcome = "succeeded";
    installLatestHandoffIndex(root, sealHandoffDocument(widened, "indexHash"), 2);
    assert.throws(() => validateHandoffIndexChain(root), /allowed lifecycle transition|invalid/u);
  }
});

test("closed schemas reject added fields and a container-commit self-reference", () => {
  for (const mutate of [
    (value) => { value.privateRecords = []; },
    (value) => { value.containerBinding.commit = "f".repeat(40); },
    (value) => { value.precedence.doesNotSupersede.pop(); },
  ]) {
    const root = createTempRoot();
    writeReboundReadback(root, mutate);
    assert.throws(() => validatePublicationFinalization(root), /JSON Schema violation/);
  }
});

test("resealed source, CI artifact, Vercel, and Action 002 substitutions fail closed", () => {
  for (const [mutate, expected] of [
    [(value) => { value.reviewedImplementation.headCommit = "f".repeat(40); }, /reviewed implementation substitution/],
    [(value) => { value.github.workflows[1].artifacts[0].sha256 = "f".repeat(64); }, /GitHub run, job, or artifact substitution/],
    [(value) => { value.vercel.sourceCommit = "f".repeat(40); }, /Vercel sourceCommit substitution/],
    [(value) => { value.action002.envelopeHash = "f".repeat(64); }, /Action 002 identity substitution/],
  ]) {
    const root = createTempRoot();
    writeReboundReadback(root, mutate);
    assert.throws(() => validatePublicationFinalization(root), expected);
  }
});

test("resealed stale chronology and sensitive values fail closed", () => {
  for (const [mutate, expected] of [
    [(value) => { value.observedAt = "2026-08-20T22:00:00Z"; }, /chronology is stale/],
    [(value) => { value.precedence.supersedes[0].reason = "Bearer abcdefghijklmnopqrstuvwxyz"; }, /sensitive value/],
  ]) {
    const root = createTempRoot();
    writeReboundReadback(root, mutate);
    assert.throws(() => validatePublicationFinalization(root), expected);
  }
});

test("mirror privacy scanning rejects secrets, local paths, and raw sensitive keys", () => {
  assert.throws(() => assertSanitizedPublicationMirror(Buffer.from("/Users/example/private/file.json")), /absolute local path/);
  assert.throws(() => assertSanitizedPublicationMirror(Buffer.from("sk_abcdefghijklmnop")), /provider token/);
  assert.throws(() => assertSanitizedPublicationMirror(Buffer.from('{"customerRecords":[]}')), /raw sensitive record field/);
});

test("a mirrored artifact byte change is rejected even when JSON remains parseable", () => {
  const root = createTempRoot();
  const index = readJson(root, PUBLICATION_INDEX_PATH);
  fs.appendFileSync(path.join(root, index.current.sourceBoundReceipt.path), " \n");
  assert.throws(() => validatePublicationFinalization(root), /byte hash mismatch/);
});

test("publication validation rejects symlinked immutable artifacts", () => {
  const root = createTempRoot();
  const index = readJson(root, PUBLICATION_INDEX_PATH);
  const artifactPath = path.join(root, index.current.finalReport.path);
  const targetPath = `${artifactPath}.actual`;
  fs.renameSync(artifactPath, targetPath);
  fs.symlinkSync(path.basename(targetPath), artifactPath);
  assert.throws(() => validatePublicationFinalization(root), /symbolic link/);
});

test("the AMEND review remains noncryptographic evidence and cannot become approval", () => {
  const root = createTempRoot();
  const catalog = loadPublicationCatalog(root);
  catalog.reviewPointer.decision.bindingApproval = true;
  seal(catalog.reviewPointer, "reviewPointerHash");
  writeJson(root, catalog.index.current.reviewPointer.path, catalog.reviewPointer);
  assert.throws(() => validatePublicationFinalization(root), /JSON Schema violation|canonical hash mismatch/);
});

test("a valid successor preserves the prior index and binds its exact snapshot", () => {
  const previous = readJson(ROOT, PUBLICATION_INDEX_PATH);
  const next = makeSuccessor(previous);
  assert.deepEqual(validatePublicationIndexTransition(previous, next), {
    status: "passed",
    sequence: 2,
    previousIndexHash: previous.publicationIndexHash,
  });

  const root = createTempRoot();
  fs.copyFileSync(
    path.join(root, previous.current.publicationReadback.path),
    path.join(root, next.current.publicationReadback.path),
  );
  writeJson(root, next.lifecycle.immutableSnapshotPath, next);
  writeJson(root, PUBLICATION_INDEX_PATH, next);
  assert.deepEqual(validatePublicationIndexChain(root), { status: "passed", depth: 2 });
});

test("the normal validator follows successors and rejects missing, stale, cyclic, or rewritten ancestors", () => {
  function installSuccessor() {
    const root = createTempRoot();
    const previous = readJson(root, PUBLICATION_INDEX_PATH);
    const next = makeSuccessor(previous);
    const priorReadbackBytes = fs.readFileSync(path.join(root, previous.current.publicationReadback.path));
    fs.writeFileSync(path.join(root, next.current.publicationReadback.path), priorReadbackBytes);
    const exactHash = previous.current.publicationReadback.hash;
    next.current.publicationReadback.hash = exactHash;
    next.connectorIds["clover://publication/readback"].hash = exactHash;
    next.entries[5].hash = exactHash;
    seal(next, "publicationIndexHash");
    writeJson(root, next.lifecycle.immutableSnapshotPath, next);
    writeJson(root, PUBLICATION_INDEX_PATH, next);
    return { root, previous, next };
  }

  {
    const { root } = installSuccessor();
    assert.equal(validatePublicationFinalization(root).chainDepth, 2);
  }
  {
    const { root, previous } = installSuccessor();
    fs.unlinkSync(path.join(root, previous.lifecycle.immutableSnapshotPath));
    assert.throws(() => validatePublicationFinalization(root), /ENOENT/);
  }
  {
    const { root, previous } = installSuccessor();
    const ancestor = readJson(root, previous.lifecycle.immutableSnapshotPath);
    ancestor.publicationIndexHash = "d".repeat(64);
    writeJson(root, previous.lifecycle.immutableSnapshotPath, ancestor);
    assert.throws(() => validatePublicationFinalization(root), /previous snapshot hash mismatch/);
  }
  {
    const { root, next } = installSuccessor();
    next.lifecycle.previousIndexPath = next.lifecycle.immutableSnapshotPath;
    next.lifecycle.previousIndexHash = next.publicationIndexHash;
    seal(next, "publicationIndexHash");
    writeJson(root, next.lifecycle.immutableSnapshotPath, next);
    writeJson(root, PUBLICATION_INDEX_PATH, next);
    assert.throws(() => validatePublicationFinalization(root), /previous snapshot hash mismatch|cycle/);
  }
  {
    const { root, previous, next } = installSuccessor();
    const ancestor = readJson(root, previous.lifecycle.immutableSnapshotPath);
    ancestor.entries[0].recordId = "rewritten-prior-record";
    seal(ancestor, "publicationIndexHash");
    writeJson(root, previous.lifecycle.immutableSnapshotPath, ancestor);
    next.lifecycle.previousIndexHash = ancestor.publicationIndexHash;
    seal(next, "publicationIndexHash");
    writeJson(root, next.lifecycle.immutableSnapshotPath, next);
    writeJson(root, PUBLICATION_INDEX_PATH, next);
    assert.throws(() => validatePublicationFinalization(root), /rewrote prior entry/);
  }
});

test("successor deletion, rewrite, reorder, reuse, and ancestor substitution are rejected", () => {
  const previous = readJson(ROOT, PUBLICATION_INDEX_PATH);
  const cases = [
    (next) => { next.entries.pop(); },
    (next) => { next.entries.splice(1, 1); },
    (next) => { next.entries[0].path = `${next.entries[0].path}.substituted`; },
    (next) => { [next.entries[0], next.entries[1]] = [next.entries[1], next.entries[0]]; },
    (next) => { next.entries[5].recordId = next.entries[0].recordId; },
    (next) => { next.lifecycle.previousIndexHash = "e".repeat(64); },
    (next) => { next.entries.find((entry) => entry.artifactType === "publication-readback").status = "current"; },
    (next) => { next.updatedAt = "2026-08-20T00:00:00Z"; },
    (next) => { next.reviewedImplementationHead = "f".repeat(40); },
  ];
  for (const mutate of cases) {
    const next = makeSuccessor(previous);
    mutate(next);
    seal(next, "publicationIndexHash");
    assert.throws(() => validatePublicationIndexTransition(previous, next), /Publication finalization rejected/);
  }

  const root = createTempRoot();
  const next = makeSuccessor(previous);
  fs.copyFileSync(
    path.join(root, previous.current.publicationReadback.path),
    path.join(root, next.current.publicationReadback.path),
  );
  writeJson(root, next.lifecycle.immutableSnapshotPath, next);
  writeJson(root, PUBLICATION_INDEX_PATH, next);
  const ancestor = readJson(root, previous.lifecycle.immutableSnapshotPath);
  ancestor.publicationIndexHash = "d".repeat(64);
  writeJson(root, previous.lifecycle.immutableSnapshotPath, ancestor);
  assert.throws(() => validatePublicationIndexChain(root), /previous snapshot hash mismatch/);
});

test("normal validation rejects tampering with a superseded artifact retained by the index chain", () => {
  const root = createTempRoot();
  const previous = readJson(root, PUBLICATION_INDEX_PATH);
  const next = makeSuccessor(previous);
  fs.copyFileSync(
    path.join(root, previous.current.publicationReadback.path),
    path.join(root, next.current.publicationReadback.path),
  );
  writeJson(root, next.lifecycle.immutableSnapshotPath, next);
  writeJson(root, PUBLICATION_INDEX_PATH, next);
  const superseded = readJson(root, previous.current.publicationReadback.path);
  superseded.verdict = "HOLD";
  writeJson(root, previous.current.publicationReadback.path, superseded);
  assert.throws(() => validatePublicationFinalization(root), /canonical hash mismatch/);
});

test("the exact reviewed receipt remains scoped to head 2309bbc and pending Action 002", () => {
  const { readback, mirroredReceipt } = loadPublicationCatalog(ROOT);
  assert.equal(mirroredReceipt.source.commit, "2309bbc61dc8fcc7f2167c6c47db4a8b11cd8334");
  assert.equal(mirroredReceipt.changedPathAllowlist.length, 62);
  assert.equal(readback.mirroredIssuanceArtifacts.changedPathAllowlistScope.reviewedHeadCommit, mirroredReceipt.source.commit);
  assert.equal(readback.action002.envelopeHash, ACTION_002_HASH);
  assert.equal(readback.action002.status, "pending");
  assert.equal(readback.action002.consumed, false);
  assert.equal(readback.action002.revoked, false);
  assert.equal(publicationRecordHash(readback), readback.publicationReadbackHash);
  const { reviewPointer } = loadPublicationCatalog(ROOT);
  assert.equal(reviewPointer.decision.decisionEvidenceStatus, "owner-reported-in-chat-not-preserved");
  assert.equal(reviewPointer.decision.evidencePath, null);
  assert.equal(reviewPointer.decision.evidenceHash, null);
  assert.equal(reviewPointer.decision.findingsNormalization, "normalized-summary");
});
