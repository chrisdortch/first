import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sha256Bytes, sha256Canonical } from "../lib/canonical-json.mjs";
import { sealHandoffDocument } from "../lib/handoff-ledger.mjs";
import {
  ACTION_002_HASH,
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
  indexes.forEach((index, offset) => writeJson(root, handoffSnapshotPath(offset + 1), index));
  writeJson(root, HANDOFF_INDEX_PATH, indexes.at(-1));
}

function installLatestHandoffIndex(root, index, sequence) {
  writeJson(root, handoffSnapshotPath(sequence), index);
  writeJson(root, HANDOFF_INDEX_PATH, index);
}

function createHandoffSuccessorRoot(state = "approved") {
  const root = createTempRoot();
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
  assert.equal(result.status, "passed");
  assert.equal(result.verdict, "AMEND");
  assert.equal(result.historicalExternalReceiptHash, HISTORICAL_RECEIPT_HASH);
  assert.equal(result.action002Status, "pending");
  assert.equal(result.containerBindingStatus, "pending-external-publication-receipt");
  assert.equal(result.chainDepth, 1);
  assert.equal(result.handoffChainDepth, 1);
  assert.equal(result.currentHandoffIndexHash, HISTORICAL_HANDOFF_INDEX_HASH);
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

test("the baseline Handoff root resolves exactly to immutable genesis index 0001", () => {
  const chain = validateHandoffIndexChain(ROOT);
  assert.equal(chain.status, "passed");
  assert.equal(chain.depth, 1);
  assert.equal(chain.currentSnapshotPath, handoffSnapshotPath(1));
  assert.equal(chain.historicalSnapshotPath, handoffSnapshotPath(1));
  assert.equal(chain.currentIndexHash, HISTORICAL_HANDOFF_INDEX_HASH);
  assert.equal(chain.historicalIndexHash, HISTORICAL_HANDOFF_INDEX_HASH);
  assert.equal(sha256Bytes(fs.readFileSync(path.join(ROOT, handoffSnapshotPath(1)))), HISTORICAL_HANDOFF_INDEX_BYTE_HASH);
});

test("historical publication evidence survives valid approved, consumed, and reviewed Handoff roots", () => {
  for (const [state, depth] of [["approved", 2], ["consumed", 3], ["reviewed", 4]]) {
    const { root, indexes } = createHandoffSuccessorRoot(state);
    const chain = validateHandoffIndexChain(root);
    assert.equal(chain.depth, depth);
    assert.equal(chain.currentIndexHash, indexes.at(-1).indexHash);
    assert.equal(chain.currentSnapshotPath, handoffSnapshotPath(depth));
    assert.equal(chain.historicalIndexHash, HISTORICAL_HANDOFF_INDEX_HASH);
    assert.equal(chain.historicalSnapshotPath, handoffSnapshotPath(1));
    assert.notEqual(chain.currentIndexHash, chain.historicalIndexHash);

    const publication = validatePublicationFinalization(root);
    assert.equal(publication.status, "passed");
    assert.equal(publication.verdict, "AMEND");
    assert.equal(publication.action002Status, "pending");
    assert.equal(publication.handoffChainDepth, depth);
    assert.equal(publication.currentHandoffIndexHash, indexes.at(-1).indexHash);
    assert.equal(publication.historicalHandoffIndexHash, HISTORICAL_HANDOFF_INDEX_HASH);
  }
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
    const root = createTempRoot();
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
    const root = createTempRoot();
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
    const root = createTempRoot();
    const genesis = readJson(root, handoffSnapshotPath(1));
    const approved = makeApprovedHandoffSuccessor(genesis);
    writeJson(root, handoffSnapshotPath(2), approved);
    assert.throws(() => validateHandoffIndexChain(root), /orphaned|ambiguous/u);
  }
  {
    const root = createTempRoot();
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
