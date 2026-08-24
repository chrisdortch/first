import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";

import { canonicalize, sha256Bytes, sha256Canonical } from "../../../../lib/canonical-json.mjs";
import { assertSafeRelativePath } from "../../../../lib/artifact-store.mjs";

const PHASE_A_SYNTHETIC_PATHS = Object.freeze([
  "session/SYNTHETIC_SESSION_REPORT.md",
  "session/events.jsonl",
  "session/final.json",
  "session/fixture.json",
  "session/material-progress-timeline.jsonl"
]);

// Phase A is deliberately a single, frozen synthetic export.  These byte
// digests are an allowlist, not a generic privacy classifier: a future real or
// private exporter must use a separately authorized storage/classification
// gate and cannot inherit this clean-synthetic attestation.
const PHASE_A_SYNTHETIC_HASHES = Object.freeze({
  "session/SYNTHETIC_SESSION_REPORT.md": "d3497646c69ea24fe95dba4a5a4566c0f16ec837d1b254e0dfa51d275c773edd",
  "session/events.jsonl": "4f6bdc17a46ababb808142811a3df46b620d1836402fc4c65ef7fad7e4d0db6b",
  "session/final.json": "4dc50620bc7de31b2e51014ef94d7679e62ed61cf8a3c7d08c34b64b95bb8b15",
  "session/fixture.json": "34784e540036b842ee06daad4525f356eef87b416915210a2ac72163e86933b1",
  "session/material-progress-timeline.jsonl": "e38092d1e36e40503b214e72d99068afe8bd261a647b7f5ed812d5efbfd02426"
});

const PHASE_A_EVENT_TYPES = Object.freeze([
  "session_created",
  "owner_event_captured",
  "understanding_confirmed",
  "context_loaded",
  "impact_scan_completed",
  "charter_proposed",
  "decision_required",
  "authority_proposed",
  "decision_required",
  "session_held"
]);

const PHASE_A_STATES = Object.freeze([
  "captured",
  "understanding_pending",
  "understanding_confirmed",
  "context_grounded",
  "impact_scanned",
  "charter_pending",
  "charter_approved",
  "execution_proposed",
  "execution_authority_pending",
  "held"
]);

const EXPORT_METADATA_KEYS = Object.freeze(["createdAt", "exportId", "projectId", "sessionId", "workspaceId"]);
const MANIFEST_KEYS = Object.freeze([
  "consequentialAuthorityGranted", "containsPrivateData", "createdAt", "documentType", "exportId", "externalEffects",
  "files", "manifestHash", "personalChatGptMemoryIncluded", "projectId", "schemaVersion", "sessionId", "synthetic", "workspaceId"
]);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

const HIGH_RISK_PATTERNS = Object.freeze([
  ["private-key material", /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/i],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ["OpenAI token", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["bearer token", /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}/i],
  ["US Social Security number", /(?:^|[^0-9])(?!000|666|9[0-9]{2})[0-9]{3}-(?!00)[0-9]{2}-(?!0000)[0-9]{4}(?![0-9])/],
  ["local user filesystem path", /(?:^|[\s"'(=])(?:\/(?:Users|home)\/[A-Za-z0-9._-]+(?:\/|$)|[A-Za-z]:\\+(?:Users|Documents and Settings)\\+[A-Za-z0-9._-]+(?:\\+|$))/m]
]);
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SAFE_GITHUB_SSH_REMOTE = /^git@github\.com:[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*\.git(?=$|[\s"')\]},])/;
const SAFE_GITHUB_SSH_IDENTITY = ["git", "github.com"].join("@");

function assertExactOwnKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalize(actual) !== canonicalize(wanted)) throw new Error(`${label} contains missing or unknown fields`);
}

function assertCanonicalTimestamp(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${label} must be a canonical UTC timestamp`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new Error(`${label} is not a real canonical UTC timestamp`);
}

function assertId(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new Error(`${label} is not a valid opaque identifier`);
}

function assertSyntheticId(value, label) {
  assertId(value, label);
  if (!value.toLowerCase().includes("synthetic")) throw new Error(`${label} is not an explicitly synthetic identifier`);
}

function lstatIfPresent(entryPath) {
  try {
    return fs.lstatSync(entryPath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function assertTrustedDirectory(directory, label) {
  if (typeof directory !== "string" || directory.length === 0 || directory.includes("\0")) throw new Error(`${label} must be a filesystem path`);
  const resolved = path.resolve(directory);
  const stat = lstatIfPresent(resolved);
  if (!stat) throw new Error(`${label} must exist`);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a non-symbolic directory`);
  return resolved;
}

function requireTrustedBaseOption(options, key, label) {
  if (!options || !Object.prototype.hasOwnProperty.call(options, key)) {
    throw new Error(`${label} requires an explicit trusted existing base`);
  }
  return options[key];
}

function resolveBelowTrustedBase(target, trustedBaseInput, label) {
  if (typeof target !== "string" || target.length === 0 || target.includes("\0")) throw new Error(`${label} must be a filesystem path`);
  const resolvedTarget = path.resolve(target);
  const trustedBase = assertTrustedDirectory(trustedBaseInput ?? path.dirname(resolvedTarget), `${label} trusted base`);
  const platformRelative = path.relative(trustedBase, resolvedTarget);
  if (platformRelative === "" || path.isAbsolute(platformRelative)) throw new Error(`${label} must be a strict descendant of its trusted base`);
  const relative = platformRelative.split(path.sep).join("/");
  assertSafeRelativePath(relative, `${label} relative path`);
  let current = trustedBase;
  const segments = relative.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    const stat = lstatIfPresent(current);
    if (!stat) continue;
    if (stat.isSymbolicLink()) throw new Error(`${label} crosses a symbolic-link ancestor`);
    if (index < segments.length - 1 && !stat.isDirectory()) throw new Error(`${label} crosses a non-directory ancestor`);
  }
  return { target: resolvedTarget, trustedBase };
}

function assertSafeRoot(root, label, trustedBaseDirectory) {
  const resolved = resolveBelowTrustedBase(root, trustedBaseDirectory, label);
  const stat = lstatIfPresent(resolved.target);
  if (stat) {
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a non-symbolic directory`);
    if (fs.readdirSync(resolved.target).length > 0) throw new Error(`${label} must be empty`);
  }
  return resolved;
}

function safeResolve(root, relative) {
  assertSafeRelativePath(relative, "session archive path");
  const resolvedRoot = assertTrustedDirectory(root, "Session archive root");
  const resolved = path.resolve(resolvedRoot, ...relative.split("/"));
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("Archive path escapes root");
  let current = resolvedRoot;
  for (const segment of relative.split("/")) {
    current = path.join(current, segment);
    const stat = lstatIfPresent(current);
    if (!stat) continue;
    if (stat.isSymbolicLink()) throw new Error("Archive path crosses a symbolic link");
    if (current !== resolved && !stat.isDirectory()) throw new Error("Archive path crosses a non-directory entry");
  }
  return resolved;
}

function ensureSafeParentDirectories(root, relative) {
  assertSafeRelativePath(relative, "session archive path");
  let current = assertTrustedDirectory(root, "Session archive root");
  const parentSegments = relative.split("/").slice(0, -1);
  for (const segment of parentSegments) {
    current = path.join(current, segment);
    let stat = lstatIfPresent(current);
    if (!stat) {
      fs.mkdirSync(current, { mode: 0o700 });
      stat = fs.lstatSync(current);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Archive path crosses an unsafe parent directory");
  }
}

function writeExclusive(root, relative, bytes) {
  ensureSafeParentDirectories(root, relative);
  const filePath = safeResolve(root, relative);
  const descriptor = fs.openSync(filePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function decodeText(bytes, label) {
  if (bytes.includes(0)) throw new Error(`${label} contains a NUL byte`);
  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8`);
  }
}

function isExactSafeGithubSshRemote(text, emailOffset) {
  const prior = emailOffset === 0 ? "" : text[emailOffset - 1];
  if (prior && !/[\s"'([{=]/.test(prior)) return false;
  return SAFE_GITHUB_SSH_REMOTE.test(text.slice(emailOffset));
}

function assertNoHighRiskText(text, label) {
  for (const [kind, pattern] of HIGH_RISK_PATTERNS) {
    if (pattern.test(text)) throw new Error(`${label} contains high-risk ${kind}`);
  }
  EMAIL_PATTERN.lastIndex = 0;
  for (let match = EMAIL_PATTERN.exec(text); match; match = EMAIL_PATTERN.exec(text)) {
    if (match[0].toLowerCase() === SAFE_GITHUB_SSH_IDENTITY && isExactSafeGithubSshRemote(text, match.index)) continue;
    throw new Error(`${label} contains a private-looking email address`);
  }
}

export function assertSanitizedSyntheticText(text, label = "synthetic text") {
  if (typeof text !== "string") throw new TypeError(`${label} must be text`);
  assertNoHighRiskText(text, label);
  return true;
}

function parseCanonicalJson(bytes, label) {
  const text = decodeText(bytes, label);
  let value;
  try { value = JSON.parse(text); } catch { throw new Error(`${label} is not valid JSON`); }
  if (text !== `${canonicalize(value)}\n`) throw new Error(`${label} is not canonical JSON`);
  return value;
}

function parseCanonicalJsonl(bytes, label) {
  const text = decodeText(bytes, label);
  if (!text.endsWith("\n") || text === "\n") throw new Error(`${label} is not canonical JSONL`);
  const lines = text.slice(0, -1).split("\n");
  const records = lines.map((line, index) => {
    if (line.length === 0) throw new Error(`${label} contains an empty JSONL record`);
    let value;
    try { value = JSON.parse(line); } catch { throw new Error(`${label} record ${index + 1} is not valid JSON`); }
    if (line !== canonicalize(value)) throw new Error(`${label} record ${index + 1} is not canonical JSON`);
    return value;
  });
  return records;
}

function assertSyntheticSafetyFlags(value, label, seen = new Set()) {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) throw new Error(`${label} contains a cyclic object`);
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if ((key === "consequentialAuthorityGranted" || key === "personalChatGptMemoryIncluded" || key === "personalChatGptMemoryStored" || key === "rawPrivateDataIncluded") && child !== false) {
      throw new Error(`${label} has unsafe ${key}`);
    }
    if (key === "externalEffects" && (!Array.isArray(child) || child.length !== 0)) throw new Error(`${label} has external effects`);
    if (key === "privacyClass" && child !== "synthetic") throw new Error(`${label} contains a non-synthetic privacy class`);
    if (key === "synthetic" && child !== true) throw new Error(`${label} contains a non-synthetic record`);
    assertSyntheticSafetyFlags(child, label, seen);
  }
  seen.delete(value);
}

function assertPhaseAMetadata(metadata) {
  assertExactOwnKeys(metadata, EXPORT_METADATA_KEYS, "Phase A export metadata");
  for (const key of ["exportId", "sessionId", "workspaceId", "projectId"]) assertSyntheticId(metadata[key], `Phase A export metadata ${key}`);
  assertCanonicalTimestamp(metadata.createdAt, "Phase A export metadata createdAt");
  assertNoHighRiskText(canonicalize(metadata), "Phase A export metadata");
}

function assertExactPhaseAPaths(files) {
  const actual = files.map((file) => file.path).sort();
  if (canonicalize(actual) !== canonicalize(PHASE_A_SYNTHETIC_PATHS)) {
    throw new Error("Phase A export must contain the exact approved synthetic artifact set; generic clean-export classification is unsupported");
  }
}

function assertExactPhaseAHashes(files) {
  for (const file of files) {
    const expected = PHASE_A_SYNTHETIC_HASHES[file.path];
    if (!expected || sha256Bytes(file.bytes) !== expected) {
      throw new Error(`Phase A artifact ${file.path} differs from the exact approved synthetic bytes`);
    }
  }
}

function expectedSyntheticReport(fixture, finalSession, events, metadata) {
  const first = fixture.ownerEvents[0];
  const successor = fixture.ownerEvents[1];
  return `# Clover Launch Studio Synthetic Session Report\n\n` +
    `Status: **HELD — awaiting real execution authority**\n\n` +
    `- Session: \`${fixture.sessionId}\`\n` +
    `- Workspace/project: \`${fixture.workspaceId}\` / \`${fixture.projectId}\`\n` +
    `- Profile: \`${fixture.profileId}\`\n` +
    `- Final state/version: \`${finalSession.state}\` / \`${finalSession.sessionVersion}\`\n` +
    `- Events: ${events.length}\n` +
    `- Original transcript bytes/hash: ${first.transcriptUtf8Bytes} / \`${first.transcriptSha256}\`\n` +
    `- Edited transcript bytes/hash: ${successor.transcriptUtf8Bytes} / \`${successor.transcriptSha256}\`\n` +
    `- Build Charter: \`${fixture.buildCharter.recordId}\`\n` +
    `- Proposed preview external effects: ${fixture.previewProposal.externalEffects.length}\n` +
    `- Export ID: \`${metadata.exportId}\`\n` +
    `- Personal ChatGPT memory stored or shared: no\n` +
    `- Consequential authority granted: no\n\n` +
    `## Intended fruit\n\n${fixture.predictedFruit.statement}\n\n` +
    `This record is synthetic, text-only, preview-proposal-only, and performs no worktree, provider build, deployment, message, purchase, or other external effect.\n`;
}

function assertPhaseAArtifactGraph(files, metadata) {
  const byPath = new Map(files.map((file) => [file.path, file.bytes]));
  const fixture = parseCanonicalJson(byPath.get("session/fixture.json"), "Phase A fixture");
  const events = parseCanonicalJsonl(byPath.get("session/events.jsonl"), "Phase A event stream");
  const finalSession = parseCanonicalJson(byPath.get("session/final.json"), "Phase A final session");
  const timeline = parseCanonicalJsonl(byPath.get("session/material-progress-timeline.jsonl"), "Phase A timeline");
  const report = decodeText(byPath.get("session/SYNTHETIC_SESSION_REPORT.md"), "Phase A report");

  for (const [filePath, bytes] of byPath) assertNoHighRiskText(decodeText(bytes, `Phase A artifact ${filePath}`), `Phase A artifact ${filePath}`);
  for (const value of [fixture, ...events, finalSession, ...timeline]) assertSyntheticSafetyFlags(value, "Phase A artifact graph");

  if (fixture.documentType !== "clover-launch-studio-synthetic-session-fixture" || fixture.schemaVersion !== "0.1.0" || fixture.title !== "Synthetic fictional retreat activity chooser") {
    throw new Error("Phase A fixture identity was substituted");
  }
  if (!Array.isArray(fixture.ownerEvents) || fixture.ownerEvents.length !== 2 ||
      fixture.ownerEvents[0].transcript !== "Build a tiny app that helps a fictional retreat guest see today’s activities and choose one next activity." ||
      fixture.ownerEvents[1].transcript !== "Build a tiny app that helps a fictional retreat guest see today’s activities and choose one next activity. Keep the session synthetic and preview-only." ||
      fixture.ownerEvents.some((entry) => entry.modality !== "text" || entry.actor?.displayName !== "Synthetic Owner" || !String(entry.actor?.participantId ?? "").startsWith("participant_synthetic_"))) {
    throw new Error("Phase A fixture is not the exact approved fictional owner-only text session");
  }
  for (const key of ["sessionId", "workspaceId", "projectId"]) {
    if (fixture[key] !== metadata[key] || finalSession[key] !== metadata[key]) throw new Error(`Phase A ${key} metadata substitution detected`);
  }
  if (canonicalize(fixture.exportMetadata) !== canonicalize(metadata)) throw new Error("Phase A fixture export metadata substitution detected");
  if (fixture.previewProposal?.previewCreated !== false || fixture.previewProposal?.target !== null || fixture.previewProposal?.externalEffects?.length !== 0 || fixture.executorWorkOrder?.executed !== false) {
    throw new Error("Phase A fixture claims an execution or preview effect");
  }

  if (events.length !== PHASE_A_EVENT_TYPES.length || timeline.length !== events.length) throw new Error("Phase A event or timeline cardinality was substituted");
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const progress = timeline[index];
    if (event.sequence !== index + 1 || event.sessionId !== metadata.sessionId || event.eventType !== PHASE_A_EVENT_TYPES[index] || event.toState !== PHASE_A_STATES[index]) {
      throw new Error(`Phase A event ${index + 1} identity or lifecycle was substituted`);
    }
    const expectedProgress = {
      schemaVersion: "0.1.0",
      sequence: event.sequence,
      recordedAt: event.recordedAt,
      eventType: event.eventType,
      state: event.toState,
      conciseStatus: event.conciseStatus,
      materialDelta: event.materialDelta,
      evidenceIds: event.evidence.map((entry) => entry.evidenceId),
      nextOwnerDecision: event.nextOwnerDecision,
      consequentialAuthorityGranted: false
    };
    if (canonicalize(progress) !== canonicalize(expectedProgress)) throw new Error(`Phase A timeline record ${index + 1} was substituted`);
  }
  const lastEvent = events.at(-1);
  if (finalSession.documentType !== "clover-launch-session" || finalSession.schemaVersion !== "0.1.0" || finalSession.state !== "held" ||
      finalSession.sessionVersion !== events.length || finalSession.eventCount !== events.length || finalSession.headEventHash !== lastEvent.eventHash ||
      finalSession.profileId !== fixture.profileId || finalSession.fixtureHash !== sha256Canonical(fixture)) {
    throw new Error("Phase A final session was substituted or does not bind the fixture and event stream");
  }
  if (report !== expectedSyntheticReport(fixture, finalSession, events, metadata)) throw new Error("Phase A human-readable report was substituted");
}

function normalizePhaseAFiles(filesInput) {
  if (!Array.isArray(filesInput)) throw new TypeError("Phase A export files must be an array");
  const normalized = filesInput.map((file, index) => {
    assertExactOwnKeys(file, ["bytes", "path"], `Phase A export file ${index + 1}`);
    const filePath = assertSafeRelativePath(file.path, "export file path");
    if (filePath === "export-manifest.json") throw new Error("export-manifest.json is reserved");
    if (!(typeof file.bytes === "string" || Buffer.isBuffer(file.bytes) || file.bytes instanceof Uint8Array)) throw new TypeError(`Phase A export file ${filePath} bytes are invalid`);
    const bytes = Buffer.isBuffer(file.bytes) || file.bytes instanceof Uint8Array ? Buffer.from(file.bytes) : Buffer.from(file.bytes, "utf8");
    return { path: filePath, bytes };
  }).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const paths = normalized.map((file) => file.path);
  if (new Set(paths).size !== paths.length) throw new Error("Duplicate export path");
  assertExactPhaseAPaths(normalized);
  return normalized;
}

function exportMetadataFromManifest(manifest) {
  return Object.fromEntries(EXPORT_METADATA_KEYS.map((key) => [key, manifest[key]]));
}

// Phase A intentionally has no generic clean-export mode. A future private or
// mixed-data exporter must accept an explicit classification produced by a
// separate private-storage gate; it may not reuse this synthetic attestation.
export function buildExportManifest(filesInput, metadata) {
  assertPhaseAMetadata(metadata);
  const normalized = normalizePhaseAFiles(filesInput);
  assertPhaseAArtifactGraph(normalized, metadata);
  assertExactPhaseAHashes(normalized);
  const unsigned = {
    documentType: "clover-launch-session-export-manifest",
    schemaVersion: "0.1.0",
    exportId: metadata.exportId,
    sessionId: metadata.sessionId,
    workspaceId: metadata.workspaceId,
    projectId: metadata.projectId,
    createdAt: metadata.createdAt,
    files: normalized.map((file) => ({ path: file.path, sha256: sha256Bytes(file.bytes), byteLength: file.bytes.length })),
    containsPrivateData: false,
    personalChatGptMemoryIncluded: false,
    externalEffects: [],
    synthetic: true,
    consequentialAuthorityGranted: false
  };
  return { files: normalized, manifest: { ...unsigned, manifestHash: sha256Canonical(unsigned) } };
}

export function verifyExportBundle(filesInput, manifest) {
  assertExactOwnKeys(manifest, MANIFEST_KEYS, "Export manifest");
  if (manifest.documentType !== "clover-launch-session-export-manifest" || manifest.schemaVersion !== "0.1.0" || manifest.containsPrivateData !== false ||
      manifest.personalChatGptMemoryIncluded !== false || manifest.synthetic !== true || manifest.consequentialAuthorityGranted !== false ||
      !Array.isArray(manifest.externalEffects) || manifest.externalEffects.length !== 0) {
    throw new Error("Export manifest is not an exact Phase A synthetic attestation");
  }
  const rebuilt = buildExportManifest(filesInput, exportMetadataFromManifest(manifest));
  if (canonicalize(rebuilt.manifest) !== canonicalize(manifest)) throw new Error("Export manifest or file substitution detected");
  return { valid: true, manifestHash: manifest.manifestHash, fileCount: manifest.files.length, files: rebuilt.files };
}

export function writeExportBundle(directory, files, manifest, options = {}) {
  const requestedBase = requireTrustedBaseOption(options, "trustedBaseDirectory", "Export destination");
  const { target, trustedBase } = assertSafeRoot(directory, "Export destination", requestedBase);
  const verified = verifyExportBundle(files, manifest);
  if (!lstatIfPresent(target)) fs.mkdirSync(target, { mode: 0o700 });
  const targetStat = fs.lstatSync(target);
  if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) throw new Error("Export destination creation was substituted");
  for (const file of verified.files) writeExclusive(target, file.path, file.bytes);
  writeExclusive(target, "export-manifest.json", `${canonicalize(manifest)}\n`);
  return verifyExportDirectory(target, { trustedBaseDirectory: trustedBase });
}

function collectFiles(root, current = root) {
  const result = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const absolute = path.join(current, entry.name);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error("Session archive contains a symbolic link");
    if (stat.isDirectory()) result.push(...collectFiles(root, absolute));
    else if (stat.isFile()) result.push(path.relative(root, absolute).split(path.sep).join("/"));
    else throw new Error("Session archive contains a nonregular entry");
  }
  return result;
}

export function verifyExportDirectory(directory, options = {}) {
  const requestedBase = requireTrustedBaseOption(options, "trustedBaseDirectory", "Export directory");
  const { target } = resolveBelowTrustedBase(directory, requestedBase, "Export directory");
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Export root must be a non-symbolic directory");
  const manifestPath = safeResolve(target, "export-manifest.json");
  const manifestStat = fs.lstatSync(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) throw new Error("Export manifest must be a regular file");
  const manifestBytes = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestBytes);
  if (manifestBytes !== `${canonicalize(manifest)}\n`) throw new Error("Export manifest bytes are not canonical");
  assertExactOwnKeys(manifest, MANIFEST_KEYS, "Export manifest");
  if (!Array.isArray(manifest.files)) throw new Error("Export manifest files must be an array");
  const files = manifest.files.map((entry, index) => {
    assertExactOwnKeys(entry, ["byteLength", "path", "sha256"], `Export manifest file ${index + 1}`);
    const absolute = safeResolve(target, entry.path);
    const entryStat = fs.lstatSync(absolute);
    if (!entryStat.isFile() || entryStat.isSymbolicLink()) throw new Error(`Export entry ${entry.path} is not a regular file`);
    const bytes = fs.readFileSync(absolute);
    if (bytes.length !== entry.byteLength || sha256Bytes(bytes) !== entry.sha256) throw new Error(`Export entry ${entry.path} failed integrity`);
    return { path: entry.path, bytes };
  });
  const actual = collectFiles(target).sort();
  const expected = ["export-manifest.json", ...manifest.files.map((entry) => entry.path)].sort();
  if (canonicalize(actual) !== canonicalize(expected)) throw new Error("Export contains an unmanifested or missing file");
  verifyExportBundle(files, manifest);
  return { valid: true, manifest, files };
}

export function restoreExportDirectory(exportDirectory, restoreDirectory, options = {}) {
  const exportTrustedBase = requireTrustedBaseOption(options, "exportTrustedBaseDirectory", "Export restore source");
  const restoreTrustedBase = requireTrustedBaseOption(options, "restoreTrustedBaseDirectory", "Restore destination");
  const verified = verifyExportDirectory(exportDirectory, { trustedBaseDirectory: exportTrustedBase });
  const { target, trustedBase } = assertSafeRoot(restoreDirectory, "Restore destination", restoreTrustedBase);
  if (!lstatIfPresent(target)) fs.mkdirSync(target, { mode: 0o700 });
  const targetStat = fs.lstatSync(target);
  if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) throw new Error("Restore destination creation was substituted");
  for (const file of verified.files) writeExclusive(target, file.path, file.bytes);
  writeExclusive(target, "export-manifest.json", `${canonicalize(verified.manifest)}\n`);
  const restored = verifyExportDirectory(target, { trustedBaseDirectory: trustedBase });
  return {
    valid: true,
    manifest: restored.manifest,
    files: restored.files,
    restorationTreeHash: sha256Canonical(restored.manifest.files)
  };
}
