#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const base = path.join(root, 'standards', 'clover-build-protocol');
const manifest = JSON.parse(fs.readFileSync(path.join(base, 'versions', '1.1.0', 'V1_0_0_IMMUTABILITY_MANIFEST.json'), 'utf8'));
const failures = [];
for (const [relative, expected] of Object.entries(manifest.gitBlobShas)) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) { failures.push(`${relative}: missing`); continue; }
  const observed = execFileSync('git', ['hash-object', relative], { cwd: root, encoding: 'utf8' }).trim();
  if (observed !== expected) failures.push(`${relative}: ${observed} expected ${expected}`);
}
const pointer = JSON.parse(fs.readFileSync(path.join(root, 'CLOVER_BUILD_PROTOCOL_POINTER.json'), 'utf8'));
if (pointer.currentVersion !== '1.1.0') failures.push(`Pointer currentVersion is ${pointer.currentVersion}`);
if (!fs.existsSync(path.join(root, pointer.currentDocument))) failures.push(`Pointer document missing: ${pointer.currentDocument}`);
const required = ['CLOVER_BUILD_PROTOCOL.md','REUSABLE_EXECUTION.md','SCHEMAS_AND_RECEIPTS.md','TOKEN_EFFICIENCY.md','RELEASE_BOUNDARIES.md','IMPLEMENTATION_RECORD.md'];
for (const name of required) if (!fs.existsSync(path.join(base, 'versions', '1.1.0', name))) failures.push(`Missing 1.1.0 document: ${name}`);
console.log(failures.length ? failures.join('\n') : 'Clover standard integrity passed.');
if (failures.length) process.exit(1);
