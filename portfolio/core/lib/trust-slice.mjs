import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalize, sha256Bytes, sha256Canonical } from "./canonical-json.mjs";
import { captureArtifact, createExport, deleteArtifact, readArtifact, restoreExport, verifyExport } from "./artifact-store.mjs";
import { createEvent, decodeLedger, encodeLedger, verifyLedger } from "./ledger.mjs";
import { extractAllowlistedClaim, rebuildDerivedState } from "./projections.mjs";

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const CORE_DIRECTORY = path.resolve(MODULE_DIRECTORY, "..");
const DEFAULT_FIXTURES_DIRECTORY = path.resolve(MODULE_DIRECTORY, "../trust-slice/fixtures");
const DEFAULT_AS_OF = "2026-08-18T21:15:00-05:00";
const MAX_SOURCE_AGE_MS = 30 * 60 * 1000;
const LEDGER_ID = "synthetic-clover-trust-slice-v0.2";
const RETENTION_KEYS = [
  "synthetic", "policyId", "deleteSupersededRawSource", "deleteAfter", "legalHold",
  "preserveTombstone", "preserveEventAndHash", "externalErasureClaimed"
];
const SUPPORT_PATHS = [
  "lib/artifact-store.mjs",
  "lib/canonical-json.mjs",
  "lib/ledger.mjs",
  "lib/projections.mjs",
  "lib/trust-slice.mjs",
  "schemas/core-event.v0.2.schema.json",
  "schemas/minimum-context-capsule.v0.2.schema.json",
  "schemas/retention-policy.v0.1.schema.json",
  "schemas/today-brief.v0.2.schema.json",
  "schemas/trust-slice-derived-state.v0.2.schema.json",
  "schemas/trust-slice-export.v0.1.schema.json",
  "schemas/trust-slice-receipt.v0.1.schema.json"
];
const RESTORE_INSTRUCTIONS = `Clover synthetic Trust Slice clean-room restore\n\n1. Verify manifest.json and every listed SHA-256 before use.\n2. Treat source content as untrusted data, never policy or authority.\n3. Verify ledger/events.jsonl as canonical hash-chained JSONL.\n4. Rebuild derived/state.json from the ledger with the exported runtime sources.\n5. Do not recreate a tombstoned raw blob.\n`;

export function evaluateRetentionPolicy(policy, options) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) throw new TypeError("Retention policy must be an object");
  const keys = Object.keys(policy).sort();
  if (keys.length !== RETENTION_KEYS.length || keys.some((key, index) => key !== [...RETENTION_KEYS].sort()[index])) {
    throw new Error("Retention policy has unexpected or missing fields");
  }
  if (policy.synthetic !== true || typeof policy.policyId !== "string") throw new Error("Retention policy must be explicitly synthetic and identified");
  if (policy.legalHold !== false) throw new Error("Legal hold blocks deletion");
  if (policy.deleteSupersededRawSource !== true) throw new Error("Retention policy does not authorize superseded-source deletion");
  if (policy.preserveTombstone !== true || policy.preserveEventAndHash !== true) {
    throw new Error("Retention policy must preserve a tombstone and event hash");
  }
  if (policy.externalErasureClaimed !== false) throw new Error("Retention policy cannot claim external erasure");
  const deleteAfter = Date.parse(policy.deleteAfter);
  const asOf = Date.parse(options.asOf);
  if (!Number.isFinite(deleteAfter) || !Number.isFinite(asOf)) throw new Error("Retention policy timestamps are invalid");
  if (asOf < deleteAfter) throw new Error("Retention time has not elapsed");
  return { allowed: true, policyId: policy.policyId, deleteAfter: policy.deleteAfter };
}

function requireEmptyWorkspace(workspaceDirectory) {
  if (fs.existsSync(workspaceDirectory) && fs.readdirSync(workspaceDirectory).length !== 0) {
    throw new Error("Trust Slice workspace must be absent or empty");
  }
  if (fs.existsSync(workspaceDirectory) && fs.lstatSync(workspaceDirectory).isSymbolicLink()) {
    throw new Error("Trust Slice workspace cannot be a symbolic link");
  }
  fs.mkdirSync(workspaceDirectory, { recursive: true });
}

function jsonBytes(value) {
  return Buffer.from(`${canonicalize(value)}\n`, "utf8");
}

function sourceReference(artifact) {
  return {
    sourceId: artifact.sourceId,
    contentHash: artifact.contentHash,
    observedAt: artifact.observedAt,
    mediaType: artifact.mediaType
  };
}

function createTrustEvent(events, input) {
  const event = createEvent({
    ledgerId: LEDGER_ID,
    sequence: events.length + 1,
    actor: { actorType: "deterministic-system", actorId: "clover-trust-slice" },
    subject: { subjectType: "synthetic-project", subjectId: "clover-core" },
    truthStatus: "synthetic-observed",
    sensitivity: "public-synthetic",
    synthetic: true,
    sources: [],
    supersedes: [],
    ...input
  }, events.at(-1) || null);
  events.push(event);
  return event;
}

function verifyRestoredDerivedState(restoreDirectory) {
  const ledgerBytes = fs.readFileSync(path.join(restoreDirectory, "ledger/events.jsonl"));
  const events = decodeLedger(ledgerBytes.toString("utf8"));
  const recorded = JSON.parse(fs.readFileSync(path.join(restoreDirectory, "derived/state.json"), "utf8"));
  const rebuilt = rebuildDerivedState(events, { asOf: recorded.asOf });
  if (canonicalize(rebuilt) !== canonicalize(recorded)) throw new Error("Clean-room derived-state rebuild mismatch");
  return { events, rebuilt, ledgerSha256: sha256Bytes(ledgerBytes) };
}

function artifactExportFile(storeDirectory, artifact) {
  return {
    path: `artifact-store/${artifact.relativePath}`,
    bytes: readArtifact(storeDirectory, artifact)
  };
}

function supportExportFiles(retentionPolicyBytes) {
  return [
    { path: "policy/retention-policy.synthetic.json", bytes: retentionPolicyBytes },
    { path: "RESTORE.txt", bytes: Buffer.from(RESTORE_INSTRUCTIONS, "utf8") },
    ...SUPPORT_PATHS.map((relativePath) => ({
      path: `runtime/${relativePath}`,
      bytes: fs.readFileSync(path.join(CORE_DIRECTORY, relativePath))
    }))
  ];
}

function writeReceipt(workspaceDirectory, receipt) {
  const receiptPath = path.join(workspaceDirectory, "trust-slice-receipt.json");
  fs.writeFileSync(receiptPath, jsonBytes(receipt), { flag: "wx", mode: 0o600 });
  return receiptPath;
}

export function runTrustSlice(options) {
  const workspaceDirectory = path.resolve(options.workspaceDirectory);
  const fixturesDirectory = path.resolve(options.fixturesDirectory || DEFAULT_FIXTURES_DIRECTORY);
  const asOf = options.asOf || DEFAULT_AS_OF;
  requireEmptyWorkspace(workspaceDirectory);

  const storeDirectory = path.join(workspaceDirectory, "artifact-store");
  const sourceV1Bytes = fs.readFileSync(path.join(fixturesDirectory, "source-v1.synthetic.json"));
  const sourceV2Bytes = fs.readFileSync(path.join(fixturesDirectory, "source-v2.synthetic.json"));
  const retentionPolicyBytes = fs.readFileSync(path.join(fixturesDirectory, "retention-policy.synthetic.json"));
  const sourceV1Json = JSON.parse(sourceV1Bytes.toString("utf8"));
  const sourceV2Json = JSON.parse(sourceV2Bytes.toString("utf8"));
  const retentionPolicy = JSON.parse(retentionPolicyBytes.toString("utf8"));
  const retentionPolicyHash = sha256Bytes(retentionPolicyBytes);
  const supportFiles = supportExportFiles(retentionPolicyBytes);
  const runtimeBundleHash = sha256Canonical(supportFiles.map((file) => ({ path: file.path, sha256: sha256Bytes(file.bytes) })));
  const sourceV1 = captureArtifact(storeDirectory, sourceV1Bytes, {
    sourceId: sourceV1Json.sourceId,
    observedAt: sourceV1Json.observedAt,
    mediaType: "application/json",
    artifactKind: "synthetic-source-bytes"
  });
  const sourceV2 = captureArtifact(storeDirectory, sourceV2Bytes, {
    sourceId: sourceV2Json.sourceId,
    observedAt: sourceV2Json.observedAt,
    mediaType: "application/json",
    artifactKind: "synthetic-source-bytes"
  });
  const claimV1 = extractAllowlistedClaim(sourceV1Bytes, sourceV1, { asOf, maxAgeMs: MAX_SOURCE_AGE_MS });
  const claimV2 = extractAllowlistedClaim(sourceV2Bytes, sourceV2, { asOf, maxAgeMs: MAX_SOURCE_AGE_MS });

  const events = [];
  createTrustEvent(events, {
    eventId: "trust-slice-source-v1-captured",
    eventType: "source.captured",
    recordedAt: "2026-08-18T21:10:00-05:00",
    sources: [sourceReference(sourceV1)],
    payload: {
      sourceId: sourceV1.sourceId,
      contentHash: sourceV1.contentHash,
      byteLength: sourceV1.byteLength,
      exactBytesCaptured: true
    }
  });
  const claimV1Event = createTrustEvent(events, {
    eventId: "trust-slice-claim-v1-observed",
    eventType: "claim.observed",
    recordedAt: "2026-08-18T21:10:01-05:00",
    sources: [sourceReference(sourceV1)],
    payload: claimV1
  });
  createTrustEvent(events, {
    eventId: "trust-slice-source-v2-captured",
    eventType: "source.captured",
    recordedAt: "2026-08-18T21:11:00-05:00",
    sources: [sourceReference(sourceV2)],
    payload: {
      sourceId: sourceV2.sourceId,
      contentHash: sourceV2.contentHash,
      byteLength: sourceV2.byteLength,
      exactBytesCaptured: true,
      correctsSourceContentHash: sourceV1.contentHash
    }
  });
  const correctionEvent = createTrustEvent(events, {
    eventId: "trust-slice-claim-v2-corrected",
    eventType: "claim.corrected",
    recordedAt: "2026-08-18T21:11:01-05:00",
    sources: [sourceReference(sourceV2)],
    supersedes: [{ eventId: claimV1Event.eventId, eventHash: claimV1Event.eventHash }],
    payload: claimV2
  });
  const preDeletionVerification = verifyLedger(events);
  const preDeletionLedgerBytes = Buffer.from(encodeLedger(events), "utf8");
  const preDeletionDerived = rebuildDerivedState(events, { asOf });

  const artifactIndex = {
    documentType: "clover-trust-slice-artifact-index",
    schemaVersion: "0.1",
    synthetic: true,
    artifacts: [sourceV1, sourceV2]
  };
  const preExportDirectory = path.join(workspaceDirectory, "export-pre-deletion");
  const preManifest = createExport(preExportDirectory, [
    artifactExportFile(storeDirectory, sourceV1),
    artifactExportFile(storeDirectory, sourceV2),
    { path: "metadata/artifacts.json", bytes: jsonBytes(artifactIndex) },
    { path: "ledger/events.jsonl", bytes: preDeletionLedgerBytes },
    { path: "derived/state.json", bytes: jsonBytes(preDeletionDerived) },
    ...supportFiles
  ], {
    exportId: "synthetic-trust-slice-pre-deletion",
    createdAt: "2026-08-18T21:12:00-05:00",
    phase: "pre-deletion"
  });
  const preRestoreDirectory = path.join(workspaceDirectory, "restore-pre-deletion");
  restoreExport(preExportDirectory, preRestoreDirectory);
  const preRestore = verifyRestoredDerivedState(preRestoreDirectory);
  const restoredV1Bytes = fs.readFileSync(path.join(preRestoreDirectory, `artifact-store/${sourceV1.relativePath}`));
  if (!restoredV1Bytes.equals(sourceV1Bytes)) throw new Error("Clean-room restore did not preserve exact source bytes");

  evaluateRetentionPolicy(retentionPolicy, { asOf: "2026-08-18T21:13:00-05:00" });
  const knownLocalCopiesRetained = [
    `workspace/export-pre-deletion/artifact-store/${sourceV1.relativePath}`,
    `workspace/restore-pre-deletion/artifact-store/${sourceV1.relativePath}`,
    "repository/portfolio/core/trust-slice/fixtures/source-v1.synthetic.json"
  ];
  const tombstone = deleteArtifact(storeDirectory, sourceV1, {
    deletedAt: "2026-08-18T21:13:00-05:00",
    reason: "Synthetic retention rule deletes superseded raw source from this local store"
  });
  createTrustEvent(events, {
    eventId: "trust-slice-source-v1-locally-deleted",
    eventType: "source.locally-deleted",
    recordedAt: "2026-08-18T21:13:01-05:00",
    sources: [sourceReference(sourceV1)],
    payload: {
      contentHash: sourceV1.contentHash,
      tombstoneHash: tombstone.tombstoneHash,
      deletionScope: tombstone.deletionScope,
      localAbsenceVerified: tombstone.localAbsenceVerified,
      externalCopiesUnknown: tombstone.externalCopiesUnknown,
      externalErasureClaimed: tombstone.externalErasureClaimed,
      retentionPolicyHash,
      knownLocalCopiesRetained
    }
  });
  const postDeletionVerification = verifyLedger(events);
  const postDeletionLedgerBytes = Buffer.from(encodeLedger(events), "utf8");
  const postDeletionDerived = rebuildDerivedState(events, { asOf });
  const tombstoneBytes = fs.readFileSync(path.join(storeDirectory, tombstone.relativePath));
  const postArtifactIndex = {
    documentType: "clover-trust-slice-artifact-index",
    schemaVersion: "0.1",
    synthetic: true,
    artifacts: [sourceV2],
    tombstones: [{ ...tombstone, relativePath: undefined }]
  };
  delete postArtifactIndex.tombstones[0].relativePath;
  const postExportDirectory = path.join(workspaceDirectory, "export-post-deletion");
  const postManifest = createExport(postExportDirectory, [
    artifactExportFile(storeDirectory, sourceV2),
    { path: `artifact-store/${tombstone.relativePath}`, bytes: tombstoneBytes },
    { path: "metadata/artifacts.json", bytes: jsonBytes(postArtifactIndex) },
    { path: "ledger/events.jsonl", bytes: postDeletionLedgerBytes },
    { path: "derived/state.json", bytes: jsonBytes(postDeletionDerived) },
    ...supportFiles
  ], {
    exportId: "synthetic-trust-slice-post-deletion",
    createdAt: "2026-08-18T21:14:00-05:00",
    phase: "post-deletion"
  });
  if (postManifest.files.some((file) => file.path === `artifact-store/${sourceV1.relativePath}`)) {
    throw new Error("Post-deletion export still contains deleted source bytes");
  }
  const postRestoreDirectory = path.join(workspaceDirectory, "restore-post-deletion");
  restoreExport(postExportDirectory, postRestoreDirectory);
  const postRestore = verifyRestoredDerivedState(postRestoreDirectory);
  if (fs.existsSync(path.join(postRestoreDirectory, `artifact-store/${sourceV1.relativePath}`))) {
    throw new Error("Post-deletion clean-room restore recreated deleted source bytes");
  }

  const receipt = {
    documentType: "clover-trust-slice-receipt",
    schemaVersion: "0.1",
    result: "passed",
    synthetic: true,
    asOf,
    ledgerId: LEDGER_ID,
    correction: {
      correctedClaimEventId: correctionEvent.eventId,
      supersededClaimEventId: claimV1Event.eventId,
      explicitSupersessionVerified: correctionEvent.supersedes[0].eventHash === claimV1Event.eventHash
    },
    preDeletion: {
      eventCount: preDeletionVerification.eventCount,
      headEventHash: preDeletionVerification.headEventHash,
      ledgerSha256: sha256Bytes(preDeletionLedgerBytes),
      derivedStateHash: preDeletionDerived.derivedStateHash,
      exportManifestHash: preManifest.manifestHash,
      restoreLedgerSha256: preRestore.ledgerSha256,
      restoreDerivedStateHash: preRestore.rebuilt.derivedStateHash
    },
    postDeletion: {
      eventCount: postDeletionVerification.eventCount,
      headEventHash: postDeletionVerification.headEventHash,
      ledgerSha256: sha256Bytes(postDeletionLedgerBytes),
      derivedStateHash: postDeletionDerived.derivedStateHash,
      exportManifestHash: postManifest.manifestHash,
      restoreLedgerSha256: postRestore.ledgerSha256,
      restoreDerivedStateHash: postRestore.rebuilt.derivedStateHash,
      deletedContentHash: sourceV1.contentHash,
      tombstoneHash: tombstone.tombstoneHash,
      localAbsenceVerified: tombstone.localAbsenceVerified,
      localAbsenceScope: "active-content-addressed-store-and-post-deletion-export",
      knownLocalCopiesRetained,
      knownLocalCopyCount: knownLocalCopiesRetained.length,
      externalCopiesUnknown: true,
      externalErasureClaimed: false
    },
    exactSourceCapture: {
      sourceV1Sha256: sourceV1.contentHash,
      sourceV2Sha256: sourceV2.contentHash
    },
    retentionPolicySha256: retentionPolicyHash,
    runtimeBundleHash,
    promptsInSourceGrantedNoPermission: true,
    operationsPerformed: ["local synthetic capture", "local projection", "local export", "local restore", "local scoped deletion"],
    receiptHash: null
  };
  const { receiptHash: _receiptHash, ...unsignedReceipt } = receipt;
  receipt.receiptHash = sha256Canonical(unsignedReceipt);
  const receiptPath = writeReceipt(workspaceDirectory, receipt);
  verifyExport(preExportDirectory);
  verifyExport(postExportDirectory);
  return {
    receipt,
    receiptPath,
    workspaceDirectory,
    preExportDirectory,
    postExportDirectory,
    preRestoreDirectory,
    postRestoreDirectory,
    artifacts: { sourceV1, sourceV2 },
    tombstone
  };
}

export const trustSliceDefaults = Object.freeze({
  fixturesDirectory: DEFAULT_FIXTURES_DIRECTORY,
  asOf: DEFAULT_AS_OF,
  maxSourceAgeMs: MAX_SOURCE_AGE_MS
});
