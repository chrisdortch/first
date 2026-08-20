#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { resolveSqlFile, screenSqlFile } from "./sql-safety.mjs";
import { seedDataProvenanceObservation, writeJson } from "./integrity.mjs";
import { REHEARSAL_ROLE_NAME, validateRestrictedRoleObservation } from "./role-safety.mjs";

const [policyArgument, outputDirectoryArgument] = process.argv.slice(2);
if (!policyArgument || !outputDirectoryArgument) {
  console.error("Usage: data-rehearsal.mjs <policy.json> <output-dir>");
  process.exit(2);
}

const root = process.cwd();
const policyPath = path.resolve(root, policyArgument);
const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
const outputDirectory = path.resolve(root, outputDirectoryArgument);
const logsDirectory = path.join(outputDirectory, "logs");
const snapshotsDirectory = path.join(outputDirectory, "schema");
const reconciliationDirectory = path.join(outputDirectory, "reconciliation");
fs.mkdirSync(logsDirectory, { recursive: true });
fs.mkdirSync(snapshotsDirectory, { recursive: true });
fs.mkdirSync(reconciliationDirectory, { recursive: true });

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileHash = (file) => hash(fs.readFileSync(file));
const databaseUrl = process.env.CLOVER_TEST_DATABASE_URL || "";
let currentStage = "initialization";
let sqlFiles = {};
let roleObservation = null;

function fail(message) {
  throw new Error(message);
}

function checkConnectionBoundary() {
  if (!databaseUrl) fail("CLOVER_TEST_DATABASE_URL is required");
  const parsed = new URL(databaseUrl);
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") fail("Disposable URL must use PostgreSQL");
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) fail("Disposable database host must be local to the CI runner");
  if (parsed.pathname.replace(/^\//, "") !== policy.database.disposableDatabaseName) fail("Disposable database name mismatch");
  if (policy.database.disposableDatabaseName !== "clover_data") fail("Protocol v1.0.1 requires clover_data");
  const active = policy.execution.forbiddenEnvironmentVariables.filter((name) => Boolean(process.env[name]));
  if (active.length) fail(`Production-style database environment variable(s) are active: ${active.join(", ")}`);
}

function resolveSqlFiles() {
  if (policy.database.rejectSymbolicLinkSqlPaths !== true) fail("Symbolic-link SQL path rejection must remain enabled");
  return {
    baseline: resolveSqlFile(root, policy.database.baselineSqlPath),
    seed: resolveSqlFile(root, policy.database.seedSqlPath),
    forward: resolveSqlFile(root, policy.database.forwardSqlPath),
    assertions: resolveSqlFile(root, policy.database.assertionsSqlPath),
    reconciliation: resolveSqlFile(root, policy.database.reconciliationSqlPath),
    rollback: resolveSqlFile(root, policy.database.rollbackSqlPath),
    postRollbackAssertions: resolveSqlFile(root, policy.database.postRollbackAssertionsSqlPath)
  };
}

function screenSqlFiles() {
  if (policy.database.rejectPsqlMetaCommands !== true) fail("psql meta-command rejection must remain enabled");
  for (const [stage, file] of Object.entries(sqlFiles)) {
    screenSqlFile(stage, file, { allowDropTableInRollback: policy.database.allowDropTableInRollback });
  }
}

function run(command, argumentsList, logName, { capture = false } = {}) {
  const result = spawnSync(command, argumentsList, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  });
  const combined = `${result.stdout || ""}${result.stderr || ""}`;
  fs.writeFileSync(path.join(logsDirectory, logName), combined);
  if (result.status !== 0) fail(`${command} failed during ${currentStage}; see logs/${logName}`);
  return capture ? (result.stdout || "").trim() : result.stdout || "";
}

function psqlFile(file, logName, tuplesOnly = false) {
  const argumentsList = ["--no-psqlrc", "-X", "--set", "ON_ERROR_STOP=on", "--dbname", databaseUrl];
  if (tuplesOnly) argumentsList.push("-A", "-t", "-q");
  argumentsList.push("--file", file);
  return run("psql", argumentsList, logName, { capture: tuplesOnly });
}

function psqlQuery(query, logName) {
  return run("psql", ["--no-psqlrc", "-X", "-A", "-t", "-q", "--set", "ON_ERROR_STOP=on", "--dbname", databaseUrl, "--command", query], logName, { capture: true });
}

function observeRestrictedRole() {
  const raw = psqlQuery(`
    SELECT json_build_object(
      'roleName', current_user,
      'superuser', role.rolsuper,
      'createDatabase', role.rolcreatedb,
      'createRole', role.rolcreaterole,
      'replication', role.rolreplication,
      'bypassRowLevelSecurity', role.rolbypassrls,
      'inherit', role.rolinherit,
      'canLogin', role.rolcanlogin,
      'memberships', COALESCE((
        SELECT json_agg(parent.rolname ORDER BY parent.rolname)
        FROM pg_auth_members membership
        JOIN pg_roles parent ON parent.oid = membership.roleid
        WHERE membership.member = role.oid
      ), '[]'::json)
    )::text
    FROM pg_roles role
    WHERE role.rolname = current_user;
  `, "restricted-role.json.log");
  let observation;
  try { observation = JSON.parse(raw); }
  catch { fail("Could not parse restricted rehearsal role observation"); }
  const failures = validateRestrictedRoleObservation(observation);
  if (failures.length) fail(failures.join("; "));
  return observation;
}

function normalizeDump(raw) {
  return raw
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed &&
        !trimmed.startsWith("--") &&
        !trimmed.startsWith("SET ") &&
        !trimmed.startsWith("SELECT pg_catalog.set_config") &&
        !trimmed.startsWith("\\restrict") &&
        !trimmed.startsWith("\\unrestrict");
    })
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .concat("\n");
}

function schemaSnapshot(id) {
  const raw = run("pg_dump", ["--schema-only", "--no-owner", "--no-privileges", "--no-comments", "--dbname", databaseUrl], `pg-dump-${id}.log`, { capture: true });
  const normalized = normalizeDump(raw);
  const file = path.join(snapshotsDirectory, `${id}.sql`);
  fs.writeFileSync(file, normalized);
  return { id, path: path.relative(outputDirectory, file).split(path.sep).join("/"), sha256: hash(normalized), bytes: Buffer.byteLength(normalized) };
}

function reconciliation(id) {
  const output = psqlFile(sqlFiles.reconciliation, `reconciliation-${id}.log`, true);
  const normalized = `${output.trim()}\n`;
  const file = path.join(reconciliationDirectory, `${id}.txt`);
  fs.writeFileSync(file, normalized);
  return { id, path: path.relative(outputDirectory, file).split(path.sep).join("/"), sha256: hash(normalized), value: output.trim() };
}

function verifyNamespaces(id) {
  const tables = psqlQuery(
    "SELECT schemaname || '.' || tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1;",
    `tables-${id}.log`
  ).split("\n").map((value) => value.trim()).filter(Boolean);
  const bad = tables.filter((qualified) => {
    const table = qualified.split(".").pop();
    return !policy.database.allowedTablePrefixes.some((prefix) => table.startsWith(prefix));
  });
  if (bad.length) fail(`Unexpected table namespace after ${id}: ${bad.join(", ")}`);
  return tables;
}

const receipt = {
  schemaVersion: "1.1",
  protocolVersion: "1.0.1",
  generatedAt: new Date().toISOString(),
  status: "failed",
  database: {
    mode: "disposable-database-only",
    engine: "postgresql",
    majorVersion: 16,
    hostClass: "local-ci-service",
    databaseName: policy.database.disposableDatabaseName,
    roleName: REHEARSAL_ROLE_NAME,
    roleSecurity: null
  },
  sqlArtifacts: {},
  stages: {},
  checks: {
    connectionBoundary: "failed",
    restrictedRehearsalRole: "failed",
    sqlPathIntegrity: "failed",
    psqlMetaCommandsRejected: "failed",
    sqlScreening: "failed",
    baseline: "failed",
    forward: "failed",
    forwardIdempotency: "failed",
    rollback: "failed",
    schemaRestored: "failed",
    reconciliationPreserved: "failed",
    namespace: "failed"
  },
  observations: {
    seedDataProvenance: seedDataProvenanceObservation(),
    projectCommandExternalEffects: {
      state: "unknown",
      basis: "Project-controlled package lifecycle and verification code ran on a same-user hosted runner without a hostile-code network sandbox."
    }
  },
  safety: {
    productionCredentialsSuppliedByWorkflow: false,
    trustedRehearsalProductionConnectionAccepted: false,
    psqlMetaCommandsAccepted: false,
    symbolicLinkSqlPathsAccepted: false
  },
  error: null
};

try {
  currentStage = "connection-boundary";
  checkConnectionBoundary();
  receipt.checks.connectionBoundary = "passed";

  currentStage = "restricted-rehearsal-role";
  roleObservation = observeRestrictedRole();
  receipt.database.roleSecurity = roleObservation;
  receipt.checks.restrictedRehearsalRole = "passed";

  currentStage = "sql-path-integrity";
  sqlFiles = resolveSqlFiles();
  receipt.checks.sqlPathIntegrity = "passed";

  currentStage = "sql-screening";
  screenSqlFiles();
  receipt.checks.psqlMetaCommandsRejected = "passed";
  receipt.checks.sqlScreening = "passed";
  receipt.sqlArtifacts = Object.fromEntries(
    Object.entries(sqlFiles).map(([id, file]) => [id, {
      path: path.relative(root, file).split(path.sep).join("/"),
      sha256: fileHash(file),
      bytes: fs.statSync(file).size
    }])
  );

  currentStage = "baseline";
  psqlFile(sqlFiles.baseline, "baseline.log");
  psqlFile(sqlFiles.seed, "seed.log");
  const baselineSchema = schemaSnapshot("baseline");
  const baselineReconciliation = reconciliation("baseline");
  const baselineTables = verifyNamespaces("baseline");
  receipt.stages.baseline = { schema: baselineSchema, reconciliation: baselineReconciliation, tables: baselineTables };
  receipt.checks.baseline = "passed";

  currentStage = "forward-first";
  psqlFile(sqlFiles.forward, "forward-first.log");
  psqlFile(sqlFiles.assertions, "assertions-first.log");
  const forwardSchema = schemaSnapshot("forward-first");
  const forwardReconciliation = reconciliation("forward-first");
  const forwardTables = verifyNamespaces("forward-first");
  receipt.stages.forwardFirst = { schema: forwardSchema, reconciliation: forwardReconciliation, tables: forwardTables };
  receipt.checks.forward = "passed";

  currentStage = "forward-second";
  psqlFile(sqlFiles.forward, "forward-second.log");
  psqlFile(sqlFiles.assertions, "assertions-second.log");
  const forwardSecondSchema = schemaSnapshot("forward-second");
  const forwardSecondReconciliation = reconciliation("forward-second");
  receipt.stages.forwardSecond = { schema: forwardSecondSchema, reconciliation: forwardSecondReconciliation };
  if (forwardSchema.sha256 !== forwardSecondSchema.sha256) fail("Forward migration is not schema-idempotent");
  if (forwardReconciliation.sha256 !== forwardSecondReconciliation.sha256) fail("Forward migration is not data-idempotent");
  receipt.checks.forwardIdempotency = "passed";

  currentStage = "rollback";
  psqlFile(sqlFiles.rollback, "rollback.log");
  psqlFile(sqlFiles.postRollbackAssertions, "post-rollback-assertions.log");
  const rollbackSchema = schemaSnapshot("rollback");
  const rollbackReconciliation = reconciliation("rollback");
  const rollbackTables = verifyNamespaces("rollback");
  receipt.stages.rollback = { schema: rollbackSchema, reconciliation: rollbackReconciliation, tables: rollbackTables };
  receipt.checks.rollback = "passed";

  if (baselineSchema.sha256 !== rollbackSchema.sha256) fail("Rollback did not restore the baseline schema");
  receipt.checks.schemaRestored = "passed";

  const reconciliationHashes = [
    baselineReconciliation.sha256,
    forwardReconciliation.sha256,
    forwardSecondReconciliation.sha256,
    rollbackReconciliation.sha256
  ];
  if (new Set(reconciliationHashes).size !== 1) fail("Reconciliation output changed during a preserve-mode rehearsal");
  receipt.checks.reconciliationPreserved = "passed";
  receipt.checks.namespace = "passed";
  receipt.status = "passed";
} catch (error) {
  receipt.error = { stage: currentStage, message: error?.message || String(error) };
  console.error(receipt.error.message);
  process.exitCode = 1;
} finally {
  receipt.finishedAt = new Date().toISOString();
  writeJson(path.join(outputDirectory, "database-rehearsal.json"), receipt);
  console.log(`Clover disposable data rehearsal 1.0.1: ${receipt.status}`);
}
