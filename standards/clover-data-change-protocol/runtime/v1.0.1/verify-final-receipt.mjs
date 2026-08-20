#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { artifactRecord, readJson, sha256 } from "./integrity.mjs";

const [receiptArgument, artifactDirectoryArgument] = process.argv.slice(2);
if (!receiptArgument || !artifactDirectoryArgument) {
  console.error("Usage: verify-final-receipt.mjs <receipt.json> <artifact-dir>");
  process.exit(2);
}
const artifactDirectory = path.resolve(artifactDirectoryArgument);
const receiptPath = path.resolve(receiptArgument);
const receipt = readJson(receiptPath);
const failures = [];
if (receipt.status !== "passed") failures.push("Receipt status is not passed");
if (!Object.values(receipt.checks || {}).every((value) => value === "passed")) failures.push("A receipt check is not passed");
if (!Object.values(receipt.workflowOutcomes || {}).every((value) => value === "success")) failures.push("A required workflow outcome is not success");
if (receipt.source?.candidateCommitExpected !== process.env.CLOVER_CANDIDATE_REF || receipt.source?.candidateCommit !== process.env.CLOVER_CANDIDATE_REF) failures.push("Receipt candidate identity mismatch");
if (receipt.source?.protocolCommitExpected !== process.env.CLOVER_PROTOCOL_REF || receipt.source?.protocolCommitObserved !== process.env.CLOVER_PROTOCOL_REF || receipt.source?.protocolCommit !== process.env.CLOVER_PROTOCOL_REF) failures.push("Receipt protocol identity mismatch");
for (const expected of receipt.artifacts || []) {
  try {
    const observed = artifactRecord(artifactDirectory, expected.path, expected.expectedSha256);
    if (observed.sha256 !== expected.sha256 || observed.bytes !== expected.bytes || observed.matched !== true) failures.push(`Artifact changed after receipt assembly: ${expected.path}`);
  } catch (error) {
    failures.push(error?.message || String(error));
  }
}
const expectedReceiptSha = process.env.CLOVER_EXPECTED_RECEIPT_SHA || "";
if (!/^[0-9a-f]{64}$/.test(expectedReceiptSha) || sha256(fs.readFileSync(receiptPath)) !== expectedReceiptSha) failures.push("Final receipt hash does not match its immutable step output");
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log("Clover final data receipt evidence gate: passed");
