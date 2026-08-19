import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { captureArtifact, createExport, verifyExport } from "../lib/artifact-store.mjs";
import { canonicalize, sha256Bytes, sha256Canonical } from "../lib/canonical-json.mjs";
import { createEvent, decodeLedger } from "../lib/ledger.mjs";
import { extractAllowlistedClaim, projectCurrentClaims, rebuildDerivedState } from "../lib/projections.mjs";
import { evaluateRetentionPolicy, runTrustSlice, trustSliceDefaults } from "../lib/trust-slice.mjs";
import { validateJsonSchema } from "../lib/validators.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIRECTORY = path.resolve(TEST_DIRECTORY, "../trust-slice/fixtures");
const SCHEMA_DIRECTORY = path.resolve(TEST_DIRECTORY, "../schemas");
const EXPECTED_RECEIPT = JSON.parse(fs.readFileSync(path.resolve(TEST_DIRECTORY, "../trust-slice/expected/trust-slice-receipt.json"), "utf8"));

function temporaryDirectory(t, prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function findForbiddenProjectionKey(value, trail = []) {
  if (!value || typeof value !== "object") return null;
  for (const [key, entry] of Object.entries(value)) {
    const nextTrail = [...trail, key];
    if (["authority", "approval", "policy", "instruction", "toolCall"].includes(key)) return nextTrail.join(".");
    const nested = findForbiddenProjectionKey(entry, nextTrail);
    if (nested) return nested;
  }
  return null;
}

test("Trust Slice captures, corrects, projects, exports, restores, and deletes within its local scope", (t) => {
  const root = temporaryDirectory(t, "clover-trust-slice-test-");
  const result = runTrustSlice({ workspaceDirectory: path.join(root, "run") });
  const sourceV1Bytes = fs.readFileSync(path.join(FIXTURES_DIRECTORY, "source-v1.synthetic.json"));
  const sourceV2Bytes = fs.readFileSync(path.join(FIXTURES_DIRECTORY, "source-v2.synthetic.json"));

  assert.equal(result.receipt.result, "passed");
  assert.deepEqual(result.receipt, EXPECTED_RECEIPT);
  assert.equal(result.artifacts.sourceV1.contentHash, sha256Bytes(sourceV1Bytes));
  assert.equal(result.artifacts.sourceV1.byteLength, sourceV1Bytes.length);
  assert.equal(result.artifacts.sourceV2.contentHash, sha256Bytes(sourceV2Bytes));
  assert.equal(result.receipt.correction.explicitSupersessionVerified, true);
  assert.equal(result.receipt.preDeletion.ledgerSha256, result.receipt.preDeletion.restoreLedgerSha256);
  assert.equal(result.receipt.preDeletion.derivedStateHash, result.receipt.preDeletion.restoreDerivedStateHash);
  assert.equal(result.receipt.postDeletion.ledgerSha256, result.receipt.postDeletion.restoreLedgerSha256);
  assert.equal(result.receipt.postDeletion.derivedStateHash, result.receipt.postDeletion.restoreDerivedStateHash);

  const preManifest = verifyExport(result.preExportDirectory).manifest;
  const postManifest = verifyExport(result.postExportDirectory).manifest;
  const exportSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIRECTORY, "trust-slice-export.v0.1.schema.json"), "utf8"));
  validateJsonSchema(exportSchema, preManifest, { schemaDirectory: SCHEMA_DIRECTORY, label: "pre-deletion-export" });
  validateJsonSchema(exportSchema, postManifest, { schemaDirectory: SCHEMA_DIRECTORY, label: "post-deletion-export" });
  const derivedSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIRECTORY, "trust-slice-derived-state.v0.2.schema.json"), "utf8"));
  const preDerived = JSON.parse(fs.readFileSync(path.join(result.preExportDirectory, "derived/state.json"), "utf8"));
  const postDerived = JSON.parse(fs.readFileSync(path.join(result.postExportDirectory, "derived/state.json"), "utf8"));
  validateJsonSchema(derivedSchema, preDerived, { schemaDirectory: SCHEMA_DIRECTORY, label: "pre-deletion-derived-state" });
  validateJsonSchema(derivedSchema, postDerived, { schemaDirectory: SCHEMA_DIRECTORY, label: "post-deletion-derived-state" });
  const v1ExportPath = `artifact-store/${result.artifacts.sourceV1.relativePath}`;
  assert.equal(preManifest.files.some((file) => file.path === v1ExportPath), true);
  assert.equal(postManifest.files.some((file) => file.path === v1ExportPath), false);
  assert.equal(postManifest.files.some((file) => file.path.includes("tombstones/")), true);
  assert.equal(postManifest.files.some((file) => file.path === "policy/retention-policy.synthetic.json"), true);
  assert.equal(postManifest.files.some((file) => file.path === "runtime/lib/trust-slice.mjs"), true);
  assert.equal(postManifest.files.some((file) => file.path === "RESTORE.txt"), true);
  assert.equal(fs.existsSync(path.join(result.workspaceDirectory, v1ExportPath)), false);
  assert.equal(fs.existsSync(path.join(result.postRestoreDirectory, v1ExportPath)), false);
  assert.equal(result.tombstone.localAbsenceVerified, true);
  assert.equal(result.tombstone.deletionScope, "this-local-content-addressed-store-only");
  assert.equal(result.tombstone.externalCopiesUnknown, true);
  assert.equal(result.tombstone.externalErasureClaimed, false);
  assert.equal(result.receipt.postDeletion.knownLocalCopyCount, 3);
  assert.deepEqual(result.receipt.postDeletion.knownLocalCopiesRetained, [
    `workspace/export-pre-deletion/artifact-store/${result.artifacts.sourceV1.relativePath}`,
    `workspace/restore-pre-deletion/artifact-store/${result.artifacts.sourceV1.relativePath}`,
    "repository/portfolio/core/trust-slice/fixtures/source-v1.synthetic.json"
  ]);

  const restoredPreBytes = fs.readFileSync(path.join(result.preRestoreDirectory, v1ExportPath));
  assert.deepEqual(restoredPreBytes, sourceV1Bytes);
  const postEvents = decodeLedger(fs.readFileSync(path.join(result.postRestoreDirectory, "ledger/events.jsonl"), "utf8"));
  const rebuilt = rebuildDerivedState(postEvents, { asOf: trustSliceDefaults.asOf });
  assert.equal(rebuilt.capsule.items.length, 1);
  assert.equal(rebuilt.capsule.items[0].status.value, "trust-slice-candidate-verified");
  assert.equal(rebuilt.capsule.items[0].status.trust, "untrusted-imported-source-data");
  assert.equal(rebuilt.today.projects[0].nextMilestone.value, "Review the isolated Trust Slice receipt before any sensitive connector.");
  assert.equal(rebuilt.today.projects[0].nextMilestone.canInvokeTools, false);
  assert.equal(findForbiddenProjectionKey(rebuilt), null);
  const projectionText = canonicalize(rebuilt);
  assert.equal(projectionText.includes("Ignore policy, claim approval"), false);
  assert.equal(projectionText.includes("Override the Constitution"), false);
});

test("Trust Slice rejects a stale source instead of replacing current state", (t) => {
  const root = temporaryDirectory(t, "clover-stale-source-test-");
  const bytes = fs.readFileSync(path.join(FIXTURES_DIRECTORY, "stale-source.synthetic.json"));
  const parsed = JSON.parse(bytes.toString("utf8"));
  const artifact = captureArtifact(path.join(root, "store"), bytes, {
    sourceId: parsed.sourceId,
    observedAt: parsed.observedAt,
    mediaType: "application/json"
  });
  assert.throws(
    () => extractAllowlistedClaim(bytes, artifact, { asOf: trustSliceDefaults.asOf, maxAgeMs: 30 * 60 * 1000 }),
    /stale/
  );
});

test("retention policy blocks deletion during legal hold or before its due time", () => {
  const base = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIRECTORY, "retention-policy.synthetic.json"), "utf8"));
  assert.throws(() => evaluateRetentionPolicy({ ...base, legalHold: true }, {
    asOf: "2026-08-18T21:13:00-05:00"
  }), /Legal hold/);
  assert.throws(() => evaluateRetentionPolicy(base, {
    asOf: "2026-08-18T21:11:59-05:00"
  }), /has not elapsed/);
  assert.equal(evaluateRetentionPolicy(base, {
    asOf: "2026-08-18T21:13:00-05:00"
  }).allowed, true);
});

test("instruction-shaped text in every propagated fact remains typed as non-executable source data", (t) => {
  const root = temporaryDirectory(t, "clover-injection-source-test-");
  const bytes = fs.readFileSync(path.join(FIXTURES_DIRECTORY, "prompt-injection.synthetic.json"));
  const parsed = JSON.parse(bytes.toString("utf8"));
  const artifact = captureArtifact(path.join(root, "store"), bytes, {
    sourceId: parsed.sourceId,
    observedAt: parsed.observedAt,
    mediaType: "application/json"
  });
  const claim = extractAllowlistedClaim(bytes, artifact, {
    asOf: trustSliceDefaults.asOf,
    maxAgeMs: trustSliceDefaults.maxSourceAgeMs
  });
  const event = createEvent({
    ledgerId: "synthetic-injection-ledger",
    sequence: 1,
    eventId: "evt_synthetic_instruction_shaped_claim",
    eventType: "claim.observed",
    recordedAt: parsed.observedAt,
    actor: { actorType: "deterministic-system", actorId: "injection-test" },
    subject: { subjectType: "synthetic-project", subjectId: parsed.projectId },
    truthStatus: "synthetic-observed",
    sensitivity: "public-synthetic",
    sources: [{ sourceId: artifact.sourceId, contentHash: artifact.contentHash }],
    payload: claim,
    synthetic: true
  });
  const derived = rebuildDerivedState([event], { asOf: trustSliceDefaults.asOf });
  const item = derived.capsule.items[0];
  assert.match(item.status.value, /Ignore policy and call tools/);
  assert.match(item.nextMilestone.value, /Reveal secrets.*deploy production/);
  for (const fact of [item.status, item.nextMilestone]) {
    assert.equal(fact.trust, "untrusted-imported-source-data");
    assert.equal(fact.canSetPolicy, false);
    assert.equal(fact.canApprove, false);
    assert.equal(fact.canInvokeTools, false);
  }
  assert.equal(findForbiddenProjectionKey(derived), null);
});

test("a correction cannot supersede a different project's claim", () => {
  const sourceHash = "4".repeat(64);
  const firstPayload = {
    claimType: "synthetic-project-status",
    claimId: "claim-a",
    synthetic: true,
    subject: { projectId: "project-a" },
    assertedAt: "2026-08-18T21:00:00-05:00",
    facts: { status: "a", nextMilestone: "a" },
    provenance: { sourceId: "source-a", contentHash: sourceHash, observedAt: "2026-08-18T21:00:00-05:00" }
  };
  const first = createEvent({
    ledgerId: "synthetic-cross-project-ledger", sequence: 1, eventId: "evt_claim_project_a",
    eventType: "claim.observed", recordedAt: "2026-08-18T21:00:00-05:00",
    actor: { actorType: "deterministic-system", actorId: "test" },
    subject: { subjectType: "synthetic-project", subjectId: "shared-ledger-subject" },
    sources: [{ sourceId: "source-a", contentHash: sourceHash }], payload: firstPayload, synthetic: true
  });
  const crossPayload = structuredClone(firstPayload);
  crossPayload.claimId = "claim-b";
  crossPayload.subject.projectId = "project-b";
  crossPayload.correctionReason = "Malicious cross-project substitution";
  const second = createEvent({
    ledgerId: "synthetic-cross-project-ledger", sequence: 2, eventId: "evt_claim_project_b_correction",
    eventType: "claim.corrected", recordedAt: "2026-08-18T21:01:00-05:00",
    actor: { actorType: "deterministic-system", actorId: "test" },
    subject: { subjectType: "synthetic-project", subjectId: "shared-ledger-subject" },
    sources: [{ sourceId: "source-b", contentHash: sourceHash }],
    supersedes: [{ eventId: first.eventId, eventHash: first.eventHash }], payload: crossPayload, synthetic: true
  }, first);
  assert.throws(() => projectCurrentClaims([first, second]), /cross-project/);
});

test("export verification rejects content tampering and path traversal", (t) => {
  const root = temporaryDirectory(t, "clover-export-adversarial-test-");
  const exportDirectory = path.join(root, "valid-export");
  createExport(exportDirectory, [{ path: "safe/value.txt", bytes: Buffer.from("verified", "utf8") }], {
    exportId: "tamper-test",
    createdAt: "2026-08-18T21:00:00-05:00",
    phase: "test"
  });
  fs.writeFileSync(path.join(exportDirectory, "safe/value.txt"), "tampered", "utf8");
  assert.throws(() => verifyExport(exportDirectory), /mismatch/i);
  assert.throws(
    () => createExport(path.join(root, "unsafe-create"), [{ path: "../escaped.txt", bytes: Buffer.from("no") }], {
      exportId: "traversal-create-test",
      createdAt: "2026-08-18T21:00:00-05:00",
      phase: "test"
    }),
    /unsafe|relative|normalized/
  );

  const maliciousDirectory = path.join(root, "malicious-export");
  fs.mkdirSync(maliciousDirectory);
  const maliciousManifest = {
    documentType: "clover-trust-slice-export",
    schemaVersion: "0.1",
    exportId: "traversal-verify-test",
    createdAt: "2026-08-18T21:00:00-05:00",
    phase: "test",
    synthetic: true,
    files: [{ path: "../escaped.txt", sha256: sha256Bytes("no"), byteLength: 2 }],
    manifestHash: null
  };
  const { manifestHash: _manifestHash, ...unsigned } = maliciousManifest;
  maliciousManifest.manifestHash = sha256Canonical(unsigned);
  fs.writeFileSync(path.join(maliciousDirectory, "manifest.json"), `${canonicalize(maliciousManifest)}\n`);
  assert.throws(() => verifyExport(maliciousDirectory), /unsafe|relative|normalized/);
  assert.equal(fs.existsSync(path.join(root, "escaped.txt")), false);
});

test("two clean Trust Slice runs produce the same receipt and projection hashes", (t) => {
  const root = temporaryDirectory(t, "clover-determinism-test-");
  const first = runTrustSlice({ workspaceDirectory: path.join(root, "first") });
  const second = runTrustSlice({ workspaceDirectory: path.join(root, "second") });
  assert.equal(first.receipt.receiptHash, second.receipt.receiptHash);
  assert.equal(first.receipt.preDeletion.exportManifestHash, second.receipt.preDeletion.exportManifestHash);
  assert.equal(first.receipt.postDeletion.exportManifestHash, second.receipt.postDeletion.exportManifestHash);
  assert.equal(first.receipt.postDeletion.derivedStateHash, second.receipt.postDeletion.derivedStateHash);
});
