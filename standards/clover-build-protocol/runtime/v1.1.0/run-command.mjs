#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [policyArg, commandKey, outputDirArg] = process.argv.slice(2);
if (!policyArg || !commandKey || !outputDirArg) {
  console.error('Usage: run-command.mjs <policy.json> <install|verify> <output-dir>');
  process.exit(2);
}
const policy = JSON.parse(fs.readFileSync(path.resolve(policyArg), 'utf8'));
const command = policy.commands?.[commandKey];
if (!command || typeof command !== 'string') throw new Error(`Policy command not found: ${commandKey}`);
const outputDir = path.resolve(outputDirArg);
fs.mkdirSync(outputDir, { recursive: true });
const logPath = path.join(outputDir, `${commandKey}.log`);
const receiptPath = path.join(outputDir, `${commandKey}.json`);
const startedAt = new Date().toISOString();
const startedMs = Date.now();
const stream = fs.createWriteStream(logPath, { flags: 'w' });
let finalized = false;

function finalize({ code = null, signal = null, error = null }) {
  if (finalized) return;
  finalized = true;
  stream.end();
  const passed = code === 0 && !error;
  const receipt = {
    schemaVersion: '1.1',
    protocolVersion: '1.1.0',
    id: commandKey,
    command,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
    status: passed ? 'passed' : 'failed',
    exitCode: code,
    signal: signal || null,
    error: error ? (error.message || String(error)) : null,
    log: path.basename(logPath),
    authority: { releaseState: 'not-authorized', productionEligible: false }
  };
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  process.exitCode = passed ? 0 : (Number.isInteger(code) && code > 0 ? code : 1);
}

const child = spawn('bash', ['-lc', command], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe']
});
child.stdout.on('data', (chunk) => { process.stdout.write(chunk); stream.write(chunk); });
child.stderr.on('data', (chunk) => { process.stderr.write(chunk); stream.write(chunk); });
child.on('error', (error) => finalize({ error }));
child.on('close', (code, signal) => finalize({ code, signal }));
