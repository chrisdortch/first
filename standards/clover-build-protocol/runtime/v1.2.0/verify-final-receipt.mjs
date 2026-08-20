#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { readJson, sha256 } from './lib.mjs';
import { validatePassedReceipt } from './receipt-contract.mjs';

const [receiptArg, artifactDirArg] = process.argv.slice(2);
if (!receiptArg || !artifactDirArg) {
  console.error('Usage: verify-final-receipt.mjs <build-receipt.json> <artifact-dir>');
  process.exit(2);
}
const receiptPath = path.resolve(receiptArg);
const artifactDir = path.resolve(artifactDirArg);
const failures = validatePassedReceipt(readJson(receiptPath), artifactDir, process.env);
const expectedReceiptSha = process.env.CLOVER_EXPECTED_RECEIPT_SHA || '';
if (!/^[0-9a-f]{64}$/.test(expectedReceiptSha) || sha256(fs.readFileSync(receiptPath)) !== expectedReceiptSha) failures.push('Build receipt hash does not match its immutable assembly-step output');
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log('Clover final build receipt and artifact gate: passed');
