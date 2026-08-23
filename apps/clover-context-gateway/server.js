import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createAutoContextStore } from "./lib/context-store.js";
import { commandPrompt, prepareCommand } from "./lib/command-router.js";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const contextStore = createAutoContextStore({ appDir });
const configuredBaseUrl = process.env.PUBLIC_BASE_URL || "";
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES || 65536);
const widgetHtml = readFileSync(path.join(appDir, "public", "command-center.html"), "utf8");
const WIDGET_URI = "ui://clover/command-center.html";
const MCP_PATH = "/mcp";
const OWNER_MCP_PATH = "/owner-mcp";
const VERSION = "0.3.1";
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const GIT_COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const PUBLICATION_INDEX_ID = "clover://publication/index";
const PUBLICATION_CURRENT_ID = "clover://publication/readback";
const PUBLICATION_INDEX_PATH = "portfolio/core/publication/index.json";
const PUBLICATION_ARTIFACT_PATH_PATTERN = /^portfolio\/core\/publication\/versions\/([0-9]+\.[0-9]+\.[0-9]+)\/(mirrors|records)\/([A-Za-z0-9_.-]+)$/;
const PUBLICATION_INDEX_SNAPSHOT_PATTERN = /^portfolio\/core\/publication\/versions\/([0-9]+\.[0-9]+\.[0-9]+)\/records\/core-publication-index-([0-9]{4})\.json$/;
const PUBLICATION_IMMUTABLE_RECORD_POLICY = "The stable root must be byte-identical to this immutable numbered snapshot. A successor preserves prior records, appends a new numbered snapshot, and advances the stable root with an exact previous path and hash.";
const PUBLICATION_CONTAINER_RECORDING_RULE = "After these bytes are committed, refreshed GitHub/Vercel/PR metadata must bind the exact container commit and tree in a post-commit source-bound readback; an optional later append-only record may persist it. Never use a local attachment.";
const REVIEWED_IMPLEMENTATION = Object.freeze({
  headCommit: "2309bbc61dc8fcc7f2167c6c47db4a8b11cd8334",
  tree: "a027db19d8b177fe52d45fc0c0153ca1189f728e",
  directParent: "9006dcb78ee9412b57321cbd0fbdfa617d7bf96c",
  baseCommit: "364a9a96829f323aa00a679804fdd7ed879043b5",
});
const PUBLICATION_ARTIFACTS = Object.freeze({
  finalReport: Object.freeze({
    id: "clover://publication/report",
    artifactType: "mirrored-final-report",
    hashMode: "sha256-bytes",
    mediaType: "text/markdown",
  }),
  sourceBoundReceipt: Object.freeze({
    id: "clover://publication/receipt",
    artifactType: "mirrored-source-bound-receipt",
    hashMode: "sha256-bytes",
    mediaType: "application/json",
  }),
  reviewPrompt: Object.freeze({
    id: "clover://publication/review-prompt",
    artifactType: "mirrored-review-prompt",
    hashMode: "sha256-bytes",
    mediaType: "text/markdown",
  }),
  reviewPointer: Object.freeze({
    id: "clover://publication/review-decision",
    artifactType: "structured-review-pointer",
    hashMode: "sha256-canonical-without-self-hash-field",
    mediaType: "application/json",
  }),
  publicationReadback: Object.freeze({
    id: PUBLICATION_CURRENT_ID,
    artifactType: "publication-readback",
    hashMode: "sha256-canonical-without-self-hash-field",
    mediaType: "application/json",
  }),
});

const SERVER_INSTRUCTIONS = [
  "When the user says 'Use CloverApps to…', call prepare_clover_command before planning execution.",
  "For project/status questions, search first and fetch only the target records needed for the current task.",
  "When the optional Clover Today candidate is available, treat it as a dated candidate sibling to the canonical Command Packet, never as a replacement for current status or as authority.",
  "When a validated publication readback sibling is available, prefer it only for the exact-head CI and target-null preview claims it explicitly supersedes; never use it to change the dated Today priorities, Action ID, Handoff lifecycle, owner authority, production state, or historical records.",
  "Canonical Clover records preserve intent and dated state; before any mutation, refresh materially relevant live facts through the native GitHub, Vercel, Drive, Sites, analytics, or Vault connector available in the conversation.",
  "Treat unavailable or contradictory facts as unknown. Never infer merge, production deployment, production-data access, domain/DNS, secret, purchase, messaging, agreement, or publication authority.",
  "Use deterministic checks before model visual/browser review and return exact receipts and status evidence.",
].join(" ");

const OWNER_SERVER_INSTRUCTIONS = "For every natural-language Clover owner request, call clover_owner_request before composing a substantive portfolio or project answer. Pass the owner's request exactly as written, then treat the returned packet as controlling for routing, source refresh, authority, stop conditions, and Action-card behavior. Memory and external sources may supplement labeled presentation or refresh facts only after the packet; they may not rewrite the request or override packet intent, mode, project focus, or authority.";

const OWNER_TOOL_DESCRIPTION = "Use this as the first substantive Clover action whenever the user selects the Clover owner app, says \"Use Clover Core\", asks what matters, requests perspective, asks why a priority is blocked, asks for one next decision, asks what changed, asks for safe parts, diagnoses a project, or requests project work. Pass the owner's request exactly as written. Do not prepend the app name, add inferred goals, introduce a project, summarize, expand, or rewrite the request. This tool returns the controlling read-only Clover Command Packet, source plan, authority boundary, and owner widget. Do not compose a portfolio or project answer before this tool returns.";

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
};

function requestBaseUrl(req) {
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/$/, "");
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || (req.socket?.encrypted ? "https" : "http");
  return `${protocol}://${req.headers.host || "localhost"}`;
}

function resultWithStructured(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

function registerCommandCenterResource(server) {
  registerAppResource(
    server,
    "clover-command-center",
    WIDGET_URI,
    {},
    async () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml,
          _meta: {
            ui: {
              prefersBorder: false,
              csp: { connectDomains: [], resourceDomains: [] },
            },
            "openai/widgetDescription": "Clover command center for speaking or typing one instruction and binding it to current canonical project context, freshness requirements, cost lanes, and owner-only safety gates.",
          },
        },
      ],
    })
  );
}

function firstPresent(record, keys) {
  if (!record || typeof record !== "object") return null;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return null;
}

function componentPointer(component) {
  return {
    id: component?.id || null,
    available: component?.available === true,
    metadata: component?.metadata || null,
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function documentSelfHash(document, field, { prefix = false } = {}) {
  if (!document || typeof document !== "object" || Array.isArray(document)) return null;
  const clone = structuredClone(document);
  delete clone[field];
  const digest = createHash("sha256").update(canonicalJson(clone)).digest("hex");
  return prefix ? `sha256:${digest}` : digest;
}

function hasExactKeys(record, keys) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isIsoTimestamp(value) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function withoutSha256Prefix(value) {
  return typeof value === "string" && value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function publicGovernanceRecordSafe(value) {
  const forbiddenKey = /(password|passwd|secretvalue|plaintextsecret|credentialvalue|privatekey|apikey|accesstoken|refreshtoken|customerrecord|guestrecord|staffrecord|healthrecord|medicalrecord|legalrecord|paymentrecord|transactionrecord|reservationrecord|messagebody|emailaddress|phonenumber|cardnumber|routingnumber|accountnumber|cvv|ssn)/i;
  const secretValue = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/-]{8,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}|\/Users\//i;
  const emailValue = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  function visit(item) {
    if (Array.isArray(item)) return item.every(visit);
    if (item && typeof item === "object") {
      return Object.entries(item).every(([key, child]) => !forbiddenKey.test(key.replace(/[^a-z0-9]/gi, "")) && visit(child));
    }
    return typeof item !== "string" || (!secretValue.test(item) && !emailValue.test(item));
  }
  return visit(value);
}

function componentHasIdentity(component, id, relativePath) {
  return component?.id === id
    && component?.metadata?.relativePath === relativePath;
}

function candidateStatusContract(component) {
  const data = component?.data;
  return componentHasIdentity(component, "clover://status/candidate/2026-08-20", "portfolio/status/candidates/2026-08-20/status.json")
    && data?.documentType === "clover-master-status-candidate"
    && data?.schemaVersion === "0.2-candidate"
    && data?.status === "candidate-unmerged-undeployed"
    && data?.statusHash === documentSelfHash(data, "statusHash", { prefix: true });
}

function registryCandidateContract(component) {
  const data = component?.data;
  return componentHasIdentity(component, "clover://registry/candidate/2.0.0", "portfolio/registry/projections/core-project-index.v2.json")
    && data?.documentType === "clover-core-portfolio-projection"
    && data?.schemaVersion === "2.0.0"
    && data?.status === "candidate-unmerged-undeployed"
    && data?.projectionPolicy?.rawCellDataIncluded === false
    && data?.architecture?.rawCellDataStoredInKernel === false
    && Array.isArray(data?.projects)
    && data.projects.length === 45;
}

function sessionContract(component) {
  const data = component?.data;
  return componentHasIdentity(component, "clover://today/candidate/2026-08-20", "portfolio/core/today/2026-08-20/session.json")
    && data?.documentType === "clover-today-owner-session"
    && data?.schemaVersion === "0.1.0"
    && /^[a-f0-9]{64}$/.test(data?.sessionHash || "")
    && data?.sessionHash !== "0".repeat(64)
    && data?.sessionHash === documentSelfHash(data, "sessionHash");
}

function handoffContract(component) {
  const data = component?.data;
  return componentHasIdentity(component, "clover://handoff/index", "portfolio/core/handoff/index.json")
    && data?.documentType === "clover-handoff-action-receipt-index"
    && data?.schemaVersion === "0.1.0"
    && /^[a-f0-9]{64}$/.test(data?.indexHash || "")
    && data?.indexHash === documentSelfHash(data, "indexHash")
    && Array.isArray(data?.entries);
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
    && HASH_PATTERN.test(pointer.hash || "")
    && pointer.hashMode === config.hashMode
    && pointer.mediaType === config.mediaType;
}

function publicationIndexEntryContract(entry, offset) {
  const config = Object.values(PUBLICATION_ARTIFACTS).find((item) => item.artifactType === entry?.artifactType);
  return Boolean(config)
    && hasExactKeys(entry, [
      "sequence", "artifactType", "recordId", "path", "hash", "hashMode", "mediaType", "recordedAt", "status",
    ])
    && entry.sequence === offset + 1
    && publicationPointerContract({
      artifactType: entry.artifactType,
      recordId: entry.recordId,
      path: entry.path,
      hash: entry.hash,
      hashMode: entry.hashMode,
      mediaType: entry.mediaType,
    }, config)
    && isIsoTimestamp(entry.recordedAt)
    && ["current", "superseded"].includes(entry.status);
}

function publicationComponentMetadataContract(component, pointer, config) {
  const metadata = component?.metadata;
  return component?.id === config.id
    && component?.available === true
    && hasExactKeys(metadata, [
      "repository", "ref", "commit", "relativePath", "sourceType", "found", "hashVerified",
      "contentHash", "hashMode", "mediaType", "artifactType", "recordId",
    ])
    && metadata.relativePath === pointer.path
    && metadata.sourceType === "validated-publication-artifact"
    && metadata.found === true
    && metadata.hashVerified === true
    && metadata.contentHash === pointer.hash
    && metadata.hashMode === pointer.hashMode
    && metadata.mediaType === pointer.mediaType
    && metadata.artifactType === pointer.artifactType
    && metadata.recordId === pointer.recordId;
}

function publicationIndexContract(component) {
  const index = component?.index;
  const data = index?.data;
  const metadata = index?.metadata;
  if (!componentHasIdentity(index, PUBLICATION_INDEX_ID, PUBLICATION_INDEX_PATH)
    || index?.available !== true
    || metadata?.found !== true
    || metadata?.hashVerified !== true
    || metadata?.hashMode !== "sha256-canonical-without-self-hash-field"
    || metadata?.contentHash !== data?.publicationIndexHash
    || metadata?.immutableSnapshotByteIdentical !== true
    || metadata?.chainVerified !== true
    || metadata?.ancestorArtifactsVerified !== true
    || !hasExactKeys(data, [
      "documentType", "schemaVersion", "indexId", "updatedAt", "reviewedImplementationHead",
      "lifecycle", "current", "connectorIds", "entries", "publicationIndexHash",
    ])
    || data.documentType !== "clover-core-publication-index"
    || data.schemaVersion !== "0.1.0"
    || data.indexId !== "core-publication-index:2026-08-20"
    || !isIsoTimestamp(data.updatedAt)
    || data.reviewedImplementationHead !== REVIEWED_IMPLEMENTATION.headCommit
    || !hasExactKeys(data.lifecycle, [
      "mode", "sequence", "stableRootPath", "immutableSnapshotPath", "previousIndexPath",
      "previousIndexHash", "immutableRecordPolicy",
    ])
    || data.lifecycle.mode !== "append-only-records-with-advancing-root-pointer"
    || !Number.isInteger(data.lifecycle.sequence)
    || data.lifecycle.sequence < 1
    || data.lifecycle.stableRootPath !== PUBLICATION_INDEX_PATH
    || !PUBLICATION_INDEX_SNAPSHOT_PATTERN.test(data.lifecycle.immutableSnapshotPath || "")
    || PUBLICATION_INDEX_SNAPSHOT_PATTERN.exec(data.lifecycle.immutableSnapshotPath)?.[2] !== String(data.lifecycle.sequence).padStart(4, "0")
    || metadata.immutableSnapshotPath !== data.lifecycle.immutableSnapshotPath
    || data.lifecycle.immutableRecordPolicy !== PUBLICATION_IMMUTABLE_RECORD_POLICY
    || (data.lifecycle.sequence === 1
      ? data.lifecycle.previousIndexPath !== null || data.lifecycle.previousIndexHash !== null
      : !PUBLICATION_INDEX_SNAPSHOT_PATTERN.test(data.lifecycle.previousIndexPath || "") || !HASH_PATTERN.test(data.lifecycle.previousIndexHash || ""))
    || !hasExactKeys(data.current, Object.keys(PUBLICATION_ARTIFACTS))
    || !hasExactKeys(data.connectorIds, Object.values(PUBLICATION_ARTIFACTS).map((config) => config.id))
    || !Array.isArray(data.entries)
    || data.entries.length < Object.keys(PUBLICATION_ARTIFACTS).length
    || !data.entries.every((entry, offset) => publicationIndexEntryContract(entry, offset))
    || !HASH_PATTERN.test(data.publicationIndexHash || "")
    || data.publicationIndexHash !== documentSelfHash(data, "publicationIndexHash")) return false;

  const recordIds = new Set(data.entries.map((entry) => entry.recordId));
  const paths = new Set(data.entries.map((entry) => entry.path));
  if (recordIds.size !== data.entries.length || paths.size !== data.entries.length) return false;
  return Object.entries(PUBLICATION_ARTIFACTS).every(([key, config]) => {
    const pointer = data.current[key];
    if (!publicationPointerContract(pointer, config)
      || canonicalJson(data.connectorIds[config.id]) !== canonicalJson(pointer)) return false;
    if (data.entries.filter((entry) => entry.status === "current" && entry.artifactType === config.artifactType).length !== 1) return false;
    const matches = data.entries.filter((entry) => entry.status === "current"
      && entry.artifactType === pointer.artifactType
      && entry.recordId === pointer.recordId
      && entry.path === pointer.path
      && entry.hash === pointer.hash
      && entry.hashMode === pointer.hashMode
      && entry.mediaType === pointer.mediaType);
    return matches.length === 1;
  });
}

function reviewedImplementationContract(value) {
  const pullRequest = value?.pullRequest;
  return hasExactKeys(value, [
    "repository", "branch", "headCommit", "tree", "directParent", "baseBranch", "baseCommit", "pullRequest",
  ])
    && value.repository === "chrisdortch/first"
    && value.branch === "platform/clover-core-trunk-activation-v0.1-20260820"
    && value.headCommit === REVIEWED_IMPLEMENTATION.headCommit
    && value.tree === REVIEWED_IMPLEMENTATION.tree
    && value.directParent === REVIEWED_IMPLEMENTATION.directParent
    && value.baseBranch === "platform/clover-core-trust-slice-v0.2-20260818"
    && value.baseCommit === REVIEWED_IMPLEMENTATION.baseCommit
    && hasExactKeys(pullRequest, ["number", "url", "state", "draft", "merged"])
    && pullRequest.number === 17
    && pullRequest.url === "https://github.com/chrisdortch/first/pull/17"
    && pullRequest.state === "open"
    && pullRequest.draft === true
    && pullRequest.merged === false;
}

function reviewDecisionContract(component, index) {
  const data = component?.data;
  const pointer = index?.current?.reviewPointer;
  const decision = data?.decision;
  const authority = data?.authority;
  const findingIds = Array.isArray(decision?.findings) ? decision.findings.map((finding) => finding?.findingId) : [];
  return publicationComponentMetadataContract(component, pointer, PUBLICATION_ARTIFACTS.reviewPointer)
    && hasExactKeys(data, [
      "documentType", "schemaVersion", "reviewPointerId", "recordedAt", "reviewedImplementation",
      "reviewTarget", "reviewEvidence", "decision", "authority", "reviewPointerHash",
    ])
    && data.documentType === "clover-core-publication-review-pointer"
    && data.schemaVersion === "0.1.0"
    && data.reviewPointerId === pointer.recordId
    && isIsoTimestamp(data.recordedAt)
    && reviewedImplementationContract(data.reviewedImplementation)
    && canonicalJson(data.reviewTarget) === canonicalJson(index.current.sourceBoundReceipt)
    && hasExactKeys(data.reviewEvidence, ["reviewPrompt", "finalReport"])
    && canonicalJson(data.reviewEvidence.reviewPrompt) === canonicalJson(index.current.reviewPrompt)
    && canonicalJson(data.reviewEvidence.finalReport) === canonicalJson(index.current.finalReport)
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
    && authority.action002Approved === false
    && data.reviewPointerHash === pointer.hash
    && data.reviewPointerHash === documentSelfHash(data, "reviewPointerHash")
    && publicGovernanceRecordSafe(data);
}

function mirroredIssuanceContract(value, index, implementation) {
  const scope = value?.changedPathAllowlistScope;
  return hasExactKeys(value, ["finalReport", "sourceBoundReceipt", "reviewPrompt", "changedPathAllowlistScope"])
    && canonicalJson(value.finalReport) === canonicalJson(index.current.finalReport)
    && canonicalJson(value.sourceBoundReceipt) === canonicalJson(index.current.sourceBoundReceipt)
    && canonicalJson(value.reviewPrompt) === canonicalJson(index.current.reviewPrompt)
    && hasExactKeys(scope, ["repository", "baseCommit", "reviewedHeadCommit", "changedPathCount", "status"])
    && scope.repository === implementation.repository
    && scope.baseCommit === implementation.baseCommit
    && scope.reviewedHeadCommit === implementation.headCommit
    && scope.changedPathCount === 62
    && scope.status === "exactly-matches-mirrored-receipt-and-reviewed-head-diff";
}

function githubEvidenceContract(value, implementation) {
  const expectedWorkflows = new Set([
    "Validate Clover master plan",
    "Validate Clover Context Gateway",
    "Validate Clover Core Candidate",
  ]);
  if (!hasExactKeys(value, ["observedAt", "sourceCommit", "workflows"])
    || !isIsoTimestamp(value.observedAt)
    || value.sourceCommit !== implementation.headCommit
    || !Array.isArray(value.workflows)
    || value.workflows.length !== 3
    || new Set(value.workflows.map((workflow) => workflow?.name)).size !== 3) return false;
  return value.workflows.every((workflow) => hasExactKeys(workflow, ["name", "runId", "conclusion", "jobs", "artifacts"])
    && expectedWorkflows.has(workflow.name)
    && Number.isInteger(workflow.runId)
    && workflow.runId > 0
    && workflow.conclusion === "success"
    && Array.isArray(workflow.jobs)
    && workflow.jobs.length >= 1
    && workflow.jobs.length <= 2
    && workflow.jobs.every((job) => hasExactKeys(job, ["jobId", "node", "conclusion"])
      && Number.isInteger(job.jobId)
      && job.jobId > 0
      && (job.node === null || Number.isInteger(job.node))
      && job.conclusion === "success")
    && Array.isArray(workflow.artifacts)
    && workflow.artifacts.length <= 2
    && workflow.artifacts.every((artifact) => hasExactKeys(artifact, ["artifactId", "node", "sha256", "expiresAt"])
      && Number.isInteger(artifact.artifactId)
      && artifact.artifactId > 0
      && Number.isInteger(artifact.node)
      && HASH_PATTERN.test(artifact.sha256 || "")
      && isIsoTimestamp(artifact.expiresAt)));
}

function vercelEvidenceContract(value, implementation) {
  return hasExactKeys(value, [
    "observedAt", "deploymentId", "immutableUrl", "projectId", "sourceCommit", "sourceRef",
    "sourceType", "state", "target", "aliases", "gatewayVersion", "mode", "writeToolsEnabled", "standingProductionAuthority",
  ])
    && isIsoTimestamp(value.observedAt)
    && /^dpl_[A-Za-z0-9]+$/.test(value.deploymentId || "")
    && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(value.immutableUrl || "")
    && /^prj_[A-Za-z0-9]+$/.test(value.projectId || "")
    && value.sourceCommit === implementation.headCommit
    && value.sourceRef === implementation.branch
    && value.sourceType === "cli"
    && value.state === "READY"
    && value.target === null
    && Array.isArray(value.aliases)
    && value.aliases.length === 0
    && value.gatewayVersion === VERSION
    && value.mode === "read-only"
    && value.writeToolsEnabled === false
    && value.standingProductionAuthority === false;
}

function sourceBindingsContract(value, { session, candidateStatus, handoff }) {
  if (!hasExactKeys(value, ["today", "status", "handoffIndex"])) return false;
  const bindings = Object.values(value);
  if (!bindings.every((binding) => hasExactKeys(binding, ["path", "hash"])
    && typeof binding.path === "string"
    && HASH_PATTERN.test(binding.hash || ""))) return false;
  return value.today.path === session.metadata.relativePath
    && value.today.hash === session.data.sessionHash
    && value.status.path === candidateStatus.metadata.relativePath
    && value.status.hash === withoutSha256Prefix(candidateStatus.data.statusHash)
    && value.handoffIndex.path === handoff.metadata.relativePath
    && value.handoffIndex.hash === handoff.data.indexHash;
}

function action002Contract(value, { session, handoff }) {
  const matches = handoff.data.entries.filter((entry) => matchesPendingHandoff(entry, {
    actionId: session.data.actionId,
    envelopePath: session.data.envelopePath,
    envelopeHash: session.data.envelopeHash,
  }));
  return hasExactKeys(value, [
    "actionId", "envelopeHash", "indexHash", "status", "lifecycleState",
    "ownerApprovalStatus", "consumed", "revoked",
  ])
    && value.actionId === session.data.actionId
    && value.envelopeHash === session.data.envelopeHash
    && value.indexHash === handoff.data.indexHash
    && value.status === "pending"
    && value.lifecycleState === "proposed"
    && value.ownerApprovalStatus === "pending"
    && value.consumed === false
    && value.revoked === false
    && matches.length === 1;
}

function precedenceContract(value, session) {
  const requiredExclusions = ["owner-authority", "handoff-lifecycle", "production-state", "historical-records"];
  const supersedes = value?.supersedes;
  return hasExactKeys(value, ["scope", "supersedes", "doesNotSupersede"])
    && value.scope === "publication-readback-only"
    && Array.isArray(supersedes)
    && supersedes.length === 1
    && hasExactKeys(supersedes[0], ["path", "hash", "claimScope", "reason"])
    && supersedes[0].path === session.metadata.relativePath
    && supersedes[0].hash === session.data.sessionHash
    && supersedes[0].claimScope === "exact-head-ci-and-gateway-preview-readback"
    && typeof supersedes[0].reason === "string"
    && supersedes[0].reason.length > 0
    && Array.isArray(value.doesNotSupersede)
    && value.doesNotSupersede.length === requiredExclusions.length
    && requiredExclusions.every((item) => value.doesNotSupersede.includes(item));
}

function publicationReadbackContract(component, context) {
  const data = component?.data;
  const index = component?.index?.data;
  const currentPointer = index?.current?.publicationReadback;
  const pathMatch = PUBLICATION_ARTIFACT_PATH_PATTERN.exec(component?.metadata?.relativePath || "");
  const container = data?.containerBinding;
  const artifacts = component?.artifacts;
  return component?.available === true
    && componentHasIdentity(component, PUBLICATION_CURRENT_ID, currentPointer?.path)
    && publicationIndexContract(component)
    && componentsShareExactSource([component, component.index])
    && publicationComponentMetadataContract(component, currentPointer, PUBLICATION_ARTIFACTS.publicationReadback)
    && hasExactKeys(artifacts, ["report", "receipt", "reviewPrompt", "reviewDecision"])
    && publicationComponentMetadataContract(artifacts.report, index.current.finalReport, PUBLICATION_ARTIFACTS.finalReport)
    && publicationComponentMetadataContract(artifacts.receipt, index.current.sourceBoundReceipt, PUBLICATION_ARTIFACTS.sourceBoundReceipt)
    && publicationComponentMetadataContract(artifacts.reviewPrompt, index.current.reviewPrompt, PUBLICATION_ARTIFACTS.reviewPrompt)
    && reviewDecisionContract(artifacts.reviewDecision, index)
    && componentsShareExactSource([component, component.index, ...Object.values(artifacts)])
    && hasExactKeys(data, [
      "documentType", "schemaVersion", "readbackId", "observedAt", "evidenceStatus", "verdict",
      "reviewedImplementation", "mirroredIssuanceArtifacts", "reviewPointer", "github", "vercel",
      "sourceBindings", "action002", "precedence", "containerBinding", "publicationReadbackHash",
    ])
    && data.documentType === "clover-core-publication-readback"
    && data.schemaVersion === "0.1.0"
    && pathMatch?.[1] === data.schemaVersion
    && data.readbackId === currentPointer.recordId
    && isIsoTimestamp(data.observedAt)
    && data.evidenceStatus === "current-for-reviewed-implementation-head"
    && data.verdict === "AMEND"
    && reviewedImplementationContract(data.reviewedImplementation)
    && index.reviewedImplementationHead === data.reviewedImplementation.headCommit
    && mirroredIssuanceContract(data.mirroredIssuanceArtifacts, index, data.reviewedImplementation)
    && canonicalJson(data.reviewPointer) === canonicalJson(index.current.reviewPointer)
    && githubEvidenceContract(data.github, data.reviewedImplementation)
    && vercelEvidenceContract(data.vercel, data.reviewedImplementation)
    && sourceBindingsContract(data.sourceBindings, context)
    && action002Contract(data.action002, context)
    && precedenceContract(data.precedence, context.session)
    && hasExactKeys(container, ["status", "commit", "tree", "reviewedImplementationRelation", "recordingRule"])
    && container.status === "pending-external-publication-receipt"
    && container.commit === null
    && container.tree === null
    && container.reviewedImplementationRelation === "The reviewed implementation head identifies the code and provider evidence under review; it is not the later commit that first contains this finalization record."
    && container.recordingRule === PUBLICATION_CONTAINER_RECORDING_RULE
    && HASH_PATTERN.test(data.publicationReadbackHash || "")
    && data.publicationReadbackHash === currentPointer.hash
    && data.publicationReadbackHash === documentSelfHash(data, "publicationReadbackHash")
    && publicGovernanceRecordSafe(data);
}

function componentsShareExactSource(components) {
  const metadata = components.map((component) => component?.metadata);
  if (metadata.some((item) => !item || item.found !== true)) return false;
  const [{ repository, commit }] = metadata;
  return typeof repository === "string"
    && repository.length > 0
    && /^[a-f0-9]{40}$/.test(commit || "")
    && metadata.every((item) => item.repository === repository && item.commit === commit);
}

function matchesPendingHandoff(entry, { actionId, envelopePath, envelopeHash }) {
  return entry?.actionId === actionId
    && entry?.envelopePath === envelopePath
    && entry?.envelopeHash === envelopeHash
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
    && entry?.receiptHash === null;
}

export function composeTodaySibling(snapshot = {}) {
  const session = snapshot.today || { id: "clover://today/candidate/2026-08-20", available: false, data: null, metadata: null };
  const candidateStatus = snapshot.candidateStatus || { available: false, data: null, metadata: null };
  const registryCandidate = snapshot.registryCandidate || { available: false, data: null, metadata: null };
  const handoff = snapshot.handoff || { available: false, data: null, metadata: null };
  const publicationReadback = snapshot.publicationReadback || {
    id: PUBLICATION_CURRENT_ID,
    available: false,
    data: null,
    metadata: null,
    index: { id: PUBLICATION_INDEX_ID, available: false, data: null, metadata: null },
  };
  const source = session.available === true && session.data && typeof session.data === "object" ? session.data : null;
  const action = firstPresent(source, ["action", "recommendedAction", "actionEnvelope"]);
  const topPriorities = firstPresent(source, ["topPriorities"]);
  const recommendation = firstPresent(source, ["recommendation"]);
  const actionId = firstPresent(source, ["actionId"]) ?? firstPresent(action, ["actionId", "id", "envelopeId"]);
  const envelopePath = firstPresent(source, ["envelopePath"]) ?? firstPresent(action, ["envelopePath", "path"]);
  const envelopeHash = firstPresent(source, ["envelopeHash"]) ?? firstPresent(action, ["envelopeHash", "hash"]);
  const handoffIndexPath = firstPresent(source, ["handoffIndexPath"]);
  const handoffIndexHash = firstPresent(source, ["handoffIndexHash"]);
  const connectorPlan = firstPresent(source, ["connectorPlan"]);
  const authorityRequired = firstPresent(source, ["authorityRequired"]);
  const sourceFreshness = firstPresent(source, ["sourceFreshness"]);
  const privacy = firstPresent(source, ["privacy"]);
  const handoffEntries = Array.isArray(handoff?.data?.entries) ? handoff.data.entries : [];
  const handoffMatches = handoffEntries.filter((entry) => matchesPendingHandoff(entry, {
    actionId,
    envelopePath,
    envelopeHash,
  }));
  const componentSourcesExact = componentsShareExactSource([session, candidateStatus, registryCandidate, handoff]);
  const complete = session.available === true
    && candidateStatus.available === true
    && registryCandidate.available === true
    && handoff.available === true
    && Array.isArray(topPriorities)
    && topPriorities.length === 3
    && recommendation !== null
    && typeof actionId === "string"
    && /^CLOVER-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{3}$/.test(actionId)
    && typeof envelopePath === "string"
    && envelopePath.length > 0
    && typeof envelopeHash === "string"
    && /^[a-f0-9]{64}$/.test(envelopeHash)
    && typeof handoffIndexPath === "string"
    && /^portfolio\/core\/handoff\/versions\/0\.1\.0\/indexes\/action-receipt-index-[0-9]{4}\.json$/.test(handoffIndexPath)
    && typeof handoffIndexHash === "string"
    && /^[a-f0-9]{64}$/.test(handoffIndexHash)
    && handoffIndexHash === handoff?.data?.indexHash
    && Array.isArray(connectorPlan)
    && connectorPlan.length > 0
    && Array.isArray(authorityRequired)
    && authorityRequired.length > 0
    && sourceFreshness !== null
    && privacy?.publicSanitizedProjection === true
    && privacy?.containsRawCellData === false
    && privacy?.containsPlaintextSecrets === false
    && privacy?.containsProductionPrivateData === false
    && handoffMatches.length === 1
    && componentSourcesExact
    && candidateStatusContract(candidateStatus)
    && registryCandidateContract(registryCandidate)
    && sessionContract(session)
    && handoffContract(handoff);
  const publicationComplete = complete
    && publicationReadbackContract(publicationReadback, { session, candidateStatus, handoff })
    && componentsShareExactSource([
      session,
      candidateStatus,
      registryCandidate,
      handoff,
      publicationReadback,
      publicationReadback.index,
      ...Object.values(publicationReadback.artifacts || {}),
    ]);
  const publicationAttempted = publicationReadback.available === true
    || publicationReadback.metadata?.found === true
    || publicationReadback.index?.metadata?.found === true;
  const publicationStatus = publicationComplete
    ? "verified-publication-readback-preferred"
    : publicationAttempted
      ? "invalid-publication-readback-failed-closed"
      : "dated-session-only";
  const containerSource = publicationComplete
    ? {
        repository: publicationReadback.metadata.repository,
        ref: publicationReadback.metadata.ref,
        commit: publicationReadback.metadata.commit,
        relationship: "contains-finalization-records",
      }
    : null;

  return {
    id: session.id || "clover://today/candidate/2026-08-20",
    available: complete,
    data: complete
      ? {
          ...source,
          candidateStatus: candidateStatus.data,
          topPriorities,
          recommendation,
          actionId,
          envelopePath,
          envelopeHash,
          connectorPlan,
          authorityRequired,
        }
      : null,
    metadata: {
      ...(session.metadata || {}),
      complete,
      contract: "minimum-useful-core-2026-08-20",
    },
    publicationReadback: {
      id: publicationComplete ? publicationReadback.id : PUBLICATION_CURRENT_ID,
      available: publicationComplete,
      data: publicationComplete ? publicationReadback.data : null,
      url: publicationComplete ? publicationReadback.url : null,
      metadata: {
        ...(publicationComplete ? publicationReadback.metadata : {}),
        complete: publicationComplete,
        contract: "clover-core-publication-readback-0.1.0",
        status: publicationStatus,
        containerSource,
      },
      index: publicationComplete
        ? componentPointer(publicationReadback.index)
        : { id: PUBLICATION_INDEX_ID, available: false, metadata: null },
      artifacts: publicationComplete
        ? Object.fromEntries(Object.entries(publicationReadback.artifacts).map(([key, artifact]) => [key, componentPointer(artifact)]))
        : {},
    },
    evidencePrecedence: {
      applied: publicationComplete,
      status: publicationStatus,
      scope: publicationComplete ? publicationReadback.data.precedence.scope : null,
      observedAt: publicationComplete ? publicationReadback.data.observedAt : null,
      reviewedImplementationHead: publicationComplete ? publicationReadback.data.reviewedImplementation.headCommit : null,
      supersedes: publicationComplete ? publicationReadback.data.precedence.supersedes : [],
      doesNotSupersede: publicationComplete ? publicationReadback.data.precedence.doesNotSupersede : [],
    },
    components: {
      candidateStatus: componentPointer(candidateStatus),
      registryCandidate: componentPointer(registryCandidate),
      session: componentPointer(session),
      handoff: componentPointer(handoff),
      publicationReadback: publicationComplete
        ? componentPointer(publicationReadback)
        : { id: PUBLICATION_CURRENT_ID, available: false, metadata: null },
      publicationIndex: publicationComplete
        ? componentPointer(publicationReadback.index)
        : { id: PUBLICATION_INDEX_ID, available: false, metadata: null },
    },
  };
}

async function prepareCloverRequest(request) {
  const snapshot = await contextStore.snapshot();
  const today = composeTodaySibling(snapshot);
  const packet = prepareCommand({
    request,
    projects: snapshot.projects,
    status: snapshot.status,
    pointer: snapshot.pointer,
    source: snapshot.source,
  });
  return {
    snapshot,
    packet,
    today,
    followUpPrompt: commandPrompt(packet),
  };
}

function ownerRequestResult(request, callerClaimedOrigin, prepared) {
  const consequentialAuthorityGranted = Object.entries(prepared.packet.authority || {})
    .some(([key, value]) => key !== "previewOnlyByDefault" && value === true);
  if (consequentialAuthorityGranted) {
    throw new Error("Clover owner requests fail closed when consequential authority is present.");
  }
  const requestBytes = Buffer.from(request, "utf8");
  const payload = {
    packet: prepared.packet,
    today: prepared.today,
    followUpPrompt: prepared.followUpPrompt,
    requestIntegrity: {
      receivedRequest: request,
      utf8Bytes: requestBytes.byteLength,
      sha256: createHash("sha256").update(requestBytes).digest("hex"),
      normalization: "none-except-json-transport",
      callerClaimedOrigin: callerClaimedOrigin || "chat-host-or-widget-direct",
    },
    sourceHeader: {
      gatewayVersion: VERSION,
      repository: prepared.packet.canonicalContext.sourceRepository,
      contextRef: prepared.packet.canonicalContext.sourceRef,
      contextCommit: prepared.packet.canonicalContext.sourceCommit,
      packetSchemaVersion: prepared.packet.schemaVersion,
      intent: prepared.packet.intent.id,
      mode: prepared.packet.intent.mode || "",
      focusedProjectId: prepared.packet.project?.projectId || null,
      requiresProject: prepared.packet.intent.requiresProject,
      state: prepared.packet.state,
      consequentialAuthorityGranted: false,
    },
    answerContract: {
      packetControlsRouting: true,
      memoryMayOverridePacket: false,
      externalSourcesMayOverrideIntent: false,
      currentFactsRequireDeclaredRefresh: true,
      noSubstantiveAnswerBeforePacket: true,
    },
  };
  return {
    content: [{ type: "text", text: prepared.followUpPrompt }],
    structuredContent: payload,
    _meta: { ui: { resourceUri: WIDGET_URI } },
  };
}

function createCloverServer(baseUrl) {
  const server = new McpServer(
    { name: "clover-context-gateway", version: VERSION },
    { instructions: SERVER_INSTRUCTIONS }
  );

  registerCommandCenterResource(server);

  server.registerTool(
    "search",
    {
      title: "Search Clover context",
      description: "Use this when the user asks about a Clover project, current plan, status, protocol, goal, next step, portfolio relationship, or the phrase 'Use CloverApps to…'. Return stable canonical IDs, then call fetch only for the relevant items.",
      inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(25).optional() },
      annotations: readOnlyAnnotations,
    },
    async ({ query, limit = 10 }) => resultWithStructured({ results: await contextStore.search(query, limit) })
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch Clover context item",
      description: "Use this after search when the model needs one complete source-grounded Clover item. Stable project IDs use clover://project/<projectId>; validated publication review artifacts use only the exact clover://publication/* IDs returned by search and the signed publication index.",
      inputSchema: { id: z.string().min(1) },
      annotations: readOnlyAnnotations,
    },
    async ({ id }) => {
      const item = await contextStore.fetch(id);
      if (!item) return resultWithStructured({ id, title: "Not found", text: "", url: `${baseUrl}/`, metadata: { found: false } });
      return resultWithStructured(item);
    }
  );

  server.registerTool(
    "prepare_clover_command",
    {
      title: "Prepare Clover command packet",
      description: "Use this when the user says 'Use CloverApps to…', plants a seed, evolves or diagnoses a project, inspects status, builds or reviews a preview, backs up or restore-tests a project, or prepares a release. It returns a read-only command packet and exact live-source refresh plan; it changes nothing.",
      inputSchema: { request: z.string().min(1).max(12000) },
      annotations: readOnlyAnnotations,
    },
    async ({ request }) => {
      const { packet, today, followUpPrompt } = await prepareCloverRequest(request);
      return {
        content: [{ type: "text", text: followUpPrompt }],
        structuredContent: {
          packet,
          today,
          followUpPrompt,
        },
      };
    }
  );

  registerAppTool(
    server,
    "render_clover_command_center",
    {
      title: "Open Clover command center",
      description: "Use this when the user wants a visible Clover building interface for speaking or typing a project instruction. It renders current public portfolio context and can prepare, but not execute, a bounded command.",
      inputSchema: { request: z.string().max(12000).optional() },
      annotations: readOnlyAnnotations,
      _meta: { ui: { resourceUri: WIDGET_URI } },
    },
    async ({ request = "" }) => {
      const prepared = request ? await prepareCloverRequest(request) : null;
      const snapshot = prepared?.snapshot || await contextStore.snapshot();
      const today = prepared?.today || composeTodaySibling(snapshot);
      const packet = prepared?.packet || null;
      return {
        content: [{ type: "text", text: "Opened the read-only Clover command center." }],
        structuredContent: {
          status: snapshot.status,
          source: snapshot.source,
          projects: snapshot.projects.map(({ projectId, title, priority, completionEstimate, estimateAsOf, verificationStatus }) => ({
            projectId,
            title,
            priority,
            completionEstimate,
            estimateAsOf,
            verificationStatus,
          })),
          today,
          packet,
          followUpPrompt: prepared?.followUpPrompt || "",
        },
        _meta: { ui: { resourceUri: WIDGET_URI } },
      };
    }
  );

  return server;
}

function createOwnerCloverServer() {
  const server = new McpServer(
    { name: "clover-owner-gateway", version: VERSION },
    { instructions: OWNER_SERVER_INSTRUCTIONS }
  );

  registerCommandCenterResource(server);

  registerAppTool(
    server,
    "clover_owner_request",
    {
      title: "Ground this owner request in Clover Core",
      description: OWNER_TOOL_DESCRIPTION,
      inputSchema: z.object({
        request: z.string().min(1).max(12000),
        callerClaimedOrigin: z.enum(["widget-direct"]).optional(),
      }).strict(),
      annotations: readOnlyAnnotations,
      _meta: { ui: { resourceUri: WIDGET_URI } },
    },
    async ({ request, callerClaimedOrigin }) => ownerRequestResult(
      request,
      callerClaimedOrigin,
      await prepareCloverRequest(request)
    )
  );

  return server;
}

async function readJsonBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBodyBytes) throw new Error(`Request body exceeds ${maxBodyBytes} bytes.`);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function securityHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), geolocation=(), payment=()",
    "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors https://chatgpt.com https://chat.openai.com",
  };
}

function json(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": allowedOrigin,
    ...securityHeaders(),
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

export async function handler(req, res) {
  try {
    if (!req.url) return res.writeHead(400).end("Missing URL");
    const baseUrl = requestBaseUrl(req);
    const url = new URL(req.url, baseUrl);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": allowedOrigin,
        "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
        "access-control-allow-headers": "content-type, accept, authorization, mcp-session-id, mcp-protocol-version",
        "access-control-expose-headers": "Mcp-Session-Id",
        ...securityHeaders(),
      });
      return res.end();
    }

    if (req.method === "GET" && url.pathname === "/") {
      let source = null;
      try {
        source = (await contextStore.snapshot()).source;
      } catch (error) {
        source = { mode: contextStore.mode, error: error instanceof Error ? error.message : String(error) };
      }
      return json(res, 200, {
        service: "clover-context-gateway",
        version: VERSION,
        mode: "read-only",
        contextMode: contextStore.mode,
        contextSource: source,
        mcp: `${baseUrl}${MCP_PATH}`,
        commandCenter: `${baseUrl}/command-center`,
        authority: { writeToolsEnabled: false, standingProductionAuthority: false },
      });
    }

    if (req.method === "GET" && url.pathname === "/command-center") {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        ...securityHeaders(),
      });
      return res.end(widgetHtml);
    }

    if (req.method === "GET" && url.pathname === "/api/context") {
      return json(res, 200, await contextStore.snapshot());
    }

    if (req.method === "GET" && url.pathname === "/api/search") {
      const query = url.searchParams.get("q") || "";
      if (!query.trim()) return json(res, 400, { error: "Query parameter q is required." });
      const limit = Number(url.searchParams.get("limit") || 10);
      return json(res, 200, { results: await contextStore.search(query, limit) });
    }

    if (req.method === "GET" && url.pathname === "/api/fetch") {
      const id = url.searchParams.get("id") || "";
      if (!id.trim()) return json(res, 400, { error: "Query parameter id is required." });
      const item = await contextStore.fetch(id);
      return item ? json(res, 200, item) : json(res, 404, { error: "Context item not found.", id });
    }

    if (req.method === "POST" && url.pathname === "/api/prepare-command") {
      try {
        const body = await readJsonBody(req);
        const { packet, today, followUpPrompt } = await prepareCloverRequest(body.request);
        return json(res, 200, {
          packet,
          today,
          followUpPrompt,
        });
      } catch (error) {
        return json(res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    if ([MCP_PATH, OWNER_MCP_PATH].includes(url.pathname) && ["GET", "DELETE"].includes(req.method || "")) {
      return json(
        res,
        405,
        {
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Method not allowed. Use POST for this stateless serverless MCP endpoint.",
          },
          id: null,
        },
        { allow: "POST, OPTIONS" }
      );
    }

    if ([MCP_PATH, OWNER_MCP_PATH].includes(url.pathname) && req.method === "POST") {
      res.setHeader("access-control-allow-origin", allowedOrigin);
      res.setHeader("access-control-expose-headers", "Mcp-Session-Id");
      const server = url.pathname === OWNER_MCP_PATH
        ? createOwnerCloverServer()
        : createCloverServer(baseUrl);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => {
        transport.close();
        server.close();
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res);
      } catch (error) {
        console.error("MCP request failed", error);
        if (!res.headersSent) json(res, 500, { error: "Internal MCP server error." });
      }
      return;
    }

    res.writeHead(404, { ...securityHeaders(), "content-type": "text/plain; charset=utf-8" }).end("Not Found");
  } catch (error) {
    console.error("HTTP request failed", error);
    if (!res.headersSent) json(res, 500, { error: "Internal server error." });
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  const port = Number(process.env.PORT || 8787);
  createServer(handler).listen(port, () => {
    console.log(`Clover Context Gateway ${VERSION} listening on http://localhost:${port}`);
  });
}
