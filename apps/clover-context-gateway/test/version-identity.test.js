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
  assert.deepEqual(pointer.candidate.reviewedImplementation, {
    headCommit: "2309bbc61dc8fcc7f2167c6c47db4a8b11cd8334",
    deploymentId: "dpl_bwkBAYEz8XjjNLx4xXrdPAvc8bmS",
    immutableUrl: "https://clover-context-gateway-preview-bah2p1llj-chris-dortchs-projects.vercel.app",
    state: "READY",
    target: null,
    aliases: [],
  });
  assert.equal(pointer.candidate.publicationReadback.connectorId, "clover://publication/readback");
  assert.equal(pointer.candidate.publicationReadback.indexHash, "92bd597a10beba1a2a4324ebd9f500a6bf62c590dc07693f6c84e076ba83c062");
  assert.equal(pointer.candidate.publicationReadback.recordHash, "1c0e95512f90d4cc99bfcc616823d70895c8923df23c06ece7a074b72fedec3a");
  assert.equal(pointer.candidate.amendmentContainer.status, "awaiting-post-commit-source-bound-readback");
  assert.equal(pointer.candidate.amendmentContainer.commit, null);
  assert.deepEqual(
    {
      version: pointer.candidate.version,
      status: pointer.candidate.status,
      branch: pointer.candidate.branch,
    },
    {
      version: "0.3.1",
      status: "draft-unmerged-preview-verified",
      branch: "platform/clover-core-trunk-activation-v0.1-20260820",
    },
  );
});
