#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const [policyArg, outputArg] = process.argv.slice(2);
if (!policyArg || !outputArg) {
  console.error('Usage: verify-data-boundaries.mjs <policy.json> <output.json>');
  process.exit(2);
}

const root = process.cwd();
const policy = JSON.parse(fs.readFileSync(path.resolve(root, policyArg), 'utf8'));
const outputPath = path.resolve(root, outputArg);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

function git(args, allowFailure = false) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
  }
  return result.status === 0 ? result.stdout.trim() : '';
}

function globToRegExp(glob) {
  let source = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    const next = glob[i + 1];
    if (char === '*' && next === '*') {
      if (glob[i + 2] === '/') {
        source += '(?:.*/)?';
        i += 2;
      } else {
        source += '.*';
        i += 1;
      }
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  return new RegExp(`${source}$`);
}

function matches(file, patterns = []) {
  return patterns.some((pattern) => globToRegExp(pattern).test(file));
}

const failures = [];
const head = git(['rev-parse', 'HEAD']);
const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git(['branch', '--show-current'], true);
const repository = process.env.GITHUB_REPOSITORY || policy.project.repository;
const baseline = policy.source.baselineCommit;
const productionCommit = policy.source.productionCommitAtEnrollment;

if (repository !== policy.project.repository) failures.push(`Repository mismatch: ${repository}`);
if (!/^[0-9a-f]{40}$/.test(baseline)) failures.push('Baseline commit is not an exact SHA.');
if (!/^[0-9a-f]{40}$/.test(productionCommit)) failures.push('Production enrollment commit is not an exact SHA.');
if (policy.execution.mode !== 'disposable-database-only') failures.push('Execution mode must be disposable-database-only.');
if (branch === policy.project.productionBranch) failures.push('Data rehearsal cannot run from the production branch.');
if (!policy.execution.allowedBranchPrefixes.some((prefix) => branch.startsWith(prefix))) {
  failures.push(`Branch ${branch || '(detached)'} is outside allowed prefixes.`);
}

git(['cat-file', '-e', `${baseline}^{commit}`]);
if (git(['merge-base', '--is-ancestor', baseline, head], true) === '') {
  const probe = spawnSync('git', ['merge-base', '--is-ancestor', baseline, head], { cwd: root });
  if (probe.status !== 0) failures.push('Baseline commit is not an ancestor of the candidate.');
}

const changedOutput = git(['diff', '--name-only', `${baseline}...${head}`], true);
const changedFiles = changedOutput ? changedOutput.split('\n').filter(Boolean).sort() : [];
for (const file of changedFiles) {
  if (!matches(file, policy.execution.allowedChangePaths)) failures.push(`Changed path is not allowed: ${file}`);
  if (matches(file, policy.execution.sensitivePaths)) failures.push(`Sensitive path changed: ${file}`);
}
if (!changedFiles.length) failures.push('Candidate contains no changed files.');

const activeForbiddenEnvironmentVariables = policy.execution.forbiddenEnvironmentVariables.filter(
  (name) => Boolean(process.env[name])
);
if (activeForbiddenEnvironmentVariables.length) {
  failures.push(`Production-style database environment variable(s) are active: ${activeForbiddenEnvironmentVariables.join(', ')}`);
}

for (const [key, value] of Object.entries(policy.authority || {})) {
  if (value !== false) failures.push(`Authority flag must remain false: ${key}`);
}

const receipt = {
  schemaVersion: '1.0',
  protocolVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  status: failures.length ? 'failed' : 'passed',
  repository,
  branch,
  baselineCommit: baseline,
  productionCommitAtEnrollment: productionCommit,
  candidateCommit: head,
  changedFiles,
  activeForbiddenEnvironmentVariables,
  failures,
  safety: {
    productionDatabaseConnectionAccepted: false,
    productionDataReadAuthorized: false,
    productionDataWriteAuthorized: false
  }
};

fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`Clover data boundary: ${receipt.status}`);
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
