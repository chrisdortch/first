import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalize, sha256Bytes, sha256Canonical } from "./canonical-json.mjs";
import { validateJsonSchema } from "./validators.mjs";

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT_DIRECTORY = path.resolve(MODULE_DIRECTORY, "../../..");
export const PUBLICATION_INDEX_PATH = "portfolio/core/publication/index.json";
export const PUBLICATION_SCHEMA_PATH = "portfolio/core/publication/versions/0.1.0/schemas/core-publication-finalization.schema.json";

export const REVIEWED_HEAD = "2309bbc61dc8fcc7f2167c6c47db4a8b11cd8334";
export const REVIEWED_TREE = "a027db19d8b177fe52d45fc0c0153ca1189f728e";
export const REVIEWED_PARENT = "9006dcb78ee9412b57321cbd0fbdfa617d7bf96c";
export const REVIEWED_BASE = "364a9a96829f323aa00a679804fdd7ed879043b5";
export const HISTORICAL_RECEIPT_HASH = "293188db70f99b738ecb58fec232702079e10ab8234db816d4a28c4e83fae603";
export const HISTORICAL_REPORT_HASH = "37b8b8e247c524117c525a71afacbe2e557198ca04ac88b4c0e397b3f2085c50";
export const HISTORICAL_REVIEW_PROMPT_HASH = "a8207c4e0b0e615ef129f4a8bb38a2e22a238d3abc1dd1682f1b970ec8a6efb9";
export const ACTION_002_HASH = "71873de93355ec1301b2a398b34d72860339f19f52c937fffdc3c95638550214";

const SELF_HASH_FIELDS = Object.freeze({
  "clover-core-publication-review-pointer": "reviewPointerHash",
  "clover-core-publication-readback": "publicationReadbackHash",
  "clover-core-publication-index": "publicationIndexHash",
});

const CONNECTOR_TO_CURRENT = Object.freeze({
  "clover://publication/report": "finalReport",
  "clover://publication/receipt": "sourceBoundReceipt",
  "clover://publication/review-prompt": "reviewPrompt",
  "clover://publication/review-decision": "reviewPointer",
  "clover://publication/readback": "publicationReadback",
});

const EXPECTED_PROVIDER_RUNS = Object.freeze([
  {
    name: "Validate Clover master plan",
    runId: 32427471833,
    jobs: [{ jobId: 96612271757, node: null }],
    artifacts: [],
  },
  {
    name: "Validate Clover Context Gateway",
    runId: 32427471937,
    jobs: [
      { jobId: 96612272190, node: 24 },
      { jobId: 96612272373, node: 22 },
    ],
    artifacts: [
      { artifactId: 9427917664, node: 24, sha256: "2a1ea1978c8b18b6ab98894b88dd862fc015467bb6ec2f0ac347f3f3d6dfab0f", expiresAt: "2026-09-19T23:10:03Z" },
      { artifactId: 9427917765, node: 22, sha256: "d37b1047abf8aec386feea75fe48ae6cbefb6fbfb013f9d700645d95122d5b6e", expiresAt: "2026-09-19T23:10:05Z" },
    ],
  },
  {
    name: "Validate Clover Core Candidate",
    runId: 32427471892,
    jobs: [
      { jobId: 96612272080, node: 24 },
      { jobId: 96612272122, node: 22 },
    ],
    artifacts: [
      { artifactId: 9427918607, node: 24, sha256: "6d18fa57a848822beb98f58a783e0a0f3da729d046e6ffa161cbfe5acfde9305", expiresAt: "2026-09-19T23:10:06Z" },
      { artifactId: 9427918903, node: 22, sha256: "4ae9b5b746abfc4c2ccb03d532e50bad8357d87c2f88db53fa07cd85ef25c82c", expiresAt: "2026-09-19T23:10:07Z" },
    ],
  },
]);

function fail(message) {
  throw new Error(`Publication finalization rejected: ${message}`);
}

function absolutePath(rootDirectory, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath)) fail("artifact path must be repository-relative");
  const root = path.resolve(rootDirectory);
  const absolute = path.resolve(root, relativePath);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) fail(`artifact path escapes repository root: ${relativePath}`);
  return absolute;
}

function readJson(rootDirectory, relativePath) {
  return JSON.parse(readBytes(rootDirectory, relativePath).toString("utf8"));
}

function readBytes(rootDirectory, relativePath) {
  const root = path.resolve(rootDirectory);
  const absolute = absolutePath(root, relativePath);
  const relative = path.relative(root, absolute);
  let cursor = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (fs.lstatSync(cursor).isSymbolicLink()) fail(`artifact path contains a symbolic link: ${relativePath}`);
  }
  const realRoot = fs.realpathSync.native(root);
  const realAbsolute = fs.realpathSync.native(absolute);
  if (realAbsolute !== realRoot && !realAbsolute.startsWith(`${realRoot}${path.sep}`)) {
    fail(`artifact real path escapes repository root: ${relativePath}`);
  }
  return fs.readFileSync(realAbsolute);
}

function withoutOwnHash(value) {
  const hashField = SELF_HASH_FIELDS[value?.documentType];
  if (!hashField) fail(`unsupported structured document type ${value?.documentType || "unknown"}`);
  const unsigned = structuredClone(value);
  delete unsigned[hashField];
  return { hashField, unsigned };
}

export function publicationRecordHash(value) {
  return sha256Canonical(withoutOwnHash(value).unsigned);
}

export function assertPublicationRecordHash(value) {
  const { hashField } = withoutOwnHash(value);
  const expected = publicationRecordHash(value);
  if (value[hashField] !== expected) fail(`${value.documentType} ${hashField} mismatch`);
  return expected;
}

function assertExactImplementation(value, label) {
  if (value.repository !== "chrisdortch/first") fail(`${label} repository substitution`);
  if (value.branch !== "platform/clover-core-trunk-activation-v0.1-20260820") fail(`${label} branch substitution`);
  if (value.headCommit !== REVIEWED_HEAD || value.tree !== REVIEWED_TREE || value.directParent !== REVIEWED_PARENT) {
    fail(`${label} reviewed implementation substitution`);
  }
  if (value.baseBranch !== "platform/clover-core-trust-slice-v0.2-20260818" || value.baseCommit !== REVIEWED_BASE) {
    fail(`${label} base substitution`);
  }
  if (value.pullRequest.number !== 17 || value.pullRequest.state !== "open" || !value.pullRequest.draft || value.pullRequest.merged) {
    fail(`${label} pull request state is not open, draft, and unmerged`);
  }
}

function assertPointerEqual(actual, expected, label) {
  if (canonicalize(actual) !== canonicalize(expected)) fail(`${label} pointer substitution`);
}

function assertPointerBytes(pointer, rootDirectory) {
  const bytes = readBytes(rootDirectory, pointer.path);
  if (pointer.hashMode === "sha256-bytes") {
    if (sha256Bytes(bytes) !== pointer.hash) fail(`${pointer.recordId} byte hash mismatch`);
    return;
  }
  const parsed = JSON.parse(bytes.toString("utf8"));
  if (publicationRecordHash(parsed) !== pointer.hash) fail(`${pointer.recordId} canonical hash mismatch`);
  assertPublicationRecordHash(parsed);
}

function assertExactlyOneCurrentPerArtifactType(index, label = "index") {
  for (const artifactType of new Set(index.entries.map((entry) => entry.artifactType))) {
    const currentEntries = index.entries.filter((entry) => entry.artifactType === artifactType && entry.status === "current");
    if (currentEntries.length !== 1) fail(`${label} must contain exactly one current entry for ${artifactType}`);
  }
}

function assertIndexPointers(index, rootDirectory) {
  const entrySequences = index.entries.map((entry) => entry.sequence);
  if (new Set(entrySequences).size !== entrySequences.length) fail("index entry sequence reuse");
  if (!entrySequences.every((sequence, offset) => sequence === offset + 1)) fail("index entries are not contiguous and ordered");
  const recordIds = index.entries.map((entry) => entry.recordId);
  const paths = index.entries.map((entry) => entry.path);
  if (new Set(recordIds).size !== recordIds.length || new Set(paths).size !== paths.length) fail("index record ID or path reuse");

  for (const [name, pointer] of Object.entries(index.current)) {
    const matches = index.entries.filter((entry) => entry.recordId === pointer.recordId && entry.path === pointer.path && entry.hash === pointer.hash);
    if (matches.length !== 1 || matches[0].status !== "current") fail(`current ${name} does not resolve exactly once to a current entry`);
    assertPointerBytes(pointer, rootDirectory);
  }
  assertExactlyOneCurrentPerArtifactType(index);
  for (const [connectorId, currentName] of Object.entries(CONNECTOR_TO_CURRENT)) {
    assertPointerEqual(index.connectorIds[connectorId], index.current[currentName], `connector ${connectorId}`);
  }
}

function normalizedOverlayRuns(github) {
  return github.workflows.map((workflow) => ({
    name: workflow.name,
    runId: workflow.runId,
    jobs: workflow.jobs.map(({ jobId, node }) => ({ jobId, node })),
    artifacts: workflow.artifacts.map(({ artifactId, node, sha256, expiresAt }) => ({ artifactId, node, sha256, expiresAt })),
  }));
}

function normalizedReceiptRuns(receipt) {
  return receipt.exactHeadCi.map((workflow) => ({
    name: workflow.workflow,
    runId: workflow.runId,
    jobs: workflow.jobs.map(({ jobId, node = null }) => ({ jobId, node })),
    artifacts: workflow.artifacts.map(({ artifactId, node, sha256, expiresAt }) => ({ artifactId, node, sha256, expiresAt })),
  }));
}

function assertProviderEvidence(readback, mirroredReceipt) {
  if (readback.github.sourceCommit !== REVIEWED_HEAD) fail("GitHub evidence source substitution");
  if (canonicalize(normalizedOverlayRuns(readback.github)) !== canonicalize(EXPECTED_PROVIDER_RUNS)) fail("GitHub run, job, or artifact substitution");
  if (canonicalize(normalizedReceiptRuns(mirroredReceipt)) !== canonicalize(EXPECTED_PROVIDER_RUNS)) fail("mirrored receipt provider evidence substitution");
  if (!readback.github.workflows.every((workflow) => workflow.conclusion === "success" && workflow.jobs.every((job) => job.conclusion === "success"))) {
    fail("GitHub evidence is not uniformly successful");
  }
  const vercel = readback.vercel;
  const historical = mirroredReceipt.gatewayPreview;
  for (const [key, expected] of Object.entries({
    deploymentId: "dpl_bwkBAYEz8XjjNLx4xXrdPAvc8bmS",
    immutableUrl: "https://clover-context-gateway-preview-bah2p1llj-chris-dortchs-projects.vercel.app",
    projectId: "prj_z4Y1ONIsFL2g2CFOcvg1umPo4UUM",
    sourceCommit: REVIEWED_HEAD,
    sourceRef: "platform/clover-core-trunk-activation-v0.1-20260820",
    sourceType: "cli",
    state: "READY",
    target: null,
    gatewayVersion: "0.3.1",
    mode: "read-only",
    writeToolsEnabled: false,
    standingProductionAuthority: false,
  })) {
    if (vercel[key] !== expected || historical[key] !== expected) fail(`Vercel ${key} substitution`);
  }
  if (vercel.aliases.length !== 0 || historical.aliases.length !== 0) fail("Vercel alias boundary widened");
}

function assertSourceBindings(readback, rootDirectory) {
  const today = readJson(rootDirectory, readback.sourceBindings.today.path);
  const status = readJson(rootDirectory, readback.sourceBindings.status.path);
  const handoff = readJson(rootDirectory, readback.sourceBindings.handoffIndex.path);
  if (today.sessionHash !== readback.sourceBindings.today.hash) fail("Today source binding mismatch");
  if (String(status.statusHash).replace(/^sha256:/, "") !== readback.sourceBindings.status.hash) fail("status source binding mismatch");
  if (handoff.indexHash !== readback.sourceBindings.handoffIndex.hash) fail("Handoff source binding mismatch");
  const entries = handoff.entries.filter((entry) => entry.actionId === "CLOVER-2026-08-20-002");
  if (entries.length !== 1) fail("Action 002 does not resolve exactly once");
  const [entry] = entries;
  const action = readback.action002;
  if (action.envelopeHash !== ACTION_002_HASH || action.envelopeHash !== entry.envelopeHash || action.indexHash !== handoff.indexHash) fail("Action 002 identity substitution");
  if (entry.status !== "pending" || entry.lifecycle.state !== "proposed" || entry.ownerApproval.status !== "pending") fail("Action 002 is no longer pending and proposed");
  if (entry.lifecycle.consumedAt !== null || entry.lifecycle.revokedAt !== null || action.consumed || action.revoked) fail("Action 002 lifecycle widened");
}

function assertMirroredReceiptScope(readback, mirroredReceipt) {
  if (mirroredReceipt.source.repository !== "chrisdortch/first" || mirroredReceipt.source.commit !== REVIEWED_HEAD || mirroredReceipt.source.tree !== REVIEWED_TREE) {
    fail("mirrored receipt reviewed source substitution");
  }
  if (mirroredReceipt.source.rollbackCommit !== REVIEWED_BASE || mirroredReceipt.pullRequest.baseCommit !== REVIEWED_BASE) fail("mirrored receipt base substitution");
  if (mirroredReceipt.receiptContainerDigest.value !== null) fail("historical receipt self-references its external container digest");
  const paths = mirroredReceipt.changedPathAllowlist;
  if (!Array.isArray(paths) || paths.length !== 62 || new Set(paths).size !== paths.length) fail("mirrored receipt changed-path allowlist mismatch");
  const scope = readback.mirroredIssuanceArtifacts.changedPathAllowlistScope;
  if (scope.reviewedHeadCommit !== mirroredReceipt.source.commit || scope.baseCommit !== mirroredReceipt.source.rollbackCommit || scope.changedPathCount !== paths.length) {
    fail("changed-path scope is not bound to the reviewed head");
  }
}

function scanSensitiveStructured(value, at = "$") {
  const prohibitedKeys = new Set(["customer", "guest", "staff", "credential", "secret", "token", "payment", "transaction", "order", "reservation", "email", "phone", "health", "legal", "financial"]);
  const sensitiveValuePatterns = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\b(?:sk|ghp)_[A-Za-z0-9_-]{12,}\b/,
    /\bBearer\s+[A-Za-z0-9._~-]{12,}\b/i,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  ];
  if (typeof value === "string" && sensitiveValuePatterns.some((pattern) => pattern.test(value))) fail(`sensitive value at ${at}`);
  if (Array.isArray(value)) return value.forEach((entry, index) => scanSensitiveStructured(entry, `${at}[${index}]`));
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (prohibitedKeys.has(key.toLowerCase())) fail(`sensitive field ${at}.${key}`);
      scanSensitiveStructured(entry, `${at}.${key}`);
    }
  }
}

export function assertSanitizedPublicationMirror(bytes, label = "publication mirror") {
  const text = bytes.toString("utf8");
  const prohibitedPatterns = [
    { pattern: /(?:^|[\s"'`])\/(?:Users|home)\/[A-Za-z0-9._-]+\//m, name: "absolute local path" },
    { pattern: /[A-Za-z]:\\Users\\[^\\\s]+\\/i, name: "absolute Windows local path" },
    { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, name: "private key" },
    { pattern: /\b(?:sk|ghp)_[A-Za-z0-9_-]{12,}\b/, name: "provider token" },
    { pattern: /\bBearer\s+[A-Za-z0-9._~-]{12,}\b/i, name: "bearer token" },
    { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, name: "JWT" },
    { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, name: "email address" },
    { pattern: /"(?:customer|guest|staff|credential|secret|payment|transaction|order|reservation|health|legal|financial)(?:Records?|Data|Payload)?"\s*:/i, name: "raw sensitive record field" },
  ];
  for (const { pattern, name } of prohibitedPatterns) {
    if (pattern.test(text)) fail(`${label} contains ${name}`);
  }
}

function loadSchema(rootDirectory) {
  return readJson(rootDirectory, PUBLICATION_SCHEMA_PATH);
}

function validateStructured(schema, rootDirectory, value, label) {
  validateJsonSchema(schema, value, {
    schemaDirectory: path.dirname(absolutePath(rootDirectory, PUBLICATION_SCHEMA_PATH)),
    label,
  });
  assertPublicationRecordHash(value);
}

export function loadPublicationCatalog(rootDirectory = DEFAULT_ROOT_DIRECTORY) {
  const index = readJson(rootDirectory, PUBLICATION_INDEX_PATH);
  const reviewPointer = readJson(rootDirectory, index.current.reviewPointer.path);
  const readback = readJson(rootDirectory, index.current.publicationReadback.path);
  const mirroredReceipt = readJson(rootDirectory, index.current.sourceBoundReceipt.path);
  return { index, reviewPointer, readback, mirroredReceipt };
}

export function validatePublicationCatalog(catalog, options = {}) {
  const rootDirectory = path.resolve(options.rootDirectory || DEFAULT_ROOT_DIRECTORY);
  const schema = options.schema || loadSchema(rootDirectory);
  const { index, reviewPointer, readback, mirroredReceipt } = catalog;
  validateStructured(schema, rootDirectory, index, "publication-index");
  validateStructured(schema, rootDirectory, reviewPointer, "publication-review-pointer");
  validateStructured(schema, rootDirectory, readback, "publication-readback");

  if (index.reviewedImplementationHead !== REVIEWED_HEAD) fail("index reviewed head substitution");
  assertExactImplementation(reviewPointer.reviewedImplementation, "review pointer");
  assertExactImplementation(readback.reviewedImplementation, "readback");
  assertIndexPointers(index, rootDirectory);

  const indexChain = validatePublicationIndexChain(rootDirectory, index, schema);

  assertPointerEqual(reviewPointer.reviewTarget, index.current.sourceBoundReceipt, "review target");
  assertPointerEqual(reviewPointer.reviewEvidence.reviewPrompt, index.current.reviewPrompt, "review prompt");
  assertPointerEqual(reviewPointer.reviewEvidence.finalReport, index.current.finalReport, "review report");
  assertPointerEqual(readback.reviewPointer, index.current.reviewPointer, "readback review pointer");
  assertPointerEqual(readback.mirroredIssuanceArtifacts.finalReport, index.current.finalReport, "readback final report");
  assertPointerEqual(readback.mirroredIssuanceArtifacts.sourceBoundReceipt, index.current.sourceBoundReceipt, "readback receipt");
  assertPointerEqual(readback.mirroredIssuanceArtifacts.reviewPrompt, index.current.reviewPrompt, "readback review prompt");

  if (reviewPointer.decision.verdict !== "AMEND" || reviewPointer.decision.bindingApproval || reviewPointer.authority.mergeApproved || reviewPointer.authority.productionApproved || reviewPointer.authority.action002Approved) {
    fail("owner-provided review was converted into execution or publication authority");
  }
  if (reviewPointer.decision.decisionEvidenceStatus !== "owner-reported-in-chat-not-preserved" || reviewPointer.decision.evidencePath !== null || reviewPointer.decision.evidenceHash !== null || reviewPointer.decision.findingsNormalization !== "normalized-summary") {
    fail("owner-reported review provenance was overstated or substituted");
  }
  const findingIds = reviewPointer.decision.findings.map((finding) => finding.findingId);
  if (canonicalize(findingIds) !== canonicalize(["external-only-final-evidence", "committed-prepublication-staleness"])) fail("independent review finding substitution");

  assertMirroredReceiptScope(readback, mirroredReceipt);
  for (const [label, pointer] of Object.entries({
    "mirrored final report": index.current.finalReport,
    "mirrored source-bound receipt": index.current.sourceBoundReceipt,
    "mirrored review prompt": index.current.reviewPrompt,
  })) {
    assertSanitizedPublicationMirror(readBytes(rootDirectory, pointer.path), label);
  }
  assertProviderEvidence(readback, mirroredReceipt);
  assertSourceBindings(readback, rootDirectory);
  if (readback.precedence.scope !== "publication-readback-only" || readback.precedence.supersedes.length !== 1) fail("publication precedence widened");
  if (readback.precedence.supersedes[0].hash !== readback.sourceBindings.today.hash) fail("publication precedence Today hash mismatch");
  const protectedScopes = new Set(["owner-authority", "handoff-lifecycle", "production-state", "historical-records"]);
  if (readback.precedence.doesNotSupersede.length !== protectedScopes.size || !readback.precedence.doesNotSupersede.every((scope) => protectedScopes.has(scope))) fail("publication precedence protection removed");
  if (Date.parse(readback.observedAt) < Date.parse(mirroredReceipt.issuedAt) || Date.parse(readback.observedAt) < Date.parse(reviewPointer.recordedAt)) fail("publication readback chronology is stale");
  if (readback.containerBinding.commit !== null || readback.containerBinding.tree !== null || readback.containerBinding.status !== "pending-external-publication-receipt") {
    fail("publication finalization self-references an unknown container commit");
  }
  scanSensitiveStructured({ index, reviewPointer, readback });
  return {
    status: "passed",
    reviewedImplementationHead: REVIEWED_HEAD,
    verdict: readback.verdict,
    publicationIndexHash: index.publicationIndexHash,
    publicationReadbackHash: readback.publicationReadbackHash,
    reviewPointerHash: reviewPointer.reviewPointerHash,
    historicalExternalReceiptHash: HISTORICAL_RECEIPT_HASH,
    action002Status: readback.action002.status,
    containerBindingStatus: readback.containerBinding.status,
    chainDepth: indexChain.depth,
  };
}

export function validatePublicationIndexChain(rootDirectory = DEFAULT_ROOT_DIRECTORY, suppliedIndex = null, suppliedSchema = null) {
  const root = path.resolve(rootDirectory);
  const schema = suppliedSchema || loadSchema(root);
  const rootBytes = readBytes(root, PUBLICATION_INDEX_PATH);
  let current = suppliedIndex || JSON.parse(rootBytes.toString("utf8"));
  const currentSnapshotBytes = readBytes(root, current.lifecycle.immutableSnapshotPath);
  if (!rootBytes.equals(currentSnapshotBytes)) fail("stable root is not byte-identical to its current immutable numbered snapshot");
  if (canonicalize(JSON.parse(currentSnapshotBytes.toString("utf8"))) !== canonicalize(current)) fail("catalog index differs from current immutable numbered snapshot");

  const visited = new Set();
  while (true) {
    if (visited.has(current.lifecycle.immutableSnapshotPath)) fail("publication index chain contains a cycle");
    visited.add(current.lifecycle.immutableSnapshotPath);
    validateJsonSchema(schema, current, {
      schemaDirectory: path.dirname(absolutePath(root, PUBLICATION_SCHEMA_PATH)),
      label: `publication-index-${current.lifecycle.sequence}`,
    });
    assertPublicationRecordHash(current);
    assertExactlyOneCurrentPerArtifactType(current, `index sequence ${current.lifecycle.sequence}`);
    for (const entry of current.entries) {
      assertPointerBytes({
        artifactType: entry.artifactType,
        recordId: entry.recordId,
        path: entry.path,
        hash: entry.hash,
        hashMode: entry.hashMode,
        mediaType: entry.mediaType,
      }, root);
    }
    if (current.lifecycle.sequence === 1) {
      if (current.lifecycle.previousIndexPath !== null || current.lifecycle.previousIndexHash !== null) fail("genesis index names a previous snapshot");
      break;
    }
    if (!current.lifecycle.previousIndexPath || !current.lifecycle.previousIndexHash) fail("successor index omits its previous snapshot binding");
    const previousBytes = readBytes(root, current.lifecycle.previousIndexPath);
    const previous = JSON.parse(previousBytes.toString("utf8"));
    if (previous.publicationIndexHash !== current.lifecycle.previousIndexHash || publicationRecordHash(previous) !== current.lifecycle.previousIndexHash) {
      fail("successor index previous snapshot hash mismatch");
    }
    validatePublicationIndexTransition(previous, current);
    current = previous;
  }
  return { status: "passed", depth: visited.size };
}

export function validatePublicationFinalization(rootDirectory = DEFAULT_ROOT_DIRECTORY) {
  return validatePublicationCatalog(loadPublicationCatalog(rootDirectory), { rootDirectory });
}

export function validatePublicationIndexTransition(previous, next) {
  assertPublicationRecordHash(previous);
  assertPublicationRecordHash(next);
  if (next.lifecycle.sequence !== previous.lifecycle.sequence + 1) fail("successor index sequence is not contiguous");
  if (next.reviewedImplementationHead !== previous.reviewedImplementationHead) fail("successor changed the reviewed implementation head");
  if (Date.parse(next.updatedAt) < Date.parse(previous.updatedAt)) fail("successor index chronology moved backward");
  if (next.lifecycle.previousIndexPath !== previous.lifecycle.immutableSnapshotPath || next.lifecycle.previousIndexHash !== previous.publicationIndexHash) {
    fail("successor index does not bind the exact previous immutable snapshot");
  }
  const expectedSnapshotSuffix = `core-publication-index-${String(next.lifecycle.sequence).padStart(4, "0")}.json`;
  if (!next.lifecycle.immutableSnapshotPath.endsWith(expectedSnapshotSuffix)) fail("successor immutable snapshot path does not match its sequence");
  if (next.entries.length <= previous.entries.length) fail("successor index must append at least one entry");
  for (let index = 0; index < previous.entries.length; index += 1) {
    const before = previous.entries[index];
    const after = next.entries[index];
    const allowedStatus = before.status === after.status || (before.status === "current" && after.status === "superseded");
    const beforeWithoutStatus = { ...before };
    const afterWithoutStatus = { ...after };
    delete beforeWithoutStatus.status;
    delete afterWithoutStatus.status;
    if (!allowedStatus || canonicalize(beforeWithoutStatus) !== canonicalize(afterWithoutStatus)) fail(`successor rewrote prior entry ${before.sequence}`);
  }
  const sequences = next.entries.map((entry) => entry.sequence);
  if (!sequences.every((sequence, offset) => sequence === offset + 1)) fail("successor entries are not append-only and contiguous");
  const ids = next.entries.map((entry) => entry.recordId);
  const paths = next.entries.map((entry) => entry.path);
  if (new Set(ids).size !== ids.length || new Set(paths).size !== paths.length) fail("successor reused a record ID or immutable path");
  for (const [name, pointer] of Object.entries(next.current)) {
    const matches = next.entries.filter((entry) => entry.recordId === pointer.recordId && entry.path === pointer.path && entry.hash === pointer.hash && entry.status === "current");
    if (matches.length !== 1) fail(`successor current ${name} does not resolve exactly once`);
  }
  assertExactlyOneCurrentPerArtifactType(next, "successor");
  for (const [connectorId, currentName] of Object.entries(CONNECTOR_TO_CURRENT)) {
    assertPointerEqual(next.connectorIds[connectorId], next.current[currentName], `successor connector ${connectorId}`);
  }
  return { status: "passed", sequence: next.lifecycle.sequence, previousIndexHash: next.lifecycle.previousIndexHash };
}
