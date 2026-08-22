import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

export const seedDataProvenanceObservation = () => ({
  state: "unknown",
  basis: "The seed SQL path and SHA-256 are bound, but the SQL and its literal values are candidate-controlled and no source-record provenance or content-classification attestation is available."
});

export function assertFullSha(value, label) {
  if (!/^[0-9a-f]{40}$/.test(value || "")) throw new Error(`${label} must be an exact 40-character lowercase Git SHA`);
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  fs.writeFileSync(file, bytes);
  if (process.env.GITHUB_OUTPUT) {
    const name = `${path.basename(file, ".json").replace(/[^A-Za-z0-9_]/g, "_")}_sha256`;
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${sha256(bytes)}\n`);
  }
  return sha256(bytes);
}

function git(root, ...argumentsList) {
  return execFileSync("git", argumentsList, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function resolveContainedRegularFile(rootArgument, relativeArgument, label) {
  if (!relativeArgument || path.isAbsolute(relativeArgument)) throw new Error(`${label} must be a relative path`);
  const segments = relativeArgument.split(/[\\/]+/);
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error(`${label} contains a forbidden path segment`);
  const root = fs.realpathSync(rootArgument);
  let cursor = root;
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) throw new Error(`${label} traverses a symbolic link: ${segment}`);
  }
  const resolved = fs.realpathSync(cursor);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`${label} escapes its root`);
  if (!fs.statSync(resolved).isFile()) throw new Error(`${label} is not a regular file`);
  return resolved;
}

function trackedEntries(root) {
  const raw = execFileSync("git", ["ls-files", "-s", "-z"], { cwd: root });
  return raw.toString("utf8").split("\0").filter(Boolean).map((item) => {
    const match = /^(\d+) ([0-9a-f]+) (\d+)\t([\s\S]+)$/.exec(item);
    if (!match) throw new Error(`Could not parse tracked entry: ${item}`);
    const [, mode, indexObject, stage, relative] = match;
    const absolute = path.join(root, relative);
    let observedType = "missing";
    let observedSha256 = null;
    try {
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        observedType = "symlink";
        observedSha256 = sha256(Buffer.from(fs.readlinkSync(absolute)));
      } else if (stat.isFile()) {
        observedType = "file";
        observedSha256 = sha256(fs.readFileSync(absolute));
      } else if (stat.isDirectory()) {
        observedType = "directory";
        observedSha256 = indexObject;
      } else {
        observedType = "other";
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    return { path: relative, mode, indexObject, stage, observedType, observedSha256 };
  });
}

function snapshotTrackedRoot(rootArgument) {
  const root = fs.realpathSync(rootArgument);
  const entries = trackedEntries(root);
  const status = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=no"], { cwd: root });
  return {
    commit: git(root, "rev-parse", "HEAD"),
    tree: git(root, "rev-parse", "HEAD^{tree}"),
    entryCount: entries.length,
    entriesSha256: sha256(Buffer.from(`${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`)),
    statusSha256: sha256(status),
    statusBase64: status.toString("base64")
  };
}

function snapshotDirectory(rootArgument, { exclude = [] } = {}) {
  if (!fs.existsSync(rootArgument)) return { present: false, entryCount: 0, treeSha256: null, entries: [] };
  const root = fs.realpathSync(rootArgument);
  const excluded = new Set(exclude.map((value) => value.split(path.sep).join("/")));
  const entries = [];
  const visit = (directory, prefix = "") => {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      if (excluded.has(relative)) continue;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        entries.push({ path: relative, type: "symlink", mode: stat.mode, sha256: sha256(Buffer.from(fs.readlinkSync(absolute))) });
      } else if (stat.isDirectory()) {
        visit(absolute, relative);
      } else if (stat.isFile()) {
        entries.push({ path: relative, type: "file", mode: stat.mode, bytes: stat.size, sha256: sha256(fs.readFileSync(absolute)) });
      } else {
        entries.push({ path: relative, type: "other", mode: stat.mode, sha256: null });
      }
    }
  };
  visit(root);
  return {
    present: true,
    entryCount: entries.length,
    treeSha256: sha256(Buffer.from(`${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`)),
    entries
  };
}

function snapshotInputs(candidateRoot, policyPath, policy) {
  const names = [
    "baselineSqlPath",
    "seedSqlPath",
    "forwardSqlPath",
    "assertionsSqlPath",
    "reconciliationSqlPath",
    "rollbackSqlPath",
    "postRollbackAssertionsSqlPath"
  ];
  const files = [
    { id: "policy", configuredPath: path.relative(candidateRoot, policyPath).split(path.sep).join("/"), absolute: policyPath },
    ...names.map((id) => ({
      id,
      configuredPath: policy.database?.[id],
      absolute: resolveContainedRegularFile(candidateRoot, policy.database?.[id], `database.${id}`)
    }))
  ];
  return files.map(({ id, configuredPath, absolute }) => ({
    id,
    path: configuredPath,
    bytes: fs.statSync(absolute).size,
    sha256: sha256(fs.readFileSync(absolute))
  }));
}

export function snapshotState({ candidateRoot, protocolRoot, expectedCandidate, expectedProtocol, policyPath, evidenceRoot, excludeEvidence = [] }) {
  assertFullSha(expectedCandidate, "CLOVER_CANDIDATE_REF");
  assertFullSha(expectedProtocol, "CLOVER_PROTOCOL_REF");
  const candidate = snapshotTrackedRoot(candidateRoot);
  const protocol = snapshotTrackedRoot(protocolRoot);
  const policyFile = resolveContainedRegularFile(candidateRoot, path.relative(candidateRoot, policyPath), "policy path");
  const policy = readJson(policyFile);
  const tooling = snapshotDirectory(path.join(protocolRoot, "node_modules"));
  return {
    schemaVersion: "1.1",
    protocolVersion: "1.0.1",
    capturedAt: new Date().toISOString(),
    candidate: {
      ...candidate,
      expectedCommit: expectedCandidate,
      exactCommit: candidate.commit === expectedCandidate,
      trackedClean: candidate.statusBase64 === ""
    },
    protocol: {
      ...protocol,
      expectedCommit: expectedProtocol,
      exactCommit: protocol.commit === expectedProtocol,
      trackedClean: protocol.statusBase64 === "",
      tooling: {
        present: tooling.present,
        entryCount: tooling.entryCount,
        treeSha256: tooling.treeSha256
      }
    },
    inputs: snapshotInputs(candidateRoot, policyFile, policy),
    evidence: snapshotDirectory(evidenceRoot, { exclude: excludeEvidence })
  };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function entryMap(snapshot) {
  return new Map((snapshot?.entries || []).map((entry) => [entry.path, entry]));
}

export function compareState(before, after, { allowedArtifacts = new Map(), allowedPrefixes = [] } = {}) {
  const failures = [];
  const candidateKeys = ["commit", "tree", "entryCount", "entriesSha256", "statusSha256", "statusBase64", "expectedCommit", "exactCommit", "trackedClean"];
  const protocolKeys = [...candidateKeys, "tooling"];
  for (const key of candidateKeys) if (!sameJson(before.candidate?.[key], after.candidate?.[key])) failures.push(`Candidate state changed: ${key}`);
  for (const key of protocolKeys) if (!sameJson(before.protocol?.[key], after.protocol?.[key])) failures.push(`Protocol state changed: ${key}`);
  if (!sameJson(before.inputs, after.inputs)) failures.push("Policy or SQL input bytes changed");
  if (!after.candidate?.exactCommit || !after.candidate?.trackedClean) failures.push("Candidate checkout is not the exact clean commit");
  if (!after.protocol?.exactCommit || !after.protocol?.trackedClean || !after.protocol?.tooling?.present) failures.push("Protocol checkout or tooling is not exact and clean");

  const prior = entryMap(before.evidence);
  const current = entryMap(after.evidence);
  for (const [relative, expected] of prior) {
    const observed = current.get(relative);
    if (!observed || !sameJson(expected, observed)) failures.push(`Pre-existing evidence changed: ${relative}`);
  }
  const additions = [];
  for (const [relative, observed] of current) {
    if (prior.has(relative)) continue;
    additions.push(observed);
    const allowedByPrefix = allowedPrefixes.some((prefix) => relative.startsWith(prefix));
    const expectedHash = allowedArtifacts.get(relative);
    if (!allowedByPrefix && !expectedHash) failures.push(`Unexpected evidence addition: ${relative}`);
    if (expectedHash && (observed.type !== "file" || observed.sha256 !== expectedHash)) failures.push(`Evidence hash mismatch: ${relative}`);
  }
  for (const [relative, expectedHash] of allowedArtifacts) {
    const observed = current.get(relative);
    if (!observed) failures.push(`Expected evidence is missing: ${relative}`);
    else if (observed.type !== "file" || observed.sha256 !== expectedHash) failures.push(`Expected evidence does not match: ${relative}`);
  }
  if ((after.evidence?.entries || []).some((entry) => entry.type !== "file")) failures.push("Evidence contains a non-regular-file entry");
  return {
    status: failures.length ? "failed" : "passed",
    failures,
    observations: {
      candidateMutation: failures.some((failure) => failure.startsWith("Candidate")) || !sameJson(before.inputs, after.inputs) ? "observed" : "not-observed",
      protocolMutation: failures.some((failure) => failure.startsWith("Protocol")) ? "observed" : "not-observed",
      inputMutation: sameJson(before.inputs, after.inputs) ? "not-observed" : "observed",
      preExistingEvidenceMutation: failures.some((failure) => failure.startsWith("Pre-existing evidence")) ? "observed" : "not-observed"
    },
    additions
  };
}

export function artifactRecord(rootArgument, relativePath, expectedSha256 = null) {
  const absolute = resolveContainedRegularFile(rootArgument, relativePath, `evidence ${relativePath}`);
  const observed = sha256(fs.readFileSync(absolute));
  return {
    path: relativePath,
    sha256: observed,
    bytes: fs.statSync(absolute).size,
    expectedSha256,
    matched: typeof expectedSha256 === "string" && observed === expectedSha256
  };
}

function normalizeEvidencePath(value, label) {
  if (typeof value !== "string" || !value || value.startsWith("/") || value.includes("\\") || value.includes("\0")) {
    throw new Error(`${label} must be a non-empty forward-slash relative path`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || /[*?]/.test(segment))) {
    throw new Error(`${label} contains a forbidden path segment`);
  }
  return segments.join("/");
}

export function parseArtifactBindings(bindings) {
  const allowedArtifacts = new Map();
  const allowedPrefixes = [];
  for (const binding of bindings) {
    if (binding.endsWith("/**")) {
      const root = normalizeEvidencePath(binding.slice(0, -3), "Evidence descendant pattern");
      const prefix = `${root}/`;
      if (!allowedPrefixes.includes(prefix)) allowedPrefixes.push(prefix);
      continue;
    }
    const separator = binding.lastIndexOf("=");
    if (separator < 1) throw new Error(`Invalid artifact binding: ${binding}`);
    const relative = normalizeEvidencePath(binding.slice(0, separator), "Evidence artifact path");
    const expected = binding.slice(separator + 1);
    if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error(`Artifact binding is not an exact SHA-256: ${relative}`);
    allowedArtifacts.set(relative, expected);
  }
  return { allowedArtifacts, allowedPrefixes };
}
