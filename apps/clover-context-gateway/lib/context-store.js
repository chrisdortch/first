import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const REPOSITORY = "chrisdortch/first";
const FULL_COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const HANDOFF_INDEX_ID = "clover://handoff/index";
const HANDOFF_INDEX_PATH = "portfolio/core/handoff/index.json";
const HANDOFF_INDEX_SNAPSHOT_PATTERN = /^portfolio\/core\/handoff\/versions\/0\.1\.0\/indexes\/action-receipt-index-([0-9]{4})\.json$/;
const HISTORICAL_HANDOFF_INDEX_HASH = "136041730e9c8c705c4ac13823d7b568060bf8d454ecf56fd2fc2cd915a0d42c";
const HISTORICAL_HANDOFF_INDEX_BYTE_HASH = "da4b60605402cf4197f8073c312c84a4a374daec35e11664bac86593bd8152ff";
const PUBLICATION_INDEX_ID = "clover://publication/index";
const PUBLICATION_CURRENT_ID = "clover://publication/readback";
const PUBLICATION_INDEX_PATH = "portfolio/core/publication/index.json";
const REVIEWED_IMPLEMENTATION = Object.freeze({
  headCommit: "2309bbc61dc8fcc7f2167c6c47db4a8b11cd8334",
  tree: "a027db19d8b177fe52d45fc0c0153ca1189f728e",
  directParent: "9006dcb78ee9412b57321cbd0fbdfa617d7bf96c",
  baseCommit: "364a9a96829f323aa00a679804fdd7ed879043b5",
});
const PUBLICATION_ARTIFACT_PATH_PATTERN = /^portfolio\/core\/publication\/versions\/([0-9]+\.[0-9]+\.[0-9]+)\/(mirrors|records)\/([A-Za-z0-9_.-]+)$/;
const PUBLICATION_INDEX_SNAPSHOT_PATTERN = /^portfolio\/core\/publication\/versions\/([0-9]+\.[0-9]+\.[0-9]+)\/records\/core-publication-index-([0-9]{4})\.json$/;
const PUBLICATION_IMMUTABLE_RECORD_POLICY = "The stable root must be byte-identical to this immutable numbered snapshot. A successor preserves prior records, appends a new numbered snapshot, and advances the stable root with an exact previous path and hash.";
const PUBLICATION_CONTAINER_RELATION = "The reviewed implementation head identifies the code and provider evidence under review; it is not the later commit that first contains this finalization record.";
const PUBLICATION_CONTAINER_RECORDING_RULE = "After these bytes are committed, refreshed GitHub/Vercel/PR metadata must bind the exact container commit and tree in a post-commit source-bound readback; an optional later append-only record may persist it. Never use a local attachment.";
const PUBLICATION_ARTIFACTS = {
  finalReport: {
    id: "clover://publication/report",
    title: "Clover Core Trunk Activation Final Report",
    artifactType: "mirrored-final-report",
    hashMode: "sha256-bytes",
    mediaType: "text/markdown",
    kind: "text",
  },
  sourceBoundReceipt: {
    id: "clover://publication/receipt",
    title: "Clover Core Trunk Activation Source-Bound Receipt",
    artifactType: "mirrored-source-bound-receipt",
    hashMode: "sha256-bytes",
    mediaType: "application/json",
    kind: "json",
  },
  reviewPrompt: {
    id: "clover://publication/review-prompt",
    title: "Chat Pro Core Trunk Activation Review Prompt",
    artifactType: "mirrored-review-prompt",
    hashMode: "sha256-bytes",
    mediaType: "text/markdown",
    kind: "text",
  },
  reviewPointer: {
    id: "clover://publication/review-decision",
    title: "Core Trunk Activation Independent Review Decision",
    artifactType: "structured-review-pointer",
    hashMode: "sha256-canonical-without-self-hash-field",
    mediaType: "application/json",
    kind: "json",
    selfHashField: "reviewPointerHash",
    documentType: "clover-core-publication-review-pointer",
    recordIdField: "reviewPointerId",
  },
  publicationReadback: {
    id: PUBLICATION_CURRENT_ID,
    title: "Current Clover Core Publication Readback",
    artifactType: "publication-readback",
    hashMode: "sha256-canonical-without-self-hash-field",
    mediaType: "application/json",
    kind: "json",
    selfHashField: "publicationReadbackHash",
    documentType: "clover-core-publication-readback",
    recordIdField: "readbackId",
  },
};

export function resolveDefaultSourceRef(environment = process.env) {
  const explicitCommit = String(environment.CONTEXT_SOURCE_COMMIT || "").trim();
  if (explicitCommit && !FULL_COMMIT_PATTERN.test(explicitCommit)) {
    throw new Error("CONTEXT_SOURCE_COMMIT must be a full lowercase Git commit SHA.");
  }
  const vercelCommit = String(environment.VERCEL_GIT_COMMIT_SHA || "").trim();
  if (vercelCommit && !FULL_COMMIT_PATTERN.test(vercelCommit)) {
    throw new Error("VERCEL_GIT_COMMIT_SHA must be a full lowercase Git commit SHA.");
  }
  return explicitCommit || vercelCommit || String(environment.CONTEXT_SOURCE_REF || "main").trim() || "main";
}

const DEFAULT_REF = resolveDefaultSourceRef();
const DEFAULT_CACHE_TTL_MS = Number(process.env.CONTEXT_CACHE_TTL_MS || 300000);

const CORE_DOCUMENTS = [
  { id: "clover://master-pointer", title: "Clover Master Plan Pointer", relativePath: "CLOVER_MASTER_PLAN_POINTER.json", kind: "json", keywords: "master pointer canonical current plan start here" },
  { id: "clover://status/current", title: "Current Clover Portfolio Status", relativePath: "portfolio/status/current.json", kind: "json", keywords: "status completion percentage progress program areas blockers" },
  { id: "clover://status/candidate/2026-08-20", title: "August 20 Clover Portfolio Status Candidate", relativePath: "portfolio/status/candidates/2026-08-20/status.json", kind: "json", optional: true, keywords: "candidate status completion current live historical unknown source freshness" },
  { id: "clover://master-plan/current", title: "Current Clover Master Plan", relativePath: "portfolio/master-plan/CURRENT.md", kind: "text", keywords: "master plan current version mission north star phases" },
  { id: "clover://master-plan/v1.0.0", title: "Clover Master Plan 1.0.0", relativePath: "portfolio/master-plan/versions/1.0.0/MASTER_PLAN.md", kind: "text", keywords: "master plan architecture outcomes phases complete" },
  { id: "clover://projects", title: "Clover Portfolio Project Registry", relativePath: "portfolio/registry/projects.json", kind: "json", keywords: "projects apps repositories priorities completion next milestone" },
  { id: "clover://registry/candidate/2.0.0", title: "Clover Federated Portfolio Projection Candidate 2.0.0", relativePath: "portfolio/registry/projections/core-project-index.v2.json", kind: "json", optional: true, keywords: "candidate registry federated core projection relationships identities unknowns" },
  { id: "clover://next", title: "Current Prioritized Work Queue", relativePath: "portfolio/NEXT.md", kind: "text", keywords: "next priority queue p0 p1 roadmap" },
  { id: "clover://progress-methodology", title: "Clover Progress Methodology", relativePath: "portfolio/PROGRESS_METHODOLOGY.md", kind: "text", keywords: "completion percentage methodology confidence scoring" },
  { id: "clover://build-protocol", title: "Current Clover Build Protocol", relativePath: "standards/clover-build-protocol/CURRENT.md", kind: "text", keywords: "build preview branch tests visual qa release protocol" },
  { id: "clover://data-protocol", title: "Current Clover Data Change Protocol", relativePath: "standards/clover-data-change-protocol/CURRENT.md", kind: "text", keywords: "database migration schema backup restore reconciliation protocol" },
  { id: "clover://context-control-plane", title: "Clover Context Control Plane", relativePath: "portfolio/context/CONTROL_PLANE_ARCHITECTURE.md", kind: "text", keywords: "context gateway command center voice adapters current logs errors traffic" },
  { id: "clover://command-grammar", title: "Clover Command Grammar", relativePath: "portfolio/context/COMMAND_GRAMMAR.md", kind: "text", keywords: "use cloverapps plant seed evolve diagnose backup release" },
  { id: "clover://freshness-policy", title: "Clover Context Freshness Policy", relativePath: "portfolio/context/FRESHNESS_POLICY.md", kind: "text", keywords: "freshness current stale unknown contradictory refresh" },
  { id: "clover://cost-policy", title: "Clover Cost and Token Policy", relativePath: "portfolio/context/COST_POLICY.md", kind: "text", keywords: "cost token credits chat pro codex work sites voice" },
  { id: "clover://live-adapters", title: "Clover Live Adapter Registry", relativePath: "portfolio/context/LIVE_ADAPTER_REGISTRY.json", kind: "json", keywords: "github vercel drive sites logs errors traffic adapters" },
  { id: "clover://today/candidate/2026-08-20", title: "Clover Today Owner Session Candidate", relativePath: "portfolio/core/today/2026-08-20/session.json", kind: "json", optional: true, keywords: "today owner session priorities recommended action connector plan authority unknowns" },
  { id: HANDOFF_INDEX_ID, title: "Clover Handoff Ledger Index", relativePath: HANDOFF_INDEX_PATH, kind: "json", optional: true, keywords: "handoff action envelope execution receipt review decision branch capsule index" },
  { id: PUBLICATION_INDEX_ID, title: "Clover Core Publication Index", relativePath: PUBLICATION_INDEX_PATH, kind: "json", optional: true, keywords: "publication finalization readback exact source ci preview receipt current verified" },
  { id: "clover://owner/start", title: "Clover Owner Start", relativePath: "CLOVER_OWNER_START.md", kind: "text", optional: true, keywords: "owner start compact prompt use clover core" },
  { id: "clover://operator/chatgpt", title: "ChatGPT Clover Project Instructions", relativePath: "CHATGPT_PROJECT_INSTRUCTIONS.md", kind: "text", optional: true, keywords: "chatgpt project owner console instructions" },
  { id: "clover://operator/codex", title: "Codex Clover Operator", relativePath: "CODEX_CLOVER_OPERATOR.md", kind: "text", optional: true, keywords: "codex operator approved action id receipt" },
  { id: "clover://operator/connectors", title: "Clover Connector Routing", relativePath: "CLOVER_CONNECTOR_ROUTING.md", kind: "text", optional: true, keywords: "connector routing github vercel context gateway minimum necessary" },
];

const SNAPSHOT_DOCUMENTS = {
  candidateStatus: "clover://status/candidate/2026-08-20",
  registryCandidate: "clover://registry/candidate/2.0.0",
  today: "clover://today/candidate/2026-08-20",
  handoff: HANDOFF_INDEX_ID,
};

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function canonicalUrl(relativePath, ref = DEFAULT_REF) {
  return `https://github.com/${REPOSITORY}/blob/${encodeURIComponent(ref)}/${relativePath}`;
}

function rawUrl(relativePath, ref = DEFAULT_REF) {
  return `https://raw.githubusercontent.com/${REPOSITORY}/${encodeURIComponent(ref)}/${relativePath}`;
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value) {
  return [...new Set(normalizeText(value).split(/\s+/).filter((token) => token.length > 1))];
}

function scoreDocument(document, queryTokens) {
  const title = normalizeText(document.title);
  const searchText = normalizeText(document.searchText || document.text || "");
  const id = normalizeText(document.id);
  let score = 0;
  for (const token of queryTokens) {
    if (title.includes(token)) score += 8;
    if (id.includes(token)) score += 5;
    if (searchText.includes(token)) score += 2;
  }
  return score;
}

function projectDocument(project, sourceRef, sourceCommit = null) {
  return {
    id: `clover://project/${project.projectId}`,
    title: project.title,
    text: JSON.stringify(project, null, 2),
    parsed: project,
    searchText: [project.projectId, project.title, project.repository, project.publicUrl, project.portfolioArea, project.nextMilestone, project.verificationStatus].filter(Boolean).join(" "),
    url: canonicalUrl("portfolio/registry/projects.json", sourceCommit || sourceRef),
    metadata: {
      repository: REPOSITORY,
      ref: sourceRef,
      commit: sourceCommit,
      relativePath: "portfolio/registry/projects.json",
      sourceType: "canonical-project-record",
      projectId: project.projectId,
    },
  };
}

function coreSearchDocument(definition, sourceRef, sourceCommit = null) {
  return {
    id: definition.id,
    title: definition.title,
    searchText: `${definition.keywords || ""} ${definition.relativePath}`,
    url: canonicalUrl(definition.relativePath, sourceCommit || sourceRef),
  };
}

function rankDocuments(documents, query, limit = 10) {
  const queryTokens = tokens(query);
  return documents
    .map((document) => ({ document, score: scoreDocument(document, queryTokens) }))
    .filter(({ score }) => queryTokens.length === 0 || score > 0)
    .sort((a, b) => b.score - a.score || a.document.title.localeCompare(b.document.title))
    .slice(0, Math.max(1, Math.min(Number(limit) || 10, 25)))
    .map(({ document }) => ({ id: document.id, title: document.title, url: document.url }));
}

function optionalDocumentState(definition, document, source = {}) {
  const sourceMetadata = {
    repository: document?.metadata?.repository || source.repository || REPOSITORY,
    ref: document?.metadata?.ref ?? source.ref ?? null,
    commit: document?.metadata?.commit ?? source.commit ?? null,
    relativePath: definition.relativePath,
    sourceType: document?.metadata?.sourceType || "optional-candidate-repository-record",
  };
  if (!document) {
    return {
      id: definition.id,
      available: false,
      data: null,
      url: null,
      metadata: {
        ...sourceMetadata,
        found: false,
      },
    };
  }
  return {
    id: document.id,
    available: true,
    data: document.parsed ?? document.text,
    url: document.url,
    metadata: {
      ...sourceMetadata,
      found: true,
    },
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function handoffIndexDocumentDefinition(relativePath, id = "clover://handoff/index/previous") {
  if (!HANDOFF_INDEX_SNAPSHOT_PATTERN.test(relativePath || "")) return null;
  return {
    id,
    title: "Immutable Clover Handoff Ledger Index Snapshot",
    relativePath,
    kind: "json",
    optional: true,
  };
}

function handoffIndexSequence(relativePath) {
  const match = HANDOFF_INDEX_SNAPSHOT_PATTERN.exec(relativePath || "");
  return match ? Number(match[1]) : null;
}

function handoffCurrentSnapshotPath(index) {
  if (index?.previousIndexPath === null && index?.previousIndexHash === null) {
    return "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0001.json";
  }
  const previousSequence = handoffIndexSequence(index?.previousIndexPath);
  if (!Number.isInteger(previousSequence) || previousSequence < 1 || previousSequence >= 9999) return null;
  return `portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-${String(previousSequence + 1).padStart(4, "0")}.json`;
}

function isIsoTimestamp(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function handoffIdentifier(value) {
  return typeof value === "string" && value.length >= 3 && value.length <= 160
    && /^[a-z0-9][a-z0-9._:-]*$/.test(value);
}

function handoffRepositoryPath(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 500
    && !value.startsWith("/")
    && !value.split("/").includes("..")
    && /^[A-Za-z0-9._*?\[\]{}/-]+$/.test(value);
}

const HANDOFF_ENTRY_KEYS = [
  "sequence", "recordedAt", "actionId", "branchCapsuleId", "branchCapsuleHash", "envelopeId",
  "envelopePath", "envelopeHash", "status", "lifecycle", "ownerApproval", "receiptId", "receiptPath",
  "receiptHash", "outcome", "review",
];
const HANDOFF_LIFECYCLE_KEYS = [
  "state", "singleUse", "consumedAt", "consumedByReceiptId", "revokedAt", "revocationEvidenceHash",
];
const HANDOFF_APPROVAL_KEYS = [
  "status", "approverId", "approvedAt", "approvedEnvelopeHash", "approvalEvidenceHash", "attestationId",
  "attestationPath", "attestationHash",
];
const HANDOFF_REVIEW_KEYS = ["status", "decisionId", "decisionPath", "decisionHash"];

function handoffReviewContract(review) {
  if (!hasExactKeys(review, HANDOFF_REVIEW_KEYS)) return false;
  if (review.status === "pending") {
    return review.decisionId === null && review.decisionPath === null && review.decisionHash === null;
  }
  return review.status === "completed"
    && handoffIdentifier(review.decisionId)
    && handoffRepositoryPath(review.decisionPath)
    && HASH_PATTERN.test(review.decisionHash || "");
}

function handoffOwnerApprovalContract(approval) {
  if (!hasExactKeys(approval, HANDOFF_APPROVAL_KEYS) || !handoffIdentifier(approval.approverId)) return false;
  const evidenceFields = [
    approval.approvedAt, approval.approvedEnvelopeHash, approval.approvalEvidenceHash, approval.attestationId,
    approval.attestationPath, approval.attestationHash,
  ];
  if (["not-required", "pending"].includes(approval.status)) return evidenceFields.every((value) => value === null);
  return approval.status === "approved"
    && isIsoTimestamp(approval.approvedAt)
    && HASH_PATTERN.test(approval.approvedEnvelopeHash || "")
    && HASH_PATTERN.test(approval.approvalEvidenceHash || "")
    && handoffIdentifier(approval.attestationId)
    && handoffRepositoryPath(approval.attestationPath)
    && HASH_PATTERN.test(approval.attestationHash || "");
}

function handoffLifecycleContract(lifecycle) {
  if (!hasExactKeys(lifecycle, HANDOFF_LIFECYCLE_KEYS) || lifecycle.singleUse !== true) return false;
  if (lifecycle.state === "consumed") {
    return isIsoTimestamp(lifecycle.consumedAt)
      && handoffIdentifier(lifecycle.consumedByReceiptId)
      && lifecycle.revokedAt === null
      && lifecycle.revocationEvidenceHash === null;
  }
  if (!["proposed", "available", "revoked"].includes(lifecycle.state)
    || lifecycle.consumedAt !== null || lifecycle.consumedByReceiptId !== null) return false;
  if (lifecycle.state === "revoked") {
    return isIsoTimestamp(lifecycle.revokedAt) && HASH_PATTERN.test(lifecycle.revocationEvidenceHash || "");
  }
  return lifecycle.revokedAt === null && lifecycle.revocationEvidenceHash === null;
}

function handoffEntryContract(entry, offset) {
  if (!hasExactKeys(entry, HANDOFF_ENTRY_KEYS)
    || entry.sequence !== offset + 1
    || !isIsoTimestamp(entry.recordedAt)
    || !/^CLOVER-\d{4}-\d{2}-\d{2}-\d{3}$/.test(entry.actionId || "")
    || !handoffIdentifier(entry.branchCapsuleId)
    || !HASH_PATTERN.test(entry.branchCapsuleHash || "")
    || !handoffIdentifier(entry.envelopeId)
    || !handoffRepositoryPath(entry.envelopePath)
    || !HASH_PATTERN.test(entry.envelopeHash || "")
    || !handoffLifecycleContract(entry.lifecycle)
    || !handoffOwnerApprovalContract(entry.ownerApproval)
    || !handoffReviewContract(entry.review)
    || (entry.ownerApproval.status === "approved" && entry.ownerApproval.approvedEnvelopeHash !== entry.envelopeHash)) return false;
  if (entry.status === "pending") {
    return ["proposed", "available", "revoked"].includes(entry.lifecycle.state)
      && entry.receiptId === null
      && entry.receiptPath === null
      && entry.receiptHash === null
      && entry.outcome === "pending"
      && entry.review.status === "pending";
  }
  return entry.status === "completed"
    && entry.lifecycle.state === "consumed"
    && handoffIdentifier(entry.receiptId)
    && entry.lifecycle.consumedByReceiptId === entry.receiptId
    && handoffRepositoryPath(entry.receiptPath)
    && HASH_PATTERN.test(entry.receiptHash || "")
    && ["succeeded", "failed-closed", "blocked", "partial"].includes(entry.outcome);
}

function handoffIndexContract(index) {
  if (!hasExactKeys(index, [
    "documentType", "schemaVersion", "indexId", "createdAt", "previousIndexPath", "previousIndexHash", "entries", "indexHash",
  ])
    || index.documentType !== "clover-handoff-action-receipt-index"
    || index.schemaVersion !== "0.1.0"
    || !handoffIdentifier(index.indexId)
    || !isIsoTimestamp(index.createdAt)
    || ((index.previousIndexPath === null) !== (index.previousIndexHash === null))
    || (index.previousIndexPath !== null && (!HANDOFF_INDEX_SNAPSHOT_PATTERN.test(index.previousIndexPath)
      || !HASH_PATTERN.test(index.previousIndexHash || "")))
    || !Array.isArray(index.entries)
    || index.entries.length < 1
    || index.entries.length > 1000
    || !HASH_PATTERN.test(index.indexHash || "")
    || index.indexHash === "0".repeat(64)
    || index.indexHash !== documentSelfHash(index, "indexHash")
    || !index.entries.every(handoffEntryContract)) return false;
  const actionIds = index.entries.map((entry) => entry.actionId);
  const envelopeIds = index.entries.map((entry) => entry.envelopeId);
  return new Set(actionIds).size === actionIds.length && new Set(envelopeIds).size === envelopeIds.length;
}

function handoffDocumentContract(document) {
  return Boolean(document)
    && handoffIndexContract(document.parsed)
    && publicationArtifactSafe(document.raw)
    && publicationStructuredSafe(document.parsed);
}

function handoffImmutableEntryIdentity(entry) {
  return {
    sequence: entry.sequence,
    actionId: entry.actionId,
    branchCapsuleId: entry.branchCapsuleId,
    branchCapsuleHash: entry.branchCapsuleHash,
    envelopeId: entry.envelopeId,
    envelopePath: entry.envelopePath,
    envelopeHash: entry.envelopeHash,
  };
}

function handoffSuccessorContract(current, previous, previousPath) {
  if (!handoffIndexContract(current)
    || !handoffIndexContract(previous)
    || current.previousIndexPath !== previousPath
    || current.previousIndexHash !== previous.indexHash
    || Date.parse(current.createdAt) < Date.parse(previous.createdAt)
    || current.entries.length < previous.entries.length) return false;
  let transitions = 0;
  for (let offset = 0; offset < previous.entries.length; offset += 1) {
    const before = previous.entries[offset];
    const after = current.entries[offset];
    if (canonicalJson(handoffImmutableEntryIdentity(before)) !== canonicalJson(handoffImmutableEntryIdentity(after))) return false;
    if (canonicalJson(before) === canonicalJson(after)) continue;
    transitions += 1;
    const approvalTransition = before.status === "pending" && before.lifecycle.state === "proposed"
      && before.ownerApproval.status === "pending" && after.status === "pending"
      && after.lifecycle.state === "available" && after.ownerApproval.status === "approved"
      && after.receiptId === null && after.review.status === "pending";
    const consumptionTransition = before.status === "pending" && before.lifecycle.state === "available"
      && after.status === "completed" && after.lifecycle.state === "consumed" && after.receiptId !== null;
    const revocationTransition = before.status === "pending" && after.status === "pending"
      && after.lifecycle.state === "revoked" && after.lifecycle.revokedAt !== null
      && after.lifecycle.revocationEvidenceHash !== null && after.receiptId === null;
    const reviewTransition = before.status === "completed" && after.status === "completed"
      && before.lifecycle.state === "consumed" && after.lifecycle.state === "consumed"
      && before.review.status === "pending" && after.review.status === "completed";
    if (!approvalTransition && !consumptionTransition && !revocationTransition && !reviewTransition) return false;
    const stableExcept = (...keys) => {
      const beforeStable = structuredClone(before);
      const afterStable = structuredClone(after);
      for (const key of ["recordedAt", ...keys]) {
        delete beforeStable[key];
        delete afterStable[key];
      }
      return canonicalJson(beforeStable) === canonicalJson(afterStable);
    };
    if (approvalTransition && !stableExcept("lifecycle", "ownerApproval")) return false;
    if (consumptionTransition && !stableExcept("status", "lifecycle", "receiptId", "receiptPath", "receiptHash", "outcome")) return false;
    if (revocationTransition && !stableExcept("lifecycle")) return false;
    if ((consumptionTransition || revocationTransition || reviewTransition)
      && canonicalJson(before.ownerApproval) !== canonicalJson(after.ownerApproval)) return false;
    if (reviewTransition) {
      const beforeStable = structuredClone(before);
      const afterStable = structuredClone(after);
      delete beforeStable.recordedAt;
      delete afterStable.recordedAt;
      delete beforeStable.review;
      delete afterStable.review;
      if (canonicalJson(beforeStable) !== canonicalJson(afterStable)) return false;
    }
  }
  return transitions <= 1
    && current.entries.slice(previous.entries.length).every((entry, offset) => entry.sequence === previous.entries.length + offset + 1);
}

function handoffChainResult(currentDocument, historicalIndexHash) {
  if (!handoffDocumentContract(currentDocument) || !HASH_PATTERN.test(historicalIndexHash || "")) return null;
  const currentSnapshotPath = handoffCurrentSnapshotPath(currentDocument.parsed);
  if (!currentSnapshotPath) return null;
  return { currentSnapshotPath, historicalIndexHash };
}

function resolveHandoffChainSync(currentDocument, historicalIndexHash, loadDocument) {
  const initial = handoffChainResult(currentDocument, historicalIndexHash);
  if (!initial) return null;
  const currentSnapshotDefinition = handoffIndexDocumentDefinition(initial.currentSnapshotPath, "clover://handoff/index/current-snapshot");
  const immutableCurrent = currentSnapshotDefinition ? loadDocument(currentSnapshotDefinition) : null;
  if (!handoffDocumentContract(immutableCurrent) || immutableCurrent.raw !== currentDocument.raw
    || immutableCurrent.parsed?.indexHash !== currentDocument.parsed.indexHash) return null;
  const visitedPaths = new Set();
  const visitedHashes = new Set();
  let current = immutableCurrent;
  let currentPath = initial.currentSnapshotPath;
  let historicalDocument = null;
  let historicalSnapshotPath = null;
  let depth = 0;
  let terminated = false;
  while (depth < 1000) {
    if (!handoffDocumentContract(current) || visitedPaths.has(currentPath) || visitedHashes.has(current.parsed.indexHash)) return null;
    visitedPaths.add(currentPath);
    visitedHashes.add(current.parsed.indexHash);
    depth += 1;
    if (current.parsed.indexHash === historicalIndexHash) {
      if (historicalDocument) return null;
      historicalDocument = current;
      historicalSnapshotPath = currentPath;
    }
    if (current.parsed.previousIndexPath === null) {
      if (handoffIndexSequence(currentPath) !== 1 || current.parsed.previousIndexHash !== null) return null;
      terminated = true;
      break;
    }
    const previousPath = current.parsed.previousIndexPath;
    if (handoffIndexSequence(previousPath) !== handoffIndexSequence(currentPath) - 1) return null;
    const previousDefinition = handoffIndexDocumentDefinition(previousPath);
    const previous = previousDefinition ? loadDocument(previousDefinition) : null;
    if (!previous || !handoffSuccessorContract(current.parsed, previous.parsed, previousPath)) return null;
    current = previous;
    currentPath = previousPath;
  }
  if (!historicalDocument || !terminated) return null;
  if (historicalIndexHash === HISTORICAL_HANDOFF_INDEX_HASH
    && sha256(historicalDocument.raw) !== HISTORICAL_HANDOFF_INDEX_BYTE_HASH) return null;
  return {
    valid: true,
    depth,
    currentDocument,
    currentSnapshotPath: initial.currentSnapshotPath,
    currentIndexHash: currentDocument.parsed.indexHash,
    historicalDocument,
    historicalSnapshotPath,
    historicalIndexHash,
  };
}

async function resolveHandoffChainAsync(currentDocument, historicalIndexHash, loadDocument) {
  const initial = handoffChainResult(currentDocument, historicalIndexHash);
  if (!initial) return null;
  const currentSnapshotDefinition = handoffIndexDocumentDefinition(initial.currentSnapshotPath, "clover://handoff/index/current-snapshot");
  const immutableCurrent = currentSnapshotDefinition ? await loadDocument(currentSnapshotDefinition) : null;
  if (!handoffDocumentContract(immutableCurrent) || immutableCurrent.raw !== currentDocument.raw
    || immutableCurrent.parsed?.indexHash !== currentDocument.parsed.indexHash) return null;
  const visitedPaths = new Set();
  const visitedHashes = new Set();
  let current = immutableCurrent;
  let currentPath = initial.currentSnapshotPath;
  let historicalDocument = null;
  let historicalSnapshotPath = null;
  let depth = 0;
  let terminated = false;
  while (depth < 1000) {
    if (!handoffDocumentContract(current) || visitedPaths.has(currentPath) || visitedHashes.has(current.parsed.indexHash)) return null;
    visitedPaths.add(currentPath);
    visitedHashes.add(current.parsed.indexHash);
    depth += 1;
    if (current.parsed.indexHash === historicalIndexHash) {
      if (historicalDocument) return null;
      historicalDocument = current;
      historicalSnapshotPath = currentPath;
    }
    if (current.parsed.previousIndexPath === null) {
      if (handoffIndexSequence(currentPath) !== 1 || current.parsed.previousIndexHash !== null) return null;
      terminated = true;
      break;
    }
    const previousPath = current.parsed.previousIndexPath;
    if (handoffIndexSequence(previousPath) !== handoffIndexSequence(currentPath) - 1) return null;
    const previousDefinition = handoffIndexDocumentDefinition(previousPath);
    const previous = previousDefinition ? await loadDocument(previousDefinition) : null;
    if (!previous || !handoffSuccessorContract(current.parsed, previous.parsed, previousPath)) return null;
    current = previous;
    currentPath = previousPath;
  }
  if (!historicalDocument || !terminated) return null;
  if (historicalIndexHash === HISTORICAL_HANDOFF_INDEX_HASH
    && sha256(historicalDocument.raw) !== HISTORICAL_HANDOFF_INDEX_BYTE_HASH) return null;
  return {
    valid: true,
    depth,
    currentDocument,
    currentSnapshotPath: initial.currentSnapshotPath,
    currentIndexHash: currentDocument.parsed.indexHash,
    historicalDocument,
    historicalSnapshotPath,
    historicalIndexHash,
  };
}

function projectedHandoffDocument(chain, { historical = false } = {}) {
  if (chain?.valid !== true) return null;
  const document = historical ? chain.historicalDocument : chain.currentDocument;
  const resolvedSnapshotPath = historical ? chain.historicalSnapshotPath : chain.currentSnapshotPath;
  return {
    ...document,
    id: HANDOFF_INDEX_ID,
    title: historical ? "Clover Handoff Ledger Historical Source Binding" : "Clover Handoff Ledger Current Stable Root",
    relativePath: HANDOFF_INDEX_PATH,
    metadata: {
      ...document.metadata,
      relativePath: HANDOFF_INDEX_PATH,
      sourceType: historical ? "validated-historical-handoff-binding" : "validated-current-handoff-root",
      view: historical ? "historical-source-binding" : "current-stable-root",
      resolvedSnapshotPath,
      historicalIndexHash: chain.historicalIndexHash,
      currentSnapshotPath: chain.currentSnapshotPath,
      currentIndexHash: chain.currentIndexHash,
      chainDepth: chain.depth,
      chainVerified: true,
      stableRootByteIdentical: true,
    },
  };
}

function handoffState(definition, document, source = {}) {
  const state = optionalDocumentState(definition, document, source);
  if (document) state.metadata = { ...document.metadata, found: true };
  return state;
}

function documentSelfHash(document, field) {
  if (!document || typeof document !== "object" || Array.isArray(document)) return null;
  const clone = structuredClone(document);
  delete clone[field];
  return sha256(canonicalJson(clone));
}

function hasExactKeys(record, keys) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function publicationArtifactSafe(raw) {
  if (typeof raw !== "string") return false;
  return !/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/-]{8,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}|\/Users\/|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(raw);
}

function publicationStructuredSafe(value) {
  const forbiddenKey = /(password|passwd|secretvalue|plaintextsecret|credentialvalue|privatekey|apikey|accesstoken|refreshtoken|customerrecord|guestrecord|staffrecord|healthrecord|medicalrecord|legalrecord|paymentrecord|transactionrecord|reservationrecord|messagebody|emailaddress|phonenumber|cardnumber|routingnumber|accountnumber|cvv|ssn)/i;
  function visit(item) {
    if (Array.isArray(item)) return item.every(visit);
    if (item && typeof item === "object") {
      return Object.entries(item).every(([key, child]) => !forbiddenKey.test(key.replace(/[^a-z0-9]/gi, "")) && visit(child));
    }
    return true;
  }
  return visit(value);
}

function reviewedImplementationContract(value) {
  return hasExactKeys(value, [
    "repository", "branch", "headCommit", "tree", "directParent", "baseBranch", "baseCommit", "pullRequest",
  ])
    && value.repository === REPOSITORY
    && value.branch === "platform/clover-core-trunk-activation-v0.1-20260820"
    && value.headCommit === REVIEWED_IMPLEMENTATION.headCommit
    && value.tree === REVIEWED_IMPLEMENTATION.tree
    && value.directParent === REVIEWED_IMPLEMENTATION.directParent
    && value.baseBranch === "platform/clover-core-trust-slice-v0.2-20260818"
    && value.baseCommit === REVIEWED_IMPLEMENTATION.baseCommit
    && hasExactKeys(value.pullRequest, ["number", "url", "state", "draft", "merged"])
    && value.pullRequest.number === 17
    && value.pullRequest.url === "https://github.com/chrisdortch/first/pull/17"
    && value.pullRequest.state === "open"
    && value.pullRequest.draft === true
    && value.pullRequest.merged === false;
}

function reviewPointerRecordContract(review, index) {
  const decision = review?.decision;
  const authority = review?.authority;
  const findingIds = Array.isArray(decision?.findings) ? decision.findings.map((finding) => finding?.findingId) : [];
  return hasExactKeys(review, [
    "documentType", "schemaVersion", "reviewPointerId", "recordedAt", "reviewedImplementation",
    "reviewTarget", "reviewEvidence", "decision", "authority", "reviewPointerHash",
  ])
    && Number.isFinite(Date.parse(review.recordedAt))
    && reviewedImplementationContract(review.reviewedImplementation)
    && canonicalJson(review.reviewTarget) === canonicalJson(index.current.sourceBoundReceipt)
    && hasExactKeys(review.reviewEvidence, ["reviewPrompt", "finalReport"])
    && canonicalJson(review.reviewEvidence.reviewPrompt) === canonicalJson(index.current.reviewPrompt)
    && canonicalJson(review.reviewEvidence.finalReport) === canonicalJson(index.current.finalReport)
    && hasExactKeys(decision, [
      "verdict", "assurance", "bindingApproval", "source", "decisionEvidenceStatus", "evidencePath",
      "evidenceHash", "findingsNormalization", "findings",
    ])
    && decision.verdict === "AMEND"
    && decision.assurance === "owner-provided-noncryptographic-independent-review"
    && decision.bindingApproval === false
    && decision.source === "owner-provided-chatgpt-personal-pro-output"
    && decision.decisionEvidenceStatus === "owner-reported-in-chat-not-preserved"
    && decision.evidencePath === null
    && decision.evidenceHash === null
    && decision.findingsNormalization === "normalized-summary"
    && findingIds.length === 2
    && new Set(findingIds).size === 2
    && findingIds.includes("external-only-final-evidence")
    && findingIds.includes("committed-prepublication-staleness")
    && decision.findings.every((finding) => hasExactKeys(finding, ["findingId", "summary"])
      && typeof finding.summary === "string" && finding.summary.length > 0)
    && hasExactKeys(authority, ["mergeApproved", "productionApproved", "action002Approved"])
    && authority.mergeApproved === false
    && authority.productionApproved === false
    && authority.action002Approved === false;
}

function pendingActionBinding(readback, today, handoff) {
  const action = readback?.action002;
  const matches = handoff?.entries?.filter((entry) => entry?.actionId === action?.actionId
    && entry?.envelopeHash === action?.envelopeHash
    && entry?.status === "pending"
    && entry?.outcome === "pending"
    && entry?.lifecycle?.state === "proposed"
    && entry?.lifecycle?.singleUse === true
    && entry?.lifecycle?.consumedAt === null
    && entry?.lifecycle?.consumedByReceiptId === null
    && entry?.lifecycle?.revokedAt === null
    && entry?.lifecycle?.revocationEvidenceHash === null
    && entry?.ownerApproval?.status === "pending"
    && entry?.receiptId === null
    && entry?.receiptPath === null
    && entry?.receiptHash === null) || [];
  return hasExactKeys(action, [
    "actionId", "envelopeHash", "indexHash", "status", "lifecycleState", "ownerApprovalStatus", "consumed", "revoked",
  ])
    && action.actionId === today?.actionId
    && action.envelopeHash === today?.envelopeHash
    && action.indexHash === handoff?.indexHash
    && action.status === "pending"
    && action.lifecycleState === "proposed"
    && action.ownerApprovalStatus === "pending"
    && action.consumed === false
    && action.revoked === false
    && matches.length === 1;
}

function publicationReadbackShapeContract(readback, index) {
  const issuance = readback?.mirroredIssuanceArtifacts;
  const scope = issuance?.changedPathAllowlistScope;
  const github = readback?.github;
  const vercel = readback?.vercel;
  const bindings = readback?.sourceBindings;
  const precedence = readback?.precedence;
  const supersedes = precedence?.supersedes;
  const container = readback?.containerBinding;
  const expectedWorkflows = new Set([
    "Validate Clover master plan",
    "Validate Clover Context Gateway",
    "Validate Clover Core Candidate",
  ]);
  return hasExactKeys(readback, [
    "documentType", "schemaVersion", "readbackId", "observedAt", "evidenceStatus", "verdict",
    "reviewedImplementation", "mirroredIssuanceArtifacts", "reviewPointer", "github", "vercel",
    "sourceBindings", "action002", "precedence", "containerBinding", "publicationReadbackHash",
  ])
    && readback.documentType === "clover-core-publication-readback"
    && readback.schemaVersion === "0.1.0"
    && readback.readbackId === index.current.publicationReadback.recordId
    && Number.isFinite(Date.parse(readback.observedAt))
    && readback.evidenceStatus === "current-for-reviewed-implementation-head"
    && readback.verdict === "AMEND"
    && hasExactKeys(issuance, ["finalReport", "sourceBoundReceipt", "reviewPrompt", "changedPathAllowlistScope"])
    && hasExactKeys(scope, ["repository", "baseCommit", "reviewedHeadCommit", "changedPathCount", "status"])
    && scope.repository === REPOSITORY
    && scope.baseCommit === REVIEWED_IMPLEMENTATION.baseCommit
    && scope.reviewedHeadCommit === REVIEWED_IMPLEMENTATION.headCommit
    && scope.changedPathCount === 62
    && scope.status === "exactly-matches-mirrored-receipt-and-reviewed-head-diff"
    && hasExactKeys(github, ["observedAt", "sourceCommit", "workflows"])
    && Number.isFinite(Date.parse(github.observedAt))
    && Array.isArray(github.workflows)
    && github.workflows.length === 3
    && new Set(github.workflows.map((workflow) => workflow?.name)).size === 3
    && github.workflows.every((workflow) => hasExactKeys(workflow, ["name", "runId", "conclusion", "jobs", "artifacts"])
      && expectedWorkflows.has(workflow.name)
      && Number.isInteger(workflow.runId) && workflow.runId > 0
      && workflow.conclusion === "success"
      && Array.isArray(workflow.jobs) && workflow.jobs.length >= 1 && workflow.jobs.length <= 2
      && workflow.jobs.every((job) => hasExactKeys(job, ["jobId", "node", "conclusion"])
        && Number.isInteger(job.jobId) && job.jobId > 0
        && (job.node === null || Number.isInteger(job.node))
        && job.conclusion === "success")
      && Array.isArray(workflow.artifacts) && workflow.artifacts.length <= 2
      && workflow.artifacts.every((artifact) => hasExactKeys(artifact, ["artifactId", "node", "sha256", "expiresAt"])
        && Number.isInteger(artifact.artifactId) && artifact.artifactId > 0
        && Number.isInteger(artifact.node)
        && /^[a-f0-9]{64}$/.test(artifact.sha256 || "")
        && Number.isFinite(Date.parse(artifact.expiresAt))))
    && hasExactKeys(vercel, [
      "observedAt", "deploymentId", "immutableUrl", "projectId", "sourceCommit", "sourceRef",
      "sourceType", "state", "target", "aliases", "gatewayVersion", "mode", "writeToolsEnabled",
      "standingProductionAuthority",
    ])
    && Number.isFinite(Date.parse(vercel.observedAt))
    && /^dpl_[A-Za-z0-9]+$/.test(vercel.deploymentId || "")
    && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(vercel.immutableUrl || "")
    && /^prj_[A-Za-z0-9]+$/.test(vercel.projectId || "")
    && vercel.gatewayVersion === "0.3.1"
    && hasExactKeys(bindings, ["today", "status", "handoffIndex"])
    && Object.values(bindings).every((binding) => hasExactKeys(binding, ["path", "hash"])
      && typeof binding.path === "string" && binding.path.length > 0
      && /^[a-f0-9]{64}$/.test(binding.hash || ""))
    && hasExactKeys(precedence, ["scope", "supersedes", "doesNotSupersede"])
    && Array.isArray(supersedes) && supersedes.length === 1
    && hasExactKeys(supersedes[0], ["path", "hash", "claimScope", "reason"])
    && typeof supersedes[0].reason === "string" && supersedes[0].reason.length > 0
    && hasExactKeys(container, ["status", "commit", "tree", "reviewedImplementationRelation", "recordingRule"])
    && container.reviewedImplementationRelation === PUBLICATION_CONTAINER_RELATION
    && container.recordingRule === PUBLICATION_CONTAINER_RECORDING_RULE
    && /^[a-f0-9]{64}$/.test(readback.publicationReadbackHash || "")
    && publicationStructuredSafe(readback);
}

function publicationCatalogContract(index, documents, sources) {
  const review = documents?.reviewPointer?.parsed;
  const readback = documents?.publicationReadback?.parsed;
  const today = sources?.today?.parsed;
  const status = sources?.candidateStatus?.parsed;
  const handoff = sources?.handoff?.parsed;
  const handoffChain = sources?.handoffChain;
  const protectedScopes = ["owner-authority", "handoff-lifecycle", "production-state", "historical-records"];
  if (!reviewPointerRecordContract(review, index)
    || !publicationReadbackShapeContract(readback, index)
    || !reviewedImplementationContract(readback?.reviewedImplementation)
    || index.reviewedImplementationHead !== readback.reviewedImplementation.headCommit
    || canonicalJson(readback?.reviewPointer) !== canonicalJson(index.current.reviewPointer)
    || canonicalJson(readback?.mirroredIssuanceArtifacts?.finalReport) !== canonicalJson(index.current.finalReport)
    || canonicalJson(readback?.mirroredIssuanceArtifacts?.sourceBoundReceipt) !== canonicalJson(index.current.sourceBoundReceipt)
    || canonicalJson(readback?.mirroredIssuanceArtifacts?.reviewPrompt) !== canonicalJson(index.current.reviewPrompt)
    || readback?.github?.sourceCommit !== REVIEWED_IMPLEMENTATION.headCommit
    || !Array.isArray(readback.github.workflows)
    || readback.github.workflows.length !== 3
    || !readback.github.workflows.every((workflow) => workflow?.conclusion === "success"
      && Array.isArray(workflow.jobs) && workflow.jobs.every((job) => job?.conclusion === "success"))
    || readback?.vercel?.sourceCommit !== REVIEWED_IMPLEMENTATION.headCommit
    || readback.vercel.sourceRef !== "platform/clover-core-trunk-activation-v0.1-20260820"
    || readback.vercel.sourceType !== "cli"
    || readback.vercel.state !== "READY"
    || readback.vercel.target !== null
    || !Array.isArray(readback.vercel.aliases)
    || readback.vercel.aliases.length !== 0
    || readback.vercel.mode !== "read-only"
    || readback.vercel.writeToolsEnabled !== false
    || readback.vercel.standingProductionAuthority !== false
    || readback?.sourceBindings?.today?.path !== sources.today.relativePath
    || readback.sourceBindings.today.hash !== today?.sessionHash
    || readback?.sourceBindings?.status?.path !== sources.candidateStatus.relativePath
    || readback.sourceBindings.status.hash !== String(status?.statusHash || "").replace(/^sha256:/, "")
    || handoffChain?.valid !== true
    || sources?.handoff?.relativePath !== HANDOFF_INDEX_PATH
    || readback?.sourceBindings?.handoffIndex?.path !== HANDOFF_INDEX_PATH
    || readback.sourceBindings.handoffIndex.hash !== handoffChain.historicalIndexHash
    || handoff?.indexHash !== handoffChain.historicalIndexHash
    || today?.handoffIndexPath !== handoffChain.historicalSnapshotPath
    || today?.handoffIndexHash !== handoffChain.historicalIndexHash
    || !pendingActionBinding(readback, today, handoff)
    || readback?.precedence?.scope !== "publication-readback-only"
    || !Array.isArray(readback.precedence.supersedes)
    || readback.precedence.supersedes.length !== 1
    || readback.precedence.supersedes[0]?.path !== sources.today.relativePath
    || readback.precedence.supersedes[0]?.hash !== today?.sessionHash
    || readback.precedence.supersedes[0]?.claimScope !== "exact-head-ci-and-gateway-preview-readback"
    || !Array.isArray(readback.precedence.doesNotSupersede)
    || readback.precedence.doesNotSupersede.length !== protectedScopes.length
    || !protectedScopes.every((scope) => readback.precedence.doesNotSupersede.includes(scope))
    || readback?.containerBinding?.status !== "pending-external-publication-receipt"
    || readback.containerBinding.commit !== null
    || readback.containerBinding.tree !== null) return false;
  return true;
}

function publicationPointerContract(pointer, config) {
  const pathMatch = PUBLICATION_ARTIFACT_PATH_PATTERN.exec(pointer?.path || "");
  const expectedArea = config.hashMode === "sha256-bytes" ? "mirrors" : "records";
  const expectedExtension = config.mediaType === "application/json" ? ".json" : ".md";
  return hasExactKeys(pointer, ["artifactType", "recordId", "path", "hash", "hashMode", "mediaType"])
    && pointer.artifactType === config.artifactType
    && typeof pointer.recordId === "string"
    && pointer.recordId.length > 0
    && pointer.recordId.length <= 180
    && pathMatch?.[2] === expectedArea
    && pathMatch?.[3].endsWith(expectedExtension)
    && /^[a-f0-9]{64}$/.test(pointer.hash || "")
    && pointer.hashMode === config.hashMode
    && pointer.mediaType === config.mediaType;
}

function publicationIndexContract(index) {
  if (!hasExactKeys(index, [
    "documentType", "schemaVersion", "indexId", "updatedAt", "reviewedImplementationHead",
    "lifecycle", "current", "connectorIds", "entries", "publicationIndexHash",
  ])
    || index.documentType !== "clover-core-publication-index"
    || index.schemaVersion !== "0.1.0"
    || index.indexId !== "core-publication-index:2026-08-20"
    || !Number.isFinite(Date.parse(index.updatedAt))
    || !FULL_COMMIT_PATTERN.test(index.reviewedImplementationHead || "")
    || !hasExactKeys(index.lifecycle, [
      "mode", "sequence", "stableRootPath", "immutableSnapshotPath", "previousIndexPath",
      "previousIndexHash", "immutableRecordPolicy",
    ])
    || index.lifecycle.mode !== "append-only-records-with-advancing-root-pointer"
    || !Number.isInteger(index.lifecycle.sequence)
    || index.lifecycle.sequence < 1
    || index.lifecycle.stableRootPath !== PUBLICATION_INDEX_PATH
    || !PUBLICATION_INDEX_SNAPSHOT_PATTERN.test(index.lifecycle.immutableSnapshotPath || "")
    || PUBLICATION_INDEX_SNAPSHOT_PATTERN.exec(index.lifecycle.immutableSnapshotPath)?.[2] !== String(index.lifecycle.sequence).padStart(4, "0")
    || index.lifecycle.immutableRecordPolicy !== PUBLICATION_IMMUTABLE_RECORD_POLICY
    || (index.lifecycle.sequence === 1
      ? index.lifecycle.previousIndexPath !== null || index.lifecycle.previousIndexHash !== null
      : !PUBLICATION_INDEX_SNAPSHOT_PATTERN.test(index.lifecycle.previousIndexPath || "") || !/^[a-f0-9]{64}$/.test(index.lifecycle.previousIndexHash || ""))
    || !hasExactKeys(index.current, Object.keys(PUBLICATION_ARTIFACTS))
    || !hasExactKeys(index.connectorIds, Object.values(PUBLICATION_ARTIFACTS).map((config) => config.id))
    || !Array.isArray(index.entries)
    || index.entries.length < Object.keys(PUBLICATION_ARTIFACTS).length
    || !/^[a-f0-9]{64}$/.test(index.publicationIndexHash || "")
    || index.publicationIndexHash === "0".repeat(64)
    || index.publicationIndexHash !== documentSelfHash(index, "publicationIndexHash")) return false;

  const uniquePaths = new Set();
  const uniqueRecordIds = new Set();
  for (const [offset, entry] of index.entries.entries()) {
    const config = Object.values(PUBLICATION_ARTIFACTS).find((item) => item.artifactType === entry?.artifactType);
    if (!hasExactKeys(entry, [
      "sequence", "artifactType", "recordId", "path", "hash", "hashMode", "mediaType", "recordedAt", "status",
    ])
      || !config
      || entry.sequence !== offset + 1
      || !publicationPointerContract({
        artifactType: entry.artifactType,
        recordId: entry.recordId,
        path: entry.path,
        hash: entry.hash,
        hashMode: entry.hashMode,
        mediaType: entry.mediaType,
      }, config)
      || !Number.isFinite(Date.parse(entry.recordedAt))
      || !["current", "superseded"].includes(entry.status)
      || uniquePaths.has(entry.path)
      || uniqueRecordIds.has(entry.recordId)) return false;
    uniquePaths.add(entry.path);
    uniqueRecordIds.add(entry.recordId);
  }

  return Object.entries(PUBLICATION_ARTIFACTS).every(([key, config]) => {
    const pointer = index.current[key];
    if (!publicationPointerContract(pointer, config)) return false;
    if (canonicalJson(index.connectorIds[config.id]) !== canonicalJson(pointer)) return false;
    if (index.entries.filter((entry) => entry.status === "current" && entry.artifactType === config.artifactType).length !== 1) return false;
    const matches = index.entries.filter((entry) => entry.status === "current"
      && entry.artifactType === pointer.artifactType
      && entry.recordId === pointer.recordId
      && entry.path === pointer.path
      && entry.hash === pointer.hash
      && entry.hashMode === pointer.hashMode
      && entry.mediaType === pointer.mediaType);
    return matches.length === 1;
  });
}

function publicationArtifactDefinition(pointer, config) {
  if (!publicationPointerContract(pointer, config)) return null;
  return {
    id: config.id,
    title: config.title,
    relativePath: pointer.path,
    kind: config.kind,
    optional: true,
    exactBytes: true,
    keywords: "publication finalization readback exact source github ci vercel preview receipt independent review verified",
  };
}

function publicationDocuments(bundle) {
  if (bundle?.indexValid !== true) return [];
  const documents = [{
    ...bundle.indexDocument,
    exactBytes: true,
    metadata: {
      ...bundle.indexDocument.metadata,
      found: true,
      hashVerified: true,
      contentHash: bundle.indexDocument.parsed.publicationIndexHash,
      hashMode: "sha256-canonical-without-self-hash-field",
      immutableSnapshotPath: bundle.indexDocument.parsed.lifecycle.immutableSnapshotPath,
      immutableSnapshotByteIdentical: true,
      chainVerified: bundle.chainVerified === true,
      ancestorArtifactsVerified: bundle.ancestorArtifactsVerified === true,
    },
  }];
  for (const [key, config] of Object.entries(PUBLICATION_ARTIFACTS)) {
    const document = bundle.documents?.[key];
    const pointer = bundle.indexDocument.parsed.current[key];
    if (publicationArtifactMatches(document, pointer, config)) {
      documents.push({
        ...document,
        exactBytes: true,
        metadata: {
          ...document.metadata,
          sourceType: "validated-publication-artifact",
          found: true,
          hashVerified: true,
          contentHash: pointer.hash,
          hashMode: pointer.hashMode,
          mediaType: pointer.mediaType,
          artifactType: pointer.artifactType,
          recordId: pointer.recordId,
        },
      });
    }
  }
  return documents;
}

function publicDocumentResponse(document) {
  if (!document) return null;
  const exactBytes = document.exactBytes === true || document.id === PUBLICATION_INDEX_ID;
  return {
    id: document.id,
    title: document.title,
    text: exactBytes ? document.raw : document.text,
    url: document.url,
    metadata: document.metadata,
  };
}

function publicationIndexSnapshotDefinition(index) {
  const relativePath = index?.lifecycle?.immutableSnapshotPath;
  return publicationIndexDocumentDefinition(relativePath, "clover://publication/index/immutable");
}

function publicationIndexDocumentDefinition(relativePath, id = "clover://publication/index/previous") {
  if (!PUBLICATION_INDEX_SNAPSHOT_PATTERN.test(relativePath || "")) return null;
  return {
    id,
    title: "Immutable Clover Core Publication Index Snapshot",
    relativePath,
    kind: "json",
    optional: true,
  };
}

function publicationSuccessorContract(current, previous) {
  const currentLifecycle = current?.lifecycle;
  const previousLifecycle = previous?.lifecycle;
  return publicationIndexContract(previous)
    && currentLifecycle.sequence === previousLifecycle.sequence + 1
    && currentLifecycle.previousIndexPath === previousLifecycle.immutableSnapshotPath
    && currentLifecycle.previousIndexHash === previous.publicationIndexHash
    && current.reviewedImplementationHead === previous.reviewedImplementationHead
    && Date.parse(current.updatedAt) >= Date.parse(previous.updatedAt)
    && current.entries.length > previous.entries.length
    && previous.entries.every((previousEntry, offset) => {
      const currentEntry = current.entries[offset];
      if (!hasExactKeys(currentEntry, Object.keys(previousEntry))) return false;
      const previousWithoutStatus = { ...previousEntry };
      const currentWithoutStatus = { ...currentEntry };
      delete previousWithoutStatus.status;
      delete currentWithoutStatus.status;
      const statusPreserved = currentEntry.status === previousEntry.status;
      const statusNarrowed = previousEntry.status === "current" && currentEntry.status === "superseded";
      return canonicalJson(currentWithoutStatus) === canonicalJson(previousWithoutStatus)
        && (statusPreserved || statusNarrowed);
    });
}

function publicationChainValidSync(index, loadDocument) {
  let current = index;
  while (true) {
    if (!publicationEntriesValidSync(current, loadDocument)) return false;
    if (current.lifecycle.sequence === 1) {
      return current.lifecycle.previousIndexPath === null && current.lifecycle.previousIndexHash === null;
    }
    const definition = publicationIndexDocumentDefinition(current.lifecycle.previousIndexPath);
    const previousDocument = definition ? loadDocument(definition) : null;
    if (!previousDocument || !publicationSuccessorContract(current, previousDocument.parsed)) return false;
    current = previousDocument.parsed;
  }
}

async function publicationChainValidAsync(index, loadDocument) {
  let current = index;
  while (true) {
    if (!await publicationEntriesValidAsync(current, loadDocument)) return false;
    if (current.lifecycle.sequence === 1) {
      return current.lifecycle.previousIndexPath === null && current.lifecycle.previousIndexHash === null;
    }
    const definition = publicationIndexDocumentDefinition(current.lifecycle.previousIndexPath);
    const previousDocument = definition ? await loadDocument(definition) : null;
    if (!previousDocument || !publicationSuccessorContract(current, previousDocument.parsed)) return false;
    current = previousDocument.parsed;
  }
}

function publicationEntriesValidSync(index, loadDocument) {
  return index.entries.every((entry) => {
    const config = Object.values(PUBLICATION_ARTIFACTS).find((item) => item.artifactType === entry.artifactType);
    const pointer = config ? {
      artifactType: entry.artifactType,
      recordId: entry.recordId,
      path: entry.path,
      hash: entry.hash,
      hashMode: entry.hashMode,
      mediaType: entry.mediaType,
    } : null;
    const definition = pointer ? publicationArtifactDefinition(pointer, config) : null;
    const document = definition ? loadDocument(definition) : null;
    return Boolean(config && document && publicationArtifactMatches(document, pointer, config));
  });
}

async function publicationEntriesValidAsync(index, loadDocument) {
  const checks = await Promise.all(index.entries.map(async (entry) => {
    const config = Object.values(PUBLICATION_ARTIFACTS).find((item) => item.artifactType === entry.artifactType);
    const pointer = config ? {
      artifactType: entry.artifactType,
      recordId: entry.recordId,
      path: entry.path,
      hash: entry.hash,
      hashMode: entry.hashMode,
      mediaType: entry.mediaType,
    } : null;
    const definition = pointer ? publicationArtifactDefinition(pointer, config) : null;
    const document = definition ? await loadDocument(definition) : null;
    return Boolean(config && document && publicationArtifactMatches(document, pointer, config));
  }));
  return checks.every(Boolean);
}

function publicationArtifactMatches(document, pointer, config) {
  if (!document || document.metadata?.relativePath !== pointer.path || !publicationArtifactSafe(document.raw)) return false;
  if (config.hashMode === "sha256-bytes") return sha256(document.raw) === pointer.hash;
  return document.parsed?.documentType === config.documentType
    && document.parsed?.schemaVersion === "0.1.0"
    && document.parsed?.[config.recordIdField] === pointer.recordId
    && publicationStructuredSafe(document.parsed)
    && document.parsed?.[config.selfHashField] === pointer.hash
    && documentSelfHash(document.parsed, config.selfHashField) === pointer.hash;
}

function verifiedPublicationState(config, document, pointer, source = {}, { includeData = false } = {}) {
  const available = Boolean(document && pointer && publicationArtifactMatches(document, pointer, config));
  return {
    id: config.id,
    available,
    data: available && includeData ? (document.parsed ?? document.raw) : null,
    url: available ? document.url : null,
    metadata: {
      repository: source.repository || REPOSITORY,
      ref: source.ref ?? null,
      commit: source.commit ?? null,
      relativePath: pointer?.path || null,
      sourceType: "validated-publication-artifact",
      found: Boolean(document),
      hashVerified: available,
      contentHash: available ? pointer.hash : null,
      hashMode: pointer?.hashMode || null,
      mediaType: pointer?.mediaType || null,
      artifactType: pointer?.artifactType || null,
      recordId: pointer?.recordId || null,
    },
  };
}

function publicationReadbackState(bundle, source = {}) {
  const indexAvailable = bundle?.indexValid === true;
  const index = indexAvailable
    ? optionalDocumentState(bundle.indexDefinition, bundle.indexDocument, source)
    : optionalDocumentState(bundle?.indexDefinition || CORE_DOCUMENTS.find((item) => item.id === PUBLICATION_INDEX_ID), null, source);
  if (indexAvailable) {
    index.metadata.hashVerified = true;
    index.metadata.contentHash = bundle.indexDocument.parsed.publicationIndexHash;
    index.metadata.hashMode = "sha256-canonical-without-self-hash-field";
    index.metadata.immutableSnapshotPath = bundle.indexDocument.parsed.lifecycle.immutableSnapshotPath;
    index.metadata.immutableSnapshotByteIdentical = true;
    index.metadata.chainVerified = bundle.chainVerified === true;
    index.metadata.ancestorArtifactsVerified = bundle.ancestorArtifactsVerified === true;
  }
  const states = Object.fromEntries(Object.entries(PUBLICATION_ARTIFACTS).map(([key, config]) => [
    key,
    verifiedPublicationState(
      config,
      bundle?.documents?.[key] || null,
      indexAvailable ? bundle.indexDocument.parsed.current[key] : null,
      source,
      { includeData: key === "publicationReadback" || key === "reviewPointer" },
    ),
  ]));
  const complete = indexAvailable && Object.values(states).every((state) => state.available === true);
  const readback = states.publicationReadback;
  return {
    ...readback,
    available: complete,
    data: complete ? readback.data : null,
    url: complete ? readback.url : null,
    metadata: {
      ...readback.metadata,
      found: Boolean(bundle?.documents?.publicationReadback),
      hashVerified: complete,
    },
    index,
    artifacts: {
      report: states.finalReport,
      receipt: states.sourceBoundReceipt,
      reviewPrompt: states.reviewPrompt,
      reviewDecision: states.reviewPointer,
    },
  };
}

export function createContextStore({ root, sourceRef = DEFAULT_REF, sourceCommit = null } = {}) {
  if (!root) throw new Error("A context root is required.");
  const resolvedRoot = path.resolve(root);
  const realRoot = fs.realpathSync(resolvedRoot);

  function safeLocalPath(relativePath) {
    const absolutePath = path.resolve(resolvedRoot, relativePath);
    if (absolutePath !== resolvedRoot && !absolutePath.startsWith(`${resolvedRoot}${path.sep}`)) return null;
    if (!fs.existsSync(absolutePath)) return null;
    let cursor = resolvedRoot;
    for (const segment of path.relative(resolvedRoot, absolutePath).split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, segment);
      if (fs.lstatSync(cursor).isSymbolicLink()) return null;
    }
    const realPath = fs.realpathSync(absolutePath);
    if (realPath !== realRoot && !realPath.startsWith(`${realRoot}${path.sep}`)) return null;
    return absolutePath;
  }

  function loadDocument(definition) {
    const absolutePath = safeLocalPath(definition.relativePath);
    if (!absolutePath) return null;
    const raw = readUtf8(absolutePath);
    let parsed = null;
    try {
      parsed = definition.kind === "json" ? JSON.parse(raw) : null;
    } catch (error) {
      if (definition.optional === true) return null;
      throw error;
    }
    return {
      ...definition,
      raw,
      text: definition.kind === "json" ? JSON.stringify(parsed, null, 2) : raw,
      parsed,
      searchText: `${definition.keywords || ""} ${raw}`,
      url: canonicalUrl(definition.relativePath, sourceCommit || sourceRef),
      metadata: {
        repository: REPOSITORY,
        ref: sourceRef,
        commit: sourceCommit,
        relativePath: definition.relativePath,
        sourceType: "canonical-repository",
      },
    };
  }

  function loadProjects() {
    const registry = loadDocument(CORE_DOCUMENTS.find((item) => item.id === "clover://projects"));
    const projects = registry?.parsed?.projects;
    return Array.isArray(projects) ? projects : [];
  }

  function loadPublicationCurrent() {
    const indexDefinition = CORE_DOCUMENTS.find((item) => item.id === PUBLICATION_INDEX_ID);
    const indexDocument = loadDocument(indexDefinition);
    if (!indexDocument || !publicationIndexContract(indexDocument.parsed)) {
      return { indexDefinition, indexDocument, immutableIndexDocument: null, indexValid: false, chainVerified: false, documents: {} };
    }
    const immutableDefinition = publicationIndexSnapshotDefinition(indexDocument.parsed);
    const immutableIndexDocument = immutableDefinition ? loadDocument(immutableDefinition) : null;
    const byteIdentical = Boolean(immutableIndexDocument && immutableIndexDocument.raw === indexDocument.raw);
    const chainVerified = byteIdentical && publicationChainValidSync(indexDocument.parsed, loadDocument);
    const ancestorArtifactsVerified = byteIdentical && chainVerified;
    const indexValid = byteIdentical && chainVerified && ancestorArtifactsVerified;
    if (!indexValid) return { indexDefinition, indexDocument, immutableIndexDocument, indexValid: false, chainVerified, ancestorArtifactsVerified, documents: {} };
    const documents = Object.fromEntries(Object.entries(PUBLICATION_ARTIFACTS).map(([key, config]) => {
      const definition = publicationArtifactDefinition(indexDocument.parsed.current[key], config);
      return [key, definition ? loadDocument(definition) : null];
    }));
    const sources = Object.fromEntries(["today", "candidateStatus"].map((key) => {
      const definition = CORE_DOCUMENTS.find((item) => item.id === SNAPSHOT_DOCUMENTS[key]);
      return [key, definition ? loadDocument(definition) : null];
    }));
    const handoffDefinition = CORE_DOCUMENTS.find((item) => item.id === HANDOFF_INDEX_ID);
    const currentHandoffDocument = loadDocument(handoffDefinition);
    const historicalIndexHash = documents.publicationReadback?.parsed?.sourceBindings?.handoffIndex?.hash;
    const handoffChain = resolveHandoffChainSync(currentHandoffDocument, historicalIndexHash, loadDocument);
    sources.handoff = projectedHandoffDocument(handoffChain, { historical: true });
    sources.handoffChain = handoffChain;
    const catalogValid = publicationCatalogContract(indexDocument.parsed, documents, sources);
    if (!catalogValid) return { indexDefinition, indexDocument, immutableIndexDocument, indexValid: false, chainVerified, ancestorArtifactsVerified, catalogValid, documents, handoffChain };
    return { indexDefinition, indexDocument, immutableIndexDocument, indexValid, chainVerified, ancestorArtifactsVerified, catalogValid, documents, handoffChain };
  }

  function allDocuments() {
    const publication = loadPublicationCurrent();
    return [
      ...CORE_DOCUMENTS.filter((item) => item.id !== PUBLICATION_INDEX_ID).map(loadDocument).filter(Boolean),
      ...publicationDocuments(publication),
      ...loadProjects().map((project) => projectDocument(project, sourceRef, sourceCommit)),
    ];
  }

  function search(query, limit = 10) {
    return rankDocuments(allDocuments(), query, limit);
  }

  function fetchItem(id) {
    const document = allDocuments().find((item) => item.id === id);
    return publicDocumentResponse(document);
  }

  function snapshot() {
    const status = fetchItem("clover://status/current")?.text;
    const pointer = fetchItem("clover://master-pointer")?.text;
    const projects = loadProjects();
    const source = { repository: REPOSITORY, ref: sourceRef, commit: sourceCommit, mode: "local" };
    const optional = Object.fromEntries(Object.entries(SNAPSHOT_DOCUMENTS).filter(([key]) => key !== "handoff").map(([key, id]) => {
      const definition = CORE_DOCUMENTS.find((item) => item.id === id);
      return [key, optionalDocumentState(definition, loadDocument(definition), source)];
    }));
    const handoffDefinition = CORE_DOCUMENTS.find((item) => item.id === HANDOFF_INDEX_ID);
    const currentHandoffDocument = loadDocument(handoffDefinition);
    let handoffChain = resolveHandoffChainSync(currentHandoffDocument, optional.today?.data?.handoffIndexHash, loadDocument);
    if (handoffChain && optional.today?.data?.handoffIndexPath !== handoffChain.historicalSnapshotPath) handoffChain = null;
    const handoff = handoffState(handoffDefinition, projectedHandoffDocument(handoffChain, { historical: true }), source);
    const currentHandoff = handoffState(handoffDefinition, projectedHandoffDocument(handoffChain), source);
    const publication = loadPublicationCurrent();
    return {
      status: status ? JSON.parse(status) : null,
      pointer: pointer ? JSON.parse(pointer) : null,
      projects,
      source,
      ...optional,
      handoff,
      currentHandoff,
      publicationReadback: publicationReadbackState(publication, source),
    };
  }

  return { search, fetch: fetchItem, snapshot, loadProjects, allDocuments, mode: "local" };
}

export function createGitHubContextStore({
  repository = REPOSITORY,
  sourceRef = DEFAULT_REF,
  fetchImpl = globalThis.fetch,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  token = process.env.CONTEXT_GITHUB_TOKEN || "",
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required for GitHub context mode.");
  const cache = new Map();
  let commitCache = null;
  let commitLoad = null;

  function headers(accept = "text/plain") {
    return {
      accept,
      "user-agent": "clover-context-gateway/0.3.1",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
  }

  async function cached(key, loader) {
    const now = Date.now();
    const existing = cache.get(key);
    if (existing && existing.expiresAt > now) return existing.value;
    const value = await loader();
    cache.set(key, { value, expiresAt: now + cacheTtlMs });
    return value;
  }

  async function sourceIdentity() {
    if (commitCache && commitCache.expiresAt > Date.now()) return commitCache.value;
    if (commitLoad) return commitLoad;
    commitLoad = (async () => {
      const response = await fetchImpl(`https://api.github.com/repos/${repository}/commits/${encodeURIComponent(sourceRef)}`, {
        headers: headers("application/vnd.github+json"),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Canonical source identity fetch failed: HTTP ${response.status}`);
      const commit = (await response.json())?.sha || null;
      if (!/^[a-f0-9]{40}$/.test(commit || "")) {
        throw new Error("Canonical source identity did not resolve to a full Git commit SHA.");
      }
      const value = { repository, ref: sourceRef, commit, mode: "github" };
      commitCache = { value, expiresAt: Date.now() + cacheTtlMs };
      return value;
    })();
    try {
      return await commitLoad;
    } finally {
      commitLoad = null;
    }
  }

  async function loadDocument(definition) {
    const source = await sourceIdentity();
    return cached(`document:${source.commit}:${definition.relativePath}`, async () => {
      const response = await fetchImpl(`https://raw.githubusercontent.com/${repository}/${source.commit}/${definition.relativePath}`, {
        headers: headers("text/plain"),
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        if (definition.optional === true) return null;
        throw new Error(`Canonical context fetch failed for ${definition.relativePath}: HTTP ${response.status}`);
      }
      const raw = await response.text();
      let parsed = null;
      try {
        parsed = definition.kind === "json" ? JSON.parse(raw) : null;
      } catch (error) {
        if (definition.optional === true) return null;
        throw error;
      }
      return {
        ...definition,
        raw,
        text: definition.kind === "json" ? JSON.stringify(parsed, null, 2) : raw,
        parsed,
        searchText: `${definition.keywords || ""} ${raw}`,
        url: `https://github.com/${repository}/blob/${source.commit}/${definition.relativePath}`,
        metadata: {
          repository,
          ref: sourceRef,
          commit: source.commit,
          relativePath: definition.relativePath,
          sourceType: "canonical-repository-remote",
        },
      };
    });
  }

  async function loadProjects() {
    const registry = await loadDocument(CORE_DOCUMENTS.find((item) => item.id === "clover://projects"));
    const projects = registry?.parsed?.projects;
    return Array.isArray(projects) ? projects : [];
  }

  async function loadPublicationCurrent() {
    const indexDefinition = CORE_DOCUMENTS.find((item) => item.id === PUBLICATION_INDEX_ID);
    const indexDocument = await loadDocument(indexDefinition);
    if (!indexDocument || !publicationIndexContract(indexDocument.parsed)) {
      return { indexDefinition, indexDocument, immutableIndexDocument: null, indexValid: false, chainVerified: false, documents: {} };
    }
    const immutableDefinition = publicationIndexSnapshotDefinition(indexDocument.parsed);
    const immutableIndexDocument = immutableDefinition ? await loadDocument(immutableDefinition) : null;
    const byteIdentical = Boolean(immutableIndexDocument && immutableIndexDocument.raw === indexDocument.raw);
    const chainVerified = byteIdentical && await publicationChainValidAsync(indexDocument.parsed, loadDocument);
    const ancestorArtifactsVerified = byteIdentical && chainVerified;
    const indexValid = byteIdentical && chainVerified && ancestorArtifactsVerified;
    if (!indexValid) return { indexDefinition, indexDocument, immutableIndexDocument, indexValid: false, chainVerified, ancestorArtifactsVerified, documents: {} };
    const entries = await Promise.all(Object.entries(PUBLICATION_ARTIFACTS).map(async ([key, config]) => {
      const definition = publicationArtifactDefinition(indexDocument.parsed.current[key], config);
      return [key, definition ? await loadDocument(definition) : null];
    }));
    const documents = Object.fromEntries(entries);
    const sourceEntries = await Promise.all(["today", "candidateStatus"].map(async (key) => {
      const definition = CORE_DOCUMENTS.find((item) => item.id === SNAPSHOT_DOCUMENTS[key]);
      return [key, definition ? await loadDocument(definition) : null];
    }));
    const sources = Object.fromEntries(sourceEntries);
    const handoffDefinition = CORE_DOCUMENTS.find((item) => item.id === HANDOFF_INDEX_ID);
    const currentHandoffDocument = await loadDocument(handoffDefinition);
    const historicalIndexHash = documents.publicationReadback?.parsed?.sourceBindings?.handoffIndex?.hash;
    const handoffChain = await resolveHandoffChainAsync(currentHandoffDocument, historicalIndexHash, loadDocument);
    sources.handoff = projectedHandoffDocument(handoffChain, { historical: true });
    sources.handoffChain = handoffChain;
    const catalogValid = publicationCatalogContract(indexDocument.parsed, documents, sources);
    if (!catalogValid) return { indexDefinition, indexDocument, immutableIndexDocument, indexValid: false, chainVerified, ancestorArtifactsVerified, catalogValid, documents, handoffChain };
    return { indexDefinition, indexDocument, immutableIndexDocument, indexValid, chainVerified, ancestorArtifactsVerified, catalogValid, documents, handoffChain };
  }

  async function search(query, limit = 10) {
    const optionalDefinitions = CORE_DOCUMENTS.filter((definition) => definition.optional === true && definition.id !== PUBLICATION_INDEX_ID);
    const [projects, source, optionalDocuments, publication] = await Promise.all([
      loadProjects(),
      sourceIdentity(),
      Promise.all(optionalDefinitions.map(loadDocument)),
      loadPublicationCurrent(),
    ]);
    const documents = [
      ...CORE_DOCUMENTS.filter((definition) => definition.optional !== true)
        .map((definition) => coreSearchDocument(definition, sourceRef, source.commit)),
      ...optionalDocuments.filter(Boolean)
        .map((document) => coreSearchDocument(document, sourceRef, source.commit)),
      ...publicationDocuments(publication).map((document) => coreSearchDocument(document, sourceRef, source.commit)),
      ...projects.map((project) => projectDocument(project, sourceRef, source.commit)),
    ];
    return rankDocuments(documents, query, limit);
  }

  async function fetchItem(id) {
    if (id === PUBLICATION_INDEX_ID || Object.values(PUBLICATION_ARTIFACTS).some((config) => config.id === id)) {
      const publication = await loadPublicationCurrent();
      return publicDocumentResponse(publicationDocuments(publication).find((document) => document.id === id));
    }
    const core = CORE_DOCUMENTS.find((item) => item.id === id);
    if (core) {
      const document = await loadDocument(core);
      return publicDocumentResponse(document);
    }
    if (id.startsWith("clover://project/")) {
      const projectId = id.slice("clover://project/".length);
      const [projects, source] = await Promise.all([loadProjects(), sourceIdentity()]);
      const project = projects.find((item) => item.projectId === projectId);
      if (!project) return null;
      const document = projectDocument(project, sourceRef, source.commit);
      return { id: document.id, title: document.title, text: document.text, url: document.url, metadata: document.metadata };
    }
    return null;
  }

  async function snapshot() {
    const pointerDef = CORE_DOCUMENTS.find((item) => item.id === "clover://master-pointer");
    const statusDef = CORE_DOCUMENTS.find((item) => item.id === "clover://status/current");
    const snapshotDefinitions = Object.fromEntries(Object.entries(SNAPSHOT_DOCUMENTS).filter(([key]) => key !== "handoff").map(([key, id]) => [
      key,
      CORE_DOCUMENTS.find((item) => item.id === id),
    ]));
    const handoffDefinition = CORE_DOCUMENTS.find((item) => item.id === HANDOFF_INDEX_ID);
    const [pointerDoc, statusDoc, projects, source, optionalDocuments, currentHandoffDocument, publication] = await Promise.all([
      loadDocument(pointerDef),
      loadDocument(statusDef),
      loadProjects(),
      sourceIdentity(),
      Promise.all(Object.values(snapshotDefinitions).map(loadDocument)),
      loadDocument(handoffDefinition),
      loadPublicationCurrent(),
    ]);
    const optional = Object.fromEntries(Object.keys(snapshotDefinitions).map((key, index) => [
      key,
      optionalDocumentState(snapshotDefinitions[key], optionalDocuments[index], source),
    ]));
    let handoffChain = await resolveHandoffChainAsync(currentHandoffDocument, optional.today?.data?.handoffIndexHash, loadDocument);
    if (handoffChain && optional.today?.data?.handoffIndexPath !== handoffChain.historicalSnapshotPath) handoffChain = null;
    const handoff = handoffState(handoffDefinition, projectedHandoffDocument(handoffChain, { historical: true }), source);
    const currentHandoff = handoffState(handoffDefinition, projectedHandoffDocument(handoffChain), source);
    return {
      status: statusDoc?.parsed || null,
      pointer: pointerDoc?.parsed || null,
      projects,
      source,
      ...optional,
      handoff,
      currentHandoff,
      publicationReadback: publicationReadbackState(publication, source),
    };
  }

  return { search, fetch: fetchItem, snapshot, loadProjects, sourceIdentity, mode: "github" };
}

export function createAutoContextStore({
  appDir,
  root,
  sourceRef,
  fetchImpl = globalThis.fetch,
  environment = process.env,
} = {}) {
  const selectedRoot = root ?? environment.CONTEXT_ROOT ?? "";
  const selectedRef = sourceRef ?? resolveDefaultSourceRef(environment);
  const inferredRoot = selectedRoot ? path.resolve(selectedRoot) : appDir ? path.resolve(appDir, "../..") : null;
  const forcedMode = environment.CONTEXT_SOURCE_MODE || "auto";
  const localAvailable = inferredRoot && fs.existsSync(path.join(inferredRoot, "CLOVER_MASTER_PLAN_POINTER.json"));
  if (forcedMode === "local" && !localAvailable) throw new Error(`CONTEXT_SOURCE_MODE=local but canonical root is unavailable: ${inferredRoot}`);
  if (forcedMode === "local" || (forcedMode === "auto" && localAvailable)) {
    return createContextStore({
      root: inferredRoot,
      sourceRef: selectedRef,
      sourceCommit: FULL_COMMIT_PATTERN.test(selectedRef) ? selectedRef : null,
    });
  }
  return createGitHubContextStore({ sourceRef: selectedRef, fetchImpl });
}

export { CORE_DOCUMENTS };
