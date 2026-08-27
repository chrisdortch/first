import type { AttestationComparison, BuildProvenance } from "./provenance";
import type { TreeProgramSnapshot } from "./tree-program";

export const GITHUB_ORIGIN = "https://api.github.com";
export const GITHUB_REPOSITORY = "chrisdortch/first";
export const EXPECTED_MAIN_COMMIT = "7d067d79bbff872846d6673b5f852518ba00fa7e";
export const EXPECTED_STACK_A_HEAD = "ec4ad8ca76dd5fd6da7db8107829a07c3650b7c6";
export const STACK_A_BRANCH = "feature/clover-evidence-scope-firewall-launch-pin-v0.1-20260826";
export const STACK_B_BRANCH = "feature/clover-tree-command-center-launch-studio-v0.1-20260826";
export const MAX_GITHUB_RESPONSE_BYTES = 256 * 1024;
export const DEFAULT_GITHUB_TIMEOUT_MS = 4_000;
export const DEFAULT_GITHUB_RETRIES = 1;
export const GITHUB_REVALIDATE_SECONDS = 60;
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
  mergeable: boolean;
  headSha: string;
  headRef: string;
  headRepository: string;
  baseSha: string;
  baseRef: string;
  baseRepository: string;
  updatedAt: string;
};
type PublicCheckRun = { id: number; name: string; status: string; conclusion: string | null; startedAt: string | null; completedAt: string | null };
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
  sourceIdentity: "vercel-system-environment";
  evidenceClass: "deployment-self-observation";
  status: "current" | "unavailable" | "contradictory";
  freshness: ObservationFreshness;
  observedAt: null;
  errorCode: string | null;
  environment: "preview" | null;
  hostname: string | null;
  projectId: string | null;
  deploymentId: string | null;
  region: string | null;
  gitCommitSha: string | null;
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
  rollback: "retain-draft-prs-and-delete-target-null-preview-in-separate-authorized-gate";
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
const ALLOWED_ENVIRONMENT_KEYS = Object.freeze(["VERCEL_ENV", "VERCEL_URL", "VERCEL_PROJECT_ID", "VERCEL_DEPLOYMENT_ID", "VERCEL_REGION", "VERCEL_GIT_COMMIT_SHA"]);

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
  if (!isRecord(value) || requiredString(value, "full_name", "REPOSITORY") !== GITHUB_REPOSITORY) throw new Error("GITHUB_SOURCE_SUBSTITUTION:repository");
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
  if (!isRecord(value) || value.number !== expectedNumber || typeof value.draft !== "boolean" || typeof value.mergeable !== "boolean") throw new Error(`GITHUB_MALFORMED_PR${expectedNumber}`);
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
    merged: value.merged === true || typeof value.merged_at === "string",
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

function parseCheckRuns(value: unknown, expectedSha: string): PublicGitHubChecks {
  if (!isRecord(value) || !Number.isSafeInteger(value.total_count) || !Array.isArray(value.check_runs) || Number(value.total_count) > value.check_runs.length) throw new Error("GITHUB_MALFORMED_CHECK_RUNS");
  const parsed = value.check_runs.map((candidate): PublicCheckRun => {
    if (!isRecord(candidate) || !Number.isSafeInteger(candidate.id)) throw new Error("GITHUB_MALFORMED_CHECK_RUNS:entry");
    if (requiredString(candidate, "head_sha", "CHECK_RUN") !== expectedSha) throw new Error("GITHUB_SOURCE_SUBSTITUTION:check-run-sha");
    const conclusion = candidate.conclusion;
    if (conclusion !== null && typeof conclusion !== "string") throw new Error("GITHUB_MALFORMED_CHECK_RUNS:conclusion");
    return {
      id: Number(candidate.id),
      name: requiredString(candidate, "name", "CHECK_RUN"),
      status: requiredString(candidate, "status", "CHECK_RUN"),
      conclusion,
      startedAt: candidate.started_at === null ? null : exactTimestamp(candidate.started_at, "CHECK_RUN"),
      completedAt: candidate.completed_at === null ? null : exactTimestamp(candidate.completed_at, "CHECK_RUN")
    };
  });
  const latestByName = new Map<string, PublicCheckRun>();
  for (const check of parsed.sort((left, right) => {
    const timeOrder = (left.completedAt ?? left.startedAt ?? "").localeCompare(right.completedAt ?? right.startedAt ?? "");
    return timeOrder || left.id - right.id;
  })) latestByName.set(check.name, check);
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

async function readFixedGithubJson(endpoint: string, { fetchImpl, timeoutMs, retries }: { fetchImpl: FixedFetch; timeoutMs: number; retries: number }): Promise<{ value: unknown; observedAt: string | null }> {
  if (!endpoint.startsWith(`${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}`)) throw new Error("GITHUB_ENDPOINT_REJECTED");
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
      return { value, observedAt: validSourceDate(response.headers.get("date")) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "GITHUB_UNAVAILABLE";
      if (message === "GITHUB_RATE_LIMITED" || message.includes("SOURCE_SUBSTITUTION") || message.includes("TOO_LARGE") || message.includes("MALFORMED")) throw error;
      lastFailure = controller.signal.aborted ? "GITHUB_TIMEOUT" : message.startsWith("GITHUB_") ? message : "GITHUB_UNAVAILABLE";
      if (attempt === retries) throw new Error(lastFailure);
    } finally { clearTimeout(timer); }
  }
  throw new Error(lastFailure);
}

function githubEndpoints(candidateCommit: string) {
  if (!HEX_40.test(candidateCommit)) throw new Error("GITHUB_CANDIDATE_IDENTITY_REJECTED");
  return Object.freeze({
    repository: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}`,
    main: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/branches/main`,
    pull34: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/pulls/34`,
    pull35: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/pulls/35`,
    exactHeadChecks: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/commits/${candidateCommit}/check-runs?per_page=100`
  });
}

export async function observeGitHubTruth({ candidateCommit, fetchImpl = fetch as FixedFetch, timeoutMs = DEFAULT_GITHUB_TIMEOUT_MS, retries = DEFAULT_GITHUB_RETRIES }: { candidateCommit: string; fetchImpl?: FixedFetch; timeoutMs?: number; retries?: number }): Promise<GitHubLiveObservation> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000 || !Number.isSafeInteger(retries) || retries < 0 || retries > 1) throw new Error("GITHUB_OBSERVATION_BOUNDARY_REJECTED");
  const endpoints = githubEndpoints(candidateCommit);
  const outcomes = await Promise.all((Object.entries(endpoints) as Array<[GithubProjectionKey, string]>).map(async ([key, endpoint]) => {
    try {
      const result = await readFixedGithubJson(endpoint, { fetchImpl, timeoutMs, retries });
      return { key, value: result.value, observedAt: result.observedAt, failure: result.observedAt ? null : `${key}:GITHUB_SOURCE_TIME_UNAVAILABLE` } as const;
    } catch (error) {
      return { key, value: null, observedAt: null, failure: `${key}:${error instanceof Error ? error.message : "GITHUB_UNAVAILABLE"}` } as const;
    }
  }));
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
  const exactHeadChecks = parseProjection("exactHeadChecks", (value) => parseCheckRuns(value, candidateCommit));
  const successfulProjectionCount = [repository, main, pull34, pull35, exactHeadChecks].filter(Boolean).length;
  const complete = successfulProjectionCount === 5 && failures.length === 0;
  const contradictory = failures.some((failure) => failure.includes("SOURCE_SUBSTITUTION"));
  const status = complete ? "current" : contradictory ? "contradictory" : successfulProjectionCount > 0 ? "partial" : "unavailable";
  return {
    sourceId: "github-public-api",
    sourceIdentity: "github:chrisdortch/first",
    evidenceClass: "public-unauthenticated-github-api",
    status,
    freshness: complete ? "current" : "unavailable",
    observedAt: observedTimes.sort().at(-1) ?? null,
    errorCode: complete ? null : successfulProjectionCount > 0 ? "GITHUB_PARTIAL_FAILURE" : failures[0]?.split(":").slice(1).join(":") ?? "GITHUB_UNAVAILABLE",
    endpoints: Object.values(endpoints),
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

function readTrimmedEnvironment(env: NodeJS.ProcessEnv, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

export function observeDeploymentSelf(env: NodeJS.ProcessEnv = process.env): DeploymentSelfObservation {
  const environment = readTrimmedEnvironment(env, "VERCEL_ENV");
  const hostname = readTrimmedEnvironment(env, "VERCEL_URL");
  const projectId = readTrimmedEnvironment(env, "VERCEL_PROJECT_ID");
  const deploymentId = readTrimmedEnvironment(env, "VERCEL_DEPLOYMENT_ID");
  const region = readTrimmedEnvironment(env, "VERCEL_REGION");
  const gitCommitSha = readTrimmedEnvironment(env, "VERCEL_GIT_COMMIT_SHA");
  const failures: string[] = [];
  if (environment !== "preview") failures.push("deployment-not-preview");
  if (!hostname || !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?\.vercel\.app$/u.test(hostname)) failures.push("deployment-host-unavailable");
  if (!projectId || !/^prj_[A-Za-z0-9]+$/u.test(projectId)) failures.push("deployment-project-unavailable");
  if (!deploymentId || !/^dpl_[A-Za-z0-9]+$/u.test(deploymentId)) failures.push("deployment-id-unavailable");
  if (!gitCommitSha || !HEX_40.test(gitCommitSha)) failures.push("deployment-source-unavailable");
  return {
    sourceId: "vercel-deployment-self",
    sourceIdentity: "vercel-system-environment",
    evidenceClass: "deployment-self-observation",
    status: failures.length === 0 ? "current" : "unavailable",
    freshness: failures.length === 0 ? "unknown" : "unavailable",
    observedAt: null,
    errorCode: failures[0] ?? null,
    environment: environment === "preview" ? "preview" : null,
    hostname,
    projectId,
    deploymentId,
    region,
    gitCommitSha,
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
  if (github.pull34?.headSha !== EXPECTED_STACK_A_HEAD || github.pull34.headRef !== STACK_A_BRANCH || github.pull34.baseRef !== "main" || github.pull34.headRepository !== GITHUB_REPOSITORY || github.pull34.baseRepository !== GITHUB_REPOSITORY || github.pull34.state !== "open" || !github.pull34.draft || github.pull34.merged || !github.pull34.mergeable) contradictions.push("stack-a-pull-request");
  if (github.pull35?.headSha !== build.commit || github.pull35.headRef !== STACK_B_BRANCH || github.pull35.baseSha !== EXPECTED_STACK_A_HEAD || github.pull35.baseRef !== STACK_A_BRANCH || github.pull35.headRepository !== GITHUB_REPOSITORY || github.pull35.baseRepository !== GITHUB_REPOSITORY || github.pull35.state !== "open" || !github.pull35.draft || github.pull35.merged || !github.pull35.mergeable) contradictions.push("stack-b-pull-request");
  if (github.exactHeadChecks?.sha !== build.commit || github.exactHeadChecks.state !== "success") contradictions.push("exact-head-checks");
  return contradictions;
}

function deploymentContradictions(deployment: DeploymentSelfObservation, build: BuildProvenance): string[] {
  const contradictions: string[] = [];
  if (deployment.status !== "current") contradictions.push("deployment-self-unavailable");
  if (deployment.gitCommitSha !== build.commit) contradictions.push("deployment-source-identity");
  return contradictions;
}

export function computeTruthReadiness({ github, deployment, attestation }: { github: GitHubLiveObservation; deployment: DeploymentSelfObservation; attestation: AttestationComparison }, _build: BuildProvenance): TruthReadiness {
  return {
    applicationSourceValidated: _build.cleanWorktree,
    treeProgramBaselineLoaded: true,
    treePreviewRuntimeObserved: deployment.status === "current",
    liveGithubOverlayStatus: github.status === "current" ? "current" : "unavailable",
    deploymentAttestationStatus: attestation.status,
    ownerConsoleGroundingRequired: true,
    privateOwnerAuthenticationConfigured: false,
    durablePrivateStorageConfigured: false,
    realParticipantRuntimeConfigured: false,
    realProviderExecutionConfigured: false,
    productionAuthorized: false
  };
}

function readinessAllowsAcceptance(readiness: TruthReadiness, contradictions: string[]): boolean {
  return readiness.applicationSourceValidated && readiness.treeProgramBaselineLoaded && readiness.treePreviewRuntimeObserved && readiness.liveGithubOverlayStatus === "current" && readiness.deploymentAttestationStatus === "verified" && contradictions.length === 0;
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
    rollback: "retain-draft-prs-and-delete-target-null-preview-in-separate-authorized-gate"
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
