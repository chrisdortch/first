#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const failures = [];

const manifest = read("standards/clover-data-change-protocol/versions/1.0.1/V1_0_0_IMMUTABILITY_MANIFEST.json");
const legacyPaths = [
  "standards/clover-data-change-protocol/evidence/1.0.0/boat-rentals.json",
  "standards/clover-data-change-protocol/registry/projects.json",
  "standards/clover-data-change-protocol/runtime/v1.0.0/assemble-data-receipt.mjs",
  "standards/clover-data-change-protocol/runtime/v1.0.0/data-rehearsal.mjs",
  "standards/clover-data-change-protocol/runtime/v1.0.0/run-project-command.mjs",
  "standards/clover-data-change-protocol/runtime/v1.0.0/validate-data-standard.mjs",
  "standards/clover-data-change-protocol/runtime/v1.0.0/verify-data-boundaries.mjs",
  "standards/clover-data-change-protocol/schemas/data-change-policy.schema.json",
  "standards/clover-data-change-protocol/schemas/data-change-receipt.schema.json",
  "standards/clover-data-change-protocol/schemas/data-project-registry.schema.json",
  "standards/clover-data-change-protocol/schemas/protocol-pointer.schema.json",
  "standards/clover-data-change-protocol/templates/caller-workflow.template.yml",
  "standards/clover-data-change-protocol/templates/data-change-policy.template.json",
  "standards/clover-data-change-protocol/versions/1.0.0/CLOVER_DATA_CHANGE_PROTOCOL.md",
  "standards/clover-data-change-protocol/versions/1.0.0/IMPLEMENTATION_RECORD.md",
  "standards/clover-data-change-protocol/versions/1.0.0/RELEASE_BOUNDARIES.md",
  "standards/clover-data-change-protocol/versions/1.0.0/ROLLBACK_AND_RECONCILIATION.md"
];
if (manifest.preservedVersion !== "1.0.0") failures.push("Immutability manifest must identify version 1.0.0");
if (manifest.recordedFromCommit !== "7d5d15bc2bc39a74725c9cfd6827bfe61dbb65ed") failures.push("Immutability manifest base commit mismatch");
if (manifest.identityAlgorithm !== "git-blob-sha1") failures.push("Immutability manifest algorithm mismatch");
const manifestedPaths = Object.keys(manifest.gitBlobShas || {}).sort();
if (JSON.stringify(manifestedPaths) !== JSON.stringify([...legacyPaths].sort())) {
  failures.push("Immutability manifest must contain the exact preserved 1.0.0 file set");
}
for (const [relativePath, expected] of Object.entries(manifest.gitBlobShas)) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) {
    failures.push(`${relativePath}: missing`);
    continue;
  }
  const observed = execFileSync("git", ["hash-object", relativePath], { cwd: root, encoding: "utf8" }).trim();
  if (observed !== expected) failures.push(`${relativePath}: ${observed} expected ${expected}`);
}

const pointer = read("CLOVER_DATA_CHANGE_PROTOCOL_POINTER.json");
const registry = read("standards/clover-data-change-protocol/registry/projects.json");
const required = [
  pointer.currentDocument,
  pointer.candidateDocument,
  ".github/workflows/clover-data-preview-v1.yml",
  "standards/clover-data-change-protocol/schemas/1.0.1/data-change-policy.schema.json",
  "standards/clover-data-change-protocol/schemas/1.0.1/data-change-receipt.schema.json",
  "standards/clover-data-change-protocol/schemas/1.0.1/protocol-pointer.schema.json",
  "standards/clover-data-change-protocol/schemas/1.0.1/fixtures/data-change-receipt.failed.fixture.json",
  "standards/clover-data-change-protocol/templates/caller-workflow.v1.0.1.template.yml",
  "standards/clover-data-change-protocol/templates/data-change-policy.v1.0.1.template.json",
  "standards/clover-data-change-protocol/versions/1.0.1/CLOVER_DATA_CHANGE_PROTOCOL.md",
  "standards/clover-data-change-protocol/versions/1.0.1/SECURITY_HARDENING.md",
  "standards/clover-data-change-protocol/versions/1.0.1/IMPLEMENTATION_RECORD.md",
  "standards/clover-data-change-protocol/versions/1.0.1/RELEASE_BOUNDARIES.md",
  "standards/clover-data-change-protocol/versions/1.0.1/V1_0_0_IMMUTABILITY_MANIFEST.json",
  "standards/clover-data-change-protocol/runtime/v1.0.1/sql-safety.mjs",
  "standards/clover-data-change-protocol/runtime/v1.0.1/role-safety.mjs",
  "standards/clover-data-change-protocol/runtime/v1.0.1/integrity.mjs",
  "standards/clover-data-change-protocol/runtime/v1.0.1/capture-state.mjs",
  "standards/clover-data-change-protocol/runtime/v1.0.1/verify-state.mjs",
  "standards/clover-data-change-protocol/runtime/v1.0.1/verify-final-receipt.mjs",
  "standards/clover-data-change-protocol/runtime/v1.0.1/validate-json.mjs",
  "standards/clover-data-change-protocol/runtime/v1.0.1/verify-data-boundaries.mjs",
  "standards/clover-data-change-protocol/runtime/v1.0.1/run-project-command.mjs",
  "standards/clover-data-change-protocol/runtime/v1.0.1/data-rehearsal.mjs",
  "standards/clover-data-change-protocol/runtime/v1.0.1/assemble-data-receipt.mjs",
  "standards/clover-data-change-protocol/runtime/v1.0.1/test/hardening.test.mjs"
];

if (pointer.currentVersion !== "1.0.0") failures.push("Validated current version must remain 1.0.0 until 1.0.1 exact-head CI passes");
if (pointer.schemaVersion !== "1.1") failures.push("Candidate-aware pointer schema version must be 1.1");
if (pointer.candidateVersion !== "1.0.1") failures.push("Candidate version must be 1.0.1");
if (pointer.candidateStatus !== "security-hardening-candidate-unvalidated") failures.push("Candidate must remain explicitly unvalidated");
if (pointer.candidateBaseCommit !== "7d5d15bc2bc39a74725c9cfd6827bfe61dbb65ed") failures.push("Candidate reconciliation base mismatch");
if (pointer.candidateValidation?.exactHeadCiPassed !== false) failures.push("Candidate must not claim exact-head CI before validation");
if (pointer.candidateValidation?.standardWorkflowRunId !== null) failures.push("Candidate must not claim a standard workflow run before exact-head CI");
if (pointer.candidateValidation?.disposablePilotPassed !== false) failures.push("Candidate must not claim a disposable pilot before it runs");
if (pointer.candidateValidation?.pilotWorkflowRunId !== null) failures.push("Candidate must not claim a pilot workflow run before it runs");
if (pointer.standingProductionAuthority !== false) failures.push("Standing production authority must remain false");
if (pointer.defaultAutomationMode !== "disposable-database-only") failures.push("Default mode must be disposable-database-only");
if (pointer.currentRuntimeDirectory !== "standards/clover-data-change-protocol/runtime/v1.0.0") failures.push("Validated runtime pointer must remain on 1.0.0");
if (pointer.candidateRuntimeDirectory !== "standards/clover-data-change-protocol/runtime/v1.0.1") failures.push("Candidate runtime pointer mismatch");
if (pointer.candidateSchemasDirectory !== "standards/clover-data-change-protocol/schemas/1.0.1") failures.push("Candidate schema pointer mismatch");
if (registry.protocolVersion !== "1.0.0") failures.push("Historical registry must remain bound to protocol 1.0.0");
for (const file of required) if (!fs.existsSync(path.join(root, file))) failures.push(`Missing required file: ${file}`);
for (const project of registry.projects || []) {
  if (project.productionDatabaseAccessed !== false) failures.push(`Registry must deny production access: ${project.projectId}`);
  if (Object.values(project.authority || {}).some((value) => value !== false)) failures.push(`Registry authority must remain false: ${project.projectId}`);
}

const workflow = fs.readFileSync(path.join(root, ".github/workflows/clover-data-preview-v1.yml"), "utf8");
if (!workflow.includes("runtime/v1.0.1")) failures.push("Reusable workflow is not bound to runtime v1.0.1");
if (!workflow.includes("schemas/1.0.1")) failures.push("Reusable workflow is not bound to schemas v1.0.1");
if (!workflow.includes("Validate project data policy before project commands")) failures.push("Policy schema validation must precede project commands");
if (!workflow.includes("Run protocol hardening regressions")) failures.push("Reusable workflow does not run the 1.0.1 hardening regressions");
if (!workflow.includes("github.event.pull_request.head.sha || github.sha")) failures.push("Reusable workflow is not bound to the exact pull-request head or push commit");
if (!workflow.includes("job.workflow_sha") || !workflow.includes("job.workflow_repository")) failures.push("Reusable workflow is not bound to GitHub's immutable reusable-workflow identity");
if (workflow.includes("inputs.protocol_ref")) failures.push("Reusable workflow must not accept a caller-supplied protocol identity");
if (!workflow.includes("CLOVER_CONTROL_CHECKOUT") || !workflow.includes("verify-state.mjs")) failures.push("Reusable workflow lacks an independent post-command integrity control");
if (!workflow.includes("RUNNER_TEMP") || !workflow.includes("CLOVER_DATA_ARTIFACT_DIR")) failures.push("Reusable workflow does not isolate evidence outside the candidate checkout");
if (!workflow.includes("Recheck final receipt and every bound artifact")) failures.push("Reusable workflow lacks the final evidence recheck");
if (!workflow.includes("NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS") || !workflow.includes("CLOVER_OUTCOME_REHEARSAL_ROLE")) failures.push("Reusable workflow lacks a dedicated fail-closed restricted rehearsal role");

const receiptRuntime = fs.readFileSync(path.join(root, "standards/clover-data-change-protocol/runtime/v1.0.1/assemble-data-receipt.mjs"), "utf8");
if (!receiptRuntime.includes('state: "unknown"') || !receiptRuntime.includes("productionCredentialsSuppliedByWorkflow") || !receiptRuntime.includes("seedDataProvenanceObservation")) failures.push("Candidate receipt must report precise same-user-runner and seed-provenance semantics");
for (const unsupportedClaim of ["productionDatabaseConnected", "productionDataRead", "productionDataWritten", "syntheticDataOnly", "trustedRehearsalSyntheticSeedOnly"]) {
  if (receiptRuntime.includes(`${unsupportedClaim}:`)) failures.push(`Candidate receipt makes an unsupported absence claim: ${unsupportedClaim}`);
}
const sqlSafetyRuntime = fs.readFileSync(path.join(root, "standards/clover-data-change-protocol/runtime/v1.0.1/sql-safety.mjs"), "utf8");
for (const marker of ["FUNCTION|PROCEDURE", "EXECUTE|PREPARE|DEALLOCATE|CALL", "normalizeSqlForSecurityScreening"]) if (!sqlSafetyRuntime.includes(marker)) failures.push(`Candidate SQL screening lacks dynamic-procedure marker: ${marker}`);

const buildPointer = read("CLOVER_BUILD_PROTOCOL_POINTER.json");
if (buildPointer.currentVersion !== "1.1.0") failures.push("Clover Build Protocol 1.1.0 pointer changed unexpectedly");

if (failures.length) {
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}
console.log("Clover Data Change Protocol 1.0.1 candidate integrity passed; exact-head CI remains unvalidated");
