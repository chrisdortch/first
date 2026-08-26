import fs from "node:fs";
import path from "node:path";

import { canonicalize, sha256Bytes, sha256Canonical } from "../../../../lib/canonical-json.mjs";
import { validateJsonSchema } from "../../../../lib/validators.mjs";

export const TREE_PROGRAM_ROOT = "portfolio/core/tree-program";
export const TREE_PROGRAM_SCHEMA_PATH = `${TREE_PROGRAM_ROOT}/versions/0.1.0/schemas/tree-program.schema.json`;
export const TREE_PROGRAM_RUNTIME_PATH = `${TREE_PROGRAM_ROOT}/versions/0.1.0/runtime/tree-program.mjs`;
export const TREE_PROGRAM_IMMUTABLE_INDEX_PATH = `${TREE_PROGRAM_ROOT}/versions/0.1.0/indexes/tree-program-index-0001.json`;
export const TREE_PROGRAM_STABLE_INDEX_PATH = `${TREE_PROGRAM_ROOT}/index.json`;
export const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../../../../..");

export const TREE_PROGRAM_RECORD_PATHS = Object.freeze([
  ["tree-program:branch-records:0.1.0", `${TREE_PROGRAM_ROOT}/versions/0.1.0/records/branch-records.json`],
  ["tree-program:captains-log-owner-event-references:0.1.0", `${TREE_PROGRAM_ROOT}/versions/0.1.0/records/captains-log-owner-event-references.json`],
  ["tree-program:fruit-forecasts:0.1.0", `${TREE_PROGRAM_ROOT}/versions/0.1.0/records/fruit-forecasts.json`],
  ["tree-program:fruit-observations:0.1.0", `${TREE_PROGRAM_ROOT}/versions/0.1.0/records/fruit-observations.json`],
  ["tree-program:model-launch-packets:0.1.0", `${TREE_PROGRAM_ROOT}/versions/0.1.0/records/model-launch-packets.json`],
  ["tree-program:owner-action-cards:0.1.0", `${TREE_PROGRAM_ROOT}/versions/0.1.0/records/owner-action-cards.json`],
  ["tree-program:program-milestones:0.1.0", `${TREE_PROGRAM_ROOT}/versions/0.1.0/records/program-milestones.json`],
  ["tree-program:program-progress-events:0.1.0", `${TREE_PROGRAM_ROOT}/versions/0.1.0/records/program-progress-events.json`],
  ["tree-program:program-status-snapshot:0.1.0", `${TREE_PROGRAM_ROOT}/versions/0.1.0/records/program-status-snapshot.json`],
  ["tree-program:provider-degraded-status:0.1.0", `${TREE_PROGRAM_ROOT}/versions/0.1.0/records/provider-degraded-status.json`],
  ["tree-program:source-coverage:0.1.0", `${TREE_PROGRAM_ROOT}/versions/0.1.0/records/source-coverage.json`],
  ["tree-program:tree-branch-relationships:0.1.0", `${TREE_PROGRAM_ROOT}/versions/0.1.0/records/tree-branch-relationships.json`],
  ["tree-program:tree-master-plan:0.1.0", `${TREE_PROGRAM_ROOT}/versions/0.1.0/records/tree-master-plan.json`],
  ["tree-program:understanding-delta-references:0.1.0", `${TREE_PROGRAM_ROOT}/versions/0.1.0/records/understanding-delta-references.json`]
]);

const FORBIDDEN_PUBLIC_PATTERNS = Object.freeze([
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/u,
  /\bgh[oprsu]_[A-Za-z0-9]{20,}\b/u,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/u,
  /(?:\/Users\/[^/\s"']+|\/home\/[^/\s"']+)/u
]);

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function resolveRegular(root, relative, label) {
  if (typeof relative !== "string" || relative.startsWith("/") || relative.includes("\\") ||
      relative.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`${label} has an unsafe path`);
  }
  const resolvedRoot = path.resolve(root);
  const absolute = path.resolve(resolvedRoot, relative);
  if (absolute === resolvedRoot || !absolute.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error(`${label} escapes repository root`);
  let cursor = resolvedRoot;
  for (const segment of relative.split("/")) {
    cursor = path.join(cursor, segment);
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) throw new Error(`${label} resolves through a symbolic link`);
  }
  const final = fs.lstatSync(absolute);
  if (!final.isFile() || final.isSymbolicLink()) throw new Error(`${label} is not a regular file`);
  return absolute;
}

function readCanonical(root, relative, label) {
  const absolute = resolveRegular(root, relative, label);
  const bytes = fs.readFileSync(absolute);
  const value = JSON.parse(bytes);
  if (!bytes.equals(Buffer.from(`${canonicalize(value)}\n`, "utf8"))) throw new Error(`${label} is not canonical JSON`);
  return { absolute, bytes, value };
}

function readJson(root, relative, label) {
  const absolute = resolveRegular(root, relative, label);
  const bytes = fs.readFileSync(absolute);
  return { absolute, bytes, value: JSON.parse(bytes) };
}

function validateSelfHash(document, label) {
  assertObject(document, label);
  const { selfHash, ...unsigned } = document;
  if (!/^[a-f0-9]{64}$/u.test(selfHash) || sha256Canonical(unsigned) !== selfHash) {
    throw new Error(`${label} self-hash mismatch`);
  }
}

function validatePublicProjection(value, label) {
  const text = canonicalize(value);
  for (const pattern of FORBIDDEN_PUBLIC_PATTERNS) {
    if (pattern.test(text)) throw new Error(`${label} contains prohibited public content`);
  }
  for (const forbiddenKey of ["transcript", "providerSubject", "participantId", "workspaceId", "rawAudio", "secret", "credential"]) {
    if (new RegExp(`"${forbiddenKey}"\\s*:`, "iu").test(text)) throw new Error(`${label} contains private key ${forbiddenKey}`);
  }
}

function unique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicates`);
}

function validateRecordSemantics(documents) {
  const byType = new Map(documents.map((document) => [document.documentType, document]));
  const branches = byType.get("clover-tree-branch-records")?.records ?? [];
  if (branches.length < 20) throw new Error("Tree Program omits required branch families");
  unique(branches.map(({ branchId }) => branchId), "Tree branch IDs");
  const branchIds = new Set(branches.map(({ branchId }) => branchId));
  for (const branch of branches) {
    for (const dependency of branch.dependencies) {
      if (!branchIds.has(dependency)) throw new Error(`Unknown Tree branch dependency ${dependency}`);
    }
  }
  const relationships = byType.get("clover-tree-branch-relationships")?.records ?? [];
  unique(relationships.map(({ relationshipId }) => relationshipId), "Tree relationship IDs");
  for (const relationship of relationships) {
    if (!branchIds.has(relationship.fromBranchId) || !branchIds.has(relationship.toBranchId)) {
      throw new Error(`Tree relationship references an unknown branch ${relationship.relationshipId}`);
    }
  }
  const requiredTitles = [
    "Clover Core", "Context Gateway", "Knowledge Hub / Vault", "CloverApps", "Launch Studio",
    "Captain's Log", "Fruit Ledger", "WarRoom", "Serenity operations and commerce", "Boat Rentals",
    "Cart Waiver", "PropertyCare / Booking Central", "Maps and Guest App", "SongAndStage", "RollinD / media",
    "Branson partnership / JV program", "Vibe Translator and relationship tools", "Property and financial opportunities",
    "Personal Launch Pods", "Personal Sites Studio", "Team collaboration and JV spine"
  ];
  for (const title of requiredTitles) {
    if (!branches.some((branch) => branch.title === title)) throw new Error(`Tree Program omits branch ${title}`);
  }
  const packets = byType.get("clover-tree-model-launch-packets")?.records ?? [];
  const packetTargets = new Set(packets.flatMap(({ details }) => details.filter(({ key }) => key === "targetClass").map(({ value }) => value)));
  for (const target of ["ChatGPT Personal Pro", "Codex 5.6 Sol Ultra", "Personal Sites Studio", "CloverApps collaboration"]) {
    if (!packetTargets.has(target)) throw new Error(`Tree Program omits model packet target ${target}`);
  }
  const provider = byType.get("clover-tree-provider-degraded-status")?.records ?? [];
  if (!provider.some((record) => record.status === "provider-degraded")) throw new Error("Provider-degraded evidence is missing");
}

export function validateTreeProgram(options = {}) {
  const root = options.repositoryRoot ?? REPOSITORY_ROOT;
  const stablePath = options.stableIndexPath ?? TREE_PROGRAM_STABLE_INDEX_PATH;
  const immutablePath = options.immutableIndexPath ?? TREE_PROGRAM_IMMUTABLE_INDEX_PATH;
  const stable = readCanonical(root, stablePath, "stable Tree Program index");
  const immutable = readCanonical(root, immutablePath, "immutable Tree Program index");
  if (!stable.bytes.equals(immutable.bytes)) throw new Error("Stable Tree Program index differs from immutable index 0001");
  const index = stable.value;
  const { indexHash, ...indexUnsigned } = index;
  if (!/^[a-f0-9]{64}$/u.test(indexHash) || sha256Canonical(indexUnsigned) !== indexHash) {
    throw new Error("Tree Program index hash mismatch");
  }
  const schema = readJson(root, TREE_PROGRAM_SCHEMA_PATH, "Tree Program schema");
  validateJsonSchema(schema.value, index, { schemaDirectory: path.dirname(schema.absolute), label: "Tree Program index" });
  const expectedFiles = new Map(TREE_PROGRAM_RECORD_PATHS);
  if (index.recordFiles.length !== expectedFiles.size) throw new Error("Tree Program index record cardinality mismatch");
  const documents = [];
  for (const binding of index.recordFiles) {
    if (expectedFiles.get(binding.recordSetId) !== binding.path) throw new Error("Tree Program record path or ID substitution detected");
    expectedFiles.delete(binding.recordSetId);
    const record = readCanonical(root, binding.path, `Tree Program record ${binding.recordSetId}`);
    if (sha256Bytes(record.bytes) !== binding.sha256 || record.value.recordSetId !== binding.recordSetId) {
      throw new Error(`Tree Program record binding mismatch ${binding.recordSetId}`);
    }
    validateJsonSchema(schema.value, record.value, { schemaDirectory: path.dirname(schema.absolute), label: binding.recordSetId });
    validateSelfHash(record.value, binding.recordSetId);
    validatePublicProjection(record.value, binding.recordSetId);
    unique(record.value.records.map((entry) => entry.recordId ?? entry.branchId ?? entry.relationshipId), `${binding.recordSetId} record IDs`);
    documents.push(record.value);
  }
  if (expectedFiles.size !== 0) throw new Error("Tree Program index omits a required record");
  const expectedDependencies = [TREE_PROGRAM_SCHEMA_PATH, TREE_PROGRAM_RUNTIME_PATH];
  if (index.dependencies.length !== expectedDependencies.length) throw new Error("Tree Program dependency cardinality mismatch");
  for (const [offset, expectedPath] of expectedDependencies.entries()) {
    const dependency = index.dependencies[offset];
    if (dependency.path !== expectedPath) throw new Error("Tree Program dependency path substitution detected");
    const bytes = fs.readFileSync(resolveRegular(root, dependency.path, "Tree Program dependency"));
    if (sha256Bytes(bytes) !== dependency.sha256) throw new Error("Tree Program live dependency digest mismatch");
  }
  validateRecordSemantics(documents);
  return {
    valid: true,
    indexId: index.indexId,
    indexHash,
    rawSha256: sha256Bytes(stable.bytes),
    recordFileCount: index.recordFiles.length,
    branchCount: documents.find((document) => document.documentType === "clover-tree-branch-records").records.length,
    relationshipCount: documents.find((document) => document.documentType === "clover-tree-branch-relationships").records.length,
    publicSanitized: true,
    privateDataAccessed: false,
    consequentialAuthorityGranted: false
  };
}
