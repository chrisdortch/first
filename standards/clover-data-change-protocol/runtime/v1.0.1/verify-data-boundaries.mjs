#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { writeJson } from "./integrity.mjs";

function globToRegExp(glob) {
  let source = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    const next = glob[index + 1];
    if (character === "*" && next === "*") {
      if (glob[index + 2] === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
    } else if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`);
}

function matches(file, patterns = []) {
  return patterns.some((pattern) => globToRegExp(pattern).test(file));
}

function git(root, argumentsList, allowFailure = false) {
  const result = spawnSync("git", argumentsList, { cwd: root, encoding: "utf8" });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${argumentsList.join(" ")} failed: ${(result.stderr || "").trim()}`);
  }
  return result.status === 0 ? result.stdout.trim() : "";
}

export function verifyDataBoundaries({ root = process.cwd(), policy, environment = process.env } = {}) {
  if (!policy || typeof policy !== "object") throw new TypeError("A parsed data-change policy is required");

  const failures = [];
  const head = git(root, ["rev-parse", "HEAD"]);
  const branch = environment.GITHUB_HEAD_REF || environment.GITHUB_REF_NAME || git(root, ["branch", "--show-current"], true);
  const repository = environment.GITHUB_REPOSITORY || policy.project.repository;
  const baseline = policy.source.baselineCommit;
  const productionCommit = policy.source.productionCommitAtEnrollment;
  const productionRef = `origin/${policy.project.productionBranch}`;
  const protocolCommitObserved = environment.CLOVER_PROTOCOL_REF || "";
  const candidateCommitExpected = environment.CLOVER_CANDIDATE_REF || "";

  if (repository !== policy.project.repository) failures.push(`Repository mismatch: ${repository}`);
  if (!/^[0-9a-f]{40}$/.test(baseline)) failures.push("Baseline commit is not an exact SHA");
  if (!/^[0-9a-f]{40}$/.test(productionCommit)) failures.push("Production enrollment commit is not an exact SHA");
  if (baseline !== productionCommit) failures.push("Baseline commit must equal the production commit at enrollment");
  if (!/^[0-9a-f]{40}$/.test(protocolCommitObserved)) failures.push("Observed protocol checkout is not an exact SHA");
  if (protocolCommitObserved !== policy.protocol.commit) {
    failures.push(`Protocol commit mismatch: ${protocolCommitObserved || "(missing)"} expected ${policy.protocol.commit}`);
  }
  if (!/^[0-9a-f]{40}$/.test(candidateCommitExpected)) failures.push("Expected candidate commit is not an exact SHA");
  if (candidateCommitExpected !== head) failures.push(`Candidate commit mismatch: ${head} expected ${candidateCommitExpected || "(missing)"}`);
  if (policy.execution.mode !== "disposable-database-only") failures.push("Execution mode must be disposable-database-only");
  if (policy.execution.requireProductionAnchorUnchanged !== true) failures.push("Production-anchor enforcement must remain enabled");
  if (branch === policy.project.productionBranch) failures.push("Data rehearsal cannot run from the production branch");
  if (!policy.execution.allowedBranchPrefixes.some((prefix) => branch.startsWith(prefix))) {
    failures.push(`Branch ${branch || "(detached)"} is outside allowed prefixes`);
  }

  if (/^[0-9a-f]{40}$/.test(baseline)) git(root, ["cat-file", "-e", `${baseline}^{commit}`]);
  if (/^[0-9a-f]{40}$/.test(productionCommit)) git(root, ["cat-file", "-e", `${productionCommit}^{commit}`]);
  const productionCommitObserved = git(root, ["rev-parse", `${productionRef}^{commit}`]);
  if (productionCommitObserved !== productionCommit) {
    failures.push(`Production anchor changed: ${productionCommitObserved} expected ${productionCommit}`);
  }

  if (/^[0-9a-f]{40}$/.test(baseline)) {
    const probe = spawnSync("git", ["merge-base", "--is-ancestor", baseline, head], { cwd: root });
    if (probe.status !== 0) failures.push("Baseline commit is not an ancestor of the candidate");
  }

  const changedOutput = /^[0-9a-f]{40}$/.test(baseline)
    ? git(root, ["diff", "--name-only", `${baseline}...${head}`], true)
    : "";
  const changedFiles = changedOutput ? changedOutput.split("\n").filter(Boolean).sort() : [];
  for (const file of changedFiles) {
    if (!matches(file, policy.execution.allowedChangePaths)) failures.push(`Changed path is not allowed: ${file}`);
    if (matches(file, policy.execution.sensitivePaths)) failures.push(`Sensitive path changed: ${file}`);
  }
  if (!changedFiles.length) failures.push("Candidate contains no changed files");

  const activeForbiddenEnvironmentVariables = policy.execution.forbiddenEnvironmentVariables.filter(
    (name) => Boolean(environment[name])
  );
  if (activeForbiddenEnvironmentVariables.length) {
    failures.push(`Production-style database environment variable(s) are active: ${activeForbiddenEnvironmentVariables.join(", ")}`);
  }

  for (const [key, value] of Object.entries(policy.authority || {})) {
    if (value !== false) failures.push(`Authority flag must remain false: ${key}`);
  }

  return {
    schemaVersion: "1.1",
    protocolVersion: "1.0.1",
    generatedAt: new Date().toISOString(),
    status: failures.length ? "failed" : "passed",
    repository,
    branch,
    baselineCommit: baseline,
    productionCommitAtEnrollment: productionCommit,
    productionCommitObserved,
    candidateCommit: head,
    candidateCommitExpected,
    protocolCommitObserved,
    changedFiles,
    activeForbiddenEnvironmentVariables,
    checks: {
      productionAnchorUnchanged: productionCommitObserved === productionCommit,
      candidateBasedOnProduction: baseline === productionCommit,
      protocolCommitBound: protocolCommitObserved === policy.protocol.commit
    },
    failures,
    safety: {
      productionDatabaseConnectionAccepted: false,
      productionDataReadAuthorized: false,
      productionDataWriteAuthorized: false
    }
  };
}

export function runBoundaryCli(argumentsList = process.argv.slice(2), environment = process.env) {
  const [policyArgument, outputArgument] = argumentsList;
  if (!policyArgument || !outputArgument) {
    console.error("Usage: verify-data-boundaries.mjs <policy.json> <output.json>");
    return 2;
  }
  const root = process.cwd();
  const policy = JSON.parse(fs.readFileSync(path.resolve(root, policyArgument), "utf8"));
  const outputPath = path.resolve(root, outputArgument);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  let receipt;
  try {
    receipt = verifyDataBoundaries({ root, policy, environment });
  } catch (error) {
    receipt = {
      schemaVersion: "1.1",
      protocolVersion: "1.0.1",
      generatedAt: new Date().toISOString(),
      status: "failed",
      failures: [error?.message || String(error)],
      safety: {
        productionDatabaseConnectionAccepted: false,
        productionDataReadAuthorized: false,
        productionDataWriteAuthorized: false
      }
    };
  }
  writeJson(outputPath, receipt);
  console.log(`Clover data boundary 1.0.1: ${receipt.status}`);
  if (receipt.status !== "passed") {
    for (const failure of receipt.failures || []) console.error(failure);
    return 1;
  }
  return 0;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) process.exitCode = runBoundaryCli();
