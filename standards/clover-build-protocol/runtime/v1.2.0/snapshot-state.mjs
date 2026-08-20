#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { snapshotSource, writeJson } from './lib.mjs';

const [policyArg, outputArg] = process.argv.slice(2);
if (!policyArg || !outputArg) {
  console.error('Usage: snapshot-state.mjs <policy.json> <output.json>');
  process.exit(2);
}
const snapshot = snapshotSource(process.cwd(), path.resolve(policyArg));
writeJson(path.resolve(outputArg), snapshot);
console.log(`Clover source snapshot: ${snapshot.tracked.treeSha256}`);
