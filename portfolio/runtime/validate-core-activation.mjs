#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalize, sha256Bytes, sha256Canonical } from "../core/lib/canonical-json.mjs";
import { validateHandoffLedger, validateIndexTransition } from "../core/lib/handoff-ledger.mjs";
import { validateJsonSchema } from "../core/lib/validators.mjs";
import { computeSelfHash, scorePriorityTargets } from "./priority-engine.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");
const SCHEMA_DIRECTORY = path.join(REPOSITORY_ROOT, "portfolio/core/schemas");

const PATHS = Object.freeze({
  status: "portfolio/status/candidates/2026-08-20/status.json",
  priorityInput: "portfolio/status/candidates/2026-08-20/priority-input.json",
  priorityOutput: "portfolio/status/candidates/2026-08-20/priority-output.json",
  today: "portfolio/core/today/2026-08-20/session.json",
  handoffRootIndex: "portfolio/core/handoff/index.json",
  handoffVersionIndex: "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0001.json",
});

const PROTECTED_BYTES = Object.freeze({
  "portfolio/status/current.json": "d3ae732ac055b64904890c8d6085bdc4a22553381f3fb7d7af58ba301d701eea",
  "portfolio/status/snapshots/2026-08-17.json": "d3ae732ac055b64904890c8d6085bdc4a22553381f3fb7d7af58ba301d701eea",
  "portfolio/status/STATUS.md": "4784595533b77074fe16330fff92fc6381960f0ad2cfdbe71048495749e58001",
  "portfolio/registry/projects.json": "2aeb1d6ec42e89d95c6c78180242b78818d2274bf5c5f2f0e1d0fedccdab1821",
  "portfolio/registry/versions/2.0.0/registry.json": "4f2f7c02b878db23b02b68ced0c61c9ca7e3d891b611757ae320a0e59b9725e2",
  "portfolio/registry/projections/core-project-index.v2.json": "72208bd5c81298a3e0f8daad9a71c9284ed8a4f487c4b058a76796a7a0eb36fb",
  "portfolio/schemas/clover-command-packet.schema.json": "b22cdb1a82852bc7fe419257d1bc79c9537a5483c753b79b5ac08002c14a1a36",
  "portfolio/context/versions/0.3.0/CANDIDATE_STATUS.md": "554636c6ff5386f757ff0c9f65cd3d4830977b48003dcb88439e5f2e420f2ce1",
  "portfolio/core/CLOVER_CONSTITUTION_CANDIDATE_V0.1.md": "82b90697389503182e44838df537268510680acffdff95b924967d11bb44169e",
  "portfolio/core/constitution/ratifications/2026-08-18-v0.1.json": "8b0dbf7a34ce18409cad36929e4b2b04a17c033f44e32e21c2c751109a81ccbb",
  "portfolio/core/event-ledger.candidate.jsonl": "b5218d898bab0aa37ef761e2a9670fd51fc4f56d43f899b44a7a0c32f1aea4f7",
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function absolute(relativePath) {
  const resolved = path.resolve(REPOSITORY_ROOT, relativePath);
  invariant(resolved.startsWith(`${REPOSITORY_ROOT}${path.sep}`), `Path escapes repository root: ${relativePath}`);
  return resolved;
}

function readBytes(relativePath) {
  return fs.readFileSync(absolute(relativePath));
}

function readJson(relativePath) {
  return JSON.parse(readBytes(relativePath).toString("utf8"));
}

function withoutField(value, field) {
  const clone = structuredClone(value);
  delete clone[field];
  return clone;
}

function verifyProtectedBytes() {
  for (const [relativePath, expectedHash] of Object.entries(PROTECTED_BYTES)) {
    invariant(sha256Bytes(readBytes(relativePath)) === expectedHash, `Protected historical artifact changed: ${relativePath}`);
  }
}

function verifySchemas(records) {
  for (const [record, schemaPath, label] of [
    [records.status, "portfolio/core/schemas/clover-status-candidate.v0.1.schema.json", "candidate-status"],
    [records.priorityInput, "portfolio/core/schemas/clover-priority-input.v0.1.schema.json", "priority-input"],
    [records.priorityOutput, "portfolio/core/schemas/clover-priority-output.v0.1.schema.json", "priority-output"],
    [records.today, "portfolio/core/schemas/today-session.v0.1.schema.json", "today-session"],
  ]) {
    validateJsonSchema(readJson(schemaPath), record, { schemaDirectory: SCHEMA_DIRECTORY, label });
  }
}

function verifySelfHashes(records) {
  invariant(records.status.statusHash === computeSelfHash(records.status, "statusHash"), "Candidate status self-hash is stale");
  invariant(records.priorityInput.priorityInputHash === computeSelfHash(records.priorityInput, "priorityInputHash"), "Priority input self-hash is stale");
  invariant(records.priorityOutput.priorityOutputHash === computeSelfHash(records.priorityOutput, "priorityOutputHash"), "Priority output self-hash is stale");
  invariant(records.today.sessionHash === sha256Canonical(withoutField(records.today, "sessionHash")), "Today session self-hash is stale");
  invariant(canonicalize(records.priorityOutput) === canonicalize(scorePriorityTargets(records.priorityInput)), "Priority output is not a deterministic regeneration");
}

function walkJson(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkJson(absolutePath));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(absolutePath);
  }
  return files.sort();
}

function discoverHandoffDocuments() {
  const base = "portfolio/core/handoff/versions/0.1.0";
  const documents = walkJson(absolute(base)).map((file) => ({
    path: path.relative(REPOSITORY_ROOT, file),
    data: JSON.parse(fs.readFileSync(file, "utf8")),
  }));
  const byType = (type) => documents.filter(({ data }) => data.documentType === type);
  return {
    documents,
    branchCapsules: byType("clover-handoff-branch-capsule"),
    envelopes: byType("clover-handoff-action-envelope"),
    receipts: byType("clover-handoff-execution-receipt"),
    reviews: byType("clover-handoff-independent-review-decision"),
    indexes: byType("clover-handoff-action-receipt-index"),
  };
}

function loadHandoff(indexPath, discovered = discoverHandoffDocuments()) {
  const index = readJson(indexPath);
  const envelopeIds = new Set(index.entries.map((entry) => entry.envelopeId));
  const receiptIds = new Set(index.entries.map((entry) => entry.receiptId).filter(Boolean));
  const reviewIds = new Set(index.entries.map((entry) => entry.review?.decisionId).filter(Boolean));
  return {
    branchCapsules: discovered.branchCapsules.map(({ data }) => data),
    envelopes: discovered.envelopes.filter(({ data }) => envelopeIds.has(data.envelopeId)).map(({ data }) => data),
    receipts: discovered.receipts.filter(({ data }) => receiptIds.has(data.receiptId)).map(({ data }) => data),
    reviews: discovered.reviews.filter(({ data }) => reviewIds.has(data.decisionId)).map(({ data }) => data),
    index,
  };
}

const HANDOFF_CELL_DIRECTORY = "portfolio/core/handoff/versions/0.1.0/cells";

function capsuleBinding(capsule) {
  return `${capsule.capsuleId}:${capsule.capsuleHash}`;
}

function exactDocument(documents, predicate, label) {
  const matches = documents.filter(predicate);
  invariant(matches.length === 1, `${label} must resolve exactly once`);
  return matches[0];
}

export function assertBranchCapsuleReachability(discovered, index) {
  invariant(Array.isArray(discovered?.branchCapsules), "Branch capsule discovery is unavailable");
  invariant(Array.isArray(discovered?.envelopes), "Action envelope discovery is unavailable");
  invariant(Array.isArray(discovered?.receipts), "Execution receipt discovery is unavailable");
  invariant(Array.isArray(index?.entries), "Current Handoff index is unavailable");

  const inputCapsuleBindings = new Set();
  const indexedReceipts = [];
  for (const entry of index.entries) {
    const envelope = exactDocument(discovered.envelopes,
      ({ data }) => data.envelopeId === entry.envelopeId && data.envelopeHash === entry.envelopeHash,
      `Indexed envelope ${entry.envelopeId}`).data;
    invariant(envelope.branchCapsuleId === entry.branchCapsuleId &&
      envelope.branchCapsuleHash === entry.branchCapsuleHash,
    `Indexed envelope ${entry.envelopeId} changed its input capsule binding`);
    const inputCapsule = exactDocument(discovered.branchCapsules,
      ({ data }) => data.capsuleId === entry.branchCapsuleId &&
        data.capsuleHash === entry.branchCapsuleHash,
      `Input capsule ${entry.branchCapsuleId}`).data;
    inputCapsuleBindings.add(capsuleBinding(inputCapsule));

    if (entry.receiptId !== null) {
      const receipt = exactDocument(discovered.receipts,
        ({ data }) => data.receiptId === entry.receiptId && data.receiptHash === entry.receiptHash,
        `Indexed receipt ${entry.receiptId}`).data;
      invariant(receipt.branchCapsuleId === inputCapsule.capsuleId &&
        receipt.branchCapsuleHash === inputCapsule.capsuleHash &&
        receipt.reconciliation.inputCapsuleId === inputCapsule.capsuleId &&
        receipt.reconciliation.inputCapsuleHash === inputCapsule.capsuleHash,
      `Indexed receipt ${entry.receiptId} changed its input capsule binding`);
      indexedReceipts.push({ receipt, inputCapsule });
    }
  }

  const resultReferences = new Map();
  for (const { receipt, inputCapsule } of indexedReceipts) {
    const reconciliation = receipt.reconciliation;
    if (reconciliation.status !== "discovered") {
      invariant(reconciliation.resultCapsuleId === null && reconciliation.resultCapsulePath === null &&
        reconciliation.resultCapsuleHash === null,
      `Receipt ${receipt.receiptId} carries an unreachable reconciliation result`);
      continue;
    }
    invariant(receipt.outcome === "succeeded", `Receipt ${receipt.receiptId} did not succeed before recording a result capsule`);
    invariant(reconciliation.resultCapsuleId !== inputCapsule.capsuleId &&
      reconciliation.resultCapsuleHash !== inputCapsule.capsuleHash,
    `Receipt ${receipt.receiptId} reuses its input capsule as a reconciliation result`);
    const result = exactDocument(discovered.branchCapsules,
      ({ path: capsulePath, data }) => capsulePath === reconciliation.resultCapsulePath &&
        data.capsuleId === reconciliation.resultCapsuleId && data.capsuleHash === reconciliation.resultCapsuleHash,
      `Result capsule for receipt ${receipt.receiptId}`);
    invariant(!resultReferences.has(result.path),
      `Result capsule ${result.path} is referenced by more than one successful receipt`);
    invariant(result.data.project.projectId === receipt.resultingState.projectId,
      `Result capsule ${result.path} changed the receipt project identity`);
    resultReferences.set(result.path, { receipt, capsule: result.data });
  }

  const rootsByProject = new Map();
  for (const capsule of discovered.branchCapsules) {
    const projectId = capsule.data.project.projectId;
    const canonicalRootPath = `${HANDOFF_CELL_DIRECTORY}/${projectId}.branch-capsule.json`;
    const resultReference = resultReferences.get(capsule.path);
    if (capsule.path === canonicalRootPath) {
      invariant(!resultReference, `Catalog root capsule ${capsule.path} cannot also be a reconciliation result`);
      const roots = rootsByProject.get(projectId) || [];
      roots.push(capsule);
      rootsByProject.set(projectId, roots);
      continue;
    }
    invariant(resultReference,
      `Non-root branch capsule ${capsule.path} is not reachable from one indexed successful receipt`);
  }

  const projectIds = new Set(discovered.branchCapsules.map(({ data }) => data.project.projectId));
  for (const projectId of projectIds) {
    const roots = rootsByProject.get(projectId) || [];
    invariant(roots.length === 1, `Project ${projectId} must have exactly one canonical catalog root capsule`);
  }
  for (const [capsulePath, { receipt, capsule }] of resultReferences) {
    const [root] = rootsByProject.get(capsule.project.projectId) || [];
    invariant(root, `Result capsule ${capsulePath} has no canonical project root`);
    invariant(Date.parse(capsule.recordedAt) > Date.parse(root.data.recordedAt),
      `Result capsule ${capsulePath} does not succeed its canonical project root`);
    invariant(Date.parse(capsule.recordedAt) >= Date.parse(receipt.startedAt) &&
      Date.parse(capsule.recordedAt) <= Date.parse(receipt.completedAt),
    `Result capsule ${capsulePath} was not recorded during its successful receipt`);
  }

  const catalogRoots = [...rootsByProject.values()].flat();

  return {
    valid: true,
    branchCapsuleCount: discovered.branchCapsules.length,
    catalogRootCapsuleCount: catalogRoots.length,
    inputCapsuleCount: inputCapsuleBindings.size,
    resultCapsuleCount: resultReferences.size,
    catalogRootCapsuleHashes: catalogRoots.map(({ data }) => data.capsuleHash).sort(),
    inputCapsuleHashes: [...inputCapsuleBindings].map((binding) => binding.slice(binding.lastIndexOf(":") + 1)).sort(),
    resultCapsuleHashes: [...resultReferences.values()].map(({ capsule }) => capsule.capsuleHash).sort(),
  };
}

function verifyCurrentIndexChain(discovered) {
  const rootBytes = readBytes(PATHS.handoffRootIndex);
  const rootIndex = JSON.parse(rootBytes.toString("utf8"));
  const exactCandidates = discovered.indexes.filter(({ path: indexPath }) => readBytes(indexPath).equals(rootBytes));
  invariant(exactCandidates.length === 1, "Root Handoff index must equal exactly one immutable versioned index");
  const chain = [];
  const seen = new Set();
  let currentPath = exactCandidates[0].path;
  let current = rootIndex;
  let rootResult = null;
  let capsuleReachability = null;
  while (true) {
    invariant(!seen.has(currentPath), "Handoff index chain contains a cycle");
    seen.add(currentPath);
    const result = validateHandoffLedger(loadHandoff(currentPath, discovered), { repositoryRoot: REPOSITORY_ROOT });
    if (!rootResult) {
      rootResult = result;
      capsuleReachability = assertBranchCapsuleReachability(discovered, current);
    }
    chain.push({ path: currentPath, index: current });
    if (current.previousIndexPath === null) {
      invariant(current.previousIndexHash === null, "Initial Handoff index carries an orphan previous hash");
      break;
    }
    invariant(current.previousIndexPath.startsWith("portfolio/core/handoff/versions/0.1.0/indexes/"),
      "Handoff previous index escapes the immutable index directory");
    const previous = readJson(current.previousIndexPath);
    invariant(previous.indexHash === current.previousIndexHash, "Handoff previous-index hash is stale");
    validateIndexTransition(previous, current);
    currentPath = current.previousIndexPath;
    current = previous;
  }
  return { rootResult, rootIndex, chain, capsuleReachability };
}

export function assertTodayHandoffBinding(today, sessionIndex, chain) {
  invariant(sessionIndex.indexHash === today.handoffIndexHash, "Today Handoff snapshot hash is stale");
  invariant(chain.some(({ path: indexPath, index }) => indexPath === today.handoffIndexPath && index.indexHash === today.handoffIndexHash),
    "Today Handoff snapshot is not in the current append-only index chain");
  const matches = sessionIndex.entries.filter((entry) => entry.actionId === today.actionId);
  invariant(matches.length === 1, "Today Action ID does not resolve exactly once in the Handoff index");
  const [entry] = matches;
  invariant(entry.envelopePath === today.envelopePath && entry.envelopeHash === today.envelopeHash, "Today action path/hash is not bound to the Handoff index");
  invariant(entry.status === "pending" && entry.outcome === "pending", "Today action is not pending in its dated snapshot");
  invariant(entry.lifecycle.state === "proposed" && entry.lifecycle.singleUse === true, "Today action is not a single-use proposal in its dated snapshot");
  invariant(entry.lifecycle.consumedAt === null && entry.lifecycle.revokedAt === null, "Today action snapshot is consumed or revoked");
  invariant(entry.ownerApproval.status === "pending", "Today action snapshot must remain owner-approval pending");
  invariant(entry.receiptId === null && entry.receiptHash === null, "Today action snapshot must not have an execution receipt");
  return entry;
}

function verifyHandoffAndToday(today) {
  const discovered = discoverHandoffDocuments();
  const current = verifyCurrentIndexChain(discovered);
  invariant(typeof today.handoffIndexPath === "string" && typeof today.handoffIndexHash === "string",
    "Today does not bind an immutable Handoff index snapshot");
  const sessionIndex = readJson(today.handoffIndexPath);
  const handoff = loadHandoff(today.handoffIndexPath, discovered);
  validateHandoffLedger(handoff, { repositoryRoot: REPOSITORY_ROOT });
  assertTodayHandoffBinding(today, sessionIndex, current.chain);
  return {
    ...current.rootResult,
    capsuleReachability: current.capsuleReachability,
    currentIndexHash: current.rootIndex.indexHash,
    todayIndexHash: sessionIndex.indexHash,
    indexChainLength: current.chain.length,
  };
}

function verifyStatusPriorityToday(records) {
  const metricById = new Map(records.status.metrics.map((metric) => [metric.id, metric]));
  for (const metric of records.today.metrics) {
    const statusMetric = metricById.get(metric.metricId);
    invariant(statusMetric, `Today references unknown status metric: ${metric.metricId}`);
    invariant(metric.completionEstimate === statusMetric.completionEstimate, `Today metric differs from candidate status: ${metric.metricId}`);
    invariant(metric.stateClass === statusMetric.stateClass && metric.confidence === statusMetric.confidence,
      `Today metric classification differs from candidate status: ${metric.metricId}`);
  }
  invariant(records.today.topPriorities.length === 3, "Today must expose exactly three overall priorities");
  records.today.topPriorities.forEach((priority, index) => {
    const ranked = records.priorityOutput.top3Overall[index];
    invariant(priority.rank === index + 1 && priority.targetId === ranked.targetId &&
      priority.weightedScore === ranked.weightedScore && priority.status === ranked.status,
    `Today priority ${index + 1} differs from deterministic overall ranking`);
  });
  invariant(records.today.recommendation.targetId === records.priorityOutput.recommendedAffiliatedTargetId,
    "Today recommendation differs from the deterministic eligible recommendation");
  invariant(records.today.privacy.publicSanitizedProjection === true &&
    records.today.privacy.containsRawCellData === false &&
    records.today.privacy.containsPlaintextSecrets === false &&
    records.today.privacy.containsProductionPrivateData === false,
  "Today privacy declaration is not fail closed");
}

function verifyOperatorContracts() {
  const required = new Map([
    ["CLOVER_OWNER_START.md", ["Use Clover Core.", "Target: [target]", "Outcome: [outcome]", "Mode: [mode]"]],
    ["CODEX_CLOVER_OPERATOR.md", ["Use CloverApps to execute approved Action ID", "does not approve"]],
    ["CLOVER_CONNECTOR_ROUTING.md", ["minimum", "read-only"]],
    ["CLOVER_HANDOFF_LEDGER.md", ["single-use", "standing production authority"]],
    ["CHATGPT_PROJECT_INSTRUCTIONS.md", ["APPROVE", "AMEND", "HOLD"]],
  ]);
  for (const [relativePath, phrases] of required) {
    const text = readBytes(relativePath).toString("utf8");
    for (const phrase of phrases) invariant(text.toLowerCase().includes(phrase.toLowerCase()), `${relativePath} is missing required operator contract phrase: ${phrase}`);
  }
}

function verifySanitizedProjection(records, handoff) {
  const serialized = canonicalize({ records, handoff });
  for (const pattern of [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}/,
    /\bgh[pousr]_[A-Za-z0-9]{20,}/,
    /\bAIza[A-Za-z0-9_-]{20,}/,
    /Bearer\s+[A-Za-z0-9._~-]+/,
  ]) invariant(!pattern.test(serialized), `Candidate projection contains secret-like material: ${pattern}`);
}

export function validateCoreActivation() {
  const records = {
    status: readJson(PATHS.status),
    priorityInput: readJson(PATHS.priorityInput),
    priorityOutput: readJson(PATHS.priorityOutput),
    today: readJson(PATHS.today),
  };
  verifyProtectedBytes();
  verifySchemas(records);
  verifySelfHashes(records);
  verifyStatusPriorityToday(records);
  const handoffResult = verifyHandoffAndToday(records.today);
  verifyOperatorContracts();
  verifySanitizedProjection(records, loadHandoff(records.today.handoffIndexPath));
  invariant(records.status.authority.standingProductionAuthority === false, "Candidate status grants standing production authority");
  invariant(records.status.authority.mergeApproved === false, "Candidate status grants merge authority");
  return {
    status: "passed",
    candidateStatusHash: records.status.statusHash,
    priorityInputHash: records.priorityInput.priorityInputHash,
    priorityOutputHash: records.priorityOutput.priorityOutputHash,
    todaySessionHash: records.today.sessionHash,
    actionId: records.today.actionId,
    envelopeHash: records.today.envelopeHash,
    handoffIndexHash: handoffResult.currentIndexHash,
    todayHandoffIndexHash: handoffResult.todayIndexHash,
    handoffIndexChainLength: handoffResult.indexChainLength,
    protectedArtifactCount: Object.keys(PROTECTED_BYTES).length,
    branchCapsuleCount: handoffResult.capsuleReachability.branchCapsuleCount,
    catalogRootCapsuleCount: handoffResult.capsuleReachability.catalogRootCapsuleCount,
    inputBranchCapsuleCount: handoffResult.capsuleReachability.inputCapsuleCount,
    resultBranchCapsuleCount: handoffResult.capsuleReachability.resultCapsuleCount,
    authorityGranted: [],
    mergePerformed: false,
    productionDeploymentPerformed: false,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(validateCoreActivation(), null, 2)}\n`);
}
