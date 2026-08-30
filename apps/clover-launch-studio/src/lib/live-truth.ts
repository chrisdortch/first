import type { AttestationComparison, BuildProvenance } from "./provenance";
import type { TreeProgramSnapshot } from "./tree-program";

export const GITHUB_ORIGIN = "https://api.github.com";
export const GITHUB_REPOSITORY = "chrisdortch/first";
export const GITHUB_REPOSITORY_ID = 1_231_415_392;
export const EXPECTED_MAIN_COMMIT = "be45c4991a63e7e4ac6ca55a1e612f8bbe4fe5cb";
export const EXPECTED_STACK_A_HEAD = "fce3cbc5073f7f4a4f9cd8a51af9636f524ac8f7";
export const EXPECTED_STACK_A_BASE_COMMIT = "7d067d79bbff872846d6673b5f852518ba00fa7e";
export const EXPECTED_STACK_B_CHANGED_PATH_COUNT = 72;
export const EXPECTED_STACK_B_PATH_LIST_SHA256 = "9217479f428109ec268f8e2579e6da55abb649080306966c31d5ab62edc8a6a8";
export const EXPECTED_VERCEL_PROJECT_ID = "prj_1lfjYV2FehNxEyW9hGqNwAe7a8xZ";
export const STACK_A_BRANCH = "feature/clover-evidence-scope-firewall-launch-pin-v0.1-20260826";
export const STACK_B_BRANCH = "feature/clover-tree-command-center-launch-studio-v0.1-20260826";
export const MAX_GITHUB_RESPONSE_BYTES = 256 * 1024;
export const DEFAULT_GITHUB_TIMEOUT_MS = 4_000;
export const DEFAULT_GITHUB_RETRIES = 1;
export const GITHUB_REVALIDATE_SECONDS = 60;
export const MAX_GITHUB_CHECK_RUN_PAGES = 10;
export const MAX_GITHUB_CHECK_RUNS = 1_000;
const GITHUB_CHECK_RUNS_PER_PAGE = 100;
export const REQUIRED_EXACT_HEAD_CHECKS = Object.freeze([
  "Clover required main gate (Node 22)",
  "Clover required main gate (Node 24)",
  "Tree Command Center (Node 22)",
  "Tree Command Center (Node 24)",
  "Tree browser and accessibility"
]);

export type ObservationFreshness = "current" | "stale" | "unavailable" | "unknown";

type PublicGitHubMain = { sha: string; tree: string | null; protected: boolean; defaultBranch: string };
type PublicGitHubPull = {
  number: number;
  state: string;
  draft: boolean;
  merged: boolean;
  mergeable: boolean | null;
  headSha: string;
  headRef: string;
  headRepository: string;
  baseSha: string;
  baseRef: string;
  baseRepository: string;
  updatedAt: string;
};
type PublicCheckRun = { id: number; name: string; status: string; conclusion: string | null; startedAt: string; completedAt: string | null };
type PublicGitHubChecks = { sha: string; state: "success" | "pending" | "failure"; requiredNames: string[]; checks: PublicCheckRun[] };

export type GitHubLiveObservation = {
  sourceId: "github-public-api";
  sourceIdentity: "github:chrisdortch/first";
  evidenceClass: "public-unauthenticated-github-api";
  status: "current" | "partial" | "unavailable" | "contradictory";
  freshness: ObservationFreshness;
  observedAt: string | null;
  errorCode: string | null;
  endpoints: string[];
  main: PublicGitHubMain | null;
  pull34: PublicGitHubPull | null;
  pull35: PublicGitHubPull | null;
  exactHeadChecks: PublicGitHubChecks | null;
  failures: string[];
  unauthenticated: true;
  retriesMaximum: number;
  revalidateSeconds: 60;
};

export type DeploymentSelfObservation = {
  sourceId: "vercel-deployment-self";
  sourceIdentity: "vercel-functions-get-env" | "vercel-system-environment";
  evidenceClass: "deployment-self-observation";
  status: "current" | "unavailable" | "contradictory";
  freshness: ObservationFreshness;
  observedAt: null;
  errorCode: string | null;
  environment: "preview" | null;
  hostname: string | null;
  runtimeHostname?: string | null;
  requestHostname?: string | null;
  projectId: string | null;
  deploymentId: null;
  runtimeDeploymentKey?: string | null;
  region: string | null;
  regionStatus?: "current" | "unavailable";
  skewProtectionState?: "enabled" | "disabled" | "unavailable" | "invalid";
  gitCommitSha: string | null;
  sourceBindingMode?: "vercel-git-commit-sha-and-build-provenance" | "build-provenance-and-output-attestation";
  observationMethod?: "vercel-functions-get-env-and-request-host" | "request-bound-runtime-host" | "unavailable";
  externalProviderIdentity?: {
    evidenceClass: "external-provider-verification";
    verifiedByWebRuntime: false;
    providerDeploymentId: null;
    providerUrl: null;
    target: null;
    aliases: null;
    providerSourceSha: null;
    protectionState: null;
  };
  failures: string[];
  environmentKeysRead: string[];
};

export type CloverExternalObservation = {
  sourceId: "clover-context-gateway";
  sourceIdentity: "external-owner-console";
  evidenceClass: "external-owner-console-required";
  status: "external-owner-console-required";
  freshness: "unknown";
  observedAt: null;
  errorCode: null;
  webRuntimeConnectorInvoked: false;
  statement: "no Clover connector was invoked by the web runtime";
};

export type TruthReadiness = {
  applicationSourceValidated: true;
  treeProgramBaselineLoaded: true;
  treePreviewRuntimeObserved: boolean;
  liveGithubOverlayStatus: ObservationFreshness;
  deploymentAttestationStatus: AttestationComparison["status"];
  runtimeDeploymentIdentityStatus?: "verified" | "unavailable" | "invalid";
  externalProviderVerificationRequired?: true;
  ownerConsoleGroundingRequired: true;
  privateOwnerAuthenticationConfigured: false;
  durablePrivateStorageConfigured: false;
  realParticipantRuntimeConfigured: false;
  realProviderExecutionConfigured: false;
  productionAuthorized: false;
};

type ReconciledValue<T> = {
  value: T;
  source: string;
  observedAt: string | null;
  confidence: "exact" | "qualified" | "unavailable";
  baselineValue: unknown | null;
};

export type CurrentActionCard = {
  action: "ACCEPT SOURCE-GROUNDED TREE PREVIEW" | "HOLD";
  status: "available" | "hold";
  reason: "source-grounded-preview-ready" | "source-refresh-required";
  source: "runtime-live-truth-reconciliation";
  observedAt: string | null;
  bindings: {
    protectedMain: PublicGitHubMain | null;
    pull34: PublicGitHubPull | null;
    pull35: PublicGitHubPull | null;
    deployment: DeploymentSelfObservation;
    sourceFreshness: ObservationFreshness;
    githubObservedAt: string | null;
    deploymentObservedAt: null;
    contradictions: string[];
  };
  requiredOwnerDecision: "ACCEPT SOURCE-GROUNDED TREE PREVIEW" | "HOLD";
  authority: {
    mergeAuthorized: false;
    productionAuthorized: false;
    privateDataAuthorized: false;
    externalMessagingAuthorized: false;
    paymentAuthorized: false;
    purchaseAuthorized: false;
  };
  rollback: "retain-unmerged-pr35-and-delete-target-null-preview-in-separate-authorized-gate";
};

export type ReconciledTreeTruth = {
  protectedMain: ReconciledValue<PublicGitHubMain | null>;
  pull34: ReconciledValue<PublicGitHubPull | null>;
  pull35: ReconciledValue<PublicGitHubPull | null>;
  deployedPreview: ReconciledValue<DeploymentSelfObservation>;
  currentSourceFreshness: ReconciledValue<ObservationFreshness>;
  contradictions: ReconciledValue<string[]>;
  readiness: TruthReadiness;
  currentActionCard: CurrentActionCard;
};

type FixedFetchInit = RequestInit & { next?: { revalidate: number } };
type FixedFetch = (input: string, init?: FixedFetchInit) => Promise<Response>;
type GithubProjectionKey = "repository" | "main" | "pull34" | "pull35" | "exactHeadChecks";

const HEX_40 = /^[0-9a-f]{40}$/u;
const ALLOWED_ENVIRONMENT_KEYS = Object.freeze(["VERCEL_ENV", "VERCEL_URL", "VERCEL_PROJECT_ID", "VERCEL_DEPLOYMENT_ID", "VERCEL_REGION", "VERCEL_GIT_COMMIT_SHA", "VERCEL_SKEW_PROTECTION_ENABLED"]);
const VERCEL_HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+vercel\.app$/u;
type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;
export type RuntimeEnvironmentReader = () => RuntimeEnvironment;
export type RuntimeDeploymentKeyReader = () => string | null | undefined;

export function projectVercelRuntimeEnvironment(systemEnvironment: RuntimeEnvironment, fallbackEnvironment: RuntimeEnvironment = {}): RuntimeEnvironment {
  return Object.freeze(Object.fromEntries(ALLOWED_ENVIRONMENT_KEYS.map((key) => [
    key,
    key === "VERCEL_PROJECT_ID" ? systemEnvironment[key] ?? fallbackEnvironment[key] : systemEnvironment[key]
  ])));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`GITHUB_MALFORMED_${context}:${key}`);
  return value;
}

function nested(record: Record<string, unknown>, key: string, context: string): Record<string, unknown> {
  const value = record[key];
  if (!isRecord(value)) throw new Error(`GITHUB_MALFORMED_${context}:${key}`);
  return value;
}

function exactTimestamp(value: unknown, context: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`GITHUB_MALFORMED_${context}:timestamp`);
  return new Date(Date.parse(value)).toISOString();
}

function parseRepository(value: unknown): { defaultBranch: string } {
  if (
    !isRecord(value) ||
    requiredString(value, "full_name", "REPOSITORY") !== GITHUB_REPOSITORY ||
    value.id !== GITHUB_REPOSITORY_ID
  ) throw new Error("GITHUB_SOURCE_SUBSTITUTION:repository");
  const defaultBranch = requiredString(value, "default_branch", "REPOSITORY");
  if (defaultBranch !== "main") throw new Error("GITHUB_SOURCE_SUBSTITUTION:default-branch");
  return { defaultBranch };
}

function parseBranch(value: unknown, defaultBranch: string): PublicGitHubMain {
  if (!isRecord(value) || typeof value.protected !== "boolean") throw new Error("GITHUB_MALFORMED_MAIN");
  const commit = nested(value, "commit", "MAIN");
  const sha = requiredString(commit, "sha", "MAIN");
  if (!HEX_40.test(sha)) throw new Error("GITHUB_MALFORMED_MAIN:sha");
  const commitDetails = isRecord(commit.commit) ? commit.commit : null;
  const treeDetails = commitDetails && isRecord(commitDetails.tree) ? commitDetails.tree : null;
  const tree = treeDetails && typeof treeDetails.sha === "string" && HEX_40.test(treeDetails.sha) ? treeDetails.sha : null;
  return { sha, tree, protected: value.protected, defaultBranch };
}

function parsePull(value: unknown, expectedNumber: number): PublicGitHubPull {
  if (!isRecord(value) || value.number !== expectedNumber || typeof value.draft !== "boolean" || typeof value.merged !== "boolean" || (typeof value.mergeable !== "boolean" && value.mergeable !== null)) throw new Error(`GITHUB_MALFORMED_PR${expectedNumber}`);
  const mergedAt = value.merged_at === null ? null : exactTimestamp(value.merged_at, `PR${expectedNumber}:merged_at`);
  if (value.merged !== (mergedAt !== null)) throw new Error(`GITHUB_MALFORMED_PR${expectedNumber}:merge-state`);
  const head = nested(value, "head", `PR${expectedNumber}`);
  const base = nested(value, "base", `PR${expectedNumber}`);
  const headRepository = nested(head, "repo", `PR${expectedNumber}`);
  const baseRepository = nested(base, "repo", `PR${expectedNumber}`);
  const headRepositoryName = requiredString(headRepository, "full_name", `PR${expectedNumber}`);
  const baseRepositoryName = requiredString(baseRepository, "full_name", `PR${expectedNumber}`);
  if (headRepositoryName !== GITHUB_REPOSITORY || baseRepositoryName !== GITHUB_REPOSITORY) throw new Error(`GITHUB_SOURCE_SUBSTITUTION:pr${expectedNumber}-repository`);
  const headSha = requiredString(head, "sha", `PR${expectedNumber}`);
  const baseSha = requiredString(base, "sha", `PR${expectedNumber}`);
  if (!HEX_40.test(headSha) || !HEX_40.test(baseSha)) throw new Error(`GITHUB_MALFORMED_PR${expectedNumber}:sha`);
  return {
    number: expectedNumber,
    state: requiredString(value, "state", `PR${expectedNumber}`),
    draft: value.draft,
    merged: value.merged,
    mergeable: value.mergeable,
    headSha,
    headRef: requiredString(head, "ref", `PR${expectedNumber}`),
    headRepository: headRepositoryName,
    baseSha,
    baseRef: requiredString(base, "ref", `PR${expectedNumber}`),
    baseRepository: baseRepositoryName,
    updatedAt: exactTimestamp(value.updated_at, `PR${expectedNumber}`)
  };
}

const GITHUB_CHECK_RUN_STATUSES = new Set(["queued", "in_progress", "completed", "waiting", "requested", "pending"]);
const GITHUB_CHECK_RUN_CONCLUSIONS = new Set(["success", "failure", "neutral", "cancelled", "skipped", "timed_out", "action_required", "stale", "startup_failure"]);

function parseCheckRun(candidate: unknown, expectedSha: string): PublicCheckRun {
    if (!isRecord(candidate) || !Number.isSafeInteger(candidate.id) || Number(candidate.id) < 1) throw new Error("GITHUB_MALFORMED_CHECK_RUNS:entry");
    if (requiredString(candidate, "head_sha", "CHECK_RUN") !== expectedSha) throw new Error("GITHUB_SOURCE_SUBSTITUTION:check-run-sha");
    const status = requiredString(candidate, "status", "CHECK_RUN");
    const conclusion = candidate.conclusion;
    if (
      !GITHUB_CHECK_RUN_STATUSES.has(status) ||
      (conclusion !== null && (typeof conclusion !== "string" || !GITHUB_CHECK_RUN_CONCLUSIONS.has(conclusion))) ||
      (status === "completed" ? conclusion === null : conclusion !== null)
    ) throw new Error("GITHUB_MALFORMED_CHECK_RUNS:conclusion");
    const startedAt = exactTimestamp(candidate.started_at, "CHECK_RUN");
    const completedAt = candidate.completed_at === null ? null : exactTimestamp(candidate.completed_at, "CHECK_RUN");
    if (
      (status === "completed") !== (completedAt !== null) ||
      (completedAt !== null && completedAt < startedAt)
    ) throw new Error("GITHUB_MALFORMED_CHECK_RUNS:completion");
    return {
      id: Number(candidate.id),
      name: requiredString(candidate, "name", "CHECK_RUN"),
      status,
      conclusion,
      startedAt,
      completedAt
    };
}

function parseCheckRunsPage(value: unknown, expectedSha: string): { totalCount: number; checks: PublicCheckRun[] } {
  if (!isRecord(value) || !Number.isSafeInteger(value.total_count) || Number(value.total_count) < 0 || !Array.isArray(value.check_runs) || value.check_runs.length > GITHUB_CHECK_RUNS_PER_PAGE) {
    throw new Error("GITHUB_MALFORMED_CHECK_RUNS");
  }
  return { totalCount: Number(value.total_count), checks: value.check_runs.map((candidate) => parseCheckRun(candidate, expectedSha)) };
}

function checkRunRecency(left: PublicCheckRun, right: PublicCheckRun): number {
  return left.startedAt.localeCompare(right.startedAt) || left.id - right.id;
}

function projectCheckRuns(parsed: PublicCheckRun[], expectedSha: string): PublicGitHubChecks {
  const latestByName = new Map<string, PublicCheckRun>();
  for (const check of [...parsed].sort(checkRunRecency)) latestByName.set(check.name, check);
  const checks = [...latestByName.values()].sort((left, right) => left.name.localeCompare(right.name, "en"));
  const required = REQUIRED_EXACT_HEAD_CHECKS.map((name) => checks.find((check) => check.name === name) ?? null);
  const hasFailure = required.some((check) => check?.status === "completed" && check.conclusion !== "success");
  const allSuccessful = required.every((check) => check?.status === "completed" && check.conclusion === "success");
  return { sha: expectedSha, state: allSuccessful ? "success" : hasFailure ? "failure" : "pending", requiredNames: [...REQUIRED_EXACT_HEAD_CHECKS], checks };
}

function validSourceDate(value: string | null): string | null {
  if (!value) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function parseGithubEndpoint(endpoint: string): URL {
  let candidate: URL;
  try { candidate = new URL(endpoint); } catch { throw new Error("GITHUB_ENDPOINT_REJECTED"); }
  if (
    candidate.origin !== GITHUB_ORIGIN ||
    candidate.username ||
    candidate.password ||
    candidate.port ||
    candidate.hash ||
    candidate.pathname !== `/repos/${GITHUB_REPOSITORY}` &&
    !candidate.pathname.startsWith(`/repos/${GITHUB_REPOSITORY}/`) &&
    candidate.pathname !== `/repositories/${GITHUB_REPOSITORY_ID}` &&
    !candidate.pathname.startsWith(`/repositories/${GITHUB_REPOSITORY_ID}/`)
  ) throw new Error("GITHUB_ENDPOINT_REJECTED");
  return candidate;
}

function checkRunsPageEndpoint(candidateCommit: string, page: number): string {
  // The incomplete legacy form commits/${candidateCommit}/check-runs?per_page=100 is never requested.
  return `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/commits/${candidateCommit}/check-runs?filter=all&per_page=${GITHUB_CHECK_RUNS_PER_PAGE}&page=${page}`;
}

function parseCheckRunsPageNumber(endpoint: string, expectedSha: string): number {
  let candidate: URL;
  try { candidate = parseGithubEndpoint(endpoint); } catch { throw new Error("GITHUB_SOURCE_SUBSTITUTION:check-runs-link-origin"); }
  if (
    candidate.pathname !== `/repos/${GITHUB_REPOSITORY}/commits/${expectedSha}/check-runs` &&
    candidate.pathname !== `/repositories/${GITHUB_REPOSITORY_ID}/commits/${expectedSha}/check-runs`
  ) {
    throw new Error("GITHUB_SOURCE_SUBSTITUTION:check-runs-link-path");
  }
  const keys = [...candidate.searchParams.keys()];
  if (
    keys.length !== 3 ||
    new Set(keys).size !== 3 ||
    candidate.searchParams.getAll("filter").length !== 1 ||
    candidate.searchParams.get("filter") !== "all" ||
    candidate.searchParams.getAll("per_page").length !== 1 ||
    candidate.searchParams.get("per_page") !== String(GITHUB_CHECK_RUNS_PER_PAGE) ||
    candidate.searchParams.getAll("page").length !== 1 ||
    !/^[1-9]\d*$/u.test(candidate.searchParams.get("page") ?? "")
  ) throw new Error("GITHUB_SOURCE_SUBSTITUTION:check-runs-link-query");
  const page = Number(candidate.searchParams.get("page"));
  if (!Number.isSafeInteger(page)) throw new Error("GITHUB_SOURCE_SUBSTITUTION:check-runs-link-page");
  return page;
}

function nextCheckRunsEndpoint(link: string | null, expectedSha: string, currentPage: number, totalCount: number): string | null {
  if (link === null) return null;
  const relations = new Map<string, { endpoint: string; page: number }>();
  for (const entry of link.split(",")) {
    const match = entry.trim().match(/^<([^<>]+)>;\s*rel="(next|prev|first|last)"$/u);
    if (!match || relations.has(match[2])) throw new Error("GITHUB_MALFORMED_CHECK_RUNS_LINK");
    const endpoint = match[1];
    const page = parseCheckRunsPageNumber(endpoint, expectedSha);
    relations.set(match[2], { endpoint, page });
  }
  const first = relations.get("first");
  const previous = relations.get("prev");
  const next = relations.get("next");
  const last = relations.get("last");
  const expectedLastPage = Math.max(1, Math.ceil(totalCount / GITHUB_CHECK_RUNS_PER_PAGE));
  if (
    (first && first.page !== 1) ||
    (previous && previous.page !== currentPage - 1) ||
    (next && next.page !== currentPage + 1) ||
    (last && last.page !== expectedLastPage)
  ) {
    throw new Error("GITHUB_SOURCE_SUBSTITUTION:check-runs-link-sequence");
  }
  return next?.endpoint ?? null;
}

async function readFixedGithubJson(endpoint: string, { fetchImpl, timeoutMs, retries }: { fetchImpl: FixedFetch; timeoutMs: number; retries: number }): Promise<{ value: unknown; observedAt: string | null; link: string | null }> {
  parseGithubEndpoint(endpoint);
  let lastFailure = "GITHUB_UNAVAILABLE";
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: "GET",
        redirect: "error",
        credentials: "omit",
        cache: "force-cache",
        next: { revalidate: GITHUB_REVALIDATE_SECONDS },
        signal: controller.signal,
        headers: { Accept: "application/vnd.github+json", "User-Agent": "clover-tree-live-truth-0.2", "X-GitHub-Api-Version": "2022-11-28" }
      });
      if (response.url && response.url !== endpoint) throw new Error("GITHUB_SOURCE_SUBSTITUTION:url");
      if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") throw new Error("GITHUB_RATE_LIMITED");
      if (!response.ok) {
        lastFailure = `GITHUB_HTTP_${response.status}`;
        if (response.status < 500 || attempt === retries) throw new Error(lastFailure);
        continue;
      }
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_GITHUB_RESPONSE_BYTES) throw new Error("GITHUB_RESPONSE_TOO_LARGE");
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_GITHUB_RESPONSE_BYTES) throw new Error("GITHUB_RESPONSE_TOO_LARGE");
      let value: unknown;
      try { value = JSON.parse(text); } catch { throw new Error("GITHUB_MALFORMED_JSON"); }
      return { value, observedAt: validSourceDate(response.headers.get("date")), link: response.headers.get("link") };
    } catch (error) {
      const message = error instanceof Error ? error.message : "GITHUB_UNAVAILABLE";
      if (message === "GITHUB_RATE_LIMITED" || message.includes("SOURCE_SUBSTITUTION") || message.includes("TOO_LARGE") || message.includes("MALFORMED")) throw error;
      lastFailure = controller.signal.aborted ? "GITHUB_TIMEOUT" : message.startsWith("GITHUB_") ? message : "GITHUB_UNAVAILABLE";
      if (attempt === retries) throw new Error(lastFailure);
    } finally { clearTimeout(timer); }
  }
  throw new Error(lastFailure);
}

async function readPaginatedCheckRuns({
  candidateCommit,
  fetchImpl,
  timeoutMs,
  retries,
  endpoints,
  observedTimes
}: {
  candidateCommit: string;
  fetchImpl: FixedFetch;
  timeoutMs: number;
  retries: number;
  endpoints: string[];
  observedTimes: string[];
}): Promise<PublicGitHubChecks> {
  const byId = new Map<number, PublicCheckRun>();
  let expectedTotal: number | null = null;
  let endpoint = checkRunsPageEndpoint(candidateCommit, 1);
  for (let page = 1; page <= MAX_GITHUB_CHECK_RUN_PAGES; page += 1) {
    if (parseCheckRunsPageNumber(endpoint, candidateCommit) !== page) throw new Error("GITHUB_SOURCE_SUBSTITUTION:check-runs-page");
    endpoints.push(endpoint);
    const result = await readFixedGithubJson(endpoint, { fetchImpl, timeoutMs, retries });
    if (!result.observedAt) throw new Error("GITHUB_SOURCE_TIME_UNAVAILABLE");
    observedTimes.push(result.observedAt);
    const parsed = parseCheckRunsPage(result.value, candidateCommit);
    if (parsed.totalCount > MAX_GITHUB_CHECK_RUNS) throw new Error("GITHUB_CHECK_RUNS_CEILING_EXCEEDED");
    if (expectedTotal === null) expectedTotal = parsed.totalCount;
    else if (parsed.totalCount !== expectedTotal) throw new Error("GITHUB_CHECK_RUNS_TOTAL_DISAGREEMENT");
    for (const check of parsed.checks) {
      const prior = byId.get(check.id);
      if (prior && JSON.stringify(prior) !== JSON.stringify(check)) throw new Error("GITHUB_SOURCE_CONTRADICTION:duplicate-check-run");
      if (!prior) byId.set(check.id, check);
    }
    if (byId.size > expectedTotal) throw new Error("GITHUB_CHECK_RUNS_TOTAL_DISAGREEMENT");
    const next = nextCheckRunsEndpoint(result.link, candidateCommit, page, parsed.totalCount);
    if (byId.size === expectedTotal) {
      if (next !== null) throw new Error("GITHUB_CHECK_RUNS_UNEXPECTED_NEXT_PAGE");
      return projectCheckRuns([...byId.values()], candidateCommit);
    }
    if (next === null) throw new Error("GITHUB_CHECK_RUNS_PAGE_MISSING");
    if (page === MAX_GITHUB_CHECK_RUN_PAGES) throw new Error("GITHUB_CHECK_RUNS_CEILING_EXCEEDED");
    endpoint = next;
  }
  throw new Error("GITHUB_CHECK_RUNS_CEILING_EXCEEDED");
}

function githubEndpoints(candidateCommit: string) {
  if (!HEX_40.test(candidateCommit)) throw new Error("GITHUB_CANDIDATE_IDENTITY_REJECTED");
  return Object.freeze({
    repository: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}`,
    main: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/branches/main`,
    pull34: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/pulls/34`,
    pull35: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/pulls/35`,
    exactHeadChecks: checkRunsPageEndpoint(candidateCommit, 1)
  });
}

export async function observeGitHubTruth({ candidateCommit, fetchImpl = fetch as FixedFetch, timeoutMs = DEFAULT_GITHUB_TIMEOUT_MS, retries = DEFAULT_GITHUB_RETRIES }: { candidateCommit: string; fetchImpl?: FixedFetch; timeoutMs?: number; retries?: number }): Promise<GitHubLiveObservation> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000 || !Number.isSafeInteger(retries) || retries < 0 || retries > 1) throw new Error("GITHUB_OBSERVATION_BOUNDARY_REJECTED");
  const endpoints = githubEndpoints(candidateCommit);
  const requestedEndpoints: string[] = [];
  const checkObservedTimes: string[] = [];
  const fixedOutcomes = await Promise.all((Object.entries(endpoints) as Array<[GithubProjectionKey, string]>)
    .filter(([key]) => key !== "exactHeadChecks")
    .map(async ([key, endpoint]) => {
    requestedEndpoints.push(endpoint);
    try {
      const result = await readFixedGithubJson(endpoint, { fetchImpl, timeoutMs, retries });
      return { key, value: result.value, observedAt: result.observedAt, failure: result.observedAt ? null : `${key}:GITHUB_SOURCE_TIME_UNAVAILABLE` } as const;
    } catch (error) {
      return { key, value: null, observedAt: null, failure: `${key}:${error instanceof Error ? error.message : "GITHUB_UNAVAILABLE"}` } as const;
    }
  }));
  let checkOutcome: { key: "exactHeadChecks"; value: PublicGitHubChecks | null; observedAt: string | null; failure: string | null };
  try {
    const value = await readPaginatedCheckRuns({
      candidateCommit,
      fetchImpl,
      timeoutMs,
      retries,
      endpoints: requestedEndpoints,
      observedTimes: checkObservedTimes
    });
    checkOutcome = {
      key: "exactHeadChecks",
      value,
      observedAt: [...checkObservedTimes].sort().at(-1) ?? null,
      failure: null
    };
  } catch (error) {
    checkOutcome = {
      key: "exactHeadChecks",
      value: null,
      observedAt: [...checkObservedTimes].sort().at(-1) ?? null,
      failure: `exactHeadChecks:${error instanceof Error ? error.message : "GITHUB_UNAVAILABLE"}`
    };
  }
  const outcomes = [...fixedOutcomes, checkOutcome];
  const failures: string[] = [];
  const values = new Map<GithubProjectionKey, unknown>();
  const observedTimes: string[] = [];
  for (const outcome of outcomes) {
    if (outcome.value !== null) values.set(outcome.key, outcome.value);
    if (outcome.observedAt) observedTimes.push(outcome.observedAt);
    if (outcome.failure) failures.push(outcome.failure);
  }
  const parseProjection = <T>(key: GithubProjectionKey, parser: (value: unknown) => T): T | null => {
    if (!values.has(key)) return null;
    try { return parser(values.get(key)); } catch (error) {
      failures.push(`${key}:${error instanceof Error ? error.message : "GITHUB_MALFORMED_RESPONSE"}`);
      return null;
    }
  };
  const repository = parseProjection("repository", parseRepository);
  const main = repository ? parseProjection("main", (value) => parseBranch(value, repository.defaultBranch)) : null;
  const pull34 = parseProjection("pull34", (value) => parsePull(value, 34));
  const pull35 = parseProjection("pull35", (value) => parsePull(value, 35));
  const exactHeadChecks = parseProjection("exactHeadChecks", (value) => value as PublicGitHubChecks);
  const successfulProjectionCount = [repository, main, pull34, pull35, exactHeadChecks].filter(Boolean).length;
  const complete = successfulProjectionCount === 5 && failures.length === 0;
  const contradictory = failures.some((failure) => failure.includes("SOURCE_SUBSTITUTION") || failure.includes("SOURCE_CONTRADICTION"));
  const status = complete ? "current" : contradictory ? "contradictory" : successfulProjectionCount > 0 ? "partial" : "unavailable";
  const explicitBoundaryFailure = failures
    .map((failure) => failure.split(":").slice(1).join(":"))
    .find((failure) => failure === "GITHUB_CHECK_RUNS_CEILING_EXCEEDED");
  return {
    sourceId: "github-public-api",
    sourceIdentity: "github:chrisdortch/first",
    evidenceClass: "public-unauthenticated-github-api",
    status,
    freshness: complete ? "current" : "unavailable",
    observedAt: observedTimes.sort().at(-1) ?? null,
    errorCode: complete ? null : explicitBoundaryFailure ?? (successfulProjectionCount > 0 ? "GITHUB_PARTIAL_FAILURE" : failures[0]?.split(":").slice(1).join(":") ?? "GITHUB_UNAVAILABLE"),
    endpoints: requestedEndpoints,
    main,
    pull34,
    pull35,
    exactHeadChecks,
    failures,
    unauthenticated: true,
    retriesMaximum: retries,
    revalidateSeconds: GITHUB_REVALIDATE_SECONDS
  };
}

function readTrimmedEnvironment(env: RuntimeEnvironment, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

function normalizedEnvironmentHostname(value: string | null): string | null {
  if (!value || value.length > 253 || !VERCEL_HOSTNAME.test(value.toLowerCase())) return null;
  return value.toLowerCase();
}

function normalizedRequestHostname(requestUrl: string | null): string | null {
  if (!requestUrl || requestUrl.length > 2_048) return null;
  try {
    const candidate = new URL(requestUrl);
    if (candidate.protocol !== "https:" || candidate.username || candidate.password || candidate.port || candidate.search || candidate.hash) return null;
    const hostname = candidate.hostname.toLowerCase();
    return VERCEL_HOSTNAME.test(hostname) ? hostname : null;
  } catch {
    return null;
  }
}

function deploymentObservationStatus(failures: string[]): DeploymentSelfObservation["status"] {
  if (failures.length === 0) return "current";
  const unavailable = new Set(["deployment-environment-unavailable", "deployment-host-unavailable", "deployment-project-unavailable", "deployment-runtime-key-unavailable", "deployment-request-host-unavailable"]);
  return failures.every((failure) => unavailable.has(failure)) ? "unavailable" : "contradictory";
}

export function observeDeploymentSelf({
  build,
  environmentReader = () => process.env,
  runtimeDeploymentKeyReader = () => process.env.NEXT_DEPLOYMENT_ID,
  requestUrl = null
}: {
  build: BuildProvenance;
  environmentReader?: RuntimeEnvironmentReader;
  runtimeDeploymentKeyReader?: RuntimeDeploymentKeyReader;
  requestUrl?: string | null;
}): DeploymentSelfObservation {
  let env: RuntimeEnvironment = {};
  const failures: string[] = [];
  try {
    const candidate = environmentReader();
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) env = candidate;
    else failures.push("deployment-environment-reader-invalid");
  } catch {
    failures.push("deployment-environment-reader-unavailable");
  }
  const environment = readTrimmedEnvironment(env, "VERCEL_ENV");
  const environmentHostnameValue = readTrimmedEnvironment(env, "VERCEL_URL");
  const environmentHostname = normalizedEnvironmentHostname(environmentHostnameValue);
  const requestHostname = normalizedRequestHostname(requestUrl);
  const projectId = readTrimmedEnvironment(env, "VERCEL_PROJECT_ID");
  readTrimmedEnvironment(env, "VERCEL_DEPLOYMENT_ID");
  const region = readTrimmedEnvironment(env, "VERCEL_REGION");
  const gitCommitSha = readTrimmedEnvironment(env, "VERCEL_GIT_COMMIT_SHA");
  const skewProtection = readTrimmedEnvironment(env, "VERCEL_SKEW_PROTECTION_ENABLED");
  let runtimeDeploymentKey: string | null = null;
  try {
    const candidate = runtimeDeploymentKeyReader();
    if (candidate !== null && candidate !== undefined && typeof candidate !== "string") failures.push("deployment-runtime-key-reader-invalid");
    else runtimeDeploymentKey = candidate?.trim() || null;
  } catch {
    failures.push("deployment-runtime-key-reader-unavailable");
  }
  if (!environment) failures.push("deployment-environment-unavailable");
  else if (environment !== "preview") failures.push("deployment-not-preview");
  if (environmentHostnameValue && !environmentHostname) failures.push("deployment-host-invalid");
  if (!requestUrl) failures.push("deployment-request-host-unavailable");
  else if (!requestHostname) failures.push("deployment-request-host-invalid");
  if (!environmentHostname && !requestHostname) failures.push("deployment-host-unavailable");
  if (environmentHostname && requestHostname && environmentHostname !== requestHostname) failures.push("deployment-request-host-substitution");
  if (!projectId) failures.push("deployment-project-unavailable");
  else if (projectId !== EXPECTED_VERCEL_PROJECT_ID) failures.push("deployment-project-identity");
  if (!runtimeDeploymentKey) failures.push("deployment-runtime-key-unavailable");
  else if (runtimeDeploymentKey !== build.runtimeDeploymentKey || !/^clover-[0-9a-f]{24}$/u.test(runtimeDeploymentKey)) failures.push("deployment-runtime-key-identity");
  if (gitCommitSha && (!HEX_40.test(gitCommitSha) || gitCommitSha !== build.commit)) failures.push("deployment-source-identity");
  if (region && !/^[a-z0-9]{3,16}$/u.test(region)) failures.push("deployment-region-invalid");
  if (skewProtection !== null && skewProtection !== "0" && skewProtection !== "1") failures.push("deployment-skew-protection-invalid");
  const hostname = environmentHostname ?? requestHostname;
  const status = deploymentObservationStatus(failures);
  return {
    sourceId: "vercel-deployment-self",
    sourceIdentity: "vercel-functions-get-env",
    evidenceClass: "deployment-self-observation",
    status,
    freshness: status === "current" ? "current" : "unavailable",
    observedAt: null,
    errorCode: failures[0] ?? null,
    environment: environment === "preview" ? "preview" : null,
    hostname,
    runtimeHostname: hostname,
    requestHostname,
    projectId,
    deploymentId: null,
    runtimeDeploymentKey,
    region,
    regionStatus: region && /^[a-z0-9]{3,16}$/u.test(region) ? "current" : "unavailable",
    skewProtectionState: skewProtection === "1" ? "enabled" : skewProtection === "0" ? "disabled" : skewProtection === null ? "unavailable" : "invalid",
    gitCommitSha,
    sourceBindingMode: gitCommitSha ? "vercel-git-commit-sha-and-build-provenance" : "build-provenance-and-output-attestation",
    observationMethod: environmentHostname ? "vercel-functions-get-env-and-request-host" : requestHostname ? "request-bound-runtime-host" : "unavailable",
    externalProviderIdentity: {
      evidenceClass: "external-provider-verification",
      verifiedByWebRuntime: false,
      providerDeploymentId: null,
      providerUrl: null,
      target: null,
      aliases: null,
      providerSourceSha: null,
      protectionState: null
    },
    failures,
    environmentKeysRead: [...ALLOWED_ENVIRONMENT_KEYS]
  };
}

export const CLOVER_EXTERNAL_OBSERVATION: CloverExternalObservation = Object.freeze({
  sourceId: "clover-context-gateway",
  sourceIdentity: "external-owner-console",
  evidenceClass: "external-owner-console-required",
  status: "external-owner-console-required",
  freshness: "unknown",
  observedAt: null,
  errorCode: null,
  webRuntimeConnectorInvoked: false,
  statement: "no Clover connector was invoked by the web runtime"
});

function githubContradictions(github: GitHubLiveObservation, build: BuildProvenance): string[] {
  const contradictions: string[] = [];
  if (github.status !== "current") contradictions.push("github-live-observation-unavailable");
  if (github.main?.sha !== EXPECTED_MAIN_COMMIT || github.main.protected !== true || github.main.defaultBranch !== "main") contradictions.push("protected-main-identity");
  if (github.pull34?.headSha !== EXPECTED_STACK_A_HEAD || github.pull34.headRef !== STACK_A_BRANCH || github.pull34.baseSha !== EXPECTED_STACK_A_BASE_COMMIT || github.pull34.baseRef !== "main" || github.pull34.headRepository !== GITHUB_REPOSITORY || github.pull34.baseRepository !== GITHUB_REPOSITORY || github.pull34.state !== "closed" || github.pull34.draft || !github.pull34.merged) contradictions.push("stack-a-pull-request");
  if (github.pull35?.headSha !== build.commit || github.pull35.headRef !== STACK_B_BRANCH || github.pull35.baseSha !== EXPECTED_MAIN_COMMIT || github.pull35.baseRef !== "main" || github.pull35.headRepository !== GITHUB_REPOSITORY || github.pull35.baseRepository !== GITHUB_REPOSITORY || github.pull35.state !== "open" || github.pull35.merged || !github.pull35.mergeable) contradictions.push("stack-b-pull-request");
  if (build.stackABase !== EXPECTED_MAIN_COMMIT || build.changedPathCount !== EXPECTED_STACK_B_CHANGED_PATH_COUNT || build.pathListSha256 !== EXPECTED_STACK_B_PATH_LIST_SHA256) contradictions.push("stack-b-source-provenance");
  if (github.exactHeadChecks?.sha !== build.commit || github.exactHeadChecks.state !== "success") contradictions.push("exact-head-checks");
  return contradictions;
}

function deploymentContradictions(deployment: DeploymentSelfObservation, build: BuildProvenance): string[] {
  if (deployment.status === "current" && deployment.runtimeDeploymentKey === build.runtimeDeploymentKey) return [];
  return deployment.failures.length ? deployment.failures : ["deployment-self-unavailable"];
}

export function computeTruthReadiness({ github, deployment, attestation }: { github: GitHubLiveObservation; deployment: DeploymentSelfObservation; attestation: AttestationComparison }, _build: BuildProvenance): TruthReadiness {
  return {
    applicationSourceValidated: _build.cleanWorktree,
    treeProgramBaselineLoaded: true,
    treePreviewRuntimeObserved: deployment.status === "current",
    runtimeDeploymentIdentityStatus: deployment.status === "current" && deployment.runtimeDeploymentKey === _build.runtimeDeploymentKey ? "verified" : deployment.status === "contradictory" ? "invalid" : "unavailable",
    liveGithubOverlayStatus: github.status === "current" ? "current" : "unavailable",
    deploymentAttestationStatus: attestation.status,
    externalProviderVerificationRequired: true,
    ownerConsoleGroundingRequired: true,
    privateOwnerAuthenticationConfigured: false,
    durablePrivateStorageConfigured: false,
    realParticipantRuntimeConfigured: false,
    realProviderExecutionConfigured: false,
    productionAuthorized: false
  };
}

function readinessAllowsAcceptance(readiness: TruthReadiness, contradictions: string[]): boolean {
  return readiness.applicationSourceValidated && readiness.treeProgramBaselineLoaded && readiness.treePreviewRuntimeObserved && readiness.runtimeDeploymentIdentityStatus === "verified" && readiness.liveGithubOverlayStatus === "current" && readiness.deploymentAttestationStatus === "verified" && readiness.externalProviderVerificationRequired === true && contradictions.length === 0;
}

export function currentActionCard({ readiness, github, deployment, contradictions }: { readiness: TruthReadiness; github: GitHubLiveObservation; deployment: DeploymentSelfObservation; contradictions: string[] }): CurrentActionCard {
  const available = readinessAllowsAcceptance(readiness, contradictions);
  const action = available ? "ACCEPT SOURCE-GROUNDED TREE PREVIEW" : "HOLD";
  return {
    action,
    status: available ? "available" : "hold",
    reason: available ? "source-grounded-preview-ready" : "source-refresh-required",
    source: "runtime-live-truth-reconciliation",
    observedAt: github.observedAt,
    bindings: {
      protectedMain: github.main,
      pull34: github.pull34,
      pull35: github.pull35,
      deployment,
      sourceFreshness: github.freshness,
      githubObservedAt: github.observedAt,
      deploymentObservedAt: null,
      contradictions
    },
    requiredOwnerDecision: action,
    authority: { mergeAuthorized: false, productionAuthorized: false, privateDataAuthorized: false, externalMessagingAuthorized: false, paymentAuthorized: false, purchaseAuthorized: false },
    rollback: "retain-unmerged-pr35-and-delete-target-null-preview-in-separate-authorized-gate"
  };
}

function detailValue(baseline: TreeProgramSnapshot, recordId: string, detailKey: string): string | null {
  return baseline.status.find((record) => record.recordId === recordId)?.details.find(({ key }) => key === detailKey)?.value ?? null;
}

export function baselineObservationTime(baseline: TreeProgramSnapshot): string {
  return baseline.status.flatMap(({ sourceRefs }) => sourceRefs).map(({ observedAt }) => observedAt).sort()[0] ?? baseline.index.observedAt;
}

export function reconcileTreeTruth({ baseline, build, github, deployment, attestation }: { baseline: TreeProgramSnapshot; build: BuildProvenance; github: GitHubLiveObservation; deployment: DeploymentSelfObservation; attestation: AttestationComparison }): ReconciledTreeTruth {
  const contradictions = [...githubContradictions(github, build), ...deploymentContradictions(deployment, build)];
  if (attestation.status !== "verified" || !attestation.consistent) contradictions.push(...attestation.differences);
  const uniqueContradictions = [...new Set(contradictions)];
  const readiness = computeTruthReadiness({ github, deployment, attestation }, build);
  const baselineMain = detailValue(baseline, "status:main", "head");
  const currentMain = github.main?.sha ?? null;
  const confidence = github.status === "current" ? "exact" : github.main ? "qualified" : "unavailable";
  return {
    protectedMain: { value: github.main, source: github.sourceIdentity, observedAt: github.observedAt, confidence, baselineValue: currentMain !== baselineMain ? baselineMain : null },
    pull34: { value: github.pull34, source: github.sourceIdentity, observedAt: github.observedAt, confidence: github.pull34 ? confidence : "unavailable", baselineValue: baseline.status.find(({ recordId }) => recordId === "status:stack-a")?.summary ?? null },
    pull35: { value: github.pull35, source: github.sourceIdentity, observedAt: github.observedAt, confidence: github.pull35 ? confidence : "unavailable", baselineValue: baseline.status.find(({ recordId }) => recordId === "status:stack-b")?.summary ?? null },
    deployedPreview: { value: deployment, source: deployment.sourceIdentity, observedAt: deployment.observedAt, confidence: deployment.status === "current" ? "exact" : "unavailable", baselineValue: "preview not yet created" },
    currentSourceFreshness: { value: github.freshness, source: github.sourceIdentity, observedAt: github.observedAt, confidence, baselineValue: "immutable baseline source freshness was dated at issuance" },
    contradictions: { value: uniqueContradictions, source: "runtime-live-truth-reconciliation", observedAt: github.observedAt, confidence: uniqueContradictions.length === 0 ? "exact" : "qualified", baselineValue: [] },
    readiness,
    currentActionCard: currentActionCard({ readiness, github, deployment, contradictions: uniqueContradictions })
  };
}

export const NO_ATTESTATION_COMPARISON: AttestationComparison = Object.freeze({ status: "unavailable", consistent: false, differences: ["same-origin-attestation-browser-readback-required"], attestationHash: null, outputManifestRootSha256: null });
export const READ_ONLY_AUTHORITY = Object.freeze({ publicMetadataObserved: true, sourceMutationAuthorized: false, mergeAuthorized: false, productionAuthorized: false, privateDataAuthorized: false, externalMessagingAuthorized: false, paymentAuthorized: false, purchaseAuthorized: false });
