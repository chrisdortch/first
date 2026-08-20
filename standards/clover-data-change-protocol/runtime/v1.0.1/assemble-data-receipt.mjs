#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { artifactRecord, readJson, seedDataProvenanceObservation, writeJson } from "./integrity.mjs";

const [policyArgument, artifactDirectoryArgument] = process.argv.slice(2);
if (!policyArgument || !artifactDirectoryArgument) {
  console.error("Usage: assemble-data-receipt.mjs <policy.json> <artifact-dir>");
  process.exit(2);
}
const root = process.cwd();
const policy = JSON.parse(fs.readFileSync(path.resolve(root, policyArgument), "utf8"));
const artifactDirectory = path.resolve(root, artifactDirectoryArgument);

function read(relativePath, fallback = null) {
  try { return readJson(path.join(artifactDirectory, relativePath)); }
  catch { return fallback; }
}

const expectedArtifactBindings = [
  ["policy-schema.json", "CLOVER_EXPECTED_POLICY_SCHEMA_SHA"],
  ["boundary.json", "CLOVER_EXPECTED_BOUNDARY_SHA"],
  ["integrity/pre-install.json", "CLOVER_EXPECTED_PRE_INSTALL_SHA"],
  ["commands/install.json", "CLOVER_EXPECTED_INSTALL_RECEIPT_SHA"],
  ["commands/install.log", "CLOVER_EXPECTED_INSTALL_LOG_SHA"],
  ["integrity/after-install.json", "CLOVER_EXPECTED_AFTER_INSTALL_SHA"],
  ["integrity/pre-verify.json", "CLOVER_EXPECTED_PRE_VERIFY_SHA"],
  ["commands/verify.json", "CLOVER_EXPECTED_VERIFY_RECEIPT_SHA"],
  ["commands/verify.log", "CLOVER_EXPECTED_VERIFY_LOG_SHA"],
  ["integrity/after-verify.json", "CLOVER_EXPECTED_AFTER_VERIFY_SHA"],
  ["integrity/pre-rehearsal.json", "CLOVER_EXPECTED_PRE_REHEARSAL_SHA"],
  ["database/database-rehearsal.json", "CLOVER_EXPECTED_REHEARSAL_SHA"],
  ["integrity/after-rehearsal.json", "CLOVER_EXPECTED_AFTER_REHEARSAL_SHA"]
];

const artifacts = expectedArtifactBindings.map(([relative, environmentName]) => {
  const expectedSha256 = process.env[environmentName] || null;
  try {
    return artifactRecord(artifactDirectory, relative, expectedSha256);
  } catch (error) {
    return { path: relative, sha256: null, bytes: null, expectedSha256, matched: false, error: error?.message || String(error) };
  }
});

const outcomeNames = [
  "identity",
  "tooling",
  "hardening",
  "policySchema",
  "boundary",
  "preInstall",
  "install",
  "controlAfterInstall",
  "installIntegrity",
  "restoreAfterInstall",
  "toolingAfterInstall",
  "preVerify",
  "verify",
  "controlAfterVerify",
  "verifyIntegrity",
  "restoreAfterVerify",
  "toolingAfterVerify",
  "preRehearsal",
  "postgresClient",
  "postgresReady",
  "rehearsalRole",
  "rehearsal",
  "controlAfterRehearsal",
  "rehearsalIntegrity",
  "restoreAfterRehearsal",
  "toolingAfterRehearsal",
  "finalControl"
];
const workflowOutcomes = Object.fromEntries(outcomeNames.map((name) => {
  const environmentName = `CLOVER_OUTCOME_${name.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`;
  return [name, process.env[environmentName] || "unknown"];
}));

const boundary = read("boundary.json");
const policySchema = read("policy-schema.json");
const install = read("commands/install.json");
const verify = read("commands/verify.json");
const rehearsal = read("database/database-rehearsal.json");
const installIntegrity = read("integrity/after-install.json");
const verifyIntegrity = read("integrity/after-verify.json");
const rehearsalIntegrity = read("integrity/after-rehearsal.json");
const passed = (value) => value?.status === "passed";
const checkPassed = (value) => value === "passed";
const exactCommit = (value) => typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
const candidateCommitExpected = process.env.CLOVER_CANDIDATE_REF || "";
const protocolCommitExpected = process.env.CLOVER_PROTOCOL_REF || "";
const sourceBindingsPassed = passed(boundary) &&
  boundary.repository === policy.project.repository &&
  boundary.baselineCommit === policy.source.baselineCommit &&
  boundary.productionCommitAtEnrollment === policy.source.productionCommitAtEnrollment &&
  exactCommit(candidateCommitExpected) &&
  boundary.candidateCommitExpected === candidateCommitExpected &&
  boundary.candidateCommit === candidateCommitExpected;
const productionAnchorPassed = sourceBindingsPassed &&
  policy.source.baselineCommit === policy.source.productionCommitAtEnrollment &&
  boundary.productionCommitObserved === policy.source.productionCommitAtEnrollment;
const protocolBindingPassed = sourceBindingsPassed && exactCommit(protocolCommitExpected) &&
  policy.protocol.commit === protocolCommitExpected &&
  boundary.protocolCommitObserved === protocolCommitExpected;
const evidenceBindingsPassed = artifacts.every((artifact) => artifact.matched === true);
const workflowOutcomesPassed = Object.values(workflowOutcomes).every((outcome) => outcome === "success");

const checks = {
  policySchema: passed(policySchema) ? "passed" : "failed",
  boundary: passed(boundary) ? "passed" : "failed",
  sourceBindings: sourceBindingsPassed ? "passed" : "failed",
  productionAnchorUnchanged: productionAnchorPassed && boundary?.checks?.productionAnchorUnchanged === true ? "passed" : "failed",
  candidateBasedOnProduction: productionAnchorPassed && boundary?.checks?.candidateBasedOnProduction === true ? "passed" : "failed",
  protocolCommitBound: protocolBindingPassed && boundary?.checks?.protocolCommitBound === true ? "passed" : "failed",
  install: passed(install) ? "passed" : "failed",
  installIntegrity: passed(installIntegrity) ? "passed" : "failed",
  projectVerify: passed(verify) ? "passed" : "failed",
  verifyIntegrity: passed(verifyIntegrity) ? "passed" : "failed",
  connectionBoundary: rehearsal?.checks?.connectionBoundary || "failed",
  restrictedRehearsalRole: rehearsal?.checks?.restrictedRehearsalRole || "failed",
  sqlPathIntegrity: rehearsal?.checks?.sqlPathIntegrity || "failed",
  psqlMetaCommandsRejected: rehearsal?.checks?.psqlMetaCommandsRejected || "failed",
  sqlScreening: rehearsal?.checks?.sqlScreening || "failed",
  baseline: rehearsal?.checks?.baseline || "failed",
  forward: rehearsal?.checks?.forward || "failed",
  forwardIdempotency: rehearsal?.checks?.forwardIdempotency || "failed",
  rollback: rehearsal?.checks?.rollback || "failed",
  schemaRestored: rehearsal?.checks?.schemaRestored || "failed",
  reconciliationPreserved: rehearsal?.checks?.reconciliationPreserved || "failed",
  namespace: rehearsal?.checks?.namespace || "failed",
  rehearsalIntegrity: passed(rehearsalIntegrity) ? "passed" : "failed",
  evidenceBindings: evidenceBindingsPassed ? "passed" : "failed",
  workflowOutcomes: workflowOutcomesPassed ? "passed" : "failed"
};
const status = Object.values(checks).every(checkPassed) ? "passed" : "failed";

const receipt = {
  schemaVersion: "1.1",
  protocolVersion: "1.0.1",
  generatedAt: new Date().toISOString(),
  status,
  project: {
    id: policy.project.id,
    title: policy.project.title,
    repository: policy.project.repository,
    class: policy.project.class
  },
  source: {
    baselineCommit: policy.source.baselineCommit,
    productionCommitAtEnrollment: policy.source.productionCommitAtEnrollment,
    productionCommitObserved: boundary?.productionCommitObserved || null,
    candidateCommitExpected: exactCommit(candidateCommitExpected) ? candidateCommitExpected : null,
    candidateCommit: boundary?.candidateCommit || null,
    branch: boundary?.branch || null,
    protocolRepository: policy.protocol.repository,
    protocolCommit: policy.protocol.commit,
    protocolCommitExpected: exactCommit(protocolCommitExpected) ? protocolCommitExpected : null,
    protocolCommitObserved: boundary?.protocolCommitObserved || null,
    changedFiles: boundary?.changedFiles || []
  },
  database: rehearsal?.database || {
    mode: "disposable-database-only",
    engine: "postgresql",
    majorVersion: 16,
    hostClass: "local-ci-service",
    databaseName: "clover_data",
    roleName: "clover_rehearsal",
    roleSecurity: null
  },
  checks,
  workflowOutcomes,
  observations: {
    projectCommandExternalEffects: {
      state: "unknown",
      basis: "Project-controlled npm lifecycle and verification code ran on a same-user GitHub-hosted runner without a hostile-code network sandbox. No production credentials were supplied by this workflow, but absence of all external effects was not observed."
    },
    seedDataProvenance: seedDataProvenanceObservation(),
    install: installIntegrity?.observations || null,
    verify: verifyIntegrity?.observations || null,
    rehearsal: rehearsalIntegrity?.observations || null
  },
  stages: rehearsal?.stages || {},
  sqlArtifacts: rehearsal?.sqlArtifacts || {},
  safety: {
    productionAnchorMatched: productionAnchorPassed && boundary?.checks?.productionAnchorUnchanged === true,
    productionCredentialsSuppliedByWorkflow: false,
    productionDatabaseAccessAuthorized: false,
    productionMigrationAuthorized: false,
    productionBackupOrRestoreAuthorized: false,
    trustedRehearsalProductionConnectionAccepted: false,
    trustedRehearsalRoleSuperuser: false,
    psqlMetaCommandsAcceptedByTrustedRehearsal: false,
    symbolicLinkSqlPathsAcceptedByTrustedRehearsal: false,
    disposableDatabaseEndsWithRunner: true
  },
  authority: {
    releaseState: "not-authorized",
    productionEligible: false,
    productionDatabaseReadApproved: false,
    productionDatabaseWriteApproved: false,
    productionMigrationApproved: false,
    productionBackupOrRestoreApproved: false,
    mergeApproved: false,
    productionDeploymentApproved: false
  },
  artifacts,
  evidence: {
    boundary: "boundary.json",
    policySchema: "policy-schema.json",
    install: "commands/install.json",
    projectVerify: "commands/verify.json",
    rehearsal: "database/database-rehearsal.json",
    installIntegrity: "integrity/after-install.json",
    verifyIntegrity: "integrity/after-verify.json",
    rehearsalIntegrity: "integrity/after-rehearsal.json"
  }
};

writeJson(path.join(artifactDirectory, "data-change-receipt.json"), receipt);
console.log(`Clover data change receipt 1.0.1: ${status}`);
if (status !== "passed") process.exitCode = 1;
