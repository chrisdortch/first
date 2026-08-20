#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { commandList } from './lib.mjs';

const root = process.cwd();
const base = path.join(root, 'standards', 'clover-build-protocol');
const failures = [];
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(base, 'versions', '1.2.0', 'PRE_V1_2_IMMUTABILITY_MANIFEST.json'), 'utf8'));
for (const [relative, expected] of Object.entries(manifest.files)) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) failures.push(`${relative}: missing preserved file`);
  else if (hash(absolute) !== expected) failures.push(`${relative}: byte hash ${hash(absolute)} expected ${expected}`);
}
const pointer = JSON.parse(fs.readFileSync(path.join(root, 'CLOVER_BUILD_PROTOCOL_POINTER.json'), 'utf8'));
if (pointer.currentVersion !== '1.1.0') failures.push(`Current validated version changed to ${pointer.currentVersion}`);
if (pointer.status !== 'portable-pilot-validated') failures.push(`Current validated status changed to ${pointer.status}`);
if (pointer.candidate?.version !== '1.2.0') failures.push('Pointer candidate version is not 1.2.0.');
if (pointer.candidate?.status !== 'candidate-unvalidated-awaiting-exact-head-ci') failures.push(`Pointer candidate status is ${pointer.candidate?.status}`);
if (pointer.candidate?.exactHeadCI?.status !== 'not-run' || pointer.candidate?.exactHeadCI?.commit !== null || pointer.candidate?.exactHeadCI?.runId !== null) failures.push('Pointer makes an unsupported exact-head CI claim.');
const required = [
  '.github/workflows/clover-preview-v1.2.yml',
  'standards/clover-build-protocol/schemas/v1.2.0/project-policy.schema.json',
  'standards/clover-build-protocol/schemas/v1.2.0/enrollment.schema.json',
  'standards/clover-build-protocol/schemas/v1.2.0/build-receipt.schema.json',
  'standards/clover-build-protocol/templates/v1.2.0/project-policy.template.json',
  'standards/clover-build-protocol/templates/v1.2.0/enrollment.template.json',
  'standards/clover-build-protocol/runtime/v1.2.0/verify-boundaries.mjs',
  'standards/clover-build-protocol/runtime/v1.2.0/run-command.mjs',
  'standards/clover-build-protocol/runtime/v1.2.0/browser-audit.mjs',
  'standards/clover-build-protocol/runtime/v1.2.0/assemble-receipt.mjs',
  'standards/clover-build-protocol/runtime/v1.2.0/receipt-contract.mjs',
  'standards/clover-build-protocol/runtime/v1.2.0/verify-final-receipt.mjs'
];
for (const relative of required) if (!fs.existsSync(path.join(root, relative))) failures.push(`Missing candidate artifact: ${relative}`);
try {
  const policy = JSON.parse(fs.readFileSync(path.join(base, 'templates', 'v1.2.0', 'project-policy.template.json'), 'utf8'));
  commandList(policy, 'install');
  commandList(policy, 'verify');
  commandList(policy, 'preview');
} catch (error) {
  failures.push(`Command template violates closed grammar: ${error?.message || String(error)}`);
}
const workflowPath = path.join(root, '.github', 'workflows', 'clover-preview-v1.2.yml');
if (fs.existsSync(workflowPath)) {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  if (workflow.includes('bash -lc') || workflow.includes("spawn('bash'") || workflow.includes('spawn("bash"')) failures.push('Candidate workflow contains shell-string execution.');
  const schemaIndex = workflow.indexOf('Validate enrolled identity and policy schemas');
  const projectCommandIndex = workflow.indexOf('Install project dependencies');
  if (schemaIndex < 0 || projectCommandIndex < 0 || schemaIndex > projectCommandIndex) failures.push('Schema validation is not ordered before project commands.');
  if (!workflow.includes('github.event.pull_request.head.sha || github.sha')) failures.push('Candidate checkout is not bound to the exact pull-request head or dispatch SHA.');
  if (!workflow.includes('repository: ${{ job.workflow_repository }}') || !workflow.includes('ref: ${{ job.workflow_sha }}') || !workflow.includes('CLOVER_PROTOCOL_REF: ${{ job.workflow_sha }}') || !workflow.includes('CLOVER_PROTOCOL_WORKFLOW_PATH: ${{ job.workflow_file_path }}')) failures.push('Protocol checkout is not bound to the reusable workflow own repository, path, and SHA.');
  if (workflow.includes('inputs.protocol_ref')) failures.push('Candidate workflow still trusts a caller-supplied protocol ref.');
  for (const marker of ['protocol_after_install', 'protocol_after_verify', 'protocol_after_browser', 'CLOVER_EXPECTED_INSTALL_SHA', 'CLOVER_EXPECTED_INSTALL_LOG_SHA', 'CLOVER_EXPECTED_BROWSER_RECEIPT_SHA', 'CLOVER_EXPECTED_CONTACT_SHEET_PNG_SHA', 'receipt_control', 'verify-final-receipt.mjs', 'steps.browser.outcome }}" = success']) if (!workflow.includes(marker)) failures.push(`Candidate workflow is missing integrity/gate marker: ${marker}`);
  if (!workflow.includes('runner.temp') || !workflow.includes('_clover_candidate')) failures.push('Candidate, protocol, and evidence paths are not separated.');
}
const receiptSchemaSource = fs.readFileSync(path.join(root, 'standards', 'clover-build-protocol', 'schemas', 'v1.2.0', 'build-receipt.schema.json'), 'utf8');
for (const marker of ['"minItems": 37', 'artifact-integrity:browser/contact-sheet.png', 'sealed-browser-receipt']) if (!receiptSchemaSource.includes(marker)) failures.push(`Build receipt schema lacks a complete passed-evidence contract marker: ${marker}`);
const standardWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'validate-clover-standard.yml'), 'utf8');
if (!standardWorkflow.includes('ref: ${{ github.event.pull_request.head.sha || github.sha }}') || !standardWorkflow.includes('git rev-parse HEAD') || !standardWorkflow.includes('CLOVER_VALIDATION_SHA')) failures.push('Standard validation is not bound to the exact pull-request head or dispatch/push SHA.');
for (const relative of [
  'standards/clover-build-protocol/schemas/v1.2.0/project-policy.schema.json',
  'standards/clover-build-protocol/schemas/v1.2.0/enrollment.schema.json',
  'standards/clover-build-protocol/schemas/v1.2.0/build-receipt.schema.json'
]) {
  try { JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); } catch (error) { failures.push(`${relative}: ${error?.message || String(error)}`); }
}
console.log(failures.length ? failures.join('\n') : 'Clover Build Protocol 1.2 candidate integrity passed; exact-head CI remains unvalidated.');
if (failures.length) process.exit(1);
