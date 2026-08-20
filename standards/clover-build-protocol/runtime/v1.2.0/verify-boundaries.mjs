#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { assertFullSha, changedFilesBetween, git, matchesAny, readJson, resolveContainedPath, sha256, snapshotProtocolCheckout, writeJson } from './lib.mjs';

const [policyArg, enrollmentArg, outputArg] = process.argv.slice(2);
if (!policyArg || !enrollmentArg || !outputArg) {
  console.error('Usage: verify-boundaries.mjs <project-policy.json> <enrollment-relative-path> <receipt.json>');
  process.exit(2);
}
const root = process.cwd();
const output = path.resolve(outputArg);
const receipt = { schemaVersion: '1.2', protocolVersion: '1.2.0', generatedAt: new Date().toISOString(), status: 'failed', checks: [], changedFiles: [], authority: { releaseState: 'not-authorized', productionEligible: false } };
const add = (id, passed, detail) => receipt.checks.push({ id, status: passed ? 'passed' : 'failed', detail });
try {
  const protocolRoot = process.env.CLOVER_PROTOCOL_CHECKOUT;
  if (!protocolRoot) throw new Error('CLOVER_PROTOCOL_CHECKOUT is required.');
  const protocolCommit = process.env.CLOVER_PROTOCOL_REF;
  const protocolRepository = process.env.CLOVER_PROTOCOL_REPOSITORY;
  const protocolWorkflowPath = process.env.CLOVER_PROTOCOL_WORKFLOW_PATH;
  const candidateCommit = process.env.CLOVER_CANDIDATE_SHA;
  const expectedRepository = process.env.GITHUB_REPOSITORY;
  assertFullSha(protocolCommit, 'CLOVER_PROTOCOL_REF');
  assertFullSha(candidateCommit, 'CLOVER_CANDIDATE_SHA');
  if (!expectedRepository) throw new Error('GITHUB_REPOSITORY is required; project self-claims are not a repository trust root.');
  if (!/^standards\/clover-build-protocol\/enrollments\/v1\.2\.0\/[a-z0-9][a-z0-9-]{0,62}\.json$/.test(enrollmentArg)) throw new Error('enrollment_path must identify a versioned central 1.2 enrollment record.');
  const enrollmentPath = resolveContainedPath(protocolRoot, enrollmentArg, 'enrollment_path');
  const policyInput = policyArg.split(path.sep).join('/').replace(/^\.\//, '');
  const policyPath = resolveContainedPath(root, policyInput, 'policy_path');
  const enrollment = readJson(enrollmentPath);
  const policy = readJson(policyPath);
  const observedProtocolCommit = git(protocolRoot, 'rev-parse', 'HEAD');
  const protocolSnapshot = snapshotProtocolCheckout();
  const head = git(root, 'rev-parse', 'HEAD');
  const tree = git(root, 'rev-parse', 'HEAD^{tree}');
  const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git(root, 'branch', '--show-current') || 'detached';
  add('protocol-exact-checkout', observedProtocolCommit === protocolCommit, `${observedProtocolCommit} expected ${protocolCommit}`);
  add('protocol-tracked-tree-clean', protocolSnapshot.exactCommit && protocolSnapshot.trackedClean && protocolSnapshot.tooling.present, { exactCommit: protocolSnapshot.exactCommit, trackedClean: protocolSnapshot.trackedClean, trackedTreeSha256: protocolSnapshot.tracked.treeSha256, toolingTreeSha256: protocolSnapshot.tooling.treeSha256 });
  add('protocol-workflow-repository', protocolRepository === 'chrisdortch/first', `${protocolRepository} expected chrisdortch/first`);
  add('protocol-workflow-path', protocolWorkflowPath === '.github/workflows/clover-preview-v1.2.yml', `${protocolWorkflowPath} expected .github/workflows/clover-preview-v1.2.yml`);
  add('candidate-exact-checkout', head === candidateCommit, `${head} expected ${candidateCommit}`);
  add('enrollment-status', enrollment.status === 'enrolled', enrollment.status);
  const enrollmentTracked = (() => { try { git(protocolRoot, 'ls-files', '--error-unmatch', '--', enrollmentArg); return true; } catch { return false; } })();
  add('enrollment-is-tracked', enrollmentTracked, enrollmentArg);
  let enrolledBlob = null;
  if (enrollmentTracked) {
    const blobId = git(protocolRoot, 'rev-parse', `HEAD:${enrollmentArg}`);
    enrolledBlob = execFileSync('git', ['cat-file', 'blob', blobId], { cwd: protocolRoot });
  }
  add('enrollment-matches-head-blob', enrolledBlob !== null && enrolledBlob.equals(fs.readFileSync(enrollmentPath)), enrolledBlob === null ? 'tracked HEAD blob unavailable' : { headBlobSha256: sha256(enrolledBlob), workingSha256: sha256(fs.readFileSync(enrollmentPath)) });
  add('enrollment-filename', path.basename(enrollmentArg, '.json') === enrollment.project.id, `${path.basename(enrollmentArg, '.json')} expected ${enrollment.project.id}`);
  add('repository-from-enrollment', enrollment.project.repository === expectedRepository, `${enrollment.project.repository} expected ${expectedRepository}`);
  add('policy-path-from-enrollment', enrollment.policy.path === policyInput, `${policyInput} expected ${enrollment.policy.path}`);
  add('policy-byte-hash', sha256(fs.readFileSync(policyPath)) === enrollment.policy.sha256, `${sha256(fs.readFileSync(policyPath))} expected ${enrollment.policy.sha256}`);
  add('policy-project-id', policy.project.id === enrollment.project.id, `${policy.project.id} expected ${enrollment.project.id}`);
  add('policy-repository', policy.project.repository === enrollment.project.repository, `${policy.project.repository} expected ${enrollment.project.repository}`);
  add('policy-production-branch', policy.project.productionBranch === enrollment.project.productionBranch, `${policy.project.productionBranch} expected ${enrollment.project.productionBranch}`);
  add('protocol-version', policy.protocol.version === enrollment.protocolVersion && enrollment.protocolVersion === '1.2.0', `${policy.protocol.version} / ${enrollment.protocolVersion}`);
  add('preview-mode', policy.execution.mode === 'preview-only', policy.execution.mode);
  add('authority-denied', Object.values(policy.authority || {}).length === 7 && Object.values(policy.authority || {}).every((value) => value === false), policy.authority);
  add('policy-is-tracked', (() => { try { git(root, 'ls-files', '--error-unmatch', '--', policyInput); return true; } catch { return false; } })(), policyInput);
  const baseline = enrollment.source.baselineCommit;
  const baselineTree = git(root, 'rev-parse', `${baseline}^{tree}`);
  add('baseline-tree-enrolled', baselineTree === enrollment.source.baselineTree, `${baselineTree} expected ${enrollment.source.baselineTree}`);
  add('baseline-is-ancestor', (() => { try { git(root, 'merge-base', '--is-ancestor', baseline, head); return true; } catch { return false; } })(), `${baseline} -> ${head}`);
  const productionRef = `origin/${enrollment.project.productionBranch}`;
  const productionNow = git(root, 'rev-parse', productionRef);
  add('production-anchor-unchanged', productionNow === enrollment.source.productionCommitAtEnrollment, `${productionNow} expected ${enrollment.source.productionCommitAtEnrollment}`);
  add('non-production-branch', branch !== enrollment.project.productionBranch, branch);
  add('allowed-branch-prefix', policy.execution.allowedBranchPrefixes.some((prefix) => branch.startsWith(prefix)), branch);
  receipt.changedFiles = changedFilesBetween(root, `${baseline}...${head}`);
  const changedPaths = [...new Set(receipt.changedFiles.flatMap((entry) => entry.paths))];
  const disallowed = changedPaths.filter((file) => !matchesAny(file, policy.execution.allowedChangePaths));
  const sensitive = changedPaths.filter((file) => matchesAny(file, policy.execution.sensitivePaths));
  add('changed-files-allowed', disallowed.length === 0, disallowed);
  add('sensitive-paths-untouched', sensitive.length === 0, sensitive);
  receipt.project = enrollment.project;
  receipt.protocol = { repository: protocolRepository, commit: protocolCommit, workflow: protocolWorkflowPath };
  receipt.source = { branch, commit: head, tree, baselineCommit: baseline, baselineTree, productionCommitAtEnrollment: enrollment.source.productionCommitAtEnrollment, productionCommitObserved: productionNow };
  receipt.enrollment = { path: enrollmentArg, sha256: sha256(fs.readFileSync(enrollmentPath)), policySha256: enrollment.policy.sha256 };
  receipt.status = receipt.checks.every((check) => check.status === 'passed') ? 'passed' : 'failed';
} catch (error) {
  receipt.checks.push({ id: 'boundary-runtime', status: 'failed', detail: error?.message || String(error) });
}
writeJson(output, receipt);
console.log(`Clover enrolled boundary: ${receipt.status}`);
if (receipt.status !== 'passed') process.exit(1);
