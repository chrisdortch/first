import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  chmodSync,
  existsSync,
  fstatSync,
  lchmodSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  readSync,
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
const FROZEN_WORKSPACE_ARCHIVE_PREFIX = "workspace/";
const FROZEN_OUTPUT_ARCHIVE_PREFIX = `${FROZEN_WORKSPACE_ARCHIVE_PREFIX}.vercel/output/`;
const EXTERNAL_DEPLOYMENT_INPUT_SCHEMA = "clover-vercel-file-path-map-external-inputs-v2";
const REQUIRED_SERVER_FILES_APP_DIR_ONLY_PROFILE = "next-app-dir-only";
const REQUIRED_SERVER_FILES_EXPANDED_PROFILE = "next-expanded-build-roots";
const REQUIRED_SERVER_FILES_REPOSITORY_ROOT_PROFILE = "next-repository-build-roots-runtime-server-disabled";
const REQUIRED_SERVER_FILES_PATH = "apps/clover-launch-studio/.next/required-server-files.json";
const EXTERNAL_DEPLOYMENT_INPUT_ROOTS = Object.freeze([
  "apps/clover-launch-studio/.next/",
  "apps/clover-launch-studio/node_modules/"
]);
const PINNED_VENDOR_GENERIC_PATH_SAMPLE = Object.freeze({
  path: "apps/clover-launch-studio/node_modules/next/dist/server/patch-error-inspect.js",
  sha256: "7827c52811c9e79838881ec81dc22933682d26e36500d75f5e2184732317914b"
});

export const ATTESTATION_REPAIR_BASE = "63a1614c11014efffdb6724ea6044e3bddac686a";
export const ATTESTATION_REPAIR_BRANCH = "codex/clover-provider-attestation-compat-20260908";
export const ATTESTATION_REPAIR_CONTEXT = "local-attestation-compatibility-repair";
export const ATTESTATION_REPAIR_CI_CONTEXT = "ci-attestation-compatibility-repair";
export const ATTESTATION_REPAIR_PATHS = Object.freeze([
  ".github/workflows/validate-clover-tree-command-center.yml",
  "apps/clover-launch-studio/scripts/clover-deployment-attestation.mjs",
  "apps/clover-launch-studio/test/live-truth-attestation.test.mjs",
  "apps/clover-launch-studio/test/tree-command-center.e2e.spec.ts"
]);

// A separate local-only source contract. Historical D18–D20 campaign predicates stay unchanged.
export function deriveAttestationRepairSource({ repositoryRoot, environment = process.env } = {}) {
  const ci = environment.GITHUB_ACTIONS === "true";
  const context = environment.CLOVER_TREE_LOCAL_SOURCE_CLOSURE_CONTEXT;
  if (!repositoryRoot || ![undefined, "false", "true"].includes(environment.GITHUB_ACTIONS)
    || ci && (context !== ATTESTATION_REPAIR_CI_CONTEXT || environment.GITHUB_EVENT_NAME !== "pull_request"
      || environment.GITHUB_HEAD_REF !== ATTESTATION_REPAIR_BRANCH || !/^[1-9][0-9]*$/u.test(environment.CLOVER_TREE_PR_NUMBER ?? "")
      || !Number.isSafeInteger(Number(environment.CLOVER_TREE_PR_NUMBER)) || environment.CLOVER_TREE_PR_NUMBER === "35" || !/^[0-9a-f]{40}$/u.test(environment.CLOVER_TREE_EXACT_PR_HEAD ?? ""))
    || !ci && (context !== ATTESTATION_REPAIR_CONTEXT || environment.CLOVER_TREE_EXACT_PR_HEAD)) throw new Error("CLOVER_REPAIR_CONTEXT_REJECTED");
  const forbiddenGitEnvironment = (values) => Object.keys(values).some((key) => key.startsWith("GIT_") && !["GIT_PAGER", "GIT_TERMINAL_PROMPT"].includes(key) && values[key] !== undefined);
  if (forbiddenGitEnvironment(process.env) || forbiddenGitEnvironment(environment)) throw new Error("CLOVER_REPAIR_GIT_ENVIRONMENT_REJECTED");
  const root = realpathSync(repositoryRoot);
  if (ci && (typeof environment.GITHUB_WORKSPACE !== "string" || realpathSync(environment.GITHUB_WORKSPACE) !== root)) throw new Error("CLOVER_REPAIR_GIT_ROOT_REJECTED");
  if (realpathSync(git(root, ["rev-parse", "--show-toplevel"]).trim()) !== root
    || git(root, ["rev-parse", "--is-shallow-repository"]).trim() !== "false"
    || git(root, ["for-each-ref", "--format=%(refname)", "refs/replace"]).trim() !== ""
    || existsSync(path.resolve(root, git(root, ["rev-parse", "--git-path", "info/grafts"]).trim()))) throw new Error("CLOVER_REPAIR_GIT_ROOT_REJECTED");
  if (git(root, ["status", "--porcelain=v1", "--untracked-files=all"]) !== "") throw new Error("CLOVER_REPAIR_DIRTY_SOURCE_REJECTED");
  const checkoutBranch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  const branch = ci ? environment.GITHUB_HEAD_REF : checkoutBranch;
  const head = git(root, ["rev-parse", "HEAD^{commit}"]).trim();
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]).trim();
  if (branch !== ATTESTATION_REPAIR_BRANCH || ci && !["HEAD", ATTESTATION_REPAIR_BRANCH].includes(checkoutBranch)
    || ci && (environment.CLOVER_TREE_HEAD !== head || environment.CLOVER_TREE_EXACT_PR_HEAD !== head)
    || environment.CLOVER_TREE_HEAD && environment.CLOVER_TREE_HEAD !== head
    || git(root, ["rev-parse", `${ATTESTATION_REPAIR_BASE}^{tree}`]).trim() !== "f6dffad3a87b0557f3a312bcf3e88eac1e3c8f9a"
    || git(root, ["show", "-s", "--format=%P", ATTESTATION_REPAIR_BASE]).trim() !== "8d609c08c3a88a0ed8805200abcff96fe5c76f94") throw new Error("CLOVER_REPAIR_IDENTITY_REJECTED");
  git(root, ["merge-base", "--is-ancestor", ATTESTATION_REPAIR_BASE, head]);
  const commits = git(root, ["rev-list", "--reverse", `${ATTESTATION_REPAIR_BASE}..${head}`]).trim().split("\n");
  if (commits.length < 1 || commits.length > 3 || commits[0] === "") throw new Error("CLOVER_REPAIR_DEPTH_REJECTED");
  let parent = ATTESTATION_REPAIR_BASE;
  const inspectDelta = (before, after) => {
    const changes = parseSourceChanges(git(root, ["diff", "--no-ext-diff", "--no-textconv", "--name-status", "--no-renames", "-z", before, after], { encoding: null }));
    if (changes.length === 0 || changes.some((entry) => entry.status !== "M" || !ATTESTATION_REPAIR_PATHS.includes(entry.path))) throw new Error("CLOVER_REPAIR_PATH_REJECTED");
    for (const entry of changes) {
      const base = sourceObject(root, before, entry.path);
      const current = sourceObject(root, after, entry.path);
      decodeUtf8Fatal(sourceBytes(root, before, entry.path), "CLOVER_REPAIR_TEXT");
      decodeUtf8Fatal(sourceBytes(root, after, entry.path), "CLOVER_REPAIR_TEXT");
      if (base.mode !== "100644" || current.mode !== "100644" || base.blob === current.blob
        || sourceBytes(root, before, entry.path).includes(0) || sourceBytes(root, after, entry.path).includes(0)) throw new Error("CLOVER_REPAIR_BLOB_REJECTED");
    }
    return changes.map(({ path: changedPath }) => changedPath).sort(compareUtf8);
  };
  for (const commit of commits) {
    if (git(root, ["show", "-s", "--format=%P", commit]).trim() !== parent) throw new Error("CLOVER_REPAIR_LINEARITY_REJECTED");
    inspectDelta(parent, commit);
    parent = commit;
  }
  const paths = inspectDelta(ATTESTATION_REPAIR_BASE, head);
  const body = {
    schemaVersion: "clover-local-attestation-repair-source-v1",
    classification: ci ? "ci-repair-candidate" : "local-repair-candidate",
    taskId: "CLOVER-ATTESTATION-COMPATIBILITY-20260908-A",
    context, githubActions: ci, pullRequestNumber: ci ? Number(environment.CLOVER_TREE_PR_NUMBER) : null, branch, head, tree,
    parent: git(root, ["show", "-s", "--format=%P", head]).trim(),
    base: ATTESTATION_REPAIR_BASE, baseTree: "f6dffad3a87b0557f3a312bcf3e88eac1e3c8f9a",
    commitIds: commits, localCommitCount: commits.length, paths,
    pathListSha256: sha256(`${paths.join("\n")}\n`),
    allowedPathListSha256: "bfd0214a1dd7f91010fcdcb5a9a4b6286023a3624d7714801fbb27d4bc2bb28b",
    diffSha256: sha256(git(root, ["diff", "--no-ext-diff", "--no-textconv", "--binary", "--full-index", "--no-renames", ATTESTATION_REPAIR_BASE, head], { encoding: null })),
    cleanWorktree: true, linearFirstParent: true, exactPrHeadAcceptance: false,
    providerAcceptance: false, consequentialAuthorityGranted: false, deploymentAllowanceGranted: false
  };
  return Object.freeze({ ...body, sourceProofSelfHash: sha256(`${canonicalJson(body)}\n`) });
}

export const DEPENDENCY_SUCCESSOR_TASK = "CLOVER-DEPENDENCY-REMEDIATION-20260908-B";
export const DEPENDENCY_SUCCESSOR_BASE = "9f6e8303267ca163cbd838ce84b3115ca04b775b";
export const DEPENDENCY_SUCCESSOR_BASE_TREE = "96370cc2b3057b8a91d433fcf0a1836211e7c53a";
export const DEPENDENCY_SUCCESSOR_BRANCH = "codex/clover-dependency-security-20260908";
export const DEPENDENCY_SUCCESSOR_CONTEXT = "local-dependency-security-successor";
export const DEPENDENCY_SUCCESSOR_REQUIRED_PATHS = Object.freeze([
  "apps/clover-context-gateway/package-lock.json",
  "apps/clover-context-gateway/package.json",
  "apps/clover-launch-studio/package-lock.json"
]);
export const DEPENDENCY_SUCCESSOR_PATHS = Object.freeze([
  ...ATTESTATION_REPAIR_PATHS,
  ...DEPENDENCY_SUCCESSOR_REQUIRED_PATHS,
  "apps/clover-context-gateway/server.js",
  "apps/clover-context-gateway/test/serverless-mcp.test.js",
  "apps/clover-launch-studio/package.json"
].sort(compareUtf8));
export const DEPENDENCY_SUCCESSOR_LOCKS = Object.freeze([
  Object.freeze({ path: "apps/clover-context-gateway/package-lock.json",
    baseSha256: "d107042705a781c955276edc0ee52e9dc509103b6d45f075cc1f519eba23f58a",
    sha256: "de24b0ed2068eee232997e25b68e12b83d868c75c51d48ed7a0e8e3a4eb44f24" }),
  Object.freeze({ path: "apps/clover-launch-studio/package-lock.json",
    baseSha256: "00cd94570f127463be83e330efe0af7e01349fb6fcc21596bb897ec3aa0d864b",
    sha256: "301241419abf43e182c0327f0e2fe178f45de369ae230f95d0b2fcbf5ad0146c" })
]);

// This successor has its own local evidence contract; neither historical contract accepts its dependency edits.
export function deriveDependencySuccessorSource({ repositoryRoot, environment = process.env } = {}) {
  const context = environment.CLOVER_TREE_LOCAL_SOURCE_CLOSURE_CONTEXT;
  if (!repositoryRoot || ![undefined, "false"].includes(environment.GITHUB_ACTIONS)
    || context !== DEPENDENCY_SUCCESSOR_CONTEXT
    || ["CLOVER_TREE_EXACT_PR_HEAD", "CLOVER_TREE_PR_NUMBER", "GITHUB_HEAD_REF", "GITHUB_EVENT_NAME", "CLOVER_TREE_BROWSER_EVIDENCE_MODE"]
      .some((key) => environment[key] !== undefined)
    || Object.keys(environment).some((key) => key.startsWith("CLOVER_TREE_PROTECTED_PREVIEW_") && environment[key] !== undefined)
    || ![undefined, "false"].includes(environment.CLOVER_DEPENDENCY_RELEASE_AUTHORITY)) throw new Error("CLOVER_DEPENDENCY_CONTEXT_REJECTED");
  const forbiddenGitEnvironment = (values) => Object.keys(values).some((key) => key.startsWith("GIT_")
    && !["GIT_PAGER", "GIT_TERMINAL_PROMPT"].includes(key) && values[key] !== undefined);
  if (forbiddenGitEnvironment(process.env) || forbiddenGitEnvironment(environment)) throw new Error("CLOVER_DEPENDENCY_GIT_ENVIRONMENT_REJECTED");
  const root = realpathSync(repositoryRoot);
  if (realpathSync(git(root, ["rev-parse", "--show-toplevel"]).trim()) !== root
    || git(root, ["rev-parse", "--is-shallow-repository"]).trim() !== "false"
    || git(root, ["for-each-ref", "--format=%(refname)", "refs/replace"]).trim() !== ""
    || existsSync(path.resolve(root, git(root, ["rev-parse", "--git-path", "info/grafts"]).trim()))
    || environment.GITHUB_WORKSPACE !== undefined && realpathSync(environment.GITHUB_WORKSPACE) !== root) throw new Error("CLOVER_DEPENDENCY_GIT_ROOT_REJECTED");
  const requireVisibleTrackedSource = () => {
    for (const flagView of ["-v", "-f"]) {
      const entries = decodeUtf8Fatal(git(root, ["ls-files", flagView, "-z"], { encoding: null }), "CLOVER_DEPENDENCY_INDEX").split("\0");
      if (entries.pop() !== "" || entries.length === 0 || entries.some((entry) => !entry.startsWith("H ")))
        throw new Error("CLOVER_DEPENDENCY_HIDDEN_INDEX_STATE_REJECTED");
    }
  };
  requireVisibleTrackedSource();
  if (git(root, ["status", "--porcelain=v1", "--untracked-files=all"]) !== "") throw new Error("CLOVER_DEPENDENCY_DIRTY_SOURCE_REJECTED");
  const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  const head = git(root, ["rev-parse", "HEAD^{commit}"]).trim();
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]).trim();
  if (branch !== DEPENDENCY_SUCCESSOR_BRANCH || environment.CLOVER_TREE_HEAD !== undefined && environment.CLOVER_TREE_HEAD !== head
    || git(root, ["rev-parse", `${DEPENDENCY_SUCCESSOR_BASE}^{tree}`]).trim() !== DEPENDENCY_SUCCESSOR_BASE_TREE
    || git(root, ["show", "-s", "--format=%P", DEPENDENCY_SUCCESSOR_BASE]).trim() !== ATTESTATION_REPAIR_BASE) throw new Error("CLOVER_DEPENDENCY_IDENTITY_REJECTED");
  try { git(root, ["merge-base", "--is-ancestor", DEPENDENCY_SUCCESSOR_BASE, head]); }
  catch { throw new Error("CLOVER_DEPENDENCY_BASE_REJECTED"); }
  const commits = git(root, ["rev-list", "--reverse", `${DEPENDENCY_SUCCESSOR_BASE}..${head}`]).trim().split("\n");
  if (commits.length < 1 || commits.length > 3 || commits[0] === "") throw new Error("CLOVER_DEPENDENCY_DEPTH_REJECTED");
  const inspectDelta = (before, after) => {
    const changes = parseSourceChanges(git(root, ["diff", "--no-ext-diff", "--no-textconv", "--name-status", "--no-renames", "-z", before, after], { encoding: null }));
    if (changes.length === 0 || changes.some((entry) => entry.status !== "M" || !DEPENDENCY_SUCCESSOR_PATHS.includes(entry.path))) throw new Error("CLOVER_DEPENDENCY_PATH_REJECTED");
    for (const entry of changes) {
      const prior = sourceObject(root, before, entry.path);
      const current = sourceObject(root, after, entry.path);
      const priorBytes = sourceBytes(root, before, entry.path);
      const currentBytes = sourceBytes(root, after, entry.path);
      decodeUtf8Fatal(priorBytes, "CLOVER_DEPENDENCY_TEXT"); decodeUtf8Fatal(currentBytes, "CLOVER_DEPENDENCY_TEXT");
      if (prior.mode !== "100644" || current.mode !== "100644" || prior.blob === current.blob
        || priorBytes.includes(0) || currentBytes.includes(0)) throw new Error("CLOVER_DEPENDENCY_BLOB_REJECTED");
    }
    return changes.map(({ path: changedPath }) => changedPath).sort(compareUtf8);
  };
  let parent = DEPENDENCY_SUCCESSOR_BASE;
  for (const commit of commits) {
    if (git(root, ["show", "-s", "--format=%P", commit]).trim() !== parent) throw new Error("CLOVER_DEPENDENCY_LINEARITY_REJECTED");
    inspectDelta(parent, commit); parent = commit;
  }
  const paths = inspectDelta(DEPENDENCY_SUCCESSOR_BASE, head);
  if (!DEPENDENCY_SUCCESSOR_REQUIRED_PATHS.every((required) => paths.includes(required))) throw new Error("CLOVER_DEPENDENCY_REQUIRED_PATH_REJECTED");
  const lockfiles = DEPENDENCY_SUCCESSOR_LOCKS.map((expected) => {
    const base = sourceObject(root, DEPENDENCY_SUCCESSOR_BASE, expected.path);
    const current = sourceObject(root, head, expected.path);
    if (!/^[0-9a-f]{64}$/u.test(expected.sha256) || expected.sha256 === expected.baseSha256
      || base.sha256 !== expected.baseSha256 || current.sha256 !== expected.sha256
      || sha256(readFileSync(path.join(root, expected.path))) !== expected.sha256) throw new Error("CLOVER_DEPENDENCY_LOCK_REJECTED");
    return { ...current, baseSha256: base.sha256 };
  });
  const body = {
    schemaVersion: "clover-local-dependency-successor-source-v1", classification: "local-dependency-security-candidate",
    taskId: DEPENDENCY_SUCCESSOR_TASK, context, githubActions: false, pullRequestNumber: null, branch, head, tree,
    parent: git(root, ["show", "-s", "--format=%P", head]).trim(),
    base: DEPENDENCY_SUCCESSOR_BASE, baseTree: DEPENDENCY_SUCCESSOR_BASE_TREE,
    commitIds: commits, localCommitCount: commits.length, changedPathCount: paths.length, paths,
    pathListSha256: sha256(`${paths.join("\n")}\n`), allowedPathListSha256: sha256(`${DEPENDENCY_SUCCESSOR_PATHS.join("\n")}\n`),
    diffSha256: sha256(git(root, ["diff", "--no-ext-diff", "--no-textconv", "--binary", "--full-index", "--no-renames", DEPENDENCY_SUCCESSOR_BASE, head], { encoding: null })),
    sourceFiles: paths.map((sourcePath) => sourceObject(root, head, sourcePath)), lockfiles,
    cleanWorktree: true, linearFirstParent: true, exactPrHeadAcceptance: false, releaseAuthority: false,
    providerAcceptance: false, consequentialAuthorityGranted: false, deploymentAllowanceGranted: false
  };
  if (git(root, ["rev-parse", "HEAD^{commit}"]).trim() !== head
    || git(root, ["status", "--porcelain=v1", "--untracked-files=all"]) !== "") throw new Error("CLOVER_DEPENDENCY_SOURCE_CHANGED_DURING_PROOF");
  requireVisibleTrackedSource();
  return Object.freeze({ ...body, sourceProofSelfHash: sha256(`${canonicalJson(body)}\n`) });
}

export const CI_PREVIEW_READINESS_TASK = "CLOVER-CI-PREVIEW-READINESS-20260909-A";
export const CI_PREVIEW_READINESS_BASE = "356274f97c6a9cd02a30fb941688b2e24a00ab8e";
export const CI_PREVIEW_READINESS_BASE_TREE = "b975d7683f4a6e4bc510bf2bb66b789273fd79d5";
export const CI_PREVIEW_READINESS_BRANCH = "codex/clover-ci-preview-readiness-20260909";
export const CI_PREVIEW_READINESS_CONTEXT = "local-ci-preview-readiness";
export const CI_PREVIEW_READINESS_CI_CONTEXT = "ci-preview-readiness";

export const CI_PREVIEW_FOURTH_PARENT = "727fb0e4c569ff54db1be67c41616896f09b0aea";
export const CI_PREVIEW_FOURTH_PREFIX = Object.freeze([
  "7c1f817e973c260266e937ff3328e21b715db7c6",
  "337816e15d29f66a2ac0011b6413d688e752a01d",
  CI_PREVIEW_FOURTH_PARENT
]);
export const CI_PREVIEW_FOURTH_PATHS = Object.freeze([
  ".github/workflows/validate-clover-tree-command-center.yml",
  "apps/clover-launch-studio/scripts/clover-deployment-attestation.mjs",
  "apps/clover-launch-studio/test/live-truth-attestation.test.mjs"
]);
export const CI_PREVIEW_FIFTH_PARENT = "f0591972971036fd4258429ed363b71f23b8516a";
export const CI_PREVIEW_FIFTH_PARENT_TREE = "92f8efe9f72b927e35bd4dbefca0c7fd13ce936e";
export const CI_PREVIEW_FIFTH_PREFIX = Object.freeze([...CI_PREVIEW_FOURTH_PREFIX, CI_PREVIEW_FIFTH_PARENT]);
export const CI_PREVIEW_SIXTH_PARENT = "0fc5ff64280b30e578a39afee85a87385e86de11";
export const CI_PREVIEW_SIXTH_PARENT_TREE = "b986fa4081643ca6b9c6126e88f10340f9591f03";
export const CI_PREVIEW_SIXTH_PREFIX = Object.freeze([...CI_PREVIEW_FIFTH_PREFIX, CI_PREVIEW_SIXTH_PARENT]);
export const CI_PREVIEW_SIXTH_PATHS = Object.freeze([
  "apps/clover-launch-studio/scripts/clover-deployment-attestation.mjs",
  "apps/clover-launch-studio/test/live-truth-attestation.test.mjs"
]);
export const CI_PREVIEW_SUCCESSOR_ANCHOR = "34f98ea75c2c5ac5828623f9a5cfb214d1a69f58";
export const CI_PREVIEW_SUCCESSOR_ANCHOR_TREE = "6bcded46c1fe824ef8b381446326d015316fa36f";
export const CI_PREVIEW_SUCCESSOR_PREFIX = Object.freeze([...CI_PREVIEW_SIXTH_PREFIX, CI_PREVIEW_SUCCESSOR_ANCHOR]);
export const CI_PREVIEW_SUCCESSOR_ADDED_PATHS = Object.freeze([
  "apps/clover-launch-studio/scripts/clover-ci-https-apt.mjs",
  "apps/clover-launch-studio/test/clover-ci-https-apt.test.mjs"
]);
export const CI_PREVIEW_SUCCESSOR_PATHS = Object.freeze([...CI_PREVIEW_FOURTH_PATHS, ...CI_PREVIEW_SUCCESSOR_ADDED_PATHS].sort(compareUtf8));
const CI_PREVIEW_SUCCESSOR_CUMULATIVE_PATHS = Object.freeze([...ATTESTATION_REPAIR_PATHS, ...CI_PREVIEW_SUCCESSOR_ADDED_PATHS].sort(compareUtf8));
// This tag is never serialized. A copied or deserialized provisional binding must be
// derived again from Git, or supplied as an independently checked, complete v4 receipt.
const ciProvisionalProfiles = new WeakMap();
const CI_SUCCESSOR_PROFILE = "exact-34f98ea-successor";
const CI_SUCCESSOR_FIELDS = ["successorAnchor", "successorCommitPaths", "successorDelta", "successorDiffSha256"];
const CI_PREVIEW_FOURTH_PARENT_TREE = "80f3c0014424f69aa6536ed30f941478c72ae179";
const CI_PROVIDER_ORIGIN = "https://api.github.com";
const CI_PROVIDER_REPOSITORY = "chrisdortch/first";
const CI_PROVIDER_REPOSITORY_ID = 1231415392;
const CI_PROVIDER_API_VERSION = "2026-03-10";
const CI_PROVIDER_FILE = "clover-ci-provider-proof.json";
const CI_PROVIDER_MAX_BYTES = 2 * 1024 * 1024;
const ciSha = (value) => typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
const ciId = (value) => typeof value === "string" && /^[1-9][0-9]{0,15}$/u.test(value) && Number.isSafeInteger(Number(value));
const ciNumber = (value) => Number.isSafeInteger(value) && value > 0;
const ciRef = (value) => typeof value === "string" && (value === "refs/heads/" + CI_PREVIEW_READINESS_BRANCH
  || value === "refs/heads/" + DEPENDENCY_SUCCESSOR_BRANCH || value === "refs/heads/main"
  || /^refs\/pull\/[1-9][0-9]{0,15}\/merge$/u.test(value));
const ciWorkflowRef = (value) => typeof value === "string"
  && value.startsWith(CI_PROVIDER_REPOSITORY + "/" + ATTESTATION_REPAIR_PATHS[0] + "@")
  && ciRef(value.slice((CI_PROVIDER_REPOSITORY + "/" + ATTESTATION_REPAIR_PATHS[0] + "@").length));

// Historical LOCAL limits remain intact; only the exact frozen prefix permits the fifth tail.
export function isAllowedCiPreviewReadinessLineage({ commitIds, head, parent, parentTree, fourthCommitPaths, fifthCommitPaths = null, sixthCommitPaths }) {
  if (!Array.isArray(commitIds) || commitIds.length < 1 || commitIds.length > 6
    || !commitIds.every(ciSha) || new Set(commitIds).size !== commitIds.length
    || commitIds.at(-1) !== head || parent !== (commitIds.at(-2) ?? CI_PREVIEW_READINESS_BASE)) return false;
  if (commitIds.length < 6 && sixthCommitPaths !== undefined) return false;
  if (commitIds.length <= 3) return fourthCommitPaths === null && fifthCommitPaths === null;
  const scopedPaths = (paths) => Array.isArray(paths) && paths.length > 0
    && new Set(paths).size === paths.length
    && canonicalJson(paths) === canonicalJson([...paths].sort(compareUtf8))
    && paths.every((entry) => CI_PREVIEW_FOURTH_PATHS.includes(entry));
  if (!CI_PREVIEW_FOURTH_PREFIX.every((sha, index) => commitIds[index] === sha) || !scopedPaths(fourthCommitPaths)) return false;
  if (commitIds.length === 4) return parent === CI_PREVIEW_FOURTH_PARENT && fifthCommitPaths === null;
  if (!CI_PREVIEW_FIFTH_PREFIX.every((sha, index) => commitIds[index] === sha) || !scopedPaths(fifthCommitPaths)) return false;
  if (commitIds.length === 5) return parent === CI_PREVIEW_FIFTH_PARENT && parentTree === CI_PREVIEW_FIFTH_PARENT_TREE;
  return CI_PREVIEW_SIXTH_PREFIX.every((sha, index) => commitIds[index] === sha)
    && parent === CI_PREVIEW_SIXTH_PARENT && parentTree === CI_PREVIEW_SIXTH_PARENT_TREE
    && Array.isArray(sixthCommitPaths) && canonicalJson(sixthCommitPaths) === canonicalJson(CI_PREVIEW_SIXTH_PATHS);
}

export function isAllowedCiPreviewSuccessorLineage(binding) {
  const { commitIds, head, parent, parentTree, fourthCommitPaths, fifthCommitPaths, sixthCommitPaths,
    successorAnchor, successorCommitPaths } = binding ?? {};
  return Array.isArray(commitIds) && commitIds.length === 7 && commitIds.every(ciSha)
    && new Set(commitIds).size === 7 && commitIds.at(-1) === head
    && CI_PREVIEW_SUCCESSOR_PREFIX.every((commit, index) => commitIds[index] === commit)
    && parent === CI_PREVIEW_SUCCESSOR_ANCHOR && parentTree === CI_PREVIEW_SUCCESSOR_ANCHOR_TREE
    && canonicalJson(successorAnchor) === canonicalJson({ head: CI_PREVIEW_SUCCESSOR_ANCHOR, tree: CI_PREVIEW_SUCCESSOR_ANCHOR_TREE })
    && canonicalJson(fourthCommitPaths) === canonicalJson(CI_PREVIEW_FOURTH_PATHS)
    && canonicalJson(fifthCommitPaths) === canonicalJson(CI_PREVIEW_FOURTH_PATHS)
    && canonicalJson(sixthCommitPaths) === canonicalJson(CI_PREVIEW_SIXTH_PATHS)
    && canonicalJson(successorCommitPaths) === canonicalJson(CI_PREVIEW_SUCCESSOR_PATHS);
}

const ciReadinessProofKeys = ["schemaVersion", "classification", "taskId", "context", "githubActions", "pullRequestNumber", "branch", "head", "tree", "ciExecution",
  "fullMainPathCount", "fullMainPathListSha256", "sourceManifestSha256", "parent", "parentTree", "base", "baseTree", "commitIds", "localCommitCount", "fourthCommitPaths", "fifthCommitPaths",
  "changedPathCount", "paths", "pathListSha256", "allowedPathListSha256", "diffSha256", "sourceFiles", "lockfiles", "cleanWorktree", "linearFirstParent",
  "exactPrHeadAcceptance", "releaseAuthority", "providerAcceptance", "consequentialAuthorityGranted", "deploymentAllowanceGranted", "sourceProofSelfHash"];

export function validateCiPreviewSuccessorSourceProof(proof) {
  const reject = (condition) => { if (!condition) throw new Error("CLOVER_READINESS_SUCCESSOR_PROOF_REJECTED"); };
  reject(proof && typeof proof === "object" && !Array.isArray(proof));
  exactKeys(proof, [...ciReadinessProofKeys, "sixthCommitPaths", ...CI_SUCCESSOR_FIELDS], "CLOVER_READINESS_SUCCESSOR_PROOF");
  const { sourceProofSelfHash, ...body } = proof;
  const digest = (value) => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
  reject(proof.schemaVersion === "clover-ci-preview-readiness-source-v4"
    && digest(sourceProofSelfHash) && sha256(canonicalJson(body) + "\n") === sourceProofSelfHash
    && isAllowedCiPreviewSuccessorLineage(proof) && ciSha(proof.tree)
    && proof.taskId === CI_PREVIEW_READINESS_TASK && proof.branch === CI_PREVIEW_READINESS_BRANCH
    && proof.base === CI_PREVIEW_READINESS_BASE && proof.baseTree === CI_PREVIEW_READINESS_BASE_TREE
    && proof.localCommitCount === 7 && proof.fullMainPathCount === 77
    && proof.changedPathCount === CI_PREVIEW_SUCCESSOR_CUMULATIVE_PATHS.length
    && canonicalJson(proof.paths) === canonicalJson(CI_PREVIEW_SUCCESSOR_CUMULATIVE_PATHS)
    && proof.pathListSha256 === sha256(proof.paths.join("\n") + "\n")
    && proof.allowedPathListSha256 === proof.pathListSha256
    && [proof.fullMainPathListSha256, proof.sourceManifestSha256, proof.diffSha256, proof.successorDiffSha256].every(digest)
    && proof.cleanWorktree === true && proof.linearFirstParent === true
    && ["exactPrHeadAcceptance", "releaseAuthority", "providerAcceptance", "consequentialAuthorityGranted", "deploymentAllowanceGranted"].every((key) => proof[key] === false));
  const ci = proof.context === CI_PREVIEW_READINESS_CI_CONTEXT;
  reject([CI_PREVIEW_READINESS_CONTEXT, CI_PREVIEW_READINESS_CI_CONTEXT].includes(proof.context)
    && proof.githubActions === ci && proof.classification === (ci ? "ci-readiness-candidate" : "local-readiness-candidate")
    && (ci ? proof.pullRequestNumber === 36 && proof.ciExecution?.schemaVersion === "clover-ci-execution-identity-v2"
      : proof.pullRequestNumber === null && proof.ciExecution === null));
  const object = (entry, sourcePath) => {
    exactKeys(entry, ["path", "mode", "blob", "bytes", "sha256"], "CLOVER_READINESS_SUCCESSOR_OBJECT");
    reject(entry.path === sourcePath && entry.mode === "100644" && ciSha(entry.blob)
      && Number.isSafeInteger(entry.bytes) && entry.bytes > 0 && digest(entry.sha256));
  };
  reject(Array.isArray(proof.sourceFiles) && proof.sourceFiles.length === proof.paths.length);
  proof.sourceFiles.forEach((entry, index) => object(entry, proof.paths[index]));
  reject(Array.isArray(proof.successorDelta) && proof.successorDelta.length === CI_PREVIEW_SUCCESSOR_PATHS.length);
  proof.successorDelta.forEach((entry, index) => {
    exactKeys(entry, ["path", "status", "before", "after"], "CLOVER_READINESS_SUCCESSOR_DELTA");
    const sourcePath = CI_PREVIEW_SUCCESSOR_PATHS[index], added = CI_PREVIEW_SUCCESSOR_ADDED_PATHS.includes(sourcePath);
    reject(entry.path === sourcePath && entry.status === (added ? "A" : "M"));
    object(entry.after, sourcePath);
    reject(canonicalJson(entry.after) === canonicalJson(proof.sourceFiles.find((file) => file.path === sourcePath)));
    if (added) reject(entry.before === null);
    else { object(entry.before, sourcePath); reject(entry.before.blob !== entry.after.blob && entry.before.sha256 !== entry.after.sha256); }
  });
  reject(Array.isArray(proof.lockfiles) && proof.lockfiles.length === DEPENDENCY_SUCCESSOR_LOCKS.length);
  proof.lockfiles.forEach((entry, index) => {
    const expected = DEPENDENCY_SUCCESSOR_LOCKS[index];
    exactKeys(entry, ["path", "mode", "blob", "bytes", "sha256", "baseSha256"], "CLOVER_READINESS_SUCCESSOR_LOCK");
    const { baseSha256, ...identity } = entry; object(identity, expected.path);
    reject(baseSha256 === expected.sha256 && entry.sha256 === expected.sha256);
  });
  return proof;
}

function ciSourceProfile(binding) {
  if (binding?.schemaVersion === "clover-ci-preview-readiness-source-v4") {
    validateCiPreviewSuccessorSourceProof(binding);
    return CI_SUCCESSOR_PROFILE;
  }
  if (ciProvisionalProfiles.get(binding) === CI_SUCCESSOR_PROFILE) {
    ciProofRequire(binding.schemaVersion === undefined && isAllowedCiPreviewSuccessorLineage(binding), "SOURCE_PROFILE");
    return CI_SUCCESSOR_PROFILE;
  }
  ciProofRequire(binding && !CI_SUCCESSOR_FIELDS.some((key) => Object.hasOwn(binding, key))
    && [undefined, "clover-ci-preview-readiness-source-v2", "clover-ci-preview-readiness-source-v3"].includes(binding.schemaVersion)
    && isAllowedCiPreviewReadinessLineage(binding)
    && (binding.schemaVersion === undefined || binding.schemaVersion === "clover-ci-preview-readiness-source-v3"
      ? binding.schemaVersion === undefined || binding.commitIds.length === 6 : binding.commitIds.length <= 5), "SOURCE_LINEAGE");
  return "historical";
}

// Source expectations precede provider responses. The four-commit case only describes the exact
// retained f059 source for explicit historical replay. Earlier fifth proof consistency remains intact;
// actual new CI source derivation requires the explicitly anchored sixth tail.
function verifyCiProviderSourceBinding(binding, head, tree) {
  const successor = ciSourceProfile(binding) === CI_SUCCESSOR_PROFILE;
  ciProofRequire(binding && (successor ? isAllowedCiPreviewSuccessorLineage(binding) : isAllowedCiPreviewReadinessLineage(binding))
    && binding.head === head && binding.tree === tree && ciSha(tree), "SOURCE_LINEAGE");
  ciProofRequire(successor || binding.commitIds.length === 6 && binding.parent === CI_PREVIEW_SIXTH_PARENT
    && binding.parentTree === CI_PREVIEW_SIXTH_PARENT_TREE
    || binding.commitIds.length === 5 && binding.parent === CI_PREVIEW_FIFTH_PARENT
    && binding.parentTree === CI_PREVIEW_FIFTH_PARENT_TREE
    || binding.commitIds.length === 4 && head === CI_PREVIEW_FIFTH_PARENT && tree === CI_PREVIEW_FIFTH_PARENT_TREE
      && binding.parent === CI_PREVIEW_FOURTH_PARENT && binding.parentTree === CI_PREVIEW_FOURTH_PARENT_TREE,
    "SOURCE_PREDECESSOR");
}

// Only selected public identity fields are emitted. Invalid values are never interpolated.
export function captureCiPreviewIdentitySnapshot({ environment, event, head, workflowBlob }) {
  const field = (value, valid) => ({
    present: value !== undefined,
    type: value === undefined ? "missing" : value === null ? "null" : Array.isArray(value) ? "array" : typeof value,
    format: value === undefined ? "absent" : value === null ? "null" : valid(value) ? "valid" : "invalid",
    value: value !== undefined && value !== null && valid(value) ? value : null
  });
  const pr = event?.pull_request;
  const oneOf = (values) => (value) => typeof value === "string" && values.includes(value);
  const branch = oneOf([CI_PREVIEW_READINESS_BRANCH, DEPENDENCY_SUCCESSOR_BRANCH, "main"]);
  return {
    schemaVersion: "clover-ci-identity-observation-v2",
    origin: "runner-input-before-provider-acquisition",
    fields: {
      runnerMergeSha: field(environment.GITHUB_SHA, ciSha), eventMergeSha: field(pr?.merge_commit_sha, ciSha),
      checkoutHead: field(head, ciSha), eventHeadSha: field(pr?.head?.sha, ciSha),
      eventBaseSha: field(pr?.base?.sha, ciSha), envHeadSha: field(environment.CLOVER_TREE_HEAD, ciSha),
      envExactHeadSha: field(environment.CLOVER_TREE_EXACT_PR_HEAD, ciSha),
      workflowSha: field(environment.GITHUB_WORKFLOW_SHA, ciSha), workflowBlob: field(workflowBlob, ciSha),
      workflowRef: field(environment.GITHUB_WORKFLOW_REF, ciWorkflowRef),
      eventName: field(environment.GITHUB_EVENT_NAME, oneOf(["pull_request", "pull_request_target", "push", "workflow_dispatch"])),
      eventAction: field(event?.action, oneOf(["opened", "synchronize", "reopened", "closed", "edited"])),
      prNumber: field(event?.number, ciNumber), payloadPrNumber: field(pr?.number, ciNumber),
      envPrNumber: field(environment.CLOVER_TREE_PR_NUMBER, ciId),
      ref: field(environment.GITHUB_REF, ciRef), runId: field(environment.GITHUB_RUN_ID, ciId),
      runAttempt: field(environment.GITHUB_RUN_ATTEMPT, ciId),
      repository: field(environment.GITHUB_REPOSITORY, oneOf([CI_PROVIDER_REPOSITORY])),
      eventRepository: field(event?.repository?.full_name, oneOf([CI_PROVIDER_REPOSITORY])),
      headRepository: field(pr?.head?.repo?.full_name, oneOf([CI_PROVIDER_REPOSITORY])),
      baseRepository: field(pr?.base?.repo?.full_name, oneOf([CI_PROVIDER_REPOSITORY])),
      headRef: field(environment.GITHUB_HEAD_REF, branch), baseRef: field(environment.GITHUB_BASE_REF, branch),
      eventHeadRef: field(pr?.head?.ref, branch), eventBaseRef: field(pr?.base?.ref, branch)
    }
  };
}

class CiProviderProofError extends Error {}
class CiExecutionIdentityError extends Error {}

function ciProofRequire(condition, predicate) {
  if (!condition) throw new CiProviderProofError("CLOVER_READINESS_CI_PROOF_REJECTED:" + predicate);
}

// Every request is enumerated here. No token, redirect, download_url, mutable-contents default,
// retries or permission fallback. Attempt/ref responses are later observations, not webhook recovery.
function ciProviderPlan(execution, tree, workflowSha256, sourceBinding) {
  const prefix = CI_PROVIDER_ORIGIN + "/repos/" + CI_PROVIDER_REPOSITORY;
  const file = "/contents/" + ATTESTATION_REPAIR_PATHS[0];
  const head = execution.headSha, merge = execution.runnerMergeSha;
  return [
    { kind: "RUN_ATTEMPT", binding: "attempt-addressed", url: prefix + "/actions/runs/" + execution.runId + "/attempts/" + execution.runAttempt,
      projection: { id: execution.runId, attempt: execution.runAttempt, event: "pull_request", repository: CI_PROVIDER_REPOSITORY,
        repositoryId: CI_PROVIDER_REPOSITORY_ID, headRepository: CI_PROVIDER_REPOSITORY, headRepositoryId: CI_PROVIDER_REPOSITORY_ID,
        private: false, headSha: head, headBranch: CI_PREVIEW_READINESS_BRANCH, workflowPath: execution.workflowPath,
        prNumber: 36, prHeadSha: head, prBaseSha: CI_PREVIEW_READINESS_BASE,
        prHeadRef: CI_PREVIEW_READINESS_BRANCH, prBaseRef: DEPENDENCY_SUCCESSOR_BRANCH,
        prHeadRepositoryId: CI_PROVIDER_REPOSITORY_ID, prBaseRepositoryId: CI_PROVIDER_REPOSITORY_ID } },
    { kind: "HEAD_COMMIT", binding: "sha-addressed", url: prefix + "/git/commits/" + head,
      projection: { sha: head, tree, parents: [sourceBinding.parent] } },
    { kind: "MERGE_COMMIT", binding: "sha-addressed", url: prefix + "/git/commits/" + merge,
      projection: { sha: merge, tree, parents: [CI_PREVIEW_READINESS_BASE, head] } },
    ...(execution.eventMergeSha === merge ? [] : [{ kind: "EVENT_MERGE_COMMIT", binding: "sha-addressed",
      url: prefix + "/git/commits/" + execution.eventMergeSha,
      projection: { sha: execution.eventMergeSha, tree: sourceBinding.parentTree,
        parents: [CI_PREVIEW_READINESS_BASE, sourceBinding.parent] } }]),
    ...[["HEAD_WORKFLOW", head], ["MERGE_WORKFLOW", merge]].map(([kind, revision]) => ({
      kind, binding: "sha-addressed", url: prefix + file + "?ref=" + revision,
      projection: { revision, path: execution.workflowPath, blob: execution.workflowBlob, sha256: workflowSha256 }
    })),
    { kind: "MERGE_REF", binding: "moving-ref", url: prefix + "/git/ref/pull/36/merge",
      projection: { ref: "refs/pull/36/merge", type: "commit", sha: merge } },
    { kind: "HEAD_REF", binding: "moving-ref", url: prefix + "/git/ref/heads/" + CI_PREVIEW_READINESS_BRANCH,
      projection: { ref: "refs/heads/" + CI_PREVIEW_READINESS_BRANCH, type: "commit", sha: head } }
  ];
}

function ciProviderProjection(kind, body, execution) {
  if (kind === "RUN_ATTEMPT") {
    ciProofRequire(Number.isSafeInteger(body?.id) && body.id > 0 && Number.isSafeInteger(body.run_attempt) && body.run_attempt > 0, "RUN_ID_FORMAT");
    ciProofRequire(Array.isArray(body?.pull_requests) && body.pull_requests.length === 1, "RUN_PR_COVERAGE");
    const pr = body.pull_requests[0];
    return { id: String(body.id), attempt: String(body.run_attempt), event: body.event,
      repository: body.repository?.full_name, repositoryId: body.repository?.id,
      headRepository: body.head_repository?.full_name, headRepositoryId: body.head_repository?.id,
      private: body.repository?.private, headSha: body.head_sha, headBranch: body.head_branch, workflowPath: body.path,
      prNumber: pr.number, prHeadSha: pr.head?.sha, prBaseSha: pr.base?.sha,
      prHeadRef: pr.head?.ref, prBaseRef: pr.base?.ref,
      prHeadRepositoryId: pr.head?.repo?.id, prBaseRepositoryId: pr.base?.repo?.id };
  }
  if (kind === "HEAD_COMMIT" || kind === "MERGE_COMMIT" || kind === "EVENT_MERGE_COMMIT") {
    return { sha: body?.sha, tree: body?.tree?.sha, parents: body?.parents?.map((entry) => entry.sha) };
  }
  if (kind === "HEAD_WORKFLOW" || kind === "MERGE_WORKFLOW") {
    ciProofRequire(body?.type === "file" && body.encoding === "base64" && typeof body.content === "string"
      && body.content.length <= CI_PROVIDER_MAX_BYTES && Number.isSafeInteger(body.size) && body.size > 0 && body.size <= 1024 * 1024
      && /^[A-Za-z0-9+/\n]*={0,2}\n?$/u.test(body.content), "WORKFLOW_CONTENT_ENCODING");
    const compact = body.content.replace(/\n/gu, "");
    const bytes = Buffer.from(compact, "base64");
    ciProofRequire(bytes.length === body.size && bytes.toString("base64") === compact, "WORKFLOW_CONTENT_BYTES");
    ciProofRequire(createHash("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex") === body.sha, "WORKFLOW_BLOB_BYTES");
    return { revision: kind === "HEAD_WORKFLOW" ? execution.headSha : execution.runnerMergeSha,
      path: body.path, blob: body.sha, sha256: sha256(bytes) };
  }
  return { ref: body?.ref, type: body?.object?.type, sha: body?.object?.sha };
}

export function verifyCiPreviewProviderProof({ proof, execution, sourceBinding, tree, workflowBytes, workflowSha256, now = new Date() }) {
  const workflowHash = workflowBytes === undefined ? workflowSha256 : sha256(workflowBytes);
  ciProofRequire(ciSha(execution?.headSha) && ciSha(execution?.runnerMergeSha) && ciSha(tree)
    && execution.repository === CI_PROVIDER_REPOSITORY && execution.pullRequestNumber === 36
    && execution.baseSha === CI_PREVIEW_READINESS_BASE && execution.headRef === CI_PREVIEW_READINESS_BRANCH
    && execution.baseRef === DEPENDENCY_SUCCESSOR_BRANCH && execution.eventName === "pull_request"
    && execution.ref === "refs/pull/36/merge" && execution.workflowPath === ATTESTATION_REPAIR_PATHS[0]
    && execution.workflowSha === execution.runnerMergeSha && execution.workflowRef === CI_PROVIDER_REPOSITORY + "/" + execution.workflowPath + "@" + execution.ref
    && execution.runnerMergeSha !== execution.headSha && ciSha(execution.workflowBlob)
    && ciId(execution.runId) && ciId(execution.runAttempt)
    && typeof workflowHash === "string" && /^[0-9a-f]{64}$/u.test(workflowHash), "IDENTITY");
  ciProofRequire(ciSha(execution.eventMergeSha) && execution.eventMergeSha !== execution.headSha
    && ["opened", "synchronize", "reopened"].includes(execution.eventAction)
    && (execution.eventMergeSha === execution.runnerMergeSha || execution.eventAction === "synchronize"), "MERGE_RELATIONSHIP_INPUT");
  verifyCiProviderSourceBinding(sourceBinding, execution.headSha, tree);
  const originalInputs = ciProvisionalFromExecution(execution);
  ciProofRequire(canonicalJson(proof?.originalInputs) === canonicalJson(originalInputs), "ORIGINAL_INPUTS");
  const expectedSnapshot = captureCiPreviewIdentitySnapshot(ciInputArguments(originalInputs));
  ciProofRequire(canonicalJson(originalInputs.originalSnapshot) === canonicalJson(expectedSnapshot), "ORIGINAL_SNAPSHOT");
  const plan = ciProviderPlan(execution, tree, workflowHash, sourceBinding);
  ciProofRequire(proof?.schemaVersion === "clover-ci-provider-proof-v2"
    && proof.provenance === "public-github-rest-observation"
    && proof.apiVersion === CI_PROVIDER_API_VERSION && proof.authentication === "none-public"
    && proof.originalEventReconstructed === false && proof.externalAuthenticationEstablished === false
    && Array.isArray(proof.records) && proof.records.length === plan.length, "SCHEMA");
  exactKeys(proof, ["schemaVersion", "provenance", "apiVersion", "authentication", "originalEventReconstructed",
    "externalAuthenticationEstablished", "originalInputs", "records"], "CLOVER_READINESS_CI_PROVIDER_PROOF");
  const reference = now instanceof Date ? now.getTime() : NaN;
  ciProofRequire(Number.isFinite(reference), "OBSERVATION_FRESHNESS");
  let previous = -Infinity, first;
  proof.records.forEach((record, index) => {
    exactKeys(record, ["kind", "binding", "url", "startedAt", "observedAt", "status", "projection"], "CLOVER_READINESS_CI_PROVIDER_RECORD");
    const expected = plan[index];
    const start = Date.parse(record.startedAt), end = Date.parse(record.observedAt);
    ciProofRequire(typeof record.startedAt === "string" && Number.isFinite(start) && new Date(start).toISOString() === record.startedAt
      && typeof record.observedAt === "string" && Number.isFinite(end) && new Date(end).toISOString() === record.observedAt
      && start >= previous && end >= start && end - start <= 15_000, "OBSERVATION_TIME");
    ciProofRequire(start >= reference - 30 * 60_000 && end <= reference + 5_000, "OBSERVATION_FRESHNESS");
    first ??= start; previous = end;
    ciProofRequire(end - first <= 120_000 && record.kind === expected.kind && record.binding === expected.binding
      && record.url === expected.url && record.status === 200
      && canonicalJson(record.projection) === canonicalJson(expected.projection), expected.kind + "_BINDING");
  });
  return proof;
}

export async function acquireCiPreviewProviderProof({ environment, event, head, tree, workflowBlob, workflowBytes, sourceBinding,
  fetchImpl = globalThis.fetch, now = () => new Date() }) {
  const execution = parseCiPreviewExecutionInputs({ environment, event, head, workflowBlob });
  verifyCiProviderSourceBinding(sourceBinding, head, tree);
  ciProofRequire(ciSha(tree) && Buffer.isBuffer(workflowBytes) && workflowBytes.length > 0
    && workflowBytes.length <= 1024 * 1024
    && createHash("sha1").update("blob " + workflowBytes.length + "\0").update(workflowBytes).digest("hex") === workflowBlob, "CHECKOUT_WORKFLOW_BYTES");
  const records = [];
  const acquisitionStarted = now().getTime();
  ciProofRequire(Number.isFinite(acquisitionStarted), "ACQUISITION_WINDOW");
  for (const item of ciProviderPlan(execution, tree, sha256(workflowBytes), sourceBinding)) {
    const start = now().getTime(), remaining = 120_000 - (start - acquisitionStarted);
    ciProofRequire(Number.isFinite(start) && start >= acquisitionStarted && remaining > 0, "ACQUISITION_WINDOW");
    const startedAt = new Date(start).toISOString();
    try {
      const response = await fetchImpl(item.url, { method: "GET", credentials: "omit", redirect: "error",
        signal: AbortSignal.timeout(Math.min(15_000, remaining)),
        headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": CI_PROVIDER_API_VERSION } });
      ciProofRequire(response.status === 200 && !response.redirected && response.url === item.url, item.kind + "_HTTP");
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        ciProofRequire(size <= CI_PROVIDER_MAX_BYTES, item.kind + "_SIZE");
        chunks.push(Buffer.from(chunk));
      }
      const body = parseJsonWithoutDuplicateKeys(decodeUtf8Fatal(Buffer.concat(chunks), "CLOVER_READINESS_PROVIDER_BODY"), "CLOVER_READINESS_PROVIDER_BODY");
      const projection = ciProviderProjection(item.kind, body, execution);
      ciProofRequire(canonicalJson(projection) === canonicalJson(item.projection), item.kind + "_BINDING");
      const observed = now().getTime();
      ciProofRequire(Number.isFinite(observed) && observed >= start && observed - start <= 15_000
        && observed - acquisitionStarted <= 120_000, "ACQUISITION_WINDOW");
      records.push({ kind: item.kind, binding: item.binding, url: item.url, startedAt,
        observedAt: new Date(observed).toISOString(), status: 200, projection });
    } catch (error) {
      // Network/JSON errors may contain headers, response bodies or fixture secrets. Never propagate them.
      if (error instanceof CiProviderProofError) throw error;
      throw new CiProviderProofError("CLOVER_READINESS_CI_PROOF_REJECTED:" + item.kind + "_ACQUISITION");
    }
  }
  const proof = { schemaVersion: "clover-ci-provider-proof-v2", provenance: "public-github-rest-observation",
    apiVersion: CI_PROVIDER_API_VERSION, authentication: "none-public",
    originalEventReconstructed: false, externalAuthenticationEstablished: false, originalInputs: execution, records };
  return verifyCiPreviewProviderProof({ proof, execution, sourceBinding, tree, workflowBytes, now: now() });
}

function ciProviderCachePath(repositoryRoot, environment) {
  ciProofRequire(typeof environment.RUNNER_TEMP === "string" && path.isAbsolute(environment.RUNNER_TEMP), "CACHE_LOCATION");
  const temp = realpathSync(environment.RUNNER_TEMP), root = realpathSync(repositoryRoot);
  ciProofRequire(temp !== root && !temp.startsWith(root + path.sep), "CACHE_LOCATION");
  return path.join(temp, CI_PROVIDER_FILE);
}

function readCiProviderProof(repositoryRoot, environment) {
  const target = ciProviderCachePath(repositoryRoot, environment);
  ciProofRequire(existsSync(target), "CACHE_MISSING");
  const stat = lstatSync(target);
  ciProofRequire(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && (stat.mode & 0o777) === 0o644
    && stat.size > 0 && stat.size <= CI_PROVIDER_MAX_BYTES, "CACHE_FILE");
  return parseJsonWithoutDuplicateKeys(decodeUtf8Fatal(readBoundedNativeBody(target), "CLOVER_READINESS_PROVIDER_CACHE"), "CLOVER_READINESS_PROVIDER_CACHE");
}

function safeCiDiagnosticError(error) {
  const knownSourceCodes = new Set([
    "CLOVER_READINESS_CONTEXT_REJECTED", "CLOVER_READINESS_GIT_ENVIRONMENT_REJECTED",
    "CLOVER_READINESS_GIT_ROOT_REJECTED", "CLOVER_READINESS_HIDDEN_INDEX_STATE_REJECTED",
    "CLOVER_READINESS_DIRTY_SOURCE_REJECTED", "CLOVER_READINESS_IDENTITY_REJECTED",
    "CLOVER_READINESS_BASE_REJECTED", "CLOVER_READINESS_DEPTH_REJECTED", "CLOVER_READINESS_PATH_REJECTED",
    "CLOVER_READINESS_BLOB_REJECTED", "CLOVER_READINESS_LINEARITY_REJECTED", "CLOVER_READINESS_LOCK_REJECTED",
    "CLOVER_READINESS_EVENT_REJECTED", "CLOVER_READINESS_PROVIDER_CACHE_REJECTED"
  ]);
  const code = error instanceof CiProviderProofError || error instanceof CiExecutionIdentityError
    || knownSourceCodes.has(error?.message) ? error.message : "CLOVER_READINESS_CI_PROOF_REJECTED:UNCLASSIFIED";
  return { schemaVersion: "clover-ci-identity-failure-v2", code,
    failedPredicates: error instanceof CiExecutionIdentityError ? error.failedPredicates : [] };
}

async function runCiPreviewProviderProof(repositoryRoot, environment = process.env) {
  let event, head, tree, workflowBlob, workflowBytes, eventError, checkoutError;
  // Child stderr is untrusted too; do not forward Git errors before the safe observation.
  const observeGit = (args, encoding = "utf8") => execFileSync("git", args, {
    cwd: repositoryRoot, encoding, stdio: ["ignore", "pipe", "pipe"], maxBuffer: CI_PROVIDER_MAX_BYTES
  });
  try { event = parseJsonWithoutDuplicateKeys(decodeUtf8Fatal(readBoundedNativeBody(environment.GITHUB_EVENT_PATH), "CLOVER_READINESS_EVENT"), "CLOVER_READINESS_EVENT"); }
  catch { eventError = true; }
  try {
    head = observeGit(["rev-parse", "HEAD"]).trim();
    tree = observeGit(["rev-parse", "HEAD^{tree}"]).trim();
    workflowBlob = observeGit(["rev-parse", "HEAD:" + ATTESTATION_REPAIR_PATHS[0]]).trim();
    workflowBytes = observeGit(["show", head + ":" + ATTESTATION_REPAIR_PATHS[0]], null);
  } catch { checkoutError = true; }
  process.stderr.write(canonicalJson(captureCiPreviewIdentitySnapshot({ environment, event, head, workflowBlob })) + "\n");
  ciProofRequire(!eventError, "EVENT_DOCUMENT");
  ciProofRequire(!checkoutError, "CHECKOUT_OBSERVATION");
  // Inspect the complete clean Git source before starting any provider request. This is not accepted CI identity.
  parseCiPreviewExecutionInputs({ environment, event, head, workflowBlob });
  const sourceBinding = deriveCiPreviewReadinessGitSource({ repositoryRoot, environment }, true);
  ciProofRequire(ciSourceProfile(sourceBinding) === CI_SUCCESSOR_PROFILE || sourceBinding.commitIds.length === 6, "SOURCE_SIXTH_LINEAGE");
  const proof = await acquireCiPreviewProviderProof({ environment, event, head, tree, workflowBlob, workflowBytes, sourceBinding });
  const target = ciProviderCachePath(repositoryRoot, environment);
  ciProofRequire(!existsSync(target), "CACHE_ALREADY_EXISTS");
  writeFileSync(target, canonicalJson(proof) + "\n", { mode: 0o644, flag: "wx" });
  const source = deriveCiPreviewReadinessSource({ repositoryRoot, environment });
  process.stdout.write(canonicalJson({ schemaVersion: "clover-ci-identity-proof-result-v2",
    head: source.head, tree: source.tree, sourceProofSelfHash: source.sourceProofSelfHash,
    eventMergeSha: source.ciExecution.eventMergeSha, runnerMergeSha: source.ciExecution.runnerMergeSha,
    workflowSha: source.ciExecution.workflowSha, eventAction: source.ciExecution.eventAction,
    mergeRelationship: source.ciExecution.mergeRelationship,
    releaseAuthority: false, externalAuthenticationEstablished: false }) + "\n");
}


// The event document is runner input, not an authorization or independent proof of a real run.
// A later executor must read back the GitHub run and artifact IDs/digests independently.
export function parseCiPreviewExecutionInputs({ environment, event, head, workflowBlob }) {
  const pr = event?.pull_request;
  const number = event?.number;
  const positiveId = (value) => typeof value === "string" && /^[1-9][0-9]*$/u.test(value) && Number.isSafeInteger(Number(value));
  const repository = "chrisdortch/first";
  // Evaluate adjacent predicates too; emit fixed names only, preserving the original first rejection.
  const failedPredicates = [];
  const requireIdentity = (accepted, predicate) => { if (!accepted) failedPredicates.push(predicate); };
  requireIdentity(environment.GITHUB_ACTIONS === "true", "GITHUB_ACTIONS");
  requireIdentity(environment.GITHUB_EVENT_NAME === "pull_request", "GITHUB_EVENT_NAME");
  requireIdentity(environment.CLOVER_TREE_LOCAL_SOURCE_CLOSURE_CONTEXT === CI_PREVIEW_READINESS_CI_CONTEXT, "SOURCE_CONTEXT");
  requireIdentity(["opened", "synchronize", "reopened"].includes(event?.action), "EVENT_ACTION");
  requireIdentity(number === 36, "EVENT_PR_NUMBER");
  requireIdentity(pr?.number === number, "PAYLOAD_PR_NUMBER");
  requireIdentity(String(number) === environment.CLOVER_TREE_PR_NUMBER, "ENV_PR_NUMBER");
  requireIdentity(pr?.state === "open", "PR_STATE");
  requireIdentity(event?.repository?.full_name === repository, "EVENT_REPOSITORY");
  requireIdentity(pr?.head?.repo?.full_name === repository, "HEAD_REPOSITORY");
  requireIdentity(pr?.base?.repo?.full_name === repository, "BASE_REPOSITORY");
  requireIdentity(environment.GITHUB_REPOSITORY === repository, "GITHUB_REPOSITORY");
  requireIdentity(pr?.head?.ref === CI_PREVIEW_READINESS_BRANCH, "PAYLOAD_HEAD_REF");
  requireIdentity(environment.GITHUB_HEAD_REF === CI_PREVIEW_READINESS_BRANCH, "GITHUB_HEAD_REF");
  requireIdentity(pr?.base?.ref === DEPENDENCY_SUCCESSOR_BRANCH, "PAYLOAD_BASE_REF");
  requireIdentity(environment.GITHUB_BASE_REF === DEPENDENCY_SUCCESSOR_BRANCH, "GITHUB_BASE_REF");
  requireIdentity(pr?.base?.sha === CI_PREVIEW_READINESS_BASE, "PAYLOAD_BASE_SHA");
  requireIdentity(ciSha(head), "CHECKOUT_HEAD_FORMAT");
  requireIdentity(pr?.head?.sha === head, "PAYLOAD_HEAD_SHA");
  requireIdentity(environment.CLOVER_TREE_HEAD === head, "ENV_HEAD_SHA");
  requireIdentity(environment.CLOVER_TREE_EXACT_PR_HEAD === head, "ENV_EXACT_PR_HEAD");
  requireIdentity(ciSha(pr?.merge_commit_sha), "PAYLOAD_MERGE_SHA_FORMAT");
  // Match the existing downstream CI receipt rule; this is not proof of any particular run's failure.
  requireIdentity(pr?.merge_commit_sha !== head, "MERGE_DISTINCT_FROM_HEAD");
  requireIdentity(ciSha(environment.GITHUB_SHA), "GITHUB_SHA_FORMAT");
  requireIdentity(environment.GITHUB_SHA !== head, "RUNNER_MERGE_DISTINCT_FROM_HEAD");
  requireIdentity(pr?.merge_commit_sha === environment.GITHUB_SHA || event?.action === "synchronize", "DISTINCT_MERGE_REQUIRES_SYNCHRONIZE");
  requireIdentity(environment.GITHUB_REF === `refs/pull/${number}/merge`, "GITHUB_REF");
  requireIdentity(environment.GITHUB_WORKFLOW_SHA === environment.GITHUB_SHA, "WORKFLOW_SHA_MATCHES_RUNNER_MERGE");
  requireIdentity(environment.GITHUB_WORKFLOW_REF === `${repository}/${ATTESTATION_REPAIR_PATHS[0]}@refs/pull/${number}/merge`, "GITHUB_WORKFLOW_REF");
  requireIdentity(positiveId(environment.GITHUB_RUN_ID), "GITHUB_RUN_ID");
  requireIdentity(positiveId(environment.GITHUB_RUN_ATTEMPT), "GITHUB_RUN_ATTEMPT");
  requireIdentity(ciSha(workflowBlob), "WORKFLOW_BLOB");
  requireIdentity(/^v(?:22|24)\./u.test(process.version), "NODE_RUNTIME");
  if (failedPredicates.length) {
    const error = new CiExecutionIdentityError("CLOVER_READINESS_CI_EVENT_REJECTED:" + failedPredicates[0]);
    error.failedPredicates = failedPredicates;
    throw error;
  }
  return Object.freeze({ schemaVersion: "clover-ci-execution-input-v2", status: "provisional",
    eventName: "pull_request", eventAction: event.action, repository, pullRequestNumber: number,
    headSha: head, headRef: CI_PREVIEW_READINESS_BRANCH, baseSha: CI_PREVIEW_READINESS_BASE, baseRef: DEPENDENCY_SUCCESSOR_BRANCH,
    eventMergeSha: pr.merge_commit_sha, runnerMergeSha: environment.GITHUB_SHA, ref: environment.GITHUB_REF, runId: environment.GITHUB_RUN_ID, runAttempt: environment.GITHUB_RUN_ATTEMPT,
    workflowPath: ATTESTATION_REPAIR_PATHS[0], workflowBlob, workflowRef: environment.GITHUB_WORKFLOW_REF,
    workflowSha: environment.GITHUB_WORKFLOW_SHA, nodeVersion: process.version,
    artifactPrefix: `clover-ci-preview-readiness-${head}-${environment.GITHUB_RUN_ID}-${environment.GITHUB_RUN_ATTEMPT}`,
    originalSnapshot: captureCiPreviewIdentitySnapshot({ environment, event, head, workflowBlob }) });
}

// Rebuild only selected validated public fields to check a cached snapshot against its identity.
// This is consistency validation of retained inputs, never reconstruction of an original webhook.
function ciInputArguments(input) {
  const repo = { full_name: input.repository };
  return { head: input.headSha, workflowBlob: input.workflowBlob,
    event: { action: input.eventAction, number: input.pullRequestNumber, repository: repo, pull_request: {
      number: input.pullRequestNumber, state: "open", head: { sha: input.headSha, ref: input.headRef, repo },
      base: { sha: input.baseSha, ref: input.baseRef, repo }, merge_commit_sha: input.eventMergeSha } },
    environment: { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: input.eventName, GITHUB_REPOSITORY: input.repository,
      CLOVER_TREE_LOCAL_SOURCE_CLOSURE_CONTEXT: CI_PREVIEW_READINESS_CI_CONTEXT, CLOVER_TREE_PR_NUMBER: String(input.pullRequestNumber),
      GITHUB_HEAD_REF: input.headRef, GITHUB_BASE_REF: input.baseRef, CLOVER_TREE_HEAD: input.headSha,
      CLOVER_TREE_EXACT_PR_HEAD: input.headSha, GITHUB_SHA: input.runnerMergeSha, GITHUB_REF: input.ref,
      GITHUB_RUN_ID: input.runId, GITHUB_RUN_ATTEMPT: input.runAttempt,
      GITHUB_WORKFLOW_SHA: input.workflowSha, GITHUB_WORKFLOW_REF: input.workflowRef } };
}
const CI_INPUT_KEYS = ["schemaVersion", "status", "eventName", "eventAction", "repository", "pullRequestNumber", "headSha", "headRef",
  "baseSha", "baseRef", "eventMergeSha", "runnerMergeSha", "ref", "runId", "runAttempt", "workflowPath", "workflowBlob", "workflowRef",
  "workflowSha", "nodeVersion", "artifactPrefix", "originalSnapshot"];
function ciProvisionalFromExecution(execution) {
  const accepted = execution?.schemaVersion === "clover-ci-execution-identity-v2";
  exactKeys(execution, accepted ? [...CI_INPUT_KEYS, "mergeRelationship", "providerProof", "externalAuthenticationEstablished", "releaseAuthority"]
    : CI_INPUT_KEYS, "CLOVER_READINESS_CI_EXECUTION");
  ciProofRequire(accepted ? execution.status === "proved-relationship" && execution.externalAuthenticationEstablished === false
    && execution.releaseAuthority === false
    && execution.mergeRelationship === (execution.eventMergeSha === execution.runnerMergeSha ? "equal" : "synchronize-immediate-predecessor")
    : execution.schemaVersion === "clover-ci-execution-input-v2" && execution.status === "provisional", "INPUT_STATUS");
  const result = Object.fromEntries(CI_INPUT_KEYS.map((key) => [key, execution[key]]));
  result.schemaVersion = "clover-ci-execution-input-v2"; result.status = "provisional";
  ciProofRequire(result.artifactPrefix === `clover-ci-preview-readiness-${result.headSha}-${result.runId}-${result.runAttempt}`
    && /^v(?:22|24)\./u.test(result.nodeVersion), "INPUT_RUNTIME");
  return result;
}

export function deriveCiPreviewExecutionIdentity(input) {
  const provisional = parseCiPreviewExecutionInputs(input);
  const providerProof = verifyCiPreviewProviderProof({ ...input, execution: provisional });
  return Object.freeze({ ...provisional, schemaVersion: "clover-ci-execution-identity-v2", status: "proved-relationship",
    mergeRelationship: provisional.eventMergeSha === provisional.runnerMergeSha ? "equal" : "synchronize-immediate-predecessor",
    providerProof, externalAuthenticationEstablished: false, releaseAuthority: false });
}

// This four-file preparation cannot widen the completed dependency or campaign contracts.
export function deriveCiPreviewReadinessSource(options = {}) {
  return deriveCiPreviewReadinessGitSource(options, false);
}

function deriveCiPreviewReadinessGitSource({ repositoryRoot, environment = process.env }, provisionalOnly) {
  const context = environment.CLOVER_TREE_LOCAL_SOURCE_CLOSURE_CONTEXT;
  const ci = environment.GITHUB_ACTIONS === "true";
  if (!repositoryRoot || ![undefined, "false", "true"].includes(environment.GITHUB_ACTIONS)
    || context !== (ci ? CI_PREVIEW_READINESS_CI_CONTEXT : CI_PREVIEW_READINESS_CONTEXT)
    || !ci && ["CLOVER_TREE_EXACT_PR_HEAD", "CLOVER_TREE_PR_NUMBER", "GITHUB_HEAD_REF", "GITHUB_BASE_REF", "GITHUB_EVENT_NAME",
      "GITHUB_EVENT_PATH", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "GITHUB_SHA", "GITHUB_REF", "GITHUB_WORKFLOW_REF", "GITHUB_WORKFLOW_SHA"].some((key) => environment[key] !== undefined)
    || environment.CLOVER_TREE_BROWSER_EVIDENCE_MODE !== undefined
    || Object.keys(environment).some((key) => key.startsWith("CLOVER_TREE_PROTECTED_PREVIEW_") && environment[key] !== undefined)
    || ![undefined, "false"].includes(environment.CLOVER_READINESS_RELEASE_AUTHORITY)) throw new Error("CLOVER_READINESS_CONTEXT_REJECTED");
  const forbiddenGitEnvironment = (values) => Object.keys(values).some((key) => key.startsWith("GIT_")
    && !["GIT_PAGER", "GIT_TERMINAL_PROMPT"].includes(key) && values[key] !== undefined);
  if (forbiddenGitEnvironment(process.env) || forbiddenGitEnvironment(environment)) throw new Error("CLOVER_READINESS_GIT_ENVIRONMENT_REJECTED");
  const root = realpathSync(repositoryRoot);
  if (realpathSync(git(root, ["rev-parse", "--show-toplevel"]).trim()) !== root
    || git(root, ["rev-parse", "--is-shallow-repository"]).trim() !== "false"
    || git(root, ["for-each-ref", "--format=%(refname)", "refs/replace"]).trim() !== ""
    || existsSync(path.resolve(root, git(root, ["rev-parse", "--git-path", "info/grafts"]).trim()))
    || ci && typeof environment.GITHUB_WORKSPACE !== "string"
    || environment.GITHUB_WORKSPACE !== undefined && realpathSync(environment.GITHUB_WORKSPACE) !== root) throw new Error("CLOVER_READINESS_GIT_ROOT_REJECTED");
  const requireVisibleTrackedSource = () => {
    for (const flagView of ["-v", "-f"]) {
      const entries = decodeUtf8Fatal(git(root, ["ls-files", flagView, "-z"], { encoding: null }), "CLOVER_READINESS_INDEX").split("\0");
      if (entries.pop() !== "" || entries.length === 0 || entries.some((entry) => !entry.startsWith("H ")))
        throw new Error("CLOVER_READINESS_HIDDEN_INDEX_STATE_REJECTED");
    }
  };
  requireVisibleTrackedSource();
  if (git(root, ["status", "--porcelain=v1", "--untracked-files=all"]) !== "") throw new Error("CLOVER_READINESS_DIRTY_SOURCE_REJECTED");
  const checkoutBranch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  const branch = ci ? environment.GITHUB_HEAD_REF : checkoutBranch;
  const head = git(root, ["rev-parse", "HEAD^{commit}"]).trim();
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]).trim();
  if (branch !== CI_PREVIEW_READINESS_BRANCH || ci && !["HEAD", CI_PREVIEW_READINESS_BRANCH].includes(checkoutBranch)
    || environment.CLOVER_TREE_HEAD !== undefined && environment.CLOVER_TREE_HEAD !== head
    || git(root, ["rev-parse", `${CI_PREVIEW_READINESS_BASE}^{tree}`]).trim() !== CI_PREVIEW_READINESS_BASE_TREE
) throw new Error("CLOVER_READINESS_IDENTITY_REJECTED");
  try { git(root, ["merge-base", "--is-ancestor", CI_PREVIEW_READINESS_BASE, head]); }
  catch { throw new Error("CLOVER_READINESS_BASE_REJECTED"); }
  const commits = git(root, ["rev-list", "--reverse", `${CI_PREVIEW_READINESS_BASE}..${head}`]).trim().split("\n");
  if (commits.length < 1 || commits.length > 7 || commits[0] === "") throw new Error("CLOVER_READINESS_DEPTH_REJECTED");
  const successor = commits.length === 7;
  const inspectDelta = (before, after) => {
    const changes = parseSourceChanges(git(root, ["diff", "--no-ext-diff", "--no-textconv", "--name-status", "--no-renames", "-z", before, after], { encoding: null }));
    if (changes.length === 0 || changes.some((entry) => entry.status !== "M" || !ATTESTATION_REPAIR_PATHS.includes(entry.path))) throw new Error("CLOVER_READINESS_PATH_REJECTED");
    for (const entry of changes) {
      const { identity: prior, bytes: priorBytes } = readSourceObject(root, before, entry.path);
      const { identity: current, bytes: currentBytes } = readSourceObject(root, after, entry.path);
      decodeUtf8Fatal(priorBytes, "CLOVER_READINESS_TEXT"); decodeUtf8Fatal(currentBytes, "CLOVER_READINESS_TEXT");
      if (prior.mode !== "100644" || current.mode !== "100644" || prior.blob === current.blob
        || priorBytes.includes(0) || currentBytes.includes(0)) throw new Error("CLOVER_READINESS_BLOB_REJECTED");
    }
    return changes.map(({ path: changedPath }) => changedPath).sort(compareUtf8);
  };
  const inspectSuccessorDelta = (before, after, cumulative = false) => {
    const changes = parseSourceChanges(git(root, ["diff", "--no-ext-diff", "--no-textconv", "--name-status", "--no-renames", "-z", before, after], { encoding: null }));
    const expected = cumulative ? CI_PREVIEW_SUCCESSOR_CUMULATIVE_PATHS : CI_PREVIEW_SUCCESSOR_PATHS;
    const ordered = [...changes].sort((left, right) => compareUtf8(left.path, right.path));
    if (canonicalJson(ordered.map((entry) => entry.path)) !== canonicalJson(expected)) throw new Error("CLOVER_READINESS_PATH_REJECTED");
    return ordered.map((entry) => {
      const added = CI_PREVIEW_SUCCESSOR_ADDED_PATHS.includes(entry.path);
      if (entry.status !== (added ? "A" : "M")) throw new Error("CLOVER_READINESS_PATH_REJECTED");
      const current = readSourceObject(root, after, entry.path);
      const prior = added ? null : readSourceObject(root, before, entry.path);
      if (added && git(root, ["ls-tree", "-z", "--full-tree", before, "--", entry.path]) !== "") throw new Error("CLOVER_READINESS_PATH_REJECTED");
      for (const object of [prior, current].filter(Boolean)) {
        decodeUtf8Fatal(object.bytes, "CLOVER_READINESS_TEXT");
        if (object.identity.mode !== "100644" || object.bytes.length === 0 || object.bytes.includes(0)) throw new Error("CLOVER_READINESS_BLOB_REJECTED");
      }
      if (prior && prior.identity.blob === current.identity.blob) throw new Error("CLOVER_READINESS_BLOB_REJECTED");
      return { path: entry.path, status: entry.status, before: prior?.identity ?? null, after: current.identity };
    });
  };
  let parent = CI_PREVIEW_READINESS_BASE;
  for (const commit of commits) {
    if (git(root, ["show", "-s", "--format=%P", commit]).trim() !== parent) throw new Error("CLOVER_READINESS_LINEARITY_REJECTED");
    if (successor && commit === head) inspectSuccessorDelta(parent, commit);
    else inspectDelta(parent, commit);
    parent = commit;
  }
  const fourthCommitPaths = commits.length >= 4 ? inspectDelta(CI_PREVIEW_FOURTH_PARENT, commits[3]) : null;
  const fifthCommitPaths = commits.length >= 5 ? inspectDelta(CI_PREVIEW_FIFTH_PARENT, commits[4]) : null;
  const sixthTail = commits.length >= 6 ? { sixthCommitPaths: inspectDelta(CI_PREVIEW_SIXTH_PARENT, commits[5]) } : {};
  const candidateParent = git(root, ["show", "-s", "--format=%P", head]).trim();
  const parentTree = git(root, ["rev-parse", candidateParent + "^{tree}"]).trim();
  const successorTail = successor ? {
    successorAnchor: { head: CI_PREVIEW_SUCCESSOR_ANCHOR, tree: CI_PREVIEW_SUCCESSOR_ANCHOR_TREE },
    successorCommitPaths: [...CI_PREVIEW_SUCCESSOR_PATHS],
    successorDelta: inspectSuccessorDelta(CI_PREVIEW_SUCCESSOR_ANCHOR, head),
    successorDiffSha256: sha256(git(root, ["diff", "--no-ext-diff", "--no-textconv", "--binary", "--full-index", "--no-renames", CI_PREVIEW_SUCCESSOR_ANCHOR, head], { encoding: null }))
  } : {};
  const lineage = { commitIds: commits, head, parent: candidateParent, parentTree, fourthCommitPaths, fifthCommitPaths, ...sixthTail, ...successorTail };
  if (!(successor ? isAllowedCiPreviewSuccessorLineage(lineage) : isAllowedCiPreviewReadinessLineage(lineage)))
    throw new Error("CLOVER_READINESS_DEPTH_REJECTED");
  const paths = successor ? inspectSuccessorDelta(CI_PREVIEW_READINESS_BASE, head, true).map((entry) => entry.path)
    : inspectDelta(CI_PREVIEW_READINESS_BASE, head);
  const lockfiles = DEPENDENCY_SUCCESSOR_LOCKS.map((expected) => {
    const base = sourceObject(root, CI_PREVIEW_READINESS_BASE, expected.path);
    const current = sourceObject(root, head, expected.path);
    if (!/^[0-9a-f]{64}$/u.test(expected.sha256) || base.sha256 !== expected.sha256 || current.sha256 !== expected.sha256
      || sha256(readFileSync(path.join(root, expected.path))) !== expected.sha256) throw new Error("CLOVER_READINESS_LOCK_REJECTED");
    return { ...current, baseSha256: base.sha256 };
  });
  const fullMainEntries = deriveSourceManifestEntries({ repositoryRoot: root, candidateCommit: head });
  const sourceBinding = { ...lineage, tree };
  if (successor) ciProvisionalProfiles.set(sourceBinding, CI_SUCCESSOR_PROFILE);
  if (provisionalOnly) {
    ciProofRequire(ci && (successor || commits.length === 6 && candidateParent === CI_PREVIEW_SIXTH_PARENT), "SOURCE_SIXTH_LINEAGE");
    verifyCiProviderSourceBinding(sourceBinding, head, tree);
    ciProofRequire(git(root, ["rev-parse", "HEAD^{commit}"]).trim() === head
      && git(root, ["status", "--porcelain=v1", "--untracked-files=all"]) === "", "SOURCE_CHANGED_DURING_PROOF");
    requireVisibleTrackedSource();
    return Object.freeze(sourceBinding); // No accepted execution identity or source receipt is produced here.
  }
  if (ci) ciProofRequire(successor || commits.length === 6 && candidateParent === CI_PREVIEW_SIXTH_PARENT, "SOURCE_SIXTH_LINEAGE");
  const ciExecution = ci ? deriveCiPreviewExecutionIdentity({ environment, head, sourceBinding, tree,
    workflowBlob: sourceObject(root, head, ATTESTATION_REPAIR_PATHS[0]).blob,
    workflowBytes: sourceBytes(root, head, ATTESTATION_REPAIR_PATHS[0]), proof: readCiProviderProof(root, environment),
    event: parseJsonWithoutDuplicateKeys(decodeUtf8Fatal(readBoundedNativeBody(environment.GITHUB_EVENT_PATH), "CLOVER_READINESS_EVENT"), "CLOVER_READINESS_EVENT") }) : null;
  const body = {
    schemaVersion: successor ? "clover-ci-preview-readiness-source-v4" : commits.length === 6 ? "clover-ci-preview-readiness-source-v3" : "clover-ci-preview-readiness-source-v2", classification: ci ? "ci-readiness-candidate" : "local-readiness-candidate",
    taskId: CI_PREVIEW_READINESS_TASK, context, githubActions: ci, pullRequestNumber: ciExecution?.pullRequestNumber ?? null, branch, head, tree, ciExecution,
    fullMainPathCount: fullMainEntries.length,
    fullMainPathListSha256: sha256(`${fullMainEntries.map((entry) => entry.path).join("\n")}\n`),
    sourceManifestSha256: sha256(`${canonicalJson(fullMainEntries)}\n`),
    parent: candidateParent, parentTree,
    base: CI_PREVIEW_READINESS_BASE, baseTree: CI_PREVIEW_READINESS_BASE_TREE,
    commitIds: commits, localCommitCount: commits.length, fourthCommitPaths, fifthCommitPaths, ...sixthTail, ...successorTail, changedPathCount: paths.length, paths,
    pathListSha256: sha256(`${paths.join("\n")}\n`), allowedPathListSha256: sha256(`${(successor ? CI_PREVIEW_SUCCESSOR_CUMULATIVE_PATHS : ATTESTATION_REPAIR_PATHS).join("\n")}\n`),
    diffSha256: sha256(git(root, ["diff", "--no-ext-diff", "--no-textconv", "--binary", "--full-index", "--no-renames", CI_PREVIEW_READINESS_BASE, head], { encoding: null })),
    sourceFiles: paths.map((sourcePath) => sourceObject(root, head, sourcePath)), lockfiles,
    cleanWorktree: true, linearFirstParent: true, exactPrHeadAcceptance: false, releaseAuthority: false,
    providerAcceptance: false, consequentialAuthorityGranted: false, deploymentAllowanceGranted: false
  };
  if (git(root, ["rev-parse", "HEAD^{commit}"]).trim() !== head
    || git(root, ["status", "--porcelain=v1", "--untracked-files=all"]) !== "") throw new Error("CLOVER_READINESS_SOURCE_CHANGED_DURING_PROOF");
  requireVisibleTrackedSource();
  const proof = { ...body, sourceProofSelfHash: sha256(`${canonicalJson(body)}\n`) };
  if (successor) validateCiPreviewSuccessorSourceProof(proof);
  return Object.freeze(proof);
}

export const CI_PREVIEW_RECEIPT_PROFILE = "ci-preview-readiness-protected-synthetic-v2";
export const HISTORICAL_RECEIPT_PROFILE = "historical-tree-campaign";
const CI_PREVIEW_ARTIFACT_ROLES = Object.freeze([
  "validation-node-22", "validation-node-24", "sealed-input-node-24", "browser"
]);

// A consistency verifier, not an execution operation or an authentication mechanism.
// External owner approval and a serialized, current allowance check remain prerequisites.
// Provider/CI identifiers are supplied only after actual readback; this function creates none.
export function validateCiPreviewExecutionContract({
  contract, sourceProof, verifiedEvidence, now = new Date(), executionStartedAt, executionCompletedAt
} = {}) {
  const reject = (condition, label) => { if (!condition) throw new Error(`CLOVER_CI_PREVIEW_${label}_REJECTED`); };
  const hash = (value) => sha256(`${canonicalJson(value)}\n`);
  const hex64 = (value) => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
  const positive = (value) => Number.isSafeInteger(value) && value > 0;
  const timestamp = (value, label) => {
    const parsed = Date.parse(value);
    reject(typeof value === "string" && Number.isFinite(parsed) && new Date(parsed).toISOString() === value, label);
    return parsed;
  };
  const nowTime = now instanceof Date ? now.getTime() : Number.NaN;
  reject(Number.isFinite(nowTime), "TIME");
  const startedTime = executionStartedAt === undefined ? undefined : timestamp(executionStartedAt, "EXECUTION_STARTED_TIME");
  const completedTime = executionCompletedAt === undefined ? undefined : timestamp(executionCompletedAt, "EXECUTION_COMPLETED_TIME");
  reject((startedTime === undefined) === (completedTime === undefined), "EXECUTION_WINDOW");
  const authorityReferenceTime = startedTime ?? nowTime;
  const proofHash = (proof, label) => {
    reject(proof && typeof proof === "object" && !Array.isArray(proof), label);
    if (proof.schemaVersion === "clover-ci-preview-readiness-source-v4") {
      validateCiPreviewSuccessorSourceProof(proof);
      return;
    }
    const proofKeys = [...ciReadinessProofKeys];
    // The sixth record has an explicit schema; older receipts retain their original exact shape and hash.
    const sixth = proof.schemaVersion === "clover-ci-preview-readiness-source-v3";
    reject(sixth ? proof.localCommitCount === 6 && proof.commitIds?.length === 6
      : proof.schemaVersion === "clover-ci-preview-readiness-source-v2" && proof.localCommitCount <= 5, label);
    if (sixth) proofKeys.push("sixthCommitPaths");
    exactKeys(proof, proofKeys, `CLOVER_CI_PREVIEW_${label}`);
    const { sourceProofSelfHash, ...body } = proof;
    reject(hex64(sourceProofSelfHash) && hash(body) === sourceProofSelfHash, label);
  };
  proofHash(sourceProof, "SOURCE_PROOF");
  const successorSource = sourceProof.schemaVersion === "clover-ci-preview-readiness-source-v4";
  const sourcePaths = successorSource ? CI_PREVIEW_SUCCESSOR_CUMULATIVE_PATHS : ATTESTATION_REPAIR_PATHS;
  reject(["clover-ci-preview-readiness-source-v2", "clover-ci-preview-readiness-source-v3", "clover-ci-preview-readiness-source-v4"].includes(sourceProof.schemaVersion)
    && sourceProof.taskId === "CLOVER-CI-PREVIEW-READINESS-20260909-A"
    && sourceProof.base === "356274f97c6a9cd02a30fb941688b2e24a00ab8e"
    && sourceProof.baseTree === "b975d7683f4a6e4bc510bf2bb66b789273fd79d5"
    && sourceProof.branch === "codex/clover-ci-preview-readiness-20260909"
    && ["local-ci-preview-readiness", "ci-preview-readiness"].includes(sourceProof.context)
    && sourceProof.githubActions === (sourceProof.context === "ci-preview-readiness")
    && (sourceProof.githubActions || sourceProof.ciExecution === null && sourceProof.pullRequestNumber === null)
    && sourceProof.cleanWorktree === true && sourceProof.linearFirstParent === true
    && Number.isInteger(sourceProof.localCommitCount) && sourceProof.localCommitCount === sourceProof.commitIds?.length
    && (successorSource ? isAllowedCiPreviewSuccessorLineage(sourceProof) : isAllowedCiPreviewReadinessLineage(sourceProof))
    && ["releaseAuthority", "exactPrHeadAcceptance", "providerAcceptance", "consequentialAuthorityGranted", "deploymentAllowanceGranted"]
      .every((key) => sourceProof[key] === false), "SOURCE_BOUNDARY");
  const paths = sourceProof.paths;
  reject(Array.isArray(paths) && paths.length >= 1 && paths.length <= sourcePaths.length
    && sourceProof.changedPathCount === paths.length && new Set(paths).size === paths.length
    && canonicalJson(paths) === canonicalJson([...paths].sort(compareUtf8))
    && paths.every((entry) => sourcePaths.includes(entry))
    && sourceProof.pathListSha256 === sha256(`${paths.join("\n")}\n`)
    && sourceProof.allowedPathListSha256 === sha256(`${sourcePaths.join("\n")}\n`)
    && hex64(sourceProof.diffSha256) && hex64(sourceProof.sourceManifestSha256)
    && Number.isSafeInteger(sourceProof.fullMainPathCount) && sourceProof.fullMainPathCount >= paths.length
    && Array.isArray(sourceProof.commitIds) && sourceProof.commitIds.length === sourceProof.localCommitCount
    && new Set(sourceProof.commitIds).size === sourceProof.commitIds.length
    && sourceProof.commitIds.every((commit) => /^[0-9a-f]{40}$/u.test(commit))
    && sourceProof.commitIds.at(-1) === sourceProof.head
    && sourceProof.parent === (sourceProof.commitIds.length > 1 ? sourceProof.commitIds.at(-2) : sourceProof.base), "SOURCE_STRUCTURE");
  reject(Array.isArray(sourceProof.sourceFiles) && sourceProof.sourceFiles.length === paths.length
    && sourceProof.sourceFiles.every((entry, index) => entry.path === paths[index] && entry.mode === "100644"
      && /^[0-9a-f]{40}$/u.test(entry.blob) && positive(entry.bytes) && hex64(entry.sha256)), "SOURCE_FILES");
  reject(Array.isArray(sourceProof.lockfiles) && sourceProof.lockfiles.length === DEPENDENCY_SUCCESSOR_LOCKS.length
    && sourceProof.lockfiles.every((entry, index) => entry.path === DEPENDENCY_SUCCESSOR_LOCKS[index].path
      && entry.mode === "100644" && /^[0-9a-f]{40}$/u.test(entry.blob) && positive(entry.bytes)
      && entry.sha256 === DEPENDENCY_SUCCESSOR_LOCKS[index].sha256 && entry.baseSha256 === entry.sha256), "LOCKS");
  const provenance = verifiedEvidence?.sourceProvenance;
  reject(provenance?.commit === sourceProof.head && provenance.tree === sourceProof.tree && provenance.parent === sourceProof.parent
    && provenance.sourceManifestSha256 === sourceProof.sourceManifestSha256 && provenance.pathListSha256 === sourceProof.fullMainPathListSha256
    && provenance.changedPathCount === sourceProof.fullMainPathCount
    && provenance.stackABase === STACK_A_BASE, "VERIFIED_SOURCE");
  exactKeys(contract, ["schemaVersion", "taskId", "source", "sealedInput", "ci", "ownerApproval", "allowance"], "CLOVER_CI_PREVIEW_CONTRACT");
  reject(contract.schemaVersion === "clover-ci-preview-execution-contract-v2" && contract.taskId === sourceProof.taskId, "CONTRACT");
  const source = {
    repository: "chrisdortch/first", ref: `refs/heads/${sourceProof.branch}`,
    head: sourceProof.head, tree: sourceProof.tree, base: sourceProof.base, baseTree: sourceProof.baseTree,
    sourceProofSelfHash: sourceProof.sourceProofSelfHash,
    sourceManifestSha256: sourceProof.sourceManifestSha256, fullMainPathCount: sourceProof.fullMainPathCount
  };
  reject(canonicalJson(contract.source) === canonicalJson(source), "SOURCE");
  const sealedInput = {
    deploymentInputRootSha256: verifiedEvidence.deploymentInputManifest?.deploymentInputRootSha256,
    deploymentInputManifestSelfHash: verifiedEvidence.deploymentInputManifest?.manifestSelfHash,
    payloadManifestRootSha256: verifiedEvidence.payloadManifest?.rootSha256,
    attestationRawSha256: verifiedEvidence.deploymentInputManifest?.attestation?.rawSha256,
    archiveSha256: verifiedEvidence.archiveManifest?.archiveSha256,
    archiveManifestSelfHash: verifiedEvidence.archiveManifest?.manifestSelfHash
  };
  reject(Object.values(sealedInput).every(hex64) && canonicalJson(contract.sealedInput) === canonicalJson(sealedInput), "SEALED_INPUT");

  const ci = contract.ci;
  exactKeys(ci, ["sourceProof", "run", "identityReadback", "artifacts", "artifactValidationReceiptSha256"], "CLOVER_CI_PREVIEW_CI");
  proofHash(ci.sourceProof, "CI_SOURCE_PROOF");
  const ciProof = ci.sourceProof;
  const execution = ciProof.ciExecution;
  // CI and local proof hashes differ intentionally: run/runtime context is not source identity.
  const sourceKeys = ["schemaVersion", "taskId", "base", "baseTree", "branch", "head", "tree", "parent", "parentTree", "commitIds", "localCommitCount", "fourthCommitPaths", "fifthCommitPaths",
    "changedPathCount", "paths", "pathListSha256", "allowedPathListSha256", "diffSha256", "sourceFiles", "lockfiles", "sourceManifestSha256", "fullMainPathCount", "fullMainPathListSha256"];
  if (successorSource || sourceProof.schemaVersion === "clover-ci-preview-readiness-source-v3") sourceKeys.push("sixthCommitPaths");
  if (successorSource) sourceKeys.push(...CI_SUCCESSOR_FIELDS);
  reject(sourceKeys.every((key) => Object.hasOwn(sourceProof, key) && canonicalJson(ciProof[key]) === canonicalJson(sourceProof[key]))
    && ciProof.context === "ci-preview-readiness" && ciProof.githubActions === true
    && ciProof.cleanWorktree === true && ciProof.linearFirstParent === true
    && ["releaseAuthority", "exactPrHeadAcceptance", "providerAcceptance", "consequentialAuthorityGranted", "deploymentAllowanceGranted"]
      .every((key) => ciProof[key] === false), "CI_SOURCE");
  ciProvisionalFromExecution(execution);
  reject(execution.schemaVersion === "clover-ci-execution-identity-v2" && execution.status === "proved-relationship"
    && execution.eventName === "pull_request" && execution.repository === source.repository
    && execution.pullRequestNumber === 36 && ciProof.pullRequestNumber === execution.pullRequestNumber
    && execution.headSha === source.head && execution.headRef === sourceProof.branch
    && execution.baseSha === source.base && execution.baseRef === DEPENDENCY_SUCCESSOR_BRANCH
    && execution.workflowBlob === sourceProof.sourceFiles.find((entry) => entry.path === execution.workflowPath)?.blob
    && execution.nodeVersion === "v24.16.0", "CI_EXECUTION");
  reject(successorSource || sourceProof.localCommitCount === 6 && sourceProof.parent === CI_PREVIEW_SIXTH_PARENT
    || sourceProof.localCommitCount === 5 && sourceProof.parent === CI_PREVIEW_FIFTH_PARENT, "CI_ANCHORED_LINEAGE");
  verifyCiPreviewProviderProof({ proof: execution.providerProof, execution, sourceBinding: sourceProof, tree: sourceProof.tree,
    workflowSha256: sourceProof.sourceFiles.find((entry) => entry.path === execution.workflowPath)?.sha256,
    now: new Date(ci.identityReadback?.jobCompletedAt) });
  const run = ci.run;
  exactKeys(run, ["id", "runAttempt", "event", "repository", "headSha", "headBranch", "workflowPath", "status", "conclusion", "createdAt", "completedAt", "observedAt"], "CLOVER_CI_PREVIEW_RUN");
  const ciCreatedTime = timestamp(run.createdAt, "CI_CREATED_TIME");
  const ciCompletedTime = timestamp(run.completedAt, "CI_COMPLETED_TIME");
  const ciObservedTime = timestamp(run.observedAt, "CI_OBSERVED_TIME");
  reject(run.id === execution.runId && run.runAttempt === execution.runAttempt && run.event === execution.eventName
    && run.repository === source.repository && run.headSha === source.head && run.headBranch === sourceProof.branch
    && run.workflowPath === execution.workflowPath && run.status === "completed" && run.conclusion === "success"
    && ciCreatedTime <= ciCompletedTime && ciCompletedTime <= ciObservedTime && ciObservedTime <= authorityReferenceTime + 5_000
    && ciObservedTime >= authorityReferenceTime - MAX_PROVIDER_REQUEST_DURATION_MS && hex64(ci.artifactValidationReceiptSha256), "RUN");
  // A mandatory supplied external observation binds actual attempt/job/log inputs. This verifier
  // checks consistency only: its fields or self-hashes never authenticate their own provenance.
  const readback = ci.identityReadback;
  exactKeys(readback, ["schemaVersion", "provenance", "runId", "runAttempt", "jobId", "jobRunId", "jobRunAttempt", "headSha",
    "nodeVersion", "jobConclusion", "jobStartedAt", "jobCompletedAt", "workflowPath", "logSha256", "originalInputs", "observedAt"], "CLOVER_CI_PREVIEW_IDENTITY_READBACK");
  const identityObservedTime = timestamp(readback.observedAt, "IDENTITY_READBACK_TIME");
  const jobStartedTime = timestamp(readback.jobStartedAt, "IDENTITY_JOB_STARTED_TIME");
  const jobCompletedTime = timestamp(readback.jobCompletedAt, "IDENTITY_JOB_COMPLETED_TIME");
  reject(readback.schemaVersion === "clover-ci-independent-execution-observation-v1"
    && readback.provenance === "external-github-attempt-jobs-log-readback"
    && readback.runId === run.id && readback.runAttempt === run.runAttempt && positive(readback.jobId)
    && readback.jobRunId === run.id && readback.jobRunAttempt === run.runAttempt
    && readback.headSha === source.head && readback.nodeVersion === execution.nodeVersion
    && readback.jobConclusion === "success" && readback.workflowPath === execution.workflowPath && hex64(readback.logSha256)
    && canonicalJson(readback.originalInputs) === canonicalJson(execution.providerProof.originalInputs)
    && ciCreatedTime <= jobStartedTime && jobStartedTime <= Date.parse(execution.providerProof.records[0].startedAt)
    && Date.parse(execution.providerProof.records.at(-1).observedAt) <= jobCompletedTime
    && jobStartedTime <= jobCompletedTime && jobCompletedTime - jobStartedTime <= 30 * 60_000
    && jobCompletedTime <= ciCompletedTime
    && ciCompletedTime <= identityObservedTime && identityObservedTime <= authorityReferenceTime + 5_000
    && identityObservedTime >= authorityReferenceTime - MAX_PROVIDER_REQUEST_DURATION_MS, "IDENTITY_READBACK");
  reject(Array.isArray(ci.artifacts) && ci.artifacts.length === CI_PREVIEW_ARTIFACT_ROLES.length, "ARTIFACTS");
  const roles = new Set();
  const ids = new Set();
  for (const artifact of ci.artifacts) {
    exactKeys(artifact, ["role", "id", "name", "runId", "runAttempt", "headSha", "sizeInBytes", "providerDigest", "downloadSha256", "expired",
      "sourceManifestSha256", "archiveSha256"], "CLOVER_CI_PREVIEW_ARTIFACT");
    reject(CI_PREVIEW_ARTIFACT_ROLES.includes(artifact.role) && !roles.has(artifact.role)
      && positive(artifact.id) && !ids.has(artifact.id)
      && artifact.name === `${execution.artifactPrefix}-${artifact.role}`
      && artifact.runId === execution.runId && artifact.runAttempt === execution.runAttempt && artifact.headSha === source.head
      && positive(artifact.sizeInBytes) && hex64(artifact.downloadSha256)
      && artifact.providerDigest === `sha256:${artifact.downloadSha256}` && artifact.expired === false
      && artifact.sourceManifestSha256 === source.sourceManifestSha256
      && artifact.archiveSha256 === (artifact.role === "sealed-input-node-24" ? sealedInput.archiveSha256 : null), "ARTIFACT");
    roles.add(artifact.role); ids.add(artifact.id);
  }

  const approval = contract.ownerApproval;
  exactKeys(approval, ["taskId", "recordSha256", "approvedAt", "expiresAt", "repository", "ref", "head", "tree", "projectId", "teamId", "target", "dataClass",
    "ciPolicy", "maximumDeployments", "maximumBypassCreates", "maximumBypassRevocations", "publication", "merge", "production", "settingsChanges", "privateData"], "CLOVER_CI_PREVIEW_APPROVAL");
  const approvedTime = timestamp(approval.approvedAt, "APPROVED_TIME");
  const expiresTime = timestamp(approval.expiresAt, "EXPIRES_TIME");
  reject(approval.taskId === sourceProof.taskId && hex64(approval.recordSha256) && approvedTime <= authorityReferenceTime && expiresTime >= (completedTime ?? nowTime)
    && approval.repository === source.repository && approval.ref === source.ref && approval.head === source.head && approval.tree === source.tree
    && approval.projectId === VERCEL_PROJECT_ID && approval.teamId === VERCEL_TEAM_ID
    && approval.target === "preview" && approval.dataClass === "synthetic-only"
    && approval.ciPolicy === "successful-exact-source-stacked-pr-run-with-verified-artifacts"
    && approval.maximumDeployments === 1 && approval.maximumBypassCreates === 1 && approval.maximumBypassRevocations === 1
    && ["publication", "merge", "production", "settingsChanges", "privateData"].every((key) => approval[key] === false), "APPROVAL");
  const allowance = contract.allowance;
  exactKeys(allowance, ["taskId", "id", "ownerApprovalRecordSha256", "head", "tree", "projectId", "teamId", "state", "executionsConsumed", "observedAt", "observationReceiptSha256"], "CLOVER_CI_PREVIEW_ALLOWANCE");
  const allowanceObservedTime = timestamp(allowance.observedAt, "ALLOWANCE_OBSERVED_TIME");
  reject(allowance.taskId === sourceProof.taskId && typeof allowance.id === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/u.test(allowance.id)
    && allowance.ownerApprovalRecordSha256 === approval.recordSha256
    && allowance.head === source.head && allowance.tree === source.tree
    && allowance.projectId === VERCEL_PROJECT_ID && allowance.teamId === VERCEL_TEAM_ID
    && allowance.state === "unconsumed" && allowance.executionsConsumed === 0
    && hex64(allowance.observationReceiptSha256) && approvedTime <= allowanceObservedTime
    && ciObservedTime <= allowanceObservedTime && identityObservedTime <= allowanceObservedTime
    && allowanceObservedTime <= authorityReferenceTime + 5_000
    && allowanceObservedTime >= authorityReferenceTime - MAX_PROVIDER_REQUEST_DURATION_MS, "ALLOWANCE");
  if (startedTime !== undefined) {
    reject(allowanceObservedTime <= startedTime && ciObservedTime <= startedTime && identityObservedTime <= startedTime && approvedTime <= startedTime
      && startedTime <= completedTime && completedTime <= expiresTime && completedTime <= nowTime + 5_000, "EXECUTION_WINDOW");
  }
  const body = {
    schemaVersion: "clover-ci-preview-execution-contract-verification-v2",
    taskId: contract.taskId, contractSha256: hash(contract), sourceBranch: sourceProof.branch, source,
    sealedInput, ciRunId: execution.runId, ciRunAttempt: execution.runAttempt, pullRequestNumber: execution.pullRequestNumber,
    ciSourceProofSelfHash: ciProof.sourceProofSelfHash, ciArtifactValidationReceiptSha256: ci.artifactValidationReceiptSha256,
    artifacts: ci.artifacts.map(({ role, id, name, downloadSha256 }) => ({ role, id, name, downloadSha256 })),
    ownerApprovalRecordSha256: approval.recordSha256, allowanceId: allowance.id,
    allowanceObservationReceiptSha256: allowance.observationReceiptSha256,
    suppliedRecordsConsistent: true, externalAuthenticationEstablished: false,
    executionAuthentication: "external-exact-attempt-jobs-log-verification-required",
    identityReadbackSha256: hash(readback), ownerApprovalAuthentication: "external-procedural-verification-required",
    allowanceConsumptionEnforcement: "external-serialized-execution-ledger-required",
    releaseAuthority: false, consequentialAuthorityGranted: false, deploymentAllowanceGranted: false
  };
  return Object.freeze({ ...body, verificationSelfHash: hash(body) });
}

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

function parseJsonWithoutDuplicateKeys(source, label, maximumDepth = 256) {
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
  const parseValue = (depth = 0) => {
    if (depth > maximumDepth) reject();
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
        object[key] = parseValue(depth + 1);
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
        array.push(parseValue(depth + 1));
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
    maxBuffer: 32 * 1024 * 1024,
    ...(options.stdio === "pipe" ? { stdio: "pipe" } : {})
  });
}

// Error output is public. Copy no raw Error, environment, path, stdout or
// arbitrary stderr text into the replacement error (including its cause).
function ancestryCommandDiagnostic(error, stackABase, commit) {
  const ownValue = (name) => error !== null && typeof error === "object"
    ? Object.getOwnPropertyDescriptor(error, name)?.value : undefined;
  const rawStderr = ownValue("stderr");
  const stderrBytes = Buffer.isBuffer(rawStderr) ? rawStderr.length
    : typeof rawStderr === "string" ? Buffer.byteLength(rawStderr) : null;
  const boundedStderr = Buffer.isBuffer(rawStderr) ? rawStderr.subarray(0, 4096).toString("utf8")
    : typeof rawStderr === "string" ? rawStderr.slice(0, 4096) : "";
  const lines = boundedStderr.split(/\r?\n/u).filter(Boolean);
  // An allowlist of diagnostic templates, not a best-effort secret detector.
  // Only the two already public commit arguments may survive substitutions.
  const sanitizeLine = (line) => {
    if (line === "fatal: not a git repository (or any of the parent directories): .git") return line;
    for (const sha of [stackABase, commit]) {
      for (const template of [
        `fatal: Not a valid commit name ${sha}`,
        `fatal: Not a valid object name ${sha}`,
        `fatal: bad object ${sha}`,
        `fatal: bad revision '${sha}'`
      ]) if (line === template) return template;
    }
    if (/^fatal: detected dubious ownership in repository at /u.test(line)) {
      return "fatal: detected dubious ownership in repository [path redacted]";
    }
    return "[unrecognized stderr redacted]";
  };
  const status = ownValue("status");
  const signal = ownValue("signal");
  const code = ownValue("code");
  return Object.freeze({
    schemaVersion: "clover-ancestry-command-diagnostic-v1",
    executable: "git",
    arguments: Object.freeze(["merge-base", "--is-ancestor", stackABase, commit]),
    workingDirectory: "repository-root",
    status: Number.isInteger(status) && status >= 0 && status <= 255 ? status : null,
    signal: ["SIGABRT", "SIGALRM", "SIGBUS", "SIGFPE", "SIGHUP", "SIGILL", "SIGINT", "SIGKILL", "SIGPIPE", "SIGQUIT", "SIGSEGV", "SIGTERM", "SIGTRAP", "SIGXCPU", "SIGXFSZ"].includes(signal) ? signal : null,
    spawnCode: ["E2BIG", "EACCES", "EAGAIN", "EIO", "EMFILE", "ENFILE", "ENOENT", "ENOEXEC", "ENOMEM", "ENOTDIR", "EPERM", "ETXTBSY", "ENOBUFS", "ETIMEDOUT", "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"].includes(code) ? code : null,
    stderr: lines.slice(0, 4).map(sanitizeLine).join("\n"),
    stderrBytes,
    stderrTruncated: stderrBytes !== null && stderrBytes > 4096 || lines.length > 4,
    stderrPolicy: "only-fixed-templates-and-public-commit-arguments"
  });
}

export function requireStackAAncestry(repositoryRoot, stackABase, commit) {
  assertHex(stackABase, 40, "Stack A base");
  assertHex(commit, 40, "commit");
  try {
    // Explicit pipes preserve the command's stdio transport but prevent Node's
    // execFileSync failure handler from echoing raw stderr before our catch.
    git(repositoryRoot, ["merge-base", "--is-ancestor", stackABase, commit], { stdio: "pipe" });
  } catch (error) {
    // Next's existing error printer retains cause. This freshly constructed
    // data object preserves useful failure identity without retaining error.
    throw new Error("CLOVER_STACK_A_ANCESTRY_REJECTED", {
      cause: ancestryCommandDiagnostic(error, stackABase, commit)
    });
  }
}

function assertHex(value, length, label) {
  if (!new RegExp(`^[0-9a-f]{${length}}$`, "u").test(value)) throw new Error(`${label} is not exact lowercase hex`);
}

function exactSourcePath(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Buffer.from(value, "utf8").toString("utf8") !== value ||
    value !== value.normalize("NFC") ||
    value === "." ||
    value.startsWith("/") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    path.posix.normalize(value) !== value ||
    value.split("/").includes("..")
  ) throw new Error(`unsafe source path: ${value}`);
  return value;
}

function readSourceObject(repositoryRoot, revision, sourcePath) {
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
  return { identity: { path: sourcePath, mode: match[1], blob: match[2], bytes: bytes.length, sha256: sha256(bytes) }, bytes };
}

function sourceObject(repositoryRoot, revision, sourcePath) {
  return readSourceObject(repositoryRoot, revision, sourcePath).identity;
}

function sourceBytes(repositoryRoot, revision, sourcePath) {
  return readSourceObject(repositoryRoot, revision, sourcePath).bytes;
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
  requireStackAAncestry(root, stackABase, commit);

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

const NEXT_LAUNCHER_CONFIG_PREFIX = "const conf = ";
const NEXT_LAUNCHER_CONFIG_CONSUMER = ";\nvar nextServer = new NextServer({\n  conf,\n  dir: \".\",\n  minimalMode: true,\n  customServer: false\n});";
const NEXT_FUNCTION_LAUNCHER_RELATIVE_PATH = "apps/clover-launch-studio/___next_launcher.cjs";
const NEXT_16_3_3_LAUNCHER_PREFIX_BYTES = 1_963;
const NEXT_16_3_3_LAUNCHER_PREFIX_SHA256 = "775dfcf0705784630816df6aff83c66f991b14af851f6f11b3e20e60b103bae9";
const NEXT_16_3_3_LAUNCHER_SUFFIX_BYTES = 865;
const NEXT_16_3_3_LAUNCHER_SUFFIX_SHA256 = "2b6f4849d44b61a669383775f888102fc4320e28b117fafc82f88b0b733775f1";

function isCanonicalNextFunctionLauncherPath(outputPath) {
  return /^functions\/.+\/apps\/clover-launch-studio\/___next_launcher\.cjs$/u.test(outputPath);
}

function extractLauncherConfig(text, label) {
  const start = text.indexOf(NEXT_LAUNCHER_CONFIG_PREFIX);
  const end = text.indexOf(NEXT_LAUNCHER_CONFIG_CONSUMER, start);
  const staticPrefix = start < 0 ? "" : text.slice(0, start);
  const staticSuffix = end < 0 ? "" : text.slice(end);
  if (
    start < 0 || end < 0 ||
    text.split(NEXT_LAUNCHER_CONFIG_PREFIX).length - 1 !== 1 ||
    text.split(NEXT_LAUNCHER_CONFIG_CONSUMER).length - 1 !== 1 ||
    Buffer.byteLength(staticPrefix, "utf8") !== NEXT_16_3_3_LAUNCHER_PREFIX_BYTES ||
    sha256(staticPrefix) !== NEXT_16_3_3_LAUNCHER_PREFIX_SHA256 ||
    Buffer.byteLength(staticSuffix, "utf8") !== NEXT_16_3_3_LAUNCHER_SUFFIX_BYTES ||
    sha256(staticSuffix) !== NEXT_16_3_3_LAUNCHER_SUFFIX_SHA256
  ) throw new Error(`CLOVER_LAUNCHER_CONFIG_REJECTED:${label}`);
  return parseJsonWithoutDuplicateKeys(
    text.slice(start + NEXT_LAUNCHER_CONFIG_PREFIX.length, end),
    `CLOVER_LAUNCHER_CONFIG:${label}`
  );
}

function requireLauncherSourceIdentity(configuration, sourceProvenance, label) {
  if (!sourceProvenance || typeof sourceProvenance !== "object" || Array.isArray(sourceProvenance)) {
    throw new Error(`CLOVER_LAUNCHER_SOURCE_PROVENANCE_REJECTED:${label}`);
  }
  const runtimeDeploymentKey = exactRuntimeDeploymentKey(sourceProvenance.runtimeDeploymentKey);
  const encodedSourceProvenance = configuration?.env?.CLOVER_BUILD_PROVENANCE_JSON;
  if (
    !configuration || typeof configuration !== "object" || Array.isArray(configuration) ||
    configuration.deploymentId !== runtimeDeploymentKey ||
    configuration.distDir !== ".next" || configuration.distDirRoot !== ".next" ||
    !configuration.experimental || typeof configuration.experimental !== "object" ||
    Array.isArray(configuration.experimental) || configuration.experimental.runtimeServerDeploymentId !== false ||
    !configuration.env || typeof configuration.env !== "object" || Array.isArray(configuration.env) ||
    canonicalJson(Object.keys(configuration.env)) !== canonicalJson(["CLOVER_BUILD_PROVENANCE_JSON"]) ||
    typeof encodedSourceProvenance !== "string" ||
    canonicalJson(parseJsonWithoutDuplicateKeys(
      encodedSourceProvenance,
      `CLOVER_LAUNCHER_SOURCE_PROVENANCE:${label}`
    )) !== canonicalJson(sourceProvenance)
  ) throw new Error(`CLOVER_LAUNCHER_SOURCE_IDENTITY_REJECTED:${label}`);
  return configuration;
}

function exactRequiredServerFilesConfiguration(bytes, label) {
  const document = parseJsonWithoutDuplicateKeys(decodeUtf8Fatal(bytes, label), label);
  const configuration = document?.config;
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) {
    throw new Error(`CLOVER_LAUNCHER_REQUIRED_SERVER_FILES_IDENTITY_REJECTED:${label}`);
  }
  return configuration;
}

function requireLauncherRequiredServerFilesIdentity(outputRoot, expectedConfiguration, label, { requireInventory = true } = {}) {
  const launchers = walk(outputRoot).filter(({ type, path: outputPath }) =>
    type === "file" && isCanonicalNextFunctionLauncherPath(outputPath));
  if (requireInventory && launchers.length === 0) {
    throw new Error(`CLOVER_LAUNCHER_REQUIRED_SERVER_FILES_IDENTITY_REJECTED:${label}:missing`);
  }
  for (const launcher of launchers) {
    const text = decodeUtf8Fatal(readFileSync(launcher.absolutePath), `CLOVER_NORMALIZATION:${launcher.path}`);
    const configuration = extractLauncherConfig(text, launcher.path);
    if (canonicalJson(configuration) !== canonicalJson(expectedConfiguration)) {
      throw new Error(`CLOVER_LAUNCHER_REQUIRED_SERVER_FILES_IDENTITY_REJECTED:${label}:${launcher.path}`);
    }
  }
}

function requiredServerFilesConfigurationForLauncherIdentity({
  repositoryRoot,
  expectedRuntimeDeploymentKey = null,
  expectedSourceProvenance = null,
  sealedExternalInput = false,
  label
}) {
  const requiredFile = requireExternalDeploymentInputFile(repositoryRoot, REQUIRED_SERVER_FILES_PATH);
  const bytes = sealedExternalInput
    ? requiredFile.bytes
    : normalizeExternalDeploymentInputBytes(
      repositoryRoot,
      REQUIRED_SERVER_FILES_PATH,
      requiredFile.bytes,
      expectedRuntimeDeploymentKey,
      expectedSourceProvenance
    ).sealedBytes;
  return exactRequiredServerFilesConfiguration(bytes, label);
}

function verifyLauncherSourceIdentities(outputRoot, sourceProvenance, { requireInventory = true } = {}) {
  const launchers = walk(outputRoot).filter(({ type, path: outputPath }) =>
    type === "file" && isCanonicalNextFunctionLauncherPath(outputPath));
  if (requireInventory && launchers.length === 0) throw new Error("CLOVER_LAUNCHER_SOURCE_IDENTITY_REJECTED:missing");
  for (const launcher of launchers) {
    const text = decodeUtf8Fatal(readFileSync(launcher.absolutePath), `CLOVER_NORMALIZATION:${launcher.path}`);
    requireLauncherSourceIdentity(extractLauncherConfig(text, launcher.path), sourceProvenance, launcher.path);
  }
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

function jsonStringTokenLocations(value, token, prefix = "", locations = []) {
  if (typeof value === "string") {
    const count = value.split(token).length - 1;
    if (count > 0) locations.push({ path: prefix, count });
    return locations;
  }
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) jsonStringTokenLocations(entry, token, `${prefix}[${index}]`, locations);
    return locations;
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value).sort()) {
      const keyCount = key.split(token).length - 1;
      if (keyCount > 0) locations.push({ path: prefix ? `${prefix}.[key:${key}]` : `[key:${key}]`, count: keyCount });
      jsonStringTokenLocations(value[key], token, prefix ? `${prefix}.${key}` : key, locations);
    }
  }
  return locations;
}

function jsonAbsoluteStringLocations(value, prefix = "", locations = []) {
  if (typeof value === "string") {
    if (value.startsWith("/")) locations.push({ path: prefix, value });
    return locations;
  }
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) jsonAbsoluteStringLocations(entry, `${prefix}[${index}]`, locations);
    return locations;
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value).sort()) {
      if (key.startsWith("/")) locations.push({ path: prefix ? `${prefix}.[key:${key}]` : `[key:${key}]`, value: key });
      jsonAbsoluteStringLocations(value[key], prefix ? `${prefix}.${key}` : key, locations);
    }
  }
  return locations;
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

export function normalizeGeneratedOutput({ outputRoot, checkoutRoot, sourceProvenance = null }) {
  const root = realpathSync(outputRoot);
  const sourceRoot = realpathSync(checkoutRoot);
  const requiredFile = requireExternalDeploymentInputFile(sourceRoot, REQUIRED_SERVER_FILES_PATH);
  const requiredSourceConfiguration = exactRequiredServerFilesConfiguration(
    requiredFile.bytes,
    "CLOVER_LAUNCHER_REQUIRED_SERVER_FILES_SOURCE"
  );
  const normalizedRequiredServerFiles = normalizeExternalDeploymentInputBytes(
    sourceRoot,
    REQUIRED_SERVER_FILES_PATH,
    requiredFile.bytes,
    sourceProvenance?.runtimeDeploymentKey ?? null,
    sourceProvenance
  );
  const requiredNormalizedConfiguration = exactRequiredServerFilesConfiguration(
    normalizedRequiredServerFiles.sealedBytes,
    "CLOVER_LAUNCHER_REQUIRED_SERVER_FILES_NORMALIZED"
  );
  if (sourceProvenance !== null) verifyLauncherSourceIdentities(root, sourceProvenance, { requireInventory: false });
  requireLauncherRequiredServerFilesIdentity(root, requiredSourceConfiguration, "source", { requireInventory: false });
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
    const isLauncher = isCanonicalNextFunctionLauncherPath(entry.path);
    if (!isMetadata && !isLauncher) continue;
    const beforeBytes = readFileSync(entry.absolutePath);
    const beforeText = decodeUtf8Fatal(beforeBytes, `CLOVER_NORMALIZATION:${entry.path}`);
    if (isMetadata) parseJsonWithoutDuplicateKeys(beforeText, `CLOVER_NORMALIZATION_JSON:${entry.path}`);
    const beforeConfig = isLauncher ? extractLauncherConfig(beforeText, entry.path) : null;
    if (isLauncher && sourceProvenance !== null) requireLauncherSourceIdentity(beforeConfig, sourceProvenance, entry.path);
    const afterText = replaceExact(beforeText, isLauncher ? [{ needle: sourceRoot, replacement: RUNTIME_ROOT }] : metadataReplacements);
    if (afterText === beforeText) continue;
    if (isLauncher) {
      const afterConfig = extractLauncherConfig(afterText, entry.path);
      if (sourceProvenance !== null) requireLauncherSourceIdentity(afterConfig, sourceProvenance, entry.path);
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
  requireLauncherRequiredServerFilesIdentity(root, requiredNormalizedConfiguration, "normalized", { requireInventory: false });
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
    isCanonicalNextFunctionLauncherPath(entry.path)
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

function assertPublicOutputFile(entry, bytes, exactHostPaths = [], { genericHostPathScan = true } = {}) {
  const text = bytes.toString("utf8");
  const findings = [
    ["host-absolute-path", new RegExp("(?:/Use" + "rs/|/ho" + "me/|/pri" + "vate/(?:tmp|var/folders)/|/usr/loc" + "al/|/git" + "hub/workspace(?:/|\\b)|/work" + "space(?:/|\\b)|/tm" + "p(?:/|\\b)|/opt/hosted" + "toolcache(?:/|\\b)|[A-Za-z]:\\\\\\\\)", "u")],
    ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
    ["github-token", /\b(?:gh[oprsu]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u],
    ["openai-token", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/u],
    ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/u],
    ["aws-key", /\bAKIA[0-9A-Z]{16}\b/u],
    ["ssn", /\b\d{3}-\d{2}-\d{4}\b/u]
  ].filter(([label, expression]) => (label !== "host-absolute-path" || genericHostPathScan) && expression.test(text)).map(([label]) => label);
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

function exactExternalDeploymentInputPath(value) {
  const sourcePath = exactSourcePath(value);
  if (!EXTERNAL_DEPLOYMENT_INPUT_ROOTS.some((root) => sourcePath.startsWith(root))) {
    throw new Error(`CLOVER_EXTERNAL_DEPLOYMENT_INPUT_PATH_REJECTED:${sourcePath}`);
  }
  return sourcePath;
}

function isVercelFunctionConfigPath(outputPath) {
  return outputPath === ".vc-config.json" || outputPath.endsWith("/.vc-config.json");
}

const NEXT_MIDDLEWARE_CONFIG_PATH = "functions/middleware.func/.vc-config.json";

function requireCanonicalNextFunctionLauncherBindings({ files, symlinks, configRecords, label }) {
  const filePaths = new Set(files.map(({ path: outputPath }) => outputPath));
  const launcherPaths = files
    .map(({ path: outputPath }) => outputPath)
    .filter(isCanonicalNextFunctionLauncherPath)
    .sort(compareUtf8);
  if (symlinks.some(({ path: outputPath }) => isCanonicalNextFunctionLauncherPath(outputPath))) {
    throw new Error(`${label}_LAUNCHER_TYPE_REJECTED`);
  }
  const referencesByLauncher = new Map();
  let middlewareCount = 0;
  for (const { path: configPath, config } of configRecords) {
    const functionDirectory = path.posix.dirname(configPath);
    const isFunctionConfig = functionDirectory.startsWith("functions/") && functionDirectory.endsWith(".func");
    const mapsRequiredServerFiles = config?.filePathMap && typeof config.filePathMap === "object"
      && !Array.isArray(config.filePathMap) && Object.hasOwn(config.filePathMap, REQUIRED_SERVER_FILES_PATH);
    if (!isFunctionConfig) {
      if (mapsRequiredServerFiles) throw new Error(`${label}_FOREIGN_REQUIRED_SERVER_FILES_REJECTED:${configPath}`);
      const foreignSelectors = [config?.handler, config?.entrypoint].filter((value) => typeof value === "string");
      for (const selector of foreignSelectors) {
        const relativeSelectorPath = exactSourcePath(selector);
        const selectedPath = exactSourcePath(
          functionDirectory === "." ? relativeSelectorPath : `${functionDirectory}/${relativeSelectorPath}`
        );
        if (isCanonicalNextFunctionLauncherPath(selectedPath)) {
          throw new Error(`${label}_FOREIGN_CONFIG_LAUNCHER_REJECTED:${configPath}`);
        }
      }
      continue;
    }
    const canonicalLauncherPath = `${functionDirectory}/${NEXT_FUNCTION_LAUNCHER_RELATIVE_PATH}`;
    const frameworkExact = canonicalJson(config?.framework) === canonicalJson({ slug: "nextjs", version: "16.3.3" });
    if (configPath === NEXT_MIDDLEWARE_CONFIG_PATH) {
      middlewareCount += 1;
      if (
        config?.runtime !== "edge" || config?.entrypoint !== "index.js" || config?.handler !== undefined ||
        config?.launcherType !== undefined || !frameworkExact || filePaths.has(canonicalLauncherPath) || mapsRequiredServerFiles
      ) throw new Error(`${label}_MIDDLEWARE_BINDING_REJECTED:${configPath}`);
      continue;
    }
    if (
      config?.runtime !== "nodejs24.x" || config?.handler !== NEXT_FUNCTION_LAUNCHER_RELATIVE_PATH ||
      config?.entrypoint !== undefined || config?.launcherType !== "Nodejs" || !frameworkExact ||
      !filePaths.has(canonicalLauncherPath) || !mapsRequiredServerFiles ||
      config.filePathMap[REQUIRED_SERVER_FILES_PATH] !== REQUIRED_SERVER_FILES_PATH
    ) throw new Error(`${label}_LAUNCHER_BINDING_REJECTED:${configPath}`);
    const references = referencesByLauncher.get(canonicalLauncherPath) ?? [];
    references.push(configPath);
    referencesByLauncher.set(canonicalLauncherPath, references);
  }
  if (middlewareCount !== 1) throw new Error(`${label}_MIDDLEWARE_INVENTORY_REJECTED`);
  if (launcherPaths.length === 0) throw new Error(`${label}_LAUNCHER_INVENTORY_REJECTED`);
  for (const launcherPath of launcherPaths) {
    const references = referencesByLauncher.get(launcherPath) ?? [];
    if (references.length !== 1) {
      throw new Error(`${label}_${references.length === 0 ? "UNREFERENCED" : "SHARED"}_LAUNCHER_REJECTED:${launcherPath}`);
    }
  }
  if (referencesByLauncher.size !== launcherPaths.length) throw new Error(`${label}_LAUNCHER_INVENTORY_REJECTED`);
}

function requireExternalDeploymentInputFile(repositoryRoot, sourcePath) {
  const root = realpathSync(repositoryRoot);
  const exactPath = exactExternalDeploymentInputPath(sourcePath);
  let current = root;
  const segments = exactPath.split("/");
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    let stat;
    try { stat = lstatSync(current); } catch { throw new Error(`CLOVER_EXTERNAL_DEPLOYMENT_INPUT_MISSING:${exactPath}`); }
    if (stat.isSymbolicLink() || index < segments.length - 1 && !stat.isDirectory() || index === segments.length - 1 && !stat.isFile()) {
      throw new Error(`CLOVER_EXTERNAL_DEPLOYMENT_INPUT_TYPE_REJECTED:${exactPath}`);
    }
    const resolved = realpathSync(current);
    if (resolved !== current || !resolved.startsWith(`${root}${path.sep}`)) {
      throw new Error(`CLOVER_EXTERNAL_DEPLOYMENT_INPUT_ESCAPE_REJECTED:${exactPath}`);
    }
  }
  let descriptor;
  let before;
  let after;
  let bytes;
  try {
    descriptor = openSync(current, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    before = fstatSync(descriptor);
    if (!before.isFile() || before.nlink !== 1) throw new Error(`CLOVER_EXTERNAL_DEPLOYMENT_INPUT_IDENTITY_REJECTED:${exactPath}`);
    bytes = readFileSync(descriptor);
    after = fstatSync(descriptor);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CLOVER_")) throw error;
    throw new Error(`CLOVER_EXTERNAL_DEPLOYMENT_INPUT_IDENTITY_REJECTED:${exactPath}`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const stat = lstatSync(current);
  const identityFields = ["dev", "ino", "mode", "nlink", "size", "mtimeMs", "ctimeMs"];
  if (
    !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || realpathSync(current) !== current ||
    identityFields.some((field) => before[field] !== after[field] || after[field] !== stat[field])
  ) throw new Error(`CLOVER_EXTERNAL_DEPLOYMENT_INPUT_IDENTITY_REJECTED:${exactPath}`);
  const mode = stat.mode & 0o7777;
  if (![0o644, 0o664, 0o755].includes(mode)) throw new Error(`CLOVER_EXTERNAL_DEPLOYMENT_INPUT_MODE_REJECTED:${exactPath}`);
  return { absolutePath: current, mode, bytes };
}

function exactRuntimeDeploymentKey(value) {
  if (typeof value !== "string" || !/^clover-[0-9a-f]{24}$/u.test(value)) {
    throw new Error("CLOVER_EXTERNAL_RUNTIME_DEPLOYMENT_KEY_REJECTED");
  }
  return value;
}

function normalizeExternalDeploymentInputBytes(
  repositoryRoot,
  sourcePath,
  sourceBytes,
  expectedRuntimeDeploymentKey = null,
  expectedSourceProvenance = null
) {
  const root = realpathSync(repositoryRoot);
  const exactPath = exactExternalDeploymentInputPath(sourcePath);
  let sealedBytes = Buffer.from(sourceBytes);
  let normalization = null;
  if (exactPath === "apps/clover-launch-studio/.next/required-server-files.json") {
    const sourceText = decodeUtf8Fatal(sourceBytes, "CLOVER_EXTERNAL_REQUIRED_SERVER_FILES");
    const before = parseJsonWithoutDuplicateKeys(sourceText, "CLOVER_EXTERNAL_REQUIRED_SERVER_FILES");
    const appRoot = path.join(root, "apps/clover-launch-studio");
    const configuration = before?.config;
    const hasOutputFileTracingRoot = configuration && typeof configuration === "object" && !Array.isArray(configuration)
      && Object.hasOwn(configuration, "outputFileTracingRoot");
    const hasRepoRoot = configuration && typeof configuration === "object" && !Array.isArray(configuration)
      && Object.hasOwn(configuration, "repoRoot");
    const hasTurbopack = configuration && typeof configuration === "object" && !Array.isArray(configuration)
      && Object.hasOwn(configuration, "turbopack");
    const hasTurbopackRoot = hasTurbopack && configuration.turbopack && typeof configuration.turbopack === "object"
      && !Array.isArray(configuration.turbopack) && Object.hasOwn(configuration.turbopack, "root");
    const compactProfile = !hasOutputFileTracingRoot && !hasRepoRoot && !hasTurbopack;
    const expandedShape = hasOutputFileTracingRoot && hasRepoRoot && hasTurbopackRoot;
    const expandedProfile = expandedShape && configuration.repoRoot === appRoot;
    const repositoryRootProfile = expandedShape && configuration.repoRoot === root;
    const runtimeServerDeploymentId = configuration?.experimental && typeof configuration.experimental === "object"
      && !Array.isArray(configuration.experimental) && Object.hasOwn(configuration.experimental, "runtimeServerDeploymentId")
      ? configuration.experimental.runtimeServerDeploymentId
      : undefined;
    const successorProfileExpected = expectedRuntimeDeploymentKey !== null || expectedSourceProvenance !== null;
    if (
      successorProfileExpected && (expectedRuntimeDeploymentKey === null || expectedSourceProvenance === null) ||
      successorProfileExpected && !repositoryRootProfile
    ) throw new Error("CLOVER_EXTERNAL_REQUIRED_SERVER_FILES_PROFILE_DOWNGRADE_REJECTED");
    const runtimeDeploymentKey = successorProfileExpected
      ? exactRuntimeDeploymentKey(expectedRuntimeDeploymentKey)
      : null;
    let embeddedSourceProvenance = null;
    if (repositoryRootProfile) {
      const encodedSourceProvenance = configuration?.env?.CLOVER_BUILD_PROVENANCE_JSON;
      if (
        !expectedSourceProvenance || typeof expectedSourceProvenance !== "object" || Array.isArray(expectedSourceProvenance) ||
        !configuration.env || typeof configuration.env !== "object" || Array.isArray(configuration.env) ||
        canonicalJson(Object.keys(configuration.env)) !== canonicalJson(["CLOVER_BUILD_PROVENANCE_JSON"]) ||
        typeof encodedSourceProvenance !== "string"
      ) throw new Error("CLOVER_EXTERNAL_REQUIRED_SERVER_FILES_SOURCE_PROVENANCE_REJECTED");
      embeddedSourceProvenance = parseJsonWithoutDuplicateKeys(
        encodedSourceProvenance,
        "CLOVER_EXTERNAL_REQUIRED_SERVER_FILES_SOURCE_PROVENANCE"
      );
      if (
        canonicalJson(embeddedSourceProvenance) !== canonicalJson(expectedSourceProvenance) ||
        embeddedSourceProvenance?.runtimeDeploymentKey !== runtimeDeploymentKey
      ) throw new Error("CLOVER_EXTERNAL_REQUIRED_SERVER_FILES_SOURCE_PROVENANCE_REJECTED");
    }
    const profile = repositoryRootProfile
      ? REQUIRED_SERVER_FILES_REPOSITORY_ROOT_PROFILE
      : expandedProfile ? REQUIRED_SERVER_FILES_EXPANDED_PROFILE : REQUIRED_SERVER_FILES_APP_DIR_ONLY_PROFILE;
    const expectedDifferences = expandedShape
      ? ["appDir", "config.outputFileTracingRoot", "config.repoRoot", "config.turbopack.root"]
      : ["appDir"];
    const rootOccurrenceCount = expectedDifferences.length;
    const expectedRootLocations = expectedDifferences.map((field) => ({ path: field, count: 1 }));
    const expectedSourceAbsoluteLocations = [
      { path: "appDir", value: appRoot },
      ...(expandedShape ? [
        { path: "config.outputFileTracingRoot", value: root },
        { path: "config.repoRoot", value: repositoryRootProfile ? root : appRoot },
        { path: "config.turbopack.root", value: root }
      ] : []),
      ...(configuration?.images?.path === "/_next/image"
        ? [{ path: "config.images.path", value: "/_next/image" }]
        : [])
    ].sort((left, right) => compareUtf8(left.path, right.path));
    if (
      before?.appDir !== appRoot || !configuration || typeof configuration !== "object" || Array.isArray(configuration) ||
      (!compactProfile && !expandedProfile && !repositoryRootProfile) ||
      (expandedShape && (configuration.outputFileTracingRoot !== root || configuration.turbopack.root !== root)) ||
      (repositoryRootProfile && (
        runtimeServerDeploymentId !== false || configuration.deploymentId !== runtimeDeploymentKey ||
        configuration.distDir !== ".next" || configuration.distDirRoot !== ".next"
      )) ||
      sourceText.split(root).length - 1 !== rootOccurrenceCount || sourceText.includes(RUNTIME_ROOT) ||
      canonicalJson(jsonStringTokenLocations(before, root)) !== canonicalJson(expectedRootLocations) ||
      canonicalJson(jsonAbsoluteStringLocations(before)) !== canonicalJson(expectedSourceAbsoluteLocations) ||
      jsonStringTokenLocations(before, RUNTIME_ROOT).length !== 0
    ) throw new Error("CLOVER_EXTERNAL_REQUIRED_SERVER_FILES_SOURCE_REJECTED");
    const sealedText = sourceText.split(root).join(RUNTIME_ROOT);
    const after = parseJsonWithoutDuplicateKeys(sealedText, "CLOVER_EXTERNAL_REQUIRED_SERVER_FILES_NORMALIZED");
    const differences = differingJsonKeys(before, after);
    const expectedSealedAbsoluteLocations = expectedSourceAbsoluteLocations.map((entry) => ({
      path: entry.path,
      value: entry.value.split(root).join(RUNTIME_ROOT)
    }));
    if (
      canonicalJson(differences) !== canonicalJson(expectedDifferences) || after.appDir !== `${RUNTIME_ROOT}/apps/clover-launch-studio` ||
      (expandedShape && (after.config.outputFileTracingRoot !== RUNTIME_ROOT || after.config.turbopack.root !== RUNTIME_ROOT)) ||
      (expandedProfile && after.config.repoRoot !== `${RUNTIME_ROOT}/apps/clover-launch-studio`) ||
      (repositoryRootProfile && (after.config.repoRoot !== RUNTIME_ROOT ||
        after.config.deploymentId !== runtimeDeploymentKey ||
        after.config.distDir !== ".next" || after.config.distDirRoot !== ".next" ||
        canonicalJson(parseJsonWithoutDuplicateKeys(
          after.config.env?.CLOVER_BUILD_PROVENANCE_JSON,
          "CLOVER_EXTERNAL_REQUIRED_SERVER_FILES_NORMALIZED_SOURCE_PROVENANCE"
        )) !== canonicalJson(embeddedSourceProvenance) ||
        after.config.experimental?.runtimeServerDeploymentId !== false)) ||
      sealedText.split(RUNTIME_ROOT).length - 1 !== rootOccurrenceCount || sealedText.includes(root) ||
      canonicalJson(jsonStringTokenLocations(after, RUNTIME_ROOT)) !== canonicalJson(expectedRootLocations) ||
      canonicalJson(jsonAbsoluteStringLocations(after)) !== canonicalJson(expectedSealedAbsoluteLocations) ||
      jsonStringTokenLocations(after, root).length !== 0
    ) throw new Error("CLOVER_EXTERNAL_REQUIRED_SERVER_FILES_NORMALIZATION_REJECTED");
    assertPublicOutputFile(
      { path: exactPath },
      Buffer.from(`${canonicalJson(after)}\n`, "utf8"),
      [root]
    );
    sealedBytes = Buffer.from(sealedText, "utf8");
    normalization = {
      classification: "next-required-server-files-runtime-root",
      profile,
      fields: expectedDifferences,
      rootOccurrenceCount,
      beforeSha256: sha256(sourceBytes),
      afterSha256: sha256(sealedBytes)
    };
  }
  const pinnedVendorSample = exactPath === PINNED_VENDOR_GENERIC_PATH_SAMPLE.path && sha256(sealedBytes) === PINNED_VENDOR_GENERIC_PATH_SAMPLE.sha256;
  assertPublicOutputFile({ path: exactPath }, sealedBytes, [root], { genericHostPathScan: !pinnedVendorSample });
  return { sealedBytes, normalization };
}

export function buildExternalDeploymentInputManifest(outputRoot, repositoryRoot, {
  expectedManifest = null,
  expectedRuntimeDeploymentKey = null,
  expectedSourceProvenance = null
} = {}) {
  const output = realpathSync(outputRoot);
  const outputManifest = buildOutputManifest(output, { excludedPath: null });
  if (outputManifest.symlinks.some(({ path: outputPath }) => isVercelFunctionConfigPath(outputPath))) {
    throw new Error("CLOVER_VC_CONFIG_SYMLINK_REJECTED");
  }
  const configEntries = outputManifest.files.filter(({ path: outputPath }) => isVercelFunctionConfigPath(outputPath));
  const referencedByPath = new Map();
  const configs = [];
  const configRecords = [];
  let totalReferenceCount = 0;
  for (const configEntry of configEntries) {
    const configPath = path.join(output, ...configEntry.path.split("/"));
    const configBytes = readFileSync(configPath);
    const config = parseExactJsonBytes(configBytes, `CLOVER_VC_CONFIG:${configEntry.path}`);
    configRecords.push({ path: configEntry.path, config });
    const map = config?.filePathMap;
    if (map !== undefined && (!map || typeof map !== "object" || Array.isArray(map))) {
      throw new Error(`CLOVER_VC_CONFIG_FILE_PATH_MAP_REJECTED:${configEntry.path}`);
    }
    const functionDirectory = path.posix.dirname(configEntry.path);
    const pathFields = [["handler", config?.handler], ["entrypoint", config?.entrypoint]].filter(([, value]) => value !== undefined);
    if (pathFields.length !== 1 || config?.assets !== undefined && (
      !config.assets || typeof config.assets !== "object" || Object.keys(config.assets).length !== 0
    )) throw new Error(`CLOVER_VC_CONFIG_CONTAINED_INPUT_REJECTED:${configEntry.path}`);
    const containedInputs = pathFields.map(([field, rawPath]) => {
      const relativePath = exactSourcePath(rawPath);
      const containedPath = exactSourcePath(functionDirectory === "." ? relativePath : `${functionDirectory}/${relativePath}`);
      if (functionDirectory !== "." && !containedPath.startsWith(`${functionDirectory}/`)) {
        throw new Error(`CLOVER_VC_CONFIG_CONTAINED_INPUT_REJECTED:${configEntry.path}`);
      }
      const containedEntry = outputManifest.files.find(({ path: outputPath }) => outputPath === containedPath);
      if (!containedEntry) throw new Error(`CLOVER_VC_CONFIG_CONTAINED_INPUT_MISSING:${configEntry.path}:${field}`);
      return { field, relativePath, path: containedPath, mode: containedEntry.mode, bytes: containedEntry.bytes, sha256: containedEntry.sha256 };
    });
    const references = [];
    for (const [rawKey, rawValue] of Object.entries(map ?? {}).sort(([left], [right]) => compareUtf8(left, right))) {
      if (typeof rawValue !== "string" || rawKey !== rawValue) {
        throw new Error(`CLOVER_VC_CONFIG_FILE_PATH_MAP_IDENTITY_REJECTED:${configEntry.path}`);
      }
      const externalPath = exactExternalDeploymentInputPath(rawValue);
      if (references.at(-1) === externalPath) throw new Error(`CLOVER_VC_CONFIG_FILE_PATH_MAP_DUPLICATE_REJECTED:${configEntry.path}`);
      references.push(externalPath);
      totalReferenceCount += 1;
      const referencedBy = referencedByPath.get(externalPath) ?? [];
      referencedBy.push(configEntry.path);
      referencedByPath.set(externalPath, referencedBy);
    }
    configs.push({
      path: configEntry.path,
      bytes: configEntry.bytes,
      sha256: configEntry.sha256,
      referenceCount: references.length,
      references,
      containedInputs
    });
  }
  requireCanonicalNextFunctionLauncherBindings({
    files: outputManifest.files,
    symlinks: outputManifest.symlinks,
    configRecords,
    label: "CLOVER_VC_CONFIG"
  });
  if (referencedByPath.size > 0 && repositoryRoot === undefined) throw new Error("CLOVER_EXTERNAL_DEPLOYMENT_INPUT_REPOSITORY_REQUIRED");
  requireLauncherRequiredServerFilesIdentity(
    output,
    requiredServerFilesConfigurationForLauncherIdentity({
      repositoryRoot,
      expectedRuntimeDeploymentKey,
      expectedSourceProvenance,
      sealedExternalInput: expectedManifest !== null,
      label: expectedManifest === null
        ? "CLOVER_LAUNCHER_REQUIRED_SERVER_FILES_SEALED"
        : "CLOVER_LAUNCHER_REQUIRED_SERVER_FILES_RESTORED"
    }),
    expectedManifest === null ? "sealed" : "restored"
  );
  if (expectedManifest !== null) {
    exactKeys(expectedManifest, [
      "schemaVersion", "allowedRoots", "configs", "files", "configCount", "totalReferenceCount", "regularFileCount",
      "aggregateRegularFileBytes", "aggregateSourceRegularFileBytes", "pathListSha256", "sourceInventorySha256",
      "sealedInventorySha256", "rootSha256"
    ], "CLOVER_EXTERNAL_DEPLOYMENT_INPUT_MANIFEST");
    const expectedBody = { ...expectedManifest };
    delete expectedBody.rootSha256;
    if (
      expectedManifest.schemaVersion !== EXTERNAL_DEPLOYMENT_INPUT_SCHEMA ||
      expectedManifest.rootSha256 !== sha256(`${canonicalJson(expectedBody)}\n`) ||
      canonicalJson(expectedManifest.allowedRoots) !== canonicalJson(EXTERNAL_DEPLOYMENT_INPUT_ROOTS) ||
      canonicalJson(expectedManifest.configs) !== canonicalJson(configs) || expectedManifest.configCount !== configs.length ||
      expectedManifest.totalReferenceCount !== totalReferenceCount || !Array.isArray(expectedManifest.files) ||
      expectedManifest.regularFileCount !== referencedByPath.size
    ) throw new Error("CLOVER_EXTERNAL_DEPLOYMENT_INPUT_MANIFEST_REJECTED");
    let aggregateRegularFileBytes = 0;
    let aggregateSourceRegularFileBytes = 0;
    let previousExternalPath = null;
    for (const expectedFile of expectedManifest.files) {
      exactKeys(expectedFile, [
        "path", "mode", "bytes", "sha256", "sourceBytes", "sourceSha256", "normalization", "referencedBy"
      ], "CLOVER_EXTERNAL_DEPLOYMENT_INPUT_FILE");
      const externalPath = exactExternalDeploymentInputPath(expectedFile.path);
      if (
        previousExternalPath !== null && compareUtf8(previousExternalPath, externalPath) >= 0 ||
        typeof expectedFile.mode !== "string" || !/^(?:0644|0664|0755)$/u.test(expectedFile.mode) ||
        !Number.isSafeInteger(expectedFile.bytes) || expectedFile.bytes < 0 ||
        !Number.isSafeInteger(expectedFile.sourceBytes) || expectedFile.sourceBytes < 0 ||
        typeof expectedFile.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(expectedFile.sha256) ||
        typeof expectedFile.sourceSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(expectedFile.sourceSha256) ||
        !Array.isArray(expectedFile.referencedBy)
      ) throw new Error("CLOVER_EXTERNAL_DEPLOYMENT_INPUT_FILE_REJECTED");
      previousExternalPath = externalPath;
      if (expectedFile.normalization === null) {
        if (
          externalPath === "apps/clover-launch-studio/.next/required-server-files.json" ||
          expectedFile.sourceBytes !== expectedFile.bytes || expectedFile.sourceSha256 !== expectedFile.sha256
        ) {
          throw new Error("CLOVER_EXTERNAL_DEPLOYMENT_INPUT_NORMALIZATION_REJECTED");
        }
      } else {
        exactKeys(expectedFile.normalization, [
          "classification", "profile", "fields", "rootOccurrenceCount", "beforeSha256", "afterSha256"
        ], "CLOVER_EXTERNAL_DEPLOYMENT_INPUT_NORMALIZATION");
        const expandedNormalization = expectedFile.normalization.profile === REQUIRED_SERVER_FILES_EXPANDED_PROFILE;
        const repositoryRootNormalization = expectedFile.normalization.profile === REQUIRED_SERVER_FILES_REPOSITORY_ROOT_PROFILE;
        const compactNormalization = expectedFile.normalization.profile === REQUIRED_SERVER_FILES_APP_DIR_ONLY_PROFILE;
        const expectedFields = expandedNormalization || repositoryRootNormalization
          ? ["appDir", "config.outputFileTracingRoot", "config.repoRoot", "config.turbopack.root"]
          : ["appDir"];
        if (
          externalPath !== "apps/clover-launch-studio/.next/required-server-files.json" ||
          expectedFile.normalization.classification !== "next-required-server-files-runtime-root" ||
          (!expandedNormalization && !repositoryRootNormalization && !compactNormalization) ||
          canonicalJson(expectedFile.normalization.fields) !== canonicalJson(expectedFields) ||
          expectedFile.normalization.rootOccurrenceCount !== expectedFields.length ||
          expectedFile.normalization.beforeSha256 !== expectedFile.sourceSha256 || expectedFile.normalization.afterSha256 !== expectedFile.sha256
        ) throw new Error("CLOVER_EXTERNAL_DEPLOYMENT_INPUT_NORMALIZATION_REJECTED");
      }
      const file = requireExternalDeploymentInputFile(repositoryRoot, externalPath);
      if (
        canonicalJson(expectedFile.referencedBy) !== canonicalJson(referencedByPath.get(externalPath)) ||
        file.mode.toString(8).padStart(4, "0") !== expectedFile.mode || file.bytes.length !== expectedFile.bytes ||
        sha256(file.bytes) !== expectedFile.sha256
      ) throw new Error(`CLOVER_EXTERNAL_DEPLOYMENT_INPUT_RESTORATION_REJECTED:${externalPath}`);
      if (externalPath === "apps/clover-launch-studio/.next/required-server-files.json") {
        const sealedText = decodeUtf8Fatal(file.bytes, "CLOVER_EXTERNAL_REQUIRED_SERVER_FILES_SEALED");
        const sealed = parseJsonWithoutDuplicateKeys(sealedText, "CLOVER_EXTERNAL_REQUIRED_SERVER_FILES_SEALED");
        const sealedConfiguration = sealed?.config;
        const expandedNormalization = expectedFile.normalization?.profile === REQUIRED_SERVER_FILES_EXPANDED_PROFILE;
        const repositoryRootNormalization = expectedFile.normalization?.profile === REQUIRED_SERVER_FILES_REPOSITORY_ROOT_PROFILE;
        const successorProfileExpected = expectedRuntimeDeploymentKey !== null || expectedSourceProvenance !== null;
        if (
          successorProfileExpected && (expectedRuntimeDeploymentKey === null || expectedSourceProvenance === null) ||
          successorProfileExpected && !repositoryRootNormalization
        ) throw new Error("CLOVER_EXTERNAL_REQUIRED_SERVER_FILES_PROFILE_DOWNGRADE_REJECTED");
        const runtimeDeploymentKey = successorProfileExpected
          ? exactRuntimeDeploymentKey(expectedRuntimeDeploymentKey)
          : null;
        const compactNormalization = expectedFile.normalization?.profile === REQUIRED_SERVER_FILES_APP_DIR_ONLY_PROFILE;
        const sealedHasOutputFileTracingRoot = sealedConfiguration && typeof sealedConfiguration === "object" && !Array.isArray(sealedConfiguration)
          && Object.hasOwn(sealedConfiguration, "outputFileTracingRoot");
        const sealedHasRepoRoot = sealedConfiguration && typeof sealedConfiguration === "object" && !Array.isArray(sealedConfiguration)
          && Object.hasOwn(sealedConfiguration, "repoRoot");
        const sealedHasTurbopack = sealedConfiguration && typeof sealedConfiguration === "object" && !Array.isArray(sealedConfiguration)
          && Object.hasOwn(sealedConfiguration, "turbopack");
        const expectedRootLocations = expectedFile.normalization.fields.map((field) => ({ path: field, count: 1 }));
        if (
          sealed?.appDir !== `${RUNTIME_ROOT}/apps/clover-launch-studio` || !sealedConfiguration ||
          typeof sealedConfiguration !== "object" || Array.isArray(sealedConfiguration) ||
          (!expandedNormalization && !repositoryRootNormalization && !compactNormalization) ||
          (compactNormalization && (sealedHasOutputFileTracingRoot || sealedHasRepoRoot || sealedHasTurbopack)) ||
          ((expandedNormalization || repositoryRootNormalization) && (!sealedHasOutputFileTracingRoot || !sealedHasRepoRoot || !sealedHasTurbopack ||
            sealedConfiguration.outputFileTracingRoot !== RUNTIME_ROOT ||
            !sealedConfiguration.turbopack || typeof sealedConfiguration.turbopack !== "object" ||
            Array.isArray(sealedConfiguration.turbopack) || sealedConfiguration.turbopack.root !== RUNTIME_ROOT)) ||
          (expandedNormalization && sealedConfiguration.repoRoot !== `${RUNTIME_ROOT}/apps/clover-launch-studio`) ||
          (repositoryRootNormalization && (sealedConfiguration.repoRoot !== RUNTIME_ROOT ||
            sealedConfiguration.deploymentId !== runtimeDeploymentKey ||
            sealedConfiguration.distDir !== ".next" || sealedConfiguration.distDirRoot !== ".next" ||
            !sealedConfiguration.env || typeof sealedConfiguration.env !== "object" ||
            Array.isArray(sealedConfiguration.env) ||
            canonicalJson(Object.keys(sealedConfiguration.env)) !== canonicalJson(["CLOVER_BUILD_PROVENANCE_JSON"]) ||
            canonicalJson(parseJsonWithoutDuplicateKeys(
              sealedConfiguration.env.CLOVER_BUILD_PROVENANCE_JSON,
              "CLOVER_EXTERNAL_REQUIRED_SERVER_FILES_SEALED_SOURCE_PROVENANCE"
            )) !== canonicalJson(expectedSourceProvenance) ||
            !sealedConfiguration.experimental || typeof sealedConfiguration.experimental !== "object" ||
            Array.isArray(sealedConfiguration.experimental) ||
            sealedConfiguration.experimental.runtimeServerDeploymentId !== false)) ||
          sealedText.split(RUNTIME_ROOT).length - 1 !== expectedFile.normalization.rootOccurrenceCount || sealedText.includes(realpathSync(repositoryRoot)) ||
          canonicalJson(jsonStringTokenLocations(sealed, RUNTIME_ROOT)) !== canonicalJson(expectedRootLocations) ||
          jsonStringTokenLocations(sealed, realpathSync(repositoryRoot)).length !== 0
        ) throw new Error("CLOVER_EXTERNAL_REQUIRED_SERVER_FILES_SEALED_REJECTED");
        assertPublicOutputFile(
          { path: externalPath },
          Buffer.from(`${canonicalJson(sealed)}\n`, "utf8"),
          [realpathSync(repositoryRoot)]
        );
      }
      const pinnedVendorSample = externalPath === PINNED_VENDOR_GENERIC_PATH_SAMPLE.path && expectedFile.sha256 === PINNED_VENDOR_GENERIC_PATH_SAMPLE.sha256;
      assertPublicOutputFile({ path: externalPath }, file.bytes, [realpathSync(repositoryRoot)], { genericHostPathScan: !pinnedVendorSample });
      aggregateRegularFileBytes += file.bytes.length;
      aggregateSourceRegularFileBytes += expectedFile.sourceBytes;
    }
    if (
      expectedManifest.files.length !== referencedByPath.size || aggregateRegularFileBytes !== expectedManifest.aggregateRegularFileBytes ||
      aggregateSourceRegularFileBytes !== expectedManifest.aggregateSourceRegularFileBytes ||
      new Set(expectedManifest.files.map(({ path: externalPath }) => externalPath)).size !== expectedManifest.files.length ||
      expectedManifest.pathListSha256 !== sha256(`${expectedManifest.files.map(({ path: externalPath }) => externalPath).join("\n")}\n`) ||
      expectedManifest.sourceInventorySha256 !== sha256(`${canonicalJson(expectedManifest.files.map((entry) => ({
        path: entry.path, type: "file", mode: entry.mode, bytes: entry.sourceBytes, sha256: entry.sourceSha256
      })))}\n`) ||
      expectedManifest.sealedInventorySha256 !== sha256(`${canonicalJson(expectedManifest.files.map((entry) => ({
        path: entry.path, type: "file", mode: entry.mode, bytes: entry.bytes, sha256: entry.sha256
      })))}\n`)
    ) throw new Error("CLOVER_EXTERNAL_DEPLOYMENT_INPUT_MANIFEST_REJECTED");
    return Object.freeze(structuredClone(expectedManifest));
  }
  const files = [];
  let aggregateRegularFileBytes = 0;
  let aggregateSourceRegularFileBytes = 0;
  for (const externalPath of [...referencedByPath.keys()].sort(compareUtf8)) {
    const file = requireExternalDeploymentInputFile(repositoryRoot, externalPath);
    const normalized = normalizeExternalDeploymentInputBytes(
      repositoryRoot,
      externalPath,
      file.bytes,
      expectedRuntimeDeploymentKey,
      expectedSourceProvenance
    );
    aggregateRegularFileBytes += normalized.sealedBytes.length;
    aggregateSourceRegularFileBytes += file.bytes.length;
    files.push({
      path: externalPath,
      mode: file.mode.toString(8).padStart(4, "0"),
      bytes: normalized.sealedBytes.length,
      sha256: sha256(normalized.sealedBytes),
      sourceBytes: file.bytes.length,
      sourceSha256: sha256(file.bytes),
      normalization: normalized.normalization,
      referencedBy: [...referencedByPath.get(externalPath)].sort(compareUtf8)
    });
  }
  const body = {
    schemaVersion: EXTERNAL_DEPLOYMENT_INPUT_SCHEMA,
    allowedRoots: [...EXTERNAL_DEPLOYMENT_INPUT_ROOTS],
    configs,
    files,
    configCount: configs.length,
    totalReferenceCount,
    regularFileCount: files.length,
    aggregateRegularFileBytes,
    aggregateSourceRegularFileBytes,
    pathListSha256: sha256(`${files.map(({ path: externalPath }) => externalPath).join("\n")}\n`),
    sourceInventorySha256: sha256(`${canonicalJson(files.map((entry) => ({
      path: entry.path, type: "file", mode: entry.mode, bytes: entry.sourceBytes, sha256: entry.sourceSha256
    })))}\n`),
    sealedInventorySha256: sha256(`${canonicalJson(files.map((entry) => ({
      path: entry.path, type: "file", mode: entry.mode, bytes: entry.bytes, sha256: entry.sha256
    })))}\n`)
  };
  return Object.freeze({ ...body, rootSha256: sha256(`${canonicalJson(body)}\n`) });
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

export function deterministicOutputArchive(outputRoot, {
  repositoryRoot,
  externalInputs = null,
  sealedWorkspace = false,
  expectedRuntimeDeploymentKey = null,
  expectedSourceProvenance = null
} = {}) {
  const root = realpathSync(outputRoot);
  buildOutputManifest(root, { excludedPath: null });
  const recomputedExternalInputs = buildExternalDeploymentInputManifest(root, repositoryRoot, {
    expectedManifest: sealedWorkspace ? externalInputs : null,
    expectedRuntimeDeploymentKey,
    expectedSourceProvenance
  });
  if (externalInputs !== null && canonicalJson(externalInputs) !== canonicalJson(recomputedExternalInputs)) {
    throw new Error("CLOVER_EXTERNAL_DEPLOYMENT_INPUT_MUTATION_REJECTED");
  }
  const parts = [];
  const entries = [
    ...walk(root).map((entry) => ({ ...entry, namespace: "output", archivePath: `${FROZEN_OUTPUT_ARCHIVE_PREFIX}${entry.path}` })),
    ...recomputedExternalInputs.files.map((entry) => {
      const source = requireExternalDeploymentInputFile(repositoryRoot, entry.path);
      const normalized = sealedWorkspace
        ? { sealedBytes: source.bytes, normalization: entry.normalization }
        : normalizeExternalDeploymentInputBytes(
          repositoryRoot,
          entry.path,
          source.bytes,
          expectedRuntimeDeploymentKey,
          expectedSourceProvenance
        );
      if (
        source.mode.toString(8).padStart(4, "0") !== entry.mode || !sealedWorkspace && (
          source.bytes.length !== entry.sourceBytes || sha256(source.bytes) !== entry.sourceSha256
        ) || normalized.sealedBytes.length !== entry.bytes ||
        sha256(normalized.sealedBytes) !== entry.sha256
      ) throw new Error(`CLOVER_EXTERNAL_DEPLOYMENT_INPUT_MUTATION_REJECTED:${entry.path}`);
      return {
        type: "file",
        path: entry.path,
        bytes: normalized.sealedBytes,
        stat: { mode: source.mode },
        namespace: "external",
        archivePath: `${FROZEN_WORKSPACE_ARCHIVE_PREFIX}${entry.path}`
      };
    })
  ].sort((left, right) => compareUtf8(left.archivePath, right.archivePath));
  for (const entry of entries) {
    const { archivePath } = entry;
    if (entry.type === "symlink") {
      parts.push(tarHeader(archivePath, { mode: entry.stat.mode & 0o7777, size: 0, type: "2", linkName: entry.target }));
      continue;
    }
    const bytes = entry.bytes ?? readFileSync(entry.absolutePath);
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

function deploymentInputInventoryRoot(finalManifest, externalInputs) {
  const domain = {
    schemaVersion: "clover-deployment-input-root-v2",
    files: finalManifest.files,
    symlinks: finalManifest.symlinks,
    externalInputs
  };
  return sha256(`${canonicalJson(domain)}\n`);
}

export function buildDeploymentInputManifest({
  outputRoot,
  repositoryRoot,
  expectedExternalInputs = null,
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
  const externalInputs = buildExternalDeploymentInputManifest(root, repositoryRoot, {
    expectedManifest: expectedExternalInputs,
    expectedRuntimeDeploymentKey: sourceProvenance.runtimeDeploymentKey,
    expectedSourceProvenance: sourceProvenance
  });
  const attestationEntry = finalManifest.files.find(({ path: outputPath }) => outputPath === ATTESTATION_OUTPUT_PATH);
  if (!attestationEntry || attestationEntry.sha256 !== sha256(attestationBytes) || attestationEntry.bytes !== attestationBytes.length) throw new Error("CLOVER_ATTESTATION_INVENTORY_REJECTED");
  const body = {
    documentType: "clover-tree-deployment-input-manifest",
    schemaVersion: "0.5.0",
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
    externalInputs,
    finalRegularFileCount: finalManifest.regularFileCount,
    finalSymlinkCount: finalManifest.symlinkCount,
    aggregateFinalRegularFileBytes: finalManifest.aggregateRegularFileBytes,
    externalRegularFileCount: externalInputs.regularFileCount,
    aggregateExternalRegularFileBytes: externalInputs.aggregateRegularFileBytes,
    deploymentInputRootSha256: deploymentInputInventoryRoot(finalManifest, externalInputs),
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
  const archivePaths = new Set();
  let previousArchivePath = null;
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
    let namespace;
    let entryPath;
    if (archivePath.startsWith(FROZEN_OUTPUT_ARCHIVE_PREFIX)) {
      namespace = "output";
      entryPath = exactSourcePath(archivePath.slice(FROZEN_OUTPUT_ARCHIVE_PREFIX.length));
    } else if (archivePath.startsWith(FROZEN_WORKSPACE_ARCHIVE_PREFIX)) {
      namespace = "external";
      entryPath = exactExternalDeploymentInputPath(archivePath.slice(FROZEN_WORKSPACE_ARCHIVE_PREFIX.length));
    } else {
      throw new Error("CLOVER_ARCHIVE_PATH_REJECTED");
    }
    if (archivePaths.has(archivePath)) throw new Error("CLOVER_ARCHIVE_DUPLICATE_PATH_REJECTED");
    if (previousArchivePath !== null && compareUtf8(previousArchivePath, archivePath) >= 0) throw new Error("CLOVER_ARCHIVE_ORDER_REJECTED");
    previousArchivePath = archivePath;
    archivePaths.add(archivePath);
    const mode = tarOctal(header.subarray(100, 108), "MODE");
    const size = tarOctal(header.subarray(124, 136), "SIZE");
    const type = String.fromCharCode(header[156]);
    if (type !== "0" && type !== "2" || namespace === "external" && type !== "0") throw new Error("CLOVER_ARCHIVE_TYPE_REJECTED");
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
    entries.push({ type: type === "0" ? "file" : "symlink", namespace, path: entryPath, archivePath, mode, content, target });
  }
  if (zeroBlocks !== 2 || offset !== bytes.length || bytes.subarray(offset).some((byte) => byte !== 0)) throw new Error("CLOVER_ARCHIVE_TERMINATOR_REJECTED");
  const entryByPath = new Map(entries.map((entry) => [entry.archivePath, entry]));
  const directories = new Set();
  for (const entry of entries) {
    const segments = entry.archivePath.split("/");
    for (let index = 1; index < segments.length; index += 1) directories.add(segments.slice(0, index).join("/"));
  }
  for (const entry of entries) {
    if (directories.has(entry.archivePath)) throw new Error("CLOVER_ARCHIVE_PATH_COLLISION_REJECTED");
  }
  const archivedExternalPaths = entries.filter(({ namespace }) => namespace === "external").map(({ path: entryPath }) => entryPath).sort(compareUtf8);
  const referencedExternalPaths = new Set();
  const archivedConfigs = entries.filter(({ namespace, type, path: entryPath }) =>
    namespace === "output" && type === "file" && isVercelFunctionConfigPath(entryPath));
  const archivedConfigRecords = [];
  if (entries.some(({ namespace, type, path: entryPath }) =>
    namespace === "output" && type === "symlink" && isVercelFunctionConfigPath(entryPath))) {
    throw new Error("CLOVER_ARCHIVE_VC_CONFIG_SYMLINK_REJECTED");
  }
  for (const configEntry of archivedConfigs) {
    const config = parseExactJsonBytes(configEntry.content, `CLOVER_ARCHIVE_VC_CONFIG:${configEntry.path}`);
    archivedConfigRecords.push({ path: configEntry.path, config });
    const map = config?.filePathMap;
    if (map !== undefined && (!map || typeof map !== "object" || Array.isArray(map))) throw new Error("CLOVER_ARCHIVE_VC_CONFIG_REJECTED");
    for (const [rawKey, rawValue] of Object.entries(map ?? {})) {
      if (typeof rawValue !== "string" || rawKey !== rawValue) throw new Error("CLOVER_ARCHIVE_VC_CONFIG_REJECTED");
      referencedExternalPaths.add(exactExternalDeploymentInputPath(rawValue));
    }
    const pathFields = [["handler", config?.handler], ["entrypoint", config?.entrypoint]].filter(([, value]) => value !== undefined);
    if (pathFields.length !== 1 || config?.assets !== undefined && (
      !config.assets || typeof config.assets !== "object" || Object.keys(config.assets).length !== 0
    )) throw new Error("CLOVER_ARCHIVE_VC_CONFIG_REJECTED");
    for (const [, rawPath] of pathFields) {
      const functionDirectory = path.posix.dirname(configEntry.path);
      const relativePath = exactSourcePath(rawPath);
      const containedPath = exactSourcePath(functionDirectory === "." ? relativePath : `${functionDirectory}/${relativePath}`);
      const containedArchivePath = `${FROZEN_OUTPUT_ARCHIVE_PREFIX}${containedPath}`;
      if (functionDirectory !== "." && !containedPath.startsWith(`${functionDirectory}/`) || entryByPath.get(containedArchivePath)?.type !== "file") {
        throw new Error("CLOVER_ARCHIVE_VC_CONFIG_CONTAINED_INPUT_REJECTED");
      }
    }
  }
  requireCanonicalNextFunctionLauncherBindings({
    files: entries.filter(({ namespace, type }) => namespace === "output" && type === "file"),
    symlinks: entries.filter(({ namespace, type }) => namespace === "output" && type === "symlink"),
    configRecords: archivedConfigRecords,
    label: "CLOVER_ARCHIVE_VC_CONFIG"
  });
  if (canonicalJson(archivedExternalPaths) !== canonicalJson([...referencedExternalPaths].sort(compareUtf8))) {
    throw new Error("CLOVER_ARCHIVE_EXTERNAL_INPUT_INVENTORY_REJECTED");
  }
  const resolveLink = (linkPath, target) => {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(linkPath), target));
    if (!resolved.startsWith(FROZEN_OUTPUT_ARCHIVE_PREFIX)) throw new Error("CLOVER_ARCHIVE_LINK_REJECTED");
    try { exactSourcePath(resolved.slice(FROZEN_OUTPUT_ARCHIVE_PREFIX.length)); } catch { throw new Error("CLOVER_ARCHIVE_LINK_REJECTED"); }
    return resolved;
  };
  for (const entry of entries.filter(({ type }) => type === "symlink")) {
    const visited = new Set([entry.archivePath]);
    let resolved = resolveLink(entry.archivePath, entry.target);
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

export function restoreDeterministicOutputArchive(archive, restoreRoot, {
  expectedExternalInputs = null,
  expectedRuntimeDeploymentKey = null,
  expectedSourceProvenance = null
} = {}) {
  const destination = path.resolve(restoreRoot);
  if (existsSync(destination)) throw new Error("CLOVER_ARCHIVE_RESTORE_DESTINATION_REJECTED");
  const destinationParent = path.dirname(destination);
  const parentStat = lstatSync(destinationParent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || realpathSync(destinationParent) !== destinationParent) throw new Error("CLOVER_ARCHIVE_RESTORE_DESTINATION_REJECTED");
  const entries = parseDeterministicArchive(archive);
  const outputRoot = path.join(destination, ".vercel", "output");
  try {
    mkdirSync(outputRoot, { recursive: true, mode: 0o755 });
    for (const entry of entries.filter(({ type }) => type === "file")) {
      const targetRoot = entry.namespace === "output" ? outputRoot : destination;
      const target = path.join(targetRoot, ...entry.path.split("/"));
      mkdirSync(path.dirname(target), { recursive: true, mode: 0o755 });
      writeFileSync(target, entry.content, { mode: entry.mode, flag: "wx" });
      chmodSync(target, entry.mode);
    }
    for (const entry of entries.filter(({ type }) => type === "symlink")) {
      const target = path.join(outputRoot, ...entry.path.split("/"));
      mkdirSync(path.dirname(target), { recursive: true, mode: 0o755 });
      symlinkSync(entry.target, target);
      if ((lstatSync(target).mode & 0o7777) !== entry.mode) {
        try { lchmodSync(target, entry.mode); } catch { throw new Error(`CLOVER_ARCHIVE_SYMLINK_MODE_REJECTED:${entry.path}`); }
      }
      if ((lstatSync(target).mode & 0o7777) !== entry.mode) throw new Error(`CLOVER_ARCHIVE_SYMLINK_MODE_REJECTED:${entry.path}`);
    }
    buildOutputManifest(outputRoot, { excludedPath: null });
    buildExternalDeploymentInputManifest(outputRoot, destination, {
      expectedManifest: expectedExternalInputs,
      expectedRuntimeDeploymentKey,
      expectedSourceProvenance
    });
    return outputRoot;
  } catch (error) {
    if (existsSync(destination)) rmSync(destination, { recursive: true, force: true });
    throw error;
  }
}

function createFinalArchiveManifest({ archive, deploymentInputManifest, attestation, payloadManifest, sourceProvenance }) {
  const body = {
    documentType: "clover-tree-final-archive-manifest",
    schemaVersion: "0.5.0",
    sourceCommit: sourceProvenance.commit,
    buildInvocationId: sourceProvenance.buildInvocationId,
    deploymentInputRootSha256: deploymentInputManifest.deploymentInputRootSha256,
    deploymentInputManifestSelfHash: deploymentInputManifest.manifestSelfHash,
    externalInputRootSha256: deploymentInputManifest.externalInputs.rootSha256,
    externalInputPathListSha256: deploymentInputManifest.externalInputs.pathListSha256,
    externalSourceInventorySha256: deploymentInputManifest.externalInputs.sourceInventorySha256,
    externalSealedInventorySha256: deploymentInputManifest.externalInputs.sealedInventorySha256,
    externalRegularFileCount: deploymentInputManifest.externalInputs.regularFileCount,
    aggregateExternalRegularFileBytes: deploymentInputManifest.externalInputs.aggregateRegularFileBytes,
    payloadManifestRootSha256: payloadManifest.rootSha256,
    attestationRawSha256: deploymentInputManifest.attestation.rawSha256,
    attestationSelfHash: attestation.attestationHash,
    archiveBytes: archive.length,
    archiveSha256: sha256(archive),
    archiveFormat: "deterministic-frozen-workspace-ustar-v2",
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
  const provenance = sourceProvenance ?? deriveSourceProvenance({ repositoryRoot: repository });
  const normalizedOutput = normalizeGeneratedOutput({
    outputRoot: root,
    checkoutRoot: repository,
    sourceProvenance: provenance
  });
  const { normalization, cliInvocation } = normalizedOutput;
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
    repositoryRoot: repository,
    sourceProvenance: provenance,
    payloadManifest: outputManifest,
    attestation,
    normalization
  });
  const deploymentInputManifestPath = path.join(evidence, DEPLOYMENT_INPUT_MANIFEST_FILE);
  writeFileSync(deploymentInputManifestPath, `${canonicalJson(deploymentInputManifest)}\n`, { mode: 0o644, flag: "wx" });
  const archive = deterministicOutputArchive(root, {
    repositoryRoot: repository,
    externalInputs: deploymentInputManifest.externalInputs,
    expectedRuntimeDeploymentKey: provenance.runtimeDeploymentKey,
    expectedSourceProvenance: provenance
  });
  const archivePath = path.join(evidence, FINAL_ARCHIVE_FILE);
  writeFileSync(archivePath, archive, { mode: 0o644, flag: "wx" });
  chmodSync(archivePath, 0o644);
  const archiveManifest = createFinalArchiveManifest({ archive, deploymentInputManifest, attestation, payloadManifest: outputManifest, sourceProvenance: provenance });
  const archiveManifestPath = path.join(evidence, FINAL_ARCHIVE_MANIFEST_FILE);
  writeFileSync(archiveManifestPath, `${canonicalJson(archiveManifest)}\n`, { mode: 0o644, flag: "wx" });
  const restoreParent = mkdtempSync(path.join(tmpdir(), "clover-frozen-output-restore-"));
  const restoreRoot = path.join(realpathSync(restoreParent), "restored");
  try {
    const restoredOutput = restoreDeterministicOutputArchive(archive, restoreRoot, {
      expectedExternalInputs: deploymentInputManifest.externalInputs,
      expectedRuntimeDeploymentKey: provenance.runtimeDeploymentKey,
      expectedSourceProvenance: provenance
    });
    const restoredDeploymentInputManifest = buildDeploymentInputManifest({
      outputRoot: restoredOutput,
      repositoryRoot: restoreRoot,
      expectedExternalInputs: deploymentInputManifest.externalInputs,
      sourceProvenance: provenance,
      payloadManifest: outputManifest,
      attestation,
      normalization
    });
    if (canonicalJson(restoredDeploymentInputManifest) !== canonicalJson(deploymentInputManifest)) throw new Error("CLOVER_ARCHIVE_RESTORATION_IDENTITY_REJECTED");
    if (!deterministicOutputArchive(restoredOutput, {
      repositoryRoot: restoreRoot,
      externalInputs: restoredDeploymentInputManifest.externalInputs,
      sealedWorkspace: true,
      expectedRuntimeDeploymentKey: provenance.runtimeDeploymentKey,
      expectedSourceProvenance: provenance
    }).equals(archive)) throw new Error("CLOVER_ARCHIVE_RESTORATION_BYTES_REJECTED");
  } finally {
    rmSync(restoreParent, { recursive: true, force: true });
  }
  let frozenOutput = null;
  if (frozenOutputRoot !== null) {
    const frozenDestination = validateFreshExternalDirectoryPath(frozenOutputRoot, [root, evidence], "CLOVER_FROZEN_OUTPUT_DESTINATION");
    frozenOutput = restoreDeterministicOutputArchive(archive, frozenDestination, {
      expectedExternalInputs: deploymentInputManifest.externalInputs,
      expectedRuntimeDeploymentKey: provenance.runtimeDeploymentKey,
      expectedSourceProvenance: provenance
    });
    const frozenManifest = buildDeploymentInputManifest({
      outputRoot: frozenOutput,
      repositoryRoot: frozenDestination,
      expectedExternalInputs: deploymentInputManifest.externalInputs,
      sourceProvenance: provenance,
      payloadManifest: outputManifest,
      attestation,
      normalization
    });
    if (
      canonicalJson(frozenManifest) !== canonicalJson(deploymentInputManifest) ||
      !deterministicOutputArchive(frozenOutput, {
        repositoryRoot: frozenDestination,
        externalInputs: frozenManifest.externalInputs,
        sealedWorkspace: true,
        expectedRuntimeDeploymentKey: provenance.runtimeDeploymentKey,
        expectedSourceProvenance: provenance
      }).equals(archive)
    ) throw new Error("CLOVER_FROZEN_OUTPUT_IDENTITY_REJECTED");
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
      : isCanonicalNextFunctionLauncherPath(itemPath) ? "next-launcher-runtime-root" : null;
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
  const outputParent = path.dirname(root);
  const inferredWorkspace = path.basename(root) === "output" && path.basename(outputParent) === ".vercel"
    ? path.dirname(outputParent)
    : repository;
  const deploymentWorkspace = inferredWorkspace === repository ? repository : requireCanonicalRealDirectory(inferredWorkspace, "CLOVER_FROZEN_WORKSPACE");
  const sealedWorkspace = deploymentWorkspace !== repository;
  const evidence = realpathSync(evidenceDirectory);
  if (evidence === root || evidence.startsWith(`${root}${path.sep}`)) throw new Error("CLOVER_EXTERNAL_EVIDENCE_LOCATION_REJECTED");
  const provenance = sourceProvenance ?? deriveSourceProvenance({ repositoryRoot: repository });
  buildOutputManifest(root, { excludedPath: null });
  verifyLauncherSourceIdentities(root, provenance);
  requireLauncherRequiredServerFilesIdentity(
    root,
    requiredServerFilesConfigurationForLauncherIdentity({
      repositoryRoot: deploymentWorkspace,
      expectedRuntimeDeploymentKey: provenance.runtimeDeploymentKey,
      expectedSourceProvenance: provenance,
      sealedExternalInput: sealedWorkspace,
      label: "CLOVER_LAUNCHER_REQUIRED_SERVER_FILES_VERIFICATION"
    }),
    "verification"
  );
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
    repositoryRoot: deploymentWorkspace,
    expectedExternalInputs: sealedWorkspace ? deploymentInputRead.value.externalInputs : null,
    sourceProvenance: provenance,
    payloadManifest: recomputedPayload,
    attestation: attestationRead.value,
    normalization: attestationRead.value.normalization
  });
  if (canonicalJson(deploymentInputRead.value) !== canonicalJson(recomputedDeploymentInput)) throw new Error("CLOVER_DEPLOYMENT_INPUT_MUTATION_REJECTED");
  const recomputedArchive = deterministicOutputArchive(root, {
    repositoryRoot: deploymentWorkspace,
    externalInputs: recomputedDeploymentInput.externalInputs,
    sealedWorkspace,
    expectedRuntimeDeploymentKey: provenance.runtimeDeploymentKey,
    expectedSourceProvenance: provenance
  });
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
    const restoredWorkspace = path.join(realpathSync(restoreParent), "restored");
    const restoredOutput = restoreDeterministicOutputArchive(archive, restoredWorkspace, {
      expectedExternalInputs: recomputedDeploymentInput.externalInputs,
      expectedRuntimeDeploymentKey: provenance.runtimeDeploymentKey,
      expectedSourceProvenance: provenance
    });
    const restoredManifest = buildDeploymentInputManifest({
      outputRoot: restoredOutput,
      repositoryRoot: restoredWorkspace,
      expectedExternalInputs: recomputedDeploymentInput.externalInputs,
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

function exactProviderRequest(value, { method, url, response, requestProjection = NO_PROVIDER_REQUEST_BODY, nowTime, nativeContent = false }, label) {
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
  boundProviderTree(response);
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
    value.responseMediaTypeEssence !== "application/json" || value.responseCharset !== null && value.responseCharset !== "utf-8" && !(nativeContent && method === "GET" && /^https:\/\/api\.vercel\.com\/v8\/deployments\/dpl_[A-Za-z0-9]+\/files\/[0-9a-f]{40}\?teamId=team_kx19aCrSTnej6wpz0fLgmYDY$/u.test(url) && value.responseCharset === "utf8") ||
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

function exactSingleProviderDeploymentTransition({
  beforeDeployments,
  afterDeployments,
  postRevocationDeployments,
  deployment,
  invocationStartedTime,
  invocationCompletedTime
}) {
  const beforeCount = beforeDeployments.count;
  const expectedAfterCount = beforeCount + 1;
  const priorAfterEntries = afterDeployments.entries.filter(({ id }) => id !== deployment.id);
  const addedEntries = afterDeployments.entries.filter(({ id }) => id === deployment.id);
  const beforeProduction = beforeDeployments.entries.filter(({ target }) => target === "production");
  const afterProduction = afterDeployments.entries.filter(({ target }) => target === "production");
  const postRevocationProduction = postRevocationDeployments.entries.filter(({ target }) => target === "production");
  const expectedNewEntry = {
    createdAt: deployment.createdAt,
    id: deployment.id,
    state: deployment.state,
    target: deployment.target
  };
  if (
    !Number.isSafeInteger(beforeCount) || beforeCount < 0 || beforeCount >= beforeDeployments.boundedLimit ||
    afterDeployments.count !== expectedAfterCount ||
    beforeDeployments.entries.some(({ id }) => id === deployment.id) || addedEntries.length !== 1 ||
    canonicalJson(addedEntries[0]) !== canonicalJson(expectedNewEntry) ||
    deployment.createdAt < invocationStartedTime || deployment.createdAt > invocationCompletedTime
  ) throw new Error("CLOVER_PROVIDER_EFFECT_DEPLOYMENTS_REJECTED");
  if (canonicalJson(beforeProduction) !== canonicalJson(afterProduction)) {
    throw new Error("CLOVER_PROVIDER_EFFECT_PRODUCTION_REJECTED");
  }
  if (canonicalJson(priorAfterEntries) !== canonicalJson(beforeDeployments.entries)) {
    throw new Error("CLOVER_PROVIDER_EFFECT_DEPLOYMENTS_REJECTED");
  }
  if (postRevocationDeployments.count !== expectedAfterCount) {
    throw new Error("CLOVER_PROVIDER_POST_REVOCATION_DEPLOYMENTS_CHANGED");
  }
  if (canonicalJson(postRevocationProduction) !== canonicalJson(afterProduction)) {
    throw new Error("CLOVER_PROVIDER_POST_REVOCATION_PRODUCTION_CHANGED");
  }
  if (canonicalJson(postRevocationDeployments) !== canonicalJson(afterDeployments)) {
    throw new Error("CLOVER_PROVIDER_POST_REVOCATION_DEPLOYMENTS_CHANGED");
  }
  return Object.freeze({
    beforeCount,
    afterCount: expectedAfterCount,
    beforeProduction,
    afterProduction,
    postRevocationProduction
  });
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


export const NATIVE_FILE_TREE_PROFILE = "vercel-native-peer-roots-v1";
export const LEGACY_FILE_TREE_PROFILE = "vercel-legacy-nested-out-v1";
const NATIVE_MAX_BYTES = 32 * 1024 * 1024;
const NATIVE_MAX_DEPTH = 64;
const NATIVE_MAX_ENTRIES = 50_000;
const NATIVE_MAX_AGGREGATE_BODY_BYTES = 128 * 1024 * 1024;

// Bound hostile objects before canonicalization. No caller-owned node is sorted or rewritten.
function boundProviderTree(response) {
  const pending = [{ value: response, depth: 0 }];
  const seen = new Set();
  let entries = 0;
  let textBytes = 0;
  while (pending.length) {
    const { value, depth } = pending.pop();
    if (depth > NATIVE_MAX_DEPTH * 3 || ++entries > NATIVE_MAX_ENTRIES * 8) throw new Error("CLOVER_PROVIDER_TREE_LIMIT_REJECTED");
    if (typeof value === "string") textBytes += Buffer.byteLength(value);
    if (textBytes > NATIVE_MAX_BYTES) throw new Error("CLOVER_PROVIDER_TREE_LIMIT_REJECTED");
    if (value && typeof value === "object") {
      if (seen.has(value)) throw new Error("CLOVER_PROVIDER_TREE_ALIAS_REJECTED");
      seen.add(value);
      for (const [key, child] of Object.entries(value)) {
        textBytes += Buffer.byteLength(key);
        pending.push({ value: child, depth: depth + 1 });
      }
    }
  }
  if (Buffer.byteLength(canonicalJson(response)) > NATIVE_MAX_BYTES) throw new Error("CLOVER_PROVIDER_TREE_LIMIT_REJECTED");
}

export function parseProviderFileTree({ response, expectsExternalInputs, profile = LEGACY_FILE_TREE_PROFILE, rawBytes } = {}) {
  if (![LEGACY_FILE_TREE_PROFILE, NATIVE_FILE_TREE_PROFILE].includes(profile) || typeof expectsExternalInputs !== "boolean") throw new Error("CLOVER_PROVIDER_TREE_PROFILE_REJECTED");
  const native = profile === NATIVE_FILE_TREE_PROFILE;
  let rawBodySha256 = null;
  let rawBodyBytes = null;
  if (native) {
    if (!Buffer.isBuffer(rawBytes) || rawBytes.length === 0 || rawBytes.length > NATIVE_MAX_BYTES) throw new Error("CLOVER_PROVIDER_RAW_BODY_REJECTED");
    const parsed = parseJsonWithoutDuplicateKeys(decodeUtf8Fatal(rawBytes, "CLOVER_PROVIDER_NATIVE_JSON"), "CLOVER_PROVIDER_NATIVE_JSON", NATIVE_MAX_DEPTH * 3);
    boundProviderTree(parsed);
    boundProviderTree(response);
    if (canonicalJson(parsed) !== canonicalJson(response)) throw new Error("CLOVER_PROVIDER_RAW_PROJECTION_MISMATCH");
    rawBodySha256 = sha256(rawBytes);
    rawBodyBytes = rawBytes.length;
  } else {
    if (rawBytes !== undefined) throw new Error("CLOVER_PROVIDER_LEGACY_RAW_BODY_REJECTED");
    boundProviderTree(response);
  }
  const safeNodeName = (name) => {
    if (typeof name !== "string" || name.length === 0 || name.length > 255 || Buffer.from(name, "utf8").toString("utf8") !== name || name === "." || name === ".." || name !== name.normalize("NFC") || /[\\/\u0000-\u001f\u007f]/u.test(name)) throw new Error("CLOVER_PROVIDER_FILE_PATH_REJECTED");
    return name;
  };
  const runtimeOccurrences = [];
  const runtimePaths = new Map();
  let runtimeCount = 0;
  const validateNativeRuntime = (node, fullPath, ordinal) => {
    safeNodeName(node?.name);
    if (++runtimeCount > NATIVE_MAX_ENTRIES || ordinal.length > NATIVE_MAX_DEPTH) throw new Error("CLOVER_PROVIDER_RUNTIME_LIMIT_REJECTED");
    exactSourcePath(fullPath);
    const occurrences = runtimePaths.get(fullPath) ?? [];
    if (occurrences.includes(node.type) || occurrences.length >= 2 || occurrences.length === 1 && !["directory", "lambda"].includes(node.type)) throw new Error("CLOVER_PROVIDER_RUNTIME_COLLISION_REJECTED");
    occurrences.push(node.type);
    runtimePaths.set(fullPath, occurrences);
    if (node.type === "directory") {
      exactKeys(node, ["name", "type", "mode", "children"], "CLOVER_PROVIDER_RUNTIME_DIRECTORY");
      if (node.mode !== 0o40555 || !Array.isArray(node.children)) throw new Error("CLOVER_PROVIDER_RUNTIME_DIRECTORY_REJECTED");
      runtimeOccurrences.push({ namespace: "out", path: fullPath, type: node.type, mode: node.mode, ordinal: [...ordinal], uid: null });
      node.children.forEach((child, index) => validateNativeRuntime(child, `${fullPath}/${safeNodeName(child?.name)}`, [...ordinal, index]));
    } else {
      exactKeys(node, ["name", "type", "mode", "uid"], "CLOVER_PROVIDER_RUNTIME_LAMBDA");
      // Observed CLI native profile: team-scoped opaque ID, not a source-content hash.
      if (node.type !== "lambda" || node.mode !== 0o140666 || typeof node.uid !== "string" || !new RegExp(`^${VERCEL_TEAM_ID}-[0-9a-f]{34}$`, "u").test(node.uid)) throw new Error("CLOVER_PROVIDER_RUNTIME_LAMBDA_REJECTED");
      runtimeOccurrences.push({ namespace: "out", path: fullPath, type: node.type, mode: node.mode, ordinal: [...ordinal], uid: node.uid });
    }
  };
  const roots = response;
  if (!Array.isArray(roots)) throw new Error("CLOVER_PROVIDER_FILE_TREE_REJECTED");
  if (roots.length !== (native ? 2 : 1)) throw new Error("CLOVER_PROVIDER_FILE_TREE_REJECTED");
  if (native && (new Set(roots.map(({ name }) => name)).size !== 2 || !roots.some(({ name }) => name === "out"))) throw new Error("CLOVER_PROVIDER_FILE_TREE_REJECTED");
  const src = native ? roots.find(({ name }) => name === "src") : roots[0];
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
  const expectedSourceChildNames = expectsExternalInputs ? [".vercel", "apps"] : [".vercel"];
  if (!native) expectedSourceChildNames.push("out");
  if (canonicalJson(sourceChildNames) !== canonicalJson(expectedSourceChildNames)) throw new Error("CLOVER_PROVIDER_FILE_TREE_REJECTED");
  const vercel = childByName(src, ".vercel");
  exactKeys(vercel, ["name", "type", "mode", "children"], "CLOVER_PROVIDER_DIRECTORY");
  if (vercel.type !== "directory" || vercel.mode !== 0o40555 || !Array.isArray(vercel.children)) throw new Error("CLOVER_PROVIDER_FILE_TREE_REJECTED");
  if (vercel.children.length !== 1 || safeNodeName(vercel.children[0]?.name) !== "output") throw new Error("CLOVER_PROVIDER_FILE_TREE_REJECTED");
  const output = childByName(vercel, "output");
  exactKeys(output, ["name", "type", "mode", "children"], "CLOVER_PROVIDER_DIRECTORY");
  if (output.type !== "directory" || output.mode !== 0o40555 || !Array.isArray(output.children)) throw new Error("CLOVER_PROVIDER_FILE_TREE_REJECTED");
  const providerOut = native ? roots.find(({ name }) => name === "out") : childByName(src, "out");
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
  if (native && (providerOut?.type !== "directory" || providerOut.name !== "out")) throw new Error("CLOVER_PROVIDER_RUNTIME_ROOT_REJECTED");
  if (native) validateNativeRuntime(providerOut, "out", [roots.indexOf(providerOut)]);
  else validateIgnoredProviderTree(providerOut);
  const rawEntries = [];
  const flatten = (directory, prefix) => {
    if (prefix.split("/").length > NATIVE_MAX_DEPTH || rawEntries.length > NATIVE_MAX_ENTRIES) throw new Error("CLOVER_PROVIDER_SOURCE_LIMIT_REJECTED");
    const names = directory.children.map((child) => safeNodeName(child.name));
    if (new Set(names).size !== names.length) throw new Error("CLOVER_PROVIDER_DUPLICATE_PATH_REJECTED");
    for (const node of [...directory.children].sort((left, right) => compareUtf8(left.name, right.name))) {
      if (rawEntries.length >= NATIVE_MAX_ENTRIES) throw new Error("CLOVER_PROVIDER_SOURCE_LIMIT_REJECTED");
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
  flatten(output, ".vercel/output");
  if (expectsExternalInputs) {
    const apps = childByName(src, "apps");
    exactKeys(apps, ["name", "type", "mode", "children"], "CLOVER_PROVIDER_DIRECTORY");
    if (apps.type !== "directory" || apps.mode !== 0o40555 || !Array.isArray(apps.children)) throw new Error("CLOVER_PROVIDER_FILE_TREE_REJECTED");
    flatten(apps, "apps");
  }
  return Object.freeze({
    profile, rawEntries, runtimeOccurrences,
    rawBodyBytes, rawBodySha256,
    canonicalObservationSha256: sha256(`${canonicalJson(response)}\n`),
    runtimeObservationSha256: sha256(`${canonicalJson(runtimeOccurrences)}\n`),
    consequentialAuthorityGranted: false
  });
}

// Verifies a separately retained native v8 body against a source entry. This is not an acceptance receipt.
export function verifyNativeProviderContent({ rawBytes, response, entry, request, deploymentId, now = new Date() } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("CLOVER_PROVIDER_NATIVE_CONTENT_TIME_REJECTED");
  if (!/^dpl_[A-Za-z0-9]+$/u.test(deploymentId) || !Buffer.isBuffer(rawBytes) || rawBytes.length === 0 || rawBytes.length > NATIVE_MAX_BYTES) throw new Error("CLOVER_PROVIDER_NATIVE_CONTENT_REJECTED");
  const parsed = parseJsonWithoutDuplicateKeys(decodeUtf8Fatal(rawBytes, "CLOVER_PROVIDER_NATIVE_CONTENT"), "CLOVER_PROVIDER_NATIVE_CONTENT", 4);
  exactKeys(parsed, ["data"], "CLOVER_PROVIDER_NATIVE_CONTENT");
  exactKeys(response, ["data"], "CLOVER_PROVIDER_NATIVE_CONTENT");
  boundProviderTree(response);
  if (canonicalJson(parsed) !== canonicalJson(response)) throw new Error("CLOVER_PROVIDER_RAW_CONTENT_MISMATCH");
  if (!entry || !["file", "symlink"].includes(entry.type) || !/^[0-9a-f]{40}$/u.test(entry.uid)) throw new Error("CLOVER_PROVIDER_NATIVE_CONTENT_ENTRY_REJECTED");
  const sourcePath = exactSourcePath(entry.path);
  if (!sourcePath.startsWith(".vercel/output/") && !EXTERNAL_DEPLOYMENT_INPUT_ROOTS.some((root) => sourcePath.startsWith(root))) throw new Error("CLOVER_PROVIDER_NATIVE_CONTENT_ENTRY_REJECTED");
  exactProviderRequest(request, {
    method: "GET", url: canonicalProviderUrl("v8", `deployments/${deploymentId}/files/${entry.uid}`, [["teamId", VERCEL_TEAM_ID]]),
    response, nowTime: now.getTime(), nativeContent: true
  }, "CLOVER_PROVIDER_NATIVE_CONTENT_REQUEST");
  const bytes = decodeCanonicalBase64(parsed.data, "CLOVER_PROVIDER_NATIVE_BASE64");
  if (sha1(bytes) !== entry.uid) throw new Error("CLOVER_PROVIDER_UID_REJECTED");
  return Object.freeze({ path: sourcePath, uid: entry.uid, rawBodyBytes: rawBytes.length, rawBodySha256: sha256(rawBytes),
    canonicalObservationSha256: sha256(`${canonicalJson(response)}\n`), decodedBytes: bytes.length, decodedSha256: sha256(bytes),
    providerAcceptance: false, consequentialAuthorityGranted: false });
}

export function createProviderDeploymentReceipt({ providerDeployment, verifiedEvidence, now = new Date(), fileTreeProfile = LEGACY_FILE_TREE_PROFILE, nativeFileTreeBytes, nativeContentBodies, receiptProfile = HISTORICAL_RECEIPT_PROFILE, previewContract, previewSourceProof }) {
  const nowTime = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(nowTime) || new Date(nowTime).toISOString() !== now.toISOString()) throw new Error("CLOVER_PROVIDER_RECEIPT_TIME_REJECTED");
  const generatedAt = new Date(nowTime).toISOString();
  if (![HISTORICAL_RECEIPT_PROFILE, CI_PREVIEW_RECEIPT_PROFILE].includes(receiptProfile)
    || receiptProfile === HISTORICAL_RECEIPT_PROFILE && (previewContract !== undefined || previewSourceProof !== undefined)
    || receiptProfile === CI_PREVIEW_RECEIPT_PROFILE && fileTreeProfile !== NATIVE_FILE_TREE_PROFILE) {
    throw new Error("CLOVER_CI_PREVIEW_RECEIPT_PROFILE_REJECTED");
  }
  const previewExecution = receiptProfile === CI_PREVIEW_RECEIPT_PROFILE
    ? validateCiPreviewExecutionContract({ contract: previewContract, sourceProof: previewSourceProof, verifiedEvidence, now,
      executionStartedAt: providerDeployment?.deploymentInvocation?.startedAt,
      executionCompletedAt: providerDeployment?.deploymentInvocation?.completedAt })
    : null;
  const expectedSourceBranch = previewExecution?.sourceBranch ?? "feature/clover-tree-command-center-launch-studio-v0.1-20260826";
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
    raw.meta.gitCommitSha !== expectedCommit || raw.meta.gitCommitRef !== expectedSourceBranch ||
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
    "--meta", `gitCommitRef=${expectedSourceBranch}`,
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
  const deploymentTransition = exactSingleProviderDeploymentTransition({
    beforeDeployments,
    afterDeployments,
    postRevocationDeployments: effectsPostRevocation.deployments.response,
    deployment: raw,
    invocationStartedTime,
    invocationCompletedTime
  });
  const { beforeProduction, afterProduction, postRevocationProduction } = deploymentTransition;
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
  if (
    effectsPostRevocation.project.response.providerProjectUpdatedAt < effectsAfter.project.response.providerProjectUpdatedAt ||
    canonicalJson(stableProjectSnapshot(effectsPostRevocation.project.response)) !== canonicalJson(stableProjectSnapshot(effectsAfter.project.response))
  ) throw new Error("CLOVER_PROVIDER_POST_REVOCATION_PROJECT_CHANGED");
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

  exactKeys(providerDeployment.fileTree, ["request", "response"], "CLOVER_PROVIDER_FILE_TREE_READBACK");
  const parsedFileTree = parseProviderFileTree({
    response: providerDeployment.fileTree.response,
    expectsExternalInputs: verifiedEvidence.deploymentInputManifest.externalInputs.regularFileCount > 0,
    profile: fileTreeProfile,
    rawBytes: nativeFileTreeBytes
  });
  readRequest(providerDeployment.fileTree.request, {
    method: "GET",
    url: canonicalProviderUrl("v6", `deployments/${raw.id}/files`, [["teamId", VERCEL_TEAM_ID]]),
    response: providerDeployment.fileTree.response
  }, "CLOVER_PROVIDER_FILE_TREE_REQUEST");
  const { rawEntries } = parsedFileTree;
  const contentByPath = new Map();
  const nativeContentObservations = [];
  if (fileTreeProfile === NATIVE_FILE_TREE_PROFILE && (!Array.isArray(nativeContentBodies) || nativeContentBodies.length !== providerDeployment.contents.length)) throw new Error("CLOVER_PROVIDER_NATIVE_CONTENT_INVENTORY_REJECTED");
  if (fileTreeProfile === NATIVE_FILE_TREE_PROFILE && (nativeContentBodies.length > NATIVE_MAX_ENTRIES || nativeContentBodies.some((entry) => !Buffer.isBuffer(entry?.rawBytes))
    || nativeContentBodies.reduce((total, entry) => total + entry.rawBytes.length, 0) > NATIVE_MAX_AGGREGATE_BODY_BYTES)) throw new Error("CLOVER_PROVIDER_NATIVE_CONTENT_BUDGET_REJECTED");
  if (fileTreeProfile !== NATIVE_FILE_TREE_PROFILE && nativeContentBodies !== undefined) throw new Error("CLOVER_PROVIDER_LEGACY_CONTENT_BODY_REJECTED");
  for (const candidate of providerDeployment.contents) {
    exactKeys(candidate, ["path", "uid", "request", "response"], "CLOVER_PROVIDER_CONTENT");
    exactKeys(candidate.response, ["data"], "CLOVER_PROVIDER_CONTENT_RESPONSE");
    if (typeof candidate.path !== "string" || !candidate.path.startsWith("src/") || typeof candidate.uid !== "string" || !/^[0-9a-f]{40}$/u.test(candidate.uid)) throw new Error("CLOVER_PROVIDER_CONTENT_REJECTED");
    const workspacePath = exactSourcePath(candidate.path.slice("src/".length));
    if (!workspacePath.startsWith(".vercel/output/") && !EXTERNAL_DEPLOYMENT_INPUT_ROOTS.some((root) => workspacePath.startsWith(root))) {
      throw new Error("CLOVER_PROVIDER_CONTENT_REJECTED");
    }
    if (contentByPath.has(workspacePath)) throw new Error("CLOVER_PROVIDER_CONTENT_DUPLICATE_REJECTED");
    readRequest(candidate.request, {
      method: "GET",
      url: canonicalProviderUrl("v8", `deployments/${raw.id}/files/${candidate.uid}`, fileTreeProfile === NATIVE_FILE_TREE_PROFILE ? [["teamId", VERCEL_TEAM_ID]] : [["path", candidate.path], ["teamId", VERCEL_TEAM_ID]]),
      nativeContent: fileTreeProfile === NATIVE_FILE_TREE_PROFILE,
      response: candidate.response
    }, "CLOVER_PROVIDER_CONTENT_REQUEST");
    if (fileTreeProfile === NATIVE_FILE_TREE_PROFILE) {
      const bodies = nativeContentBodies.filter((item) => item.path === candidate.path);
      if (bodies.length !== 1) throw new Error("CLOVER_PROVIDER_NATIVE_CONTENT_INVENTORY_REJECTED");
      exactKeys(bodies[0], ["path", "rawBytes"], "CLOVER_PROVIDER_NATIVE_CONTENT_BODY");
      const entry = rawEntries.find((item) => item.path === workspacePath);
      if (!entry || entry.uid !== candidate.uid) throw new Error("CLOVER_PROVIDER_UID_REJECTED");
      nativeContentObservations.push(verifyNativeProviderContent({ rawBytes: bodies[0].rawBytes, response: candidate.response, entry,
        request: candidate.request, deploymentId: raw.id, now }));
    }
    contentByPath.set(workspacePath, { uid: candidate.uid, bytes: decodeCanonicalBase64(candidate.response.data, "CLOVER_PROVIDER_FILE_CONTENT") });
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
    ...verifiedEvidence.deploymentInputManifest.files.map((entry) => ({ type: "file", ...entry, path: `.vercel/output/${entry.path}` })),
    ...verifiedEvidence.deploymentInputManifest.symlinks.map((entry) => ({ type: "symlink", ...entry, path: `.vercel/output/${entry.path}` })),
    ...verifiedEvidence.deploymentInputManifest.externalInputs.files.map((entry) => ({
      type: "file", path: entry.path, mode: entry.mode, bytes: entry.bytes, sha256: entry.sha256
    }))
  ].sort((left, right) => compareUtf8(left.path, right.path));
  const expectedDirectories = [...new Set(expectedEntries.flatMap(({ path: outputPath }) => {
    const segments = outputPath.split("/");
    return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("/"));
  }))].filter((directory) => ![".vercel", ".vercel/output", "apps"].includes(directory)).sort(compareUtf8);
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
    schemaVersion: previewExecution !== null ? "1.0.0" : fileTreeProfile === NATIVE_FILE_TREE_PROFILE ? "0.9.0" : "0.8.0",
    ...(previewExecution !== null ? { receiptProfile, previewExecution } : {}),
    ...(fileTreeProfile === NATIVE_FILE_TREE_PROFILE ? {
      fileTreeAdapterProfile: parsedFileTree.profile,
      fileTreeRawBodyBytes: parsedFileTree.rawBodyBytes,
      fileTreeRawBodySha256: parsedFileTree.rawBodySha256,
      fileTreeCanonicalObservationSha256: parsedFileTree.canonicalObservationSha256,
      runtimeOccurrences: parsedFileTree.runtimeOccurrences,
      runtimeObservationSha256: parsedFileTree.runtimeObservationSha256,
      runtimeEntriesUsedAsSource: false,
      nativeContentObservations: nativeContentObservations.sort((left, right) => compareUtf8(left.path, right.path))
    } : {}),
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
    sourceBranch: expectedSourceBranch,
    sourceCommit: expectedCommit,
    deploymentInputRootSha256: verifiedEvidence.deploymentInputManifest.deploymentInputRootSha256,
    deploymentInputManifestSelfHash: verifiedEvidence.deploymentInputManifest.manifestSelfHash,
    payloadManifestRootSha256: verifiedEvidence.payloadManifest.rootSha256,
    attestationRawSha256: verifiedEvidence.deploymentInputManifest.attestation.rawSha256,
    archiveSha256: verifiedEvidence.archiveManifest.archiveSha256,
    finalRegularFileCount: verifiedEvidence.deploymentInputManifest.finalRegularFileCount,
    finalSymlinkCount: verifiedEvidence.deploymentInputManifest.finalSymlinkCount,
    externalRegularFileCount: verifiedEvidence.deploymentInputManifest.externalInputs.regularFileCount,
    externalRegularFileBytes: verifiedEvidence.deploymentInputManifest.externalInputs.aggregateRegularFileBytes,
    externalInputRootSha256: verifiedEvidence.deploymentInputManifest.externalInputs.rootSha256,
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

function readBoundedNativeBody(filePath, maximumBytes = NATIVE_MAX_BYTES) {
  const resolved = path.resolve(filePath);
  if (realpathSync(path.dirname(resolved)) !== path.dirname(resolved)) throw new Error("CLOVER_NATIVE_BODY_PARENT_REJECTED");
  const descriptor = openSync(resolved, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size === 0 || before.size > maximumBytes || before.nlink !== 1) throw new Error("CLOVER_NATIVE_BODY_FILE_REJECTED");
    const bytes = Buffer.alloc(before.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, null);
      if (count === 0) break;
      offset += count;
    }
    const after = fstatSync(descriptor);
    if (offset !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new Error("CLOVER_NATIVE_BODY_FILE_CHANGED");
    return bytes.subarray(0, offset);
  } finally { closeSync(descriptor); }
}

export function loadNativeProviderContentBodies({ indexPath, expectedPaths } = {}) {
  const indexBytes = readBoundedNativeBody(indexPath);
  const index = parseJsonWithoutDuplicateKeys(decodeUtf8Fatal(indexBytes, "CLOVER_NATIVE_CONTENT_INDEX"), "CLOVER_NATIVE_CONTENT_INDEX", 4);
  if (!Buffer.from(`${canonicalJson(index)}\n`).equals(indexBytes) || !Array.isArray(index) || index.length > NATIVE_MAX_ENTRIES
    || !Array.isArray(expectedPaths) || index.length !== expectedPaths.length || new Set(expectedPaths).size !== expectedPaths.length) throw new Error("CLOVER_NATIVE_CONTENT_INDEX_REJECTED");
  const isSourcePath = (value) => typeof value === "string" && value.startsWith("src/")
    && (value.startsWith("src/.vercel/output/") || EXTERNAL_DEPLOYMENT_INPUT_ROOTS.some((root) => value.startsWith(`src/${root}`)))
    && exactSourcePath(value) === value;
  if (!expectedPaths.every(isSourcePath)) throw new Error("CLOVER_NATIVE_CONTENT_INDEX_REJECTED");
  const paths = new Set();
  const expectedPathSet = new Set(expectedPaths);
  for (const entry of index) {
    exactKeys(entry, ["path", "bodyFile"], "CLOVER_NATIVE_CONTENT_INDEX_ENTRY");
    if (!isSourcePath(entry.path) || !expectedPathSet.has(entry.path) || paths.has(entry.path)
      || typeof entry.bodyFile !== "string" || !path.isAbsolute(entry.bodyFile) || entry.bodyFile.includes("\0")) throw new Error("CLOVER_NATIVE_CONTENT_INDEX_REJECTED");
    paths.add(entry.path);
  }
  // Complete index/source identity and aggregate-size checks precede any content-body read.
  let total = 0;
  for (const entry of index) {
    const stat = lstatSync(entry.bodyFile);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size === 0 || stat.size > NATIVE_MAX_BYTES) throw new Error("CLOVER_NATIVE_BODY_FILE_REJECTED");
    total += stat.size;
    if (total > NATIVE_MAX_AGGREGATE_BODY_BYTES) throw new Error("CLOVER_NATIVE_BODY_BUDGET_REJECTED");
  }
  total = 0;
  return index.map((entry) => {
    const rawBytes = readBoundedNativeBody(entry.bodyFile, Math.min(NATIVE_MAX_BYTES, NATIVE_MAX_AGGREGATE_BODY_BYTES - total));
    total += rawBytes.length;
    return { path: entry.path, rawBytes };
  });
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
  if (command === "repair-source") {
    process.stdout.write(`${canonicalJson(deriveAttestationRepairSource({ repositoryRoot }))}\n`);
    return;
  }
  if (command === "readiness-ci-proof") return runCiPreviewProviderProof(repositoryRoot);
  if (command === "readiness-source") {
    process.stdout.write(`${canonicalJson(deriveCiPreviewReadinessSource({ repositoryRoot }))}\n`);
    return;
  }
  if (command === "dependency-source") {
    process.stdout.write(`${canonicalJson(deriveDependencySuccessorSource({ repositoryRoot }))}\n`);
    return;
  }
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
      externalInputRootSha256: result.deploymentInputManifest.externalInputs.rootSha256,
      externalRegularFileCount: result.deploymentInputManifest.externalInputs.regularFileCount,
      aggregateExternalRegularFileBytes: result.deploymentInputManifest.externalInputs.aggregateRegularFileBytes,
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
    const receiptProfile = options["receipt-profile"] ?? HISTORICAL_RECEIPT_PROFILE;
    if (receiptProfile === CI_PREVIEW_RECEIPT_PROFILE && !options["preview-contract"]
      || receiptProfile !== CI_PREVIEW_RECEIPT_PROFILE && options["preview-contract"] !== undefined) {
      throw new Error("CLOVER_CI_PREVIEW_RECEIPT_ARGUMENT_REJECTED");
    }
    const previewContract = options["preview-contract"]
      ? readCanonicalDocument(path.resolve(options["preview-contract"]), "CLOVER_CI_PREVIEW_EXECUTION_CONTRACT").value
      : undefined;
    const previewSourceProof = previewContract === undefined ? undefined
      : deriveCiPreviewReadinessSource({ repositoryRoot });
    const receipt = createProviderDeploymentReceipt({ providerDeployment: provider, verifiedEvidence: verified,
      receiptProfile, previewContract, previewSourceProof,
      fileTreeProfile: options["file-tree-profile"] ?? LEGACY_FILE_TREE_PROFILE,
      nativeFileTreeBytes: options["native-tree-body"] ? readBoundedNativeBody(options["native-tree-body"]) : undefined,
      nativeContentBodies: options["native-content-index"] ? loadNativeProviderContentBodies({
        indexPath: options["native-content-index"],
        expectedPaths: [
          ...verified.deploymentInputManifest.files.map((entry) => `src/.vercel/output/${entry.path}`),
          ...verified.deploymentInputManifest.symlinks.map((entry) => `src/.vercel/output/${entry.path}`),
          ...verified.deploymentInputManifest.externalInputs.files.map((entry) => `src/${entry.path}`)
        ]
      }) : undefined
    });
    const receiptPath = requireFreshExternalFilePath(options.receipt, realpathSync(options.output), "CLOVER_PROVIDER_RECEIPT_LOCATION");
    writeFileSync(receiptPath, `${canonicalJson(receipt)}\n`, { mode: 0o644, flag: "wx" });
    process.stdout.write(`${canonicalJson(receipt)}\n`);
    return;
  }
  throw new Error("usage: clover-deployment-attestation.mjs <dependency-source|repair-source|source|source-manifest|project-settings|output|verify|receipt> [options]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === "readiness-ci-proof" || process.argv[2] === "readiness-source" && process.env.GITHUB_ACTIONS === "true") {
    Promise.resolve().then(main).catch((error) => {
      process.stderr.write(canonicalJson(safeCiDiagnosticError(error)) + "\n");
      process.exitCode = 1;
    });
  } else main();
}
