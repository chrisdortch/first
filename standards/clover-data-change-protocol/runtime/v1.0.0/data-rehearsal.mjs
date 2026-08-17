#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const [policyArg, outputDirArg] = process.argv.slice(2);
if (!policyArg || !outputDirArg) {
  console.error('Usage: data-rehearsal.mjs <policy.json> <output-dir>');
  process.exit(2);
}

const root = process.cwd();
const policyPath = path.resolve(root, policyArg);
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const outputDir = path.resolve(root, outputDirArg);
const logsDir = path.join(outputDir, 'logs');
const snapshotsDir = path.join(outputDir, 'schema');
const reconciliationDir = path.join(outputDir, 'reconciliation');
fs.mkdirSync(logsDir, { recursive: true });
fs.mkdirSync(snapshotsDir, { recursive: true });
fs.mkdirSync(reconciliationDir, { recursive: true });

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fileHash = (file) => hash(fs.readFileSync(file));
const databaseUrl = process.env.CLOVER_TEST_DATABASE_URL || '';
let currentStage = 'initialization';

function fail(message) {
  throw new Error(message);
}

function safePath(relativePath) {
  const absolute = path.resolve(root, relativePath);
  const rootPrefix = `${root}${path.sep}`;
  if (absolute !== root && !absolute.startsWith(rootPrefix)) fail(`SQL path escapes repository: ${relativePath}`);
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) fail(`SQL path is not a file: ${relativePath}`);
  return absolute;
}

function checkConnectionBoundary() {
  if (!databaseUrl) fail('CLOVER_TEST_DATABASE_URL is required.');
  const parsed = new URL(databaseUrl);
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') fail('Disposable URL must use PostgreSQL.');
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) fail('Disposable database host must be local to the CI runner.');
  if (parsed.pathname.replace(/^\//, '') !== policy.database.disposableDatabaseName) fail('Disposable database name mismatch.');
  if (policy.database.disposableDatabaseName !== 'clover_data') fail('Protocol v1 requires clover_data.');
  const active = policy.execution.forbiddenEnvironmentVariables.filter((name) => Boolean(process.env[name]));
  if (active.length) fail(`Production-style database environment variable(s) are active: ${active.join(', ')}`);
}

const sqlFiles = {
  baseline: safePath(policy.database.baselineSqlPath),
  seed: safePath(policy.database.seedSqlPath),
  forward: safePath(policy.database.forwardSqlPath),
  assertions: safePath(policy.database.assertionsSqlPath),
  reconciliation: safePath(policy.database.reconciliationSqlPath),
  rollback: safePath(policy.database.rollbackSqlPath),
  postRollbackAssertions: safePath(policy.database.postRollbackAssertionsSqlPath)
};

const universalForbidden = [
  /\bDROP\s+DATABASE\b/i,
  /\bCREATE\s+DATABASE\b/i,
  /\bDROP\s+SCHEMA\b/i,
  /\bALTER\s+SYSTEM\b/i,
  /\bCREATE\s+(?:USER|ROLE)\b/i,
  /\bALTER\s+(?:USER|ROLE)\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /\bCOPY\b[\s\S]*\bPROGRAM\b/i,
  /\bCREATE\s+EXTENSION\b/i,
  /\b(?:dblink|postgres_fdw|file_fdw)\b/i,
  /\bTRUNCATE\b/i
];

function screenSql(stage, file) {
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of universalForbidden) {
    if (pattern.test(content)) fail(`${stage} SQL contains prohibited operation: ${pattern}`);
  }
  if (stage === 'forward' && /\b(?:DROP\s+TABLE|DROP\s+COLUMN|DELETE\s+FROM)\b/i.test(content)) {
    fail('Forward SQL contains a destructive operation prohibited by the preserve-mode pilot.');
  }
  if (stage === 'rollback' && !policy.database.allowDropTableInRollback && /\bDROP\s+TABLE\b/i.test(content)) {
    fail('Rollback SQL may not drop tables under this policy.');
  }
}

function run(command, args, logName, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  });
  const combined = `${result.stdout || ''}${result.stderr || ''}`;
  fs.writeFileSync(path.join(logsDir, logName), combined);
  if (result.status !== 0) {
    fail(`${command} failed during ${currentStage}; see logs/${logName}`);
  }
  return capture ? (result.stdout || '').trim() : result.stdout || '';
}

function psqlFile(file, logName, tuplesOnly = false) {
  const args = ['--no-psqlrc', '-X', '--set', 'ON_ERROR_STOP=on', '--dbname', databaseUrl];
  if (tuplesOnly) args.push('-A', '-t', '-q');
  args.push('--file', file);
  return run('psql', args, logName, { capture: tuplesOnly });
}

function psqlQuery(query, logName) {
  return run('psql', ['--no-psqlrc', '-X', '-A', '-t', '-q', '--set', 'ON_ERROR_STOP=on', '--dbname', databaseUrl, '--command', query], logName, { capture: true });
}

function normalizeDump(raw) {
  return raw
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed &&
        !trimmed.startsWith('--') &&
        !trimmed.startsWith('SET ') &&
        !trimmed.startsWith('SELECT pg_catalog.set_config') &&
        !trimmed.startsWith('\\restrict') &&
        !trimmed.startsWith('\\unrestrict');
    })
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .concat('\n');
}

function schemaSnapshot(id) {
  const raw = run('pg_dump', ['--schema-only', '--no-owner', '--no-privileges', '--no-comments', '--dbname', databaseUrl], `pg-dump-${id}.log`, { capture: true });
  const normalized = normalizeDump(raw);
  const file = path.join(snapshotsDir, `${id}.sql`);
  fs.writeFileSync(file, normalized);
  return { id, path: path.relative(outputDir, file).split(path.sep).join('/'), sha256: hash(normalized), bytes: Buffer.byteLength(normalized) };
}

function reconciliation(id) {
  const output = psqlFile(sqlFiles.reconciliation, `reconciliation-${id}.log`, true);
  const normalized = `${output.trim()}\n`;
  const file = path.join(reconciliationDir, `${id}.txt`);
  fs.writeFileSync(file, normalized);
  return { id, path: path.relative(outputDir, file).split(path.sep).join('/'), sha256: hash(normalized), value: output.trim() };
}

function verifyNamespaces(id) {
  const tables = psqlQuery(
    "SELECT schemaname || '.' || tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1;",
    `tables-${id}.log`
  ).split('\n').map((value) => value.trim()).filter(Boolean);
  const bad = tables.filter((qualified) => {
    const table = qualified.split('.').pop();
    return !policy.database.allowedTablePrefixes.some((prefix) => table.startsWith(prefix));
  });
  if (bad.length) fail(`Unexpected table namespace after ${id}: ${bad.join(', ')}`);
  return tables;
}

const sqlArtifacts = Object.fromEntries(
  Object.entries(sqlFiles).map(([id, file]) => [id, { path: path.relative(root, file).split(path.sep).join('/'), sha256: fileHash(file), bytes: fs.statSync(file).size }])
);

const receipt = {
  schemaVersion: '1.0',
  protocolVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  status: 'failed',
  database: {
    mode: 'disposable-database-only',
    engine: 'postgresql',
    majorVersion: 16,
    hostClass: 'local-ci-service',
    databaseName: policy.database.disposableDatabaseName
  },
  sqlArtifacts,
  stages: {},
  checks: {
    sqlScreening: 'failed',
    baseline: 'failed',
    forward: 'failed',
    forwardIdempotency: 'failed',
    rollback: 'failed',
    schemaRestored: 'failed',
    reconciliationPreserved: 'failed',
    namespace: 'failed'
  },
  safety: {
    productionDatabaseConnected: false,
    productionDataRead: false,
    productionDataWritten: false,
    productionCredentialsAccepted: false,
    syntheticDataOnly: true
  },
  error: null
};

try {
  checkConnectionBoundary();
  for (const [stage, file] of Object.entries(sqlFiles)) screenSql(stage, file);
  receipt.checks.sqlScreening = 'passed';

  currentStage = 'baseline';
  psqlFile(sqlFiles.baseline, 'baseline.log');
  psqlFile(sqlFiles.seed, 'seed.log');
  const baselineSchema = schemaSnapshot('baseline');
  const baselineReconciliation = reconciliation('baseline');
  const baselineTables = verifyNamespaces('baseline');
  receipt.stages.baseline = { schema: baselineSchema, reconciliation: baselineReconciliation, tables: baselineTables };
  receipt.checks.baseline = 'passed';

  currentStage = 'forward-first';
  psqlFile(sqlFiles.forward, 'forward-first.log');
  psqlFile(sqlFiles.assertions, 'assertions-first.log');
  const forwardSchema = schemaSnapshot('forward-first');
  const forwardReconciliation = reconciliation('forward-first');
  const forwardTables = verifyNamespaces('forward-first');
  receipt.stages.forwardFirst = { schema: forwardSchema, reconciliation: forwardReconciliation, tables: forwardTables };
  receipt.checks.forward = 'passed';

  currentStage = 'forward-second';
  psqlFile(sqlFiles.forward, 'forward-second.log');
  psqlFile(sqlFiles.assertions, 'assertions-second.log');
  const forwardSecondSchema = schemaSnapshot('forward-second');
  const forwardSecondReconciliation = reconciliation('forward-second');
  receipt.stages.forwardSecond = { schema: forwardSecondSchema, reconciliation: forwardSecondReconciliation };
  if (forwardSchema.sha256 !== forwardSecondSchema.sha256) fail('Forward migration is not schema-idempotent.');
  if (forwardReconciliation.sha256 !== forwardSecondReconciliation.sha256) fail('Forward migration is not data-idempotent.');
  receipt.checks.forwardIdempotency = 'passed';

  currentStage = 'rollback';
  psqlFile(sqlFiles.rollback, 'rollback.log');
  psqlFile(sqlFiles.postRollbackAssertions, 'post-rollback-assertions.log');
  const rollbackSchema = schemaSnapshot('rollback');
  const rollbackReconciliation = reconciliation('rollback');
  const rollbackTables = verifyNamespaces('rollback');
  receipt.stages.rollback = { schema: rollbackSchema, reconciliation: rollbackReconciliation, tables: rollbackTables };
  receipt.checks.rollback = 'passed';

  if (baselineSchema.sha256 !== rollbackSchema.sha256) fail('Rollback did not restore the baseline schema.');
  receipt.checks.schemaRestored = 'passed';

  const reconciliationHashes = [
    baselineReconciliation.sha256,
    forwardReconciliation.sha256,
    forwardSecondReconciliation.sha256,
    rollbackReconciliation.sha256
  ];
  if (new Set(reconciliationHashes).size !== 1) fail('Reconciliation output changed during a preserve-mode rehearsal.');
  receipt.checks.reconciliationPreserved = 'passed';
  receipt.checks.namespace = 'passed';
  receipt.status = 'passed';
} catch (error) {
  receipt.error = { stage: currentStage, message: error?.message || String(error) };
  console.error(receipt.error.message);
  process.exitCode = 1;
} finally {
  receipt.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outputDir, 'database-rehearsal.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`Clover disposable data rehearsal: ${receipt.status}`);
}
