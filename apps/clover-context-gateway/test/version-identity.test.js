import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const appRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(appRoot, "..", "..");

test("the undeployed candidate cannot relabel the deployed 0.2.0 preview", async () => {
  const [packageJson, pointer] = await Promise.all([
    readFile(path.join(appRoot, "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(repositoryRoot, "CLOVER_CONTEXT_GATEWAY_POINTER.json"), "utf8").then(JSON.parse),
  ]);

  assert.equal(packageJson.version, "0.3.0");
  assert.equal(pointer.currentVersion, "0.2.0");
  assert.equal(pointer.deployment.deployedApplicationCommit, "e6d12dbf2be407c32b1dc5be3e07dfd011e37779");
  assert.deepEqual(
    {
      version: pointer.candidate.version,
      status: pointer.candidate.status,
      branch: pointer.candidate.branch,
    },
    {
      version: "0.3.0",
      status: "draft-unmerged-undeployed",
      branch: "platform/clover-core-trust-slice-v0.2-20260818",
    },
  );
});
