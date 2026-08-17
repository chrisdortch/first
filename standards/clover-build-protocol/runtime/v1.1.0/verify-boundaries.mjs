#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [policyArg, outputArg] = process.argv.slice(2);
if (!policyArg || !outputArg) {
  console.error('Usage: verify-boundaries.mjs <project-policy.json> <boundary-receipt.json>');
  process.exit(2);
}
const policyPath = path.resolve(policyArg);
const outputPath = path.resolve(outputArg);
const root = process.cwd();
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const globToRegExp = (glob) => {
  let source = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '*' && glob[i + 1] === '*') { source += '.*'; i += 1; }
    else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(`${source}$`);
};
const matchAny = (file, patterns) => patterns.some((pattern) => globToRegExp(pattern).test(file));
const receipt = { schemaVersion: '1.1', protocolVersion: '1.1.0', generatedAt: new Date().toISOString(), status: 'failed', checks: [], changedFiles: [], authority: { releaseState: 'not-authorized', productionEligible: false } };
const add = (id, passed, detail) => receipt.checks.push({ id, status: passed ? 'passed' : 'failed', detail });
try {
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  const head = git('rev-parse', 'HEAD');
  const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git('branch', '--show-current') || 'detached';
  const baseline = policy.source.baselineCommit;
  const productionRef = `origin/${policy.project.productionBranch}`;
  git('cat-file', '-e', `${baseline}^{commit}`);
  git('cat-file', '-e', `${policy.source.productionCommitAtEnrollment}^{commit}`);
  const productionNow = git('rev-parse', productionRef);
  const branchAllowed = policy.execution.allowedBranchPrefixes.some((prefix) => branch.startsWith(prefix));
  const expectedRepository = process.env.GITHUB_REPOSITORY || policy.project.repository;
  const expectedProtocolCommit = process.env.CLOVER_PROTOCOL_REF || policy.protocol.commit;
  const authorityValues = Object.values(policy.authority || {});
  add('repository-identity', policy.project.repository === expectedRepository, `${policy.project.repository} expected ${expectedRepository}`);
  add('protocol-repository', policy.protocol.repository === 'chrisdortch/first', policy.protocol.repository);
  add('protocol-version', policy.protocol.version === '1.1.0', policy.protocol.version);
  add('protocol-commit-pin', policy.protocol.commit === expectedProtocolCommit, `${policy.protocol.commit} expected ${expectedProtocolCommit}`);
  add('authority-denied', authorityValues.length > 0 && authorityValues.every((value) => value === false), policy.authority);
  add('preview-mode', policy.execution.mode === 'preview-only', policy.execution.mode);
  add('non-production-branch', branch !== policy.project.productionBranch, branch);
  add('allowed-branch-prefix', branchAllowed, branch);
  add('baseline-is-ancestor', (() => { try { git('merge-base', '--is-ancestor', baseline, head); return true; } catch { return false; } })(), `${baseline} -> ${head}`);
  add('production-anchor-unchanged', productionNow === policy.source.productionCommitAtEnrollment, `${productionNow} expected ${policy.source.productionCommitAtEnrollment}`);
  const diff = git('diff', '--name-status', `${baseline}...${head}`);
  receipt.changedFiles = diff ? diff.split('\n').map((line) => { const [status, ...parts] = line.split('\t'); return { status, path: parts.at(-1), raw: line }; }) : [];
  const disallowed = receipt.changedFiles.filter((item) => !matchAny(item.path, policy.execution.allowedChangePaths));
  const sensitive = receipt.changedFiles.filter((item) => matchAny(item.path, policy.execution.sensitivePaths));
  add('changed-files-allowed', disallowed.length === 0, disallowed);
  add('sensitive-paths-untouched', sensitive.length === 0, sensitive);
  const forbidden = policy.execution.forbiddenCapabilities || [];
  add('forbidden-capabilities-declared', forbidden.length > 0, forbidden);
  receipt.project = policy.project;
  receipt.source = { branch, commit: head, baselineCommit: baseline, productionCommitAtEnrollment: policy.source.productionCommitAtEnrollment, productionCommitObserved: productionNow };
  receipt.status = receipt.checks.every((check) => check.status === 'passed') ? 'passed' : 'failed';
} catch (error) {
  receipt.checks.push({ id: 'boundary-runtime', status: 'failed', detail: error?.message || String(error) });
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`Clover boundary: ${receipt.status}`);
if (receipt.status !== 'passed') process.exit(1);
