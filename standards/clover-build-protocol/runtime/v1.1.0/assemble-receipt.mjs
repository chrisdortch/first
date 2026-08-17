#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [policyArg, artifactDirArg] = process.argv.slice(2);
if (!policyArg || !artifactDirArg) process.exit(2);
const policy = JSON.parse(fs.readFileSync(path.resolve(policyArg), 'utf8'));
const artifactDir = path.resolve(artifactDirArg);
const read = (name) => { try { return JSON.parse(fs.readFileSync(path.join(artifactDir, name), 'utf8')); } catch { return null; } };
const boundary = read('boundary.json');
const schema = read('policy-schema.json');
const install = read('commands/install.json');
const verify = read('commands/verify.json');
const browser = read('browser/browser-receipt.json');
const checks = [
  { id: 'boundary', status: boundary?.status || 'unavailable' },
  { id: 'policy-schema', status: schema?.status || 'unavailable' },
  { id: 'install', status: install?.status || 'unavailable' },
  { id: 'verify', status: verify?.status || 'unavailable' },
  { id: 'browser', status: browser?.status || 'unavailable' }
];
const status = checks.every((check) => check.status === 'passed') ? 'passed' : checks.some((check) => check.status === 'failed') ? 'failed' : 'incomplete';
const receipt = { schemaVersion: '1.1', protocolVersion: '1.1.0', generatedAt: new Date().toISOString(), project: { id: policy.project.id, repository: policy.project.repository, title: policy.project.title }, source: { commit: process.env.GITHUB_SHA || null, branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || null, baselineCommit: policy.source.baselineCommit, productionCommitAtEnrollment: policy.source.productionCommitAtEnrollment, protocolCommit: policy.protocol.commit }, status, authority: { releaseState: 'not-authorized', productionEligible: false }, checks, browser: browser ? browser.summary : null, artifacts: ['boundary.json','policy-schema.json','commands/install.json','commands/verify.json','browser/browser-receipt.json','browser/contact-sheet.png'], safety: { mergeAttempted: false, productionDeploymentAttempted: false, productionDataMutationAttempted: false, domainOrDnsChangeAttempted: false, secretChangeAttempted: false, externalMessageAttempted: false, purchaseAttempted: false } };
fs.writeFileSync(path.join(artifactDir, 'build-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`Clover build receipt: ${status}`);
if (status !== 'passed') process.exitCode = 1;
