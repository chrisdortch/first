#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { commandList, compareProtocolSnapshots, compareSnapshots, executeCommand, localStatePassed, readJson, sha256, snapshotProtocolCheckout, snapshotSource, unknownExternalObservation, writeJson } from './lib.mjs';

const [policyArg, commandKey, outputDirArg] = process.argv.slice(2);
if (!policyArg || !['install', 'verify'].includes(commandKey) || !outputDirArg) {
  console.error('Usage: run-command.mjs <policy.json> <install|verify> <output-dir>');
  process.exit(2);
}
const policyPath = path.resolve(policyArg);
const policy = readJson(policyPath);
const commands = commandList(policy, commandKey);
const outputDir = path.resolve(outputDirArg);
fs.mkdirSync(outputDir, { recursive: true });
const logPath = path.join(outputDir, `${commandKey}.log`);
const logFd = fs.openSync(logPath, 'w');
const before = snapshotSource(process.cwd(), policyPath);
const protocolBefore = snapshotProtocolCheckout();
if (!protocolBefore.exactCommit || !protocolBefore.trackedClean) throw new Error('Protocol checkout is not exact and clean before project execution.');
const executions = [];
try {
  for (const command of commands) {
    const commandBefore = snapshotSource(process.cwd(), policyPath);
    const commandProtocolBefore = snapshotProtocolCheckout();
    const result = await executeCommand(command, { cwd: process.cwd(), logFd });
    const commandAfter = snapshotSource(process.cwd(), policyPath);
    const commandProtocolAfter = snapshotProtocolCheckout();
    const commandObservations = compareSnapshots(commandBefore, commandAfter);
    const protocolObservation = compareProtocolSnapshots(commandProtocolBefore, commandProtocolAfter);
    result.source = { before: commandBefore, after: commandAfter };
    result.observations = { ...commandObservations, protocolCheckoutMutation: protocolObservation };
    executions.push(result);
    if (result.status !== 'passed' || !localStatePassed(commandObservations) || protocolObservation.state !== 'not-observed') break;
  }
} finally {
  fs.closeSync(logFd);
}
const after = snapshotSource(process.cwd(), policyPath);
const observations = compareSnapshots(before, after);
const protocolAfter = snapshotProtocolCheckout();
const protocolObservation = compareProtocolSnapshots(protocolBefore, protocolAfter);
const passed = executions.length === commands.length && executions.every((item) => item.status === 'passed' && localStatePassed(item.observations) && item.observations.protocolCheckoutMutation.state === 'not-observed') && localStatePassed(observations) && protocolObservation.state === 'not-observed';
const receipt = {
  schemaVersion: '1.2',
  protocolVersion: '1.2.0',
  id: commandKey,
  generatedAt: new Date().toISOString(),
  status: passed ? 'passed' : 'failed',
  commands: executions,
  source: { before, after },
  observations: { ...observations, protocolCheckoutMutation: protocolObservation, externalProviderSideEffects: unknownExternalObservation() },
  log: path.basename(logPath),
  authority: { releaseState: 'not-authorized', productionEligible: false }
};
writeJson(path.join(outputDir, `${commandKey}.json`), receipt);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${commandKey}_log_sha256=${sha256(fs.readFileSync(logPath))}\n`);
console.log(`Clover command group ${commandKey}: ${receipt.status}`);
if (!passed) process.exit(1);
