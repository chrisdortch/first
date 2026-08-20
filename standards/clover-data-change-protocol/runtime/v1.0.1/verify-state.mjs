#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { compareState, parseArtifactBindings, readJson, sha256, snapshotState, writeJson } from "./integrity.mjs";

const [policyArgument, artifactDirectoryArgument, beforeArgument, outputArgument, ...bindingArguments] = process.argv.slice(2);
if (!policyArgument || !artifactDirectoryArgument || !beforeArgument || !outputArgument) {
  console.error("Usage: verify-state.mjs <policy.json> <artifact-dir> <before.json> <output.json> [path=sha256|prefix/** ...]");
  process.exit(2);
}

const candidateRoot = path.resolve(process.env.CLOVER_CANDIDATE_ROOT || process.cwd());
const protocolRoot = path.resolve(process.env.CLOVER_PROTOCOL_CHECKOUT || "");
const evidenceRoot = path.resolve(artifactDirectoryArgument);
const beforeFile = path.resolve(beforeArgument);
const output = path.resolve(outputArgument);
const expectedBefore = process.env.CLOVER_EXPECTED_BEFORE_SHA || "";
if (!/^[0-9a-f]{64}$/.test(expectedBefore)) throw new Error("CLOVER_EXPECTED_BEFORE_SHA must be an exact SHA-256");
const beforeBytes = fs.readFileSync(beforeFile);
if (sha256(beforeBytes) !== expectedBefore) throw new Error("Pre-command state snapshot hash mismatch");

const { allowedArtifacts, allowedPrefixes } = parseArtifactBindings(bindingArguments);

const beforeRelative = path.relative(evidenceRoot, beforeFile).split(path.sep).join("/");
allowedArtifacts.set(beforeRelative, expectedBefore);
const outputRelative = path.relative(evidenceRoot, output).split(path.sep).join("/");
const before = readJson(beforeFile);
const after = snapshotState({
  candidateRoot,
  protocolRoot,
  expectedCandidate: process.env.CLOVER_CANDIDATE_REF,
  expectedProtocol: process.env.CLOVER_PROTOCOL_REF,
  policyPath: path.resolve(candidateRoot, policyArgument),
  evidenceRoot,
  excludeEvidence: [outputRelative]
});
const comparison = compareState(before, after, { allowedArtifacts, allowedPrefixes });
const receipt = {
  schemaVersion: "1.1",
  protocolVersion: "1.0.1",
  generatedAt: new Date().toISOString(),
  status: comparison.status,
  beforeSha256: expectedBefore,
  before,
  after,
  observations: comparison.observations,
  additions: comparison.additions,
  failures: comparison.failures,
  authority: { releaseState: "not-authorized", productionEligible: false }
};
writeJson(output, receipt);
console.log(`Clover data state verification: ${receipt.status}`);
if (receipt.status !== "passed") {
  for (const failure of receipt.failures) console.error(failure);
  process.exit(1);
}
