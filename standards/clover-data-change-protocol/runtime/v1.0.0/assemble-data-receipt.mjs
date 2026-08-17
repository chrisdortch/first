#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [policyArg, artifactDirArg] = process.argv.slice(2);
if (!policyArg || !artifactDirArg) {
  console.error('Usage: assemble-data-receipt.mjs <policy.json> <artifact-dir>');
  process.exit(2);
}
const root = process.cwd();
const policy = JSON.parse(fs.readFileSync(path.resolve(root, policyArg), 'utf8'));
const artifactDir = path.resolve(root, artifactDirArg);

function read(relative, fallback = null) {
  try { return JSON.parse(fs.readFileSync(path.join(artifactDir, relative), 'utf8')); }
  catch { return fallback; }
}
const boundary = read('boundary.json');
const policySchema = read('policy-schema.json');
const install = read('commands/install.json');
const verify = read('commands/verify.json');
const rehearsal = read('database/database-rehearsal.json');

const passed = (value) => value?.status === 'passed';
const checks = {
  boundary: passed(boundary) ? 'passed' : 'failed',
  policySchema: passed(policySchema) ? 'passed' : 'failed',
  install: passed(install) ? 'passed' : 'failed',
  projectVerify: passed(verify) ? 'passed' : 'failed',
  baseline: rehearsal?.checks?.baseline || 'failed',
  forward: rehearsal?.checks?.forward || 'failed',
  forwardIdempotency: rehearsal?.checks?.forwardIdempotency || 'failed',
  rollback: rehearsal?.checks?.rollback || 'failed',
  schemaRestored: rehearsal?.checks?.schemaRestored || 'failed',
  reconciliationPreserved: rehearsal?.checks?.reconciliationPreserved || 'failed'
};
const status = Object.values(checks).every((value) => value === 'passed') ? 'passed' : 'failed';

const receipt = {
  schemaVersion: '1.0',
  protocolVersion: '1.0.0',
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
    candidateCommit: boundary?.candidateCommit || process.env.GITHUB_SHA || '',
    branch: boundary?.branch || process.env.GITHUB_REF_NAME || '',
    protocolCommit: policy.protocol.commit,
    changedFiles: boundary?.changedFiles || []
  },
  database: rehearsal?.database || {
    mode: 'disposable-database-only',
    engine: 'postgresql',
    majorVersion: 16,
    hostClass: 'local-ci-service',
    databaseName: 'clover_data'
  },
  checks,
  stages: rehearsal?.stages || {},
  sqlArtifacts: rehearsal?.sqlArtifacts || {},
  safety: {
    productionDatabaseConnected: false,
    productionDataRead: false,
    productionDataWritten: false,
    productionCredentialsAccepted: false,
    syntheticDataOnly: true,
    productionBackupCreated: false,
    productionRestoreAttempted: false,
    disposableDatabaseEndsWithRunner: true
  },
  authority: {
    releaseState: 'not-authorized',
    productionEligible: false,
    productionDatabaseReadApproved: false,
    productionDatabaseWriteApproved: false,
    productionMigrationApproved: false,
    productionBackupOrRestoreApproved: false,
    mergeApproved: false,
    productionDeploymentApproved: false
  },
  evidence: {
    boundary: 'boundary.json',
    policySchema: 'policy-schema.json',
    install: 'commands/install.json',
    projectVerify: 'commands/verify.json',
    rehearsal: 'database/database-rehearsal.json'
  }
};

fs.writeFileSync(path.join(artifactDir, 'data-change-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`Clover data change receipt: ${status}`);
if (status !== 'passed') process.exitCode = 1;
