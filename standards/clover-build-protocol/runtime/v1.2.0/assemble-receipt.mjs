#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { compareSnapshots, readJson, unknownExternalObservation, writeJson } from './lib.mjs';

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
const runnerOutcomes = {
  schemas: process.env.CLOVER_OUTCOME_SCHEMAS,
  boundary: process.env.CLOVER_OUTCOME_BOUNDARY,
  'pre-state': process.env.CLOVER_OUTCOME_PRE_STATE,
  install: process.env.CLOVER_OUTCOME_INSTALL,
  verify: process.env.CLOVER_OUTCOME_VERIFY,
  browsers: process.env.CLOVER_OUTCOME_BROWSERS,
  browser: process.env.CLOVER_OUTCOME_BROWSER,
  'final-state': process.env.CLOVER_OUTCOME_FINAL_STATE
};
const checks = [
  { id: 'enrollment-schema', status: enrollmentSchema?.status || 'unavailable' },
  { id: 'policy-schema', status: policySchema?.status || 'unavailable' },
  { id: 'enrolled-boundary', status: boundary?.status || 'unavailable' },
  { id: 'install', status: install?.status || 'unavailable' },
  { id: 'verify', status: verify?.status || 'unavailable' },
  { id: 'browser', status: browser?.status || 'unavailable' },
  { id: 'final-state', status: finalState?.status || 'unavailable' }
];
for (const [id, outcome] of Object.entries(runnerOutcomes)) if (outcome) checks.push({ id: `runner-${id}`, status: outcome === 'success' ? 'passed' : outcome === 'failure' || outcome === 'cancelled' ? 'failed' : 'skipped', detail: outcome });
const hashSpecs = [
  ['enrollment-schema.json', process.env.CLOVER_EXPECTED_ENROLLMENT_SCHEMA_SHA],
  ['policy-schema.json', process.env.CLOVER_EXPECTED_POLICY_SCHEMA_SHA],
  ['boundary.json', process.env.CLOVER_EXPECTED_BOUNDARY_SHA],
  ['pre-state.json', process.env.CLOVER_EXPECTED_PRE_STATE_SHA],
  ['commands/install.json', process.env.CLOVER_EXPECTED_INSTALL_SHA],
  ['commands/verify.json', process.env.CLOVER_EXPECTED_VERIFY_SHA],
  ['browser/browser-receipt.json', process.env.CLOVER_EXPECTED_BROWSER_RECEIPT_SHA],
  ['final-state.json', process.env.CLOVER_EXPECTED_FINAL_STATE_SHA]
];
for (const [relative, expected] of hashSpecs) {
  const absolute = path.join(artifactDir, relative);
  const observed = fs.existsSync(absolute) ? crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') : null;
  const expectedIsSealed = /^[0-9a-f]{64}$/.test(expected || '');
  checks.push({ id: `artifact-integrity:${relative}`, status: expectedIsSealed && observed === expected ? 'passed' : 'failed', detail: { expected: expected || null, expectedIsSealed, observed } });
}
const status = checks.every((check) => check.status === 'passed') ? 'passed' : checks.some((check) => check.status === 'failed') ? 'failed' : 'incomplete';
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
const artifacts = ['enrollment-schema.json', 'policy-schema.json', 'boundary.json', 'pre-state.json', 'commands/install.json', 'commands/verify.json', 'browser/browser-receipt.json', 'browser/contact-sheet.png', 'final-state.json'].filter((relative) => fs.existsSync(path.join(artifactDir, relative)));
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
