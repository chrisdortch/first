#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { snapshotState, writeJson } from "./integrity.mjs";

const [policyArgument, artifactDirectoryArgument, outputArgument] = process.argv.slice(2);
if (!policyArgument || !artifactDirectoryArgument || !outputArgument) {
  console.error("Usage: capture-state.mjs <policy.json> <artifact-dir> <output.json>");
  process.exit(2);
}

const candidateRoot = path.resolve(process.env.CLOVER_CANDIDATE_ROOT || process.cwd());
const protocolRoot = path.resolve(process.env.CLOVER_PROTOCOL_CHECKOUT || "");
const evidenceRoot = path.resolve(artifactDirectoryArgument);
const output = path.resolve(outputArgument);
const outputRelative = path.relative(evidenceRoot, output).split(path.sep).join("/");
const state = snapshotState({
  candidateRoot,
  protocolRoot,
  expectedCandidate: process.env.CLOVER_CANDIDATE_REF,
  expectedProtocol: process.env.CLOVER_PROTOCOL_REF,
  policyPath: path.resolve(candidateRoot, policyArgument),
  evidenceRoot,
  excludeEvidence: [outputRelative]
});
if (!state.candidate.exactCommit || !state.candidate.trackedClean) throw new Error("Candidate state is not exact and clean");
if (!state.protocol.exactCommit || !state.protocol.trackedClean || !state.protocol.tooling.present) throw new Error("Protocol state or tooling is not exact and clean");
writeJson(output, state);
console.log(`Clover data integrity snapshot: ${state.candidate.commit}`);
