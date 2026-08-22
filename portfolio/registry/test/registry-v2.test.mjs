import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateJsonSchema } from "../../core/lib/validators.mjs";
import { projectRegistryForCore } from "../lib/projection.mjs";
import { validateRegistryDocuments } from "../validate-registry-v2.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIRECTORY, "../../..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath));
const readJson = (relativePath) => JSON.parse(read(relativePath));

test("legacy registry bytes remain exact while v2 stays additive", () => {
  const digest = crypto.createHash("sha256").update(read("portfolio/registry/projects.json")).digest("hex");
  assert.equal(digest, "2aeb1d6ec42e89d95c6c78180242b78818d2274bf5c5f2f0e1d0fedccdab1821");
  const pointer = readJson("portfolio/registry/REGISTRY_POINTER.json");
  assert.equal(pointer.current.sha256, digest);
  assert.equal(pointer.current.status, "legacy-current-preserved");
  assert.equal(pointer.authority.replacesCurrentRegistry, false);
});

test("federated registry validates and preserves all classification classes", () => {
  const result = validateRegistryDocuments({ root: ROOT });
  assert.equal(result.status, "passed");
  assert.equal(result.records, 45);
  assert.deepEqual(result.classifications, ["application", "concept", "content", "external", "historical", "infrastructure", "program"]);
});

test("the stored Core projection is deterministic and minimized", () => {
  const registry = readJson("portfolio/registry/versions/2.0.0/registry.json");
  const projection = readJson("portfolio/registry/projections/core-project-index.v2.json");
  assert.deepEqual(projection, projectRegistryForCore(registry));
  assert.equal(projection.projectionPolicy.rawCellDataIncluded, false);
  assert.equal(projection.architecture.pattern, "federated-kernel-sovereign-cells");
  assert.equal(projection.architecture.rawCellDataStoredInKernel, false);
  assert.ok(projection.projects.every((project) => !Object.hasOwn(project, "sourceOfTruth")));
  assert.ok(projection.projects.every((project) => project.rawCellDataStoredInCore === false));
  assert.ok(projection.projects.every((project) => project.identitySummary.every((identity) => Object.hasOwn(identity, "rollback"))));
});

test("registry schema rejects a collapsed version identity", () => {
  const schema = readJson("portfolio/registry/schemas/clover-federated-portfolio-registry.v2.schema.json");
  const invalid = readJson("portfolio/registry/versions/2.0.0/registry.json");
  delete invalid.records.find((record) => record.projectId === "poolside-pulse").versionIdentities[0].deployment;
  assert.throws(
    () => validateJsonSchema(schema, invalid, {
      schemaDirectory: path.join(ROOT, "portfolio/registry/schemas"),
      label: "collapsed-identity"
    }),
    /missing required property deployment/
  );
});

test("unknown commit prefixes cannot masquerade as exact commit values", () => {
  const registry = readJson("portfolio/registry/versions/2.0.0/registry.json");
  const poolside = registry.records.find((record) => record.projectId === "poolside-pulse");
  const production = poolside.versionIdentities.find((identity) => identity.identityId === "production-v30");
  assert.equal(production.commit.value, null);
  assert.equal(production.commit.reportedPrefix, "d04e8d");
  assert.equal(production.commit.status, "partially-verified");
});
