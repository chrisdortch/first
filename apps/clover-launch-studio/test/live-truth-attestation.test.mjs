import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
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
  EXPECTED_STACK_A_BASE_COMMIT,
  EXPECTED_STACK_A_HEAD,
  EXPECTED_STACK_B_CHANGED_PATH_COUNT,
  EXPECTED_STACK_B_PATH_LIST_SHA256,
  GITHUB_ORIGIN,
  GITHUB_REPOSITORY,
  GITHUB_REPOSITORY_ID,
  MAX_GITHUB_CHECK_RUN_PAGES,
  MAX_GITHUB_CHECK_RUNS,
  NO_ATTESTATION_COMPARISON,
  REQUIRED_EXACT_HEAD_CHECKS,
  STACK_A_BRANCH,
  STACK_B_BRANCH,
  computeTruthReadiness,
  observeDeploymentSelf,
  observeGitHubTruth,
  projectVercelRuntimeEnvironment,
  reconcileTreeTruth
} from "../src/lib/live-truth.ts";
import {
  ATTESTATION_OUTPUT_PATH,
  STACK_A_BASE,
  buildOutputManifest,
  canonicalJson,
  createDeploymentAttestation,
  deriveSourceManifestEntries,
  parseSourceChanges,
  deriveSourceProvenance
} from "../scripts/clover-deployment-attestation.mjs";
import { compareDeploymentAttestation, parseBuildProvenance } from "../src/lib/provenance.ts";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
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

const build = parseBuildProvenance({
  documentType: "clover-tree-build-provenance",
  schemaVersion: "0.3.0",
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
  buildOutputCommand: "vercel build --yes",
  buildInvocationId: `clover-build:${hex64("6")}`,
  publicSanitized: true,
  privateDataAccessed: false,
  consequentialAuthorityGranted: false
});

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
    return { name: "main", protected: true, commit: { sha: EXPECTED_MAIN_COMMIT, commit: { tree: { sha: hex40("d") } } } };
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
  if (endpoint.includes(`/commits/${candidateCommit}/check-runs`)) {
    const check_runs = REQUIRED_EXACT_HEAD_CHECKS.map((name, index) => ({ id: index + 1, name, head_sha: candidateCommit, status: "completed", conclusion: "success", started_at: "2026-08-29T16:31:00Z", completed_at: `2026-08-29T16:32:0${index}Z` }));
    return { total_count: check_runs.length, check_runs };
  }
  throw new Error(`unexpected fixture endpoint ${endpoint}`);
}

function githubFetch({ sourceDate = "Sat, 29 Aug 2026 17:00:00 GMT", mutate = (value) => value } = {}) {
  const calls = [];
  const implementation = async (endpoint, options) => {
    calls.push({ endpoint, options });
    const body = JSON.stringify(mutate(structuredClone(githubFixture(endpoint)), endpoint));
    const headers = new Headers({ "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) });
    if (sourceDate) headers.set("date", sourceDate);
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
  completedAt = status === "completed" ? new Date(Date.parse(startedAt) + 500).toISOString() : null
}) {
  return { id, name, head_sha: headSha, status, conclusion, started_at: startedAt, completed_at: completedAt };
}

function githubPageEndpoint(page, commit = candidateCommit, canonicalRepository = false) {
  const repositoryPath = canonicalRepository ? `repositories/${GITHUB_REPOSITORY_ID}` : `repos/${GITHUB_REPOSITORY}`;
  return `${GITHUB_ORIGIN}/${repositoryPath}/commits/${commit}/check-runs?filter=all&per_page=100&page=${page}`;
}

function githubPaginationFetch({ pages, totalCount, linkForPage, responseForPage, sourceDate = "Sat, 29 Aug 2026 17:00:00 GMT" }) {
  const calls = [];
  const implementation = async (endpoint, options) => {
    calls.push({ endpoint, options });
    if (!endpoint.includes(`/commits/${candidateCommit}/check-runs`)) {
      const body = JSON.stringify(githubFixture(endpoint));
      const headers = new Headers({ date: sourceDate, "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) });
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
    const headers = new Headers({ date: sourceDate, "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) });
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
  assert.equal(observation.observedAt, "2026-08-29T17:00:00.000Z");
  assert.equal(observation.exactHeadChecks?.state, "success");
  assert.deepEqual(observation.exactHeadChecks?.requiredNames, REQUIRED_EXACT_HEAD_CHECKS);
  assert.equal(fixture.calls.length, 5);
  for (const { endpoint, options } of fixture.calls) {
    assert.match(endpoint, new RegExp(`^${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}(?:$|/(?:branches/main|pulls/(?:34|35)|commits/${candidateCommit}/check-runs\\?filter=all&per_page=100&page=1)$)`, "u"));
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal(options.credentials, "omit");
    assert.equal(options.cache, "force-cache");
    assert.deepEqual(options.next, { revalidate: 60 });
    assert.equal(new Headers(options.headers).has("authorization"), false);
  }
});

test("GitHub check-run pagination is complete, bounded, source-locked and rerun-aware", async (t) => {
  const requiredRuns = (startId = 1) => REQUIRED_EXACT_HEAD_CHECKS.map((name, offset) => checkRun({ id: startId + offset, name }));
  const auxiliaryRuns = (startId, count) => Array.from({ length: count }, (_, offset) => checkRun({ id: startId + offset }));

  await t.test("fewer than 100 and exactly 100 complete on one page", async () => {
    const fewer = githubPaginationFetch({ pages: [requiredRuns()], totalCount: 5 });
    assert.equal((await observeGitHubTruth({ candidateCommit, fetchImpl: fewer.implementation, retries: 0 })).status, "current");
    const exactly = githubPaginationFetch({ pages: [[...requiredRuns(), ...auxiliaryRuns(6, 95)]], totalCount: 100 });
    const observation = await observeGitHubTruth({ candidateCommit, fetchImpl: exactly.implementation, retries: 0 });
    assert.equal(observation.status, "current");
    assert.equal(observation.exactHeadChecks?.state, "success");
    assert.deepEqual(observation.endpoints.filter((endpoint) => endpoint.includes("/check-runs")), [githubPageEndpoint(1)]);
  });

  await t.test("101 runs include a required check found only on page two", async () => {
    const required = requiredRuns();
    const fixture = githubPaginationFetch({
      pages: [[...required.slice(0, 4), ...auxiliaryRuns(6, 96)], [required[4]]],
      totalCount: 101
    });
    const observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.status, "current");
    assert.equal(observation.exactHeadChecks?.state, "success");
    assert.deepEqual(observation.endpoints.filter((endpoint) => endpoint.includes("/check-runs")), [githubPageEndpoint(1), githubPageEndpoint(2, candidateCommit, true)]);
  });

  await t.test("250 runs aggregate across three pages with required names distributed", async () => {
    const required = requiredRuns(900);
    const all = auxiliaryRuns(1, 245);
    all.splice(20, 0, required[0]);
    all.splice(140, 0, required[1], required[2]);
    all.push(required[3], required[4]);
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
    let fixture = githubPaginationFetch({ pages: [[...base.slice(1), olderFailure, newerSuccess]], totalCount: 6 });
    let observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.exactHeadChecks?.state, "success");
    const newerFailure = { ...newerSuccess, id: 12, conclusion: "failure" };
    fixture = githubPaginationFetch({ pages: [[...base.slice(1), olderFailure, newerFailure]], totalCount: 6 });
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
    fixture = githubPaginationFetch({ pages: [[...base.slice(1), newerSuccess, newestPending]], totalCount: 6 });
    observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.exactHeadChecks?.state, "pending");

    const sameStartSuccess = checkRun({ id: 20, name: target, conclusion: "success", startedAt: "2026-08-29T18:00:00.000Z" });
    const sameStartFailure = checkRun({ id: 21, name: target, conclusion: "failure", startedAt: "2026-08-29T18:00:00.000Z" });
    fixture = githubPaginationFetch({ pages: [[...base.slice(1), sameStartSuccess, sameStartFailure]], totalCount: 6 });
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
      assert.equal(observation.status, "partial");
      assert.equal(observation.exactHeadChecks, null);
      assert.match(observation.failures.join("\n"), /GITHUB_MALFORMED_CHECK_RUN/u);
    }
  });

  await t.test("identical duplicate IDs deduplicate and contradictory duplicates fail closed", async () => {
    const required = requiredRuns(1);
    const firstPage = [...required, ...auxiliaryRuns(6, 95)];
    const final = checkRun({ id: 101 });
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
    const first = [...requiredRuns(), ...auxiliaryRuns(6, 95)];
    const fixture = githubPaginationFetch({ pages: [first, [checkRun({ id: 101, headSha: hex40("f") })]], totalCount: 101 });
    const observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.status, "contradictory");
    assert.match(observation.failures.join("\n"), /check-run-sha/u);
  });

  await t.test("malformed and substituted next links never leave the exact endpoint", async () => {
    const first = [...requiredRuns(), ...auxiliaryRuns(6, 95)];
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
      ["malformed", `${githubPageEndpoint(2)}; rel="next"`, "partial"],
      ["duplicate next", `<${githubPageEndpoint(2)}>; rel="next", <${githubPageEndpoint(2)}>; rel="next"`, "partial"]
    ];
    for (const [label, link, expectedStatus] of links) {
      const fixture = githubPaginationFetch({ pages: [first, [checkRun({ id: 101 })]], totalCount: 101, linkForPage: (page) => page === 1 ? link : null });
      const observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
      assert.equal(observation.status, expectedStatus, label);
      assert.equal(fixture.calls.some(({ endpoint }) => endpoint === githubPageEndpoint(2)), false, label);
    }
  });

  await t.test("missing pages, count drift, later failures and finite ceilings remain partial HOLD", async () => {
    const first = [...requiredRuns(), ...auxiliaryRuns(6, 95)];
    let fixture = githubPaginationFetch({ pages: [first], totalCount: 101, linkForPage: () => null });
    let observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.status, "partial");
    assert.match(observation.failures.join("\n"), /CHECK_RUNS_PAGE_MISSING/u);

    fixture = githubPaginationFetch({ pages: [first, [checkRun({ id: 101 })]], totalCount: (page) => page === 1 ? 101 : 102 });
    observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.status, "partial");
    assert.match(observation.failures.join("\n"), /TOTAL_DISAGREEMENT/u);

    fixture = githubPaginationFetch({
      pages: [first, [checkRun({ id: 101 })]], totalCount: 101,
      responseForPage: async (page, _endpoint, options) => page === 2
        ? new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }))
        : null
    });
    observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, timeoutMs: 5, retries: 0 });
    assert.equal(observation.status, "partial");
    assert.match(observation.failures.join("\n"), /GITHUB_TIMEOUT/u);

    fixture = githubPaginationFetch({
      pages: [first, [checkRun({ id: 101 })]], totalCount: 101,
      responseForPage: async (page) => page === 2 ? new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } }) : null
    });
    observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.status, "partial");
    assert.match(observation.failures.join("\n"), /GITHUB_RATE_LIMITED/u);

    let pageTwoAttempts = 0;
    fixture = githubPaginationFetch({
      pages: [first, [checkRun({ id: 101 })]], totalCount: 101,
      responseForPage: async (page) => {
        if (page !== 2) return null;
        pageTwoAttempts += 1;
        return pageTwoAttempts === 1 ? new Response("temporary", { status: 503 }) : null;
      }
    });
    observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 1 });
    assert.equal(observation.status, "current");
    assert.equal(pageTwoAttempts, 2);

    fixture = githubPaginationFetch({
      pages: [first, [checkRun({ id: 101 })]], totalCount: 101,
      responseForPage: async (page) => page === 2
        ? new Response("{}", { status: 200, headers: { "content-length": "300000", date: "Sat, 29 Aug 2026 17:00:00 GMT" } })
        : null
    });
    observation = await observeGitHubTruth({ candidateCommit, fetchImpl: fixture.implementation, retries: 0 });
    assert.equal(observation.status, "partial");
    assert.match(observation.failures.join("\n"), /GITHUB_RESPONSE_TOO_LARGE/u);

    fixture = githubPaginationFetch({
      pages: [first, [checkRun({ id: 101 })]], totalCount: 101,
      responseForPage: async (page, endpoint) => {
        if (page !== 2) return null;
        const body = JSON.stringify({ total_count: 101, check_runs: [checkRun({ id: 101 })] });
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
      const fixture = githubPaginationFetch({ pages: [[...required.slice(0, 4), ...auxiliaryRuns(6, 96)], [required[4]]], totalCount: 101 });
      const baseFetch = fixture.implementation;
      const fetchImpl = async (endpoint, options) => {
        if (!endpoint.endsWith("/pulls/35")) return baseFetch(endpoint, options);
        const body = JSON.stringify({ ...githubFixture(endpoint), draft });
        const response = new Response(body, { status: 200, headers: { date: "Sat, 29 Aug 2026 17:00:00 GMT" } });
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
    const response = new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } });
    const result = await observeGitHubTruth({ candidateCommit, fetchImpl: async () => response, retries: 0 });
    assert.equal(result.failures.every((failure) => failure.endsWith("GITHUB_RATE_LIMITED")), true);
  });
  await t.test("source substitution", async () => {
    const replacement = async (endpoint) => {
      const body = JSON.stringify(githubFixture(endpoint));
      const response = new Response(body, { status: 200, headers: { date: "Sat, 29 Aug 2026 17:00:00 GMT" } });
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
      assert.equal(result.status, "partial");
      assert.equal(result.pull34, null);
      assert.equal(result.failures.some((failure) => /pull34:GITHUB_MALFORMED_PR34/u.test(failure)), true);
    }
  });
  await t.test("oversize", async () => {
    const response = new Response("{}", { status: 200, headers: { "content-length": String(300_000) } });
    const result = await observeGitHubTruth({ candidateCommit, fetchImpl: async () => response, retries: 0 });
    assert.equal(result.failures.every((failure) => failure.endsWith("GITHUB_RESPONSE_TOO_LARGE")), true);
  });
  await t.test("timeout", async () => {
    const stalled = (_endpoint, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    const result = await observeGitHubTruth({ candidateCommit, fetchImpl: stalled, timeoutMs: 5, retries: 0 });
    assert.equal(result.failures.every((failure) => failure.endsWith("GITHUB_TIMEOUT")), true);
  });
});

test("one failed GitHub endpoint preserves successful projections and marks the overlay partial", async () => {
  const fixture = githubFetch();
  const partialFetch = async (endpoint, options) => endpoint.endsWith("/pulls/34")
    ? new Response("unavailable", { status: 503 })
    : fixture.implementation(endpoint, options);
  const observation = await observeGitHubTruth({ candidateCommit, fetchImpl: partialFetch, retries: 0 });
  assert.equal(observation.status, "partial");
  assert.equal(observation.freshness, "unavailable");
  assert.equal(observation.pull34, null);
  assert.equal(observation.main?.sha, EXPECTED_MAIN_COMMIT);
  assert.equal(observation.pull35?.headSha, candidateCommit);
  assert.equal(observation.exactHeadChecks?.state, "success");
  assert.equal(observation.errorCode, "GITHUB_PARTIAL_FAILURE");
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
    const substitutedBuild = parseBuildProvenance({ ...build, ...substitution });
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
    assert.equal(observation.sourceBindingMode, "build-provenance-and-output-attestation");
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
  assert.equal(unavailable.deploymentAttestationStatus, "unavailable");
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
    deploymentAttestationStatus: "verified",
    externalProviderVerificationRequired: true,
    ownerConsoleGroundingRequired: true,
    privateOwnerAuthenticationConfigured: false,
    durablePrivateStorageConfigured: false,
    realParticipantRuntimeConfigured: false,
    realProviderExecutionConfigured: false,
    productionAuthorized: false
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

function writeRawBuildOutput(outputRoot, checkoutRoot) {
  rmSync(outputRoot, { recursive: true, force: true });
  mkdirSync(path.join(outputRoot, "diagnostics"), { recursive: true });
  mkdirSync(path.join(outputRoot, "functions/index.func/apps/clover-launch-studio"), { recursive: true });
  mkdirSync(path.join(outputRoot, "static/assets"), { recursive: true });
  writeFileSync(path.join(outputRoot, "builds.json"), JSON.stringify({ target: "preview", argv: ["/usr/local/bin/node", `${checkoutRoot}/node_modules/vercel/dist/index.js`], builds: [] }));
  writeFileSync(path.join(outputRoot, "diagnostics/cli_traces.json"), JSON.stringify({ cwd: checkoutRoot, cli: `${checkoutRoot}/node_modules/vercel/dist/index.js` }));
  const configuration = { outputFileTracingRoot: checkoutRoot, repoRoot: checkoutRoot, turbopack: { root: checkoutRoot }, unrelated: "preserved" };
  writeFileSync(path.join(outputRoot, "functions/index.func/apps/clover-launch-studio/___next_launcher.cjs"), `const conf = ${JSON.stringify(configuration)};\nvar nextServer = true;\n`);
  writeFileSync(path.join(outputRoot, "static/assets/app.js"), "console.log('public-sanitized');\n");
}

test("generated preview output normalization, manifest, attestation and archive are deterministic", () => {
  const root = mkdtempSync(path.join(tmpdir(), "clover-output-attestation-"));
  const output = path.join(root, "output");
  const evidence = path.join(root, "evidence");
  try {
    const checkoutRoot = execFileSync("pwd", ["-P"], { cwd: root, encoding: "utf8" }).trim();
    writeRawBuildOutput(output, checkoutRoot);
    const first = createDeploymentAttestation({ outputRoot: output, repositoryRoot: root, evidenceDirectory: evidence, sourceProvenance: build });
    assert.equal(first.attestation.source.commit, candidateCommit);
    assert.equal(first.attestation.source.runtimeDeploymentKey, runtimeDeploymentKey);
    assert.equal(first.attestation.publicSanitized, true);
    assert.equal(first.attestation.normalization.length, 3);
    assert.equal(readFileSync(path.join(output, "builds.json"), "utf8").includes(checkoutRoot), false);
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
    const second = createDeploymentAttestation({ outputRoot: output, repositoryRoot: root, evidenceDirectory: evidence, sourceProvenance: build });
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
