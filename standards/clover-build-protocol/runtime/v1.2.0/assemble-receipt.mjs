#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { compareSnapshots, readJson, unknownExternalObservation, writeJson } from './lib.mjs';
import { artifactRecord, CORE_ARTIFACT_SPECS, exactRequiredCheckSet, RUNNER_OUTCOME_SPECS, screenshotArtifactSpecs } from './receipt-contract.mjs';

const [policyArg, artifactDirArg] = process.argv.slice(2);
if (!policyArg || !artifactDirArg) {
  console.error('Usage: assemble-receipt.mjs <policy.json> <artifact-dir>');
  process.exit(2);
}
const artifactDir = path.resolve(artifactDirArg);
const safeRead = (relative) => { try { return readJson(path.join(artifactDir, relative)); } catch { return null; } };
let policy = null;
try { policy = readJson(path.resolve(policyArg)); } catch {}
const boundary = safeRead('boundary.json');
const enrollmentSchema = safeRead('enrollment-schema.json');
const policySchema = safeRead('policy-schema.json');
const install = safeRead('commands/install.json');
const verify = safeRead('commands/verify.json');
const browser = safeRead('browser/browser-receipt.json');
const finalState = safeRead('final-state.json');

const checks = [
  { id: 'enrollment-schema', status: enrollmentSchema?.status || 'unavailable' },
  { id: 'policy-schema', status: policySchema?.status || 'unavailable' },
  { id: 'enrolled-boundary', status: boundary?.status || 'unavailable' },
  { id: 'install', status: install?.status || 'unavailable' },
  { id: 'verify', status: verify?.status || 'unavailable' },
  { id: 'browser', status: browser?.status || 'unavailable' },
  { id: 'final-state', status: finalState?.status || 'unavailable' }
];
for (const { id, environment } of RUNNER_OUTCOME_SPECS) {
  const outcome = process.env[environment] || null;
  const status = outcome === 'success' ? 'passed' : outcome === 'failure' || outcome === 'cancelled' ? 'failed' : 'unavailable';
  checks.push({ id: `runner-${id}`, status, detail: { outcome } });
}

const coreArtifacts = CORE_ARTIFACT_SPECS.map((spec) => artifactRecord(artifactDir, spec.path, process.env[spec.environment], 'step-output'));
for (const artifact of coreArtifacts) checks.push({
  id: `artifact-integrity:${artifact.path}`,
  status: artifact.matched ? 'passed' : 'failed',
  detail: { expected: artifact.expectedSha256, observed: artifact.sha256, bytes: artifact.bytes, bindingSource: artifact.bindingSource }
});
const screenshotSpecs = screenshotArtifactSpecs(browser);
const screenshotArtifacts = screenshotSpecs.map((spec) => artifactRecord(artifactDir, spec.path, spec.expectedSha256, spec.bindingSource));
const artifacts = [...coreArtifacts, ...screenshotArtifacts];
const screenshotEvidenceComplete = Array.isArray(browser?.results) && browser.results.length > 0 && screenshotSpecs.length === browser.results.length;
const uniqueArtifactPaths = new Set(artifacts.map((artifact) => artifact.path)).size === artifacts.length;
const artifactsPassed = screenshotEvidenceComplete && uniqueArtifactPaths && artifacts.every((artifact) => artifact.matched === true);
const checksComplete = exactRequiredCheckSet(checks);
const status = checksComplete && checks.every((check) => check.status === 'passed') && artifactsPassed
  ? 'passed'
  : checks.some((check) => check.status === 'failed') || artifacts.some((artifact) => artifact.matched === false)
    ? 'failed'
    : 'incomplete';

const pre = finalState?.before || safeRead('pre-state.json');
const post = finalState?.after || null;
const observations = pre && post ? compareSnapshots(pre, post) : {
  trackedTreeMutation: { state: 'unknown', basis: 'A complete before/after tracked-tree snapshot pair was unavailable.' },
  policyMutation: { state: 'unknown', basis: 'A complete before/after policy-hash pair was unavailable.' },
  sourceCommitMutation: { state: 'unknown', basis: 'A complete before/after source-commit pair was unavailable.' }
};
const processExecutions = [
  ...(install?.commands || []).map((item) => ({ group: 'install', ...item })),
  ...(verify?.commands || []).map((item) => ({ group: 'verify', ...item })),
  ...(browser?.processExecution ? [{ group: 'preview', ...browser.processExecution }] : [])
];
const protocolEvidence = [install?.observations?.protocolCheckoutMutation, verify?.observations?.protocolCheckoutMutation, browser?.observations?.protocolCheckoutMutation].filter(Boolean);
const protocolCheckoutMutation = protocolEvidence.some((item) => item.state === 'observed')
  ? { state: 'observed', basis: 'At least one project-process receipt observed a protocol checkout or tooling mutation.', evidence: protocolEvidence }
  : protocolEvidence.length === 3 && protocolEvidence.every((item) => item.state === 'not-observed')
    ? { state: 'not-observed', basis: 'Install, verification, and browser receipts each compared tracked protocol and installed-tooling state before and after execution.', evidence: protocolEvidence }
    : { state: 'unknown', basis: 'A complete set of protocol checkout observations was unavailable.', evidence: protocolEvidence };
const receipt = {
  schemaVersion: '1.2',
  protocolVersion: '1.2.0',
  generatedAt: new Date().toISOString(),
  protocol: { repository: boundary?.protocol?.repository || 'chrisdortch/first', commit: boundary?.protocol?.commit || null, workflow: boundary?.protocol?.workflow || '.github/workflows/clover-preview-v1.2.yml' },
  project: { id: policy?.project?.id || boundary?.project?.id || 'unavailable', repository: policy?.project?.repository || boundary?.project?.repository || 'unavailable', title: policy?.project?.title || 'unavailable' },
  source: { commit: boundary?.source?.commit || pre?.source?.commit || null, tree: boundary?.source?.tree || pre?.source?.tree || null, branch: boundary?.source?.branch || null, baselineCommit: boundary?.source?.baselineCommit || null, baselineTree: boundary?.source?.baselineTree || null, productionCommitAtEnrollment: boundary?.source?.productionCommitAtEnrollment || null },
  enrollment: { path: boundary?.enrollment?.path || null, sha256: boundary?.enrollment?.sha256 || null, policySha256: boundary?.enrollment?.policySha256 || null },
  status,
  authority: { releaseState: 'not-authorized', productionEligible: false },
  checks,
  observations: { processExecutions, ...observations, protocolCheckoutMutation, externalProviderSideEffects: unknownExternalObservation() },
  browser: browser?.summary || null,
  artifacts
};
writeJson(path.join(artifactDir, 'build-receipt.json'), receipt);
console.log(`Clover build receipt: ${status}`);
if (status !== 'passed') process.exit(1);
