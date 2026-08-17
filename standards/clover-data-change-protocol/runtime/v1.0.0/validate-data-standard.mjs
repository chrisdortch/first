#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const pointer = read('CLOVER_DATA_CHANGE_PROTOCOL_POINTER.json');
const registry = read('standards/clover-data-change-protocol/registry/projects.json');

const required = [
  pointer.currentDocument,
  '.github/workflows/clover-data-preview-v1.yml',
  'standards/clover-data-change-protocol/schemas/data-change-policy.schema.json',
  'standards/clover-data-change-protocol/schemas/data-change-receipt.schema.json',
  'standards/clover-data-change-protocol/runtime/v1.0.0/verify-data-boundaries.mjs',
  'standards/clover-data-change-protocol/runtime/v1.0.0/run-project-command.mjs',
  'standards/clover-data-change-protocol/runtime/v1.0.0/data-rehearsal.mjs',
  'standards/clover-data-change-protocol/runtime/v1.0.0/assemble-data-receipt.mjs'
];

const failures = [];
if (pointer.currentVersion !== '1.0.0') failures.push('Pointer version must be 1.0.0.');
if (pointer.standingProductionAuthority !== false) failures.push('Standing production authority must be false.');
if (pointer.defaultAutomationMode !== 'disposable-database-only') failures.push('Default mode must be disposable-database-only.');
if (registry.protocolVersion !== '1.0.0') failures.push('Registry protocol version mismatch.');
for (const file of required) if (!fs.existsSync(path.join(root, file))) failures.push(`Missing required file: ${file}`);
for (const project of registry.projects || []) {
  if (project.productionDatabaseAccessed !== false) failures.push(`Registry must deny production access: ${project.projectId}`);
  if (Object.values(project.authority || {}).some((value) => value !== false)) failures.push(`Registry authority must remain false: ${project.projectId}`);
}
const buildPointer = read('CLOVER_BUILD_PROTOCOL_POINTER.json');
if (buildPointer.currentVersion !== '1.1.0') failures.push('Clover Build Protocol 1.1.0 pointer changed unexpectedly.');

if (failures.length) {
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}
console.log('Clover Data Change Protocol standard: passed');
