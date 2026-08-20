import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const appRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(appRoot, "..", "..");

test("the 0.3.1 candidate preserves 0.3.0 and cannot relabel the deployed 0.2.0 preview", async () => {
  const [packageJson, pointer, preserved030] = await Promise.all([
    readFile(path.join(appRoot, "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(repositoryRoot, "CLOVER_CONTEXT_GATEWAY_POINTER.json"), "utf8").then(JSON.parse),
    readFile(path.join(repositoryRoot, "portfolio/context/versions/0.3.0/CANDIDATE_STATUS.md")),
  ]);

  assert.equal(packageJson.version, "0.3.1");
  assert.equal(pointer.currentVersion, "0.2.0");
  assert.equal(pointer.candidate.document, "portfolio/context/versions/0.3.1/CANDIDATE_STATUS.md");
  assert.equal(
    crypto.createHash("sha256").update(preserved030).digest("hex"),
    "554636c6ff5386f757ff0c9f65cd3d4830977b48003dcb88439e5f2e420f2ce1",
  );
  assert.equal(pointer.deployment.deployedApplicationCommit, "e6d12dbf2be407c32b1dc5be3e07dfd011e37779");
  assert.deepEqual(
    {
      version: pointer.candidate.version,
      status: pointer.candidate.status,
      branch: pointer.candidate.branch,
    },
    {
      version: "0.3.1",
      status: "draft-unmerged-undeployed",
      branch: "platform/clover-core-trunk-activation-v0.1-20260820",
    },
  );
});
