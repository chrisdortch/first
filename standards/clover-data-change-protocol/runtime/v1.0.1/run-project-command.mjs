#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { sha256, writeJson } from "./integrity.mjs";

export function parseNpmCommand(value) {
  if (value === "npm ci") return ["ci"];
  if (value === "npm test") return ["test"];
  const match = /^npm run ([A-Za-z0-9:_-]+)$/.exec(value);
  if (match) return ["run", match[1]];
  throw new Error(`Unsafe or unsupported project command: ${value}`);
}

export function projectEnvironment(environment = process.env) {
  const names = ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "CI", "NODE_ENV", "LANG", "LC_ALL", "TERM", "NO_COLOR"];
  return Object.fromEntries(names.filter((name) => typeof environment[name] === "string").map((name) => [name, environment[name]]));
}

function appendOutput(name, value, environment) {
  if (environment.GITHUB_OUTPUT) fs.appendFileSync(environment.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function terminateGroup(child, signal) {
  if (!child.pid) return "not-started";
  try {
    process.kill(-child.pid, signal);
    return "signal-sent";
  } catch (error) {
    if (error?.code === "ESRCH") return "no-remaining-process-group";
    return `error:${error?.code || "unknown"}`;
  }
}

export async function runProjectCommand({ policyPath, commandKey, outputDirectory, cwd = process.cwd(), environment = process.env }) {
  if (!["install", "verify"].includes(commandKey)) throw new Error(`Unsupported command key: ${commandKey}`);
  const policy = JSON.parse(fs.readFileSync(path.resolve(cwd, policyPath), "utf8"));
  const command = policy.commands?.[commandKey];
  if (!command || typeof command !== "string") throw new Error(`Policy command not found: ${commandKey}`);
  const argumentsList = parseNpmCommand(command);
  const output = path.resolve(cwd, outputDirectory);
  fs.mkdirSync(output, { recursive: true });
  const logPath = path.join(output, `${commandKey}.log`);
  const receiptPath = path.join(output, `${commandKey}.json`);
  const logDescriptor = fs.openSync(logPath, "w", 0o600);
  const startedAt = new Date().toISOString();
  const startedMilliseconds = Date.now();
  const timeoutMilliseconds = 20 * 60 * 1000;

  return new Promise((resolve) => {
    let finalized = false;
    let finishing = false;
    let timedOut = false;
    let spawnError = null;
    const child = spawn("npm", argumentsList, {
      cwd,
      env: projectEnvironment(environment),
      shell: false,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const writeChunk = (chunk, destination) => {
      destination.write(chunk);
      fs.writeSync(logDescriptor, chunk);
    };
    const finalize = ({ code = null, signal = null, processGroupTermination = "not-observed" } = {}) => {
      if (finalized) return;
      finalized = true;
      fs.closeSync(logDescriptor);
      const passed = code === 0 && !timedOut && !spawnError;
      const receipt = {
        schemaVersion: "1.1",
        protocolVersion: "1.0.1",
        id: commandKey,
        command,
        executable: "npm",
        arguments: argumentsList,
        shell: false,
        environmentMode: "allowlist",
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMilliseconds,
        timeoutMs: timeoutMilliseconds,
        timedOut,
        processStarted: child.pid !== undefined,
        exitCode: code,
        signal: signal || null,
        processGroupTermination,
        error: spawnError,
        status: passed ? "passed" : "failed",
        log: path.basename(logPath),
        authority: { releaseState: "not-authorized", productionEligible: false }
      };
      const receiptSha256 = writeJson(receiptPath, receipt);
      const logSha256 = sha256(fs.readFileSync(logPath));
      appendOutput(`${commandKey}_receipt_sha256`, receiptSha256, environment);
      appendOutput(`${commandKey}_log_sha256`, logSha256, environment);
      resolve({ passed, exitCode: passed ? 0 : (Number.isInteger(code) && code > 0 ? code : 1), receipt, receiptSha256, logSha256 });
    };
    child.stdout.on("data", (chunk) => writeChunk(chunk, process.stdout));
    child.stderr.on("data", (chunk) => writeChunk(chunk, process.stderr));
    child.on("error", (error) => { spawnError = error?.message || String(error); });
    const timer = setTimeout(() => {
      timedOut = true;
      terminateGroup(child, "SIGTERM");
      setTimeout(() => terminateGroup(child, "SIGKILL"), 5000).unref();
    }, timeoutMilliseconds);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (finishing) return;
      finishing = true;
      const term = terminateGroup(child, "SIGTERM");
      setTimeout(() => {
        const kill = terminateGroup(child, "SIGKILL");
        finalize({ code, signal, processGroupTermination: `term:${term};kill:${kill}` });
      }, 750);
    });
  });
}

export async function runCommandCli(argumentsList = process.argv.slice(2)) {
  const [policyPath, commandKey, outputDirectory] = argumentsList;
  if (!policyPath || !commandKey || !outputDirectory) {
    console.error("Usage: run-project-command.mjs <policy.json> <install|verify> <output-dir>");
    return 2;
  }
  try {
    const result = await runProjectCommand({ policyPath, commandKey, outputDirectory });
    return result.exitCode;
  } catch (error) {
    console.error(error?.message || String(error));
    return 1;
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) process.exitCode = await runCommandCli();
