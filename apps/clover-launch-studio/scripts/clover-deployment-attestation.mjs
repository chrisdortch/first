import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const STACK_A_BASE = "be45c4991a63e7e4ac6ca55a1e612f8bbe4fe5cb";
export const TREE_INDEX_PATH = "portfolio/core/tree-program/index.json";
export const LOCKFILE_PATH = "apps/clover-launch-studio/package-lock.json";
export const PACKAGE_PATH = "apps/clover-launch-studio/package.json";
export const ATTESTATION_OUTPUT_PATH = "static/__clover/deployment-attestation.json";
export const PAYLOAD_MANIFEST_FILE = "clover-build-output-manifest.json";
export const DEPLOYMENT_INPUT_MANIFEST_FILE = "clover-deployment-input-manifest.json";
export const FINAL_ARCHIVE_FILE = "clover-final-deployment-input.tar";
export const FINAL_ARCHIVE_MANIFEST_FILE = "clover-final-archive-manifest.json";
export const PROVIDER_RECEIPT_FILE = "clover-provider-deployment-receipt.json";
export const VERCEL_PROJECT_ID = "prj_1lfjYV2FehNxEyW9hGqNwAe7a8xZ";
export const VERCEL_TEAM_ID = "team_kx19aCrSTnej6wpz0fLgmYDY";
export const VERCEL_PROJECT_NAME = "clover-tree-command-center";
export const VERCEL_PROJECT_FRAMEWORK = "nextjs";
export const VERCEL_TEAM_NAME = "Chris Dortch's projects";
export const VERCEL_TEAM_SLUG = "chris-dortchs-projects";
export const VERCEL_PROJECT_UPDATED_AT = 1_787_944_731_108;
export const VERCEL_PROJECT_CREATED_AT = 1_787_779_265_245;
export const VERCEL_CLI_VERSION = "59.6.2";
export const VERCEL_CLI_INTEGRITY = "sha512-lChRklfQeumAGYSMiur5DUbUNFMxvuaoaAffOeO/BcDEgp1hOzq3wo6fejsOWcMcCewibl4OsfP9LM27xb3PzQ==";
export const VERCEL_BUILD_COMMAND = `npx --yes vercel@${VERCEL_CLI_VERSION} build --yes`;
const RUNTIME_ROOT = "/var/task";
const MAX_PROVIDER_RESPONSE_PROJECTION_BYTES = 32 * 1024 * 1024;
const PROVIDER_REQUEST_EVIDENCE_SCHEMA = "clover-vercel-provider-request-evidence-v0.2";
const PROVIDER_REQUEST_PROJECTION_HASH_DOMAIN = "canonical-public-sanitized-json-v1";
const PROVIDER_RESPONSE_PROJECTION_HASH_DOMAIN = "canonical-sanitized-json-v1";
const MAX_PROVIDER_REQUEST_DURATION_MS = 30 * 60_000;
const PROVIDER_CREATED_AT_CLOCK_SKEW_MS = 60_000;
const NO_PROVIDER_REQUEST_BODY = Object.freeze({ body: null });

export function deriveRuntimeDeploymentKey(commit) {
  assertHex(commit, 40, "source commit");
  const deploymentKey = `clover-${commit.slice(0, 24)}`;
  if (deploymentKey.length > 32 || !/^[A-Za-z0-9-]+$/u.test(deploymentKey) || deploymentKey.startsWith("dpl_")) {
    throw new Error("CLOVER_RUNTIME_DEPLOYMENT_KEY_REJECTED");
  }
  return deploymentKey;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sha1 = (value) => createHash("sha1").update(value).digest("hex");

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

export const canonicalJson = (value) => JSON.stringify(canonicalValue(value));

function decodeUtf8Fatal(value, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    throw new Error(`${label}_INVALID_UTF8`);
  }
}

function parseJsonWithoutDuplicateKeys(source, label) {
  let offset = 0;
  const reject = () => { throw new Error(`${label}_REJECTED`); };
  const whitespace = () => { while (/[\u0009\u000a\u000d\u0020]/u.test(source[offset] ?? "")) offset += 1; };
  const parseString = () => {
    if (source[offset] !== '"') reject();
    const start = offset;
    offset += 1;
    while (offset < source.length) {
      const character = source[offset];
      if (character.charCodeAt(0) < 0x20) reject();
      if (character === '"') {
        offset += 1;
        try { return JSON.parse(source.slice(start, offset)); } catch { reject(); }
      }
      if (character === "\\") {
        offset += 2;
        continue;
      }
      offset += 1;
    }
    reject();
  };
  const parseValue = () => {
    whitespace();
    const character = source[offset];
    if (character === '"') return parseString();
    if (character === "{") {
      offset += 1;
      whitespace();
      const object = Object.create(null);
      const seen = new Set();
      if (source[offset] === "}") { offset += 1; return object; }
      while (offset < source.length) {
        const key = parseString();
        if (seen.has(key)) reject();
        seen.add(key);
        whitespace();
        if (source[offset] !== ":") reject();
        offset += 1;
        object[key] = parseValue();
        whitespace();
        if (source[offset] === "}") { offset += 1; return object; }
        if (source[offset] !== ",") reject();
        offset += 1;
        whitespace();
      }
      reject();
    }
    if (character === "[") {
      offset += 1;
      whitespace();
      const array = [];
      if (source[offset] === "]") { offset += 1; return array; }
      while (offset < source.length) {
        array.push(parseValue());
        whitespace();
        if (source[offset] === "]") { offset += 1; return array; }
        if (source[offset] !== ",") reject();
        offset += 1;
      }
      reject();
    }
    for (const [literal, value] of [["true", true], ["false", false], ["null", null]]) {
      if (source.startsWith(literal, offset)) { offset += literal.length; return value; }
    }
    const number = source.slice(offset).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u)?.[0];
    if (!number) reject();
    offset += number.length;
    const value = Number(number);
    if (!Number.isFinite(value)) reject();
    return value;
  };
  const value = parseValue();
  whitespace();
  if (offset !== source.length) reject();
  return value;
}

function parseExactJsonBytes(value, label) {
  return parseJsonWithoutDuplicateKeys(decodeUtf8Fatal(value, label), label);
}

export function canonicalVercelBuildProjectSettings() {
  return Object.freeze({
    orgId: VERCEL_TEAM_ID,
    projectId: VERCEL_PROJECT_ID,
    projectName: VERCEL_PROJECT_NAME,
    settings: Object.freeze({
      createdAt: VERCEL_PROJECT_CREATED_AT,
      framework: VERCEL_PROJECT_FRAMEWORK,
      devCommand: null,
      installCommand: "npm ci",
      buildCommand: "npm run build",
      outputDirectory: ".next",
      rootDirectory: "apps/clover-launch-studio",
      directoryListing: false,
      nodeVersion: "24.x"
    })
  });
}

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

function exactSourcePath(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.normalize("NFC") ||
    value === "." ||
    value.startsWith("/") ||
    value.includes("\\") ||
    /\0|\r|\n/u.test(value) ||
    path.posix.normalize(value) !== value ||
    value.split("/").includes("..")
  ) throw new Error(`unsafe source path: ${value}`);
  return value;
}

function sourceObject(repositoryRoot, revision, sourcePath) {
  exactSourcePath(sourcePath);
  const listing = git(repositoryRoot, ["ls-tree", "-z", revision, "--", sourcePath], { encoding: null });
  if (listing.length < 2 || listing[listing.length - 1] !== 0) {
    throw new Error(`source path is not one exact tracked blob: ${sourcePath}`);
  }
  const records = decodeUtf8Fatal(listing.subarray(0, -1), "CLOVER_SOURCE_TREE_LISTING").split("\0");
  const match = /^(\d{6}) blob ([0-9a-f]{40})\t([\s\S]+)$/u.exec(records[0] ?? "");
  if (records.length !== 1 || !match || match[3] !== sourcePath) {
    throw new Error(`source path is not one exact tracked blob: ${sourcePath}`);
  }
  const bytes = git(repositoryRoot, ["cat-file", "blob", match[2]], { encoding: null });
  return { path: sourcePath, mode: match[1], blob: match[2], bytes: bytes.length, sha256: sha256(bytes) };
}

function sourceBytes(repositoryRoot, revision, sourcePath) {
  const identity = sourceObject(repositoryRoot, revision, sourcePath);
  return git(repositoryRoot, ["cat-file", "blob", identity.blob], { encoding: null });
}

export function parseSourceChanges(value) {
  const bytes = Buffer.from(value);
  const text = decodeUtf8Fatal(bytes, "CLOVER_SOURCE_DIFF");
  if (text === "") return [];
  const fields = text.split("\0");
  if (fields.pop() !== "") throw new Error("CLOVER_SOURCE_DIFF_INVALID");
  const changes = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    const scored = /^(?:R|C)(\d{3})$/u.exec(status);
    const single = /^(?:A|M|T|D)$/u.test(status);
    if ((!single && !scored) || (scored && Number(scored[1]) > 100)) throw new Error(`CLOVER_SOURCE_STATUS_REJECTED:${status}`);
    if (scored) {
      const basePath = exactSourcePath(fields[index++]);
      const currentPath = exactSourcePath(fields[index++]);
      if (basePath === currentPath) throw new Error(`CLOVER_SOURCE_PATH_SUBSTITUTION_REJECTED:${currentPath}`);
      changes.push({ status, path: currentPath, previousPath: basePath, basePath, currentPath });
      continue;
    }
    const sourcePath = exactSourcePath(fields[index++]);
    changes.push({
      status,
      path: sourcePath,
      previousPath: null,
      basePath: status === "A" ? null : sourcePath,
      currentPath: status === "D" ? null : sourcePath
    });
  }
  const effectivePaths = changes.map(({ path: sourcePath }) => sourcePath);
  if (new Set(effectivePaths).size !== effectivePaths.length) throw new Error("CLOVER_SOURCE_PATH_LIST_INVALID");
  return changes;
}

export function deriveSourceManifestEntries({ repositoryRoot, stackABase = STACK_A_BASE, candidateCommit = "HEAD" } = {}) {
  if (!repositoryRoot) throw new Error("repositoryRoot is required");
  const root = realpathSync(repositoryRoot);
  assertHex(stackABase, 40, "Stack A base");
  const exactCandidateCommit = candidateCommit === "HEAD" ? git(root, ["rev-parse", "HEAD"]).trim() : candidateCommit;
  assertHex(exactCandidateCommit, 40, "candidate commit");
  const changes = parseSourceChanges(git(root, [
    "diff",
    "--name-status",
    "--no-renames",
    "--diff-filter=ACMRTD",
    "-z",
    `${stackABase}..${exactCandidateCommit}`
  ], { encoding: null }));
  return changes.map(({ status, path: sourcePath, basePath, currentPath }) => {
    if (status === "D") {
      if (basePath === null || currentPath !== null) throw new Error(`CLOVER_SOURCE_DELETION_IDENTITY_REJECTED:${sourcePath}`);
      return {
        path: sourcePath,
        status: "D",
        base: sourceObject(root, stackABase, basePath),
        current: null
      };
    }
    if (currentPath === null) throw new Error(`CLOVER_SOURCE_CURRENT_IDENTITY_REJECTED:${sourcePath}`);
    return sourceObject(root, exactCandidateCommit, currentPath);
  }).sort((left, right) => Buffer.compare(Buffer.from(left.path, "utf8"), Buffer.from(right.path, "utf8")));
}

export function deriveSourceProvenance({ repositoryRoot, stackABase = STACK_A_BASE } = {}) {
  if (!repositoryRoot) throw new Error("repositoryRoot is required");
  const root = realpathSync(repositoryRoot);
  assertHex(stackABase, 40, "Stack A base");
  const status = git(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status !== "") throw new Error("CLOVER_DIRTY_SOURCE_REJECTED");

  const commit = git(root, ["rev-parse", "HEAD"]).trim();
  assertHex(commit, 40, "commit");
  try {
    git(root, ["merge-base", "--is-ancestor", stackABase, commit]);
  } catch {
    throw new Error("CLOVER_STACK_A_ANCESTRY_REJECTED");
  }

  const tree = git(root, ["rev-parse", `${commit}^{tree}`]).trim();
  const parent = git(root, ["rev-parse", `${commit}^`]).trim();
  for (const [label, value] of [["tree", tree], ["parent", parent]]) assertHex(value, 40, label);

  const entries = deriveSourceManifestEntries({ repositoryRoot: root, stackABase, candidateCommit: commit });
  const paths = entries.map(({ path: sourcePath }) => sourcePath);
  if (paths.length === 0 || new Set(paths).size !== paths.length) throw new Error("CLOVER_SOURCE_PATH_LIST_INVALID");
  const pathList = `${paths.join("\n")}\n`;
  const packageDocument = parseExactJsonBytes(sourceBytes(root, commit, PACKAGE_PATH), "CLOVER_SOURCE_PACKAGE_JSON");
  const treeIndexBytes = sourceBytes(root, commit, TREE_INDEX_PATH);
  const treeIndex = parseExactJsonBytes(treeIndexBytes, "CLOVER_SOURCE_TREE_INDEX_JSON");
  const lockfileBytes = sourceBytes(root, commit, LOCKFILE_PATH);

  const source = {
    commit,
    tree,
    parent,
    stackABase,
    runtimeDeploymentKey: deriveRuntimeDeploymentKey(commit),
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
    buildOutputCommand: VERCEL_BUILD_COMMAND,
    buildOutputToolPackage: "vercel",
    buildOutputToolVersion: VERCEL_CLI_VERSION,
    buildOutputToolIntegrity: VERCEL_CLI_INTEGRITY,
    buildProjectSettingsSha256: sha256(`${canonicalJson(canonicalVercelBuildProjectSettings())}\n`)
  };
  for (const key of ["pathListSha256", "sourceManifestSha256", "packageLockSha256", "treeProgramIndexHash", "treeProgramIndexRawSha256", "buildProjectSettingsSha256"]) {
    assertHex(source[key], 64, key);
  }
  if (!/^v(?:22|24)\./u.test(source.nodeVersion) || typeof source.nextVersion !== "string") {
    throw new Error("CLOVER_BUILD_RUNTIME_IDENTITY_REJECTED");
  }
  if (git(root, ["rev-parse", "HEAD"]).trim() !== commit || git(root, ["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    throw new Error("CLOVER_SOURCE_CHANGED_DURING_ATTESTATION");
  }
  return Object.freeze({
    documentType: "clover-tree-build-provenance",
    schemaVersion: "0.3.0",
    ...source,
    buildInvocationId: `clover-build:${sha256(`${canonicalJson(source)}\n`)}`,
    publicSanitized: true,
    privateDataAccessed: false,
    consequentialAuthorityGranted: false
  });
}

export function deriveSourceManifestDocument({ repositoryRoot, stackABase = STACK_A_BASE } = {}) {
  const root = realpathSync(repositoryRoot);
  const commit = git(root, ["rev-parse", "HEAD"]).trim();
  const entries = deriveSourceManifestEntries({ repositoryRoot: root, stackABase, candidateCommit: commit });
  const paths = entries.map(({ path: sourcePath }) => sourcePath);
  const body = {
    documentType: "clover-tree-source-manifest",
    schemaVersion: "0.4.0",
    sourceCommit: commit,
    stackABase,
    entries,
    pathCount: paths.length,
    pathListSha256: sha256(`${paths.join("\n")}\n`),
    sourceManifestSha256: sha256(`${canonicalJson(entries)}\n`)
  };
  return Object.freeze({ ...body, manifestSelfHash: sha256(`${canonicalJson(body)}\n`) });
}

function walk(root, directory = root, accumulator = []) {
  for (const name of readdirSync(directory).sort()) {
    const absolutePath = path.join(directory, name);
    const stat = lstatSync(absolutePath);
    const outputPath = path.relative(root, absolutePath).split(path.sep).join("/");
    try { exactSourcePath(outputPath); } catch { throw new Error(`CLOVER_OUTPUT_PATH_REJECTED:${outputPath}`); }
    if (stat.isDirectory()) walk(root, absolutePath, accumulator);
    else if (stat.isFile()) accumulator.push({ type: "file", path: outputPath, absolutePath, stat });
    else if (stat.isSymbolicLink()) accumulator.push({ type: "symlink", path: outputPath, absolutePath, stat, target: readlinkSync(absolutePath) });
    else throw new Error(`CLOVER_OUTPUT_ENTRY_TYPE_REJECTED:${outputPath}`);
  }
  return accumulator;
}

function requireInternalRegularFile(root, relativePath, label) {
  const safePath = exactSourcePath(relativePath);
  const candidate = path.join(root, ...safePath.split("/"));
  const stat = lstatSync(candidate);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o7777) !== 0o644) throw new Error(`${label}_REJECTED`);
  const resolved = realpathSync(candidate);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error(`${label}_REJECTED`);
  return candidate;
}

function ensureInternalDirectory(root, relativePath) {
  const safePath = exactSourcePath(relativePath);
  let current = root;
  for (const segment of safePath.split("/")) {
    current = path.join(current, segment);
    if (!existsSync(current)) mkdirSync(current, { mode: 0o755 });
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`CLOVER_OUTPUT_DIRECTORY_REJECTED:${relativePath}`);
    const resolved = realpathSync(current);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`CLOVER_OUTPUT_DIRECTORY_REJECTED:${relativePath}`);
  }
  return current;
}

function validateInternalDirectoryChain(root, relativePath) {
  const safePath = exactSourcePath(relativePath);
  let current = root;
  for (const segment of safePath.split("/")) {
    current = path.join(current, segment);
    if (!existsSync(current)) return;
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`CLOVER_OUTPUT_DIRECTORY_REJECTED:${relativePath}`);
    const resolved = realpathSync(current);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`CLOVER_OUTPUT_DIRECTORY_REJECTED:${relativePath}`);
  }
}

function validateFreshExternalDirectoryPath(candidatePath, excludedRoot, label) {
  const candidate = path.resolve(candidatePath);
  const exclusions = (Array.isArray(excludedRoot) ? excludedRoot : [excludedRoot]).map((value) => path.resolve(value));
  if (exclusions.some((excluded) => candidate === excluded || candidate.startsWith(`${excluded}${path.sep}`) || excluded.startsWith(`${candidate}${path.sep}`)) || existsSync(candidate)) throw new Error(`${label}_REJECTED`);
  const parent = path.dirname(candidate);
  const parentStat = lstatSync(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) throw new Error(`${label}_REJECTED`);
  const resolvedParent = realpathSync(parent);
  if (exclusions.some((excluded) => resolvedParent === excluded || resolvedParent.startsWith(`${excluded}${path.sep}`))) throw new Error(`${label}_REJECTED`);
  return path.join(resolvedParent, path.basename(candidate));
}

function createFreshExternalDirectory(candidatePath, excludedRoot, label) {
  const candidate = validateFreshExternalDirectoryPath(candidatePath, excludedRoot, label);
  mkdirSync(candidate, { mode: 0o755 });
  return realpathSync(candidate);
}

function requireFreshExternalFilePath(candidatePath, excludedRoot, label) {
  const candidate = path.resolve(candidatePath);
  if (candidate === excludedRoot || candidate.startsWith(`${excludedRoot}${path.sep}`) || excludedRoot.startsWith(`${candidate}${path.sep}`) || existsSync(candidate)) throw new Error(`${label}_REJECTED`);
  const parent = path.dirname(candidate);
  const parentStat = lstatSync(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) throw new Error(`${label}_REJECTED`);
  const resolvedParent = realpathSync(parent);
  if (resolvedParent === excludedRoot || resolvedParent.startsWith(`${excludedRoot}${path.sep}`)) throw new Error(`${label}_REJECTED`);
  return path.join(resolvedParent, path.basename(candidate));
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
  return parseJsonWithoutDuplicateKeys(text.slice(start + "const conf = ".length, end), `CLOVER_LAUNCHER_CONFIG:${label}`);
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

function requireCanonicalAbsolutePath(value, label) {
  if (
    typeof value !== "string" ||
    !path.isAbsolute(value) ||
    value !== value.normalize("NFC") ||
    /\0|\r|\n/u.test(value) ||
    path.normalize(value) !== value ||
    path.resolve(value) !== value
  ) throw new Error(`${label}_REJECTED`);
  return value;
}

function closedLstat(candidate, label) {
  try {
    return lstatSync(candidate);
  } catch {
    throw new Error(`${label}_REJECTED`);
  }
}

function requireCanonicalRealDirectory(candidate, label) {
  const stat = closedLstat(candidate, label);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label}_REJECTED`);
  let resolved;
  try { resolved = realpathSync(candidate); } catch { throw new Error(`${label}_REJECTED`); }
  if (resolved !== candidate) throw new Error(`${label}_REJECTED`);
  return candidate;
}

function requireCanonicalRegularFile(candidate, label) {
  const stat = closedLstat(candidate, label);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label}_REJECTED`);
  let resolved;
  try { resolved = realpathSync(candidate); } catch { throw new Error(`${label}_REJECTED`); }
  if (resolved !== candidate) throw new Error(`${label}_REJECTED`);
  return candidate;
}

export function requireExactVercelCliInvocation(builds) {
  if (!builds || typeof builds !== "object" || Array.isArray(builds)) throw new Error("CLOVER_VERCEL_BUILD_INVOCATION_REJECTED");
  if (builds.target !== "preview") throw new Error("CLOVER_VERCEL_BUILD_TARGET_REJECTED");
  if (builds.cliVersion !== VERCEL_CLI_VERSION) throw new Error("CLOVER_VERCEL_BUILD_CLI_VERSION_REJECTED");
  if (!Array.isArray(builds.argv) || builds.argv.length !== 4) throw new Error("CLOVER_VERCEL_BUILD_INVOCATION_REJECTED");
  if (builds.argv[2] !== "build" || builds.argv[3] !== "--yes") throw new Error("CLOVER_VERCEL_BUILD_ARGUMENTS_REJECTED");
  const [rawNodeExecutable, rawCliExecutable] = builds.argv;
  const nodeExecutable = requireCanonicalAbsolutePath(rawNodeExecutable, "CLOVER_VERCEL_BUILD_NODE_EXECUTABLE");
  if (nodeExecutable !== process.execPath) throw new Error("CLOVER_VERCEL_BUILD_NODE_EXECUTABLE_REJECTED");
  requireCanonicalRegularFile(nodeExecutable, "CLOVER_VERCEL_BUILD_NODE_EXECUTABLE");
  requireCanonicalAbsolutePath(rawCliExecutable, "CLOVER_VERCEL_BUILD_RAW_CLI_PATH");

  const pathRoot = path.parse(rawCliExecutable).root;
  const rawSegments = rawCliExecutable.slice(pathRoot.length).split(path.sep);
  const nodeModulesIndexes = rawSegments.flatMap((segment, index) => segment === "node_modules" ? [index] : []);
  if (nodeModulesIndexes.length !== 1) throw new Error("CLOVER_VERCEL_BUILD_LAUNCHER_LOCATION_REJECTED");
  const nodeModulesIndex = nodeModulesIndexes[0];
  const installRoot = path.join(pathRoot, ...rawSegments.slice(0, nodeModulesIndex));
  const launcherSegments = rawSegments.slice(nodeModulesIndex);
  let launcherKind;
  if (canonicalJson(launcherSegments) === canonicalJson(["node_modules", "vercel", "dist", "vc.js"])) launcherKind = "direct";
  else if (launcherSegments.length === 3 && launcherSegments[0] === "node_modules" && launcherSegments[1] === ".bin") {
    if (launcherSegments[2] === "vc") launcherKind = "npm-bin-vc";
    else if (launcherSegments[2] === "vercel") launcherKind = "npm-bin-vercel";
    else throw new Error("CLOVER_VERCEL_BUILD_LAUNCHER_NAME_REJECTED");
  } else throw new Error("CLOVER_VERCEL_BUILD_LAUNCHER_LOCATION_REJECTED");
  if (!installRoot || installRoot === path.parse(installRoot).root) throw new Error("CLOVER_VERCEL_BUILD_INSTALL_ROOT_REJECTED");
  requireCanonicalAbsolutePath(installRoot, "CLOVER_VERCEL_BUILD_INSTALL_ROOT");
  requireCanonicalRealDirectory(installRoot, "CLOVER_VERCEL_BUILD_INSTALL_ROOT");

  const nodeModulesRoot = path.join(installRoot, "node_modules");
  requireCanonicalRealDirectory(nodeModulesRoot, "CLOVER_VERCEL_BUILD_NODE_MODULES");
  const packageRoot = path.join(installRoot, "node_modules", "vercel");
  requireCanonicalRealDirectory(packageRoot, "CLOVER_VERCEL_BUILD_PACKAGE_ROOT");
  const packagePath = path.join(packageRoot, "package.json");
  const lockPath = path.join(installRoot, "package-lock.json");
  requireCanonicalRegularFile(packagePath, "CLOVER_VERCEL_BUILD_PACKAGE_FILE");
  requireCanonicalRegularFile(lockPath, "CLOVER_VERCEL_BUILD_LOCK_FILE");
  const expectedExecutable = path.join(packageRoot, "dist", "vc.js");
  if (launcherKind === "direct") {
    if (rawCliExecutable !== expectedExecutable) throw new Error("CLOVER_VERCEL_BUILD_DIRECT_EXECUTABLE_REJECTED");
    const rawStat = closedLstat(rawCliExecutable, "CLOVER_VERCEL_BUILD_DIRECT_EXECUTABLE");
    if (rawStat.isSymbolicLink()) throw new Error("CLOVER_VERCEL_BUILD_DIRECT_EXECUTABLE_SYMLINK_REJECTED");
    if (!rawStat.isFile()) throw new Error("CLOVER_VERCEL_BUILD_DIRECT_EXECUTABLE_REJECTED");
  } else {
    const aliasName = launcherKind === "npm-bin-vc" ? "vc" : "vercel";
    requireCanonicalRealDirectory(path.join(nodeModulesRoot, ".bin"), "CLOVER_VERCEL_BUILD_ALIAS_DIRECTORY");
    if (path.basename(rawCliExecutable) !== aliasName || path.dirname(rawCliExecutable) !== path.join(nodeModulesRoot, ".bin")) {
      throw new Error("CLOVER_VERCEL_BUILD_ALIAS_LOCATION_REJECTED");
    }
    const aliasStat = closedLstat(rawCliExecutable, "CLOVER_VERCEL_BUILD_ALIAS");
    if (!aliasStat.isSymbolicLink()) throw new Error("CLOVER_VERCEL_BUILD_ALIAS_TYPE_REJECTED");
    let linkTarget;
    try { linkTarget = readlinkSync(rawCliExecutable); } catch { throw new Error("CLOVER_VERCEL_BUILD_ALIAS_REJECTED"); }
    if (
      typeof linkTarget !== "string" || linkTarget.length === 0 || path.isAbsolute(linkTarget) ||
      linkTarget !== linkTarget.normalize("NFC") || /\0|\r|\n/u.test(linkTarget) || path.normalize(linkTarget) !== linkTarget
    ) throw new Error("CLOVER_VERCEL_BUILD_ALIAS_TARGET_REJECTED");
    const resolvedLinkTarget = path.resolve(path.dirname(rawCliExecutable), linkTarget);
    if (resolvedLinkTarget !== expectedExecutable) {
      const relativeToInstallRoot = path.relative(installRoot, resolvedLinkTarget);
      if (path.isAbsolute(relativeToInstallRoot) || relativeToInstallRoot === ".." || relativeToInstallRoot.startsWith(`..${path.sep}`)) {
        throw new Error("CLOVER_VERCEL_BUILD_ALIAS_ESCAPE_REJECTED");
      }
      throw new Error("CLOVER_VERCEL_BUILD_ALIAS_TARGET_REJECTED");
    }
    if (!existsSync(resolvedLinkTarget)) throw new Error("CLOVER_VERCEL_BUILD_ALIAS_BROKEN_REJECTED");
  }

  const executableStat = closedLstat(expectedExecutable, "CLOVER_VERCEL_BUILD_CANONICAL_EXECUTABLE");
  if (executableStat.isSymbolicLink()) {
    throw new Error(launcherKind === "direct"
      ? "CLOVER_VERCEL_BUILD_DIRECT_EXECUTABLE_SYMLINK_REJECTED"
      : "CLOVER_VERCEL_BUILD_ALIAS_CHAIN_REJECTED");
  }
  if (!executableStat.isFile()) throw new Error("CLOVER_VERCEL_BUILD_CANONICAL_EXECUTABLE_REJECTED");
  let canonicalCliExecutable;
  try { canonicalCliExecutable = realpathSync(expectedExecutable); } catch { throw new Error("CLOVER_VERCEL_BUILD_CANONICAL_EXECUTABLE_REJECTED"); }
  if (canonicalCliExecutable !== expectedExecutable || !canonicalCliExecutable.startsWith(`${packageRoot}${path.sep}`)) {
    throw new Error("CLOVER_VERCEL_BUILD_CANONICAL_EXECUTABLE_REJECTED");
  }

  const packageDocument = parseExactJsonBytes(readFileSync(packagePath), "CLOVER_VERCEL_BUILD_TOOL_PACKAGE_JSON");
  const lockDocument = parseExactJsonBytes(readFileSync(lockPath), "CLOVER_VERCEL_BUILD_TOOL_LOCK_JSON");
  if (packageDocument.name !== "vercel") throw new Error("CLOVER_VERCEL_BUILD_PACKAGE_NAME_REJECTED");
  if (packageDocument.version !== VERCEL_CLI_VERSION) throw new Error("CLOVER_VERCEL_BUILD_PACKAGE_VERSION_REJECTED");
  if (!packageDocument.bin || typeof packageDocument.bin !== "object" || Array.isArray(packageDocument.bin)
      || packageDocument.bin.vercel !== "./dist/vc.js") {
    throw new Error("CLOVER_VERCEL_BUILD_PACKAGE_BIN_REJECTED");
  }
  const invokedAlias = launcherKind === "npm-bin-vc" ? "vc" : launcherKind === "npm-bin-vercel" ? "vercel" : null;
  if (invokedAlias !== null && packageDocument.bin[invokedAlias] !== "./dist/vc.js") {
    throw new Error("CLOVER_VERCEL_BUILD_ALIAS_METADATA_REJECTED");
  }
  if (!lockDocument.packages || typeof lockDocument.packages !== "object" || Array.isArray(lockDocument.packages)
      || !Object.hasOwn(lockDocument.packages, "node_modules/vercel")) {
    throw new Error("CLOVER_VERCEL_BUILD_LOCK_ENTRY_REJECTED");
  }
  const lockEntry = lockDocument.packages["node_modules/vercel"];
  if (!lockEntry || typeof lockEntry !== "object" || Array.isArray(lockEntry)) throw new Error("CLOVER_VERCEL_BUILD_LOCK_ENTRY_REJECTED");
  if (lockEntry.version !== VERCEL_CLI_VERSION) throw new Error("CLOVER_VERCEL_BUILD_LOCK_VERSION_REJECTED");
  if (lockEntry.integrity !== VERCEL_CLI_INTEGRITY) throw new Error("CLOVER_VERCEL_BUILD_LOCK_INTEGRITY_REJECTED");
  let resolvedRawCliExecutable;
  try { resolvedRawCliExecutable = realpathSync(rawCliExecutable); } catch { throw new Error("CLOVER_VERCEL_BUILD_LAUNCHER_RESOLUTION_REJECTED"); }
  if (resolvedRawCliExecutable !== canonicalCliExecutable) throw new Error("CLOVER_VERCEL_BUILD_LAUNCHER_RESOLUTION_REJECTED");
  return Object.freeze({
    nodeExecutable,
    rawCliExecutable,
    canonicalCliExecutable,
    launcherKind,
    installRoot,
    packageRoot,
    packageVersion: packageDocument.version,
    packageIntegrityVerified: true
  });
}

export function normalizeGeneratedOutput({ outputRoot, checkoutRoot }) {
  const root = realpathSync(outputRoot);
  const sourceRoot = realpathSync(checkoutRoot);
  const buildsPath = requireInternalRegularFile(root, "builds.json", "CLOVER_BUILDS_FILE");
  const builds = parseExactJsonBytes(readFileSync(buildsPath), "CLOVER_BUILDS_JSON");
  if (builds.target !== "preview" || builds.error || builds.builds?.some((build) => build.error)) {
    throw new Error("CLOVER_NONPREVIEW_BUILD_OUTPUT_REJECTED");
  }
  const cliInvocation = requireExactVercelCliInvocation(builds);
  const { nodeExecutable, rawCliExecutable, canonicalCliExecutable, installRoot: cliRoot } = cliInvocation;
  const metadataReplacements = [
    { needle: sourceRoot, replacement: RUNTIME_ROOT },
    { needle: rawCliExecutable, replacement: replaceExact(rawCliExecutable, [{ needle: cliRoot, replacement: `${RUNTIME_ROOT}/.vercel-cli` }]) },
    { needle: canonicalCliExecutable, replacement: replaceExact(canonicalCliExecutable, [{ needle: cliRoot, replacement: `${RUNTIME_ROOT}/.vercel-cli` }]) },
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
    const beforeText = decodeUtf8Fatal(beforeBytes, `CLOVER_NORMALIZATION:${entry.path}`);
    if (isMetadata) parseJsonWithoutDuplicateKeys(beforeText, `CLOVER_NORMALIZATION_JSON:${entry.path}`);
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
    if (isMetadata) parseJsonWithoutDuplicateKeys(afterText, `CLOVER_NORMALIZATION_JSON:${entry.path}`);
    const afterBytes = Buffer.from(afterText, "utf8");
    writeFileSync(entry.absolutePath, afterBytes, { mode: entry.stat.mode & 0o777 });
    normalized.push({
      path: entry.path,
      classification: isLauncher ? "next-launcher-runtime-root" : "vercel-cli-metadata-root",
      beforeSha256: sha256(beforeBytes),
      afterSha256: sha256(afterBytes)
    });
  }
  for (const entry of walk(root).filter(({ type }) => type === "file")) {
    assertPublicOutputFile(entry, readFileSync(entry.absolutePath), [sourceRoot, cliRoot, nodeExecutable]);
  }
  const sanitizedCliInvocation = Object.freeze({
    rawCliExecutable: replaceExact(rawCliExecutable, metadataReplacements),
    canonicalCliExecutable: replaceExact(canonicalCliExecutable, metadataReplacements),
    launcherKind: cliInvocation.launcherKind,
    installRoot: replaceExact(cliInvocation.installRoot, metadataReplacements),
    packageRoot: replaceExact(cliInvocation.packageRoot, metadataReplacements),
    packageVersion: cliInvocation.packageVersion,
    packageIntegrityVerified: cliInvocation.packageIntegrityVerified
  });
  if (
    !sanitizedCliInvocation.rawCliExecutable.startsWith(`${RUNTIME_ROOT}/.vercel-cli/`) ||
    sanitizedCliInvocation.canonicalCliExecutable !== `${RUNTIME_ROOT}/.vercel-cli/node_modules/vercel/dist/vc.js` ||
    sanitizedCliInvocation.installRoot !== `${RUNTIME_ROOT}/.vercel-cli` ||
    sanitizedCliInvocation.packageRoot !== `${RUNTIME_ROOT}/.vercel-cli/node_modules/vercel`
  ) throw new Error("CLOVER_VERCEL_BUILD_SANITIZED_IDENTITY_REJECTED");
  return Object.freeze({
    normalization: normalized.sort((left, right) => compareText(left.path, right.path)),
    cliInvocation: sanitizedCliInvocation
  });
}

function snapshotNormalizableOutput(root) {
  return walk(root).filter((entry) => entry.type === "file" && (
    entry.path === "builds.json" ||
    entry.path === "diagnostics/cli_traces.json" ||
    /^functions\/.+\/apps\/clover-launch-studio\/___next_launcher\.cjs$/u.test(entry.path)
  )).map((entry) => ({ path: entry.path, bytes: readFileSync(entry.absolutePath), mode: entry.stat.mode & 0o7777 }));
}

function restoreNormalizableOutput(root, snapshot) {
  for (const entry of snapshot) {
    const target = path.join(root, ...exactSourcePath(entry.path).split("/"));
    const stat = lstatSync(target);
    const resolved = realpathSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
      throw new Error("CLOVER_NORMALIZATION_RESTORE_FILE_REJECTED");
    }
    writeFileSync(target, entry.bytes, { mode: entry.mode });
    chmodSync(target, entry.mode);
  }
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

function assertPublicOutputFile(entry, bytes, exactHostPaths = []) {
  const text = bytes.toString("utf8");
  const findings = [
    ["host-absolute-path", new RegExp("(?:/Use" + "rs/|/ho" + "me/|/pri" + "vate/(?:tmp|var/folders)/|/usr/loc" + "al/|/git" + "hub/workspace(?:/|\\b)|/work" + "space(?:/|\\b)|/tm" + "p(?:/|\\b)|/opt/hosted" + "toolcache(?:/|\\b)|[A-Za-z]:\\\\\\\\)", "u")],
    ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
    ["github-token", /\b(?:gh[oprsu]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u],
    ["openai-token", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/u],
    ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/u],
    ["aws-key", /\bAKIA[0-9A-Z]{16}\b/u],
    ["ssn", /\b\d{3}-\d{2}-\d{4}\b/u]
  ].filter(([, expression]) => expression.test(text)).map(([label]) => label);
  if (exactHostPaths.some((candidate) => typeof candidate === "string" && path.isAbsolute(candidate) && candidate !== RUNTIME_ROOT && text.includes(candidate))) findings.push("exact-host-path");
  if (containsPaymentCardCandidate(text)) findings.push("payment-card");
  if (findings.length) throw new Error(`CLOVER_PUBLIC_OUTPUT_REJECTED:${entry.path}:${findings.join(",")}`);
}

export function buildOutputManifest(outputRoot, { excludedPath = ATTESTATION_OUTPUT_PATH } = {}) {
  const root = realpathSync(outputRoot);
  if (excludedPath !== null && excludedPath !== ATTESTATION_OUTPUT_PATH) throw new Error("CLOVER_OUTPUT_EXCLUSION_REJECTED");
  const entries = walk(root).filter(({ path: outputPath }) => outputPath !== excludedPath);
  const normalizedPaths = new Set();
  const files = [];
  const symlinks = [];
  let aggregateBytes = 0;
  for (const entry of entries.sort((left, right) => compareUtf8(left.path, right.path))) {
    const normalizedPath = entry.path.normalize("NFC");
    if (normalizedPaths.has(normalizedPath)) throw new Error(`CLOVER_DUPLICATE_OUTPUT_PATH_REJECTED:${entry.path}`);
    normalizedPaths.add(normalizedPath);
    if (entry.type === "file") {
      const bytes = readFileSync(entry.absolutePath);
      assertPublicOutputFile(entry, bytes);
      const exactMode = entry.stat.mode & 0o7777;
      if (![0o644, 0o664, 0o755].includes(exactMode)) throw new Error(`CLOVER_OUTPUT_FILE_MODE_REJECTED:${entry.path}`);
      aggregateBytes += bytes.length;
      files.push({ path: entry.path, mode: exactMode.toString(8).padStart(4, "0"), bytes: bytes.length, sha256: sha256(bytes) });
      continue;
    }
    if (entry.target.length === 0 || path.isAbsolute(entry.target) || entry.target.includes("\0") || entry.target.includes("\\") || entry.target !== entry.target.normalize("NFC") || /\r|\n/u.test(entry.target)) {
      throw new Error(`CLOVER_OUTPUT_SYMLINK_REJECTED:${entry.path}`);
    }
    let resolved;
    try {
      resolved = realpathSync(entry.absolutePath);
    } catch {
      throw new Error(`CLOVER_OUTPUT_SYMLINK_REJECTED:${entry.path}`);
    }
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`CLOVER_OUTPUT_SYMLINK_REJECTED:${entry.path}`);
    const exactMode = entry.stat.mode & 0o7777;
    if (![0o755, 0o777].includes(exactMode)) throw new Error(`CLOVER_OUTPUT_SYMLINK_REJECTED:${entry.path}`);
    symlinks.push({ path: entry.path, mode: exactMode.toString(8).padStart(4, "0"), target: entry.target });
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
  buildOutputManifest(root, { excludedPath: null });
  const parts = [];
  for (const entry of walk(root).sort((left, right) => compareUtf8(left.path, right.path))) {
    const archivePath = `output/${entry.path}`;
    if (entry.type === "symlink") {
      parts.push(tarHeader(archivePath, { mode: entry.stat.mode & 0o7777, size: 0, type: "2", linkName: entry.target }));
      continue;
    }
    const bytes = readFileSync(entry.absolutePath);
    const mode = entry.stat.mode & 0o7777;
    parts.push(tarHeader(archivePath, { mode, size: bytes.length, type: "0" }), bytes);
    const padding = (512 - (bytes.length % 512)) % 512;
    if (padding) parts.push(Buffer.alloc(padding, 0));
  }
  parts.push(Buffer.alloc(1024, 0));
  return Buffer.concat(parts);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}_REJECTED`);
  const actual = Object.keys(value).sort(compareUtf8);
  const sortedExpected = [...expected].sort(compareUtf8);
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) throw new Error(`${label}_REJECTED`);
  return value;
}

function deploymentInputInventoryRoot(finalManifest) {
  const domain = {
    schemaVersion: "clover-deployment-input-root-v1",
    files: finalManifest.files,
    symlinks: finalManifest.symlinks
  };
  return sha256(`${canonicalJson(domain)}\n`);
}

export function buildDeploymentInputManifest({
  outputRoot,
  sourceProvenance,
  payloadManifest,
  attestation,
  normalization
}) {
  const root = realpathSync(outputRoot);
  const recomputedPayload = buildOutputManifest(root);
  if (canonicalJson(recomputedPayload) !== canonicalJson(payloadManifest)) throw new Error("CLOVER_PAYLOAD_MANIFEST_MUTATION_REJECTED");
  verifyLayerOneAttestation(attestation, sourceProvenance, payloadManifest);
  if (canonicalJson(normalization) !== canonicalJson(attestation.normalization)) throw new Error("CLOVER_ATTESTATION_NORMALIZATION_REJECTED");
  const attestationPath = path.join(root, ATTESTATION_OUTPUT_PATH);
  const attestationStat = lstatSync(attestationPath);
  if (!attestationStat.isFile() || attestationStat.isSymbolicLink() || (attestationStat.mode & 0o7777) !== 0o644) throw new Error("CLOVER_ATTESTATION_FILE_REJECTED");
  const attestationBytes = readFileSync(attestationPath);
  if (!Buffer.from(`${canonicalJson(attestation)}\n`, "utf8").equals(attestationBytes)) throw new Error("CLOVER_ATTESTATION_SUBSTITUTION_REJECTED");
  const finalManifest = buildOutputManifest(root, { excludedPath: null });
  const attestationEntry = finalManifest.files.find(({ path: outputPath }) => outputPath === ATTESTATION_OUTPUT_PATH);
  if (!attestationEntry || attestationEntry.sha256 !== sha256(attestationBytes) || attestationEntry.bytes !== attestationBytes.length) throw new Error("CLOVER_ATTESTATION_INVENTORY_REJECTED");
  const body = {
    documentType: "clover-tree-deployment-input-manifest",
    schemaVersion: "0.4.0",
    source: {
      commit: sourceProvenance.commit,
      tree: sourceProvenance.tree,
      sourceManifestSha256: sourceProvenance.sourceManifestSha256,
      buildInvocationId: sourceProvenance.buildInvocationId
    },
    buildInvocation: {
      buildMode: sourceProvenance.buildMode,
      buildCommand: sourceProvenance.buildCommand,
      buildOutputCommand: sourceProvenance.buildOutputCommand,
      buildOutputToolPackage: sourceProvenance.buildOutputToolPackage,
      buildOutputToolVersion: sourceProvenance.buildOutputToolVersion,
      buildOutputToolIntegrity: sourceProvenance.buildOutputToolIntegrity,
      buildProjectSettingsSha256: sourceProvenance.buildProjectSettingsSha256
    },
    payload: {
      manifestRootSha256: payloadManifest.rootSha256,
      manifestRawSha256: sha256(`${canonicalJson(payloadManifest)}\n`),
      excludedPath: ATTESTATION_OUTPUT_PATH
    },
    attestation: {
      path: ATTESTATION_OUTPUT_PATH,
      selfHash: attestation.attestationHash,
      rawSha256: sha256(attestationBytes)
    },
    normalization,
    files: finalManifest.files,
    symlinks: finalManifest.symlinks,
    finalRegularFileCount: finalManifest.regularFileCount,
    finalSymlinkCount: finalManifest.symlinkCount,
    aggregateFinalRegularFileBytes: finalManifest.aggregateRegularFileBytes,
    deploymentInputRootSha256: deploymentInputInventoryRoot(finalManifest),
    publicSanitized: true,
    privateDataAccessed: false,
    secretsIncluded: false,
    consequentialAuthorityGranted: false
  };
  return Object.freeze({ ...body, manifestSelfHash: sha256(`${canonicalJson(body)}\n`) });
}

function tarString(field, label) {
  const zero = field.indexOf(0);
  const content = zero < 0 ? field : field.subarray(0, zero);
  if (zero >= 0 && field.subarray(zero).some((byte) => byte !== 0)) throw new Error(`CLOVER_ARCHIVE_${label}_REJECTED`);
  let text;
  try { text = decodeUtf8Fatal(content, `CLOVER_ARCHIVE_${label}`); } catch { throw new Error(`CLOVER_ARCHIVE_${label}_REJECTED`); }
  return text;
}

function tarOctal(field, label) {
  const text = field.toString("ascii").replace(/[\0 ]+$/u, "");
  if (!/^[0-7]+$/u.test(text)) throw new Error(`CLOVER_ARCHIVE_${label}_REJECTED`);
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`CLOVER_ARCHIVE_${label}_REJECTED`);
  return value;
}

function parseDeterministicArchive(archive) {
  const bytes = Buffer.from(archive);
  if (bytes.length < 1_024 || bytes.length % 512 !== 0) throw new Error("CLOVER_ARCHIVE_STRUCTURE_REJECTED");
  const entries = [];
  const paths = new Set();
  let previousPath = null;
  let offset = 0;
  let zeroBlocks = 0;
  while (offset < bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((byte) => byte === 0)) {
      zeroBlocks += 1;
      if (zeroBlocks === 2) break;
      continue;
    }
    if (zeroBlocks !== 0) throw new Error("CLOVER_ARCHIVE_STRUCTURE_REJECTED");
    const expectedChecksum = tarOctal(header.subarray(148, 156), "CHECKSUM");
    const checksumHeader = Buffer.from(header);
    checksumHeader.fill(0x20, 148, 156);
    if (checksumHeader.reduce((sum, byte) => sum + byte, 0) !== expectedChecksum) throw new Error("CLOVER_ARCHIVE_CHECKSUM_REJECTED");
    if (tarString(header.subarray(257, 263), "MAGIC") !== "ustar" || tarString(header.subarray(263, 265), "VERSION") !== "00") throw new Error("CLOVER_ARCHIVE_FORMAT_REJECTED");
    const name = tarString(header.subarray(0, 100), "PATH");
    const prefix = tarString(header.subarray(345, 500), "PREFIX");
    const archivePath = prefix ? `${prefix}/${name}` : name;
    if (!archivePath.startsWith("output/")) throw new Error("CLOVER_ARCHIVE_PATH_REJECTED");
    const outputPath = exactSourcePath(archivePath.slice("output/".length));
    if (paths.has(outputPath)) throw new Error("CLOVER_ARCHIVE_DUPLICATE_PATH_REJECTED");
    if (previousPath !== null && compareUtf8(previousPath, outputPath) >= 0) throw new Error("CLOVER_ARCHIVE_ORDER_REJECTED");
    previousPath = outputPath;
    paths.add(outputPath);
    const mode = tarOctal(header.subarray(100, 108), "MODE");
    const size = tarOctal(header.subarray(124, 136), "SIZE");
    const type = String.fromCharCode(header[156]);
    if (type !== "0" && type !== "2") throw new Error("CLOVER_ARCHIVE_TYPE_REJECTED");
    const permittedMode = type === "0" ? [0o644, 0o664, 0o755].includes(mode) : [0o755, 0o777].includes(mode);
    if (!permittedMode || type === "2" && size !== 0) throw new Error("CLOVER_ARCHIVE_MODE_REJECTED");
    if (offset + size > bytes.length) throw new Error("CLOVER_ARCHIVE_TRUNCATED");
    const content = Buffer.from(bytes.subarray(offset, offset + size));
    offset += size;
    const padding = (512 - (size % 512)) % 512;
    if (offset + padding > bytes.length || bytes.subarray(offset, offset + padding).some((byte) => byte !== 0)) throw new Error("CLOVER_ARCHIVE_PADDING_REJECTED");
    offset += padding;
    const target = type === "2" ? tarString(header.subarray(157, 257), "LINK") : null;
    if (target !== null && (target.length === 0 || path.isAbsolute(target) || target.includes("\0") || target.includes("\\") || /\r|\n/u.test(target) || target !== target.normalize("NFC"))) throw new Error("CLOVER_ARCHIVE_LINK_REJECTED");
    const canonicalHeader = tarHeader(archivePath, { mode, size, type, linkName: target ?? "" });
    if (!header.equals(canonicalHeader)) throw new Error("CLOVER_ARCHIVE_HEADER_REJECTED");
    entries.push({ type: type === "0" ? "file" : "symlink", path: outputPath, mode, content, target });
  }
  if (zeroBlocks !== 2 || offset !== bytes.length || bytes.subarray(offset).some((byte) => byte !== 0)) throw new Error("CLOVER_ARCHIVE_TERMINATOR_REJECTED");
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
  const directories = new Set();
  for (const entry of entries) {
    const segments = entry.path.split("/");
    for (let index = 1; index < segments.length; index += 1) directories.add(segments.slice(0, index).join("/"));
  }
  for (const entry of entries) {
    if (directories.has(entry.path)) throw new Error("CLOVER_ARCHIVE_PATH_COLLISION_REJECTED");
  }
  const resolveLink = (linkPath, target) => {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(linkPath), target));
    try { return exactSourcePath(resolved); } catch { throw new Error("CLOVER_ARCHIVE_LINK_REJECTED"); }
  };
  for (const entry of entries.filter(({ type }) => type === "symlink")) {
    const visited = new Set([entry.path]);
    let resolved = resolveLink(entry.path, entry.target);
    while (entryByPath.get(resolved)?.type === "symlink") {
      if (visited.has(resolved)) throw new Error("CLOVER_ARCHIVE_LINK_REJECTED");
      visited.add(resolved);
      const next = entryByPath.get(resolved);
      resolved = resolveLink(resolved, next.target);
    }
    if (!entryByPath.has(resolved) && !directories.has(resolved)) throw new Error("CLOVER_ARCHIVE_LINK_REJECTED");
  }
  return entries;
}

export function restoreDeterministicOutputArchive(archive, restoreRoot) {
  const destination = path.resolve(restoreRoot);
  if (existsSync(destination)) throw new Error("CLOVER_ARCHIVE_RESTORE_DESTINATION_REJECTED");
  const destinationParent = path.dirname(destination);
  const parentStat = lstatSync(destinationParent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || realpathSync(destinationParent) !== destinationParent) throw new Error("CLOVER_ARCHIVE_RESTORE_DESTINATION_REJECTED");
  const entries = parseDeterministicArchive(archive);
  const outputRoot = path.join(destination, "output");
  try {
    mkdirSync(outputRoot, { recursive: true, mode: 0o755 });
    for (const entry of entries.filter(({ type }) => type === "file")) {
      const target = path.join(outputRoot, ...entry.path.split("/"));
      mkdirSync(path.dirname(target), { recursive: true, mode: 0o755 });
      writeFileSync(target, entry.content, { mode: entry.mode, flag: "wx" });
      chmodSync(target, entry.mode);
    }
    for (const entry of entries.filter(({ type }) => type === "symlink")) {
      const target = path.join(outputRoot, ...entry.path.split("/"));
      mkdirSync(path.dirname(target), { recursive: true, mode: 0o755 });
      symlinkSync(entry.target, target);
    }
    buildOutputManifest(outputRoot, { excludedPath: null });
    return outputRoot;
  } catch (error) {
    if (existsSync(destination)) rmSync(destination, { recursive: true, force: true });
    throw error;
  }
}

function createFinalArchiveManifest({ archive, deploymentInputManifest, attestation, payloadManifest, sourceProvenance }) {
  const body = {
    documentType: "clover-tree-final-archive-manifest",
    schemaVersion: "0.4.0",
    sourceCommit: sourceProvenance.commit,
    buildInvocationId: sourceProvenance.buildInvocationId,
    deploymentInputRootSha256: deploymentInputManifest.deploymentInputRootSha256,
    deploymentInputManifestSelfHash: deploymentInputManifest.manifestSelfHash,
    payloadManifestRootSha256: payloadManifest.rootSha256,
    attestationRawSha256: deploymentInputManifest.attestation.rawSha256,
    attestationSelfHash: attestation.attestationHash,
    archiveBytes: archive.length,
    archiveSha256: sha256(archive),
    archiveFormat: "deterministic-ustar-v1",
    publicSanitized: true,
    privateDataAccessed: false,
    secretsIncluded: false,
    consequentialAuthorityGranted: false
  };
  return Object.freeze({ ...body, manifestSelfHash: sha256(`${canonicalJson(body)}\n`) });
}

function createDeploymentAttestationTransaction({ outputRoot, repositoryRoot, evidenceDirectory, sourceProvenance = null, frozenOutputRoot = null }) {
  const root = realpathSync(outputRoot);
  const repository = realpathSync(repositoryRoot);
  const evidence = createFreshExternalDirectory(evidenceDirectory, root, "CLOVER_EXTERNAL_EVIDENCE_LOCATION");
  ensureInternalDirectory(root, path.posix.dirname(ATTESTATION_OUTPUT_PATH));
  const attestationPath = path.join(root, ...ATTESTATION_OUTPUT_PATH.split("/"));
  if (existsSync(attestationPath)) throw new Error("CLOVER_ATTESTATION_ALREADY_EXISTS_REJECTED");
  const normalizedOutput = normalizeGeneratedOutput({ outputRoot: root, checkoutRoot: repository });
  const { normalization, cliInvocation } = normalizedOutput;
  const provenance = sourceProvenance ?? deriveSourceProvenance({ repositoryRoot: repository });
  const outputManifest = buildOutputManifest(root);
  const body = {
    documentType: "clover-tree-deployment-attestation",
    schemaVersion: "0.3.0",
    buildInvocationId: provenance.buildInvocationId,
    source: {
      commit: provenance.commit,
      tree: provenance.tree,
      parent: provenance.parent,
      stackABase: provenance.stackABase,
      runtimeDeploymentKey: provenance.runtimeDeploymentKey,
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
  writeFileSync(attestationPath, `${canonicalJson(attestation)}\n`, { mode: 0o644, flag: "wx" });
  const finalEntries = walk(root);
  const finalPaths = new Set(finalEntries.map(({ path: outputPath }) => outputPath.normalize("NFC")));
  if (finalPaths.size !== finalEntries.length || !finalPaths.has(ATTESTATION_OUTPUT_PATH)) throw new Error("CLOVER_FINAL_OUTPUT_STRUCTURE_REJECTED");
  for (const entry of finalEntries.filter(({ type }) => type === "file")) assertPublicOutputFile(entry, readFileSync(entry.absolutePath));

  const manifestPath = path.join(evidence, PAYLOAD_MANIFEST_FILE);
  writeFileSync(manifestPath, `${canonicalJson(outputManifest)}\n`, { mode: 0o644, flag: "wx" });
  const deploymentInputManifest = buildDeploymentInputManifest({
    outputRoot: root,
    sourceProvenance: provenance,
    payloadManifest: outputManifest,
    attestation,
    normalization
  });
  const deploymentInputManifestPath = path.join(evidence, DEPLOYMENT_INPUT_MANIFEST_FILE);
  writeFileSync(deploymentInputManifestPath, `${canonicalJson(deploymentInputManifest)}\n`, { mode: 0o644, flag: "wx" });
  const archive = deterministicOutputArchive(root);
  const archivePath = path.join(evidence, FINAL_ARCHIVE_FILE);
  writeFileSync(archivePath, archive, { mode: 0o644, flag: "wx" });
  chmodSync(archivePath, 0o644);
  const archiveManifest = createFinalArchiveManifest({ archive, deploymentInputManifest, attestation, payloadManifest: outputManifest, sourceProvenance: provenance });
  const archiveManifestPath = path.join(evidence, FINAL_ARCHIVE_MANIFEST_FILE);
  writeFileSync(archiveManifestPath, `${canonicalJson(archiveManifest)}\n`, { mode: 0o644, flag: "wx" });
  const restoreParent = mkdtempSync(path.join(tmpdir(), "clover-frozen-output-restore-"));
  const restoreRoot = path.join(realpathSync(restoreParent), "restored");
  try {
    const restoredOutput = restoreDeterministicOutputArchive(archive, restoreRoot);
    const restoredDeploymentInputManifest = buildDeploymentInputManifest({
      outputRoot: restoredOutput,
      sourceProvenance: provenance,
      payloadManifest: outputManifest,
      attestation,
      normalization
    });
    if (canonicalJson(restoredDeploymentInputManifest) !== canonicalJson(deploymentInputManifest)) throw new Error("CLOVER_ARCHIVE_RESTORATION_IDENTITY_REJECTED");
    if (!deterministicOutputArchive(restoredOutput).equals(archive)) throw new Error("CLOVER_ARCHIVE_RESTORATION_BYTES_REJECTED");
  } finally {
    rmSync(restoreParent, { recursive: true, force: true });
  }
  let frozenOutput = null;
  if (frozenOutputRoot !== null) {
    const frozenDestination = createFreshExternalDirectory(frozenOutputRoot, [root, evidence], "CLOVER_FROZEN_OUTPUT_DESTINATION");
    frozenOutput = restoreDeterministicOutputArchive(archive, path.join(frozenDestination, ".vercel"));
    const frozenManifest = buildDeploymentInputManifest({
      outputRoot: frozenOutput,
      sourceProvenance: provenance,
      payloadManifest: outputManifest,
      attestation,
      normalization
    });
    if (canonicalJson(frozenManifest) !== canonicalJson(deploymentInputManifest) || !deterministicOutputArchive(frozenOutput).equals(archive)) throw new Error("CLOVER_FROZEN_OUTPUT_IDENTITY_REJECTED");
  }
  return {
    attestation,
    attestationPath,
    attestationRawSha256: sha256(readFileSync(attestationPath)),
    outputManifest,
    manifestPath,
    manifestRawSha256: sha256(readFileSync(manifestPath)),
    deploymentInputManifest,
    deploymentInputManifestPath,
    deploymentInputManifestRawSha256: sha256(readFileSync(deploymentInputManifestPath)),
    archivePath,
    archiveSha256: sha256(archive),
    archiveBytes: archive.length,
    archiveManifest,
    archiveManifestPath,
    archiveManifestRawSha256: sha256(readFileSync(archiveManifestPath)),
    cliInvocation,
    frozenOutput
  };
}

export function createDeploymentAttestation({ outputRoot, repositoryRoot, evidenceDirectory, sourceProvenance = null, frozenOutputRoot = null }) {
  const root = realpathSync(outputRoot);
  const attestationParentPath = path.posix.dirname(ATTESTATION_OUTPUT_PATH);
  validateInternalDirectoryChain(root, attestationParentPath);
  if (existsSync(path.join(root, ...ATTESTATION_OUTPUT_PATH.split("/")))) throw new Error("CLOVER_ATTESTATION_ALREADY_EXISTS_REJECTED");
  const finalEvidence = validateFreshExternalDirectoryPath(evidenceDirectory, root, "CLOVER_EXTERNAL_EVIDENCE_LOCATION");
  const finalFrozen = frozenOutputRoot === null ? null : validateFreshExternalDirectoryPath(frozenOutputRoot, [root, finalEvidence], "CLOVER_FROZEN_OUTPUT_DESTINATION");
  const stageEvidence = `${finalEvidence}.partial-${process.pid}`;
  const stageFrozen = finalFrozen === null ? null : `${finalFrozen}.partial-${process.pid}`;
  if (existsSync(stageEvidence) || stageFrozen !== null && existsSync(stageFrozen)) throw new Error("CLOVER_ATTESTATION_TRANSACTION_COLLISION_REJECTED");
  const normalizationSnapshot = snapshotNormalizableOutput(root);
  const internalDirectoryState = [];
  let internalDirectory = root;
  for (const segment of attestationParentPath.split("/")) {
    internalDirectory = path.join(internalDirectory, segment);
    internalDirectoryState.push({ path: internalDirectory, existed: existsSync(internalDirectory) });
  }
  let evidenceCommitted = false;
  let frozenCommitted = false;
  try {
    const result = createDeploymentAttestationTransaction({
      outputRoot: root,
      repositoryRoot,
      evidenceDirectory: stageEvidence,
      sourceProvenance,
      frozenOutputRoot: stageFrozen
    });
    if (stageFrozen !== null && finalFrozen !== null) {
      renameSync(stageFrozen, finalFrozen);
      frozenCommitted = true;
    }
    renameSync(stageEvidence, finalEvidence);
    evidenceCommitted = true;
    return {
      ...result,
      manifestPath: path.join(finalEvidence, PAYLOAD_MANIFEST_FILE),
      deploymentInputManifestPath: path.join(finalEvidence, DEPLOYMENT_INPUT_MANIFEST_FILE),
      archivePath: path.join(finalEvidence, FINAL_ARCHIVE_FILE),
      archiveManifestPath: path.join(finalEvidence, FINAL_ARCHIVE_MANIFEST_FILE),
      frozenOutput: finalFrozen === null ? null : path.join(finalFrozen, ".vercel", "output")
    };
  } catch (error) {
    if (existsSync(stageEvidence)) rmSync(stageEvidence, { recursive: true, force: true });
    if (stageFrozen !== null && existsSync(stageFrozen)) rmSync(stageFrozen, { recursive: true, force: true });
    if (evidenceCommitted && existsSync(finalEvidence)) rmSync(finalEvidence, { recursive: true, force: true });
    if (frozenCommitted && finalFrozen !== null && existsSync(finalFrozen)) rmSync(finalFrozen, { recursive: true, force: true });
    try {
      const attestationPath = requireInternalRegularFile(root, ATTESTATION_OUTPUT_PATH, "CLOVER_ATTESTATION_FILE");
      rmSync(attestationPath, { force: true });
    } catch {
      // A rejected parent symlink must never be followed during cleanup.
    }
    restoreNormalizableOutput(root, normalizationSnapshot);
    for (const directory of [...internalDirectoryState].reverse()) {
      if (!directory.existed && existsSync(directory.path)) {
        const stat = lstatSync(directory.path);
        if (stat.isDirectory() && !stat.isSymbolicLink() && readdirSync(directory.path).length === 0) rmSync(directory.path, { recursive: true });
      }
    }
    throw error;
  }
}

function readCanonicalDocument(documentPath, label) {
  const stat = lstatSync(documentPath);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o7777) !== 0o644) throw new Error(`${label}_REJECTED`);
  const bytes = readFileSync(documentPath);
  let value;
  try { value = parseExactJsonBytes(bytes, label); } catch { throw new Error(`${label}_REJECTED`); }
  if (!Buffer.from(`${canonicalJson(value)}\n`, "utf8").equals(bytes)) throw new Error(`${label}_CANONICAL_REJECTED`);
  return { value, bytes };
}

function verifyLayerOneAttestation(attestation, provenance, payloadManifest) {
  exactKeys(attestation, [
    "documentType", "schemaVersion", "buildInvocationId", "source", "output", "normalization", "publicSanitized", "privateDataAccessed",
    "secretsIncluded", "consequentialAuthorityGranted", "attestationHash"
  ], "CLOVER_ATTESTATION_DOCUMENT");
  exactKeys(attestation.source, [
    "commit", "tree", "parent", "stackABase", "runtimeDeploymentKey", "changedPathCount", "pathListSha256", "sourceManifestSha256",
    "packageLockSha256", "treeProgramIndexId", "treeProgramIndexHash", "nodeVersion", "nextVersion", "buildMode"
  ], "CLOVER_ATTESTATION_SOURCE");
  exactKeys(attestation.output, ["manifestRootSha256", "regularFileCount", "symlinkCount", "aggregateRegularFileBytes", "attestationExcludedPath"], "CLOVER_ATTESTATION_OUTPUT");
  const { attestationHash, ...body } = attestation;
  if (attestationHash !== sha256(`${canonicalJson(body)}\n`)) throw new Error("CLOVER_ATTESTATION_SELF_HASH_REJECTED");
  if (
    attestation.documentType !== "clover-tree-deployment-attestation" || attestation.schemaVersion !== "0.3.0" ||
    attestation.buildInvocationId !== provenance.buildInvocationId || attestation.source?.commit !== provenance.commit ||
    attestation.source?.tree !== provenance.tree || attestation.source?.parent !== provenance.parent ||
    attestation.source?.stackABase !== provenance.stackABase || attestation.source?.runtimeDeploymentKey !== provenance.runtimeDeploymentKey ||
    attestation.source?.changedPathCount !== provenance.changedPathCount || attestation.source?.pathListSha256 !== provenance.pathListSha256 ||
    attestation.source?.sourceManifestSha256 !== provenance.sourceManifestSha256 || attestation.source?.packageLockSha256 !== provenance.packageLockSha256 ||
    attestation.source?.treeProgramIndexId !== provenance.treeProgramIndexId || attestation.source?.treeProgramIndexHash !== provenance.treeProgramIndexHash ||
    attestation.source?.nodeVersion !== provenance.nodeVersion || attestation.source?.nextVersion !== provenance.nextVersion ||
    attestation.source?.buildMode !== provenance.buildMode || attestation.output?.manifestRootSha256 !== payloadManifest.rootSha256 ||
    attestation.output?.regularFileCount !== payloadManifest.regularFileCount || attestation.output?.symlinkCount !== payloadManifest.symlinkCount ||
    attestation.output?.aggregateRegularFileBytes !== payloadManifest.aggregateRegularFileBytes || attestation.output?.attestationExcludedPath !== ATTESTATION_OUTPUT_PATH ||
    attestation.publicSanitized !== true || attestation.privateDataAccessed !== false || attestation.secretsIncluded !== false ||
    attestation.consequentialAuthorityGranted !== false || !Array.isArray(attestation.normalization)
  ) throw new Error("CLOVER_ATTESTATION_BINDING_REJECTED");
  let previousNormalizationPath = null;
  for (const item of attestation.normalization) {
    exactKeys(item, ["path", "classification", "beforeSha256", "afterSha256"], "CLOVER_ATTESTATION_NORMALIZATION");
    const itemPath = exactSourcePath(item.path);
    const expectedClassification = itemPath === "builds.json" || itemPath === "diagnostics/cli_traces.json"
      ? "vercel-cli-metadata-root"
      : /^functions\/.+\/apps\/clover-launch-studio\/___next_launcher\.cjs$/u.test(itemPath) ? "next-launcher-runtime-root" : null;
    const payloadEntry = payloadManifest.files.find(({ path: payloadPath }) => payloadPath === itemPath);
    if (
      previousNormalizationPath !== null && compareUtf8(previousNormalizationPath, itemPath) >= 0 ||
      expectedClassification === null || item.classification !== expectedClassification || !payloadEntry || payloadEntry.sha256 !== item.afterSha256 ||
      !/^[0-9a-f]{64}$/u.test(item.beforeSha256) || !/^[0-9a-f]{64}$/u.test(item.afterSha256) || item.beforeSha256 === item.afterSha256
    ) throw new Error("CLOVER_ATTESTATION_NORMALIZATION_REJECTED");
    previousNormalizationPath = itemPath;
  }
}

export function verifyDeploymentInputEvidence({ outputRoot, repositoryRoot, evidenceDirectory, sourceProvenance = null }) {
  const root = realpathSync(outputRoot);
  const repository = realpathSync(repositoryRoot);
  const evidence = realpathSync(evidenceDirectory);
  if (evidence === root || evidence.startsWith(`${root}${path.sep}`)) throw new Error("CLOVER_EXTERNAL_EVIDENCE_LOCATION_REJECTED");
  const provenance = sourceProvenance ?? deriveSourceProvenance({ repositoryRoot: repository });
  buildOutputManifest(root, { excludedPath: null });
  const payloadRead = readCanonicalDocument(path.join(evidence, PAYLOAD_MANIFEST_FILE), "CLOVER_PAYLOAD_MANIFEST");
  const attestationRead = readCanonicalDocument(requireInternalRegularFile(root, ATTESTATION_OUTPUT_PATH, "CLOVER_ATTESTATION_FILE"), "CLOVER_ATTESTATION_FILE");
  const deploymentInputRead = readCanonicalDocument(path.join(evidence, DEPLOYMENT_INPUT_MANIFEST_FILE), "CLOVER_DEPLOYMENT_INPUT_MANIFEST");
  const archiveManifestRead = readCanonicalDocument(path.join(evidence, FINAL_ARCHIVE_MANIFEST_FILE), "CLOVER_FINAL_ARCHIVE_MANIFEST");
  const archivePath = path.join(evidence, FINAL_ARCHIVE_FILE);
  const archiveStat = lstatSync(archivePath);
  if (!archiveStat.isFile() || archiveStat.isSymbolicLink() || (archiveStat.mode & 0o7777) !== 0o644) throw new Error("CLOVER_FINAL_ARCHIVE_REJECTED");
  const archive = readFileSync(archivePath);
  const recomputedPayload = buildOutputManifest(root);
  if (canonicalJson(payloadRead.value) !== canonicalJson(recomputedPayload)) throw new Error("CLOVER_PAYLOAD_MANIFEST_MUTATION_REJECTED");
  verifyLayerOneAttestation(attestationRead.value, provenance, recomputedPayload);
  const recomputedDeploymentInput = buildDeploymentInputManifest({
    outputRoot: root,
    sourceProvenance: provenance,
    payloadManifest: recomputedPayload,
    attestation: attestationRead.value,
    normalization: attestationRead.value.normalization
  });
  if (canonicalJson(deploymentInputRead.value) !== canonicalJson(recomputedDeploymentInput)) throw new Error("CLOVER_DEPLOYMENT_INPUT_MUTATION_REJECTED");
  const recomputedArchive = deterministicOutputArchive(root);
  if (!recomputedArchive.equals(archive)) throw new Error("CLOVER_ARCHIVE_SUBSTITUTION_REJECTED");
  const recomputedArchiveManifest = createFinalArchiveManifest({
    archive,
    deploymentInputManifest: recomputedDeploymentInput,
    attestation: attestationRead.value,
    payloadManifest: recomputedPayload,
    sourceProvenance: provenance
  });
  if (canonicalJson(archiveManifestRead.value) !== canonicalJson(recomputedArchiveManifest)) throw new Error("CLOVER_ARCHIVE_MANIFEST_REJECTED");
  const restoreParent = mkdtempSync(path.join(tmpdir(), "clover-frozen-output-verify-"));
  try {
    const restoredOutput = restoreDeterministicOutputArchive(archive, path.join(realpathSync(restoreParent), "restored"));
    const restoredManifest = buildDeploymentInputManifest({
      outputRoot: restoredOutput,
      sourceProvenance: provenance,
      payloadManifest: recomputedPayload,
      attestation: attestationRead.value,
      normalization: attestationRead.value.normalization
    });
    if (canonicalJson(restoredManifest) !== canonicalJson(recomputedDeploymentInput)) throw new Error("CLOVER_ARCHIVE_RESTORATION_IDENTITY_REJECTED");
  } finally {
    rmSync(restoreParent, { recursive: true, force: true });
  }
  return Object.freeze({
    sourceProvenance: provenance,
    payloadManifest: recomputedPayload,
    attestation: attestationRead.value,
    deploymentInputManifest: recomputedDeploymentInput,
    archiveManifest: recomputedArchiveManifest,
    archivePath
  });
}

function decodeCanonicalBase64(value, label) {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) throw new Error(`${label}_REJECTED`);
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw new Error(`${label}_REJECTED`);
  return bytes;
}

function exactProviderRequest(value, { method, url, response, requestProjection = NO_PROVIDER_REQUEST_BODY, nowTime }, label) {
  exactKeys(value, [
    "schemaVersion", "method", "url", "status", "requestStartedAt", "responseObservedAt", "transport",
    "requestProjection", "requestProjectionHashDomain", "requestProjectionBytes", "requestProjectionSha256",
    "responseMediaTypeEssence", "responseCharset", "responseOtherMediaTypeParameters", "responseHashDomain",
    "responseProjectionBytes", "responseProjectionSha256"
  ], label);
  exactKeys(value.transport, [
    "transportKind", "cliPackage", "cliVersion", "cliIntegrity", "responseView", "redirectTelemetry", "redirectClaim",
    "callerInvocationCount", "automaticRetryPolicy", "actualWireAttemptCount"
  ], `${label}_TRANSPORT`);
  const requestBytes = Buffer.from(`${canonicalJson(requestProjection)}\n`, "utf8");
  const responseBytes = Buffer.from(`${canonicalJson(response)}\n`, "utf8");
  const requestStartedTime = Date.parse(value.requestStartedAt);
  const responseObservedTime = Date.parse(value.responseObservedAt);
  const wireAttemptsExposed = Number.isSafeInteger(value.transport.actualWireAttemptCount) &&
    value.transport.actualWireAttemptCount >= 1 && value.transport.actualWireAttemptCount <= 4;
  if (
    value.schemaVersion !== PROVIDER_REQUEST_EVIDENCE_SCHEMA || value.method !== method || value.url !== url || value.status !== 200 ||
    !Number.isFinite(requestStartedTime) || new Date(requestStartedTime).toISOString() !== value.requestStartedAt ||
    !Number.isFinite(responseObservedTime) || new Date(responseObservedTime).toISOString() !== value.responseObservedAt ||
    requestStartedTime > responseObservedTime || responseObservedTime - requestStartedTime > MAX_PROVIDER_REQUEST_DURATION_MS ||
    responseObservedTime > nowTime + 5_000 || responseObservedTime < nowTime - MAX_PROVIDER_REQUEST_DURATION_MS ||
    requestStartedTime < nowTime - MAX_PROVIDER_REQUEST_DURATION_MS ||
    value.transport.transportKind !== "vercel-api-cli" || value.transport.cliPackage !== "vercel" ||
    value.transport.cliVersion !== VERCEL_CLI_VERSION || value.transport.cliIntegrity !== VERCEL_CLI_INTEGRITY ||
    value.transport.responseView !== "final-json-response-only" ||
    value.transport.redirectTelemetry !== "not-exposed-by-vercel-api-cli" || value.transport.redirectClaim !== null ||
    value.transport.callerInvocationCount !== 1 ||
    value.transport.automaticRetryPolicy !== "maximum-three-byte-identical-retries" ||
    value.transport.actualWireAttemptCount !== "not-exposed" && !wireAttemptsExposed ||
    canonicalJson(value.requestProjection) !== canonicalJson(requestProjection) ||
    value.requestProjectionHashDomain !== PROVIDER_REQUEST_PROJECTION_HASH_DOMAIN ||
    !Number.isSafeInteger(value.requestProjectionBytes) || value.requestProjectionBytes !== requestBytes.length ||
    value.requestProjectionBytes > MAX_PROVIDER_RESPONSE_PROJECTION_BYTES || value.requestProjectionSha256 !== sha256(requestBytes) ||
    value.responseMediaTypeEssence !== "application/json" || value.responseCharset !== null && value.responseCharset !== "utf-8" ||
    canonicalJson(value.responseOtherMediaTypeParameters) !== "[]" || value.responseHashDomain !== PROVIDER_RESPONSE_PROJECTION_HASH_DOMAIN ||
    !Number.isSafeInteger(value.responseProjectionBytes) || value.responseProjectionBytes !== responseBytes.length ||
    value.responseProjectionBytes > MAX_PROVIDER_RESPONSE_PROJECTION_BYTES || value.responseProjectionSha256 !== sha256(responseBytes)
  ) {
    throw new Error(`${label}_REJECTED`);
  }
  return Object.freeze({ requestStartedTime, responseObservedTime });
}

function canonicalProviderUrl(version, route, query = []) {
  const encodedRoute = route.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  const suffix = query.length === 0 ? "" : `?${query.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&")}`;
  return `https://api.vercel.com/${version}/${encodedRoute}${suffix}`;
}

function canonicalProtectionSnapshot(value, label) {
  exactKeys(value, [
    "projectId", "teamId", "providerProjectUpdatedAt", "bypassCount", "ssoProtection", "passwordProtectionEnabled",
    "gitForkProtection", "skewProtectionMaxAge"
  ], label);
  exactKeys(value.ssoProtection, ["deploymentType"], `${label}_SSO`);
  if (
    value.projectId !== VERCEL_PROJECT_ID || value.teamId !== VERCEL_TEAM_ID ||
    !Number.isSafeInteger(value.providerProjectUpdatedAt) || value.providerProjectUpdatedAt < VERCEL_PROJECT_UPDATED_AT ||
    value.bypassCount !== 0 || value.ssoProtection.deploymentType !== "all_except_custom_domains" ||
    value.passwordProtectionEnabled !== false || value.gitForkProtection !== true || value.skewProtectionMaxAge !== 43_200
  ) throw new Error(`${label}_REJECTED`);
  return {
    projectId: value.projectId,
    teamId: value.teamId,
    bypassCount: value.bypassCount,
    ssoProtection: value.ssoProtection,
    passwordProtectionEnabled: value.passwordProtectionEnabled,
    gitForkProtection: value.gitForkProtection,
    skewProtectionMaxAge: value.skewProtectionMaxAge
  };
}

function canonicalProviderEffectProject(value, label) {
  exactKeys(value, [
    "projectId", "teamId", "providerProjectUpdatedAt", "projectSettingsSha256", "accessPolicySha256", "bypassCount", "ssoProtection",
    "passwordProtectionEnabled", "gitForkProtection", "skewProtectionMaxAge"
  ], label);
  if (
    typeof value.projectSettingsSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(value.projectSettingsSha256) ||
    typeof value.accessPolicySha256 !== "string" || !/^[0-9a-f]{64}$/u.test(value.accessPolicySha256)
  ) {
    throw new Error(`${label}_REJECTED`);
  }
  const protection = { ...value };
  delete protection.projectSettingsSha256;
  delete protection.accessPolicySha256;
  canonicalProtectionSnapshot(protection, label);
  return value;
}

function canonicalProviderDeploymentInventory(value, label) {
  exactKeys(value, ["boundedLimit", "count", "entries", "inventorySha256", "paginationExhausted"], label);
  if (
    value.boundedLimit !== 100 || value.paginationExhausted !== true ||
    !Number.isSafeInteger(value.count) || value.count < 0 || value.count > value.boundedLimit ||
    !Array.isArray(value.entries) || value.entries.length !== value.count
  ) {
    throw new Error(`${label}_REJECTED`);
  }
  let previousId = null;
  for (const entry of value.entries) {
    exactKeys(entry, ["createdAt", "id", "state", "target"], `${label}_ENTRY`);
    if (
      typeof entry.id !== "string" || !/^dpl_[A-Za-z0-9]+$/u.test(entry.id) ||
      previousId !== null && compareUtf8(previousId, entry.id) >= 0 ||
      !Number.isSafeInteger(entry.createdAt) || entry.createdAt < 0 ||
      typeof entry.state !== "string" || !/^[A-Z][A-Z_]{1,31}$/u.test(entry.state) ||
      entry.target !== null && (typeof entry.target !== "string" || !/^[a-z][a-z0-9-]{0,63}$/u.test(entry.target))
    ) throw new Error(`${label}_REJECTED`);
    previousId = entry.id;
  }
  if (value.inventorySha256 !== sha256(`${canonicalJson(value.entries)}\n`)) throw new Error(`${label}_REJECTED`);
  return value;
}

function canonicalProviderOpaqueInventory(value, projection, label, { boundedLimit, environmentVariables = false } = {}) {
  const keys = ["boundedLimit", "count", "entries", "inventorySha256", "paginationExhausted", "projection"];
  if (environmentVariables) keys.push("keyNamesPersisted", "valuesPersisted", "valuesRead");
  exactKeys(value, keys, label);
  if (
    value.projection !== projection || value.boundedLimit !== boundedLimit || value.paginationExhausted !== true ||
    !Number.isSafeInteger(value.count) || value.count < 0 || value.count > boundedLimit ||
    !Array.isArray(value.entries) || value.entries.length !== value.count
  ) throw new Error(`${label}_REJECTED`);
  let previousIdentity = null;
  for (const entry of value.entries) {
    exactKeys(entry, ["identitySha256"], `${label}_ENTRY`);
    if (
      typeof entry.identitySha256 !== "string" || !/^[0-9a-f]{64}$/u.test(entry.identitySha256) ||
      previousIdentity !== null && compareUtf8(previousIdentity, entry.identitySha256) >= 0
    ) throw new Error(`${label}_REJECTED`);
    previousIdentity = entry.identitySha256;
  }
  if (
    value.inventorySha256 !== sha256(`${canonicalJson(value.entries)}\n`) ||
    environmentVariables && (value.keyNamesPersisted !== false || value.valuesPersisted !== false || value.valuesRead !== false)
  ) throw new Error(`${label}_REJECTED`);
  return value;
}

function exactProviderEffectSnapshot(value, { readRequest, label }) {
  exactKeys(value, ["aliases", "customEnvironments", "deployments", "domains", "environmentVariables", "project"], label);
  const definitions = {
    project: {
      url: canonicalProviderUrl("v9", `projects/${VERCEL_PROJECT_ID}`, [["teamId", VERCEL_TEAM_ID]]),
      validate: (response) => canonicalProviderEffectProject(response, `${label}_PROJECT_RESPONSE`)
    },
    deployments: {
      url: canonicalProviderUrl("v6", "deployments", [["projectId", VERCEL_PROJECT_ID], ["limit", "100"], ["teamId", VERCEL_TEAM_ID]]),
      validate: (response) => canonicalProviderDeploymentInventory(response, `${label}_DEPLOYMENTS_RESPONSE`)
    },
    domains: {
      url: canonicalProviderUrl("v9", `projects/${VERCEL_PROJECT_ID}/domains`, [["limit", "100"], ["teamId", VERCEL_TEAM_ID]]),
      validate: (response) => canonicalProviderOpaqueInventory(response, "project-domain-metadata-v1", `${label}_DOMAINS_RESPONSE`, { boundedLimit: 100 })
    },
    aliases: {
      url: canonicalProviderUrl("v4", "aliases", [["projectId", VERCEL_PROJECT_ID], ["limit", "100"], ["teamId", VERCEL_TEAM_ID]]),
      validate: (response) => canonicalProviderOpaqueInventory(response, "project-alias-metadata-v1", `${label}_ALIASES_RESPONSE`, { boundedLimit: 100 })
    },
    customEnvironments: {
      url: canonicalProviderUrl("v9", `projects/${VERCEL_PROJECT_ID}/custom-environments`, [["teamId", VERCEL_TEAM_ID]]),
      validate: (response) => canonicalProviderOpaqueInventory(response, "custom-environment-metadata-v1", `${label}_CUSTOM_ENVIRONMENTS_RESPONSE`, { boundedLimit: 12 })
    },
    environmentVariables: {
      url: canonicalProviderUrl("v10", `projects/${VERCEL_PROJECT_ID}/env`, [["decrypt", "false"], ["teamId", VERCEL_TEAM_ID]]),
      validate: (response) => canonicalProviderOpaqueInventory(response, "environment-variable-name-scope-and-update-metadata-v1", `${label}_ENVIRONMENT_VARIABLES_RESPONSE`, { boundedLimit: 1_000, environmentVariables: true })
    }
  };
  const intervals = [];
  for (const [key, definition] of Object.entries(definitions)) {
    exactKeys(value[key], ["request", "response"], `${label}_${key.toUpperCase()}`);
    definition.validate(value[key].response);
    intervals.push(readRequest(value[key].request, { method: "GET", url: definition.url, response: value[key].response }, `${label}_${key.toUpperCase()}_REQUEST`));
  }
  return {
    ...value,
    earliestRequestStartedTime: Math.min(...intervals.map(({ requestStartedTime }) => requestStartedTime)),
    latestResponseObservedTime: Math.max(...intervals.map(({ responseObservedTime }) => responseObservedTime))
  };
}

function exactProviderBypassEntry(value, label) {
  exactKeys(value, ["providerCreatedAt", "createdByPresent", "correlationNoteSha256", "scope"], label);
  if (
    !Number.isSafeInteger(value.providerCreatedAt) || value.providerCreatedAt < 0 ||
    value.createdByPresent !== true || typeof value.correlationNoteSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(value.correlationNoteSha256) ||
    value.scope !== "automation-bypass"
  ) throw new Error(`${label}_REJECTED`);
  return value;
}

function exactProviderBypassReadback(value, { expectedCount, expectedEntry, url, readRequest }, label) {
  exactKeys(value, ["request", "response"], label);
  exactKeys(value.response, ["projectId", "teamId", "bypassCount", "activeEntry"], `${label}_RESPONSE`);
  if (
    value.response.projectId !== VERCEL_PROJECT_ID || value.response.teamId !== VERCEL_TEAM_ID ||
    value.response.bypassCount !== expectedCount ||
    expectedCount === 0 && value.response.activeEntry !== null ||
    expectedCount === 1 && canonicalJson(exactProviderBypassEntry(value.response.activeEntry, `${label}_ACTIVE_ENTRY`)) !== canonicalJson(expectedEntry)
  ) throw new Error(`${label}_RESPONSE_REJECTED`);
  const interval = readRequest(value.request, { method: "GET", url, response: value.response }, `${label}_REQUEST`);
  return { ...value, ...interval };
}

function exactProviderEvent(value, { action, url, projectReadUrl, readRequest, expectedCreatedEntry = null }, label) {
  const keys = [
    "action", "eventId", "observedAt", "bypassCountBefore", "bypassCountAfter", "operation", "request", "requestSemantics",
    "beforeReadback", "afterReadback"
  ];
  if (action === "create") keys.push("createdEntry", "providerIdentityMatchedInMemory", "responseEntryCount");
  else keys.push("response");
  exactKeys(value, keys, label);
  const eventTime = Date.parse(value.observedAt);
  if (
    value.action !== action || typeof value.eventId !== "string" || !/^[a-z][A-Za-z0-9:_-]{7,127}$/u.test(value.eventId) ||
    !Number.isFinite(eventTime) || new Date(eventTime).toISOString() !== value.observedAt ||
    value.operation !== (action === "create" ? "create-one-automation-bypass" : "revoke-exact-automation-bypass-without-regeneration") ||
    value.bypassCountBefore !== (action === "create" ? 0 : 1) || value.bypassCountAfter !== (action === "create" ? 1 : 0)
  ) throw new Error(`${label}_REJECTED`);
  if (action === "create") {
    exactKeys(value.requestSemantics, ["scope", "suppliedValue", "valueSource"], `${label}_REQUEST_SEMANTICS`);
    const createdEntry = exactProviderBypassEntry(value.createdEntry, `${label}_CREATED_ENTRY`);
    if (
      value.requestSemantics.scope !== "automation-bypass" || value.requestSemantics.suppliedValue !== false || value.requestSemantics.valueSource !== "provider-generated" ||
      value.responseEntryCount !== 1 || value.providerIdentityMatchedInMemory !== true
    ) throw new Error(`${label}_CREATED_ENTRY_REJECTED`);
    const before = exactProviderBypassReadback(value.beforeReadback, {
      expectedCount: 0, expectedEntry: null, url: projectReadUrl, readRequest
    }, `${label}_BEFORE_READBACK`);
    const request = readRequest(value.request, {
      method: "PATCH",
      url,
      requestProjection: {
        generate: {
          correlationNoteSha256: createdEntry.correlationNoteSha256,
          suppliedValue: false,
          valueSource: "provider-generated"
        }
      },
      response: { createdEntry, responseEntryCount: value.responseEntryCount }
    }, `${label}_REQUEST`);
    const after = exactProviderBypassReadback(value.afterReadback, {
      expectedCount: 1, expectedEntry: createdEntry, url: projectReadUrl, readRequest
    }, `${label}_AFTER_READBACK`);
    if (
      eventTime !== request.responseObservedTime || before.responseObservedTime > request.requestStartedTime ||
      request.responseObservedTime > after.requestStartedTime ||
      createdEntry.providerCreatedAt < request.requestStartedTime - PROVIDER_CREATED_AT_CLOCK_SKEW_MS ||
      createdEntry.providerCreatedAt > request.responseObservedTime + PROVIDER_CREATED_AT_CLOCK_SKEW_MS
    ) throw new Error(`${label}_TIME_REJECTED`);
    return {
      eventTime,
      request,
      createdEntry,
      earliestRequestStartedTime: before.requestStartedTime,
      latestResponseObservedTime: after.responseObservedTime
    };
  }
  exactKeys(value.requestSemantics, ["exactCreatedBypass", "regenerate"], `${label}_REQUEST_SEMANTICS`);
  const boundCreatedEntry = exactProviderBypassEntry(expectedCreatedEntry, `${label}_EXPECTED_ENTRY`);
  if (value.requestSemantics.exactCreatedBypass !== true || value.requestSemantics.regenerate !== false) {
    throw new Error(`${label}_REQUEST_SEMANTICS_REJECTED`);
  }
  exactKeys(value.response, ["protectionBypass"], `${label}_RESPONSE`);
  exactKeys(value.response.protectionBypass, [], `${label}_RESPONSE_BYPASS`);
  const before = exactProviderBypassReadback(value.beforeReadback, {
    expectedCount: 1, expectedEntry: boundCreatedEntry, url: projectReadUrl, readRequest
  }, `${label}_BEFORE_READBACK`);
  const request = readRequest(value.request, {
    method: "PATCH",
    url,
    requestProjection: {
      revoke: {
        exactCreatedBypassIdentityMatchedInMemory: true,
        regenerate: false,
        secretDisposition: "in-memory-only-not-projected-or-hashed"
      }
    },
    response: value.response
  }, `${label}_REQUEST`);
  const after = exactProviderBypassReadback(value.afterReadback, {
    expectedCount: 0, expectedEntry: null, url: projectReadUrl, readRequest
  }, `${label}_AFTER_READBACK`);
  if (
    eventTime !== request.responseObservedTime || before.responseObservedTime > request.requestStartedTime ||
    request.responseObservedTime > after.requestStartedTime
  ) throw new Error(`${label}_TIME_REJECTED`);
  return {
    eventTime,
    request,
    earliestRequestStartedTime: before.requestStartedTime,
    latestResponseObservedTime: after.responseObservedTime
  };
}

export function createProviderDeploymentReceipt({ providerDeployment, verifiedEvidence, now = new Date() }) {
  const nowTime = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(nowTime) || new Date(nowTime).toISOString() !== now.toISOString()) throw new Error("CLOVER_PROVIDER_RECEIPT_TIME_REJECTED");
  const generatedAt = new Date(nowTime).toISOString();
  const requestIntervals = [];
  const readRequest = (value, specification, label) => {
    const interval = exactProviderRequest(value, { ...specification, nowTime }, label);
    requestIntervals.push({ ...interval, label });
    return interval;
  };
  exactKeys(providerDeployment, ["deployment", "deploymentInvocation", "fileTree", "contents", "protection", "providerEffects"], "CLOVER_PROVIDER_EVIDENCE");
  exactKeys(providerDeployment.deployment, ["request", "response"], "CLOVER_PROVIDER_DEPLOYMENT_READBACK");
  const raw = providerDeployment.deployment.response;
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !Array.isArray(providerDeployment.contents)) throw new Error("CLOVER_PROVIDER_DEPLOYMENT_REJECTED");
  const requiredRawKeys = ["id", "name", "url", "createdAt", "type", "state", "status", "readyState", "target", "alias", "automaticAliases", "project", "team", "meta", "source", "prebuilt", "nodeVersion", "userConfiguredDeploymentId"];
  exactKeys(raw, requiredRawKeys, "CLOVER_PROVIDER_DEPLOYMENT_RESPONSE");
  if (!raw.project || typeof raw.project !== "object" || !raw.team || typeof raw.team !== "object" || !raw.meta || typeof raw.meta !== "object") throw new Error("CLOVER_PROVIDER_DEPLOYMENT_REJECTED");
  exactKeys(raw.project, ["framework", "id", "name"], "CLOVER_PROVIDER_PROJECT");
  exactKeys(raw.team, ["id", "name", "slug"], "CLOVER_PROVIDER_TEAM");
  exactKeys(raw.meta, ["gitCommitRef", "gitCommitSha", "gitRemoteUrl", "gitRootDirectory"], "CLOVER_PROVIDER_META");
  const expectedCommit = verifiedEvidence.sourceProvenance.commit;
  if (
    raw.project.id !== VERCEL_PROJECT_ID || raw.project.name !== VERCEL_PROJECT_NAME || raw.project.framework !== VERCEL_PROJECT_FRAMEWORK ||
    raw.team.id !== VERCEL_TEAM_ID || raw.team.name !== VERCEL_TEAM_NAME || raw.team.slug !== VERCEL_TEAM_SLUG ||
    typeof raw.id !== "string" || !/^dpl_[A-Za-z0-9]+$/u.test(raw.id) || raw.name !== VERCEL_PROJECT_NAME ||
    !Number.isSafeInteger(raw.createdAt) || raw.createdAt < 0 ||
    raw.type !== "LAMBDAS" || raw.state !== "READY" || raw.status !== "READY" || raw.readyState !== "READY" || raw.target !== null ||
    !Array.isArray(raw.alias) || raw.alias.length !== 0 || !Array.isArray(raw.automaticAliases) || raw.automaticAliases.length !== 0 ||
    raw.source !== "cli" || raw.prebuilt !== true || raw.nodeVersion !== "24.x" || raw.userConfiguredDeploymentId !== verifiedEvidence.sourceProvenance.runtimeDeploymentKey ||
    raw.meta.gitCommitSha !== expectedCommit || raw.meta.gitCommitRef !== "feature/clover-tree-command-center-launch-studio-v0.1-20260826" ||
    raw.meta.gitRemoteUrl !== "https://github.com/chrisdortch/first.git" || raw.meta.gitRootDirectory !== "apps/clover-launch-studio"
  ) throw new Error("CLOVER_PROVIDER_DEPLOYMENT_REJECTED");
  if (typeof raw.url !== "string" || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+vercel\.app$/u.test(raw.url)) throw new Error("CLOVER_PROVIDER_DEPLOYMENT_REJECTED");
  const deploymentRead = readRequest(providerDeployment.deployment.request, {
    method: "GET",
    url: canonicalProviderUrl("v13", `deployments/${raw.id}`, [["teamId", VERCEL_TEAM_ID]]),
    response: raw
  }, "CLOVER_PROVIDER_DEPLOYMENT_REQUEST");
  const expectedDeploymentArgv = [
    "npx", "--yes", `vercel@${VERCEL_CLI_VERSION}`, "deploy", "--prebuilt", "--yes", "--target=preview",
    "--meta", `gitCommitSha=${expectedCommit}`,
    "--meta", "gitCommitRef=feature/clover-tree-command-center-launch-studio-v0.1-20260826",
    "--meta", "gitRemoteUrl=https://github.com/chrisdortch/first.git",
    "--meta", "gitRootDirectory=apps/clover-launch-studio"
  ];
  exactKeys(providerDeployment.deploymentInvocation, [
    "argv", "completedAt", "executedArgv", "executionCount", "exitCode", "outputRelativePath", "projectLinkSha256", "startedAt",
    "returnedDeploymentId", "returnedImmutableUrl", "toolIntegrity", "toolPackage", "toolVersion", "workingDirectory"
  ], "CLOVER_PROVIDER_DEPLOYMENT_INVOCATION");
  const invocationStartedTime = Date.parse(providerDeployment.deploymentInvocation.startedAt);
  const invocationCompletedTime = Date.parse(providerDeployment.deploymentInvocation.completedAt);
  if (
    canonicalJson(providerDeployment.deploymentInvocation.argv) !== canonicalJson(expectedDeploymentArgv) ||
    canonicalJson(providerDeployment.deploymentInvocation.executedArgv) !== canonicalJson(expectedDeploymentArgv) ||
    providerDeployment.deploymentInvocation.workingDirectory !== "frozen-workspace-root" ||
    providerDeployment.deploymentInvocation.outputRelativePath !== ".vercel/output" ||
    providerDeployment.deploymentInvocation.projectLinkSha256 !== verifiedEvidence.sourceProvenance.buildProjectSettingsSha256 ||
    providerDeployment.deploymentInvocation.toolPackage !== "vercel" ||
    providerDeployment.deploymentInvocation.toolVersion !== VERCEL_CLI_VERSION ||
    providerDeployment.deploymentInvocation.toolIntegrity !== VERCEL_CLI_INTEGRITY ||
    providerDeployment.deploymentInvocation.returnedDeploymentId !== raw.id ||
    providerDeployment.deploymentInvocation.returnedImmutableUrl !== `https://${raw.url}/` ||
    providerDeployment.deploymentInvocation.executionCount !== 1 || providerDeployment.deploymentInvocation.exitCode !== 0 ||
    !Number.isFinite(invocationStartedTime) || new Date(invocationStartedTime).toISOString() !== providerDeployment.deploymentInvocation.startedAt ||
    !Number.isFinite(invocationCompletedTime) || new Date(invocationCompletedTime).toISOString() !== providerDeployment.deploymentInvocation.completedAt ||
    invocationStartedTime > invocationCompletedTime
  ) throw new Error("CLOVER_PROVIDER_DEPLOYMENT_INVOCATION_REJECTED");

  const effects = providerDeployment.providerEffects;
  exactKeys(effects, ["afterDeployment", "beforeDeployment", "newDeploymentId", "postRevocation"], "CLOVER_PROVIDER_EFFECTS");
  if (effects.newDeploymentId !== raw.id) throw new Error("CLOVER_PROVIDER_EFFECT_DEPLOYMENTS_REJECTED");
  const effectsBefore = exactProviderEffectSnapshot(effects.beforeDeployment, { readRequest, label: "CLOVER_PROVIDER_EFFECT_BEFORE" });
  const effectsAfter = exactProviderEffectSnapshot(effects.afterDeployment, { readRequest, label: "CLOVER_PROVIDER_EFFECT_AFTER" });
  const effectsPostRevocation = exactProviderEffectSnapshot(effects.postRevocation, { readRequest, label: "CLOVER_PROVIDER_EFFECT_POST_REVOCATION" });
  if (
    effectsBefore.latestResponseObservedTime >= invocationStartedTime || invocationCompletedTime > deploymentRead.requestStartedTime ||
    deploymentRead.responseObservedTime > effectsAfter.earliestRequestStartedTime ||
    effectsBefore.latestResponseObservedTime >= effectsAfter.earliestRequestStartedTime
  ) throw new Error("CLOVER_PROVIDER_EFFECT_CHRONOLOGY_REJECTED");
  const beforeDeployments = effectsBefore.deployments.response;
  const afterDeployments = effectsAfter.deployments.response;
  const priorAfterEntries = afterDeployments.entries.filter(({ id }) => id !== raw.id);
  const addedEntries = afterDeployments.entries.filter(({ id }) => id === raw.id);
  const beforeProduction = beforeDeployments.entries.filter(({ target }) => target === "production");
  const afterProduction = afterDeployments.entries.filter(({ target }) => target === "production");
  if (
    beforeDeployments.count !== 9 || afterDeployments.count !== 10 ||
    beforeDeployments.entries.some(({ id }) => id === raw.id) || addedEntries.length !== 1 ||
    addedEntries[0].state !== raw.state || addedEntries[0].target !== raw.target ||
    addedEntries[0].createdAt !== raw.createdAt || raw.createdAt < invocationStartedTime || raw.createdAt > invocationCompletedTime
  ) throw new Error("CLOVER_PROVIDER_EFFECT_DEPLOYMENTS_REJECTED");
  if (canonicalJson(beforeProduction) !== canonicalJson(afterProduction)) throw new Error("CLOVER_PROVIDER_EFFECT_PRODUCTION_REJECTED");
  if (canonicalJson(priorAfterEntries) !== canonicalJson(beforeDeployments.entries)) throw new Error("CLOVER_PROVIDER_EFFECT_DEPLOYMENTS_REJECTED");
  const stableProjectSnapshot = (value) => {
    const stable = { ...value };
    delete stable.providerProjectUpdatedAt;
    return stable;
  };
  if (canonicalJson(stableProjectSnapshot(effectsBefore.project.response)) !== canonicalJson(stableProjectSnapshot(effectsAfter.project.response))) {
    throw new Error("CLOVER_PROVIDER_EFFECT_PROJECT_CHANGED");
  }
  for (const [key, error] of [
    ["domains", "CLOVER_PROVIDER_EFFECT_DOMAINS_CHANGED"],
    ["aliases", "CLOVER_PROVIDER_EFFECT_ALIASES_CHANGED"],
    ["customEnvironments", "CLOVER_PROVIDER_EFFECT_CUSTOM_ENVIRONMENTS_CHANGED"],
    ["environmentVariables", "CLOVER_PROVIDER_EFFECT_ENVIRONMENT_VARIABLES_CHANGED"]
  ]) {
    if (canonicalJson(effectsBefore[key].response) !== canonicalJson(effectsAfter[key].response)) throw new Error(error);
  }

  const protection = providerDeployment.protection;
  exactKeys(protection, [
    "deploymentId", "baseline", "create", "revoke", "bypassCountSequence", "regenerationDisabled", "shareUrlCreated",
    "vercelCurlUsed", "bypassValueDisclosed", "bypassValuePersisted", "bypassValueUploaded", "bypassValueAttached", "bypassValueScreenshotted",
    "ownerLoginRequested", "postRevocationAuthenticatedApplicationRequestCount"
  ], "CLOVER_PROVIDER_PROTECTION");
  if (protection.deploymentId !== raw.id) throw new Error("CLOVER_PROVIDER_PROTECTION_REJECTED");
  exactKeys(protection.baseline, ["request", "response"], "CLOVER_PROVIDER_PROTECTION_BASELINE");
  const projectReadUrl = canonicalProviderUrl("v9", `projects/${VERCEL_PROJECT_ID}`, [["teamId", VERCEL_TEAM_ID]]);
  const bypassUrl = canonicalProviderUrl("v1", `projects/${VERCEL_PROJECT_ID}/protection-bypass`, [["teamId", VERCEL_TEAM_ID]]);
  const baselineRequest = readRequest(protection.baseline.request, { method: "GET", url: projectReadUrl, response: protection.baseline.response }, "CLOVER_PROVIDER_PROTECTION_BASELINE_REQUEST");
  const baselineOrdinary = canonicalProtectionSnapshot(protection.baseline.response, "CLOVER_PROVIDER_PROTECTION_BASELINE");
  const createEvidence = exactProviderEvent(protection.create, {
    action: "create", url: bypassUrl, projectReadUrl, readRequest
  }, "CLOVER_PROVIDER_PROTECTION_CREATE");
  const revokeEvidence = exactProviderEvent(protection.revoke, {
    action: "revoke", url: bypassUrl, projectReadUrl, readRequest, expectedCreatedEntry: createEvidence.createdEntry
  }, "CLOVER_PROVIDER_PROTECTION_REVOKE");
  const afterDeploymentProtection = { ...effectsAfter.project.response };
  delete afterDeploymentProtection.projectSettingsSha256;
  delete afterDeploymentProtection.accessPolicySha256;
  const postRevocationProtection = { ...effectsPostRevocation.project.response };
  delete postRevocationProtection.projectSettingsSha256;
  delete postRevocationProtection.accessPolicySha256;
  const postRevocationOrdinary = canonicalProtectionSnapshot(postRevocationProtection, "CLOVER_PROVIDER_POST_REVOCATION_PROTECTION");
  const postRevocationProduction = effectsPostRevocation.deployments.response.entries.filter(({ target }) => target === "production");
  if (
    effectsPostRevocation.project.response.providerProjectUpdatedAt < effectsAfter.project.response.providerProjectUpdatedAt ||
    canonicalJson(stableProjectSnapshot(effectsPostRevocation.project.response)) !== canonicalJson(stableProjectSnapshot(effectsAfter.project.response))
  ) throw new Error("CLOVER_PROVIDER_POST_REVOCATION_PROJECT_CHANGED");
  if (canonicalJson(postRevocationProduction) !== canonicalJson(afterProduction)) {
    throw new Error("CLOVER_PROVIDER_POST_REVOCATION_PRODUCTION_CHANGED");
  }
  if (canonicalJson(effectsPostRevocation.deployments.response) !== canonicalJson(effectsAfter.deployments.response)) {
    throw new Error("CLOVER_PROVIDER_POST_REVOCATION_DEPLOYMENTS_CHANGED");
  }
  for (const [key, error] of [
    ["domains", "CLOVER_PROVIDER_POST_REVOCATION_DOMAINS_CHANGED"],
    ["aliases", "CLOVER_PROVIDER_POST_REVOCATION_ALIASES_CHANGED"],
    ["customEnvironments", "CLOVER_PROVIDER_POST_REVOCATION_CUSTOM_ENVIRONMENTS_CHANGED"],
    ["environmentVariables", "CLOVER_PROVIDER_POST_REVOCATION_ENVIRONMENT_VARIABLES_CHANGED"]
  ]) {
    if (canonicalJson(effectsPostRevocation[key].response) !== canonicalJson(effectsAfter[key].response)) throw new Error(error);
  }
  if (
    effectsAfter.latestResponseObservedTime > baselineRequest.requestStartedTime ||
    baselineRequest.responseObservedTime > createEvidence.earliestRequestStartedTime ||
    createEvidence.latestResponseObservedTime > revokeEvidence.earliestRequestStartedTime ||
    revokeEvidence.latestResponseObservedTime >= effectsPostRevocation.earliestRequestStartedTime ||
    canonicalJson(protection.baseline.response) !== canonicalJson(afterDeploymentProtection) ||
    canonicalJson(baselineOrdinary) !== canonicalJson(postRevocationOrdinary) ||
    canonicalJson(protection.bypassCountSequence) !== "[0,1,0]" ||
    protection.regenerationDisabled !== true || protection.shareUrlCreated !== false || protection.vercelCurlUsed !== false ||
    protection.bypassValueDisclosed !== false || protection.bypassValuePersisted !== false || protection.bypassValueUploaded !== false ||
    protection.bypassValueAttached !== false || protection.bypassValueScreenshotted !== false || protection.ownerLoginRequested !== false ||
    protection.postRevocationAuthenticatedApplicationRequestCount !== 0
  ) throw new Error("CLOVER_PROVIDER_PROTECTION_REJECTED");

  const safeNodeName = (name) => {
    if (typeof name !== "string" || name.length === 0 || name === "." || name === ".." || name !== name.normalize("NFC") || /[\\/\0\r\n]/u.test(name)) throw new Error("CLOVER_PROVIDER_FILE_PATH_REJECTED");
    return name;
  };
  exactKeys(providerDeployment.fileTree, ["request", "response"], "CLOVER_PROVIDER_FILE_TREE_READBACK");
  readRequest(providerDeployment.fileTree.request, {
    method: "GET",
    url: canonicalProviderUrl("v6", `deployments/${raw.id}/files`, [["teamId", VERCEL_TEAM_ID]]),
    response: providerDeployment.fileTree.response
  }, "CLOVER_PROVIDER_FILE_TREE_REQUEST");
  const roots = providerDeployment.fileTree.response;
  if (!Array.isArray(roots)) throw new Error("CLOVER_PROVIDER_FILE_TREE_REJECTED");
  if (roots.length !== 1) throw new Error("CLOVER_PROVIDER_FILE_TREE_REJECTED");
  const src = roots[0];
  exactKeys(src, ["name", "type", "mode", "children"], "CLOVER_PROVIDER_DIRECTORY");
  if (src.name !== "src" || src.type !== "directory" || src.mode !== 0o40555 || !Array.isArray(src.children)) throw new Error("CLOVER_PROVIDER_FILE_TREE_REJECTED");
  const childByName = (directory, name) => {
    const names = directory.children.map((child) => safeNodeName(child.name));
    if (new Set(names).size !== names.length) throw new Error("CLOVER_PROVIDER_DUPLICATE_PATH_REJECTED");
    const matches = directory.children.filter((child) => child.name === name);
    if (matches.length !== 1) throw new Error("CLOVER_PROVIDER_FILE_TREE_REJECTED");
    return matches[0];
  };
  const sourceChildNames = src.children.map((child) => safeNodeName(child.name)).sort(compareUtf8);
  if (canonicalJson(sourceChildNames) !== canonicalJson([".vercel", "out"])) throw new Error("CLOVER_PROVIDER_FILE_TREE_REJECTED");
  const vercel = childByName(src, ".vercel");
  exactKeys(vercel, ["name", "type", "mode", "children"], "CLOVER_PROVIDER_DIRECTORY");
  if (vercel.type !== "directory" || vercel.mode !== 0o40555 || !Array.isArray(vercel.children)) throw new Error("CLOVER_PROVIDER_FILE_TREE_REJECTED");
  if (vercel.children.length !== 1 || safeNodeName(vercel.children[0]?.name) !== "output") throw new Error("CLOVER_PROVIDER_FILE_TREE_REJECTED");
  const output = childByName(vercel, "output");
  exactKeys(output, ["name", "type", "mode", "children"], "CLOVER_PROVIDER_DIRECTORY");
  if (output.type !== "directory" || output.mode !== 0o40555 || !Array.isArray(output.children)) throw new Error("CLOVER_PROVIDER_FILE_TREE_REJECTED");
  const providerOut = childByName(src, "out");
  const validateIgnoredProviderTree = (node) => {
    safeNodeName(node?.name);
    if (node.type === "directory") {
      exactKeys(node, ["name", "type", "mode", "children"], "CLOVER_PROVIDER_IGNORED_DIRECTORY");
      if (node.mode !== 0o40555 || !Array.isArray(node.children)) throw new Error("CLOVER_PROVIDER_IGNORED_DIRECTORY_REJECTED");
      const names = node.children.map((child) => safeNodeName(child.name));
      if (new Set(names).size !== names.length) throw new Error("CLOVER_PROVIDER_DUPLICATE_PATH_REJECTED");
      for (const child of node.children) validateIgnoredProviderTree(child);
      return;
    }
    exactKeys(node, ["name", "type", "mode", "uid"], "CLOVER_PROVIDER_IGNORED_FILE");
    const expectedTypeBits = node.type === "file" ? 0o100000 : 0o120000;
    const permissions = node.mode & 0o7777;
    if (
      node.type !== "file" && node.type !== "symlink" || !Number.isSafeInteger(node.mode) || node.mode < 0 ||
      node.mode !== (expectedTypeBits | permissions) ||
      !(node.type === "file" ? [0o644, 0o664, 0o755] : [0o755, 0o777]).includes(permissions) ||
      typeof node.uid !== "string" || !/^[0-9a-f]{40}$/u.test(node.uid)
    ) throw new Error("CLOVER_PROVIDER_IGNORED_FILE_REJECTED");
  };
  validateIgnoredProviderTree(providerOut);
  const rawEntries = [];
  const flatten = (directory, prefix = "") => {
    const names = directory.children.map((child) => safeNodeName(child.name));
    if (new Set(names).size !== names.length) throw new Error("CLOVER_PROVIDER_DUPLICATE_PATH_REJECTED");
    for (const node of directory.children.sort((left, right) => compareUtf8(left.name, right.name))) {
      const outputPath = exactSourcePath(prefix ? `${prefix}/${node.name}` : node.name);
      if (node.type === "directory") {
        exactKeys(node, ["name", "type", "mode", "children"], "CLOVER_PROVIDER_DIRECTORY");
        if (node.mode !== 0o40555 || !Array.isArray(node.children)) throw new Error("CLOVER_PROVIDER_DIRECTORY_REJECTED");
        rawEntries.push({ type: "directory", path: outputPath, mode: node.mode });
        flatten(node, outputPath);
      } else {
        exactKeys(node, ["name", "type", "mode", "uid"], "CLOVER_PROVIDER_FILE");
        if (node.type !== "file" && node.type !== "symlink" || !Number.isSafeInteger(node.mode) || typeof node.uid !== "string" || !/^[0-9a-f]{40}$/u.test(node.uid)) throw new Error("CLOVER_PROVIDER_FILE_REJECTED");
        const expectedTypeBits = node.type === "file" ? 0o100000 : 0o120000;
        const permissions = node.mode & 0o7777;
        if (
          node.mode < 0 || node.mode !== (expectedTypeBits | permissions) ||
          !(node.type === "file" ? [0o644, 0o664, 0o755] : [0o755, 0o777]).includes(permissions)
        ) throw new Error("CLOVER_PROVIDER_FILE_MODE_REJECTED");
        rawEntries.push({ type: node.type, path: outputPath, mode: node.mode, uid: node.uid });
      }
    }
  };
  flatten(output);
  const contentByPath = new Map();
  for (const candidate of providerDeployment.contents) {
    exactKeys(candidate, ["path", "uid", "request", "response"], "CLOVER_PROVIDER_CONTENT");
    exactKeys(candidate.response, ["data"], "CLOVER_PROVIDER_CONTENT_RESPONSE");
    if (typeof candidate.path !== "string" || !candidate.path.startsWith("src/.vercel/output/") || typeof candidate.uid !== "string" || !/^[0-9a-f]{40}$/u.test(candidate.uid)) throw new Error("CLOVER_PROVIDER_CONTENT_REJECTED");
    const outputPath = exactSourcePath(candidate.path.slice("src/.vercel/output/".length));
    if (contentByPath.has(outputPath)) throw new Error("CLOVER_PROVIDER_CONTENT_DUPLICATE_REJECTED");
    readRequest(candidate.request, {
      method: "GET",
      url: canonicalProviderUrl("v8", `deployments/${raw.id}/files/${candidate.uid}`, [["path", candidate.path], ["teamId", VERCEL_TEAM_ID]]),
      response: candidate.response
    }, "CLOVER_PROVIDER_CONTENT_REQUEST");
    contentByPath.set(outputPath, { uid: candidate.uid, bytes: decodeCanonicalBase64(candidate.response.data, "CLOVER_PROVIDER_FILE_CONTENT") });
  }
  const providerEntries = rawEntries.filter(({ type }) => type !== "directory").map((entry) => {
    const content = contentByPath.get(entry.path);
    if (!content || content.uid !== entry.uid || sha1(content.bytes) !== entry.uid) throw new Error("CLOVER_PROVIDER_UID_REJECTED");
    if (entry.type === "file") return { type: "file", path: entry.path, mode: (entry.mode & 0o7777).toString(8).padStart(4, "0"), bytes: content.bytes.length, sha256: sha256(content.bytes) };
    const target = new TextDecoder("utf-8", { fatal: true }).decode(content.bytes);
    if (path.isAbsolute(target) || target.includes("\0") || target.includes("\\") || /\r|\n/u.test(target) || target !== target.normalize("NFC")) throw new Error("CLOVER_PROVIDER_SYMLINK_REJECTED");
    return { type: "symlink", path: entry.path, mode: (entry.mode & 0o7777).toString(8).padStart(4, "0"), target };
  }).sort((left, right) => compareUtf8(left.path, right.path));
  if (contentByPath.size !== providerEntries.length) throw new Error("CLOVER_PROVIDER_CONTENT_INVENTORY_REJECTED");
  const expectedEntries = [
    ...verifiedEvidence.deploymentInputManifest.files.map((entry) => ({ type: "file", ...entry })),
    ...verifiedEvidence.deploymentInputManifest.symlinks.map((entry) => ({ type: "symlink", ...entry }))
  ].sort((left, right) => compareUtf8(left.path, right.path));
  const expectedDirectories = [...new Set(expectedEntries.flatMap(({ path: outputPath }) => {
    const segments = outputPath.split("/");
    return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("/"));
  }))].sort(compareUtf8);
  const providerDirectories = rawEntries.filter(({ type }) => type === "directory").map(({ path: outputPath }) => outputPath).sort(compareUtf8);
  if (canonicalJson(providerEntries) !== canonicalJson(expectedEntries) || canonicalJson(providerDirectories) !== canonicalJson(expectedDirectories)) throw new Error("CLOVER_PROVIDER_DEPLOYMENT_INPUT_MISMATCH");
  if (requestIntervals.length < 27 || requestIntervals.length !== 27 + providerEntries.length) throw new Error("CLOVER_PROVIDER_OBSERVATION_INVENTORY_REJECTED");
  const earliestRequestStartedTime = Math.min(...requestIntervals.map(({ requestStartedTime }) => requestStartedTime));
  const latestResponseObservedTime = Math.max(...requestIntervals.map(({ responseObservedTime }) => responseObservedTime));
  const postRevocationIntervals = requestIntervals.filter(({ label }) => label.startsWith("CLOVER_PROVIDER_EFFECT_POST_REVOCATION_"));
  const preFinalSnapshotIntervals = requestIntervals.filter(({ label }) => !label.startsWith("CLOVER_PROVIDER_EFFECT_POST_REVOCATION_"));
  const latestPreFinalSnapshotResponseTime = Math.max(...preFinalSnapshotIntervals.map(({ responseObservedTime }) => responseObservedTime));
  if (latestResponseObservedTime - earliestRequestStartedTime > MAX_PROVIDER_REQUEST_DURATION_MS) throw new Error("CLOVER_PROVIDER_OBSERVATION_WINDOW_REJECTED");
  if (
    postRevocationIntervals.length !== 6 || latestPreFinalSnapshotResponseTime >= effectsPostRevocation.earliestRequestStartedTime ||
    latestResponseObservedTime !== effectsPostRevocation.latestResponseObservedTime
  ) throw new Error("CLOVER_PROVIDER_POST_REVOCATION_REQUEST_REJECTED");
  const body = {
    documentType: "clover-tree-provider-deployment-receipt",
    schemaVersion: "0.7.0",
    provider: "vercel",
    generatedAt,
    providerRequestEvidenceSchemaVersion: PROVIDER_REQUEST_EVIDENCE_SCHEMA,
    providerControlPlaneTransportKind: "vercel-api-cli",
    providerControlPlaneRedirectTelemetry: "not-exposed-by-vercel-api-cli",
    providerRequestEarliestStartedAt: new Date(earliestRequestStartedTime).toISOString(),
    providerResponseLatestObservedAt: new Date(latestResponseObservedTime).toISOString(),
    providerRequestSpanMilliseconds: latestResponseObservedTime - earliestRequestStartedTime,
    providerRequestCount: requestIntervals.length,
    projectId: raw.project.id,
    projectName: raw.project.name,
    projectFramework: raw.project.framework,
    teamId: raw.team.id,
    teamName: raw.team.name,
    teamSlug: raw.team.slug,
    deploymentId: raw.id,
    immutableUrl: `https://${raw.url}/`,
    state: "READY",
    target: null,
    aliases: [],
    automaticAliases: [],
    deploymentSource: "cli",
    prebuilt: true,
    runtimeDeploymentKey: raw.userConfiguredDeploymentId,
    sourceRepository: "chrisdortch/first",
    sourceBranch: "feature/clover-tree-command-center-launch-studio-v0.1-20260826",
    sourceCommit: expectedCommit,
    deploymentInputRootSha256: verifiedEvidence.deploymentInputManifest.deploymentInputRootSha256,
    deploymentInputManifestSelfHash: verifiedEvidence.deploymentInputManifest.manifestSelfHash,
    payloadManifestRootSha256: verifiedEvidence.payloadManifest.rootSha256,
    attestationRawSha256: verifiedEvidence.deploymentInputManifest.attestation.rawSha256,
    archiveSha256: verifiedEvidence.archiveManifest.archiveSha256,
    finalRegularFileCount: verifiedEvidence.deploymentInputManifest.finalRegularFileCount,
    finalSymlinkCount: verifiedEvidence.deploymentInputManifest.finalSymlinkCount,
    providerFileContentsRead: true,
    providerDeploymentReadEndpoint: providerDeployment.deployment.request.url,
    providerFileTreeReadEndpoint: providerDeployment.fileTree.request.url,
    providerContentReadCount: providerEntries.length,
    deploymentInvocationSha256: sha256(`${canonicalJson(providerDeployment.deploymentInvocation)}\n`),
    executedDeploymentArgvSha256: sha256(`${canonicalJson(providerDeployment.deploymentInvocation.executedArgv)}\n`),
    deploymentExecutionCount: providerDeployment.deploymentInvocation.executionCount,
    deploymentExecutionStartedAt: providerDeployment.deploymentInvocation.startedAt,
    deploymentExecutionCompletedAt: providerDeployment.deploymentInvocation.completedAt,
    deploymentExecutionExitCode: providerDeployment.deploymentInvocation.exitCode,
    deploymentInvocationReturnedId: providerDeployment.deploymentInvocation.returnedDeploymentId,
    deploymentInvocationReturnedImmutableUrl: providerDeployment.deploymentInvocation.returnedImmutableUrl,
    providerEffectReadCount: 18,
    deploymentCountBefore: beforeDeployments.count,
    deploymentCountAfter: afterDeployments.count,
    deploymentCountPostRevocation: effectsPostRevocation.deployments.response.count,
    newDeploymentCount: 1,
    newDeploymentId: raw.id,
    productionDeploymentCountBefore: beforeProduction.length,
    productionDeploymentCountAfter: afterProduction.length,
    productionDeploymentCountPostRevocation: postRevocationProduction.length,
    productionInventorySha256Before: sha256(`${canonicalJson(beforeProduction)}\n`),
    productionInventorySha256After: sha256(`${canonicalJson(afterProduction)}\n`),
    productionInventorySha256PostRevocation: sha256(`${canonicalJson(postRevocationProduction)}\n`),
    projectSettingsSha256Before: effectsBefore.project.response.projectSettingsSha256,
    projectSettingsSha256After: effectsAfter.project.response.projectSettingsSha256,
    projectSettingsSha256PostRevocation: effectsPostRevocation.project.response.projectSettingsSha256,
    accessPolicySha256Before: effectsBefore.project.response.accessPolicySha256,
    accessPolicySha256After: effectsAfter.project.response.accessPolicySha256,
    accessPolicySha256PostRevocation: effectsPostRevocation.project.response.accessPolicySha256,
    providerProjectUpdatedAtBeforeDeployment: effectsBefore.project.response.providerProjectUpdatedAt,
    providerProjectUpdatedAtAfterDeployment: effectsAfter.project.response.providerProjectUpdatedAt,
    providerProjectUpdatedAtPostRevocation: effectsPostRevocation.project.response.providerProjectUpdatedAt,
    domainInventorySha256Before: effectsBefore.domains.response.inventorySha256,
    domainInventorySha256After: effectsAfter.domains.response.inventorySha256,
    domainInventorySha256PostRevocation: effectsPostRevocation.domains.response.inventorySha256,
    aliasInventorySha256Before: effectsBefore.aliases.response.inventorySha256,
    aliasInventorySha256After: effectsAfter.aliases.response.inventorySha256,
    aliasInventorySha256PostRevocation: effectsPostRevocation.aliases.response.inventorySha256,
    persistentEnvironmentCountBefore: effectsBefore.customEnvironments.response.count,
    persistentEnvironmentCountAfter: effectsAfter.customEnvironments.response.count,
    persistentEnvironmentCountPostRevocation: effectsPostRevocation.customEnvironments.response.count,
    persistentEnvironmentInventorySha256Before: effectsBefore.customEnvironments.response.inventorySha256,
    persistentEnvironmentInventorySha256After: effectsAfter.customEnvironments.response.inventorySha256,
    persistentEnvironmentInventorySha256PostRevocation: effectsPostRevocation.customEnvironments.response.inventorySha256,
    environmentVariableCountBefore: effectsBefore.environmentVariables.response.count,
    environmentVariableCountAfter: effectsAfter.environmentVariables.response.count,
    environmentVariableCountPostRevocation: effectsPostRevocation.environmentVariables.response.count,
    environmentVariableMetadataInventorySha256Before: effectsBefore.environmentVariables.response.inventorySha256,
    environmentVariableMetadataInventorySha256After: effectsAfter.environmentVariables.response.inventorySha256,
    environmentVariableMetadataInventorySha256PostRevocation: effectsPostRevocation.environmentVariables.response.inventorySha256,
    productionTrafficChanged: false,
    projectSettingsChanged: false,
    accessPolicyChanged: false,
    domainsChanged: false,
    aliasesChanged: false,
    persistentEnvironmentsChanged: false,
    environmentVariableMetadataChanged: false,
    providerProjectUpdatedAtBefore: protection.baseline.response.providerProjectUpdatedAt,
    ordinaryProtectionBaselineSha256: sha256(`${canonicalJson(baselineOrdinary)}\n`),
    ordinaryProtectionFinalSha256: sha256(`${canonicalJson(postRevocationOrdinary)}\n`),
    ordinaryProtectionPreservationBasis: "authoritative-post-revocation-full-provider-effect-readback",
    postRevocationProviderEffectSha256: sha256(`${canonicalJson(effects.postRevocation)}\n`),
    postRevocationProviderResponseLatestObservedAt: new Date(effectsPostRevocation.latestResponseObservedTime).toISOString(),
    finalAutomationBypassCount: 0,
    protectionEvidenceSha256: sha256(`${canonicalJson(protection)}\n`),
    automationBypassLifecycle: "0->1->0",
    logicalCreateCallerInvocationCount: protection.create.request.transport.callerInvocationCount,
    logicalRevokeCallerInvocationCount: protection.revoke.request.transport.callerInvocationCount,
    automaticTransportRetryPolicy: "maximum-three-byte-identical-retries",
    createActualWireAttemptCount: protection.create.request.transport.actualWireAttemptCount,
    revokeActualWireAttemptCount: protection.revoke.request.transport.actualWireAttemptCount,
    regenerationDisabled: true,
    postRevocationAuthenticatedApplicationRequestCount: 0,
    ssoProtectionPreserved: true,
    publicSanitized: true,
    privateDataAccessed: false,
    secretsIncluded: false,
    consequentialAuthorityGranted: false
  };
  return Object.freeze({ ...body, receiptSelfHash: sha256(`${canonicalJson(body)}\n`) });
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
  if (command === "source-manifest") {
    process.stdout.write(`${canonicalJson(deriveSourceManifestDocument({ repositoryRoot }))}\n`);
    return;
  }
  if (command === "project-settings") {
    process.stdout.write(`${canonicalJson(canonicalVercelBuildProjectSettings())}\n`);
    return;
  }
  if (command === "output") {
    if (!options.output || !options.evidence || !options["frozen-output"]) throw new Error("output, evidence and frozen-output paths are required");
    const result = createDeploymentAttestation({
      outputRoot: path.resolve(options.output),
      repositoryRoot,
      evidenceDirectory: path.resolve(options.evidence),
      frozenOutputRoot: path.resolve(options["frozen-output"])
    });
    process.stdout.write(`${canonicalJson({
      attestationHash: result.attestation.attestationHash,
      attestationRawSha256: result.attestationRawSha256,
      payloadManifestRootSha256: result.outputManifest.rootSha256,
      payloadManifestRawSha256: result.manifestRawSha256,
      deploymentInputRootSha256: result.deploymentInputManifest.deploymentInputRootSha256,
      deploymentInputManifestSelfHash: result.deploymentInputManifest.manifestSelfHash,
      deploymentInputManifestRawSha256: result.deploymentInputManifestRawSha256,
      archiveSha256: result.archiveSha256,
      archiveBytes: result.archiveBytes,
      archiveManifestSelfHash: result.archiveManifest.manifestSelfHash,
      archiveManifestRawSha256: result.archiveManifestRawSha256,
      cliInvocation: result.cliInvocation,
      frozenOutputReady: result.frozenOutput !== null
    })}\n`);
    return;
  }
  if (command === "verify") {
    if (!options.output || !options.evidence) throw new Error("output and evidence paths are required");
    const verified = verifyDeploymentInputEvidence({
      outputRoot: path.resolve(options.output),
      repositoryRoot,
      evidenceDirectory: path.resolve(options.evidence)
    });
    process.stdout.write(`${canonicalJson({
      sourceCommit: verified.sourceProvenance.commit,
      payloadManifestRootSha256: verified.payloadManifest.rootSha256,
      attestationRawSha256: verified.deploymentInputManifest.attestation.rawSha256,
      deploymentInputRootSha256: verified.deploymentInputManifest.deploymentInputRootSha256,
      deploymentInputManifestSelfHash: verified.deploymentInputManifest.manifestSelfHash,
      archiveSha256: verified.archiveManifest.archiveSha256,
      archiveManifestSelfHash: verified.archiveManifest.manifestSelfHash
    })}\n`);
    return;
  }
  if (command === "receipt") {
    if (!options.output || !options.evidence || !options.provider || !options.receipt) throw new Error("output, evidence, provider and receipt paths are required");
    const verified = verifyDeploymentInputEvidence({
      outputRoot: path.resolve(options.output),
      repositoryRoot,
      evidenceDirectory: path.resolve(options.evidence)
    });
    const provider = readCanonicalDocument(path.resolve(options.provider), "CLOVER_PROVIDER_READBACK").value;
    const receipt = createProviderDeploymentReceipt({ providerDeployment: provider, verifiedEvidence: verified });
    const receiptPath = requireFreshExternalFilePath(options.receipt, realpathSync(options.output), "CLOVER_PROVIDER_RECEIPT_LOCATION");
    writeFileSync(receiptPath, `${canonicalJson(receipt)}\n`, { mode: 0o644, flag: "wx" });
    process.stdout.write(`${canonicalJson(receipt)}\n`);
    return;
  }
  throw new Error("usage: clover-deployment-attestation.mjs <source|source-manifest|project-settings|output|verify|receipt> [options]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
