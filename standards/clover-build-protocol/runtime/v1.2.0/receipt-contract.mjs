import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const CORE_ARTIFACT_SPECS = Object.freeze([
  { path: 'enrollment-schema.json', environment: 'CLOVER_EXPECTED_ENROLLMENT_SCHEMA_SHA' },
  { path: 'policy-schema.json', environment: 'CLOVER_EXPECTED_POLICY_SCHEMA_SHA' },
  { path: 'boundary.json', environment: 'CLOVER_EXPECTED_BOUNDARY_SHA' },
  { path: 'pre-state.json', environment: 'CLOVER_EXPECTED_PRE_STATE_SHA' },
  { path: 'commands/install.json', environment: 'CLOVER_EXPECTED_INSTALL_SHA' },
  { path: 'commands/install.log', environment: 'CLOVER_EXPECTED_INSTALL_LOG_SHA' },
  { path: 'commands/verify.json', environment: 'CLOVER_EXPECTED_VERIFY_SHA' },
  { path: 'commands/verify.log', environment: 'CLOVER_EXPECTED_VERIFY_LOG_SHA' },
  { path: 'browser/browser-receipt.json', environment: 'CLOVER_EXPECTED_BROWSER_RECEIPT_SHA' },
  { path: 'browser/preview-server.log', environment: 'CLOVER_EXPECTED_PREVIEW_LOG_SHA' },
  { path: 'browser/contact-sheet.html', environment: 'CLOVER_EXPECTED_CONTACT_SHEET_HTML_SHA' },
  { path: 'browser/contact-sheet.png', environment: 'CLOVER_EXPECTED_CONTACT_SHEET_PNG_SHA' },
  { path: 'final-state.json', environment: 'CLOVER_EXPECTED_FINAL_STATE_SHA' }
]);

export const BASE_CHECK_IDS = Object.freeze([
  'enrollment-schema',
  'policy-schema',
  'enrolled-boundary',
  'install',
  'verify',
  'browser',
  'final-state'
]);

export const RUNNER_OUTCOME_SPECS = Object.freeze([
  { id: 'identity', environment: 'CLOVER_OUTCOME_IDENTITY' },
  { id: 'tooling', environment: 'CLOVER_OUTCOME_TOOLING' },
  { id: 'schemas', environment: 'CLOVER_OUTCOME_SCHEMAS' },
  { id: 'boundary', environment: 'CLOVER_OUTCOME_BOUNDARY' },
  { id: 'pre-state', environment: 'CLOVER_OUTCOME_PRE_STATE' },
  { id: 'install', environment: 'CLOVER_OUTCOME_INSTALL' },
  { id: 'protocol-after-install', environment: 'CLOVER_OUTCOME_PROTOCOL_AFTER_INSTALL' },
  { id: 'tooling-after-install', environment: 'CLOVER_OUTCOME_TOOLING_AFTER_INSTALL' },
  { id: 'verify', environment: 'CLOVER_OUTCOME_VERIFY' },
  { id: 'protocol-after-verify', environment: 'CLOVER_OUTCOME_PROTOCOL_AFTER_VERIFY' },
  { id: 'tooling-after-verify', environment: 'CLOVER_OUTCOME_TOOLING_AFTER_VERIFY' },
  { id: 'browsers', environment: 'CLOVER_OUTCOME_BROWSERS' },
  { id: 'browser', environment: 'CLOVER_OUTCOME_BROWSER' },
  { id: 'protocol-after-browser', environment: 'CLOVER_OUTCOME_PROTOCOL_AFTER_BROWSER' },
  { id: 'tooling-after-browser', environment: 'CLOVER_OUTCOME_TOOLING_AFTER_BROWSER' },
  { id: 'final-state', environment: 'CLOVER_OUTCOME_FINAL_STATE' },
  { id: 'receipt-control', environment: 'CLOVER_OUTCOME_RECEIPT_CONTROL' }
]);

export const REQUIRED_CHECK_IDS = Object.freeze([
  ...BASE_CHECK_IDS,
  ...RUNNER_OUTCOME_SPECS.map(({ id }) => `runner-${id}`),
  ...CORE_ARTIFACT_SPECS.map(({ path: artifactPath }) => `artifact-integrity:${artifactPath}`)
]);

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function resolveEvidenceFile(rootArgument, relativeArgument) {
  if (typeof relativeArgument !== 'string' || !relativeArgument || path.isAbsolute(relativeArgument) || relativeArgument.includes('\\')) throw new Error(`Invalid evidence path: ${relativeArgument}`);
  const segments = relativeArgument.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) throw new Error(`Invalid evidence path segment: ${relativeArgument}`);
  const root = fs.realpathSync(rootArgument);
  let cursor = root;
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) throw new Error(`Evidence path traverses a symbolic link: ${relativeArgument}`);
  }
  const resolved = fs.realpathSync(cursor);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Evidence path escapes its root: ${relativeArgument}`);
  if (!fs.statSync(resolved).isFile()) throw new Error(`Evidence path is not a regular file: ${relativeArgument}`);
  return resolved;
}

export function artifactRecord(artifactDirectory, relativePath, expectedSha256, bindingSource = 'step-output') {
  try {
    const absolute = resolveEvidenceFile(artifactDirectory, relativePath);
    const observed = sha256(fs.readFileSync(absolute));
    return {
      path: relativePath,
      sha256: observed,
      bytes: fs.statSync(absolute).size,
      expectedSha256: /^[0-9a-f]{64}$/.test(expectedSha256 || '') ? expectedSha256 : null,
      matched: /^[0-9a-f]{64}$/.test(expectedSha256 || '') && observed === expectedSha256,
      bindingSource
    };
  } catch (error) {
    return {
      path: relativePath,
      sha256: null,
      bytes: null,
      expectedSha256: /^[0-9a-f]{64}$/.test(expectedSha256 || '') ? expectedSha256 : null,
      matched: false,
      bindingSource,
      error: error?.message || String(error)
    };
  }
}

export function screenshotArtifactSpecs(browserReceipt) {
  const specs = [];
  for (const result of browserReceipt?.results || []) {
    const relative = result?.screenshot;
    const expected = result?.screenshotSha256;
    if (typeof relative !== 'string' || !relative.startsWith('screenshots/') || !/^[0-9a-f]{64}$/.test(expected || '')) continue;
    specs.push({ path: `browser/${relative}`, expectedSha256: expected, bindingSource: 'sealed-browser-receipt' });
  }
  return specs;
}

export function exactRequiredCheckSet(checks) {
  const ids = (checks || []).map((check) => check?.id);
  return ids.length === REQUIRED_CHECK_IDS.length && new Set(ids).size === ids.length && [...ids].sort().join('\n') === [...REQUIRED_CHECK_IDS].sort().join('\n');
}

export function validatePassedReceipt(receipt, artifactDirectory, environment = process.env) {
  const failures = [];
  if (receipt?.status !== 'passed') failures.push('Build receipt status is not passed');
  if (!exactRequiredCheckSet(receipt?.checks)) failures.push('Build receipt does not contain the exact required check set');
  if (!(receipt?.checks || []).every((check) => check.status === 'passed')) failures.push('A required build receipt check is not passed');
  if (receipt?.protocol?.commit !== environment.CLOVER_PROTOCOL_REF) failures.push('Build receipt protocol commit does not match the exact workflow commit');
  if (receipt?.source?.commit !== environment.CLOVER_CANDIDATE_SHA) failures.push('Build receipt source commit does not match the exact candidate commit');

  const records = receipt?.artifacts || [];
  const paths = records.map((record) => record?.path);
  if (new Set(paths).size !== paths.length) failures.push('Build receipt artifact paths are not unique');
  for (const { path: requiredPath } of CORE_ARTIFACT_SPECS) if (paths.filter((value) => value === requiredPath).length !== 1) failures.push(`Required artifact is not present exactly once: ${requiredPath}`);
  if (!paths.some((value) => /^browser\/screenshots\/[^/]+\.png$/.test(value || ''))) failures.push('Build receipt contains no browser screenshot evidence');
  for (const record of records) {
    if (record?.matched !== true || !/^[0-9a-f]{64}$/.test(record?.sha256 || '') || !/^[0-9a-f]{64}$/.test(record?.expectedSha256 || '')) {
      failures.push(`Artifact record is not sealed and matched: ${record?.path || '(missing)'}`);
      continue;
    }
    const observed = artifactRecord(artifactDirectory, record.path, record.expectedSha256, record.bindingSource);
    if (!observed.matched || observed.sha256 !== record.sha256 || observed.bytes !== record.bytes || observed.bindingSource !== record.bindingSource) failures.push(`Artifact changed after receipt assembly: ${record.path}`);
  }
  return failures;
}
