import fs from "node:fs";
import path from "node:path";
import { canonicalize, sha256Bytes, sha256Canonical, assertSha256 } from "./canonical-json.mjs";

function toBytes(value) {
  return Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value);
}

export function assertSafeRelativePath(relativePath, label = "path") {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new TypeError(`${label} must be a non-empty relative path`);
  }
  if (relativePath.includes("\0") || relativePath.includes("\\")) {
    throw new Error(`${label} contains an unsafe character`);
  }
  if (path.posix.isAbsolute(relativePath)) throw new Error(`${label} must be relative`);
  const parts = relativePath.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`${label} contains an unsafe segment`);
  }
  if (path.posix.normalize(relativePath) !== relativePath) {
    throw new Error(`${label} is not normalized`);
  }
  return relativePath;
}

function resolveSafe(rootDirectory, relativePath) {
  assertSafeRelativePath(relativePath);
  const resolvedRoot = path.resolve(rootDirectory);
  if (fs.existsSync(resolvedRoot)) {
    const rootStat = fs.lstatSync(resolvedRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Storage root must be a non-symbolic directory");
  }
  const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"));
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("Resolved path escapes its root");
  let current = resolvedRoot;
  for (const segment of relativePath.split("/")) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`Resolved path contains symbolic link ${segment}`);
    }
  }
  return resolved;
}

function requireRegularFile(filePath, label) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file`);
  return stat;
}

function listFiles(rootDirectory, currentDirectory = rootDirectory) {
  const files = [];
  for (const entry of fs.readdirSync(currentDirectory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if (entry.isSymbolicLink()) throw new Error(`Export contains symbolic link ${entry.name}`);
    const absolutePath = path.join(currentDirectory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(rootDirectory, absolutePath));
    else if (entry.isFile()) files.push(path.relative(rootDirectory, absolutePath).split(path.sep).join("/"));
    else throw new Error(`Export contains unsupported filesystem entry ${entry.name}`);
  }
  return files;
}

function writeNewFile(filePath, bytes) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const descriptor = fs.openSync(filePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function captureArtifact(storeDirectory, bytesInput, metadata = {}) {
  const bytes = toBytes(bytesInput);
  const contentHash = sha256Bytes(bytes);
  const relativePath = `blobs/sha256/${contentHash.slice(0, 2)}/${contentHash}`;
  const absolutePath = resolveSafe(storeDirectory, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  if (fs.existsSync(absolutePath)) {
    requireRegularFile(absolutePath, "Existing content-addressed artifact");
    const existing = fs.readFileSync(absolutePath);
    if (!existing.equals(bytes)) throw new Error(`Hash collision at ${relativePath}`);
  } else {
    writeNewFile(absolutePath, bytes);
  }
  return {
    schemaVersion: "0.1",
    artifactKind: metadata.artifactKind || "source-bytes",
    sourceId: metadata.sourceId || null,
    observedAt: metadata.observedAt || null,
    mediaType: metadata.mediaType || "application/octet-stream",
    contentHash,
    byteLength: bytes.length,
    relativePath
  };
}

export function readArtifact(storeDirectory, artifact) {
  assertSha256(artifact.contentHash, "artifact contentHash");
  const expectedPath = `blobs/sha256/${artifact.contentHash.slice(0, 2)}/${artifact.contentHash}`;
  if (artifact.relativePath !== expectedPath) throw new Error("Artifact path does not match its content hash");
  const absolutePath = resolveSafe(storeDirectory, artifact.relativePath);
  requireRegularFile(absolutePath, "Artifact");
  const bytes = fs.readFileSync(absolutePath);
  if (bytes.length !== artifact.byteLength) throw new Error("Artifact byte length mismatch");
  if (sha256Bytes(bytes) !== artifact.contentHash) throw new Error("Artifact content hash mismatch");
  return bytes;
}

export function assertArtifactAbsent(storeDirectory, artifact) {
  const expectedPath = `blobs/sha256/${artifact.contentHash.slice(0, 2)}/${artifact.contentHash}`;
  if (artifact.relativePath !== expectedPath) throw new Error("Artifact path does not match its content hash");
  if (fs.existsSync(resolveSafe(storeDirectory, artifact.relativePath))) {
    throw new Error(`Artifact ${artifact.contentHash} is still present locally`);
  }
  return true;
}

export function deleteArtifact(storeDirectory, artifact, options) {
  const bytes = readArtifact(storeDirectory, artifact);
  const tombstone = {
    documentType: "clover-local-artifact-tombstone",
    schemaVersion: "0.1",
    synthetic: true,
    contentHash: artifact.contentHash,
    byteLength: bytes.length,
    formerRelativePath: artifact.relativePath,
    sourceId: artifact.sourceId,
    deletedAt: options.deletedAt,
    reason: options.reason,
    deletionScope: "this-local-content-addressed-store-only",
    localAbsenceVerified: false,
    externalCopiesUnknown: true,
    externalErasureClaimed: false,
    tombstoneHash: null
  };
  fs.unlinkSync(resolveSafe(storeDirectory, artifact.relativePath));
  tombstone.localAbsenceVerified = assertArtifactAbsent(storeDirectory, artifact);
  const { tombstoneHash: _tombstoneHash, ...unsigned } = tombstone;
  tombstone.tombstoneHash = sha256Canonical(unsigned);
  const relativePath = `tombstones/${artifact.contentHash}.json`;
  writeNewFile(resolveSafe(storeDirectory, relativePath), `${canonicalize(tombstone)}\n`);
  return { ...tombstone, relativePath };
}

function normalizeExportFile(file) {
  const relativePath = assertSafeRelativePath(file.path, "export file path");
  if (relativePath === "manifest.json") throw new Error("manifest.json is reserved");
  const bytes = toBytes(file.bytes);
  return { path: relativePath, bytes };
}

export function createExport(exportDirectory, filesInput, metadata) {
  if (fs.existsSync(exportDirectory) && fs.readdirSync(exportDirectory).length !== 0) {
    throw new Error("Export destination must be absent or empty");
  }
  if (fs.existsSync(exportDirectory) && fs.lstatSync(exportDirectory).isSymbolicLink()) {
    throw new Error("Export destination cannot be a symbolic link");
  }
  fs.mkdirSync(exportDirectory, { recursive: true });
  const files = filesInput.map(normalizeExportFile).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const seen = new Set();
  for (const file of files) {
    if (seen.has(file.path)) throw new Error(`Duplicate export path ${file.path}`);
    seen.add(file.path);
    writeNewFile(resolveSafe(exportDirectory, file.path), file.bytes);
  }
  const manifest = {
    documentType: "clover-trust-slice-export",
    schemaVersion: "0.1",
    exportId: metadata.exportId,
    createdAt: metadata.createdAt,
    phase: metadata.phase,
    synthetic: true,
    files: files.map((file) => ({
      path: file.path,
      sha256: sha256Bytes(file.bytes),
      byteLength: file.bytes.length
    })),
    manifestHash: null
  };
  const { manifestHash: _manifestHash, ...unsigned } = manifest;
  manifest.manifestHash = sha256Canonical(unsigned);
  writeNewFile(path.join(exportDirectory, "manifest.json"), `${canonicalize(manifest)}\n`);
  verifyExport(exportDirectory);
  return manifest;
}

export function verifyExport(exportDirectory) {
  const rootStat = fs.lstatSync(exportDirectory);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Export root must be a directory");
  const manifestPath = path.join(exportDirectory, "manifest.json");
  requireRegularFile(manifestPath, "Export manifest");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.documentType !== "clover-trust-slice-export" || manifest.schemaVersion !== "0.1") {
    throw new Error("Unsupported export manifest");
  }
  const { manifestHash, ...unsigned } = manifest;
  assertSha256(manifestHash, "manifestHash");
  if (sha256Canonical(unsigned) !== manifestHash) throw new Error("Export manifest tampering detected");
  if (!Array.isArray(manifest.files)) throw new Error("Export manifest files must be an array");
  const expected = new Set(["manifest.json"]);
  for (const file of manifest.files) {
    assertSafeRelativePath(file.path, "manifest file path");
    if (file.path === "manifest.json" || expected.has(file.path)) throw new Error(`Duplicate or reserved path ${file.path}`);
    assertSha256(file.sha256, `file ${file.path} sha256`);
    expected.add(file.path);
    const absolutePath = resolveSafe(exportDirectory, file.path);
    const stat = requireRegularFile(absolutePath, `Export file ${file.path}`);
    const bytes = fs.readFileSync(absolutePath);
    if (stat.size !== file.byteLength || bytes.length !== file.byteLength) throw new Error(`Size mismatch for ${file.path}`);
    if (sha256Bytes(bytes) !== file.sha256) throw new Error(`Hash mismatch for ${file.path}`);
  }
  const actual = listFiles(exportDirectory);
  if (actual.length !== expected.size || actual.some((file) => !expected.has(file))) {
    throw new Error("Export contains an unmanifested or missing file");
  }
  return { valid: true, manifest };
}

export function restoreExport(exportDirectory, destinationDirectory) {
  const { manifest } = verifyExport(exportDirectory);
  if (fs.existsSync(destinationDirectory) && fs.readdirSync(destinationDirectory).length !== 0) {
    throw new Error("Restore destination must be absent or empty");
  }
  if (fs.existsSync(destinationDirectory) && fs.lstatSync(destinationDirectory).isSymbolicLink()) {
    throw new Error("Restore destination cannot be a symbolic link");
  }
  fs.mkdirSync(destinationDirectory, { recursive: true });
  for (const file of manifest.files) {
    const bytes = fs.readFileSync(resolveSafe(exportDirectory, file.path));
    writeNewFile(resolveSafe(destinationDirectory, file.path), bytes);
  }
  writeNewFile(path.join(destinationDirectory, "manifest.json"), fs.readFileSync(path.join(exportDirectory, "manifest.json")));
  verifyExport(destinationDirectory);
  return manifest;
}
