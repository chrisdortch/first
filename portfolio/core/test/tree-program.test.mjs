import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalize, sha256Canonical } from "../lib/canonical-json.mjs";
import {
  TREE_PROGRAM_IMMUTABLE_INDEX_PATH,
  TREE_PROGRAM_RECORD_PATHS,
  TREE_PROGRAM_STABLE_INDEX_PATH,
  validateTreeProgram
} from "../tree-program/versions/0.1.0/runtime/tree-program.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const treeProgramRoot = path.join(repositoryRoot, "portfolio/core/tree-program");
const immutableIndex = path.join(repositoryRoot, TREE_PROGRAM_IMMUTABLE_INDEX_PATH);
const stableIndex = path.join(repositoryRoot, TREE_PROGRAM_STABLE_INDEX_PATH);
const rawHash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const read = (relative) => JSON.parse(fs.readFileSync(path.join(repositoryRoot, relative), "utf8"));

function tempRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clover-tree-program-"));
  fs.cpSync(treeProgramRoot, path.join(root, "portfolio/core/tree-program"), { recursive: true });
  return root;
}

function writeCanonical(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${canonicalize(value)}\n`, "utf8");
}

test("Tree Program index binds all canonical sanitized records", () => {
  const result = validateTreeProgram({ repositoryRoot });
  assert.deepEqual(result, {
    valid: true,
    indexId: "tree-program:index:0001",
    indexHash: "897b7967069f9ec699fcef76175dcdee8a91513b43b3cbf046f840760c7d34d0",
    rawSha256: "2f23ed3a433db34cabec9850427f8e17a252b120d97ee018a9302ab1b4b92b81",
    recordFileCount: 14,
    branchCount: 22,
    relationshipCount: 21,
    publicSanitized: true,
    privateDataAccessed: false,
    consequentialAuthorityGranted: false
  });
  assert.deepEqual(fs.readFileSync(stableIndex), fs.readFileSync(immutableIndex));
  assert.equal(rawHash(fs.readFileSync(stableIndex)), result.rawSha256);
});

test("Tree branches expose explicit source, authority, health, fruit and next-gate truth", () => {
  const branches = read("portfolio/core/tree-program/versions/0.1.0/records/branch-records.json").records;
  const requiredFields = [
    "canonicalHome", "owner", "authorizedRoles", "purpose", "sources", "liveIdentity", "candidateIdentity",
    "deployment", "rollback", "backupRestore", "dataClassification", "allowedCoreProjection", "connectorScope",
    "currentHealth", "sourceFreshness", "trajectory", "dependencies", "collaborators", "nextGate",
    "predictedFruit", "observedFruit", "unknowns"
  ];
  for (const branch of branches) {
    for (const field of requiredFields) assert.ok(Object.hasOwn(branch, field), `${branch.branchId} is missing ${field}`);
  }
  const launch = branches.find(({ branchId }) => branchId === "branch:launch-studio");
  assert.match(launch.candidateIdentity, /582427e403fe96ccfea85db365a210421e76e16e/u);
  assert.equal(launch.currentHealth, "candidate");
  const handoff = branches.find(({ branchId }) => branchId === "branch:handoff-protection");
  assert.equal(handoff.currentHealth, "hold");
  assert.notEqual(launch.predictedFruit, launch.observedFruit);
});

test("Tree relationships are typed, directed and endpoint-complete", () => {
  const branchIds = new Set(read("portfolio/core/tree-program/versions/0.1.0/records/branch-records.json").records.map(({ branchId }) => branchId));
  const relationships = read("portfolio/core/tree-program/versions/0.1.0/records/tree-branch-relationships.json").records;
  assert.equal(relationships.length, 21);
  for (const relationship of relationships) {
    assert.equal(relationship.direction, "directed");
    assert.ok(branchIds.has(relationship.fromBranchId));
    assert.ok(branchIds.has(relationship.toBranchId));
    assert.match(relationship.relationshipType, /^(?:feeds|governs|protects|records|builds|observes|projects-to|depends-on|collaborates-with)$/u);
  }
});

test("provider degradation stays distinct from deterministic source failure", () => {
  const records = read("portfolio/core/tree-program/versions/0.1.0/records/provider-degraded-status.json").records;
  const degraded = records.filter(({ status }) => status === "provider-degraded");
  assert.deepEqual(degraded.map(({ recordId }) => recordId), [
    "provider-degraded:core-32984759023",
    "provider-degraded:master-32984759211"
  ]);
  for (const record of degraded) {
    assert.equal(record.details.find(({ key }) => key === "sourceFailure")?.value, "false");
  }
  assert.ok(records.some(({ recordId }) => recordId === "provider-evidence:required-main"));
  assert.ok(records.some(({ recordId }) => recordId === "provider-evidence:gateway"));
});

test("model launch packets cover all supported targets without conveying consequential authority", () => {
  const packets = read("portfolio/core/tree-program/versions/0.1.0/records/model-launch-packets.json").records;
  const detailMap = (record) => Object.fromEntries(record.details.map(({ key, value }) => [key, value]));
  assert.deepEqual(packets.map((packet) => detailMap(packet).targetClass), [
    "ChatGPT Personal Pro",
    "Codex 5.6 Sol Ultra",
    "Personal Sites Studio",
    "CloverApps collaboration"
  ]);
  for (const packet of packets) {
    const details = detailMap(packet);
    for (const key of ["productUrl", "target", "outcome", "mode", "sourceAnchors", "preservationRules", "cost", "risk", "rollback", "stopConditions", "requiredReceipt"]) {
      assert.ok(details[key], `${packet.recordId} is missing ${key}`);
    }
    assert.match(details.preservationRules, /no merge, production, private-data or provider authority/u);
  }
});

test("record rewrite, omission and path substitution fail closed", () => {
  const root = tempRepository();
  const [recordId, recordPath] = TREE_PROGRAM_RECORD_PATHS[0];
  const absolute = path.join(root, recordPath);
  const record = JSON.parse(fs.readFileSync(absolute, "utf8"));
  record.records[0].title = "rewritten";
  record.selfHash = sha256Canonical(Object.fromEntries(Object.entries(record).filter(([key]) => key !== "selfHash")));
  writeCanonical(absolute, record);
  assert.throws(() => validateTreeProgram({ repositoryRoot: root }), new RegExp(`record binding mismatch ${recordId}`));

  const omittedRoot = tempRepository();
  fs.unlinkSync(path.join(omittedRoot, TREE_PROGRAM_RECORD_PATHS[1][1]));
  assert.throws(() => validateTreeProgram({ repositoryRoot: omittedRoot }), /ENOENT/u);

  const substitutedRoot = tempRepository();
  const stable = JSON.parse(fs.readFileSync(path.join(substitutedRoot, TREE_PROGRAM_STABLE_INDEX_PATH), "utf8"));
  stable.recordFiles[0].path = TREE_PROGRAM_RECORD_PATHS[1][1];
  stable.indexHash = sha256Canonical(Object.fromEntries(Object.entries(stable).filter(([key]) => key !== "indexHash")));
  writeCanonical(path.join(substitutedRoot, TREE_PROGRAM_STABLE_INDEX_PATH), stable);
  writeCanonical(path.join(substitutedRoot, TREE_PROGRAM_IMMUTABLE_INDEX_PATH), stable);
  assert.throws(() => validateTreeProgram({ repositoryRoot: substitutedRoot }), /path or ID substitution/u);

  const traversalRoot = tempRepository();
  const traversalIndex = JSON.parse(fs.readFileSync(path.join(traversalRoot, TREE_PROGRAM_STABLE_INDEX_PATH), "utf8"));
  traversalIndex.recordFiles[0].path = "../outside.json";
  traversalIndex.indexHash = sha256Canonical(Object.fromEntries(Object.entries(traversalIndex).filter(([key]) => key !== "indexHash")));
  writeCanonical(path.join(traversalRoot, TREE_PROGRAM_STABLE_INDEX_PATH), traversalIndex);
  writeCanonical(path.join(traversalRoot, TREE_PROGRAM_IMMUTABLE_INDEX_PATH), traversalIndex);
  assert.throws(() => validateTreeProgram({ repositoryRoot: traversalRoot }), /JSON Schema violation at Tree Program index: oneOf matched 0 branches/u);
});

test("dependency rewrite, duplication and symlink substitution fail closed", () => {
  const rewrittenRoot = tempRepository();
  const runtime = path.join(rewrittenRoot, "portfolio/core/tree-program/versions/0.1.0/runtime/tree-program.mjs");
  fs.appendFileSync(runtime, "\n");
  assert.throws(() => validateTreeProgram({ repositoryRoot: rewrittenRoot }), /live dependency digest mismatch/u);

  const duplicateRoot = tempRepository();
  const duplicateIndex = JSON.parse(fs.readFileSync(path.join(duplicateRoot, TREE_PROGRAM_STABLE_INDEX_PATH), "utf8"));
  duplicateIndex.dependencies[1] = structuredClone(duplicateIndex.dependencies[0]);
  duplicateIndex.indexHash = sha256Canonical(Object.fromEntries(Object.entries(duplicateIndex).filter(([key]) => key !== "indexHash")));
  writeCanonical(path.join(duplicateRoot, TREE_PROGRAM_STABLE_INDEX_PATH), duplicateIndex);
  writeCanonical(path.join(duplicateRoot, TREE_PROGRAM_IMMUTABLE_INDEX_PATH), duplicateIndex);
  assert.throws(() => validateTreeProgram({ repositoryRoot: duplicateRoot }), /dependency path substitution detected/u);

  const symlinkRoot = tempRepository();
  const symlinkPath = path.join(symlinkRoot, TREE_PROGRAM_RECORD_PATHS[0][1]);
  const target = `${symlinkPath}.target`;
  fs.renameSync(symlinkPath, target);
  fs.symlinkSync(target, symlinkPath);
  assert.throws(() => validateTreeProgram({ repositoryRoot: symlinkRoot }), /symbolic link/u);
});

test("all Tree Program paths are regular files and the record catalog is exact", () => {
  const index = read(TREE_PROGRAM_STABLE_INDEX_PATH);
  assert.deepEqual(index.recordFiles.map(({ recordSetId, path: recordPath }) => [recordSetId, recordPath]), TREE_PROGRAM_RECORD_PATHS);
  for (const relative of [TREE_PROGRAM_STABLE_INDEX_PATH, TREE_PROGRAM_IMMUTABLE_INDEX_PATH, ...index.recordFiles.map(({ path: recordPath }) => recordPath)]) {
    const stat = fs.lstatSync(path.join(repositoryRoot, relative));
    assert.equal(stat.isFile(), true);
    assert.equal(stat.isSymbolicLink(), false);
  }
});
