import assert from "node:assert/strict";
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
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getEnv } from "@vercel/functions";
import {
  EXPECTED_MAIN_COMMIT,
  EXPECTED_MAIN_RULESET_ID,
  EXPECTED_MAIN_TREE,
  EXPECTED_GITHUB_WORKFLOWS,
  EXPECTED_MASTER_WORKFLOW_ID,
  EXPECTED_STACK_A_BASE_COMMIT,
  EXPECTED_STACK_A_HEAD,
  EXPECTED_STACK_B_CHANGED_PATH_COUNT,
  EXPECTED_STACK_B_PATH_LIST_SHA256,
  GITHUB_CACHE_REVALIDATE_SECONDS,
  GITHUB_REVALIDATE_SECONDS,
  GITHUB_ORIGIN,
  GITHUB_REPOSITORY,
  GITHUB_REPOSITORY_ID,
  MAX_GITHUB_CHECK_RUN_PAGES,
  MAX_GITHUB_CHECK_RUNS,
  MAX_GITHUB_RESPONSE_BYTES,
  MAX_GITHUB_WORKFLOW_RUNS,
  NO_ATTESTATION_COMPARISON,
  REQUIRED_EXACT_HEAD_CHECKS,
  STACK_A_BRANCH,
  STACK_B_BRANCH,
  computeTruthReadiness,
  observeDeploymentSelf,
  observeGitHubTruth,
  parseDeploymentSelfObservation,
  parseGitHubLiveObservation,
  projectVercelRuntimeEnvironment,
  reconcileTreeTruth
} from "../src/lib/live-truth.ts";
import {
  ATTESTATION_OUTPUT_PATH,
  DEPLOYMENT_INPUT_MANIFEST_FILE,
  FINAL_ARCHIVE_FILE,
  STACK_A_BASE,
  VERCEL_BUILD_COMMAND,
  VERCEL_CLI_INTEGRITY,
  VERCEL_CLI_VERSION,
  VERCEL_PROJECT_ID,
  VERCEL_PROJECT_NAME,
  VERCEL_TEAM_ID,
  VERCEL_TEAM_NAME,
  VERCEL_TEAM_SLUG,
  buildOutputManifest,
  canonicalJson,
  canonicalVercelBuildProjectSettings,
  createDeploymentAttestation,
  createProviderDeploymentReceipt,
  deterministicOutputArchive,
  deriveSourceManifestEntries,
  parseSourceChanges,
  deriveSourceProvenance,
  restoreDeterministicOutputArchive,
  requireExactVercelCliInvocation,
  verifyDeploymentInputEvidence
} from "../scripts/clover-deployment-attestation.mjs";
import { compareDeploymentAttestation, parseBuildProvenance } from "../src/lib/provenance.ts";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sha1 = (value) => createHash("sha1").update(value).digest("hex");
const hex40 = (character) => character.repeat(40);
const hex64 = (character) => character.repeat(64);
const candidateCommit = hex40("a");
const candidateTree = hex40("b");
const candidateParent = hex40("c");
const runtimeDeploymentKey = `clover-${candidateCommit.slice(0, 24)}`;
const runtimeRequestUrl = "https://clover-tree-command-center-abc.vercel.app/api/tree";
const mergedStackAHead = "fce3cbc5073f7f4a4f9cd8a51af9636f524ac8f7";
const mergedStackABase = "be45c4991a63e7e4ac6ca55a1e612f8bbe4fe5cb";
const integratedPathListSha256 = "9217479f428109ec268f8e2579e6da55abb649080306966c31d5ab62edc8a6a8";
const defaultGithubSourceTime = new Date(Math.floor(Date.now() / 1_000) * 1_000).toISOString();
const defaultGithubSourceDate = new Date(defaultGithubSourceTime).toUTCString();
const masterWorkflowRunId = 900_001;
const workflowRunIds = new Map(EXPECTED_GITHUB_WORKFLOWS.map((workflow, index) => [workflow.id, masterWorkflowRunId - (EXPECTED_GITHUB_WORKFLOWS.length - 1 - index)]));
const workflowForCheck = (name) => EXPECTED_GITHUB_WORKFLOWS.find(({ requiredChecks }) => requiredChecks.includes(name));

function workflowRunFixture(expectedWorkflow, {
  id = workflowRunIds.get(expectedWorkflow.id),
  headSha = candidateCommit,
  path = expectedWorkflow.path,
  name = expectedWorkflow.name,
  workflowId = expectedWorkflow.id,
  event = "pull_request",
  status = "completed",
  conclusion = status === "completed" ? "success" : null,
  startedAt = "2026-08-29T16:31:00.000Z",
  createdAt = startedAt,
  updatedAt = status === "completed" ? new Date(Date.parse(startedAt) + 12 * 60 * 60 * 1_000).toISOString() : startedAt,
  runAttempt = 1
} = {}) {
  return {
    id,
    name,
    head_branch: STACK_B_BRANCH,
    head_sha: headSha,
    path,
    event,
    status,
    conclusion,
    workflow_id: workflowId,
    url: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/actions/runs/${id}`,
    html_url: `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${id}`,
    pull_requests: [{
      url: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/pulls/35`,
      number: 35,
      head: { ref: STACK_B_BRANCH, sha: headSha, repo: { id: GITHUB_REPOSITORY_ID, url: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}`, name: "first" } },
      base: { ref: "main", sha: EXPECTED_MAIN_COMMIT, repo: { id: GITHUB_REPOSITORY_ID, url: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}`, name: "first" } }
    }],
    created_at: createdAt,
    updated_at: updatedAt,
    run_attempt: runAttempt,
    run_started_at: startedAt,
    workflow_url: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/actions/workflows/${workflowId}`,
    repository: { id: GITHUB_REPOSITORY_ID, full_name: GITHUB_REPOSITORY },
    head_repository: { id: GITHUB_REPOSITORY_ID, full_name: GITHUB_REPOSITORY }
  };
}

function masterWorkflowRunFixture(overrides = {}) {
  return workflowRunFixture(EXPECTED_GITHUB_WORKFLOWS.at(-1), overrides);
}

const buildSource = {
  commit: candidateCommit,
  tree: candidateTree,
  parent: candidateParent,
  stackABase: EXPECTED_MAIN_COMMIT,
  runtimeDeploymentKey,
  cleanWorktree: true,
  changedPathCount: EXPECTED_STACK_B_CHANGED_PATH_COUNT,
  pathListSha256: EXPECTED_STACK_B_PATH_LIST_SHA256,
  sourceManifestSha256: hex64("2"),
  packageLockSha256: hex64("3"),
  treeProgramIndexId: "tree-program:index:0001",
  treeProgramIndexHash: hex64("4"),
  treeProgramIndexRawSha256: hex64("5"),
  nodeVersion: "v24.16.0",
  nextVersion: "16.3.3",
  buildMode: "vercel-prebuilt-preview",
  buildCommand: "npm run build",
  buildOutputCommand: VERCEL_BUILD_COMMAND,
  buildOutputToolPackage: "vercel",
  buildOutputToolVersion: VERCEL_CLI_VERSION,
  buildOutputToolIntegrity: VERCEL_CLI_INTEGRITY,
  buildProjectSettingsSha256: sha256(`${canonicalJson(canonicalVercelBuildProjectSettings())}\n`)
};
const build = parseBuildProvenance({
  documentType: "clover-tree-build-provenance",
  schemaVersion: "0.3.0",
  ...buildSource,
  buildInvocationId: `clover-build:${sha256(`${canonicalJson(buildSource)}\n`)}`,
  publicSanitized: true,
  privateDataAccessed: false,
  consequentialAuthorityGranted: false
});
const buildWith = (overrides = {}) => {
  const source = { ...buildSource, ...overrides };
  return parseBuildProvenance({
    documentType: "clover-tree-build-provenance",
    schemaVersion: "0.3.0",
    ...source,
    buildInvocationId: `clover-build:${sha256(`${canonicalJson(source)}\n`)}`,
    publicSanitized: true,
    privateDataAccessed: false,
    consequentialAuthorityGranted: false
  });
};

const baseline = {
  index: {
    indexId: "tree-program:index:0001",
    indexHash: hex64("4"),
    observedAt: "2026-08-26T19:55:59.000Z",
    publicSanitized: true,
    privateDataAccessed: false
  },
  branches: [], relationships: [], masterPlan: [], milestones: [], progress: [], sourceCoverage: [], status: [], captainLog: [],
  fruitForecasts: [], fruitObservations: [], understandingDeltas: [], actionCards: [], modelPackets: [], providerStatus: []
};

function githubFixture(endpoint) {
  if (endpoint === `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}`) return { id: GITHUB_REPOSITORY_ID, full_name: GITHUB_REPOSITORY, default_branch: "main" };
  if (endpoint.endsWith("/branches/main")) {
    return { name: "main", protected: true, commit: { sha: EXPECTED_MAIN_COMMIT, commit: { tree: { sha: EXPECTED_MAIN_TREE } } } };
  }
  if (endpoint.endsWith("/pulls/34")) {
    return {
      number: 34, state: "closed", draft: false, merged: true, merged_at: "2026-08-29T16:24:08Z", mergeable: null, updated_at: "2026-08-29T16:24:08Z",
      head: { sha: EXPECTED_STACK_A_HEAD, ref: STACK_A_BRANCH, repo: { full_name: GITHUB_REPOSITORY } },
      base: { sha: EXPECTED_STACK_A_BASE_COMMIT, ref: "main", repo: { full_name: GITHUB_REPOSITORY } }
    };
  }
  if (endpoint.endsWith("/pulls/35")) {
    return {
      number: 35, state: "open", draft: true, merged: false, merged_at: null, mergeable: true, updated_at: "2026-08-29T16:30:00Z",
      head: { sha: candidateCommit, ref: STACK_B_BRANCH, repo: { full_name: GITHUB_REPOSITORY } },
      base: { sha: EXPECTED_MAIN_COMMIT, ref: "main", repo: { full_name: GITHUB_REPOSITORY } }
    };
  }
  if (endpoint.endsWith(`/rulesets/${EXPECTED_MAIN_RULESET_ID}`)) {
    return {
      id: EXPECTED_MAIN_RULESET_ID,
      name: "Clover Required Main Protection",
      target: "branch",
      source_type: "Repository",
      source: GITHUB_REPOSITORY,
      enforcement: "active",
      conditions: { ref_name: { exclude: [], include: ["refs/heads/main"] } },
      rules: [
        { type: "deletion" },
        { type: "non_fast_forward" },
        { type: "pull_request", parameters: { required_approving_review_count: 0, dismiss_stale_reviews_on_push: true, required_reviewers: [], require_code_owner_review: false, require_last_push_approval: false, required_review_thread_resolution: true, require_extra_approval_for_unattributed_changes: false, allowed_merge_methods: ["merge", "squash", "rebase"] } },
        { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, do_not_enforce_on_create: false, required_status_checks: [{ context: "Clover required main gate (Node 22)", integration_id: 15368 }, { context: "Clover required main gate (Node 24)", integration_id: 15368 }] } }
      ]
    };
  }
  const workflow = EXPECTED_GITHUB_WORKFLOWS.find(({ id }) => endpoint.includes(`/actions/workflows/${id}/runs?`));
  if (workflow) return { total_count: 1, workflow_runs: [workflowRunFixture(workflow)] };
  if (endpoint.includes(`/commits/${candidateCommit}/check-runs`)) {
    const check_runs = REQUIRED_EXACT_HEAD_CHECKS.map((name, index) => checkRun({ id: index + 1, name }));
    return { total_count: check_runs.length, check_runs };
  }
  throw new Error(`unexpected fixture endpoint ${endpoint}`);
}

function githubFetch({ sourceDate = defaultGithubSourceDate, mutate = (value) => value } = {}) {
  const calls = [];
  const implementation = async (endpoint, options) => {
    calls.push({ endpoint, options });
    const body = JSON.stringify(mutate(structuredClone(githubFixture(endpoint)), endpoint));
    const headers = new Headers({ "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) });
    const responseDate = typeof sourceDate === "function" ? sourceDate(endpoint) : sourceDate;
    if (responseDate) headers.set("date", responseDate);
    const response = new Response(body, { status: 200, headers });
    Object.defineProperty(response, "url", { value: endpoint });
    return response;
  };
  return { calls, implementation };
}

function checkRun({
  id,
  name = `auxiliary-check-${id}`,
  headSha = candidateCommit,
  status = "completed",
  conclusion = status === "completed" ? "success" : null,
  startedAt = new Date(Date.UTC(2026, 7, 29, 16, 31, 0) + id * 1_000).toISOString(),
  completedAt = status === "completed" ? new Date(Date.parse(startedAt) + 500).toISOString() : null,
  runId = workflowRunIds.get(workflowForCheck(name)?.id) ?? 100_000 + id
}) {
  return { id, name, head_sha: headSha, status, conclusion, started_at: startedAt, completed_at: completedAt, app: { id: 15368, slug: "github-actions" }, details_url: `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${runId}/job/${id}` };
}

function githubPageEndpoint(page, commit = candidateCommit, canonicalRepository = false) {
  const repositoryPath = canonicalRepository ? `repositories/${GITHUB_REPOSITORY_ID}` : `repos/${GITHUB_REPOSITORY}`;
  return `${GITHUB_ORIGIN}/${repositoryPath}/commits/${commit}/check-runs?filter=all&per_page=100&page=${page}`;
}

function githubPaginationFetch({ pages, totalCount, linkForPage, responseForPage, sourceDate = defaultGithubSourceDate }) {
  const calls = [];
  const implementation = async (endpoint, options) => {
    calls.push({ endpoint, options });
    if (!endpoint.includes(`/commits/${candidateCommit}/check-runs`)) {
      const body = JSON.stringify(githubFixture(endpoint));
      const responseDate = typeof sourceDate === "function" ? sourceDate(endpoint) : sourceDate;
      const headers = new Headers({ date: responseDate, "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) });
      const response = new Response(body, { status: 200, headers });
      Object.defineProperty(response, "url", { value: endpoint });
      return response;
    }
    const page = Number(new URL(endpoint).searchParams.get("page"));
    if (responseForPage) {
      const replacement = await responseForPage(page, endpoint, options);
      if (replacement) return replacement;
    }
    const check_runs = structuredClone(pages[page - 1] ?? []);
    const body = JSON.stringify({ total_count: typeof totalCount === "function" ? totalCount(page) : totalCount, check_runs });
    const responseDate = typeof sourceDate === "function" ? sourceDate(endpoint) : sourceDate;
    const headers = new Headers({ date: responseDate, "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) });
    const link = linkForPage ? linkForPage(page) : page < pages.length
      ? `<${githubPageEndpoint(page + 1, candidateCommit, true)}>; rel="next", <${githubPageEndpoint(pages.length, candidateCommit, true)}>; rel="last"`
      : page > 1
        ? `<${githubPageEndpoint(1, candidateCommit, true)}>; rel="first", <${githubPageEndpoint(page - 1, candidateCommit, true)}>; rel="prev"`
        : null;
    if (link) headers.set("link", link);
    const response = new Response(body, { status: 200, headers });
    Object.defineProperty(response, "url", { value: endpoint });
    return response;
  };
  return { calls, implementation };
}

function previewEnvironment(overrides = {}) {
  return {
    VERCEL_ENV: "preview",
    VERCEL_URL: "clover-tree-command-center-abc.vercel.app",
    VERCEL_PROJECT_ID: "prj_1lfjYV2FehNxEyW9hGqNwAe7a8xZ",
    VERCEL_DEPLOYMENT_ID: "dpl_Abc123",
    VERCEL_REGION: "iad1",
    VERCEL_GIT_COMMIT_SHA: candidateCommit,
    VERCEL_SKEW_PROTECTION_ENABLED: "1",
    ...overrides
  };
}

function deploymentObservation(environment = previewEnvironment(), requestUrl = runtimeRequestUrl, nextDeploymentId = runtimeDeploymentKey) {
  return observeDeploymentSelf({
    build,
    environmentReader: () => projectVercelRuntimeEnvironment(getEnv(environment), environment),
    runtimeDeploymentKeyReader: () => nextDeploymentId,
    requestUrl
  });
}

function sealedAttestation(overrides = {}, sourceBuild = build) {
  const body = {
    documentType: "clover-tree-deployment-attestation",
    schemaVersion: "0.3.0",
    buildInvocationId: sourceBuild.buildInvocationId,
    source: {
      commit: sourceBuild.commit,
      tree: sourceBuild.tree,
      parent: sourceBuild.parent,
      stackABase: sourceBuild.stackABase,
      runtimeDeploymentKey: sourceBuild.runtimeDeploymentKey,
      changedPathCount: sourceBuild.changedPathCount,
      pathListSha256: sourceBuild.pathListSha256,
      sourceManifestSha256: sourceBuild.sourceManifestSha256,
      packageLockSha256: sourceBuild.packageLockSha256,
      treeProgramIndexId: sourceBuild.treeProgramIndexId,
      treeProgramIndexHash: sourceBuild.treeProgramIndexHash,
      nodeVersion: sourceBuild.nodeVersion,
      nextVersion: sourceBuild.nextVersion,
      buildMode: sourceBuild.buildMode
    },
    output: {
      manifestRootSha256: hex64("7"),
      regularFileCount: 4,
      symlinkCount: 0,
      aggregateRegularFileBytes: 512,
      attestationExcludedPath: ATTESTATION_OUTPUT_PATH
    },
    normalization: [],
    publicSanitized: true,
    privateDataAccessed: false,
    secretsIncluded: false,
    consequentialAuthorityGranted: false,
    ...overrides
  };
  return { ...body, attestationHash: sha256(`${canonicalJson(body)}\n`) };
}

test("public GitHub observer uses only fixed unauthenticated endpoints and source time", async () => {
  const fixture = githubFetch();
  const observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
  assert.equal(observation.status, "current");
  assert.equal(observation.freshness, "current");
  assert.equal(observation.observedAt, defaultGithubSourceTime);
  assert.equal(observation.exactHeadChecks?.state, "success");
  assert.equal(observation.ruleset?.bypassActorsStatus, "external-verification-required");
  assert.equal(observation.ruleset?.bypassActorCount, null);
  assert.deepEqual(observation.exactHeadChecks?.requiredNames, REQUIRED_EXACT_HEAD_CHECKS);
  assert.equal(fixture.calls.length, 10);
  for (const { endpoint, options } of fixture.calls) {
    assert.match(endpoint, new RegExp(`^${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}(?:$|/(?:branches/main|pulls/(?:34|35)|rulesets/${EXPECTED_MAIN_RULESET_ID}|commits/${candidateCommit}/check-runs\\?filter=all&per_page=100&page=1|actions/workflows/(?:${EXPECTED_GITHUB_WORKFLOWS.map(({ id }) => id).join("|")})/runs\\?head_sha=${candidateCommit}&event=pull_request&per_page=${MAX_GITHUB_WORKFLOW_RUNS}&page=1)$)`, "u"));
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal(options.credentials, "omit");
    assert.equal(options.cache, "force-cache");
    assert.deepEqual(options.next, { revalidate: GITHUB_CACHE_REVALIDATE_SECONDS });
    assert.equal(new Headers(options.headers).has("authorization"), false);
  }
});

test("GitHub freshness uses the oldest relevant upstream Date and rejects expired or future source time", async () => {
  const now = Date.parse("2026-08-30T05:00:00.000Z");
  const date = (offsetMs) => new Date(now + offsetMs).toUTCString();
  const current = githubFetch({ sourceDate: date(-10_000) });
  let observation = await observeGitHubTruth({ candidateCommit, fetchImpl: current.implementation, retries: 0, now: () => now });
  assert.equal(observation.status, "current");
  assert.equal(observation.freshness, "current");
  assert.equal(observation.observedAt, new Date(now - 10_000).toISOString());

  const expiredAgeMs = GITHUB_REVALIDATE_SECONDS * 1_000 + 1_000;
  const mixedAge = githubFetch({ sourceDate: (endpoint) => endpoint.endsWith("/branches/main") ? date(-expiredAgeMs) : date(-1_000) });
  observation = await observeGitHubTruth({ candidateCommit, fetchImpl: mixedAge.implementation, retries: 0, now: () => now });
  assert.equal(observation.status, "partial");
  assert.equal(observation.freshness, "stale");
  assert.equal(observation.observedAt, new Date(now - expiredAgeMs).toISOString());
  assert.equal(observation.errorCode, "GITHUB_SOURCE_STALE");

  const exactlyExpired = githubFetch({ sourceDate: date(-GITHUB_REVALIDATE_SECONDS * 1_000) });
  observation = await observeGitHubTruth({ candidateCommit, fetchImpl: exactlyExpired.implementation, retries: 0, now: () => now });
  assert.equal(observation.status, "partial");
  assert.equal(observation.freshness, "stale");
  assert.equal(observation.errorCode, "GITHUB_SOURCE_STALE");

  const workflowSource = EXPECTED_GITHUB_WORKFLOWS[1];
  const staleWorkflowDate = githubFetch({
    sourceDate: (endpoint) => endpoint.includes(`/actions/workflows/${workflowSource.id}/runs?`) ? date(-expiredAgeMs) : date(-1_000)
  });
  observation = await observeGitHubTruth({ candidateCommit, fetchImpl: staleWorkflowDate.implementation, retries: 0, now: () => now });
  assert.equal(observation.status, "partial");
  assert.equal(observation.freshness, "stale");
  assert.equal(observation.observedAt, new Date(now - expiredAgeMs).toISOString());

  const missingWorkflowDate = githubFetch({
    sourceDate: (endpoint) => endpoint.includes(`/actions/workflows/${workflowSource.id}/runs?`) ? null : date(-1_000)
  });
  observation = await observeGitHubTruth({ candidateCommit, fetchImpl: missingWorkflowDate.implementation, retries: 0, now: () => now });
  assert.equal(observation.status, "partial");
  assert.match(observation.failures.join("\n"), /GITHUB_SOURCE_TIME_UNAVAILABLE/u);

  const future = githubFetch({ sourceDate: (endpoint) => endpoint.endsWith("/pulls/35") ? date(6_000) : date(-1_000) });
  observation = await observeGitHubTruth({ candidateCommit, fetchImpl: future.implementation, retries: 0, now: () => now });
  assert.equal(observation.status, "contradictory");
  assert.equal(observation.freshness, "unavailable");
  assert.equal(observation.errorCode, "GITHUB_SOURCE_CONTRADICTION:FUTURE");

  const futureWorkflow = githubFetch({
    sourceDate: (endpoint) => endpoint.includes(`/actions/workflows/${workflowSource.id}/runs?`) ? date(6_000) : date(-1_000)
  });
  observation = await observeGitHubTruth({ candidateCommit, fetchImpl: futureWorkflow.implementation, retries: 0, now: () => now });
  assert.equal(observation.status, "contradictory");
  assert.equal(observation.errorCode, "GITHUB_SOURCE_CONTRADICTION:FUTURE");

  const pageOne = Array.from({ length: 100 }, (_, index) => checkRun({ id: 1_000 + index }));
  const pageTwo = REQUIRED_EXACT_HEAD_CHECKS.map((name, index) => checkRun({ id: 2_000 + index, name }));
  const futurePage = githubPaginationFetch({
    pages: [pageOne, pageTwo],
    totalCount: pageOne.length + pageTwo.length,
    sourceDate: (endpoint) => new URL(endpoint).searchParams.get("page") === "2" ? date(6_000) : date(-1_000)
  });
  observation = await observeGitHubTruth({ candidateCommit, fetchImpl: futurePage.implementation, retries: 0, now: () => now });
  assert.equal(observation.status, "contradictory");
  assert.equal(observation.freshness, "unavailable");
  assert.equal(observation.errorCode, "GITHUB_SOURCE_CONTRADICTION:FUTURE");
});

test("strict public DTO parsing rejects endpoint, issuer and deployment substitutions", async () => {
  const fixture = githubFetch();
  const github = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
  assert.deepEqual(parseGitHubLiveObservation(structuredClone(github)), github);
  for (const mutate of [
    (candidate) => { candidate.endpoints[0] = "https://api.github.com/repos/chrisdortch/other"; },
    (candidate) => { [candidate.endpoints[0], candidate.endpoints[1]] = [candidate.endpoints[1], candidate.endpoints[0]]; },
    (candidate) => { candidate.exactHeadChecks.workflowRuns.reverse(); },
    (candidate) => { candidate.exactHeadChecks.workflowRuns[0].apiUrl = `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/actions/runs/1`; },
    (candidate) => { candidate.exactHeadChecks.workflowRuns[1].id = candidate.exactHeadChecks.workflowRuns[0].id; },
    (candidate) => { candidate.exactHeadChecks.checks[0].appId = 1; },
    (candidate) => { candidate.exactHeadChecks.checks[0].detailsUrl = "https://github.com/chrisdortch/first/actions/runs/1"; },
    (candidate) => { candidate.exactHeadChecks.requiredNames = candidate.exactHeadChecks.requiredNames.slice(0, -1); },
    (candidate) => { candidate.errorCode = "substituted-current-error"; },
    (candidate) => { candidate.extra = false; }
  ]) {
    const substituted = structuredClone(github);
    mutate(substituted);
    assert.throws(() => parseGitHubLiveObservation(substituted));
  }

  const currentWithoutSourceTime = structuredClone(github);
  currentWithoutSourceTime.observedAt = null;
  assert.throws(() => parseGitHubLiveObservation(currentWithoutSourceTime), /LIVE_READBACK_GITHUB_CURRENT_WITHOUT_SOURCE_TIME/u);

  const tooManyCheckPages = structuredClone(github);
  for (let page = 2; page <= MAX_GITHUB_CHECK_RUN_PAGES + 1; page += 1) {
    tooManyCheckPages.endpoints.push(githubPageEndpoint(page, tooManyCheckPages.exactHeadChecks.sha, true));
  }
  assert.throws(() => parseGitHubLiveObservation(tooManyCheckPages), /LIVE_READBACK_CHECK_PAGES_CEILING_EXCEEDED/u);

  const projectedCheckCandidate = (count) => {
    const candidate = structuredClone(github);
    const additionalCheckCount = count - candidate.exactHeadChecks.checks.length;
    assert.ok(additionalCheckCount >= 0);
    candidate.exactHeadChecks.checks.push(...Array.from({ length: additionalCheckCount }, (_, index) => ({
      ...candidate.exactHeadChecks.checks[0],
      id: 10_000 + index,
      name: `substituted-projected-check-${index}`,
      detailsUrl: `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${20_000 + index}/job/${30_000 + index}`
    })));
    assert.equal(candidate.exactHeadChecks.checks.length, count);
    return candidate;
  };
  const feasibleOnePage = projectedCheckCandidate(100);
  assert.equal(parseGitHubLiveObservation(feasibleOnePage).exactHeadChecks.checks.length, 100);
  assert.throws(() => parseGitHubLiveObservation(projectedCheckCandidate(101)), /LIVE_READBACK_CHECK_PAGE_CAPACITY_EXCEEDED/u);

  const tooManyProjectedChecks = projectedCheckCandidate(MAX_GITHUB_CHECK_RUNS + 1);
  assert.equal(tooManyProjectedChecks.exactHeadChecks.checks.length, MAX_GITHUB_CHECK_RUNS + 1);
  assert.throws(() => parseGitHubLiveObservation(tooManyProjectedChecks), /LIVE_READBACK_CHECK_RUNS_CEILING_EXCEEDED/u);

  const deployment = deploymentObservation();
  assert.deepEqual(parseDeploymentSelfObservation(structuredClone(deployment)), deployment);
  for (const mutate of [
    (candidate) => { candidate.projectId = "prj_substituted"; },
    (candidate) => { candidate.requestHostname = "substituted.vercel.app"; },
    (candidate) => { candidate.gitCommitSha = "not-a-sha"; },
    (candidate) => { candidate.sourceBindingMode = "build-provenance-and-build-payload-attestation"; },
    (candidate) => { candidate.observationMethod = "unavailable"; },
    (candidate) => { candidate.errorCode = "substituted-current-error"; },
    (candidate) => { candidate.region = "invalid region"; },
    (candidate) => { candidate.externalProviderIdentity.aliases = []; }
  ]) {
    const substituted = structuredClone(deployment);
    mutate(substituted);
    assert.throws(() => parseDeploymentSelfObservation(substituted));
  }
});

test("exact main tree, ruleset, Core, Master and trusted check issuer all gate acceptance", async () => {
  const cases = [
    ["main tree", (value, endpoint) => { if (endpoint.endsWith("/branches/main")) value.commit.commit.tree.sha = hex40("f"); }],
    ["ruleset review resolution", (value, endpoint) => { if (endpoint.includes("/rulesets/")) value.rules.find(({ type }) => type === "pull_request").parameters.required_review_thread_resolution = false; }],
    ["ruleset status integration", (value, endpoint) => { if (endpoint.includes("/rulesets/")) value.rules.find(({ type }) => type === "required_status_checks").parameters.required_status_checks[0].integration_id = 1; }],
    ["Core Node 22 failure", (value, endpoint) => { if (endpoint.includes("/check-runs")) value.check_runs.find(({ name }) => name === "Boundary and schema validation (22)").conclusion = "failure"; }],
    ["Core Node 24 failure", (value, endpoint) => { if (endpoint.includes("/check-runs")) value.check_runs.find(({ name }) => name === "Boundary and schema validation (24)").conclusion = "failure"; }],
    ["Master failure", (value, endpoint) => { if (endpoint.includes("/check-runs")) value.check_runs.find(({ name }) => name === "validate").conclusion = "failure"; }],
    ["issuer substitution", (value, endpoint) => { if (endpoint.includes("/check-runs")) value.check_runs.find(({ name }) => name === "Tree browser and accessibility").app.id = 1; }]
  ];
  const attestation = await compareDeploymentAttestation(build, sealedAttestation());
  for (const [label, mutate] of cases) {
    const fixture = githubFetch({ mutate: (value, endpoint) => { mutate(value, endpoint); return value; } });
    const github = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    const reconciled = reconcileTreeTruth({ baseline, build, github, deployment: deploymentObservation(), attestation });
    assert.equal(reconciled.currentActionCard.action, "HOLD", label);
  }
});

test("the generic validate check is bound to the exact Master workflow run", async (t) => {
  await t.test("a newer unrelated validate success cannot mask the exact Master failure", async () => {
    const fixture = githubFetch({
      mutate: (value, endpoint) => {
        if (endpoint.includes(`/actions/workflows/${EXPECTED_MASTER_WORKFLOW_ID}/runs?`)) {
          value.workflow_runs[0].conclusion = "failure";
        }
        if (endpoint.includes("/check-runs")) {
          const master = value.check_runs.find(({ name }) => name === "validate");
          master.conclusion = "failure";
          value.check_runs.push(checkRun({ id: 99_001, name: "validate", runId: masterWorkflowRunId + 500, startedAt: "2026-08-29T18:00:00.000Z" }));
          value.total_count = value.check_runs.length;
        }
        return value;
      }
    });
    const observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.status, "current");
    assert.equal(observation.exactHeadChecks?.state, "failure");
    assert.equal(observation.exactHeadChecks?.workflowRuns.find(({ workflowId }) => workflowId === EXPECTED_MASTER_WORKFLOW_ID)?.id, masterWorkflowRunId);
    assert.equal(observation.exactHeadChecks?.checks.find(({ name }) => name === "validate")?.detailsUrl.includes(`/runs/${masterWorkflowRunId}/`), true);
  });

  await t.test("the newest exact Master rerun and its exact check are selected", async () => {
    const nextRunId = masterWorkflowRunId + 1;
    const fixture = githubFetch({
      mutate: (value, endpoint) => {
        if (endpoint.includes(`/actions/workflows/${EXPECTED_MASTER_WORKFLOW_ID}/runs?`)) {
          value.workflow_runs[0].conclusion = "failure";
          value.workflow_runs.push(masterWorkflowRunFixture({ id: nextRunId, startedAt: "2026-08-29T17:00:00.000Z" }));
          value.total_count = value.workflow_runs.length;
        }
        if (endpoint.includes("/check-runs")) {
          value.check_runs.find(({ name }) => name === "validate").conclusion = "failure";
          value.check_runs.push(checkRun({ id: 99_002, name: "validate", runId: nextRunId, startedAt: "2026-08-29T17:00:00.000Z" }));
          value.total_count = value.check_runs.length;
        }
        return value;
      }
    });
    const observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.status, "current");
    assert.equal(observation.exactHeadChecks?.state, "success");
    assert.equal(observation.exactHeadChecks?.workflowRuns.find(({ workflowId }) => workflowId === EXPECTED_MASTER_WORKFLOW_ID)?.id, nextRunId);
    assert.equal(observation.exactHeadChecks?.checks.find(({ name }) => name === "validate")?.detailsUrl.includes(`/runs/${nextRunId}/`), true);
  });

  await t.test("missing, substituted, mismatched and over-ceiling Master evidence fails closed", async () => {
    const mutations = [
      ["missing", (value, endpoint) => { if (endpoint.includes(`/actions/workflows/${EXPECTED_MASTER_WORKFLOW_ID}/runs?`)) { value.total_count = 0; value.workflow_runs = []; } }],
      ["path", (value, endpoint) => { if (endpoint.includes(`/actions/workflows/${EXPECTED_MASTER_WORKFLOW_ID}/runs?`)) value.workflow_runs[0].path = ".github/workflows/validate-clover-data-standard.yml"; }],
      ["head", (value, endpoint) => { if (endpoint.includes(`/actions/workflows/${EXPECTED_MASTER_WORKFLOW_ID}/runs?`)) value.workflow_runs[0].head_sha = "f".repeat(40); }],
      ["event", (value, endpoint) => { if (endpoint.includes(`/actions/workflows/${EXPECTED_MASTER_WORKFLOW_ID}/runs?`)) value.workflow_runs[0].event = "workflow_dispatch"; }],
      ["run id", (value, endpoint) => { if (endpoint.includes("/check-runs")) value.check_runs.find(({ name }) => name === "validate").details_url = `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${masterWorkflowRunId + 9}/job/8`; }],
      ["ceiling", (value, endpoint) => { if (endpoint.includes(`/actions/workflows/${EXPECTED_MASTER_WORKFLOW_ID}/runs?`)) value.total_count = MAX_GITHUB_WORKFLOW_RUNS + 1; }]
    ];
    for (const [label, mutate] of mutations) {
      const fixture = githubFetch({ mutate: (value, endpoint) => { mutate(value, endpoint); return value; } });
      const observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
      assert.notEqual(observation.exactHeadChecks?.state, "success", label);
      if (label !== "run id") assert.notEqual(observation.status, "current", label);
    }
  });
});

test("all eight required checks are bound to the selected exact workflow runs", async (t) => {
  const requiredMain = EXPECTED_GITHUB_WORKFLOWS[0];
  const tree = EXPECTED_GITHUB_WORKFLOWS[1];
  const core = EXPECTED_GITHUB_WORKFLOWS[2];
  const selectedRunId = (workflow) => workflowRunIds.get(workflow.id);
  const workflowEndpoint = (endpoint, workflow) => endpoint.includes(`/actions/workflows/${workflow.id}/runs?`);
  const runCheckMutation = async (mutate) => {
    const fixture = githubFetch({ mutate: (value, endpoint) => { mutate(value, endpoint); return value; } });
    return observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
  };

  await t.test("the exact four-run/eight-check baseline succeeds", async () => {
    const observation = await runCheckMutation(() => {});
    assert.equal(observation.status, "current");
    assert.equal(observation.exactHeadChecks?.state, "success");
    assert.deepEqual(observation.exactHeadChecks?.workflowRuns.map(({ workflowId }) => workflowId), EXPECTED_GITHUB_WORKFLOWS.map(({ id }) => id));
    for (const workflow of EXPECTED_GITHUB_WORKFLOWS) {
      const run = observation.exactHeadChecks?.workflowRuns.find(({ workflowId }) => workflowId === workflow.id);
      assert.equal(run?.id, selectedRunId(workflow));
      for (const name of workflow.requiredChecks) {
        assert.equal(observation.exactHeadChecks?.checks.find((check) => check.name === name)?.detailsUrl.includes(`/runs/${run.id}/`), true);
      }
    }
  });

  for (const [label, workflow, name] of [
    ["Required Main Node 22", requiredMain, requiredMain.requiredChecks[0]],
    ["Tree browser/accessibility", tree, tree.requiredChecks[2]]
  ]) {
    await t.test(`a later foreign same-name success cannot mask failed ${label}`, async () => {
      const observation = await runCheckMutation((value, endpoint) => {
        if (endpoint.includes("/check-runs")) {
          const exact = value.check_runs.find((check) => check.name === name);
          exact.conclusion = "failure";
          value.check_runs.push(checkRun({ id: 80_000 + selectedRunId(workflow), name, runId: selectedRunId(workflow) + 50_000, startedAt: "2026-08-29T20:00:00.000Z" }));
          value.total_count = value.check_runs.length;
        }
      });
      assert.equal(observation.status, "current");
      assert.equal(observation.exactHeadChecks?.state, "failure");
      assert.equal(observation.exactHeadChecks?.workflowRuns.find(({ workflowId }) => workflowId === workflow.id)?.conclusion, "success");
      assert.equal(observation.exactHeadChecks?.checks.find((check) => check.name === name)?.conclusion, "failure");
    });
  }

  await t.test("an older expected-workflow record cannot replace the selected current run", async () => {
    const observation = await runCheckMutation((value, endpoint) => {
      if (!workflowEndpoint(endpoint, requiredMain)) return;
      value.workflow_runs.unshift(workflowRunFixture(requiredMain, {
        id: selectedRunId(requiredMain) - 100,
        conclusion: "failure",
        createdAt: "2026-08-29T15:00:00.000Z",
        startedAt: "2026-08-29T17:00:00.000Z"
      }));
      value.total_count = value.workflow_runs.length;
    });
    assert.equal(observation.exactHeadChecks?.state, "success");
    assert.equal(observation.exactHeadChecks?.workflowRuns[0].id, selectedRunId(requiredMain));
  });

  for (const event of ["push", "workflow_dispatch"]) {
    await t.test(`${event} cannot satisfy pull_request workflow evidence`, async () => {
      const observation = await runCheckMutation((value, endpoint) => {
        if (workflowEndpoint(endpoint, requiredMain)) value.workflow_runs[0].event = event;
      });
      assert.equal(observation.status, "contradictory");
      assert.equal(observation.exactHeadChecks, null);
    });
  }

  for (const [label, mutate] of [
    ["workflow ID", (run) => { run.workflow_id += 1; }],
    ["workflow name", (run) => { run.name = `${run.name} substituted`; }],
    ["workflow path", (run) => { run.path = ".github/workflows/substituted.yml"; }],
    ["workflow API URL", (run) => { run.url = `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/actions/runs/1`; }],
    ["workflow HTML URL", (run) => { run.html_url = `https://github.com/${GITHUB_REPOSITORY}/actions/runs/1`; }],
    ["workflow definition URL", (run) => { run.workflow_url = `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/actions/workflows/1`; }],
    ["head SHA", (run) => { run.head_sha = hex40("f"); run.pull_requests[0].head.sha = run.head_sha; }],
    ["head branch", (run) => { run.head_branch = "substituted"; }],
    ["PR number", (run) => { run.pull_requests[0].number = 34; }],
    ["PR head", (run) => { run.pull_requests[0].head.sha = hex40("f"); }],
    ["PR head ref", (run) => { run.pull_requests[0].head.ref = "substituted"; }],
    ["PR base", (run) => { run.pull_requests[0].base.sha = hex40("f"); }],
    ["PR base ref", (run) => { run.pull_requests[0].base.ref = "substituted"; }],
    ["repository", (run) => { run.repository.full_name = "substituted/first"; }],
    ["head repository", (run) => { run.head_repository.id += 1; }],
    ["PR head repository", (run) => { run.pull_requests[0].head.repo.id += 1; }],
    ["PR base repository", (run) => { run.pull_requests[0].base.repo.url = `${GITHUB_ORIGIN}/repos/substituted/first`; }]
  ]) {
    await t.test(`wrong ${label} fails closed`, async () => {
      const observation = await runCheckMutation((value, endpoint) => {
        if (workflowEndpoint(endpoint, core)) mutate(value.workflow_runs[0]);
      });
      assert.equal(observation.status, "contradictory");
      assert.equal(observation.exactHeadChecks, null);
    });
  }

  for (const [label, mutate, expectedStatus, expectedState] of [
    ["selected run ID mismatch", (check, workflow) => { check.details_url = `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${selectedRunId(workflow) + 1}/job/${check.id}`; }, "contradictory", null],
    ["GitHub Actions issuer", (check) => { check.app = { id: 1, slug: "substituted" }; }, "contradictory", null],
    ["repository-substituted details URL", (check, workflow) => { check.details_url = `https://github.com/substituted/first/actions/runs/${selectedRunId(workflow)}/job/${check.id}`; }, "contradictory", null],
    ["malformed details URL", (check) => { check.details_url = "not-a-url"; }, "contradictory", null]
  ]) {
    await t.test(`wrong ${label} cannot satisfy a required slot`, async () => {
      const name = requiredMain.requiredChecks[0];
      const observation = await runCheckMutation((value, endpoint) => {
        if (endpoint.includes("/check-runs")) mutate(value.check_runs.find((check) => check.name === name), requiredMain);
      });
      assert.equal(observation.status, expectedStatus);
      assert.equal(observation.exactHeadChecks?.state ?? null, expectedState);
    });
  }

  await t.test("a missing selected workflow run remains partial", async () => {
    const observation = await runCheckMutation((value, endpoint) => {
      if (workflowEndpoint(endpoint, tree)) {
        value.total_count = 0;
        value.workflow_runs = [];
      }
    });
    assert.equal(observation.status, "partial");
    assert.equal(observation.exactHeadCheckStatus, "partial");
    assert.equal(observation.exactHeadChecks, null);
    assert.equal(observation.endpoints.some((endpoint) => endpoint.includes("/check-runs")), true);
  });

  await t.test("a missing required check remains pending", async () => {
    const name = tree.requiredChecks[1];
    const observation = await runCheckMutation((value, endpoint) => {
      if (endpoint.includes("/check-runs")) {
        value.check_runs = value.check_runs.filter((check) => check.name !== name);
        value.total_count = value.check_runs.length;
      }
    });
    assert.equal(observation.status, "current");
    assert.equal(observation.exactHeadChecks?.state, "pending");
  });

  await t.test("contradictory duplicate workflow records fail closed", async () => {
    const observation = await runCheckMutation((value, endpoint) => {
      if (workflowEndpoint(endpoint, tree)) {
        const duplicate = structuredClone(value.workflow_runs[0]);
        duplicate.conclusion = "failure";
        value.workflow_runs.push(duplicate);
        value.total_count = value.workflow_runs.length;
      }
    });
    assert.equal(observation.status, "contradictory");
    assert.match(observation.failures.join("\n"), /duplicate-workflow-run/u);
  });

  await t.test("selected run IDs cannot be reused across workflow endpoints", async () => {
    const observation = await runCheckMutation((value, endpoint) => {
      if (workflowEndpoint(endpoint, tree)) {
        const run = value.workflow_runs[0];
        run.id = selectedRunId(requiredMain);
        run.url = `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/actions/runs/${run.id}`;
        run.html_url = `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${run.id}`;
      }
    });
    assert.equal(observation.status, "contradictory");
    assert.match(observation.failures.join("\n"), /duplicate-selected-workflow-run/u);
  });

  await t.test("the latest legitimate rerun and attempt is selected deterministically", async () => {
    const rerunId = selectedRunId(core) + 10_000;
    const observation = await runCheckMutation((value, endpoint) => {
      if (workflowEndpoint(endpoint, core)) {
        value.workflow_runs[0].conclusion = "failure";
        value.workflow_runs.push(workflowRunFixture(core, { id: rerunId, runAttempt: 2, startedAt: "2026-08-29T18:00:00.000Z" }));
        value.total_count = value.workflow_runs.length;
      }
      if (endpoint.includes("/check-runs")) {
        for (const name of core.requiredChecks) {
          value.check_runs.find((check) => check.name === name).conclusion = "failure";
          value.check_runs.push(checkRun({ id: rerunId + core.requiredChecks.indexOf(name), name, runId: rerunId, startedAt: "2026-08-29T18:01:00.000Z" }));
        }
        value.total_count = value.check_runs.length;
      }
    });
    assert.equal(observation.exactHeadChecks?.state, "success");
    assert.equal(observation.exactHeadChecks?.workflowRuns.find(({ workflowId }) => workflowId === core.id)?.id, rerunId);
    assert.equal(observation.exactHeadChecks?.workflowRuns.find(({ workflowId }) => workflowId === core.id)?.runAttempt, 2);
  });

  await t.test("recency competes only among legitimate checks in the selected run", async () => {
    const name = tree.requiredChecks[0];
    const observation = await runCheckMutation((value, endpoint) => {
      if (endpoint.includes("/check-runs")) {
        value.check_runs.push(checkRun({ id: 88_001, name, runId: selectedRunId(tree), conclusion: "failure", startedAt: "2026-08-29T19:00:00.000Z" }));
        value.check_runs.push(checkRun({ id: 88_002, name, runId: selectedRunId(tree) + 1, conclusion: "success", startedAt: "2026-08-29T20:00:00.000Z" }));
        value.total_count = value.check_runs.length;
      }
    });
    assert.equal(observation.exactHeadChecks?.state, "failure");
    assert.equal(observation.exactHeadChecks?.checks.find((check) => check.name === name)?.id, 88_001);
  });

  for (const [label, mutate] of [
    ["check starts before its workflow run", (check) => {
      check.started_at = "2026-08-29T15:00:00.000Z";
      check.completed_at = "2026-08-29T15:00:01.000Z";
    }],
    ["check completes after its workflow run update", (check) => { check.completed_at = "2026-08-30T12:00:00.000Z"; }]
  ]) {
    await t.test(`${label} is contradictory`, async () => {
      const name = requiredMain.requiredChecks[0];
      const observation = await runCheckMutation((value, endpoint) => {
        if (endpoint.includes("/check-runs")) mutate(value.check_runs.find((check) => check.name === name));
      });
      assert.equal(observation.status, "contradictory");
      assert.match(observation.failures.join("\n"), /workflow-check-chronology/u);
    });
  }

  await t.test("a check between workflow creation and actual run start is contradictory", async () => {
    const observation = await runCheckMutation((value, endpoint) => {
      if (!workflowEndpoint(endpoint, requiredMain)) return;
      value.workflow_runs[0].created_at = "2026-08-29T16:30:00.000Z";
      value.workflow_runs[0].run_started_at = "2026-08-29T16:32:00.000Z";
    });
    assert.equal(observation.status, "contradictory");
    assert.match(observation.failures.join("\n"), /workflow-check-chronology/u);
  });
});

test("GitHub check-run pagination is complete, bounded, source-locked and rerun-aware", async (t) => {
  const requiredRuns = (startId = 1) => REQUIRED_EXACT_HEAD_CHECKS.map((name, offset) => checkRun({ id: startId + offset, name }));
  const auxiliaryRuns = (startId, count) => Array.from({ length: count }, (_, offset) => checkRun({ id: startId + offset }));
  const requiredCount = REQUIRED_EXACT_HEAD_CHECKS.length;

  await t.test("fewer than 100 and exactly 100 complete on one page", async () => {
    const fewer = githubPaginationFetch({ pages: [requiredRuns()], totalCount: requiredCount });
    assert.equal((await observeGitHubTruth({ candidateCommit, fetchImpl: fewer.implementation, retries: 0 })).status, "current");
    const exactly = githubPaginationFetch({ pages: [[...requiredRuns(), ...auxiliaryRuns(1_000, 100 - requiredCount)]], totalCount: 100 });
    const observation = await observeGitHubTruth({ candidateCommit, fetchImpl: exactly.implementation, retries: 0 });
    assert.equal(observation.status, "current");
    assert.equal(observation.exactHeadChecks?.state, "success");
    assert.deepEqual(observation.endpoints.filter((endpoint) => endpoint.includes("/check-runs")), [githubPageEndpoint(1)]);
  });

  await t.test("101 runs include a required check found only on page two", async () => {
    const required = requiredRuns();
    const firstPageRequired = required.slice(0, -1);
    const fixture = githubPaginationFetch({
      pages: [[...firstPageRequired, ...auxiliaryRuns(1_000, 100 - firstPageRequired.length)], [required.at(-1)]],
      totalCount: 101
    });
    const observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.status, "current");
    assert.equal(observation.exactHeadChecks?.state, "success");
    assert.deepEqual(observation.endpoints.filter((endpoint) => endpoint.includes("/check-runs")), [githubPageEndpoint(1), githubPageEndpoint(2, candidateCommit, true)]);
  });

  await t.test("250 runs aggregate across three pages with required names distributed", async () => {
    const required = requiredRuns(900);
    const all = auxiliaryRuns(1, 250 - required.length);
    all.splice(20, 0, ...required.slice(0, 3));
    all.splice(140, 0, ...required.slice(3, 6));
    all.push(...required.slice(6));
    const fixture = githubPaginationFetch({ pages: [all.slice(0, 100), all.slice(100, 200), all.slice(200)], totalCount: 250 });
    const observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.status, "current");
    assert.equal(observation.exactHeadChecks?.state, "success");
    assert.deepEqual(observation.endpoints.slice(-3), [githubPageEndpoint(1), githubPageEndpoint(2, candidateCommit, true), githubPageEndpoint(3, candidateCommit, true)]);
  });

  await t.test("newest start time wins over stale completion order", async () => {
    const base = requiredRuns(100);
    const target = REQUIRED_EXACT_HEAD_CHECKS[0];
    const olderFailure = checkRun({
      id: 10,
      name: target,
      conclusion: "failure",
      startedAt: "2026-08-29T16:00:00.000Z",
      completedAt: "2026-08-29T18:00:00.000Z"
    });
    const newerSuccess = checkRun({
      id: 11,
      name: target,
      conclusion: "success",
      startedAt: "2026-08-29T17:00:00.000Z",
      completedAt: "2026-08-29T17:01:00.000Z"
    });
    let fixture = githubPaginationFetch({ pages: [[...base.slice(1), olderFailure, newerSuccess]], totalCount: base.length + 1 });
    let observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.exactHeadChecks?.state, "success");
    const newerFailure = { ...newerSuccess, id: 12, conclusion: "failure" };
    fixture = githubPaginationFetch({ pages: [[...base.slice(1), olderFailure, newerFailure]], totalCount: base.length + 1 });
    observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.exactHeadChecks?.state, "failure");
    const newestPending = checkRun({
      id: 13,
      name: target,
      status: "in_progress",
      conclusion: null,
      startedAt: "2026-08-29T17:30:00.000Z",
      completedAt: null
    });
    fixture = githubPaginationFetch({ pages: [[...base.slice(1), newerSuccess, newestPending]], totalCount: base.length + 1 });
    observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.exactHeadChecks?.state, "pending");

    const sameStartSuccess = checkRun({ id: 20, name: target, conclusion: "success", startedAt: "2026-08-29T18:00:00.000Z" });
    const sameStartFailure = checkRun({ id: 21, name: target, conclusion: "failure", startedAt: "2026-08-29T18:00:00.000Z" });
    fixture = githubPaginationFetch({ pages: [[...base.slice(1), sameStartSuccess, sameStartFailure]], totalCount: base.length + 1 });
    observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.exactHeadChecks?.state, "failure");
  });

  await t.test("missing start time and impossible completion chronology fail closed", async () => {
    for (const mutate of [
      (run) => { run.started_at = null; },
      (run) => { run.completed_at = "2026-08-29T15:00:00.000Z"; }
    ]) {
      const runs = requiredRuns();
      mutate(runs[0]);
      const fixture = githubPaginationFetch({ pages: [runs], totalCount: runs.length });
      const observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
      assert.equal(observation.status, "contradictory");
      assert.equal(observation.exactHeadChecks, null);
      assert.match(observation.failures.join("\n"), /GITHUB_MALFORMED_CHECK_RUN/u);
    }
  });

  await t.test("identical duplicate IDs deduplicate and contradictory duplicates fail closed", async () => {
    const required = requiredRuns(1);
    const firstPage = [...required, ...auxiliaryRuns(1_000, 100 - required.length)];
    const final = checkRun({ id: 2_000 });
    let fixture = githubPaginationFetch({ pages: [firstPage, [structuredClone(firstPage[0]), final]], totalCount: 101 });
    let observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.status, "current");
    const contradictory = { ...firstPage[0], conclusion: "failure" };
    fixture = githubPaginationFetch({ pages: [firstPage, [contradictory, final]], totalCount: 101 });
    observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.status, "contradictory");
    assert.match(observation.failures.join("\n"), /SOURCE_CONTRADICTION:duplicate-check-run/u);
  });

  await t.test("later-page head substitution is contradictory", async () => {
    const first = [...requiredRuns(), ...auxiliaryRuns(1_000, 100 - requiredCount)];
    const fixture = githubPaginationFetch({ pages: [first, [checkRun({ id: 2_000, headSha: hex40("f") })]], totalCount: 101 });
    const observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.status, "contradictory");
    assert.match(observation.failures.join("\n"), /check-run-sha/u);
  });

  await t.test("malformed and substituted next links never leave the exact endpoint", async () => {
    const first = [...requiredRuns(), ...auxiliaryRuns(1_000, 100 - requiredCount)];
    const links = [
      ["cross origin", `<https://attacker.example/repos/${GITHUB_REPOSITORY}/commits/${candidateCommit}/check-runs?filter=all&per_page=100&page=2>; rel="next"`, "contradictory"],
      ["repository path", `<${GITHUB_ORIGIN}/repos/attacker/first/commits/${candidateCommit}/check-runs?filter=all&per_page=100&page=2>; rel="next"`, "contradictory"],
      ["numeric repository ID", `<${GITHUB_ORIGIN}/repositories/${GITHUB_REPOSITORY_ID + 1}/commits/${candidateCommit}/check-runs?filter=all&per_page=100&page=2>; rel="next"`, "contradictory"],
      ["commit substitution", `<${githubPageEndpoint(2, hex40("f"))}>; rel="next"`, "contradictory"],
      ["query substitution", `<${githubPageEndpoint(2)}&ref=main>; rel="next"`, "contradictory"],
      ["skipped page", `<${githubPageEndpoint(3)}>; rel="next"`, "contradictory"],
      ["repeated page", `<${githubPageEndpoint(1)}>; rel="next"`, "contradictory"],
      ["last page before next", `<${githubPageEndpoint(2)}>; rel="next", <${githubPageEndpoint(1)}>; rel="last"`, "contradictory"],
      ["inflated last page", `<${githubPageEndpoint(2)}>; rel="next", <${githubPageEndpoint(3)}>; rel="last"`, "contradictory"],
      ["malformed", `${githubPageEndpoint(2)}; rel="next"`, "contradictory"],
      ["duplicate next", `<${githubPageEndpoint(2)}>; rel="next", <${githubPageEndpoint(2)}>; rel="next"`, "contradictory"]
    ];
    for (const [label, link, expectedStatus] of links) {
      const fixture = githubPaginationFetch({ pages: [first, [checkRun({ id: 2_000 })]], totalCount: 101, linkForPage: (page) => page === 1 ? link : null });
      const observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
      assert.equal(observation.status, expectedStatus, label);
      assert.equal(fixture.calls.some(({ endpoint }) => endpoint === githubPageEndpoint(2)), false, label);
    }
  });

  await t.test("missing pages, count drift, later failures and finite ceilings remain partial HOLD", async () => {
    const first = [...requiredRuns(), ...auxiliaryRuns(1_000, 100 - requiredCount)];
    let fixture = githubPaginationFetch({ pages: [first], totalCount: 101, linkForPage: () => null });
    let observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.status, "partial");
    assert.match(observation.failures.join("\n"), /CHECK_RUNS_PAGE_MISSING/u);

    fixture = githubPaginationFetch({ pages: [first, [checkRun({ id: 2_000 })]], totalCount: (page) => page === 1 ? 101 : 102 });
    observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.status, "partial");
    assert.match(observation.failures.join("\n"), /TOTAL_DISAGREEMENT/u);

    fixture = githubPaginationFetch({
      pages: [first, [checkRun({ id: 2_000 })]], totalCount: 101,
      responseForPage: async (page, _endpoint, options) => page === 2
        ? new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }))
        : null
    });
    observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, timeoutMs: 5, retries: 0 });
    assert.equal(observation.status, "partial");
    assert.match(observation.failures.join("\n"), /GITHUB_TIMEOUT/u);

    fixture = githubPaginationFetch({
      pages: [first, [checkRun({ id: 2_000 })]], totalCount: 101,
      responseForPage: async (page, endpoint) => {
        if (page !== 2) return null;
        const response = new Response("{}", { status: 403, headers: { "content-type": "application/json", "x-ratelimit-remaining": "0" } });
        Object.defineProperty(response, "url", { value: endpoint });
        return response;
      }
    });
    observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.status, "partial");
    assert.match(observation.failures.join("\n"), /GITHUB_RATE_LIMITED/u);

    let pageTwoAttempts = 0;
    fixture = githubPaginationFetch({
      pages: [first, [checkRun({ id: 2_000 })]], totalCount: 101,
      responseForPage: async (page, endpoint) => {
        if (page !== 2) return null;
        pageTwoAttempts += 1;
        if (pageTwoAttempts !== 1) return null;
        const response = new Response("temporary", { status: 503, headers: { "content-type": "application/json" } });
        Object.defineProperty(response, "url", { value: endpoint });
        return response;
      }
    });
    observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 1 });
    assert.equal(observation.status, "current");
    assert.equal(pageTwoAttempts, 2);

    fixture = githubPaginationFetch({
      pages: [first, [checkRun({ id: 2_000 })]], totalCount: 101,
      responseForPage: async (page, endpoint) => {
        if (page !== 2) return null;
        const response = new Response("{}", { status: 200, headers: { "content-type": "application/json", "content-length": "300000", date: defaultGithubSourceDate } });
        Object.defineProperty(response, "url", { value: endpoint });
        return response;
      }
    });
    observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.status, "partial");
    assert.match(observation.failures.join("\n"), /GITHUB_RESPONSE_TOO_LARGE/u);

    fixture = githubPaginationFetch({
      pages: [first, [checkRun({ id: 2_000 })]], totalCount: 101,
      responseForPage: async (page, endpoint) => {
        if (page !== 2) return null;
        const body = JSON.stringify({ total_count: 101, check_runs: [checkRun({ id: 2_000 })] });
        const response = new Response(body, { status: 200, headers: { "content-type": "application/json" } });
        Object.defineProperty(response, "url", { value: endpoint });
        return response;
      }
    });
    observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.status, "partial");
    assert.match(observation.failures.join("\n"), /GITHUB_SOURCE_TIME_UNAVAILABLE/u);

    fixture = githubPaginationFetch({ pages: [requiredRuns()], totalCount: MAX_GITHUB_CHECK_RUNS + 1 });
    observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.status, "partial");
    assert.equal(observation.errorCode, "GITHUB_CHECK_RUNS_CEILING_EXCEEDED");

    const overlappingPages = Array.from({ length: MAX_GITHUB_CHECK_RUN_PAGES + 1 }, (_, page) => [checkRun({ id: page + 1 })]);
    fixture = githubPaginationFetch({
      pages: overlappingPages,
      totalCount: MAX_GITHUB_CHECK_RUN_PAGES + 1,
      linkForPage: (page) => `<${githubPageEndpoint(page + 1, candidateCommit, true)}>; rel="next"`
    });
    observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.status, "partial");
    assert.equal(observation.errorCode, "GITHUB_CHECK_RUNS_CEILING_EXCEEDED");
    assert.equal(observation.endpoints.filter((endpoint) => endpoint.includes("/check-runs")).length, MAX_GITHUB_CHECK_RUN_PAGES);
  });

  await t.test("a complete paginated result produces an available Action Card in draft or ready state", async () => {
    const required = requiredRuns();
    for (const draft of [true, false]) {
      const firstPageRequired = required.slice(0, -1);
      const fixture = githubPaginationFetch({ pages: [[...firstPageRequired, ...auxiliaryRuns(1_000, 100 - firstPageRequired.length)], [required.at(-1)]], totalCount: 101 });
      const baseFetch = fixture.implementation;
      const fetchImpl = async (endpoint, options) => {
        if (!endpoint.endsWith("/pulls/35")) return baseFetch(endpoint, options);
        const body = JSON.stringify({ ...githubFixture(endpoint), draft });
        const response = new Response(body, { status: 200, headers: { "content-type": "application/json", date: defaultGithubSourceDate } });
        Object.defineProperty(response, "url", { value: endpoint });
        return response;
      };
      const github = await observeGitHubTruth({ candidateCommit, fetchImpl, retries: 0 });
      const attestation = await compareDeploymentAttestation(build, sealedAttestation());
      const reconciled = reconcileTreeTruth({ baseline, build, github, deployment: deploymentObservation(), attestation });
      assert.equal(github.status, "current");
      assert.equal(reconciled.currentActionCard.action, "ACCEPT SOURCE-GROUNDED TREE PREVIEW", `draft=${draft}`);
      assert.equal(reconciled.contradictions.value.includes("stack-b-pull-request"), false);
    }
  });
});

test("request time never upgrades missing GitHub source freshness", async () => {
  const fixture = githubFetch({ sourceDate: null });
  const observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
  assert.equal(observation.status, "partial");
  assert.equal(observation.freshness, "unavailable");
  assert.equal(observation.observedAt, null);
  const deployment = deploymentObservation();
  const reconciled = reconcileTreeTruth({ baseline, build, github: observation, deployment, attestation: NO_ATTESTATION_COMPARISON });
  assert.equal(reconciled.readiness.liveGithubOverlayStatus, "unavailable");
  assert.equal(reconciled.currentActionCard.action, "HOLD");
});

test("GitHub rate limits, substitution, malformed payload, oversize and timeout fail closed", async (t) => {
  await t.test("rate limit", async () => {
    const result = await observeGitHubTruth({ candidateCommit, fetchImpl: async (endpoint) => {
      const response = new Response("{}", { status: 403, headers: { "content-type": "application/json", "x-ratelimit-remaining": "0" } });
      Object.defineProperty(response, "url", { value: endpoint });
      return response;
    }, retries: 0 });
    assert.equal(result.failures.every((failure) => failure.endsWith("GITHUB_RATE_LIMITED")), true);
  });
  await t.test("source substitution", async () => {
    const replacement = async (endpoint) => {
      const body = JSON.stringify(githubFixture(endpoint));
      const response = new Response(body, { status: 200, headers: { date: defaultGithubSourceDate } });
      Object.defineProperty(response, "url", { value: `${GITHUB_ORIGIN}/repos/attacker/substituted` });
      return response;
    };
    const result = await observeGitHubTruth({ candidateCommit, fetchImpl: replacement, retries: 0 });
    assert.equal(result.status, "contradictory");
  });
  await t.test("malformed", async () => {
    const fixture = githubFetch({ mutate: (value, endpoint) => endpoint.endsWith("/pulls/35") ? { ...value, head: null } : value });
    const result = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.match(result.failures[0], /GITHUB_MALFORMED_PR35/u);
  });
  await t.test("malformed or incoherent merge evidence", async () => {
    const substitutions = [
      { merged: false, merged_at: "not-a-time" },
      { merged: false, merged_at: "2026-08-29T16:24:08Z" },
      { merged: true, merged_at: null }
    ];
    for (const substitution of substitutions) {
      const fixture = githubFetch({
        mutate: (value, endpoint) => endpoint.endsWith("/pulls/34") ? { ...value, ...substitution } : value
      });
      const result = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
      assert.equal(result.status, "contradictory");
      assert.equal(result.pull34, null);
      assert.equal(result.failures.some((failure) => /pull34:GITHUB_MALFORMED_PR34/u.test(failure)), true);
    }
  });
  await t.test("oversize", async () => {
    const result = await observeGitHubTruth({ candidateCommit, fetchImpl: async (endpoint) => {
      const response = new Response("{}", { status: 200, headers: { "content-type": "application/json", "content-length": String(300_000) } });
      Object.defineProperty(response, "url", { value: endpoint });
      return response;
    }, retries: 0 });
    assert.equal(result.failures.every((failure) => failure.endsWith("GITHUB_RESPONSE_TOO_LARGE")), true);
  });
  await t.test("every pre-read rejection cancels its source body without awaiting a nonsettling cancel", async () => {
    const cases = [
      ["url", { status: 200, url: `${GITHUB_ORIGIN}/repos/attacker/substituted`, headers: { "content-type": "application/json" } }],
      ["ordinary 4xx", { status: 404, headers: { "content-type": "application/json" } }],
      ["rate limit", { status: 403, headers: { "content-type": "application/json", "x-ratelimit-remaining": "0" } }],
      ["media type", { status: 200, headers: { "content-type": "text/plain" } }],
      ["declared length", { status: 200, headers: { "content-type": "application/json", "content-length": String(MAX_GITHUB_RESPONSE_BYTES + 1) } }]
    ];
    for (const [label, configuration] of cases) {
      let cancellations = 0;
      const implementation = async (endpoint) => {
        const body = new ReadableStream({
          start(controller) { controller.enqueue(Buffer.from("{}")); },
          cancel() {
            cancellations += 1;
            return new Promise(() => {});
          }
        });
        const response = new Response(body, { status: configuration.status, headers: configuration.headers });
        Object.defineProperty(response, "url", { value: configuration.url ?? endpoint });
        return response;
      };
      const result = await observeGitHubTruth({ candidateCommit, fetchImpl: implementation, retries: 0 });
      assert.notEqual(result.status, "current", label);
      assert.equal(cancellations, 10, label);
    }
  });
  await t.test("chunked oversize and invalid UTF-8 fail closed with a bounded body", async () => {
    let cancellations = 0;
    const oversized = async (endpoint) => {
      const response = new Response(new ReadableStream({
        start(controller) { controller.enqueue(Buffer.alloc(MAX_GITHUB_RESPONSE_BYTES + 1, 0x20)); },
        cancel() {
          cancellations += 1;
          return new Promise(() => {});
        }
      }), { status: 200, headers: { "content-type": "application/json", date: defaultGithubSourceDate } });
      Object.defineProperty(response, "url", { value: endpoint });
      return response;
    };
    let result = await observeGitHubTruth({ candidateCommit, fetchImpl: oversized, retries: 0 });
    assert.equal(result.failures.every((failure) => failure.endsWith("GITHUB_RESPONSE_TOO_LARGE")), true);
    assert.equal(cancellations, 10);

    const invalidUtf8 = async (endpoint) => {
      const response = new Response(Uint8Array.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0x80, 0x22, 0x7d]), {
        status: 200,
        headers: { "content-type": "application/json", date: defaultGithubSourceDate }
      });
      Object.defineProperty(response, "url", { value: endpoint });
      return response;
    };
    result = await observeGitHubTruth({ candidateCommit, fetchImpl: invalidUtf8, retries: 0 });
    assert.equal(result.status, "contradictory");
    assert.equal(result.failures.every((failure) => failure.endsWith("GITHUB_MALFORMED_UTF8")), true);

    const duplicateIdentity = async (endpoint) => {
      const response = new Response(`{"id":${GITHUB_REPOSITORY_ID},"id":${GITHUB_REPOSITORY_ID + 1}}`, {
        status: 200,
        headers: { "content-type": "application/json", date: defaultGithubSourceDate }
      });
      Object.defineProperty(response, "url", { value: endpoint });
      return response;
    };
    result = await observeGitHubTruth({ candidateCommit, fetchImpl: duplicateIdentity, retries: 0 });
    assert.equal(result.status, "contradictory");
    assert.equal(result.failures.every((failure) => failure.endsWith("GITHUB_MALFORMED_JSON")), true);
  });
  await t.test("timeout", async () => {
    const stalled = (_endpoint, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    const result = await observeGitHubTruth({ candidateCommit, fetchImpl: stalled, timeoutMs: 5, retries: 0 });
    assert.equal(result.failures.every((failure) => failure.endsWith("GITHUB_TIMEOUT")), true);
  });
});

test("caller cancellation, deadline races, retry backoff and retry budgets preserve the first boundary cause", async (t) => {
  await t.test("already-aborted caller starts no provider request", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const result = await observeGitHubTruth({
      candidateCommit,
      signal: controller.signal,
      retries: 1,
      fetchImpl: async () => { calls += 1; throw new Error("must-not-run"); }
    });
    assert.equal(calls, 0);
    assert.equal(result.errorCode, "GITHUB_CALLER_ABORTED");
  });

  await t.test("caller abort during fetch is immutable even if cleanup crosses the deadline", async () => {
    const caller = new AbortController();
    let logicalTime = 0;
    let calls = 0;
    const fetchImpl = async (_endpoint, { signal }) => new Promise((_resolve, reject) => {
      calls += 1;
      signal.addEventListener("abort", () => {
        logicalTime = 2_000;
        reject(new Error("aborted"));
      }, { once: true });
    });
    const pending = observeGitHubTruth({ candidateCommit, fetchImpl, signal: caller.signal, retries: 0, deadlineMs: 1_000, clock: () => logicalTime });
    await new Promise((resolve) => setImmediate(resolve));
    caller.abort();
    const result = await pending;
    assert.equal(calls, 5);
    assert.equal(result.errorCode, "GITHUB_CALLER_ABORTED");
  });

  await t.test("deadline-first remains deadline even when caller follows", async () => {
    const caller = new AbortController();
    let calls = 0;
    const fetchImpl = async (_endpoint, { signal }) => new Promise((_resolve, reject) => {
      calls += 1;
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    const pending = observeGitHubTruth({ candidateCommit, fetchImpl, signal: caller.signal, retries: 0, deadlineMs: 5 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    caller.abort();
    const result = await pending;
    assert.equal(calls, 5);
    assert.equal(result.errorCode, "GITHUB_DEADLINE_EXCEEDED");
  });

  await t.test("caller abort during retry backoff starts no retry", async () => {
    const caller = new AbortController();
    let calls = 0;
    const fetchImpl = async (endpoint) => {
      calls += 1;
      const response = new Response("temporary", { status: 503, headers: { "content-type": "application/json" } });
      Object.defineProperty(response, "url", { value: endpoint });
      return response;
    };
    const pending = observeGitHubTruth({ candidateCommit, fetchImpl, signal: caller.signal, retries: 1, timeoutMs: 100, deadlineMs: 1_000 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    caller.abort();
    const result = await pending;
    assert.equal(calls, 5);
    assert.equal(result.errorCode, "GITHUB_CALLER_ABORTED");
  });

  await t.test("a scheduler jump after backoff prevents a shortened retry", async () => {
    let logicalTime = 0;
    let calls = 0;
    const fetchImpl = async (endpoint) => {
      calls += 1;
      const response = new Response("temporary", { status: 503, headers: { "content-type": "application/json" } });
      Object.defineProperty(response, "url", { value: endpoint });
      return response;
    };
    const pending = observeGitHubTruth({ candidateCommit, fetchImpl, retries: 1, timeoutMs: 100, deadlineMs: 1_000, clock: () => logicalTime });
    setTimeout(() => { logicalTime = 950; }, 20);
    const result = await pending;
    assert.equal(calls, 10);
    assert.equal(result.errorCode, "GITHUB_DEADLINE_EXCEEDED");
  });
});

test("one failed GitHub endpoint preserves successful projections and marks the overlay partial", async () => {
  const fixture = githubFetch();
  const partialFetch = async (endpoint, options) => {
    if (!endpoint.endsWith("/pulls/34")) return fixture.implementation(endpoint, options);
    const response = new Response("unavailable", { status: 503, headers: { "content-type": "application/json" } });
    Object.defineProperty(response, "url", { value: endpoint });
    return response;
  };
  const observation = await observeGitHubTruth({ candidateCommit, fetchImpl: partialFetch, retries: 0 });
  assert.equal(observation.status, "partial");
  assert.equal(observation.freshness, "current");
  assert.equal(observation.evidenceCompleteness, "partial");
  assert.deepEqual(observation.missingEvidence, ["pull34"]);
  assert.equal(observation.pull34, null);
  assert.equal(observation.main?.sha, EXPECTED_MAIN_COMMIT);
  assert.equal(observation.pull35?.headSha, candidateCommit);
  assert.equal(observation.exactHeadChecks?.state, "success");
  assert.equal(observation.errorCode, "GITHUB_HTTP_503");
});

test("PR head and base drift remain visible and block the current Action Card", async () => {
  const fixture = githubFetch({
    mutate: (value, endpoint) => endpoint.endsWith("/pulls/35")
      ? { ...value, base: { ...value.base, sha: hex40("e") } }
      : value
  });
  const github = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
  assert.equal(github.status, "current");
  assert.equal(github.pull35?.baseSha, hex40("e"));
  const deployment = deploymentObservation();
  const attestation = await compareDeploymentAttestation(build, sealedAttestation());
  const reconciled = reconcileTreeTruth({ baseline, build, github, deployment, attestation });
  assert.equal(reconciled.pull35.value?.baseSha, hex40("e"));
  assert.equal(reconciled.contradictions.value.includes("stack-b-pull-request"), true);
  assert.equal(reconciled.currentActionCard.action, "HOLD");
  assert.equal(reconciled.currentActionCard.reason, "source-refresh-required");
});

test("merged Stack A identity and state drift remain visible and block acceptance", async (t) => {
  const cases = [
    ["head", (value) => ({ ...value, head: { ...value.head, sha: hex40("f") } })],
    ["base", (value) => ({ ...value, base: { ...value.base, sha: hex40("e") } })],
    ["state", (value) => ({ ...value, state: "open", merged: false, merged_at: null })],
    ["draft", (value) => ({ ...value, draft: true })]
  ];
  for (const [name, mutatePull] of cases) {
    await t.test(name, async () => {
      const fixture = githubFetch({
        mutate: (value, endpoint) => endpoint.endsWith("/pulls/34") ? mutatePull(value) : value
      });
      const github = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
      assert.equal(github.status, "current");
      const deployment = deploymentObservation();
      const attestation = await compareDeploymentAttestation(build, sealedAttestation());
      const reconciled = reconcileTreeTruth({ baseline, build, github, deployment, attestation });
      assert.equal(reconciled.contradictions.value.includes("stack-a-pull-request"), true);
      assert.equal(reconciled.currentActionCard.action, "HOLD");
    });
  }
});

test("mutually resealed Stack B provenance substitutions remain non-acceptable", async () => {
  const fixture = githubFetch();
  const github = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
  const deployment = deploymentObservation();
  const substitutions = [
    { stackABase: EXPECTED_STACK_A_HEAD },
    { changedPathCount: EXPECTED_STACK_B_CHANGED_PATH_COUNT + 1 },
    { pathListSha256: hex64("9") }
  ];
  for (const substitution of substitutions) {
    const substitutedBuild = buildWith(substitution);
    const attestation = await compareDeploymentAttestation(substitutedBuild, sealedAttestation({}, substitutedBuild));
    assert.equal(attestation.status, "verified");
    const reconciled = reconcileTreeTruth({ baseline, build: substitutedBuild, github, deployment, attestation });
    assert.equal(reconciled.contradictions.value.includes("stack-b-source-provenance"), true);
    assert.equal(reconciled.currentActionCard.action, "HOLD");
  }
});

test("deployment self uses an injected getEnv-compatible reader, reads only the allowlist and never supplies source time", () => {
  const environment = previewEnvironment({ CLOVER_PRIVATE_VALUE: "not-read" });
  const observation = deploymentObservation(environment);
  assert.equal(observation.status, "current");
  assert.equal(observation.observedAt, null);
  assert.equal(observation.freshness, "current");
  assert.equal(observation.evidenceClass, "deployment-self-observation");
  assert.equal(observation.sourceIdentity, "vercel-functions-get-env");
  assert.equal(observation.runtimeDeploymentKey, runtimeDeploymentKey);
  assert.equal(observation.deploymentId, null);
  assert.equal(observation.externalProviderIdentity.providerDeploymentId, null);
  assert.equal(observation.externalProviderIdentity.verifiedByWebRuntime, false);
  assert.equal(JSON.stringify(observation).includes("dpl_Abc123"), false);
  assert.equal(observation.gitCommitSha, candidateCommit);
  assert.equal(observation.environmentKeysRead.includes("CLOVER_PRIVATE_VALUE"), false);
  assert.equal(observation.environmentKeysRead.includes("VERCEL_AUTOMATION_BYPASS_SECRET"), false);
  assert.equal(JSON.stringify(observation).includes("VERCEL_AUTOMATION_BYPASS_SECRET"), false);
  const missing = deploymentObservation({});
  assert.equal(missing.status, "unavailable");
  assert.equal(missing.failures.includes("deployment-source-identity"), false);
});

test("prebuilt runtime identity accepts only the exact source-bound preview contract", async (t) => {
  await t.test("missing CLI Git SHA uses sealed build and output-attestation binding", () => {
    const observation = deploymentObservation(previewEnvironment({ VERCEL_GIT_COMMIT_SHA: undefined }));
    assert.equal(observation.status, "current");
    assert.equal(observation.gitCommitSha, null);
    assert.equal(observation.sourceBindingMode, "build-provenance-and-build-payload-attestation");
    assert.equal(observation.failures.includes("deployment-source-identity"), false);
  });
  await t.test("present exact Git SHA stays source-bound", () => {
    const observation = deploymentObservation();
    assert.equal(observation.status, "current");
    assert.equal(observation.sourceBindingMode, "vercel-git-commit-sha-and-build-provenance");
  });
  await t.test("present mismatched Git SHA fails closed", () => {
    const observation = deploymentObservation(previewEnvironment({ VERCEL_GIT_COMMIT_SHA: hex40("f") }));
    assert.equal(observation.status, "contradictory");
    assert.equal(observation.failures.includes("deployment-source-identity"), true);
  });
  await t.test("wrong project, non-preview environment and missing or provider-style runtime key fail closed", () => {
    const cases = [
      [previewEnvironment({ VERCEL_PROJECT_ID: "prj_substituted" }), "deployment-project-identity", runtimeDeploymentKey],
      [previewEnvironment({ VERCEL_ENV: "production" }), "deployment-not-preview", runtimeDeploymentKey],
      [previewEnvironment(), "deployment-runtime-key-unavailable", null],
      [previewEnvironment(), "deployment-runtime-key-identity", "dpl_externalProviderIdentity"]
    ];
    for (const [environment, failure, nextDeploymentId] of cases) {
      const observation = deploymentObservation(environment, runtimeRequestUrl, nextDeploymentId);
      assert.notEqual(observation.status, "current", failure);
      assert.equal(observation.failures.includes(failure), true, failure);
      assert.equal(observation.externalProviderIdentity.providerDeploymentId, null);
    }
  });
  await t.test("validated request host is a truthful fallback when VERCEL_URL is absent", () => {
    const observation = deploymentObservation(previewEnvironment({ VERCEL_URL: undefined }));
    assert.equal(observation.status, "current");
    assert.equal(observation.runtimeHostname, "clover-tree-command-center-abc.vercel.app");
    assert.equal(observation.requestHostname, observation.runtimeHostname);
    assert.equal(observation.observationMethod, "request-bound-runtime-host");
  });
  await t.test("host substitution, non-HTTPS, credentials and ports fail closed", () => {
    const cases = [
      [previewEnvironment(), "https://substituted.vercel.app/api/tree", "deployment-request-host-substitution"],
      [previewEnvironment({ VERCEL_URL: undefined }), "http://clover-tree-command-center-abc.vercel.app/api/tree", "deployment-request-host-invalid"],
      [previewEnvironment({ VERCEL_URL: undefined }), "https://owner:secret@clover-tree-command-center-abc.vercel.app/api/tree", "deployment-request-host-invalid"],
      [previewEnvironment({ VERCEL_URL: undefined }), "https://clover-tree-command-center-abc.vercel.app:444/api/tree", "deployment-request-host-invalid"]
    ];
    for (const [environment, requestUrl, failure] of cases) {
      const observation = deploymentObservation(environment, requestUrl);
      assert.equal(observation.status, "contradictory");
      assert.equal(observation.failures.includes(failure), true, requestUrl);
    }
  });
  await t.test("missing optional region remains current and is labeled unavailable", () => {
    const observation = deploymentObservation(previewEnvironment({ VERCEL_REGION: undefined }));
    assert.equal(observation.status, "current");
    assert.equal(observation.region, null);
    assert.equal(observation.regionStatus, "unavailable");
  });
});

test("current Action Card is HOLD until GitHub, deployment self and attestation all agree", async () => {
  const fixture = githubFetch();
  const github = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
  const deployment = deploymentObservation();
  const unavailable = computeTruthReadiness({ github, deployment, attestation: NO_ATTESTATION_COMPARISON }, build);
  assert.equal(unavailable.buildPayloadAttestationStatus, "unavailable");
  assert.equal(reconcileTreeTruth({ baseline, build, github, deployment, attestation: NO_ATTESTATION_COMPARISON }).currentActionCard.action, "HOLD");

  const comparison = await compareDeploymentAttestation(build, sealedAttestation());
  assert.equal(comparison.status, "verified");
  const ready = computeTruthReadiness({ github, deployment, attestation: comparison }, build);
  assert.deepEqual(ready, {
    applicationSourceValidated: true,
    treeProgramBaselineLoaded: true,
    treePreviewRuntimeObserved: true,
    runtimeDeploymentIdentityStatus: "verified",
    liveGithubOverlayStatus: "current",
    buildPayloadAttestationStatus: "verified",
    ownerConsoleGroundingRequired: true,
    privateOwnerAuthenticationConfigured: false,
    durablePrivateStorageConfigured: false,
    realParticipantRuntimeConfigured: false,
    realProviderExecutionConfigured: false,
    productionAuthorized: false,
    finalDeploymentInputVerificationStatus: "external-provider-receipt-required"
  });
  const action = reconcileTreeTruth({ baseline, build, github, deployment, attestation: comparison }).currentActionCard;
  assert.equal(action.action, "ACCEPT SOURCE-GROUNDED TREE PREVIEW");
  assert.deepEqual(action.authority, { mergeAuthorized: false, productionAuthorized: false, privateDataAuthorized: false, externalMessagingAuthorized: false, paymentAuthorized: false, purchaseAuthorized: false });
  const substituted = sealedAttestation({ buildInvocationId: `clover-build:${hex64("8")}` });
  const rejected = await compareDeploymentAttestation(build, substituted);
  assert.equal(rejected.status, "inconsistent");
  assert.equal(rejected.differences.includes("build-invocation"), true);
});

test("live reconciliation binds merged Stack A and integrated Stack B provenance", async () => {
  assert.equal(EXPECTED_STACK_A_HEAD, mergedStackAHead);
  assert.equal(EXPECTED_MAIN_COMMIT, mergedStackABase);
  assert.equal(STACK_A_BASE, mergedStackABase);

  const fixture = githubFetch();
  const github = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
  const deployment = deploymentObservation();
  const comparison = await compareDeploymentAttestation(build, sealedAttestation());
  const reconciled = reconcileTreeTruth({ baseline, build, github, deployment, attestation: comparison });
  assert.equal(reconciled.contradictions.value.includes("stack-a-pull-request"), false);
  assert.equal(reconciled.contradictions.value.includes("stack-b-pull-request"), false);

  const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
  const provenance = deriveSourceProvenance({ repositoryRoot });
  assert.equal(provenance.stackABase, mergedStackABase);
  assert.equal(provenance.changedPathCount, 72);
  assert.equal(provenance.pathListSha256, integratedPathListSha256);
});

test("deployment attestation rejects every exact source identity substitution", async () => {
  const original = sealedAttestation();
  const substitutions = [
    ["commit", hex40("f"), "source-commit"],
    ["tree", hex40("e"), "source-tree"],
    ["pathListSha256", hex64("a"), "path-list"],
    ["packageLockSha256", hex64("b"), "package-lock"],
    ["treeProgramIndexHash", hex64("c"), "tree-program-index-hash"]
  ];
  for (const [field, replacement, expectedDifference] of substitutions) {
    const source = { ...original.source, [field]: replacement };
    if (field === "commit") source.runtimeDeploymentKey = `clover-${replacement.slice(0, 24)}`;
    const candidate = sealedAttestation({ source });
    const comparison = await compareDeploymentAttestation(build, candidate);
    assert.equal(comparison.status, "inconsistent", field);
    assert.equal(comparison.differences.includes(expectedDifference), true, field);
  }
  const substitutedDeploymentKey = sealedAttestation({ source: { ...original.source, runtimeDeploymentKey: `clover-${hex40("e").slice(0, 24)}` } });
  const deploymentKeyComparison = await compareDeploymentAttestation(build, substitutedDeploymentKey);
  assert.equal(deploymentKeyComparison.status, "invalid");
  assert.deepEqual(deploymentKeyComparison.differences, ["attestation-structure-invalid"]);
});

function initializeSourceRepository(root) {
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "clover@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Clover Test"], { cwd: root });
  mkdirSync(path.join(root, "apps/clover-launch-studio"), { recursive: true });
  mkdirSync(path.join(root, "portfolio/core/tree-program"), { recursive: true });
  writeFileSync(path.join(root, "apps/clover-launch-studio/package.json"), JSON.stringify({ dependencies: { next: "16.3.3" } }));
  writeFileSync(path.join(root, "apps/clover-launch-studio/package-lock.json"), "{}\n");
  writeFileSync(path.join(root, "portfolio/core/tree-program/index.json"), JSON.stringify({ indexId: "tree-program:index:0001", indexHash: hex64("4") }));
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "Stack A"], { cwd: root });
  const stackA = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  writeFileSync(path.join(root, "candidate.txt"), "candidate\n");
  execFileSync("git", ["add", "candidate.txt"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "Stack B"], { cwd: root });
  return stackA;
}

test("source provenance derives from an exact clean Git source and rejects dirty worktrees", () => {
  const root = mkdtempSync(path.join(tmpdir(), "clover-source-provenance-"));
  try {
    const stackABase = initializeSourceRepository(root);
    const provenance = deriveSourceProvenance({ repositoryRoot: root, stackABase });
    assert.equal(provenance.cleanWorktree, true);
    assert.equal(provenance.changedPathCount, 1);
    assert.equal(provenance.pathListSha256, sha256("candidate.txt\n"));
    assert.equal(provenance.commit, execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim());
    assert.equal(provenance.runtimeDeploymentKey, `clover-${provenance.commit.slice(0, 24)}`);
    assert.match(provenance.runtimeDeploymentKey, /^clover-[0-9a-f]{24}$/u);
    writeFileSync(path.join(root, "candidate.txt"), "dirty\n");
    assert.throws(() => deriveSourceProvenance({ repositoryRoot: root, stackABase }), /CLOVER_DIRTY_SOURCE_REJECTED/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function initializeDeletionSourceRepository(root) {
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "clover@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Clover Test"], { cwd: root });
  mkdirSync(path.join(root, "apps/clover-launch-studio"), { recursive: true });
  mkdirSync(path.join(root, "portfolio/core/tree-program"), { recursive: true });
  writeFileSync(path.join(root, "apps/clover-launch-studio/package.json"), JSON.stringify({ dependencies: { next: "16.3.3" } }));
  writeFileSync(path.join(root, "apps/clover-launch-studio/package-lock.json"), "{}\n");
  writeFileSync(path.join(root, "portfolio/core/tree-program/index.json"), JSON.stringify({ indexId: "tree-program:index:0001", indexHash: hex64("4") }));
  writeFileSync(path.join(root, "deleted.txt"), "immutable deleted base bytes\n");
  writeFileSync(path.join(root, "modified.txt"), "base modified bytes\n");
  writeFileSync(path.join(root, "renamed-source.txt"), "renamed bytes\n");
  writeFileSync(path.join(root, "unchanged.txt"), "unchanged bytes\n");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "Stack A"], { cwd: root });
  const stackABase = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  unlinkSync(path.join(root, "deleted.txt"));
  writeFileSync(path.join(root, "modified.txt"), "candidate modified bytes\n");
  renameSync(path.join(root, "renamed-source.txt"), path.join(root, "renamed-target.txt"));
  writeFileSync(path.join(root, "added.txt"), "candidate added bytes\n");
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "Stack B with deletion"], { cwd: root });
  return stackABase;
}

test("source provenance binds deleted base objects and preserves current candidate entries", () => {
  const root = mkdtempSync(path.join(tmpdir(), "clover-source-deletion-"));
  try {
    const stackABase = initializeDeletionSourceRepository(root);
    const candidateCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const entries = deriveSourceManifestEntries({ repositoryRoot: root, stackABase, candidateCommit });
    const paths = entries.map(({ path: sourcePath }) => sourcePath);
    assert.deepEqual(paths, ["added.txt", "deleted.txt", "modified.txt", "renamed-source.txt", "renamed-target.txt"]);

    const deleted = entries.find(({ path: sourcePath }) => sourcePath === "deleted.txt");
    const deletedBytes = execFileSync("git", ["show", `${stackABase}:deleted.txt`], { cwd: root });
    assert.deepEqual(deleted, {
      path: "deleted.txt",
      status: "D",
      base: {
        path: "deleted.txt",
        mode: "100644",
        blob: execFileSync("git", ["rev-parse", `${stackABase}:deleted.txt`], { cwd: root, encoding: "utf8" }).trim(),
        bytes: deletedBytes.byteLength,
        sha256: sha256(deletedBytes)
      },
      current: null
    });
    for (const sourcePath of ["added.txt", "modified.txt", "renamed-target.txt"]) {
      const entry = entries.find(({ path: entryPath }) => entryPath === sourcePath);
      assert.deepEqual(Object.keys(entry).sort(), ["blob", "bytes", "mode", "path", "sha256"]);
      assert.equal(entry.path, sourcePath);
      assert.equal(entry.mode, "100644");
      assert.equal(entry.blob, execFileSync("git", ["rev-parse", `${candidateCommit}:${sourcePath}`], { cwd: root, encoding: "utf8" }).trim());
    }
    assert.equal(entries.find(({ path: sourcePath }) => sourcePath === "renamed-source.txt").status, "D");
    assert.equal(entries.some(({ path: sourcePath }) => sourcePath === "unchanged.txt"), false);

    const pathList = `${paths.join("\n")}\n`;
    const provenance = deriveSourceProvenance({ repositoryRoot: root, stackABase });
    assert.equal(provenance.changedPathCount, 5);
    assert.equal(provenance.pathListSha256, sha256(pathList));
    assert.equal(provenance.sourceManifestSha256, sha256(`${canonicalJson(entries)}\n`));
    assert.notEqual(
      provenance.sourceManifestSha256,
      sha256(`${canonicalJson(entries.filter(({ status }) => status !== "D"))}\n`)
    );

    assert.throws(() => parseSourceChanges(Buffer.from("X\0candidate.txt\0", "utf8")), /CLOVER_SOURCE_STATUS_REJECTED/u);
    assert.throws(() => parseSourceChanges(Buffer.from("A\0..\/escape.txt\0", "utf8")), /unsafe source path/u);
    assert.throws(() => parseSourceChanges(Buffer.from("A\0same.txt\0M\0same.txt\0", "utf8")), /CLOVER_SOURCE_PATH_LIST_INVALID/u);
    assert.throws(() => parseSourceChanges(Buffer.from("R100\0same.txt\0same.txt\0", "utf8")), /CLOVER_SOURCE_PATH_SUBSTITUTION_REJECTED/u);
    assert.throws(() => parseSourceChanges(Buffer.from("R10\0old.txt\0new.txt\0", "utf8")), /CLOVER_SOURCE_STATUS_REJECTED/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeRawBuildOutput(outputRoot, checkoutRoot, {
  launcherKind = "direct",
  installRoot = path.join(checkoutRoot, "cli-install")
} = {}) {
  rmSync(outputRoot, { recursive: true, force: true });
  mkdirSync(installRoot, { recursive: true });
  const cliRoot = path.join(installRoot, "node_modules", "vercel");
  mkdirSync(path.join(cliRoot, "dist"), { recursive: true });
  writeFileSync(path.join(cliRoot, "dist/vc.js"), "#!/usr/bin/env node\n", { mode: 0o755 });
  writeFileSync(path.join(cliRoot, "package.json"), JSON.stringify({ name: "vercel", version: VERCEL_CLI_VERSION, bin: { vc: "./dist/vc.js", vercel: "./dist/vc.js" } }));
  writeFileSync(path.join(installRoot, "package-lock.json"), JSON.stringify({ packages: { "node_modules/vercel": { version: VERCEL_CLI_VERSION, integrity: VERCEL_CLI_INTEGRITY } } }));
  const binRoot = path.join(installRoot, "node_modules", ".bin");
  mkdirSync(binRoot, { recursive: true });
  for (const alias of ["vc", "vercel"]) {
    const aliasPath = path.join(binRoot, alias);
    rmSync(aliasPath, { recursive: true, force: true });
    symlinkSync("../vercel/dist/vc.js", aliasPath);
  }
  const cliExecutable = launcherKind === "direct"
    ? path.join(cliRoot, "dist/vc.js")
    : path.join(binRoot, launcherKind === "npm-bin-vc" ? "vc" : "vercel");
  mkdirSync(path.join(outputRoot, "diagnostics"), { recursive: true });
  mkdirSync(path.join(outputRoot, "functions/index.func/apps/clover-launch-studio"), { recursive: true });
  mkdirSync(path.join(outputRoot, "static/assets"), { recursive: true });
  writeFileSync(path.join(outputRoot, "builds.json"), JSON.stringify({ target: "preview", argv: [process.execPath, cliExecutable, "build", "--yes"], cliVersion: VERCEL_CLI_VERSION, builds: [] }));
  writeFileSync(path.join(outputRoot, "diagnostics/cli_traces.json"), JSON.stringify({ cwd: checkoutRoot, cli: cliExecutable }));
  const configuration = { outputFileTracingRoot: checkoutRoot, repoRoot: checkoutRoot, turbopack: { root: checkoutRoot }, unrelated: "preserved" };
  writeFileSync(path.join(outputRoot, "functions/index.func/apps/clover-launch-studio/___next_launcher.cjs"), `const conf = ${JSON.stringify(configuration)};\nvar nextServer = true;\n`);
  writeFileSync(path.join(outputRoot, "static/assets/app.js"), "console.log('public-sanitized');\n");
  symlinkSync("assets/app.js", path.join(outputRoot, "static/current.js"));
  return { installRoot, cliRoot, binRoot, cliExecutable, canonicalCliExecutable: path.join(cliRoot, "dist/vc.js") };
}

function exactVercelCliFixture(launcherKind = "npm-bin-vc") {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "clover-vercel-cli-invocation-"));
  const root = execFileSync("pwd", ["-P"], { cwd: temporaryRoot, encoding: "utf8" }).trim();
  const output = path.join(root, "output");
  const identity = writeRawBuildOutput(output, root, { launcherKind });
  const buildsPath = path.join(output, "builds.json");
  const readBuilds = () => JSON.parse(readFileSync(buildsPath, "utf8"));
  const writeBuilds = (value) => writeFileSync(buildsPath, JSON.stringify(value));
  return {
    temporaryRoot,
    root,
    output,
    buildsPath,
    packagePath: path.join(identity.cliRoot, "package.json"),
    lockPath: path.join(identity.installRoot, "package-lock.json"),
    ...identity,
    readBuilds,
    writeBuilds
  };
}

function assertExactRejection(callback, expected) {
  assert.throws(callback, (error) => error instanceof Error && error.message === expected);
}

test("Vercel CLI invocation accepts only the exact direct and npm alias launchers", () => {
  const results = [];
  for (const launcherKind of ["direct", "npm-bin-vc", "npm-bin-vercel"]) {
    const fixture = exactVercelCliFixture(launcherKind);
    try {
      const result = requireExactVercelCliInvocation(fixture.readBuilds());
      assert.equal(result.launcherKind, launcherKind);
      assert.equal(result.rawCliExecutable, fixture.cliExecutable);
      assert.equal(result.canonicalCliExecutable, fixture.canonicalCliExecutable);
      assert.equal(result.installRoot, fixture.installRoot);
      assert.equal(result.packageRoot, fixture.cliRoot);
      assert.equal(result.packageVersion, VERCEL_CLI_VERSION);
      assert.equal(result.packageIntegrityVerified, true);
      results.push(result);
    } finally {
      rmSync(fixture.temporaryRoot, { recursive: true, force: true });
    }
  }
  const commonAliasFixture = exactVercelCliFixture("npm-bin-vc");
  try {
    const vc = requireExactVercelCliInvocation(commonAliasFixture.readBuilds());
    const vercelBuilds = commonAliasFixture.readBuilds();
    vercelBuilds.argv[1] = path.join(commonAliasFixture.binRoot, "vercel");
    const vercel = requireExactVercelCliInvocation(vercelBuilds);
    assert.equal(vc.canonicalCliExecutable, vercel.canonicalCliExecutable);
  } finally {
    rmSync(commonAliasFixture.temporaryRoot, { recursive: true, force: true });
  }
});

test("Vercel CLI invocation verifier rejects every launcher, package, lock and invocation substitution", async (t) => {
  const run = async (name, launcherKind, mutate, expected) => {
    await t.test(name, () => {
      const fixture = exactVercelCliFixture(launcherKind);
      try {
        mutate(fixture);
        assertExactRejection(() => requireExactVercelCliInvocation(fixture.readBuilds()), expected);
      } finally {
        rmSync(fixture.temporaryRoot, { recursive: true, force: true });
      }
    });
  };
  const setLauncher = (fixture, cliExecutable) => {
    const builds = fixture.readBuilds();
    builds.argv[1] = cliExecutable;
    fixture.writeBuilds(builds);
  };
  const mutatePackage = (fixture, mutation) => {
    const document = JSON.parse(readFileSync(fixture.packagePath, "utf8"));
    mutation(document);
    writeFileSync(fixture.packagePath, JSON.stringify(document));
  };
  const mutateLock = (fixture, mutation) => {
    const document = JSON.parse(readFileSync(fixture.lockPath, "utf8"));
    mutation(document);
    writeFileSync(fixture.lockPath, JSON.stringify(document));
  };

  await run("alias basename other than vc or vercel", "npm-bin-vc", (fixture) => {
    const other = path.join(fixture.binRoot, "other");
    symlinkSync("../vercel/dist/vc.js", other);
    setLauncher(fixture, other);
  }, "CLOVER_VERCEL_BUILD_LAUNCHER_NAME_REJECTED");
  await run("alias outside exact npm bin directory", "npm-bin-vc", (fixture) => {
    const other = path.join(fixture.installRoot, "node_modules", "vc");
    symlinkSync("vercel/dist/vc.js", other);
    setLauncher(fixture, other);
  }, "CLOVER_VERCEL_BUILD_LAUNCHER_LOCATION_REJECTED");
  await run("regular file at npm vc alias", "npm-bin-vc", (fixture) => {
    unlinkSync(fixture.cliExecutable);
    writeFileSync(fixture.cliExecutable, readFileSync(fixture.canonicalCliExecutable), { mode: 0o755 });
  }, "CLOVER_VERCEL_BUILD_ALIAS_TYPE_REJECTED");
  await run("directory at npm vc alias", "npm-bin-vc", (fixture) => {
    unlinkSync(fixture.cliExecutable);
    mkdirSync(fixture.cliExecutable);
  }, "CLOVER_VERCEL_BUILD_ALIAS_TYPE_REJECTED");
  await run("broken exact npm alias", "npm-bin-vc", (fixture) => {
    unlinkSync(fixture.canonicalCliExecutable);
  }, "CLOVER_VERCEL_BUILD_ALIAS_BROKEN_REJECTED");
  await run("two-hop npm alias chain", "npm-bin-vc", (fixture) => {
    const realExecutable = path.join(fixture.cliRoot, "dist", "vc-real.js");
    renameSync(fixture.canonicalCliExecutable, realExecutable);
    symlinkSync("vc-real.js", fixture.canonicalCliExecutable);
  }, "CLOVER_VERCEL_BUILD_ALIAS_CHAIN_REJECTED");
  await run("npm alias relative escape", "npm-bin-vc", (fixture) => {
    unlinkSync(fixture.cliExecutable);
    symlinkSync(path.join("..", "..", "..", "..", "outside-vc.js"), fixture.cliExecutable);
  }, "CLOVER_VERCEL_BUILD_ALIAS_ESCAPE_REJECTED");
  await run("npm alias targets another package", "npm-bin-vc", (fixture) => {
    const other = path.join(fixture.installRoot, "node_modules", "other", "dist");
    mkdirSync(other, { recursive: true });
    writeFileSync(path.join(other, "vc.js"), readFileSync(fixture.canonicalCliExecutable));
    unlinkSync(fixture.cliExecutable);
    symlinkSync("../other/dist/vc.js", fixture.cliExecutable);
  }, "CLOVER_VERCEL_BUILD_ALIAS_TARGET_REJECTED");
  await run("npm alias targets another Vercel package file", "npm-bin-vc", (fixture) => {
    writeFileSync(path.join(fixture.cliRoot, "dist", "other.js"), readFileSync(fixture.canonicalCliExecutable));
    unlinkSync(fixture.cliExecutable);
    symlinkSync("../vercel/dist/other.js", fixture.cliExecutable);
  }, "CLOVER_VERCEL_BUILD_ALIAS_TARGET_REJECTED");
  await run("byte-identical copied executable has the wrong path identity", "direct", (fixture) => {
    const copied = path.join(fixture.cliRoot, "dist", "vc-copy.js");
    writeFileSync(copied, readFileSync(fixture.canonicalCliExecutable), { mode: 0o755 });
    setLauncher(fixture, copied);
  }, "CLOVER_VERCEL_BUILD_LAUNCHER_LOCATION_REJECTED");
  await run("direct canonical target is a symlink", "direct", (fixture) => {
    const realExecutable = path.join(fixture.cliRoot, "dist", "vc-real.js");
    renameSync(fixture.canonicalCliExecutable, realExecutable);
    symlinkSync("vc-real.js", fixture.canonicalCliExecutable);
  }, "CLOVER_VERCEL_BUILD_DIRECT_EXECUTABLE_SYMLINK_REJECTED");
  await run("symlinked package root", "npm-bin-vc", (fixture) => {
    const externalPackage = path.join(fixture.root, "vercel-package-real");
    renameSync(fixture.cliRoot, externalPackage);
    symlinkSync(externalPackage, fixture.cliRoot);
  }, "CLOVER_VERCEL_BUILD_PACKAGE_ROOT_REJECTED");
  await run("symlinked npm bin directory", "npm-bin-vc", (fixture) => {
    const externalBin = path.join(fixture.installRoot, "npm-bin-real");
    renameSync(fixture.binRoot, externalBin);
    symlinkSync(externalBin, fixture.binRoot);
  }, "CLOVER_VERCEL_BUILD_ALIAS_DIRECTORY_REJECTED");
  await run("symlinked install root", "npm-bin-vc", (fixture) => {
    const aliasRoot = path.join(fixture.root, "install-alias");
    symlinkSync(fixture.root, aliasRoot);
    setLauncher(fixture, path.join(aliasRoot, "node_modules", ".bin", "vc"));
  }, "CLOVER_VERCEL_BUILD_INSTALL_ROOT_REJECTED");
  await run("missing package document", "npm-bin-vc", (fixture) => {
    unlinkSync(fixture.packagePath);
  }, "CLOVER_VERCEL_BUILD_PACKAGE_FILE_REJECTED");
  for (const [name, bytes] of [
    ["malformed package document", "{"],
    ["duplicate-key package document", '{"name":"vercel","name":"vercel"}']
  ]) {
    await run(name, "npm-bin-vc", (fixture) => {
      writeFileSync(fixture.packagePath, bytes);
    }, "CLOVER_VERCEL_BUILD_TOOL_PACKAGE_JSON_REJECTED");
  }
  await run("package name substitution", "npm-bin-vc", (fixture) => {
    mutatePackage(fixture, (document) => { document.name = "other"; });
  }, "CLOVER_VERCEL_BUILD_PACKAGE_NAME_REJECTED");
  await run("package version substitution", "npm-bin-vc", (fixture) => {
    mutatePackage(fixture, (document) => { document.version = "0.0.0"; });
  }, "CLOVER_VERCEL_BUILD_PACKAGE_VERSION_REJECTED");
  await run("package vercel bin substitution", "npm-bin-vc", (fixture) => {
    mutatePackage(fixture, (document) => { document.bin.vercel = "./dist/other.js"; });
  }, "CLOVER_VERCEL_BUILD_PACKAGE_BIN_REJECTED");
  await run("invoked vc alias missing exact package metadata", "npm-bin-vc", (fixture) => {
    mutatePackage(fixture, (document) => { document.bin.vc = "./dist/other.js"; });
  }, "CLOVER_VERCEL_BUILD_ALIAS_METADATA_REJECTED");
  await run("missing package lock", "npm-bin-vc", (fixture) => {
    unlinkSync(fixture.lockPath);
  }, "CLOVER_VERCEL_BUILD_LOCK_FILE_REJECTED");
  for (const [name, bytes] of [
    ["malformed package lock", "{"],
    ["duplicate-key package lock", '{"packages":{},"packages":{}}']
  ]) {
    await run(name, "npm-bin-vc", (fixture) => {
      writeFileSync(fixture.lockPath, bytes);
    }, "CLOVER_VERCEL_BUILD_TOOL_LOCK_JSON_REJECTED");
  }
  await run("missing exact Vercel lock entry", "npm-bin-vc", (fixture) => {
    mutateLock(fixture, (document) => { delete document.packages["node_modules/vercel"]; });
  }, "CLOVER_VERCEL_BUILD_LOCK_ENTRY_REJECTED");
  await run("lock version substitution", "npm-bin-vc", (fixture) => {
    mutateLock(fixture, (document) => { document.packages["node_modules/vercel"].version = "0.0.0"; });
  }, "CLOVER_VERCEL_BUILD_LOCK_VERSION_REJECTED");
  await run("lock integrity substitution", "npm-bin-vc", (fixture) => {
    mutateLock(fixture, (document) => { document.packages["node_modules/vercel"].integrity = "sha512-substituted"; });
  }, "CLOVER_VERCEL_BUILD_LOCK_INTEGRITY_REJECTED");
  await run("builds CLI version substitution", "npm-bin-vc", (fixture) => {
    const builds = fixture.readBuilds();
    builds.cliVersion = "0.0.0";
    fixture.writeBuilds(builds);
  }, "CLOVER_VERCEL_BUILD_CLI_VERSION_REJECTED");
  await run("build argument substitution", "npm-bin-vc", (fixture) => {
    const builds = fixture.readBuilds();
    builds.argv[3] = "--prod";
    fixture.writeBuilds(builds);
  }, "CLOVER_VERCEL_BUILD_ARGUMENTS_REJECTED");
  await run("non-preview build target", "npm-bin-vc", (fixture) => {
    const builds = fixture.readBuilds();
    builds.target = "production";
    fixture.writeBuilds(builds);
  }, "CLOVER_VERCEL_BUILD_TARGET_REJECTED");
  await t.test("raw launcher control characters and normalization ambiguity", () => {
    const fixture = exactVercelCliFixture("npm-bin-vc");
    try {
      const ambiguous = [
        `${fixture.cliExecutable}\0`, `${fixture.cliExecutable}\r`, `${fixture.cliExecutable}\n`,
        `${fixture.binRoot}${path.sep}.${path.sep}vc`, `${fixture.cliExecutable}\u0301`
      ];
      for (const candidate of ambiguous) {
        const builds = fixture.readBuilds();
        builds.argv[1] = candidate;
        assertExactRejection(() => requireExactVercelCliInvocation(builds), "CLOVER_VERCEL_BUILD_RAW_CLI_PATH_REJECTED");
      }
    } finally {
      rmSync(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });
  await t.test("relative PATH launcher and outside-install wrapper", () => {
    const fixture = exactVercelCliFixture("npm-bin-vc");
    try {
      const relative = fixture.readBuilds();
      relative.argv[1] = "vercel";
      assertExactRejection(() => requireExactVercelCliInvocation(relative), "CLOVER_VERCEL_BUILD_RAW_CLI_PATH_REJECTED");
      const wrapperPath = path.join(fixture.root, "vc-wrapper");
      writeFileSync(wrapperPath, readFileSync(fixture.canonicalCliExecutable), { mode: 0o755 });
      const outside = fixture.readBuilds();
      outside.argv[1] = wrapperPath;
      assertExactRejection(() => requireExactVercelCliInvocation(outside), "CLOVER_VERCEL_BUILD_LAUNCHER_LOCATION_REJECTED");
    } finally {
      rmSync(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });
  await t.test("post-normalization host-local path residue", () => {
    const fixture = exactVercelCliFixture("npm-bin-vc");
    const evidence = path.join(fixture.root, "evidence");
    try {
      const diagnosticsPath = path.join(fixture.output, "diagnostics", "cli_traces.json");
      const diagnostics = JSON.parse(readFileSync(diagnosticsPath, "utf8"));
      diagnostics.residual = path.dirname(fixture.root);
      writeFileSync(diagnosticsPath, JSON.stringify(diagnostics));
      assert.throws(
        () => createDeploymentAttestation({ outputRoot: fixture.output, repositoryRoot: fixture.root, evidenceDirectory: evidence, sourceProvenance: build }),
        /CLOVER_PUBLIC_OUTPUT_REJECTED/u
      );
    } finally {
      rmSync(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });
});

function rawTreeIdentity(root) {
  const entries = [];
  const visit = (directory, prefix = "") => {
    for (const name of readdirSync(directory).sort((left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")))) {
      const absolutePath = path.join(directory, name);
      const relativePath = prefix ? `${prefix}/${name}` : name;
      const stat = lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        entries.push({ path: relativePath, type: "symlink", mode: stat.mode & 0o7777, target: readlinkSync(absolutePath) });
      } else if (stat.isDirectory()) {
        entries.push({ path: relativePath, type: "directory", mode: stat.mode & 0o7777 });
        visit(absolutePath, relativePath);
      } else {
        const bytes = readFileSync(absolutePath);
        entries.push({ path: relativePath, type: "file", mode: stat.mode & 0o7777, bytes: bytes.length, sha256: sha256(bytes) });
      }
    }
  };
  visit(root);
  return entries;
}

function providerUrl(version, route, query = []) {
  const encodedRoute = route.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  const suffix = query.length === 0 ? "" : `?${query.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&")}`;
  return `https://api.vercel.com/${version}/${encodedRoute}${suffix}`;
}

const providerReceiptNow = new Date("2026-08-29T20:00:03.000Z");

function providerRequest(method, url, response, observedAt = "2026-08-29T20:00:00.000Z") {
  const bytes = Buffer.from(`${canonicalJson(response)}\n`, "utf8");
  return {
    method,
    url,
    status: 200,
    redirected: false,
    observedAt,
    responseMediaTypeEssence: "application/json",
    responseCharset: null,
    responseOtherMediaTypeParameters: [],
    responseHashDomain: "canonical-sanitized-json-v1",
    responseProjectionBytes: bytes.length,
    responseProjectionSha256: sha256(bytes)
  };
}

function providerDeploymentFixture(outputRoot, sealed) {
  const deploymentId = "dpl_ExactPreview123";
  const deploymentResponse = {
    id: deploymentId,
    name: VERCEL_PROJECT_NAME,
    url: "clover-tree-command-center-exact-preview.vercel.app",
    type: "LAMBDAS",
    state: "READY",
    status: "READY",
    readyState: "READY",
    target: null,
    alias: [],
    automaticAliases: [],
    project: { id: VERCEL_PROJECT_ID, name: VERCEL_PROJECT_NAME, framework: "nextjs" },
    team: { id: VERCEL_TEAM_ID, name: VERCEL_TEAM_NAME, slug: VERCEL_TEAM_SLUG },
    meta: {
      gitCommitRef: STACK_B_BRANCH,
      gitCommitSha: sealed.sourceProvenance.commit,
      gitRemoteUrl: "https://github.com/chrisdortch/first.git",
      gitRootDirectory: "apps/clover-launch-studio"
    },
    source: "cli",
    prebuilt: true,
    nodeVersion: "24.x",
    userConfiguredDeploymentId: sealed.sourceProvenance.runtimeDeploymentKey
  };
  const outputDirectory = { name: "output", type: "directory", mode: 0o40555, children: [] };
  const directoryByPath = new Map([["", outputDirectory]]);
  const ensureDirectory = (directoryPath) => {
    if (directoryByPath.has(directoryPath)) return directoryByPath.get(directoryPath);
    const segments = directoryPath.split("/");
    const name = segments.pop();
    const parentPath = segments.join("/");
    const parent = ensureDirectory(parentPath);
    const directory = { name, type: "directory", mode: 0o40555, children: [] };
    parent.children.push(directory);
    directoryByPath.set(directoryPath, directory);
    return directory;
  };
  const contents = [];
  const entries = [
    ...sealed.deploymentInputManifest.files.map((entry) => ({ type: "file", ...entry })),
    ...sealed.deploymentInputManifest.symlinks.map((entry) => ({ type: "symlink", ...entry }))
  ];
  for (const entry of entries) {
    const segments = entry.path.split("/");
    const name = segments.pop();
    const parent = ensureDirectory(segments.join("/"));
    const bytes = entry.type === "file"
      ? readFileSync(path.join(outputRoot, ...entry.path.split("/")))
      : Buffer.from(readlinkSync(path.join(outputRoot, ...entry.path.split("/"))), "utf8");
    const uid = sha1(bytes);
    parent.children.push({ name, type: entry.type, mode: (entry.type === "file" ? 0o100000 : 0o120000) | Number.parseInt(entry.mode, 8), uid });
    const response = { data: bytes.toString("base64") };
    const providerPath = `src/.vercel/output/${entry.path}`;
    contents.push({
      path: providerPath,
      uid,
      request: providerRequest("GET", providerUrl("v8", `deployments/${deploymentId}/files/${uid}`, [["path", providerPath], ["teamId", VERCEL_TEAM_ID]]), response),
      response
    });
  }
  const sortDirectory = (directory) => {
    directory.children.sort((left, right) => Buffer.compare(Buffer.from(left.name, "utf8"), Buffer.from(right.name, "utf8")));
    for (const child of directory.children.filter(({ type }) => type === "directory")) sortDirectory(child);
  };
  sortDirectory(outputDirectory);
  const ignoredBytes = Buffer.from("provider-generated-runtime\n", "utf8");
  const fileTreeResponse = [{
    name: "src",
    type: "directory",
    mode: 0o40555,
    children: [
      { name: ".vercel", type: "directory", mode: 0o40555, children: [outputDirectory] },
      { name: "out", type: "directory", mode: 0o40555, children: [{ name: "provider-runtime.txt", type: "file", mode: 0o100644, uid: sha1(ignoredBytes) }] }
    ]
  }];
  const baselineResponse = {
    projectId: VERCEL_PROJECT_ID,
    teamId: VERCEL_TEAM_ID,
    providerProjectUpdatedAt: 1_787_944_731_108,
    bypassCount: 0,
    ssoProtection: { deploymentType: "all_except_custom_domains" },
    passwordProtectionEnabled: false,
    gitForkProtection: true,
    skewProtectionMaxAge: 43_200
  };
  const createdEntry = { createdAt: 1_787_944_800_000, createdByPresent: true, scope: "automation-bypass" };
  const createResponseProjection = { createdEntry, responseEntryCount: 1 };
  const revokeResponse = { protectionBypass: {} };
  const projectReadUrl = providerUrl("v9", `projects/${VERCEL_PROJECT_ID}`, [["teamId", VERCEL_TEAM_ID]]);
  const bypassUrl = providerUrl("v1", `projects/${VERCEL_PROJECT_ID}/protection-bypass`, [["teamId", VERCEL_TEAM_ID]]);
  return {
    deployment: {
      request: providerRequest("GET", providerUrl("v13", `deployments/${deploymentId}`, [["teamId", VERCEL_TEAM_ID]]), deploymentResponse),
      response: deploymentResponse
    },
    deploymentInvocation: {
      argv: [
        "npx", "--yes", `vercel@${VERCEL_CLI_VERSION}`, "deploy", "--prebuilt", "--yes", "--skip-domain",
        "--meta", `gitCommitSha=${sealed.sourceProvenance.commit}`,
        "--meta", `gitCommitRef=${STACK_B_BRANCH}`,
        "--meta", "gitRemoteUrl=https://github.com/chrisdortch/first.git",
        "--meta", "gitRootDirectory=apps/clover-launch-studio"
      ],
      workingDirectory: "frozen-workspace-root",
      outputRelativePath: ".vercel/output",
      projectLinkSha256: sealed.sourceProvenance.buildProjectSettingsSha256,
      toolPackage: "vercel",
      toolVersion: VERCEL_CLI_VERSION,
      toolIntegrity: VERCEL_CLI_INTEGRITY
    },
    fileTree: {
      request: providerRequest("GET", providerUrl("v6", `deployments/${deploymentId}/files`, [["teamId", VERCEL_TEAM_ID]]), fileTreeResponse),
      response: fileTreeResponse
    },
    contents,
    protection: {
      deploymentId,
      baseline: {
        observedAt: "2026-08-29T20:00:00.000Z",
        request: providerRequest("GET", projectReadUrl, baselineResponse),
        response: baselineResponse
      },
      create: {
        action: "create",
        eventId: "bypass:create:0001",
        observedAt: "2026-08-29T20:00:01.000Z",
        bypassCountBefore: 0,
        bypassCountAfter: 1,
        operation: "create-one-automation-bypass",
        request: providerRequest("PATCH", bypassUrl, createResponseProjection, "2026-08-29T20:00:01.000Z"),
        requestSemantics: { scope: "automation-bypass", suppliedValue: false, valueSource: "provider-generated" },
        createdEntry,
        responseEntryCount: 1
      },
      revoke: {
        action: "revoke",
        eventId: "bypass:revoke:0001",
        observedAt: "2026-08-29T20:00:02.000Z",
        bypassCountBefore: 1,
        bypassCountAfter: 0,
        operation: "revoke-exact-automation-bypass-without-regeneration",
        request: providerRequest("PATCH", bypassUrl, revokeResponse, "2026-08-29T20:00:02.000Z"),
        requestSemantics: { exactCreatedBypass: true, regenerate: false },
        response: revokeResponse
      },
      bypassCountSequence: [0, 1, 0],
      regenerationDisabled: true,
      shareUrlCreated: false,
      vercelCurlUsed: false,
      bypassValueDisclosed: false,
      bypassValuePersisted: false,
      bypassValueUploaded: false,
      bypassValueAttached: false,
      bypassValueScreenshotted: false,
      ownerLoginRequested: false,
      postRevocationAuthenticatedRequestCount: 0
    }
  };
}

test("generated preview output normalization, manifest, attestation and archive are deterministic", () => {
  const root = mkdtempSync(path.join(tmpdir(), "clover-output-attestation-"));
  const output = path.join(root, "output");
  const evidence = path.join(root, "evidence");
  const secondEvidence = path.join(root, "evidence-second");
  try {
    const checkoutRoot = execFileSync("pwd", ["-P"], { cwd: root, encoding: "utf8" }).trim();
    writeRawBuildOutput(output, checkoutRoot);
    const first = createDeploymentAttestation({ outputRoot: output, repositoryRoot: root, evidenceDirectory: evidence, sourceProvenance: build });
    assert.equal(first.attestation.source.commit, candidateCommit);
    assert.equal(first.attestation.source.runtimeDeploymentKey, runtimeDeploymentKey);
    assert.equal(first.attestation.publicSanitized, true);
    assert.equal(first.attestation.normalization.length, 3);
    assert.deepEqual(first.cliInvocation, {
      rawCliExecutable: "/var/task/.vercel-cli/node_modules/vercel/dist/vc.js",
      canonicalCliExecutable: "/var/task/.vercel-cli/node_modules/vercel/dist/vc.js",
      launcherKind: "direct",
      installRoot: "/var/task/.vercel-cli",
      packageRoot: "/var/task/.vercel-cli/node_modules/vercel",
      packageVersion: VERCEL_CLI_VERSION,
      packageIntegrityVerified: true
    });
    assert.equal(readFileSync(path.join(output, "builds.json"), "utf8").includes(checkoutRoot), false);
    for (const entry of rawTreeIdentity(output).filter(({ type }) => type === "file")) {
      assert.equal(readFileSync(path.join(output, ...entry.path.split("/"))).includes(Buffer.from(checkoutRoot)), false);
    }
    assert.equal(readFileSync(path.join(output, "functions/index.func/apps/clover-launch-studio/___next_launcher.cjs"), "utf8").includes("/var/task"), true);
    const identities = {
      attestation: first.attestationRawSha256,
      manifest: first.manifestRawSha256,
      root: first.outputManifest.rootSha256,
      archive: first.archiveSha256,
      bytes: first.archiveBytes
    };
    const restore = path.join(root, "restore");
    mkdirSync(restore);
    execFileSync("tar", ["-xf", first.archivePath, "-C", restore]);
    assert.deepEqual(buildOutputManifest(path.join(restore, "output")), buildOutputManifest(output));

    writeRawBuildOutput(output, checkoutRoot);
    const second = createDeploymentAttestation({ outputRoot: output, repositoryRoot: root, evidenceDirectory: secondEvidence, sourceProvenance: build });
    assert.deepEqual({
      attestation: second.attestationRawSha256,
      manifest: second.manifestRawSha256,
      root: second.outputManifest.rootSha256,
      archive: second.archiveSha256,
      bytes: second.archiveBytes
    }, identities);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("output sealing rejects malformed normalization inputs and restores the exact pre-operation tree", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "clover-output-transaction-"));
  try {
    const checkoutRoot = execFileSync("pwd", ["-P"], { cwd: root, encoding: "utf8" }).trim();
    const cases = [
      ["builds invalid UTF-8", "builds.json", Buffer.from([0x7b, 0x22, 0x80, 0x22, 0x7d]), /CLOVER_BUILDS_JSON_INVALID_UTF8/u],
      ["metadata invalid UTF-8", "diagnostics/cli_traces.json", Buffer.from([0x7b, 0x22, 0x80, 0x22, 0x7d]), /CLOVER_NORMALIZATION:diagnostics\/cli_traces\.json_INVALID_UTF8/u],
      ["launcher invalid UTF-8", "functions/index.func/apps/clover-launch-studio/___next_launcher.cjs", Buffer.from([0x63, 0x6f, 0x80]), /CLOVER_NORMALIZATION:functions\//u]
    ];
    for (const [name, relativePath, bytes, expected] of cases) {
      await t.test(name, () => {
        const output = path.join(root, name.replaceAll(" ", "-"));
        const evidence = `${output}-evidence`;
        const frozen = `${output}-frozen`;
        writeRawBuildOutput(output, checkoutRoot);
        writeFileSync(path.join(output, ...relativePath.split("/")), bytes);
        const before = rawTreeIdentity(output);
        assert.throws(() => createDeploymentAttestation({ outputRoot: output, repositoryRoot: root, evidenceDirectory: evidence, frozenOutputRoot: frozen, sourceProvenance: build }), expected);
        assert.deepEqual(rawTreeIdentity(output), before);
        assert.equal(existsSync(evidence), false);
        assert.equal(existsSync(frozen), false);
        assert.equal(existsSync(path.join(output, ATTESTATION_OUTPUT_PATH)), false);
      });
    }

    await t.test("duplicate generated JSON key", () => {
      const output = path.join(root, "duplicate-json");
      const evidence = `${output}-evidence`;
      writeRawBuildOutput(output, checkoutRoot);
      const buildsPath = path.join(output, "builds.json");
      const duplicate = readFileSync(buildsPath, "utf8").replace('{"target":"preview"', '{"target":"preview","target":"preview"');
      writeFileSync(buildsPath, duplicate);
      const before = rawTreeIdentity(output);
      assert.throws(() => createDeploymentAttestation({ outputRoot: output, repositoryRoot: root, evidenceDirectory: evidence, sourceProvenance: build }), /CLOVER_BUILDS_JSON_REJECTED/u);
      assert.deepEqual(rawTreeIdentity(output), before);
      assert.equal(existsSync(evidence), false);
    });

    await t.test("late public-output failure restores normalization and cleans transaction outputs", () => {
      const output = path.join(root, "late-failure");
      const evidence = `${output}-evidence`;
      const frozen = `${output}-frozen`;
      writeRawBuildOutput(output, checkoutRoot);
      writeFileSync(path.join(output, "static/leak.txt"), "/github/workspace/private-checkout\n");
      const before = rawTreeIdentity(output);
      assert.throws(() => createDeploymentAttestation({ outputRoot: output, repositoryRoot: root, evidenceDirectory: evidence, frozenOutputRoot: frozen, sourceProvenance: build }), /CLOVER_PUBLIC_OUTPUT_REJECTED/u);
      assert.deepEqual(rawTreeIdentity(output), before);
      assert.equal(existsSync(evidence), false);
      assert.equal(existsSync(frozen), false);
      assert.equal(existsSync(path.join(output, "static/__clover")), false);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("provider receipt binds the exact immutable deployment, bytes and protection lifecycle", () => {
  const root = mkdtempSync(path.join(tmpdir(), "clover-provider-receipt-"));
  try {
    const output = path.join(root, "output");
    const evidence = path.join(root, "evidence");
    const checkoutRoot = execFileSync("pwd", ["-P"], { cwd: root, encoding: "utf8" }).trim();
    writeRawBuildOutput(output, checkoutRoot);
    const sealed = createDeploymentAttestation({ outputRoot: output, repositoryRoot: root, evidenceDirectory: evidence, sourceProvenance: build });
    const verifiedEvidence = {
      sourceProvenance: build,
      payloadManifest: sealed.outputManifest,
      attestation: sealed.attestation,
      deploymentInputManifest: sealed.deploymentInputManifest,
      archiveManifest: sealed.archiveManifest
    };
    const provider = providerDeploymentFixture(output, verifiedEvidence);
    const receipt = createProviderDeploymentReceipt({ providerDeployment: provider, verifiedEvidence, now: providerReceiptNow });
    assert.equal(receipt.deploymentId, provider.deployment.response.id);
    assert.equal(receipt.deploymentInputRootSha256, sealed.deploymentInputManifest.deploymentInputRootSha256);
    assert.equal(receipt.archiveSha256, sealed.archiveManifest.archiveSha256);
    assert.equal(receipt.providerContentReadCount, sealed.deploymentInputManifest.finalRegularFileCount + sealed.deploymentInputManifest.finalSymlinkCount);
    assert.equal(receipt.automationBypassLifecycle, "0->1->0");
    assert.equal(receipt.finalAutomationBypassCount, 0);
    assert.equal(receipt.regenerationDisabled, true);
    assert.equal(receipt.postRevocationAuthenticatedRequestCount, 0);
    assert.equal(receipt.ssoProtectionPreserved, true);
    assert.equal(receipt.publicSanitized, true);
    assert.equal(receipt.generatedAt, providerReceiptNow.toISOString());
    assert.equal(receipt.providerObservationEarliestAt, "2026-08-29T20:00:00.000Z");
    assert.equal(receipt.providerObservationLatestAt, "2026-08-29T20:00:02.000Z");
    assert.equal(receipt.providerObservationSpanMilliseconds, 2_000);
    assert.equal(receipt.providerObservationCount, 5 + receipt.providerContentReadCount);
    assert.equal(receipt.privateDataAccessed, false);
    assert.equal(receipt.secretsIncluded, false);
    assert.equal(receipt.consequentialAuthorityGranted, false);
    assert.match(receipt.receiptSelfHash, /^[0-9a-f]{64}$/u);
    const explicitUtf8 = structuredClone(provider);
    explicitUtf8.deployment.request.responseCharset = "utf-8";
    assert.equal(createProviderDeploymentReceipt({ providerDeployment: explicitUtf8, verifiedEvidence, now: providerReceiptNow }).deploymentId, receipt.deploymentId);

    const reject = (mutate, expected) => {
      const candidate = structuredClone(provider);
      mutate(candidate);
      assert.throws(() => createProviderDeploymentReceipt({ providerDeployment: candidate, verifiedEvidence, now: providerReceiptNow }), expected);
    };
    const providerOutput = (candidate) => candidate.fileTree.response[0].children.find(({ name }) => name === ".vercel").children.find(({ name }) => name === "output");
    const findProviderNode = (candidate, outputPath) => outputPath.split("/").reduce((directory, segment) => directory.children.find(({ name }) => name === segment), providerOutput(candidate));
    const rebindFileTree = (candidate) => {
      candidate.fileTree.request = providerRequest("GET", candidate.fileTree.request.url, candidate.fileTree.response);
    };
    const rebindContent = (candidate, content) => {
      content.request = providerRequest("GET", providerUrl("v8", `deployments/${candidate.deployment.response.id}/files/${content.uid}`, [["path", content.path], ["teamId", VERCEL_TEAM_ID]]), content.response);
    };
    const rebindBaseline = (candidate) => {
      candidate.protection.baseline.request = providerRequest("GET", candidate.protection.baseline.request.url, candidate.protection.baseline.response);
    };
    const runtimeSlash = String.fromCharCode(47);
    const providerLocalPathPrefix = [runtimeSlash, "Users", runtimeSlash].join("");
    const providerLocalPathFixture = [runtimeSlash, "Users", runtimeSlash, "private", runtimeSlash, "repository"].join("");
    const providerLocalPathNeutral = [runtimeSlash, "User", runtimeSlash, "private", runtimeSlash, "repository"].join("");
    const providerLocalPathClass = (value) => value.startsWith(providerLocalPathPrefix) ? "absolute-local-path" : "none";
    assert.deepEqual({
      id: "provider-local-path",
      class: providerLocalPathClass(providerLocalPathFixture),
      byteCount: Buffer.byteLength(providerLocalPathFixture, "utf8"),
      sha256: sha256(providerLocalPathFixture)
    }, {
      id: "provider-local-path",
      class: "absolute-local-path",
      byteCount: 25,
      sha256: "ee67da15356aec42d6afb46ffab382c2781c3f5801e8482c4f7420bce59ded02"
    });
    assert.deepEqual({
      id: "provider-local-path-neutral",
      class: providerLocalPathClass(providerLocalPathNeutral),
      byteCount: Buffer.byteLength(providerLocalPathNeutral, "utf8"),
      sha256: sha256(providerLocalPathNeutral)
    }, {
      id: "provider-local-path-neutral",
      class: "none",
      byteCount: 24,
      sha256: "c1ab22674f3300bf8a789040f671086c795118ab97ef79e2a702d7b42de03e6d"
    });
    reject((candidate) => { candidate.deployment.request.url += "&substituted=1"; }, /CLOVER_PROVIDER_DEPLOYMENT_REQUEST_REJECTED/u);
    reject((candidate) => { candidate.deployment.request.redirected = true; }, /CLOVER_PROVIDER_DEPLOYMENT_REQUEST_REJECTED/u);
    reject((candidate) => { candidate.deployment.request.responseMediaTypeEssence = "text/plain"; }, /CLOVER_PROVIDER_DEPLOYMENT_REQUEST_REJECTED/u);
    reject((candidate) => { candidate.deployment.request.responseCharset = "iso-8859-1"; }, /CLOVER_PROVIDER_DEPLOYMENT_REQUEST_REJECTED/u);
    reject((candidate) => { candidate.deployment.request.responseOtherMediaTypeParameters = ["profile=private"]; }, /CLOVER_PROVIDER_DEPLOYMENT_REQUEST_REJECTED/u);
    reject((candidate) => { candidate.deployment.request.responseProjectionBytes += 1; }, /CLOVER_PROVIDER_DEPLOYMENT_REQUEST_REJECTED/u);
    reject((candidate) => { candidate.deployment.request.responseProjectionSha256 = hex64("f"); }, /CLOVER_PROVIDER_DEPLOYMENT_REQUEST_REJECTED/u);
    reject((candidate) => { candidate.deployment.request.observedAt = "2026-08-29T19:29:59.000Z"; }, /CLOVER_PROVIDER_DEPLOYMENT_REQUEST_REJECTED/u);
    reject((candidate) => { candidate.deployment.request.observedAt = "2026-08-29T20:00:08.001Z"; }, /CLOVER_PROVIDER_DEPLOYMENT_REQUEST_REJECTED/u);
    reject((candidate) => { candidate.deployment.request.observedAt = "2026-08-29T20:00:02.500Z"; }, /CLOVER_PROVIDER_POST_REVOCATION_REQUEST_REJECTED/u);
    reject((candidate) => { candidate.contents[0].request.observedAt = "2026-08-29T20:00:02.500Z"; }, /CLOVER_PROVIDER_POST_REVOCATION_REQUEST_REJECTED/u);
    reject((candidate) => {
      candidate.protection.baseline.observedAt = "2026-08-29T19:30:03.000Z";
      candidate.protection.baseline.request.observedAt = candidate.protection.baseline.observedAt;
      candidate.contents[0].request.observedAt = "2026-08-29T20:00:07.000Z";
    }, /CLOVER_PROVIDER_OBSERVATION_WINDOW_REJECTED/u);
    reject((candidate) => { candidate.protection.create.request.observedAt = "2026-08-29T20:00:00.999Z"; }, /CLOVER_PROVIDER_PROTECTION_CREATE_TIME_REJECTED/u);
    reject((candidate) => { candidate.deployment.response.project.id = "prj_substituted"; }, /CLOVER_PROVIDER_DEPLOYMENT_REJECTED/u);
    reject((candidate) => { candidate.deployment.response.team.slug = "substituted"; }, /CLOVER_PROVIDER_DEPLOYMENT_REJECTED/u);
    reject((candidate) => { candidate.deployment.response.target = "production"; }, /CLOVER_PROVIDER_DEPLOYMENT_REJECTED/u);
    reject((candidate) => { candidate.deployment.response.alias.push("production.example"); }, /CLOVER_PROVIDER_DEPLOYMENT_REJECTED/u);
    reject((candidate) => { candidate.deployment.response.meta.gitRemoteUrl = providerLocalPathFixture; }, /CLOVER_PROVIDER_DEPLOYMENT_REJECTED/u);
    reject((candidate) => { candidate.deployment.response.meta.gitCommitSha = hex40("f"); }, /CLOVER_PROVIDER_DEPLOYMENT_REJECTED/u);
    reject((candidate) => { candidate.deployment.response.meta.gitCommitRef = "HEAD"; }, /CLOVER_PROVIDER_DEPLOYMENT_REJECTED/u);
    reject((candidate) => { candidate.deployment.response.id = "dpl_Substituted"; }, /CLOVER_PROVIDER_PROTECTION_REJECTED|CLOVER_PROVIDER_DEPLOYMENT_REQUEST_REJECTED/u);
    reject((candidate) => { candidate.deployment.response.url = "attacker.example"; }, /CLOVER_PROVIDER_DEPLOYMENT_REJECTED/u);
    reject((candidate) => { candidate.deployment.response.name = "substituted"; }, /CLOVER_PROVIDER_DEPLOYMENT_REJECTED/u);
    reject((candidate) => { candidate.deployment.response.project.name = "substituted"; }, /CLOVER_PROVIDER_DEPLOYMENT_REJECTED/u);
    reject((candidate) => { candidate.deployment.response.project.framework = "other"; }, /CLOVER_PROVIDER_DEPLOYMENT_REJECTED/u);
    reject((candidate) => { candidate.deployment.response.team.name = "Private account"; }, /CLOVER_PROVIDER_DEPLOYMENT_REJECTED/u);
    reject((candidate) => { candidate.deploymentInvocation.argv.splice(6, 1); }, /CLOVER_PROVIDER_DEPLOYMENT_INVOCATION_REJECTED/u);
    reject((candidate) => { candidate.fileTree.request.url += "&substituted=1"; }, /CLOVER_PROVIDER_FILE_TREE_REQUEST_REJECTED/u);
    reject((candidate) => { candidate.fileTree.response[0].children.pop(); candidate.fileTree.request = providerRequest("GET", candidate.fileTree.request.url, candidate.fileTree.response); }, /CLOVER_PROVIDER_FILE_TREE_REJECTED/u);
    reject((candidate) => { candidate.contents.pop(); }, /CLOVER_PROVIDER_UID_REJECTED|CLOVER_PROVIDER_CONTENT_INVENTORY_REJECTED/u);
    reject((candidate) => { candidate.contents[0].request.url += "&substituted=1"; }, /CLOVER_PROVIDER_CONTENT_REQUEST_REJECTED/u);
    reject((candidate) => {
      candidate.contents[0].response.data = Buffer.from("substituted", "utf8").toString("base64");
      candidate.contents[0].request = providerRequest("GET", candidate.contents[0].request.url, candidate.contents[0].response);
    }, /CLOVER_PROVIDER_UID_REJECTED/u);
    reject((candidate) => {
      const original = candidate.contents[0];
      const segments = original.path.slice("src/.vercel/output/".length).split("/");
      const originalNode = findProviderNode(candidate, segments.join("/"));
      originalNode.mode = (originalNode.mode & 0o170000) | (originalNode.mode & 0o7777) ^ 0o20;
      rebindFileTree(candidate);
    }, /CLOVER_PROVIDER_DEPLOYMENT_INPUT_MISMATCH/u);
    reject((candidate) => {
      const original = candidate.contents[0];
      findProviderNode(candidate, original.path.slice("src/.vercel/output/".length)).mode += 0x10_0000;
      rebindFileTree(candidate);
    }, /CLOVER_PROVIDER_FILE_MODE_REJECTED/u);
    reject((candidate) => {
      const original = candidate.contents[0];
      findProviderNode(candidate, original.path.slice("src/.vercel/output/".length)).mode = -1;
      rebindFileTree(candidate);
    }, /CLOVER_PROVIDER_FILE_MODE_REJECTED/u);
    reject((candidate) => {
      const providerOut = candidate.fileTree.response[0].children.find(({ name }) => name === "out");
      providerOut.children[0].mode += 0x10_0000;
      rebindFileTree(candidate);
    }, /CLOVER_PROVIDER_IGNORED_FILE_REJECTED/u);
    reject((candidate) => {
      const original = candidate.contents[0];
      const node = findProviderNode(candidate, original.path.slice("src/.vercel/output/".length));
      node.uid = hex40("f");
      original.uid = node.uid;
      rebindContent(candidate, original);
      rebindFileTree(candidate);
    }, /CLOVER_PROVIDER_UID_REJECTED/u);
    reject((candidate) => {
      const outputNode = providerOutput(candidate);
      const bytes = Buffer.from("extra\n", "utf8");
      const uid = sha1(bytes);
      outputNode.children.push({ name: "extra.txt", type: "file", mode: 0o100644, uid });
      const response = { data: bytes.toString("base64") };
      const content = { path: "src/.vercel/output/extra.txt", uid, request: null, response };
      rebindContent(candidate, content);
      candidate.contents.push(content);
      rebindFileTree(candidate);
    }, /CLOVER_PROVIDER_DEPLOYMENT_INPUT_MISMATCH/u);
    reject((candidate) => {
      const outputNode = providerOutput(candidate);
      const removed = outputNode.children.find(({ type }) => type !== "directory");
      outputNode.children = outputNode.children.filter((entry) => entry !== removed);
      candidate.contents = candidate.contents.filter(({ path: providerPath }) => !providerPath.endsWith(`/${removed.name}`));
      rebindFileTree(candidate);
    }, /CLOVER_PROVIDER_DEPLOYMENT_INPUT_MISMATCH/u);
    reject((candidate) => {
      const outputNode = providerOutput(candidate);
      outputNode.children.push(structuredClone(outputNode.children[0]));
      rebindFileTree(candidate);
    }, /CLOVER_PROVIDER_DUPLICATE_PATH_REJECTED/u);
    reject((candidate) => {
      const extra = structuredClone(candidate.contents[0]);
      extra.path = "src/.vercel/output/unlisted.txt";
      rebindContent(candidate, extra);
      candidate.contents.push(extra);
    }, /CLOVER_PROVIDER_CONTENT_INVENTORY_REJECTED/u);
    const symlinkContentIndex = provider.contents.findIndex(({ path: providerPath }) => providerPath.endsWith("/static/current.js"));
    assert.notEqual(symlinkContentIndex, -1);
    reject((candidate) => {
      const content = candidate.contents[symlinkContentIndex];
      const bytes = Buffer.from("assets/substituted.js", "utf8");
      const oldUid = content.uid;
      content.uid = sha1(bytes);
      content.response.data = bytes.toString("base64");
      const node = findProviderNode(candidate, content.path.slice("src/.vercel/output/".length));
      assert.equal(node.uid, oldUid);
      node.uid = content.uid;
      rebindContent(candidate, content);
      rebindFileTree(candidate);
    }, /CLOVER_PROVIDER_DEPLOYMENT_INPUT_MISMATCH/u);
    reject((candidate) => { candidate.protection.bypassCountSequence = [0, 1, 1]; }, /CLOVER_PROVIDER_PROTECTION_REJECTED/u);
    reject((candidate) => { candidate.protection.revoke.requestSemantics.regenerate = true; }, /CLOVER_PROVIDER_PROTECTION_REVOKE_REQUEST_SEMANTICS_REJECTED/u);
    reject((candidate) => { candidate.protection.revoke.response.protectionBypass.persisted = { scope: "automation-bypass" }; }, /CLOVER_PROVIDER_PROTECTION_REVOKE_RESPONSE_BYPASS_REJECTED/u);
    reject((candidate) => { candidate.protection.postRevocationAuthenticatedRequestCount = 1; }, /CLOVER_PROVIDER_PROTECTION_REJECTED/u);
    reject((candidate) => { candidate.protection.create.createdEntry.createdBy = "acct_private"; }, /CLOVER_PROVIDER_PROTECTION_CREATE_CREATED_ENTRY_REJECTED/u);
    for (const [field, value] of [
      ["bypassCount", 1], ["passwordProtectionEnabled", true], ["gitForkProtection", false], ["skewProtectionMaxAge", 1]
    ]) reject((candidate) => { candidate.protection.baseline.response[field] = value; rebindBaseline(candidate); }, /CLOVER_PROVIDER_PROTECTION_BASELINE_REJECTED/u);
    reject((candidate) => { candidate.protection.baseline.response.ssoProtection.deploymentType = "none"; rebindBaseline(candidate); }, /CLOVER_PROVIDER_PROTECTION_BASELINE_REJECTED/u);
    reject((candidate) => { candidate.protection.create.responseEntryCount = 2; }, /CLOVER_PROVIDER_PROTECTION_CREATE_CREATED_ENTRY_REJECTED/u);
    reject((candidate) => { candidate.protection.create.createdEntry.scope = "integration"; }, /CLOVER_PROVIDER_PROTECTION_CREATE_CREATED_ENTRY_REJECTED/u);
    for (const field of [
      "shareUrlCreated", "vercelCurlUsed", "bypassValueDisclosed", "bypassValuePersisted", "bypassValueUploaded",
      "bypassValueAttached", "bypassValueScreenshotted", "ownerLoginRequested"
    ]) reject((candidate) => { candidate.protection[field] = true; }, /CLOVER_PROVIDER_PROTECTION_REJECTED/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function withRewrittenTarHeader(archive, headerOffset, mutate) {
  const candidate = Buffer.from(archive);
  const header = candidate.subarray(headerOffset, headerOffset + 512);
  mutate(header);
  header.fill(0x20, 148, 156);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0"), 148, 6, "ascii");
  header[154] = 0;
  header[155] = 0x20;
  return candidate;
}

function tarRecordOffsets(archive) {
  const offsets = [];
  let offset = 0;
  while (offset + 512 <= archive.length && !archive.subarray(offset, offset + 512).every((byte) => byte === 0)) {
    offsets.push(offset);
    const sizeText = archive.subarray(offset + 124, offset + 136).toString("ascii").replace(/[\0 ]+$/u, "");
    const size = Number.parseInt(sizeText, 8);
    offset += 512 + size + (512 - size % 512) % 512;
  }
  return offsets;
}

test("frozen archive and external evidence verification reject substitutions without partial restore", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "clover-archive-adversarial-"));
  try {
    const output = path.join(root, "output");
    const evidence = path.join(root, "evidence");
    const checkoutRoot = execFileSync("pwd", ["-P"], { cwd: root, encoding: "utf8" }).trim();
    const canonicalRoot = checkoutRoot;
    writeRawBuildOutput(output, checkoutRoot);
    const sealed = createDeploymentAttestation({ outputRoot: output, repositoryRoot: root, evidenceDirectory: evidence, sourceProvenance: build });
    const archive = deterministicOutputArchive(output);
    assert.deepEqual(archive, readFileSync(path.join(evidence, FINAL_ARCHIVE_FILE)));
    assert.equal(verifyDeploymentInputEvidence({ outputRoot: output, repositoryRoot: root, evidenceDirectory: evidence, sourceProvenance: build }).archiveManifest.archiveSha256, sealed.archiveSha256);

    const rejectsWithoutDestination = (name, candidate, expected) => t.test(name, () => {
      const destination = path.join(canonicalRoot, `restore-${name.replaceAll(" ", "-")}`);
      assert.throws(() => restoreDeterministicOutputArchive(candidate, destination), expected);
      assert.equal(existsSync(destination), false);
    });
    await rejectsWithoutDestination("checksum", (() => { const candidate = Buffer.from(archive); candidate[0] ^= 1; return candidate; })(), /CLOVER_ARCHIVE_CHECKSUM_REJECTED/u);
    await rejectsWithoutDestination("trailing block", Buffer.concat([archive, Buffer.alloc(512)]), /CLOVER_ARCHIVE_TERMINATOR_REJECTED/u);
    await rejectsWithoutDestination("invalid UTF-8 path", withRewrittenTarHeader(archive, 0, (header) => { header[7] = 0x80; }), /CLOVER_ARCHIVE_PATH_REJECTED/u);
    await rejectsWithoutDestination("unsafe mode", withRewrittenTarHeader(archive, 0, (header) => {
      header.fill(0, 100, 108);
      header.write("000000", 100, 6, "ascii");
      header[106] = 0;
      header[107] = 0x20;
    }), /CLOVER_ARCHIVE_MODE_REJECTED/u);
    const recordOffsets = tarRecordOffsets(archive);
    assert.equal(recordOffsets.length >= 3, true);
    const reordered = Buffer.concat([
      archive.subarray(recordOffsets[1], recordOffsets[2]),
      archive.subarray(recordOffsets[0], recordOffsets[1]),
      archive.subarray(recordOffsets[2])
    ]);
    await rejectsWithoutDestination("noncanonical order", reordered, /CLOVER_ARCHIVE_ORDER_REJECTED/u);
    await rejectsWithoutDestination("noncanonical header field", withRewrittenTarHeader(archive, 0, (header) => {
      header.fill(0, 108, 116);
      header.write("0000001", 108, 7, "ascii");
    }), /CLOVER_ARCHIVE_HEADER_REJECTED/u);
    const symlinkOffset = tarRecordOffsets(archive).find((offset) => archive[offset + 156] === "2".charCodeAt(0));
    assert.notEqual(symlinkOffset, undefined);
    await rejectsWithoutDestination("empty symlink", withRewrittenTarHeader(archive, symlinkOffset, (header) => { header.fill(0, 157, 257); }), /CLOVER_ARCHIVE_LINK_REJECTED/u);
    await rejectsWithoutDestination("traversing symlink", withRewrittenTarHeader(archive, symlinkOffset, (header) => {
      header.fill(0, 157, 257);
      header.write("../../outside", 157, "utf8");
    }), /CLOVER_ARCHIVE_LINK_REJECTED/u);

    await t.test("symlinked restore parent", () => {
      const outside = path.join(canonicalRoot, "outside");
      const sentinel = path.join(outside, "sentinel.txt");
      mkdirSync(outside);
      writeFileSync(sentinel, "preserve\n");
      const link = path.join(canonicalRoot, "restore-link");
      symlinkSync(outside, link);
      assert.throws(() => restoreDeterministicOutputArchive(archive, path.join(link, "restored")), /CLOVER_ARCHIVE_RESTORE_DESTINATION_REJECTED/u);
      assert.equal(readFileSync(sentinel, "utf8"), "preserve\n");
      assert.equal(existsSync(path.join(outside, "restored")), false);
    });

    await t.test("post-seal output mutation", () => {
      const mutationPath = path.join(output, "static/assets/post-seal.js");
      writeFileSync(mutationPath, "substituted\n");
      assert.throws(() => verifyDeploymentInputEvidence({ outputRoot: output, repositoryRoot: root, evidenceDirectory: evidence, sourceProvenance: build }), /CLOVER_PAYLOAD_MANIFEST_MUTATION_REJECTED/u);
      unlinkSync(mutationPath);
    });
    await t.test("post-seal omitted file", () => {
      const omittedPath = path.join(output, "static/assets/app.js");
      const original = readFileSync(omittedPath);
      const originalMode = lstatSync(omittedPath).mode & 0o7777;
      unlinkSync(omittedPath);
      assert.throws(() => verifyDeploymentInputEvidence({ outputRoot: output, repositoryRoot: root, evidenceDirectory: evidence, sourceProvenance: build }), /CLOVER_(?:OUTPUT_SYMLINK|PAYLOAD_MANIFEST_MUTATION)_REJECTED/u);
      writeFileSync(omittedPath, original, { mode: originalMode });
      chmodSync(omittedPath, originalMode);
    });
    await t.test("post-seal file mode mutation", () => {
      const mutationPath = path.join(output, "static/assets/app.js");
      const originalMode = lstatSync(mutationPath).mode & 0o7777;
      chmodSync(mutationPath, 0o600);
      assert.throws(() => verifyDeploymentInputEvidence({ outputRoot: output, repositoryRoot: root, evidenceDirectory: evidence, sourceProvenance: build }), /CLOVER_OUTPUT_FILE_MODE_REJECTED/u);
      chmodSync(mutationPath, originalMode);
    });
    await t.test("post-seal symlink target mutation", () => {
      const mutationPath = path.join(output, "static/current.js");
      const originalTarget = readlinkSync(mutationPath);
      unlinkSync(mutationPath);
      symlinkSync("../builds.json", mutationPath);
      assert.throws(() => verifyDeploymentInputEvidence({ outputRoot: output, repositoryRoot: root, evidenceDirectory: evidence, sourceProvenance: build }), /CLOVER_PAYLOAD_MANIFEST_MUTATION_REJECTED/u);
      unlinkSync(mutationPath);
      symlinkSync(originalTarget, mutationPath);
    });
    await t.test("attestation byte substitution", () => {
      const attestationPath = path.join(output, ATTESTATION_OUTPUT_PATH);
      const original = readFileSync(attestationPath);
      writeFileSync(attestationPath, Buffer.concat([original.subarray(0, -2), Buffer.from([0x80, 0x0a])]));
      assert.throws(() => verifyDeploymentInputEvidence({ outputRoot: output, repositoryRoot: root, evidenceDirectory: evidence, sourceProvenance: build }), /CLOVER_ATTESTATION_FILE_REJECTED/u);
      writeFileSync(attestationPath, original);
    });
    await t.test("resealed nested attestation extension", () => {
      const attestationPath = path.join(output, ATTESTATION_OUTPUT_PATH);
      const original = readFileSync(attestationPath);
      const document = JSON.parse(original.toString("utf8"));
      document.source.unboundClaim = "substituted";
      const body = structuredClone(document);
      delete body.attestationHash;
      document.attestationHash = sha256(`${canonicalJson(body)}\n`);
      writeFileSync(attestationPath, `${canonicalJson(document)}\n`);
      assert.throws(() => verifyDeploymentInputEvidence({ outputRoot: output, repositoryRoot: root, evidenceDirectory: evidence, sourceProvenance: build }), /CLOVER_ATTESTATION_SOURCE_REJECTED/u);
      writeFileSync(attestationPath, original);
    });
    await t.test("resealed normalization classification substitution", () => {
      const attestationPath = path.join(output, ATTESTATION_OUTPUT_PATH);
      const original = readFileSync(attestationPath);
      const document = JSON.parse(original.toString("utf8"));
      document.normalization[0].classification = "next-launcher-runtime-root";
      const body = structuredClone(document);
      delete body.attestationHash;
      document.attestationHash = sha256(`${canonicalJson(body)}\n`);
      writeFileSync(attestationPath, `${canonicalJson(document)}\n`);
      assert.throws(() => verifyDeploymentInputEvidence({ outputRoot: output, repositoryRoot: root, evidenceDirectory: evidence, sourceProvenance: build }), /CLOVER_ATTESTATION_NORMALIZATION_REJECTED/u);
      writeFileSync(attestationPath, original);
    });
    await t.test("canonical manifest substitution", () => {
      const manifestPath = path.join(evidence, DEPLOYMENT_INPUT_MANIFEST_FILE);
      const original = readFileSync(manifestPath);
      const document = JSON.parse(original.toString("utf8"));
      document.publicSanitized = false;
      writeFileSync(manifestPath, `${canonicalJson(document)}\n`);
      assert.throws(() => verifyDeploymentInputEvidence({ outputRoot: output, repositoryRoot: root, evidenceDirectory: evidence, sourceProvenance: build }), /CLOVER_DEPLOYMENT_INPUT_MUTATION_REJECTED/u);
      writeFileSync(manifestPath, original);
    });
    await t.test("archive byte substitution", () => {
      const archivePath = path.join(evidence, FINAL_ARCHIVE_FILE);
      const original = readFileSync(archivePath);
      const substituted = Buffer.from(original);
      substituted[512] ^= 1;
      writeFileSync(archivePath, substituted);
      assert.throws(() => verifyDeploymentInputEvidence({ outputRoot: output, repositoryRoot: root, evidenceDirectory: evidence, sourceProvenance: build }), /CLOVER_ARCHIVE_SUBSTITUTION_REJECTED/u);
      writeFileSync(archivePath, original);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("output manifest rejects external symlinks, noncanonical names, host paths and secrets", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "clover-output-adversarial-"));
  try {
    await t.test("external symlink", () => {
      const output = path.join(root, "external-symlink");
      mkdirSync(output);
      symlinkSync("../../outside", path.join(output, "escape"));
      assert.throws(() => buildOutputManifest(output), /CLOVER_OUTPUT_SYMLINK_REJECTED/u);
    });
    await t.test("noncanonical unicode", () => {
      const output = path.join(root, "unicode");
      mkdirSync(output);
      const decomposed = "e\u0301.txt";
      writeFileSync(path.join(output, decomposed), "public\n");
      assert.throws(() => buildOutputManifest(output), /CLOVER_OUTPUT_PATH_REJECTED/u);
    });
    await t.test("host absolute path", () => {
      const output = path.join(root, "absolute");
      mkdirSync(output);
      writeFileSync(path.join(output, "leak.txt"), `${["/Use", "rs/example/private/checkout"].join("")}\n`);
      assert.throws(() => buildOutputManifest(output), /CLOVER_PUBLIC_OUTPUT_REJECTED:leak\.txt:host-absolute-path/u);
    });
    await t.test("secret", () => {
      const output = path.join(root, "secret");
      mkdirSync(output);
      writeFileSync(path.join(output, "leak.txt"), `token=ghp_${"A".repeat(32)}\n`);
      assert.throws(() => buildOutputManifest(output), /CLOVER_PUBLIC_OUTPUT_REJECTED:leak\.txt:github-token/u);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("immutable Tree Program 0.1 records remain byte-identical to the source commit", () => {
  const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
  const immutablePaths = execFileSync("git", ["ls-tree", "-r", "--name-only", "HEAD", "portfolio/core/tree-program/versions/0.1.0"], { cwd: repositoryRoot, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
  assert.equal(immutablePaths.length, 17);
  for (const sourcePath of ["portfolio/core/tree-program/index.json", ...immutablePaths]) {
    const committed = execFileSync("git", ["show", `HEAD:${sourcePath}`], { cwd: repositoryRoot });
    assert.deepEqual(readFileSync(path.join(repositoryRoot, sourcePath)), committed);
  }
});
