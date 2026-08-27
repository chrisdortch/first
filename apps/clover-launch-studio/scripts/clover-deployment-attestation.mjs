import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const STACK_A_BASE = "ec4ad8ca76dd5fd6da7db8107829a07c3650b7c6";
export const TREE_INDEX_PATH = "portfolio/core/tree-program/index.json";
export const LOCKFILE_PATH = "apps/clover-launch-studio/package-lock.json";
export const PACKAGE_PATH = "apps/clover-launch-studio/package.json";
export const ATTESTATION_OUTPUT_PATH = "static/__clover/deployment-attestation.json";
const RUNTIME_ROOT = "/var/task";

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

export const canonicalJson = (value) => JSON.stringify(canonicalValue(value));

function git(repositoryRoot, args, options = {}) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: Object.hasOwn(options, "encoding") ? options.encoding : "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
}

function assertHex(value, length, label) {
  if (!new RegExp(`^[0-9a-f]{${length}}$`, "u").test(value)) throw new Error(`${label} is not exact lowercase hex`);
}

function sourceEntry(repositoryRoot, sourcePath) {
  if (/\0|\r|\n|(?:^|\/)\.\.(?:\/|$)/u.test(sourcePath)) throw new Error(`unsafe source path: ${sourcePath}`);
  const line = git(repositoryRoot, ["ls-tree", "HEAD", "--", sourcePath]).trim();
  const match = /^(\d{6}) blob ([0-9a-f]{40})\t(.+)$/u.exec(line);
  if (!match || match[3] !== sourcePath) throw new Error(`source path is not one exact tracked blob: ${sourcePath}`);
  const bytes = git(repositoryRoot, ["cat-file", "blob", match[2]], { encoding: null });
  return { path: sourcePath, mode: match[1], blob: match[2], bytes: bytes.length, sha256: sha256(bytes) };
}

export function deriveSourceProvenance({ repositoryRoot, stackABase = STACK_A_BASE } = {}) {
  if (!repositoryRoot) throw new Error("repositoryRoot is required");
  const root = realpathSync(repositoryRoot);
  assertHex(stackABase, 40, "Stack A base");
  const status = git(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status !== "") throw new Error("CLOVER_DIRTY_SOURCE_REJECTED");
  try {
    git(root, ["merge-base", "--is-ancestor", stackABase, "HEAD"]);
  } catch {
    throw new Error("CLOVER_STACK_A_ANCESTRY_REJECTED");
  }

  const commit = git(root, ["rev-parse", "HEAD"]).trim();
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]).trim();
  const parent = git(root, ["rev-parse", "HEAD^"]).trim();
  for (const [label, value] of [["commit", commit], ["tree", tree], ["parent", parent]]) assertHex(value, 40, label);

  const pathBytes = git(root, ["diff", "--name-only", "--diff-filter=ACMRT", "-z", `${stackABase}..HEAD`], { encoding: null });
  const paths = pathBytes.toString("utf8").split("\0").filter(Boolean).sort();
  if (paths.length === 0 || new Set(paths).size !== paths.length) throw new Error("CLOVER_SOURCE_PATH_LIST_INVALID");
  const pathList = `${paths.join("\n")}\n`;
  const entries = paths.map((sourcePath) => sourceEntry(root, sourcePath));
  const packageDocument = JSON.parse(readFileSync(path.join(root, PACKAGE_PATH), "utf8"));
  const treeIndexBytes = readFileSync(path.join(root, TREE_INDEX_PATH));
  const treeIndex = JSON.parse(treeIndexBytes.toString("utf8"));
  const lockfileBytes = readFileSync(path.join(root, LOCKFILE_PATH));

  const source = {
    commit,
    tree,
    parent,
    stackABase,
    cleanWorktree: true,
    changedPathCount: paths.length,
    pathListSha256: sha256(pathList),
    sourceManifestSha256: sha256(`${canonicalJson(entries)}\n`),
    packageLockSha256: sha256(lockfileBytes),
    treeProgramIndexId: treeIndex.indexId,
    treeProgramIndexHash: treeIndex.indexHash,
    treeProgramIndexRawSha256: sha256(treeIndexBytes),
    nodeVersion: process.version,
    nextVersion: packageDocument.dependencies?.next,
    buildMode: "vercel-prebuilt-preview",
    buildCommand: "npm run build",
    buildOutputCommand: "vercel build --yes"
  };
  for (const key of ["pathListSha256", "sourceManifestSha256", "packageLockSha256", "treeProgramIndexHash", "treeProgramIndexRawSha256"]) {
    assertHex(source[key], 64, key);
  }
  if (!/^v(?:22|24)\./u.test(source.nodeVersion) || typeof source.nextVersion !== "string") {
    throw new Error("CLOVER_BUILD_RUNTIME_IDENTITY_REJECTED");
  }
  return Object.freeze({
    documentType: "clover-tree-build-provenance",
    schemaVersion: "0.2.0",
    ...source,
    buildInvocationId: `clover-build:${sha256(`${canonicalJson(source)}\n`)}`,
    publicSanitized: true,
    privateDataAccessed: false,
    consequentialAuthorityGranted: false
  });
}

function walk(root, directory = root, accumulator = []) {
  for (const name of readdirSync(directory).sort()) {
    const absolutePath = path.join(directory, name);
    const stat = lstatSync(absolutePath);
    const outputPath = path.relative(root, absolutePath).split(path.sep).join("/");
    const normalized = path.posix.normalize(outputPath).normalize("NFC");
    if (!outputPath || normalized !== outputPath || outputPath.startsWith("/") || outputPath.includes("\0")) {
      throw new Error(`CLOVER_OUTPUT_PATH_REJECTED:${outputPath}`);
    }
    if (stat.isDirectory()) walk(root, absolutePath, accumulator);
    else if (stat.isFile()) accumulator.push({ type: "file", path: outputPath, absolutePath, stat });
    else if (stat.isSymbolicLink()) accumulator.push({ type: "symlink", path: outputPath, absolutePath, stat, target: readlinkSync(absolutePath) });
    else throw new Error(`CLOVER_OUTPUT_ENTRY_TYPE_REJECTED:${outputPath}`);
  }
  return accumulator;
}

function replaceExact(text, replacements) {
  let result = text;
  for (const { needle, replacement } of replacements.sort((left, right) => right.needle.length - left.needle.length)) {
    if (needle) result = result.split(needle).join(replacement);
  }
  return result;
}

function extractLauncherConfig(text, label) {
  const start = text.indexOf("const conf = ");
  const end = text.indexOf(";\nvar nextServer", start);
  if (start < 0 || end < 0) throw new Error(`CLOVER_LAUNCHER_CONFIG_REJECTED:${label}`);
  return JSON.parse(text.slice(start + "const conf = ".length, end));
}

function differingJsonKeys(before, after, prefix = "", differences = []) {
  if (before === after) return differences;
  if (before === null || after === null || typeof before !== "object" || typeof after !== "object") {
    differences.push(prefix);
    return differences;
  }
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const key of keys) differingJsonKeys(before[key], after[key], prefix ? `${prefix}.${key}` : key, differences);
  return differences;
}

export function normalizeGeneratedOutput({ outputRoot, checkoutRoot }) {
  const root = realpathSync(outputRoot);
  const sourceRoot = realpathSync(checkoutRoot);
  const buildsPath = path.join(root, "builds.json");
  const builds = JSON.parse(readFileSync(buildsPath, "utf8"));
  if (builds.target !== "preview" || builds.error || builds.builds?.some((build) => build.error)) {
    throw new Error("CLOVER_NONPREVIEW_BUILD_OUTPUT_REJECTED");
  }
  const nodeExecutable = builds.argv?.[0];
  const cliExecutable = builds.argv?.[1];
  const marker = "/node_modules/";
  const cliRoot = typeof cliExecutable === "string" && cliExecutable.includes(marker) ? cliExecutable.slice(0, cliExecutable.indexOf(marker)) : null;
  const metadataReplacements = [
    { needle: sourceRoot, replacement: RUNTIME_ROOT },
    { needle: cliRoot, replacement: `${RUNTIME_ROOT}/.vercel-cli` },
    { needle: typeof nodeExecutable === "string" && path.isAbsolute(nodeExecutable) ? nodeExecutable : null, replacement: `${RUNTIME_ROOT}/.vercel-cli/node` }
  ].filter(({ needle }) => typeof needle === "string");

  const entries = walk(root);
  const normalized = [];
  for (const entry of entries.filter(({ type }) => type === "file")) {
    const isMetadata = entry.path === "builds.json" || entry.path === "diagnostics/cli_traces.json";
    const isLauncher = /^functions\/.+\/apps\/clover-launch-studio\/___next_launcher\.cjs$/u.test(entry.path);
    if (!isMetadata && !isLauncher) continue;
    const beforeBytes = readFileSync(entry.absolutePath);
    const beforeText = beforeBytes.toString("utf8");
    const beforeConfig = isLauncher ? extractLauncherConfig(beforeText, entry.path) : null;
    const afterText = replaceExact(beforeText, isLauncher ? [{ needle: sourceRoot, replacement: RUNTIME_ROOT }] : metadataReplacements);
    if (afterText === beforeText) continue;
    if (isLauncher) {
      const afterConfig = extractLauncherConfig(afterText, entry.path);
      const differences = differingJsonKeys(beforeConfig, afterConfig);
      const allowed = new Set(["outputFileTracingRoot", "repoRoot", "turbopack.root"]);
      if (differences.length === 0 || differences.some((key) => !allowed.has(key))) {
        throw new Error(`CLOVER_LAUNCHER_NORMALIZATION_REJECTED:${entry.path}:${differences.join(",")}`);
      }
    }
    const afterBytes = Buffer.from(afterText);
    writeFileSync(entry.absolutePath, afterBytes, { mode: entry.stat.mode & 0o777 });
    normalized.push({
      path: entry.path,
      classification: isLauncher ? "next-launcher-runtime-root" : "vercel-cli-metadata-root",
      beforeSha256: sha256(beforeBytes),
      afterSha256: sha256(afterBytes)
    });
  }
  return normalized.sort((left, right) => compareText(left.path, right.path));
}

function containsPaymentCardCandidate(text) {
  const expression = /\b(?:\d[ -]*?){13,19}\b/gu;
  for (const match of text.matchAll(expression)) {
    const digits = match[0].replace(/\D/gu, "");
    if (/^(\d)\1+$/u.test(digits)) continue;
    const recognizedIssuer = /^(?:4\d{12}(?:\d{3}){0,2}|5[1-5]\d{14}|2(?:2[2-9]|[3-6]\d|7[01])\d{12}|3[47]\d{13}|6(?:011|5\d{2})\d{12})$/u.test(digits);
    if (!recognizedIssuer) continue;
    let sum = 0;
    let double = false;
    for (let index = digits.length - 1; index >= 0; index -= 1) {
      let digit = Number(digits[index]);
      if (double && (digit *= 2) > 9) digit -= 9;
      sum += digit;
      double = !double;
    }
    if (sum % 10 === 0) return true;
  }
  return false;
}

function assertPublicOutputFile(entry, bytes) {
  const text = bytes.toString("utf8");
  const findings = [
    ["host-absolute-path", new RegExp("(?:/Use" + "rs/|/ho" + "me/|/pri" + "vate/(?:tmp|var/folders)/|/usr/loc" + "al/|[A-Za-z]:\\\\\\\\)", "u")],
    ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
    ["github-token", /\b(?:gh[oprsu]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u],
    ["openai-token", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/u],
    ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/u],
    ["aws-key", /\bAKIA[0-9A-Z]{16}\b/u],
    ["ssn", /\b\d{3}-\d{2}-\d{4}\b/u]
  ].filter(([, expression]) => expression.test(text)).map(([label]) => label);
  if (containsPaymentCardCandidate(text)) findings.push("payment-card");
  if (findings.length) throw new Error(`CLOVER_PUBLIC_OUTPUT_REJECTED:${entry.path}:${findings.join(",")}`);
}

export function buildOutputManifest(outputRoot, { excludedPath = ATTESTATION_OUTPUT_PATH } = {}) {
  const root = realpathSync(outputRoot);
  const entries = walk(root).filter(({ path: outputPath }) => outputPath !== excludedPath);
  const normalizedPaths = new Set();
  const files = [];
  const symlinks = [];
  let aggregateBytes = 0;
  for (const entry of entries.sort((left, right) => compareText(left.path, right.path))) {
    const normalizedPath = entry.path.normalize("NFC");
    if (normalizedPaths.has(normalizedPath)) throw new Error(`CLOVER_DUPLICATE_OUTPUT_PATH_REJECTED:${entry.path}`);
    normalizedPaths.add(normalizedPath);
    if (entry.type === "file") {
      const bytes = readFileSync(entry.absolutePath);
      assertPublicOutputFile(entry, bytes);
      aggregateBytes += bytes.length;
      files.push({ path: entry.path, mode: entry.stat.mode & 0o111 ? "0755" : "0644", bytes: bytes.length, sha256: sha256(bytes) });
      continue;
    }
    if (path.isAbsolute(entry.target) || entry.target.includes("\0")) {
      throw new Error(`CLOVER_OUTPUT_SYMLINK_REJECTED:${entry.path}`);
    }
    let resolved;
    try {
      resolved = realpathSync(entry.absolutePath);
    } catch {
      throw new Error(`CLOVER_OUTPUT_SYMLINK_REJECTED:${entry.path}`);
    }
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`CLOVER_OUTPUT_SYMLINK_REJECTED:${entry.path}`);
    symlinks.push({ path: entry.path, mode: "0777", target: entry.target });
  }
  const body = { schemaVersion: "clover-build-output-manifest-v1", files, symlinks };
  return Object.freeze({
    ...body,
    regularFileCount: files.length,
    symlinkCount: symlinks.length,
    aggregateRegularFileBytes: aggregateBytes,
    rootSha256: sha256(`${canonicalJson(body)}\n`)
  });
}

function writeOctal(buffer, offset, length, value) {
  const encoded = Math.trunc(value).toString(8).padStart(length - 1, "0");
  buffer.write(encoded.slice(-(length - 1)), offset, length - 1, "ascii");
  buffer[offset + length - 1] = 0;
}

function splitUstarPath(archivePath) {
  if (Buffer.byteLength(archivePath) <= 100) return { name: archivePath, prefix: "" };
  for (let index = archivePath.lastIndexOf("/"); index > 0; index = archivePath.lastIndexOf("/", index - 1)) {
    const prefix = archivePath.slice(0, index);
    const name = archivePath.slice(index + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { name, prefix };
  }
  throw new Error(`CLOVER_ARCHIVE_PATH_REJECTED:${archivePath}`);
}

function tarHeader(archivePath, { mode, size, type, linkName = "" }) {
  if (Buffer.byteLength(linkName) > 100) throw new Error(`CLOVER_ARCHIVE_LINK_REJECTED:${archivePath}`);
  const header = Buffer.alloc(512, 0);
  const { name, prefix } = splitUstarPath(archivePath);
  header.write(name, 0, 100, "utf8");
  writeOctal(header, 100, 8, mode);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header.write(type, 156, 1, "ascii");
  if (linkName) header.write(linkName, 157, 100, "utf8");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  header.write("root", 265, 32, "ascii");
  header.write("root", 297, 32, "ascii");
  if (prefix) header.write(prefix, 345, 155, "utf8");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0"), 148, 6, "ascii");
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

export function deterministicOutputArchive(outputRoot) {
  const root = realpathSync(outputRoot);
  const parts = [];
  for (const entry of walk(root).sort((left, right) => compareText(left.path, right.path))) {
    const archivePath = `output/${entry.path}`;
    if (entry.type === "symlink") {
      parts.push(tarHeader(archivePath, { mode: 0o777, size: 0, type: "2", linkName: entry.target }));
      continue;
    }
    const bytes = readFileSync(entry.absolutePath);
    const mode = entry.stat.mode & 0o111 ? 0o755 : 0o644;
    parts.push(tarHeader(archivePath, { mode, size: bytes.length, type: "0" }), bytes);
    const padding = (512 - (bytes.length % 512)) % 512;
    if (padding) parts.push(Buffer.alloc(padding, 0));
  }
  parts.push(Buffer.alloc(1024, 0));
  return Buffer.concat(parts);
}

export function createDeploymentAttestation({ outputRoot, repositoryRoot, evidenceDirectory, sourceProvenance = null }) {
  const root = realpathSync(outputRoot);
  const repository = realpathSync(repositoryRoot);
  const evidence = path.resolve(evidenceDirectory);
  mkdirSync(evidence, { recursive: true });
  const attestationPath = path.join(root, ATTESTATION_OUTPUT_PATH);
  rmSync(attestationPath, { force: true });
  const normalization = normalizeGeneratedOutput({ outputRoot: root, checkoutRoot: repository });
  const provenance = sourceProvenance ?? deriveSourceProvenance({ repositoryRoot: repository });
  const outputManifest = buildOutputManifest(root);
  const body = {
    documentType: "clover-tree-deployment-attestation",
    schemaVersion: "0.2.0",
    buildInvocationId: provenance.buildInvocationId,
    source: {
      commit: provenance.commit,
      tree: provenance.tree,
      parent: provenance.parent,
      stackABase: provenance.stackABase,
      changedPathCount: provenance.changedPathCount,
      pathListSha256: provenance.pathListSha256,
      sourceManifestSha256: provenance.sourceManifestSha256,
      packageLockSha256: provenance.packageLockSha256,
      treeProgramIndexId: provenance.treeProgramIndexId,
      treeProgramIndexHash: provenance.treeProgramIndexHash,
      nodeVersion: provenance.nodeVersion,
      nextVersion: provenance.nextVersion,
      buildMode: provenance.buildMode
    },
    output: {
      manifestRootSha256: outputManifest.rootSha256,
      regularFileCount: outputManifest.regularFileCount,
      symlinkCount: outputManifest.symlinkCount,
      aggregateRegularFileBytes: outputManifest.aggregateRegularFileBytes,
      attestationExcludedPath: ATTESTATION_OUTPUT_PATH
    },
    normalization,
    publicSanitized: true,
    privateDataAccessed: false,
    secretsIncluded: false,
    consequentialAuthorityGranted: false
  };
  const attestation = { ...body, attestationHash: sha256(`${canonicalJson(body)}\n`) };
  mkdirSync(path.dirname(attestationPath), { recursive: true });
  writeFileSync(attestationPath, `${canonicalJson(attestation)}\n`, { mode: 0o644 });
  const finalEntries = walk(root);
  const finalPaths = new Set(finalEntries.map(({ path: outputPath }) => outputPath.normalize("NFC")));
  if (finalPaths.size !== finalEntries.length || !finalPaths.has(ATTESTATION_OUTPUT_PATH)) throw new Error("CLOVER_FINAL_OUTPUT_STRUCTURE_REJECTED");
  for (const entry of finalEntries.filter(({ type }) => type === "file")) assertPublicOutputFile(entry, readFileSync(entry.absolutePath));

  const manifestPath = path.join(evidence, "clover-build-output-manifest.json");
  writeFileSync(manifestPath, `${canonicalJson(outputManifest)}\n`, { mode: 0o644 });
  const archive = deterministicOutputArchive(root);
  const archivePath = path.join(evidence, "clover-build-output.tar");
  writeFileSync(archivePath, archive, { mode: 0o644 });
  chmodSync(archivePath, 0o644);
  return {
    attestation,
    attestationPath,
    attestationRawSha256: sha256(readFileSync(attestationPath)),
    outputManifest,
    manifestPath,
    manifestRawSha256: sha256(readFileSync(manifestPath)),
    archivePath,
    archiveSha256: sha256(archive),
    archiveBytes: archive.length
  };
}

function parseArguments(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error("CLOVER_ATTESTATION_ARGUMENT_REJECTED");
    options[key.slice(2)] = value;
  }
  return options;
}

function main() {
  const [command, ...argumentsList] = process.argv.slice(2);
  const options = parseArguments(argumentsList);
  const repositoryRoot = path.resolve(options["repository-root"] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.."));
  if (command === "source") {
    process.stdout.write(`${canonicalJson(deriveSourceProvenance({ repositoryRoot }))}\n`);
    return;
  }
  if (command === "output") {
    if (!options.output || !options.evidence) throw new Error("output and evidence paths are required");
    const result = createDeploymentAttestation({
      outputRoot: path.resolve(options.output),
      repositoryRoot,
      evidenceDirectory: path.resolve(options.evidence)
    });
    process.stdout.write(`${canonicalJson({
      attestationHash: result.attestation.attestationHash,
      attestationRawSha256: result.attestationRawSha256,
      outputManifestRootSha256: result.outputManifest.rootSha256,
      manifestRawSha256: result.manifestRawSha256,
      archiveSha256: result.archiveSha256,
      archiveBytes: result.archiveBytes
    })}\n`);
    return;
  }
  throw new Error("usage: clover-deployment-attestation.mjs <source|output> [options]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
