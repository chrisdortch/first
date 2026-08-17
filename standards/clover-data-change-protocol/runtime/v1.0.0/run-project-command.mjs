#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [policyArg, commandKey, outputDirArg] = process.argv.slice(2);
if (!policyArg || !commandKey || !outputDirArg) {
  console.error('Usage: run-project-command.mjs <policy.json> <install|verify> <output-dir>');
  process.exit(2);
}
if (!['install', 'verify'].includes(commandKey)) throw new Error(`Unsupported command key: ${commandKey}`);

const policy = JSON.parse(fs.readFileSync(path.resolve(policyArg), 'utf8'));
const command = policy.commands?.[commandKey];
if (!command || typeof command !== 'string') throw new Error(`Policy command not found: ${commandKey}`);

function parseNpmCommand(value) {
  if (value === 'npm ci') return ['ci'];
  if (value === 'npm test') return ['test'];
  const match = /^npm run ([A-Za-z0-9:_-]+)$/.exec(value);
  if (match) return ['run', match[1]];
  throw new Error(`Unsafe or unsupported project command: ${value}`);
}

const args = parseNpmCommand(command);
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
    schemaVersion: '1.0',
    protocolVersion: '1.0.0',
    id: commandKey,
    command,
    executable: 'npm',
    arguments: args,
    shell: false,
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

const child = spawn('npm', args, {
  cwd: process.cwd(),
  env: process.env,
  shell: false,
  stdio: ['ignore', 'pipe', 'pipe']
});
child.stdout.on('data', (chunk) => { process.stdout.write(chunk); stream.write(chunk); });
child.stderr.on('data', (chunk) => { process.stderr.write(chunk); stream.write(chunk); });
child.on('error', (error) => finalize({ error }));
child.on('close', (code, signal) => finalize({ code, signal }));
