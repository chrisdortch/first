#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { compareSnapshots, localStatePassed, readJson, snapshotSource, writeJson } from './lib.mjs';

const [policyArg, beforeArg, outputArg] = process.argv.slice(2);
if (!policyArg || !beforeArg || !outputArg) {
  console.error('Usage: verify-state.mjs <policy.json> <before.json> <receipt.json>');
  process.exit(2);
}
const before = readJson(path.resolve(beforeArg));
const after = snapshotSource(process.cwd(), path.resolve(policyArg));
const observations = compareSnapshots(before, after);
const receipt = {
  schemaVersion: '1.2',
  protocolVersion: '1.2.0',
  generatedAt: new Date().toISOString(),
  status: localStatePassed(observations) ? 'passed' : 'failed',
  before,
  after,
  observations,
  authority: { releaseState: 'not-authorized', productionEligible: false }
};
writeJson(path.resolve(outputArg), receipt);
console.log(`Clover source-state verification: ${receipt.status}`);
if (receipt.status !== 'passed') process.exit(1);
