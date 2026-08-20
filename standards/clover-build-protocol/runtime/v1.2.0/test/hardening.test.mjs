import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { assertUrlOrigin, changedFilesBetween, commandList, compareProtocolSnapshots, compareSnapshots, resolveContainedPath, resolveLoopbackRoute, snapshotProtocolCheckout, snapshotSource, validateCommand } from '../lib.mjs';

test('structured commands accept bounded argv and reject shell forms', () => {
  assert.deepEqual(validateCommand({ executable: 'npm', args: ['run', 'build'], timeoutSeconds: 30 }), { executable: 'npm', args: ['run', 'build'], timeoutSeconds: 30 });
  for (const command of [
    'npm run build',
    { executable: 'bash', args: ['-lc', 'npm test'] },
    { executable: '/usr/bin/npm', args: ['test'] },
    { executable: 'npm', args: ['test && curl example.invalid'] },
    { executable: 'npm', args: ['run', 'build\nwhoami'] }
  ]) assert.throws(() => validateCommand(command));
  assert.throws(() => commandList({ commands: { verify: [{ executable: 'npm', args: ['exec', 'tool'] }] } }, 'verify'));
  assert.throws(() => commandList({ commands: { preview: { executable: 'npm', args: ['run', 'preview', '--host', '127.0.0.1'] } } }, 'preview'));
  assert.doesNotThrow(() => commandList({ commands: { preview: { executable: 'npm', args: ['run', 'preview', '--', '--host', '127.0.0.1'] } } }, 'preview'));
});

test('contained path resolution rejects traversal and symlinks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clover-path-'));
  fs.mkdirSync(path.join(root, 'records'));
  fs.writeFileSync(path.join(root, 'records', 'enrollment.json'), '{}');
  assert.equal(resolveContainedPath(root, 'records/enrollment.json'), fs.realpathSync(path.join(root, 'records', 'enrollment.json')));
  assert.throws(() => resolveContainedPath(root, '../outside.json'));
  fs.symlinkSync(path.join(root, 'records'), path.join(root, 'linked'));
  assert.throws(() => resolveContainedPath(root, 'linked/enrollment.json'));
});

test('browser routes remain on the exact loopback origin', () => {
  assert.equal(resolveLoopbackRoute('http://127.0.0.1:4173', '/status?full=1').origin, 'http://127.0.0.1:4173');
  assert.throws(() => resolveLoopbackRoute('http://127.0.0.1:4173', '//example.com'));
  assert.throws(() => resolveLoopbackRoute('http://127.0.0.1:4173', '/\\example.com'));
  assert.throws(() => assertUrlOrigin('https://example.com/', 'http://127.0.0.1:4173', 'Redirect'));
});

test('source snapshots detect tracked bytes, policy bytes, and HEAD changes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clover-source-'));
  execFileSync('git', ['init', '-q', '-b', 'agent/test'], { cwd: root });
  fs.mkdirSync(path.join(root, '.clover'));
  const policy = path.join(root, '.clover', 'project-policy.json');
  fs.writeFileSync(policy, '{"policy":1}\n');
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'before\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Clover Test', '-c', 'user.email=clover@example.invalid', 'commit', '-q', '-m', 'baseline'], { cwd: root });
  const before = snapshotSource(root, policy);
  const stable = snapshotSource(root, policy);
  assert.equal(compareSnapshots(before, stable).trackedTreeMutation.state, 'not-observed');
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'after\n');
  const changed = snapshotSource(root, policy);
  assert.equal(compareSnapshots(before, changed).trackedTreeMutation.state, 'observed');
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'before\n');
  fs.writeFileSync(policy, '{"policy":2}\n');
  const policyChanged = snapshotSource(root, policy);
  assert.equal(compareSnapshots(before, policyChanged).policyMutation.state, 'observed');
});

test('changed-file evidence includes both sides of a rename', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clover-rename-'));
  execFileSync('git', ['init', '-q', '-b', 'agent/test'], { cwd: root });
  fs.writeFileSync(path.join(root, 'sensitive.txt'), 'value\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Clover Test', '-c', 'user.email=clover@example.invalid', 'commit', '-q', '-m', 'baseline'], { cwd: root });
  const baseline = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  execFileSync('git', ['mv', 'sensitive.txt', 'allowed.txt'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Clover Test', '-c', 'user.email=clover@example.invalid', 'commit', '-q', '-m', 'rename'], { cwd: root });
  const entries = changedFilesBetween(root, `${baseline}...HEAD`);
  assert.deepEqual(entries[0].paths, ['sensitive.txt', 'allowed.txt']);
});

test('protocol snapshots detect mutation of untracked installed tooling', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clover-protocol-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  fs.writeFileSync(path.join(root, 'runtime.mjs'), 'export const trusted = true;\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Clover Test', '-c', 'user.email=clover@example.invalid', 'commit', '-q', '-m', 'protocol'], { cwd: root });
  fs.mkdirSync(path.join(root, 'node_modules', 'tool'), { recursive: true });
  const tool = path.join(root, 'node_modules', 'tool', 'index.js');
  fs.writeFileSync(tool, 'trusted\n');
  const previousRoot = process.env.CLOVER_PROTOCOL_CHECKOUT;
  const previousRef = process.env.CLOVER_PROTOCOL_REF;
  process.env.CLOVER_PROTOCOL_CHECKOUT = root;
  process.env.CLOVER_PROTOCOL_REF = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  try {
    const before = snapshotProtocolCheckout();
    fs.writeFileSync(tool, 'tampered\n');
    const after = snapshotProtocolCheckout();
    assert.equal(compareProtocolSnapshots(before, after).state, 'observed');
  } finally {
    if (previousRoot === undefined) delete process.env.CLOVER_PROTOCOL_CHECKOUT; else process.env.CLOVER_PROTOCOL_CHECKOUT = previousRoot;
    if (previousRef === undefined) delete process.env.CLOVER_PROTOCOL_REF; else process.env.CLOVER_PROTOCOL_REF = previousRef;
  }
});

test('candidate receipts do not encode unsupported Attempted false fields', () => {
  const runtime = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  for (const name of ['run-command.mjs', 'browser-audit.mjs', 'assemble-receipt.mjs']) {
    const source = fs.readFileSync(path.join(runtime, name), 'utf8');
    assert.doesNotMatch(source, /Attempted\s*:/i);
  }
});

test('build receipt schema compiles and requires exact identity for passed status', () => {
  const runtime = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const schema = JSON.parse(fs.readFileSync(path.resolve(runtime, '..', '..', 'schemas', 'v1.2.0', 'build-receipt.schema.json'), 'utf8'));
  const validate = new Ajv2020({ allErrors: true, strict: true, validateFormats: false }).compile(schema);
  const receipt = {
    schemaVersion: '1.2',
    protocolVersion: '1.2.0',
    generatedAt: new Date().toISOString(),
    protocol: { repository: 'chrisdortch/first', commit: null, workflow: '.github/workflows/clover-preview-v1.2.yml' },
    project: { id: 'sample', repository: 'owner/repo', title: 'Sample' },
    source: { commit: null, tree: null, branch: null, baselineCommit: null, baselineTree: null, productionCommitAtEnrollment: null },
    enrollment: { path: null, sha256: null, policySha256: null },
    status: 'incomplete',
    authority: { releaseState: 'not-authorized', productionEligible: false },
    checks: [],
    observations: {
      processExecutions: [],
      trackedTreeMutation: { state: 'unknown', basis: 'fixture' },
      policyMutation: { state: 'unknown', basis: 'fixture' },
      sourceCommitMutation: { state: 'unknown', basis: 'fixture' },
      protocolCheckoutMutation: { state: 'unknown', basis: 'fixture' },
      externalProviderSideEffects: { state: 'unknown', basis: 'fixture' }
    },
    browser: null,
    artifacts: []
  };
  assert.equal(validate(receipt), true, JSON.stringify(validate.errors));
  receipt.status = 'passed';
  assert.equal(validate(receipt), false);
});
