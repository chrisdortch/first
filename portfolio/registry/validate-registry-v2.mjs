#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateJsonSchema } from "../core/lib/validators.mjs";
import { projectRegistryForCore } from "./lib/projection.mjs";

const FILE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(FILE_DIRECTORY, "../..");
const DIMENSIONS = ["release", "sitesSave", "commit", "pullRequest", "deployment", "dataSchema", "backup", "verification", "rollback"];
const EVIDENCE_REQUIRED = new Set(["verified", "partially-verified"]);
const NULL_REQUIRED = new Set(["unknown", "not-applicable"]);

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function recordMap(registry) {
  return new Map(registry.records.map((record) => [record.projectId, record]));
}

function getRecord(records, projectId) {
  const record = records.get(projectId);
  assert.ok(record, `Missing required registry record ${projectId}`);
  return record;
}

function identity(record, identityId) {
  const result = record.versionIdentities.find((entry) => entry.identityId === identityId);
  assert.ok(result, `${record.projectId} is missing identity ${identityId}`);
  return result;
}

export function validateRegistryDocuments({ root = DEFAULT_ROOT, pointer, registry, projection, legacyBytes } = {}) {
  pointer ||= readJson(root, "portfolio/registry/REGISTRY_POINTER.json");
  registry ||= readJson(root, pointer.candidate.document);
  projection ||= readJson(root, pointer.candidate.projection);
  legacyBytes ||= fs.readFileSync(path.join(root, pointer.current.path));

  assert.equal(pointer.current.sha256, "2aeb1d6ec42e89d95c6c78180242b78818d2274bf5c5f2f0e1d0fedccdab1821");
  assert.equal(sha256(legacyBytes), pointer.current.sha256, "Legacy registry bytes changed");
  assert.equal(pointer.current.status, "legacy-current-preserved");
  assert.equal(pointer.candidate.status, "candidate-unmerged-undeployed");
  for (const [pathKey, hashKey] of [
    ["schema", "schemaSha256"],
    ["document", "documentSha256"],
    ["projectionSchema", "projectionSchemaSha256"],
    ["projection", "projectionSha256"]
  ]) {
    assert.equal(
      sha256(fs.readFileSync(path.join(root, pointer.candidate[pathKey]))),
      pointer.candidate[hashKey],
      `Candidate registry ${pathKey} hash is stale`
    );
  }
  assert.equal(pointer.authority.replacesCurrentRegistry, false);
  assert.equal(pointer.authority.mergeApproved, false);
  assert.equal(pointer.authority.deploymentApproved, false);
  assert.equal(pointer.authority.productionDataAccessApproved, false);

  const schemaDirectory = path.join(root, "portfolio/registry/schemas");
  const registrySchema = readJson(root, pointer.candidate.schema);
  const projectionSchema = readJson(root, pointer.candidate.projectionSchema);
  validateJsonSchema(registrySchema, registry, { schemaDirectory, label: "registry-v2" });
  validateJsonSchema(projectionSchema, projection, { schemaDirectory, label: "registry-core-projection-v2" });

  const records = recordMap(registry);
  const sourceIds = new Set(registry.sourceBasis.map((source) => source.sourceId));
  assert.equal(records.size, registry.records.length, "Duplicate project IDs");
  assert.ok(registry.records.length >= 30);
  for (const classification of ["application", "program", "infrastructure", "content", "historical", "external", "concept"]) {
    assert.ok(registry.records.some((record) => record.classification === classification), `Missing ${classification} classification`);
  }

  assert.equal(getRecord(records, registry.architecture.kernelProjectId).architectureRole, "kernel");
  assert.equal(getRecord(records, registry.architecture.ownerWindowProjectId).architectureRole, "owner-window");
  assert.equal(getRecord(records, registry.architecture.contextGatewayProjectId).architectureRole, "context-gateway");
  assert.equal(getRecord(records, registry.architecture.knowledgeSubsystemProjectId).architectureRole, "knowledge-subsystem");

  for (const record of registry.records) {
    assert.equal(record.sourceOfTruth.rawCellDataStoredInCore, false, `${record.projectId} stores raw Cell data in Core`);
    const localIdentityIds = new Set();
    for (const versionIdentity of record.versionIdentities) {
      assert.ok(!localIdentityIds.has(versionIdentity.identityId), `${record.projectId} has duplicate identity ${versionIdentity.identityId}`);
      localIdentityIds.add(versionIdentity.identityId);
      for (const dimensionName of DIMENSIONS) {
        const dimension = versionIdentity[dimensionName];
        assert.ok(dimension, `${record.projectId}/${versionIdentity.identityId} lacks ${dimensionName}`);
        if (NULL_REQUIRED.has(dimension.status)) {
          assert.equal(dimension.value, null, `${record.projectId}/${versionIdentity.identityId}/${dimensionName} must preserve unknown as null`);
        }
        if (EVIDENCE_REQUIRED.has(dimension.status)) {
          assert.ok(dimension.evidenceRefs.length > 0, `${record.projectId}/${versionIdentity.identityId}/${dimensionName} lacks evidence`);
        }
        for (const evidenceRef of dimension.evidenceRefs) {
          assert.ok(sourceIds.has(evidenceRef), `${record.projectId}/${versionIdentity.identityId}/${dimensionName} cites unknown evidence ${evidenceRef}`);
        }
        if (dimensionName === "commit" && dimension.value !== null) {
          assert.match(String(dimension.value), /^[0-9a-f]{40}$/, `${record.projectId}/${versionIdentity.identityId} promotes a non-exact commit`);
        }
      }
    }
    for (const relationship of record.relationships) {
      assert.ok(records.has(relationship.targetProjectId), `${record.projectId} points to missing ${relationship.targetProjectId}`);
    }
  }

  const gateway = getRecord(records, "clover-context-gateway");
  const relationshipOs = getRecord(records, "branson-relationship-os");
  assert.notEqual(gateway.projectId, registry.architecture.kernelProjectId);
  assert.equal(gateway.classification, "infrastructure");
  assert.equal(relationshipOs.classification, "program");
  assert.equal(relationshipOs.sourceOfTruth.status, "unverified");

  const warRoom = getRecord(records, "clover-warroom");
  assert.equal(identity(warRoom, "last-documented-1.8.0").sitesSave.value, 12);
  assert.equal(identity(warRoom, "reported-newer-line").sitesSave.status, "unverified");

  const vibe = getRecord(records, "vibe-translator");
  assert.match(String(identity(vibe, "private-plan-1.0").release.value), /Plan 1\.0/);
  assert.equal(identity(vibe, "private-plan-1.0").sitesSave.value, null);

  const evenSo = getRecord(records, "even-so");
  assert.equal(identity(evenSo, "public-beta-0.1.0").commit.branch, "codex/even-so-prototype");
  assert.equal(evenSo.coreProjection.excluded.some((entry) => entry.includes("room content")), true);

  const cart = getRecord(records, "cart-waiver");
  assert.equal(identity(cart, "production-demo-0.1.0").release.value, "package 0.1.0 operational demonstration");
  assert.ok(cart.statusNotes.some((note) => note.includes("legacy PIN")));

  const lifeguards = getRecord(records, "lifeguards-legacy");
  assert.equal(identity(lifeguards, "production-v7").release.value, "V7 / package 0.2.0");

  const poolside = getRecord(records, "poolside-pulse");
  assert.deepEqual(poolside.versionIdentities.map((entry) => entry.identityId), ["production-v30", "build-protocol-pr5", "version-x-preview"]);
  assert.equal(identity(poolside, "production-v30").role, "production");
  assert.equal(identity(poolside, "version-x-preview").deployment.environment, "preview");

  const boat = getRecord(records, "boat-rentals");
  assert.equal(identity(boat, "security-storage-pr1").pullRequest.value, "chrisdortch/serenity-shores-boat-rentals#1");
  assert.equal(identity(boat, "data-protocol-rehearsal").role, "rehearsal");

  const rollind = getRecord(records, "rollindd");
  assert.equal(identity(rollind, "production-base").role, "production");
  assert.equal(identity(rollind, "collection-transition-v2").pullRequest.value, "chrisdortch/rollindd-platform#3");

  const lakeside = getRecord(records, "lakeside-essentials");
  assert.ok(lakeside.statusNotes.some((note) => note.includes("nextjs-boilerplate")));

  assert.deepEqual(projection, projectRegistryForCore(registry), "Stored Core projection is stale");
  assert.equal(projection.projectionPolicy.rawCellDataIncluded, false);
  assert.equal(projection.architecture.pattern, "federated-kernel-sovereign-cells");
  assert.equal(projection.architecture.rawCellDataStoredInKernel, false);
  assert.equal(projection.projects.length, registry.records.length);
  assert.ok(projection.projects.every((entry) => !Object.hasOwn(entry, "sourceOfTruth") && !Object.hasOwn(entry, "coreProjection")));

  return {
    status: "passed",
    legacyRegistrySha256: pointer.current.sha256,
    candidateVersion: registry.schemaVersion,
    records: registry.records.length,
    classifications: [...new Set(registry.records.map((record) => record.classification))].sort(),
    projectionRecords: projection.projects.length,
    authority: pointer.authority
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(validateRegistryDocuments()));
}
