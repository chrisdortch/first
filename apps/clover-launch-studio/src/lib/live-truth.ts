import type { AttestationComparison, BuildProvenance } from "./provenance";
import type { TreeProgramSnapshot } from "./tree-program";

export const GITHUB_ORIGIN = "https://api.github.com";
export const GITHUB_REPOSITORY = "chrisdortch/first";
export const GITHUB_REPOSITORY_ID = 1_231_415_392;
export const EXPECTED_MAIN_COMMIT = "be45c4991a63e7e4ac6ca55a1e612f8bbe4fe5cb";
export const EXPECTED_MAIN_TREE = "d0ac615a9f038c62fa6c0b1296312920b0dceb4d";
export const EXPECTED_MAIN_RULESET_ID = 21_254_086;
export const EXPECTED_GITHUB_ACTIONS_APP_ID = 15_368;
export const EXPECTED_GITHUB_ACTIONS_APP_SLUG = "github-actions";
export const EXPECTED_MASTER_WORKFLOW_ID = 336_250_950;
export const EXPECTED_MASTER_WORKFLOW_NAME = "Validate Clover master plan";
export const EXPECTED_MASTER_WORKFLOW_PATH = ".github/workflows/validate-clover-master-plan.yml";
export const EXPECTED_GITHUB_WORKFLOWS = Object.freeze([
  Object.freeze({
    id: 340_621_409,
    name: "Clover Required Main Gate",
    path: ".github/workflows/clover-required-main-gate.yml",
    requiredChecks: Object.freeze(["Clover required main gate (Node 22)", "Clover required main gate (Node 24)"])
  }),
  Object.freeze({
    id: 343_258_370,
    name: "Validate Clover Tree Command Center",
    path: ".github/workflows/validate-clover-tree-command-center.yml",
    requiredChecks: Object.freeze(["Tree Command Center (Node 22)", "Tree Command Center (Node 24)", "Tree browser and accessibility"])
  }),
  Object.freeze({
    id: 337_384_992,
    name: "Validate Clover Core Candidate",
    path: ".github/workflows/validate-clover-core-candidate.yml",
    requiredChecks: Object.freeze(["Boundary and schema validation (22)", "Boundary and schema validation (24)"])
  }),
  Object.freeze({
    id: EXPECTED_MASTER_WORKFLOW_ID,
    name: EXPECTED_MASTER_WORKFLOW_NAME,
    path: EXPECTED_MASTER_WORKFLOW_PATH,
    requiredChecks: Object.freeze(["validate"])
  })
]);
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
export const GITHUB_REVALIDATE_SECONDS = 20 * 60;
export const GITHUB_CACHE_REVALIDATE_SECONDS = Math.floor(GITHUB_REVALIDATE_SECONDS * 3 / 4);
export const GITHUB_FAILURE_RETRY_SECONDS = GITHUB_CACHE_REVALIDATE_SECONDS;
export const GITHUB_LIVE_OBSERVATION_DEADLINE_MS = 12_000;
export const GITHUB_RETRY_BACKOFF_MS = 250;
export const GITHUB_FRESHNESS_CONTRACT = Object.freeze({
  revalidate: GITHUB_REVALIDATE_SECONDS,
  cacheRevalidate: GITHUB_CACHE_REVALIDATE_SECONDS,
  failureRetry: GITHUB_FAILURE_RETRY_SECONDS
});
export const MAX_GITHUB_CHECK_RUN_PAGES = 10;
export const MAX_GITHUB_CHECK_RUNS = 1_000;
export const MAX_GITHUB_WORKFLOW_RUNS = 100;
const GITHUB_CHECK_RUNS_PER_PAGE = 100;
export const REQUIRED_EXACT_HEAD_CHECKS = Object.freeze(EXPECTED_GITHUB_WORKFLOWS.flatMap(({ requiredChecks }) => requiredChecks));

export function parseJsonWithoutDuplicateKeys(source: string): unknown {
  let offset = 0;
  const reject = (): never => { throw new Error("duplicate-or-malformed-json"); };
  const whitespace = () => { while (/[\u0009\u000a\u000d\u0020]/u.test(source[offset] ?? "")) offset += 1; };
  const parseString = (): string => {
    if (source[offset] !== '"') return reject();
    const start = offset;
    offset += 1;
    while (offset < source.length) {
      const character = source[offset];
      if (character.charCodeAt(0) < 0x20) return reject();
      if (character === '"') {
        offset += 1;
        try { return JSON.parse(source.slice(start, offset)) as string; } catch { return reject(); }
      }
      if (character === "\\") {
        offset += 2;
        continue;
      }
      offset += 1;
    }
    return reject();
  };
  const parseValue = (): unknown => {
    whitespace();
    const character = source[offset];
    if (character === '"') return parseString();
    if (character === "{") {
      offset += 1;
      whitespace();
      const object = Object.create(null) as Record<string, unknown>;
      const seen = new Set<string>();
      if (source[offset] === "}") { offset += 1; return object; }
      while (offset < source.length) {
        const key = parseString();
        if (seen.has(key)) return reject();
        seen.add(key);
        whitespace();
        if (source[offset] !== ":") return reject();
        offset += 1;
        object[key] = parseValue();
        whitespace();
        if (source[offset] === "}") { offset += 1; return object; }
        if (source[offset] !== ",") return reject();
        offset += 1;
        whitespace();
      }
      return reject();
    }
    if (character === "[") {
      offset += 1;
      whitespace();
      const array: unknown[] = [];
      if (source[offset] === "]") { offset += 1; return array; }
      while (offset < source.length) {
        array.push(parseValue());
        whitespace();
        if (source[offset] === "]") { offset += 1; return array; }
        if (source[offset] !== ",") return reject();
        offset += 1;
      }
      return reject();
    }
    for (const [literal, value] of [["true", true], ["false", false], ["null", null]] as const) {
      if (source.startsWith(literal, offset)) { offset += literal.length; return value; }
    }
    const number = source.slice(offset).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u)?.[0];
    if (!number) return reject();
    offset += number.length;
    const value = Number(number);
    return Number.isFinite(value) ? value : reject();
  };
  const value = parseValue();
  whitespace();
  if (offset !== source.length) return reject();
  return value;
}

export type ObservationFreshness = "current" | "stale" | "unavailable" | "unknown";

type PublicGitHubMain = { sha: string; tree: string | null; protected: boolean; defaultBranch: string };
type PublicGitHubRepository = { id: number; fullName: string; defaultBranch: "main" };
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
type PublicCheckRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string;
  completedAt: string | null;
  appId: number | null;
  appSlug: string | null;
  detailsUrl: string | null;
};
type PublicWorkflowRun = {
  id: number;
  workflowId: number;
  name: string;
  path: string;
  event: string;
  headSha: string;
  headBranch: string;
  status: string;
  conclusion: string | null;
  runAttempt: number;
  runStartedAt: string;
  createdAt: string;
  updatedAt: string;
  apiUrl: string;
  htmlUrl: string;
  workflowUrl: string;
  repositoryId: number;
  repository: string;
  headRepositoryId: number;
  headRepository: string;
  pullRequestNumber: number;
  pullRequestUrl: string;
  pullHeadSha: string;
  pullHeadRef: string;
  pullHeadRepositoryId: number;
  pullHeadRepository: string;
  pullBaseSha: string;
  pullBaseRef: string;
  pullBaseRepositoryId: number;
  pullBaseRepository: string;
};
type PublicGitHubChecks = {
  sha: string;
  state: "success" | "pending" | "failure";
  requiredNames: string[];
  workflowRuns: PublicWorkflowRun[];
  checks: PublicCheckRun[];
};
type PublicGitHubRuleset = {
  id: number;
  name: string;
  target: "branch";
  sourceType: "Repository";
  source: string;
  enforcement: "active";
  include: string[];
  exclude: string[];
  bypassActorCount: number | null;
  bypassActorsStatus: "verified" | "external-verification-required";
  deletionProtected: boolean;
  nonFastForwardProtected: boolean;
  requiredApprovingReviewCount: number;
  dismissStaleReviewsOnPush: boolean;
  requiredReviewerCount: number;
  requireCodeOwnerReview: boolean;
  requireLastPushApproval: boolean;
  requiredReviewThreadResolution: boolean;
  requireExtraApprovalForUnattributedChanges: boolean;
  allowedMergeMethods: string[];
  requiredStatusChecksStrict: boolean;
  requiredStatusChecksOnCreate: boolean;
  requiredStatusChecks: Array<{ context: string; integrationId: number }>;
};

export type GitHubLiveObservation = {
  sourceId: "github-public-api";
  sourceIdentity: "github:chrisdortch/first";
  evidenceClass: "public-unauthenticated-github-api";
  status: "current" | "partial" | "unavailable" | "contradictory";
  candidateSha: string;
  evidenceCompleteness: "complete" | "partial" | "none" | "invalid";
  exactHeadCheckStatus: "success" | "pending" | "failure" | "partial" | "unavailable" | "invalid";
  checkPagesObserved: number;
  missingEvidence: string[];
  freshness: ObservationFreshness;
  observedAt: string | null;
  errorCode: string | null;
  endpoints: string[];
  repository: PublicGitHubRepository | null;
  main: PublicGitHubMain | null;
  pull34: PublicGitHubPull | null;
  pull35: PublicGitHubPull | null;
  ruleset: PublicGitHubRuleset | null;
  exactHeadChecks: PublicGitHubChecks | null;
  failures: string[];
  unauthenticated: true;
  retriesMaximum: number;
  revalidateSeconds: number;
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
  sourceBindingMode?: "vercel-git-commit-sha-and-build-provenance" | "build-provenance-and-build-payload-attestation";
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
  buildPayloadAttestationStatus: AttestationComparison["status"];
  runtimeDeploymentIdentityStatus?: "verified" | "unavailable" | "invalid";
  finalDeploymentInputVerificationStatus: "external-provider-receipt-required";
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
type GithubProjectionKey = "repository" | "main" | "pull34" | "pull35" | "ruleset" | "exactHeadChecks";

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

function assertExactKeys(record: Record<string, unknown>, keys: readonly string[], context: string): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`LIVE_READBACK_MALFORMED_${context}:keys`);
}

function projectedTimestamp(value: unknown, context: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(Date.parse(value)).toISOString() !== value) throw new Error(`LIVE_READBACK_MALFORMED_${context}:timestamp`);
  return value;
}

function projectedStringArray(value: unknown, context: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(`LIVE_READBACK_MALFORMED_${context}:array`);
  return value as string[];
}

function parseProjectedMain(value: unknown): PublicGitHubMain {
  if (!isRecord(value)) throw new Error("LIVE_READBACK_MALFORMED_MAIN");
  assertExactKeys(value, ["sha", "tree", "protected", "defaultBranch"], "MAIN");
  if (typeof value.sha !== "string" || !HEX_40.test(value.sha) || typeof value.tree !== "string" || !HEX_40.test(value.tree) || typeof value.protected !== "boolean" || typeof value.defaultBranch !== "string") throw new Error("LIVE_READBACK_MALFORMED_MAIN");
  return value as PublicGitHubMain;
}

function parseProjectedRepository(value: unknown): PublicGitHubRepository {
  if (!isRecord(value)) throw new Error("LIVE_READBACK_MALFORMED_REPOSITORY");
  assertExactKeys(value, ["id", "fullName", "defaultBranch"], "REPOSITORY");
  if (value.id !== GITHUB_REPOSITORY_ID || value.fullName !== GITHUB_REPOSITORY || value.defaultBranch !== "main") throw new Error("LIVE_READBACK_REPOSITORY_SUBSTITUTION");
  return value as PublicGitHubRepository;
}

function parseProjectedPull(value: unknown, number: number): PublicGitHubPull {
  if (!isRecord(value)) throw new Error(`LIVE_READBACK_MALFORMED_PR${number}`);
  assertExactKeys(value, ["number", "state", "draft", "merged", "mergeable", "headSha", "headRef", "headRepository", "baseSha", "baseRef", "baseRepository", "updatedAt"], `PR${number}`);
  if (
    value.number !== number || typeof value.state !== "string" || typeof value.draft !== "boolean" || typeof value.merged !== "boolean" ||
    typeof value.mergeable !== "boolean" && value.mergeable !== null || typeof value.headSha !== "string" || !HEX_40.test(value.headSha) ||
    typeof value.baseSha !== "string" || !HEX_40.test(value.baseSha) || typeof value.headRef !== "string" || typeof value.baseRef !== "string" ||
    typeof value.headRepository !== "string" || typeof value.baseRepository !== "string"
  ) throw new Error(`LIVE_READBACK_MALFORMED_PR${number}`);
  projectedTimestamp(value.updatedAt, `PR${number}`);
  return value as PublicGitHubPull;
}

function parseProjectedRuleset(value: unknown): PublicGitHubRuleset {
  if (!isRecord(value)) throw new Error("LIVE_READBACK_MALFORMED_RULESET");
  assertExactKeys(value, [
    "id", "name", "target", "sourceType", "source", "enforcement", "include", "exclude", "bypassActorCount", "bypassActorsStatus", "deletionProtected",
    "nonFastForwardProtected", "requiredApprovingReviewCount", "dismissStaleReviewsOnPush", "requiredReviewerCount", "requireCodeOwnerReview",
    "requireLastPushApproval", "requiredReviewThreadResolution", "requireExtraApprovalForUnattributedChanges", "allowedMergeMethods", "requiredStatusChecksStrict",
    "requiredStatusChecksOnCreate", "requiredStatusChecks"
  ], "RULESET");
  if (
    !Number.isSafeInteger(value.id) || typeof value.name !== "string" || value.target !== "branch" || value.sourceType !== "Repository" ||
    typeof value.source !== "string" || value.enforcement !== "active" || value.bypassActorCount !== null && (!Number.isSafeInteger(value.bypassActorCount) || Number(value.bypassActorCount) < 0) ||
    value.bypassActorsStatus !== "verified" && value.bypassActorsStatus !== "external-verification-required" ||
    typeof value.deletionProtected !== "boolean" || typeof value.nonFastForwardProtected !== "boolean" || typeof value.dismissStaleReviewsOnPush !== "boolean" ||
    !Number.isSafeInteger(value.requiredApprovingReviewCount) || Number(value.requiredApprovingReviewCount) < 0 || !Number.isSafeInteger(value.requiredReviewerCount) || Number(value.requiredReviewerCount) < 0 || typeof value.requireCodeOwnerReview !== "boolean" ||
    typeof value.requireLastPushApproval !== "boolean" || typeof value.requiredReviewThreadResolution !== "boolean" || typeof value.requireExtraApprovalForUnattributedChanges !== "boolean" ||
    typeof value.requiredStatusChecksStrict !== "boolean" || typeof value.requiredStatusChecksOnCreate !== "boolean"
  ) throw new Error("LIVE_READBACK_MALFORMED_RULESET");
  const include = projectedStringArray(value.include, "RULESET_INCLUDE");
  const exclude = projectedStringArray(value.exclude, "RULESET_EXCLUDE");
  const allowedMergeMethods = projectedStringArray(value.allowedMergeMethods, "RULESET_ALLOWED_MERGE_METHODS").sort((left, right) => left.localeCompare(right, "en"));
  if (!Array.isArray(value.requiredStatusChecks)) throw new Error("LIVE_READBACK_MALFORMED_RULESET_STATUS_CHECKS");
  const requiredStatusChecks: Array<{ context: string; integrationId: number }> = [];
  for (const candidate of value.requiredStatusChecks) {
    if (!isRecord(candidate)) throw new Error("LIVE_READBACK_MALFORMED_RULESET_STATUS_CHECK");
    assertExactKeys(candidate, ["context", "integrationId"], "RULESET_STATUS_CHECK");
    if (typeof candidate.context !== "string" || !Number.isSafeInteger(candidate.integrationId) || Number(candidate.integrationId) < 1) throw new Error("LIVE_READBACK_MALFORMED_RULESET_STATUS_CHECK");
    requiredStatusChecks.push({ context: candidate.context, integrationId: Number(candidate.integrationId) });
  }
  requiredStatusChecks.sort((left, right) => left.context.localeCompare(right.context, "en") || left.integrationId - right.integrationId);
  return { ...(value as PublicGitHubRuleset), include, exclude, allowedMergeMethods, requiredStatusChecks };
}

function checkDetailsRunId(value: string | null): number | null {
  if (value === null) return null;
  let candidate: URL;
  try { candidate = new URL(value); } catch { return null; }
  const match = candidate.pathname.match(new RegExp(`^/${GITHUB_REPOSITORY}/actions/runs/([1-9]\\d*)/job/([1-9]\\d*)$`, "u"));
  if (candidate.origin !== "https://github.com" || candidate.username || candidate.password || candidate.port || candidate.search || candidate.hash || !match) return null;
  const runId = Number(match[1]);
  const jobId = Number(match[2]);
  return Number.isSafeInteger(runId) && Number.isSafeInteger(jobId) ? runId : null;
}

function workflowForCheck(name: string) {
  return EXPECTED_GITHUB_WORKFLOWS.find(({ requiredChecks }) => requiredChecks.includes(name)) ?? null;
}

function workflowById(id: number) {
  return EXPECTED_GITHUB_WORKFLOWS.find((workflow) => workflow.id === id) ?? null;
}

function parseProjectedWorkflowRun(value: unknown, expectedWorkflow: (typeof EXPECTED_GITHUB_WORKFLOWS)[number]): PublicWorkflowRun {
  if (!isRecord(value)) throw new Error("LIVE_READBACK_MALFORMED_WORKFLOW_RUN");
  assertExactKeys(value, [
    "id", "workflowId", "name", "path", "event", "headSha", "headBranch", "status", "conclusion", "runAttempt", "runStartedAt",
    "createdAt", "updatedAt", "apiUrl", "htmlUrl", "workflowUrl", "repositoryId", "repository", "headRepositoryId", "headRepository",
    "pullRequestNumber", "pullRequestUrl", "pullHeadSha", "pullHeadRef", "pullHeadRepositoryId", "pullHeadRepository",
    "pullBaseSha", "pullBaseRef", "pullBaseRepositoryId", "pullBaseRepository"
  ], "WORKFLOW_RUN");
  if (
    !Number.isSafeInteger(value.id) || Number(value.id) < 1 || value.workflowId !== expectedWorkflow.id || value.name !== expectedWorkflow.name ||
    value.path !== expectedWorkflow.path || value.event !== "pull_request" || typeof value.headSha !== "string" || !HEX_40.test(value.headSha) ||
    value.headBranch !== STACK_B_BRANCH || typeof value.status !== "string" || !GITHUB_CHECK_RUN_STATUSES.has(value.status) ||
    value.conclusion !== null && (typeof value.conclusion !== "string" || !GITHUB_CHECK_RUN_CONCLUSIONS.has(value.conclusion)) ||
    (value.status === "completed") !== (value.conclusion !== null) || !Number.isSafeInteger(value.runAttempt) || Number(value.runAttempt) < 1 ||
    value.apiUrl !== `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/actions/runs/${value.id}` ||
    value.htmlUrl !== `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${value.id}` ||
    value.workflowUrl !== `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/actions/workflows/${expectedWorkflow.id}` ||
    value.repositoryId !== GITHUB_REPOSITORY_ID || value.repository !== GITHUB_REPOSITORY ||
    value.headRepositoryId !== GITHUB_REPOSITORY_ID || value.headRepository !== GITHUB_REPOSITORY ||
    value.pullRequestNumber !== 35 || value.pullRequestUrl !== `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/pulls/35` ||
    value.pullHeadSha !== value.headSha || value.pullHeadRef !== STACK_B_BRANCH ||
    value.pullHeadRepositoryId !== GITHUB_REPOSITORY_ID || value.pullHeadRepository !== GITHUB_REPOSITORY ||
    value.pullBaseSha !== EXPECTED_MAIN_COMMIT || value.pullBaseRef !== "main" ||
    value.pullBaseRepositoryId !== GITHUB_REPOSITORY_ID || value.pullBaseRepository !== GITHUB_REPOSITORY
  ) throw new Error("LIVE_READBACK_MALFORMED_WORKFLOW_RUN");
  const runStartedAt = projectedTimestamp(value.runStartedAt, "WORKFLOW_STARTED");
  const createdAt = projectedTimestamp(value.createdAt, "WORKFLOW_CREATED");
  const updatedAt = projectedTimestamp(value.updatedAt, "WORKFLOW_UPDATED");
  if (runStartedAt === null || createdAt === null || updatedAt === null || runStartedAt < createdAt || updatedAt < runStartedAt) throw new Error("LIVE_READBACK_MALFORMED_WORKFLOW_LIFECYCLE");
  return value as PublicWorkflowRun;
}

function parseProjectedChecks(value: unknown): PublicGitHubChecks {
  if (!isRecord(value)) throw new Error("LIVE_READBACK_MALFORMED_CHECKS");
  assertExactKeys(value, ["sha", "state", "requiredNames", "workflowRuns", "checks"], "CHECKS");
  if (typeof value.sha !== "string" || !HEX_40.test(value.sha) || !["success", "pending", "failure"].includes(String(value.state)) || !Array.isArray(value.workflowRuns) || !Array.isArray(value.checks)) throw new Error("LIVE_READBACK_MALFORMED_CHECKS");
  if (value.checks.length > MAX_GITHUB_CHECK_RUNS) throw new Error("LIVE_READBACK_CHECK_RUNS_CEILING_EXCEEDED");
  const requiredNames = projectedStringArray(value.requiredNames, "CHECK_NAMES");
  if (JSON.stringify(requiredNames) !== JSON.stringify(REQUIRED_EXACT_HEAD_CHECKS)) throw new Error("LIVE_READBACK_CHECK_SET_SUBSTITUTION");
  const projectedWorkflowRuns = value.workflowRuns as unknown[];
  if (projectedWorkflowRuns.length !== EXPECTED_GITHUB_WORKFLOWS.length) throw new Error("LIVE_READBACK_WORKFLOW_SET_SUBSTITUTION");
  const workflowRuns = EXPECTED_GITHUB_WORKFLOWS.map((workflow, index) => parseProjectedWorkflowRun(projectedWorkflowRuns[index], workflow));
  if (workflowRuns.some(({ headSha }) => headSha !== value.sha)) throw new Error("LIVE_READBACK_WORKFLOW_SHA_SUBSTITUTION");
  if (new Set(workflowRuns.map(({ id }) => id)).size !== workflowRuns.length) throw new Error("LIVE_READBACK_WORKFLOW_RUN_DUPLICATE");
  const checks: PublicCheckRun[] = [];
  const ids = new Set<number>();
  const names = new Set<string>();
  for (const candidate of value.checks) {
    if (!isRecord(candidate)) throw new Error("LIVE_READBACK_MALFORMED_CHECK");
    assertExactKeys(candidate, ["id", "name", "status", "conclusion", "startedAt", "completedAt", "appId", "appSlug", "detailsUrl"], "CHECK");
    if (
      !Number.isSafeInteger(candidate.id) || Number(candidate.id) < 1 || typeof candidate.name !== "string" || candidate.name.length === 0 ||
      typeof candidate.status !== "string" || !GITHUB_CHECK_RUN_STATUSES.has(candidate.status) ||
      candidate.conclusion !== null && (typeof candidate.conclusion !== "string" || !GITHUB_CHECK_RUN_CONCLUSIONS.has(candidate.conclusion)) ||
      candidate.appId !== null && (!Number.isSafeInteger(candidate.appId) || Number(candidate.appId) < 1) ||
      candidate.appSlug !== null && typeof candidate.appSlug !== "string" || candidate.detailsUrl !== null && typeof candidate.detailsUrl !== "string"
    ) throw new Error("LIVE_READBACK_MALFORMED_CHECK");
    const startedAt = projectedTimestamp(candidate.startedAt, "CHECK_STARTED");
    const completedAt = projectedTimestamp(candidate.completedAt, "CHECK_COMPLETED", true);
    if ((candidate.status === "completed") !== (completedAt !== null) || (candidate.status === "completed") !== (candidate.conclusion !== null) || completedAt !== null && startedAt !== null && completedAt < startedAt) throw new Error("LIVE_READBACK_MALFORMED_CHECK_LIFECYCLE");
    if (ids.has(Number(candidate.id)) || names.has(candidate.name)) throw new Error("LIVE_READBACK_CHECK_DUPLICATE");
    ids.add(Number(candidate.id));
    names.add(candidate.name);
    checks.push(candidate as PublicCheckRun);
  }
  const required = REQUIRED_EXACT_HEAD_CHECKS.map((name) => checks.find((check) => check.name === name) ?? null);
  const trusted = (check: PublicCheckRun | null) => {
    if (check === null || check.appId !== EXPECTED_GITHUB_ACTIONS_APP_ID || check.appSlug !== EXPECTED_GITHUB_ACTIONS_APP_SLUG) return false;
    const workflow = workflowForCheck(check.name);
    const selectedRun = workflowRuns.find(({ workflowId }) => workflowId === workflow?.id);
    return selectedRun !== undefined && checkDetailsRunId(check.detailsUrl) === selectedRun.id;
  };
  if (required.some((check) => check !== null && !trusted(check))) throw new Error("LIVE_READBACK_WORKFLOW_CHECK_SUBSTITUTION");
  for (const check of required) {
    if (!check) continue;
    const workflow = workflowForCheck(check.name);
    const selectedRun = workflowRuns.find(({ workflowId }) => workflowId === workflow?.id);
    if (!selectedRun || check.startedAt < selectedRun.runStartedAt || check.completedAt !== null && check.completedAt > selectedRun.updatedAt) throw new Error("LIVE_READBACK_WORKFLOW_CHECK_CHRONOLOGY_SUBSTITUTION");
  }
  const hasFailure = workflowRuns.some((run) => run.status === "completed" && run.conclusion !== "success") || required.some((check) => check !== null && check.status === "completed" && check.conclusion !== "success");
  const allSuccessful = workflowRuns.every((run) => run.status === "completed" && run.conclusion === "success") && required.every((check) => trusted(check) && check?.status === "completed" && check.conclusion === "success");
  const derivedState = allSuccessful ? "success" : hasFailure ? "failure" : "pending";
  if (value.state !== derivedState) throw new Error("LIVE_READBACK_CHECK_STATE_SUBSTITUTION");
  return { sha: value.sha, state: derivedState, requiredNames, workflowRuns, checks };
}

export function parseGitHubLiveObservation(value: unknown): GitHubLiveObservation {
  if (!isRecord(value)) throw new Error("LIVE_READBACK_MALFORMED_GITHUB");
  assertExactKeys(value, [
    "sourceId", "sourceIdentity", "evidenceClass", "status", "candidateSha", "evidenceCompleteness", "exactHeadCheckStatus", "checkPagesObserved", "missingEvidence", "freshness",
    "observedAt", "errorCode", "endpoints", "repository", "main", "pull34", "pull35", "ruleset", "exactHeadChecks", "failures", "unauthenticated",
    "retriesMaximum", "revalidateSeconds"
  ], "GITHUB");
  if (
    value.sourceId !== "github-public-api" || value.sourceIdentity !== "github:chrisdortch/first" || value.evidenceClass !== "public-unauthenticated-github-api" ||
    !["current", "partial", "unavailable", "contradictory"].includes(String(value.status)) || !["current", "stale", "unavailable", "unknown"].includes(String(value.freshness)) ||
    !["complete", "partial", "none", "invalid"].includes(String(value.evidenceCompleteness)) ||
    !["success", "pending", "failure", "partial", "unavailable", "invalid"].includes(String(value.exactHeadCheckStatus)) ||
    typeof value.candidateSha !== "string" || !HEX_40.test(value.candidateSha) || !Number.isSafeInteger(value.checkPagesObserved) || Number(value.checkPagesObserved) < 0 || Number(value.checkPagesObserved) > MAX_GITHUB_CHECK_RUN_PAGES ||
    value.unauthenticated !== true || value.revalidateSeconds !== GITHUB_REVALIDATE_SECONDS || !Number.isSafeInteger(value.retriesMaximum) || Number(value.retriesMaximum) < 0 || Number(value.retriesMaximum) > 1 ||
    value.errorCode !== null && typeof value.errorCode !== "string"
  ) throw new Error("LIVE_READBACK_MALFORMED_GITHUB");
  const observedAt = projectedTimestamp(value.observedAt, "GITHUB_OBSERVED", true);
  if (value.freshness === "current" && observedAt === null) throw new Error("LIVE_READBACK_GITHUB_CURRENT_WITHOUT_SOURCE_TIME");
  const endpoints = projectedStringArray(value.endpoints, "GITHUB_ENDPOINTS");
  const failures = projectedStringArray(value.failures, "GITHUB_FAILURES");
  const missingEvidence = projectedStringArray(value.missingEvidence, "GITHUB_MISSING_EVIDENCE");
  const allowedMissingEvidence = new Set(["repository", "main", "pull34", "pull35", "ruleset", "exactHeadChecks"]);
  if (new Set(missingEvidence).size !== missingEvidence.length || missingEvidence.some((entry) => !allowedMissingEvidence.has(entry))) throw new Error("LIVE_READBACK_GITHUB_MISSING_EVIDENCE_SUBSTITUTION");
  if (new Set(endpoints).size !== endpoints.length || endpoints.some((endpoint) => {
    try { return new URL(endpoint).origin !== GITHUB_ORIGIN; } catch { return true; }
  })) throw new Error("LIVE_READBACK_GITHUB_ENDPOINT_SUBSTITUTION");
  const repository = value.repository === null ? null : parseProjectedRepository(value.repository);
  const main = value.main === null ? null : parseProjectedMain(value.main);
  const pull34 = value.pull34 === null ? null : parseProjectedPull(value.pull34, 34);
  const pull35 = value.pull35 === null ? null : parseProjectedPull(value.pull35, 35);
  const ruleset = value.ruleset === null ? null : parseProjectedRuleset(value.ruleset);
  const exactHeadChecks = value.exactHeadChecks === null ? null : parseProjectedChecks(value.exactHeadChecks);
  const fixedEndpoints = [
    `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}`,
    `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/branches/main`,
    `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/pulls/34`,
    `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/pulls/35`,
    `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/rulesets/${EXPECTED_MAIN_RULESET_ID}`
  ];
  const expectedCandidateSha = value.candidateSha;
  if (exactHeadChecks !== null && exactHeadChecks.sha !== expectedCandidateSha || pull35 !== null && pull35.headSha !== expectedCandidateSha) throw new Error("LIVE_READBACK_GITHUB_CANDIDATE_SUBSTITUTION");
  const workflowEndpoints = EXPECTED_GITHUB_WORKFLOWS.map(({ id }) => workflowRunsEndpoint(expectedCandidateSha, id));
  const fullRequestSetExpected = value.status !== "unavailable" || endpoints.length > 0;
  if (fullRequestSetExpected && fixedEndpoints.some((endpoint) => !endpoints.includes(endpoint))) throw new Error("LIVE_READBACK_GITHUB_ENDPOINT_SUBSTITUTION");
  if (fullRequestSetExpected && (workflowEndpoints.some((endpoint) => !endpoints.includes(endpoint)) || endpoints.every((endpoint) => !endpoint.includes("/check-runs")))) throw new Error("LIVE_READBACK_GITHUB_ENDPOINT_SUBSTITUTION");
  if (endpoints.some((endpoint) => {
    if (fixedEndpoints.includes(endpoint) || workflowEndpoints.includes(endpoint)) return false;
    try { parseCheckRunsPageNumber(endpoint, expectedCandidateSha); return false; } catch { return true; }
  })) throw new Error("LIVE_READBACK_GITHUB_ENDPOINT_SUBSTITUTION");
  const checkPages = endpoints
    .filter((endpoint) => !fixedEndpoints.includes(endpoint) && !workflowEndpoints.includes(endpoint))
    .map((endpoint) => parseCheckRunsPageNumber(endpoint, expectedCandidateSha))
    .sort((left, right) => left - right);
  if (checkPages.length > MAX_GITHUB_CHECK_RUN_PAGES) throw new Error("LIVE_READBACK_CHECK_PAGES_CEILING_EXCEEDED");
  if (fullRequestSetExpected && (checkPages.length === 0 || checkPages.some((page, index) => page !== index + 1))) throw new Error("LIVE_READBACK_GITHUB_ENDPOINT_SUBSTITUTION");
  if (fullRequestSetExpected) {
    const orderedCheckEndpoints = endpoints
      .filter((endpoint) => !fixedEndpoints.includes(endpoint) && !workflowEndpoints.includes(endpoint))
      .sort((left, right) => parseCheckRunsPageNumber(left, expectedCandidateSha) - parseCheckRunsPageNumber(right, expectedCandidateSha));
    const canonicalEndpoints = [...fixedEndpoints, ...workflowEndpoints, ...orderedCheckEndpoints];
    if (canonicalEndpoints.some((endpoint, index) => endpoints[index] !== endpoint)) throw new Error("LIVE_READBACK_GITHUB_ENDPOINT_ORDER_SUBSTITUTION");
  }
  if (Number(value.checkPagesObserved) > checkPages.length) throw new Error("LIVE_READBACK_GITHUB_CHECK_PAGE_OBSERVATION_SUBSTITUTION");
  if (exactHeadChecks && exactHeadChecks.checks.length > checkPages.length * GITHUB_CHECK_RUNS_PER_PAGE) throw new Error("LIVE_READBACK_CHECK_PAGE_CAPACITY_EXCEEDED");
  const visibleMissing = [!repository ? "repository" : null, !main ? "main" : null, !pull34 ? "pull34" : null, !pull35 ? "pull35" : null, !ruleset ? "ruleset" : null, !exactHeadChecks ? "exactHeadChecks" : null].filter((entry): entry is string => entry !== null);
  if (visibleMissing.some((entry) => !missingEvidence.includes(entry))) throw new Error("LIVE_READBACK_GITHUB_MISSING_EVIDENCE_SUBSTITUTION");
  const expectedCheckStatus = exactHeadChecks?.state ?? (value.evidenceCompleteness === "invalid" ? "invalid" : Number(value.checkPagesObserved) > 0 ? "partial" : "unavailable");
  if (value.exactHeadCheckStatus !== expectedCheckStatus) throw new Error("LIVE_READBACK_GITHUB_CHECK_STATUS_SUBSTITUTION");
  if (value.status === "current" && (value.evidenceCompleteness !== "complete" || value.freshness !== "current" || observedAt === null || value.errorCode !== null || failures.length !== 0 || missingEvidence.length !== 0 || !repository || !main || !pull34 || !pull35 || !ruleset || !exactHeadChecks)) throw new Error("LIVE_READBACK_GITHUB_CURRENT_INCOMPLETE");
  if (value.status === "partial" && (
    !["complete", "partial"].includes(String(value.evidenceCompleteness)) || value.freshness === "unknown" || value.errorCode === null || failures.length === 0 ||
    value.evidenceCompleteness === "complete" && (missingEvidence.length !== 0 || !repository || !main || !pull34 || !pull35 || !ruleset || !exactHeadChecks)
  )) throw new Error("LIVE_READBACK_GITHUB_PARTIAL_SUBSTITUTION");
  if (value.status === "contradictory" && (value.evidenceCompleteness !== "invalid" || value.errorCode === null || failures.length === 0)) throw new Error("LIVE_READBACK_GITHUB_CONTRADICTION_SUBSTITUTION");
  if (value.status === "unavailable" && (value.evidenceCompleteness !== "none" || value.freshness !== "unavailable" || value.errorCode === null || failures.length === 0)) throw new Error("LIVE_READBACK_GITHUB_UNAVAILABLE_SUBSTITUTION");
  return { ...(value as GitHubLiveObservation), endpoints, failures, missingEvidence, observedAt, repository, main, pull34, pull35, ruleset, exactHeadChecks };
}

export function parseDeploymentSelfObservation(value: unknown): DeploymentSelfObservation {
  if (!isRecord(value)) throw new Error("LIVE_READBACK_MALFORMED_DEPLOYMENT");
  assertExactKeys(value, [
    "sourceId", "sourceIdentity", "evidenceClass", "status", "freshness", "observedAt", "errorCode", "environment", "hostname", "runtimeHostname",
    "requestHostname", "projectId", "deploymentId", "runtimeDeploymentKey", "region", "regionStatus", "skewProtectionState", "gitCommitSha", "sourceBindingMode",
    "observationMethod", "externalProviderIdentity", "failures", "environmentKeysRead"
  ], "DEPLOYMENT");
  if (
    value.sourceId !== "vercel-deployment-self" || value.sourceIdentity !== "vercel-functions-get-env" || value.evidenceClass !== "deployment-self-observation" ||
    !["current", "unavailable", "contradictory"].includes(String(value.status)) || !["current", "stale", "unavailable", "unknown"].includes(String(value.freshness)) || value.observedAt !== null ||
    value.errorCode !== null && typeof value.errorCode !== "string" || value.environment !== null && value.environment !== "preview" || value.deploymentId !== null
  ) throw new Error("LIVE_READBACK_MALFORMED_DEPLOYMENT");
  for (const key of ["hostname", "runtimeHostname", "requestHostname", "projectId", "runtimeDeploymentKey", "region", "gitCommitSha", "sourceBindingMode", "observationMethod"] as const) {
    if (value[key] !== null && typeof value[key] !== "string") throw new Error(`LIVE_READBACK_MALFORMED_DEPLOYMENT:${key}`);
  }
  if (!["current", "unavailable"].includes(String(value.regionStatus)) || !["enabled", "disabled", "unavailable", "invalid"].includes(String(value.skewProtectionState))) throw new Error("LIVE_READBACK_MALFORMED_DEPLOYMENT_STATUS");
  if (!isRecord(value.externalProviderIdentity)) throw new Error("LIVE_READBACK_MALFORMED_EXTERNAL_PROVIDER");
  const externalProviderIdentity = value.externalProviderIdentity;
  assertExactKeys(externalProviderIdentity, ["evidenceClass", "verifiedByWebRuntime", "providerDeploymentId", "providerUrl", "target", "aliases", "providerSourceSha", "protectionState"], "EXTERNAL_PROVIDER");
  if (externalProviderIdentity.evidenceClass !== "external-provider-verification" || externalProviderIdentity.verifiedByWebRuntime !== false || ["providerDeploymentId", "providerUrl", "target", "aliases", "providerSourceSha", "protectionState"].some((key) => externalProviderIdentity[key] !== null)) throw new Error("LIVE_READBACK_EXTERNAL_PROVIDER_SUBSTITUTION");
  const failures = projectedStringArray(value.failures, "DEPLOYMENT_FAILURES");
  const environmentKeysRead = projectedStringArray(value.environmentKeysRead, "DEPLOYMENT_ENVIRONMENT_KEYS");
  if (JSON.stringify(environmentKeysRead) !== JSON.stringify(ALLOWED_ENVIRONMENT_KEYS)) throw new Error("LIVE_READBACK_DEPLOYMENT_ENVIRONMENT_WIDENING");
  if (value.status === "current" && (
    value.freshness !== "current" || value.errorCode !== null || failures.length !== 0 || value.environment !== "preview" || value.projectId !== EXPECTED_VERCEL_PROJECT_ID ||
    typeof value.hostname !== "string" || !VERCEL_HOSTNAME.test(value.hostname) || value.runtimeHostname !== value.hostname || value.requestHostname !== value.hostname ||
    typeof value.runtimeDeploymentKey !== "string" || !/^clover-[0-9a-f]{24}$/u.test(value.runtimeDeploymentKey) ||
    value.gitCommitSha !== null && (typeof value.gitCommitSha !== "string" || !HEX_40.test(value.gitCommitSha)) ||
    value.sourceBindingMode !== (value.gitCommitSha === null ? "build-provenance-and-build-payload-attestation" : "vercel-git-commit-sha-and-build-provenance") ||
    value.observationMethod !== "vercel-functions-get-env-and-request-host" && value.observationMethod !== "request-bound-runtime-host" ||
    value.region === null && value.regionStatus !== "unavailable" || value.region !== null && (typeof value.region !== "string" || value.regionStatus !== "current" || !/^[a-z0-9]{3,16}$/u.test(value.region)) ||
    value.skewProtectionState === "invalid"
  )) throw new Error("LIVE_READBACK_DEPLOYMENT_CURRENT_INCOMPLETE");
  if (value.status !== "current" && value.freshness === "current") throw new Error("LIVE_READBACK_DEPLOYMENT_FRESHNESS_SUBSTITUTION");
  return { ...(value as DeploymentSelfObservation), failures, environmentKeysRead };
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

function parseRepository(value: unknown): PublicGitHubRepository {
  if (
    !isRecord(value) ||
    requiredString(value, "full_name", "REPOSITORY") !== GITHUB_REPOSITORY ||
    value.id !== GITHUB_REPOSITORY_ID
  ) throw new Error("GITHUB_SOURCE_SUBSTITUTION:repository");
  const defaultBranch = requiredString(value, "default_branch", "REPOSITORY");
  if (defaultBranch !== "main") throw new Error("GITHUB_SOURCE_SUBSTITUTION:default-branch");
  return { id: GITHUB_REPOSITORY_ID, fullName: GITHUB_REPOSITORY, defaultBranch };
}

function parseBranch(value: unknown, defaultBranch: string): PublicGitHubMain {
  if (!isRecord(value) || typeof value.protected !== "boolean") throw new Error("GITHUB_MALFORMED_MAIN");
  const commit = nested(value, "commit", "MAIN");
  const sha = requiredString(commit, "sha", "MAIN");
  if (!HEX_40.test(sha)) throw new Error("GITHUB_MALFORMED_MAIN:sha");
  const commitDetails = isRecord(commit.commit) ? commit.commit : null;
  const treeDetails = commitDetails && isRecord(commitDetails.tree) ? commitDetails.tree : null;
  const tree = treeDetails && typeof treeDetails.sha === "string" && HEX_40.test(treeDetails.sha) ? treeDetails.sha : null;
  if (!tree) throw new Error("GITHUB_MALFORMED_MAIN:tree");
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

function exactStringArray(value: unknown, context: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(`GITHUB_MALFORMED_${context}`);
  return [...value];
}

function parseRuleset(value: unknown): PublicGitHubRuleset {
  if (!isRecord(value) || !Number.isSafeInteger(value.id)) throw new Error("GITHUB_MALFORMED_RULESET");
  const conditions = nested(value, "conditions", "RULESET");
  const refName = nested(conditions, "ref_name", "RULESET");
  const rules = value.rules;
  const bypassActors = value.bypass_actors === undefined ? null : value.bypass_actors;
  if (!Array.isArray(rules) || bypassActors !== null && !Array.isArray(bypassActors)) throw new Error("GITHUB_MALFORMED_RULESET:rules");
  const byType = new Map<string, Record<string, unknown>>();
  for (const rule of rules) {
    if (!isRecord(rule)) throw new Error("GITHUB_MALFORMED_RULESET:rule");
    const type = requiredString(rule, "type", "RULESET");
    if (byType.has(type)) throw new Error("GITHUB_SOURCE_CONTRADICTION:duplicate-ruleset-rule");
    byType.set(type, rule);
  }
  if (byType.size !== 4 || !byType.has("deletion") || !byType.has("non_fast_forward") || !byType.has("pull_request") || !byType.has("required_status_checks")) {
    throw new Error("GITHUB_SOURCE_CONTRADICTION:ruleset-rules");
  }
  const pullRequest = nested(byType.get("pull_request") as Record<string, unknown>, "parameters", "RULESET_PULL_REQUEST");
  const statusChecks = nested(byType.get("required_status_checks") as Record<string, unknown>, "parameters", "RULESET_STATUS_CHECKS");
  if (!Array.isArray(statusChecks.required_status_checks)) throw new Error("GITHUB_MALFORMED_RULESET:required-status-checks");
  const requiredStatusChecks = statusChecks.required_status_checks.map((candidate) => {
    if (!isRecord(candidate) || !Number.isSafeInteger(candidate.integration_id)) throw new Error("GITHUB_MALFORMED_RULESET:required-status-check");
    return { context: requiredString(candidate, "context", "RULESET_STATUS_CHECK"), integrationId: Number(candidate.integration_id) };
  }).sort((left, right) => left.context.localeCompare(right.context, "en") || left.integrationId - right.integrationId);
  if (!Number.isSafeInteger(pullRequest.required_approving_review_count) || !Array.isArray(pullRequest.required_reviewers)) throw new Error("GITHUB_MALFORMED_RULESET:pull-request");
  for (const key of ["dismiss_stale_reviews_on_push", "require_code_owner_review", "require_last_push_approval", "required_review_thread_resolution", "require_extra_approval_for_unattributed_changes"] as const) {
    if (typeof pullRequest[key] !== "boolean") throw new Error(`GITHUB_MALFORMED_RULESET:${key}`);
  }
  for (const key of ["strict_required_status_checks_policy", "do_not_enforce_on_create"] as const) {
    if (typeof statusChecks[key] !== "boolean") throw new Error(`GITHUB_MALFORMED_RULESET:${key}`);
  }
  return {
    id: Number(value.id),
    name: requiredString(value, "name", "RULESET"),
    target: value.target === "branch" ? "branch" : (() => { throw new Error("GITHUB_SOURCE_SUBSTITUTION:ruleset-target"); })(),
    sourceType: value.source_type === "Repository" ? "Repository" : (() => { throw new Error("GITHUB_SOURCE_SUBSTITUTION:ruleset-source-type"); })(),
    source: requiredString(value, "source", "RULESET"),
    enforcement: value.enforcement === "active" ? "active" : (() => { throw new Error("GITHUB_SOURCE_SUBSTITUTION:ruleset-enforcement"); })(),
    include: exactStringArray(refName.include, "RULESET_INCLUDE"),
    exclude: exactStringArray(refName.exclude, "RULESET_EXCLUDE"),
    bypassActorCount: bypassActors?.length ?? null,
    bypassActorsStatus: bypassActors === null ? "external-verification-required" : "verified",
    deletionProtected: true,
    nonFastForwardProtected: true,
    requiredApprovingReviewCount: Number(pullRequest.required_approving_review_count),
    dismissStaleReviewsOnPush: pullRequest.dismiss_stale_reviews_on_push === true,
    requiredReviewerCount: pullRequest.required_reviewers.length,
    requireCodeOwnerReview: pullRequest.require_code_owner_review === true,
    requireLastPushApproval: pullRequest.require_last_push_approval === true,
    requiredReviewThreadResolution: pullRequest.required_review_thread_resolution === true,
    requireExtraApprovalForUnattributedChanges: pullRequest.require_extra_approval_for_unattributed_changes === true,
    allowedMergeMethods: exactStringArray(pullRequest.allowed_merge_methods, "RULESET_ALLOWED_MERGE_METHODS").sort((left, right) => left.localeCompare(right, "en")),
    requiredStatusChecksStrict: statusChecks.strict_required_status_checks_policy === true,
    requiredStatusChecksOnCreate: statusChecks.do_not_enforce_on_create !== true,
    requiredStatusChecks
  };
}

const GITHUB_CHECK_RUN_STATUSES = new Set(["queued", "in_progress", "completed", "waiting", "requested", "pending"]);
const GITHUB_CHECK_RUN_CONCLUSIONS = new Set(["success", "failure", "neutral", "cancelled", "skipped", "timed_out", "action_required", "stale", "startup_failure"]);

function exactWorkflowRepository(value: unknown, context: string): Record<string, unknown> {
  if (!isRecord(value) || value.id !== GITHUB_REPOSITORY_ID || requiredString(value, "full_name", context) !== GITHUB_REPOSITORY) throw new Error(`GITHUB_SOURCE_SUBSTITUTION:${context.toLowerCase()}`);
  return value;
}

function exactPullRepository(value: unknown, context: string): void {
  if (!isRecord(value) || value.id !== GITHUB_REPOSITORY_ID || value.url !== `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}` || value.name !== "first") throw new Error(`GITHUB_SOURCE_SUBSTITUTION:${context.toLowerCase()}`);
}

function parseWorkflowRun(candidate: unknown, expectedSha: string, expectedWorkflow: (typeof EXPECTED_GITHUB_WORKFLOWS)[number]): PublicWorkflowRun {
  if (!isRecord(candidate) || !Number.isSafeInteger(candidate.id) || Number(candidate.id) < 1) throw new Error("GITHUB_MALFORMED_WORKFLOW_RUN");
  const id = Number(candidate.id);
  const status = requiredString(candidate, "status", "WORKFLOW_RUN");
  const conclusion = candidate.conclusion;
  if (
    candidate.workflow_id !== expectedWorkflow.id ||
    requiredString(candidate, "name", "WORKFLOW_RUN") !== expectedWorkflow.name ||
    requiredString(candidate, "path", "WORKFLOW_RUN") !== expectedWorkflow.path ||
    requiredString(candidate, "event", "WORKFLOW_RUN") !== "pull_request" ||
    requiredString(candidate, "head_sha", "WORKFLOW_RUN") !== expectedSha ||
    requiredString(candidate, "head_branch", "WORKFLOW_RUN") !== STACK_B_BRANCH ||
    !GITHUB_CHECK_RUN_STATUSES.has(status) ||
    conclusion !== null && (typeof conclusion !== "string" || !GITHUB_CHECK_RUN_CONCLUSIONS.has(conclusion)) ||
    (status === "completed") !== (conclusion !== null) ||
    !Number.isSafeInteger(candidate.run_attempt) || Number(candidate.run_attempt) < 1 ||
    candidate.url !== `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/actions/runs/${id}` ||
    candidate.html_url !== `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${id}` ||
    candidate.workflow_url !== `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/actions/workflows/${expectedWorkflow.id}`
  ) throw new Error(`GITHUB_SOURCE_SUBSTITUTION:workflow-run-${expectedWorkflow.id}`);
  exactWorkflowRepository(candidate.repository, "WORKFLOW_REPOSITORY");
  exactWorkflowRepository(candidate.head_repository, "WORKFLOW_HEAD_REPOSITORY");
  if (!Array.isArray(candidate.pull_requests) || candidate.pull_requests.length !== 1 || !isRecord(candidate.pull_requests[0])) throw new Error("GITHUB_SOURCE_SUBSTITUTION:workflow-pull-request");
  const pullRequest = candidate.pull_requests[0];
  if (pullRequest.number !== 35 || pullRequest.url !== `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/pulls/35`) throw new Error("GITHUB_SOURCE_SUBSTITUTION:workflow-pull-request");
  const head = nested(pullRequest, "head", "WORKFLOW_PULL_HEAD");
  const base = nested(pullRequest, "base", "WORKFLOW_PULL_BASE");
  exactPullRepository(head.repo, "WORKFLOW_PULL_HEAD_REPOSITORY");
  exactPullRepository(base.repo, "WORKFLOW_PULL_BASE_REPOSITORY");
  const pullHeadSha = requiredString(head, "sha", "WORKFLOW_PULL_HEAD");
  const pullBaseSha = requiredString(base, "sha", "WORKFLOW_PULL_BASE");
  if (head.ref !== STACK_B_BRANCH || pullHeadSha !== expectedSha || base.ref !== "main" || pullBaseSha !== EXPECTED_MAIN_COMMIT) throw new Error("GITHUB_SOURCE_SUBSTITUTION:workflow-pull-request");
  const runStartedAt = exactTimestamp(candidate.run_started_at, "WORKFLOW_STARTED");
  const createdAt = exactTimestamp(candidate.created_at, "WORKFLOW_CREATED");
  const updatedAt = exactTimestamp(candidate.updated_at, "WORKFLOW_UPDATED");
  if (runStartedAt < createdAt || updatedAt < runStartedAt) throw new Error("GITHUB_MALFORMED_WORKFLOW_LIFECYCLE");
  return {
    id,
    workflowId: expectedWorkflow.id,
    name: expectedWorkflow.name,
    path: expectedWorkflow.path,
    event: "pull_request",
    headSha: expectedSha,
    headBranch: STACK_B_BRANCH,
    status,
    conclusion: conclusion as string | null,
    runAttempt: Number(candidate.run_attempt),
    runStartedAt,
    createdAt,
    updatedAt,
    apiUrl: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/actions/runs/${id}`,
    htmlUrl: `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${id}`,
    workflowUrl: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/actions/workflows/${expectedWorkflow.id}`,
    repositoryId: GITHUB_REPOSITORY_ID,
    repository: GITHUB_REPOSITORY,
    headRepositoryId: GITHUB_REPOSITORY_ID,
    headRepository: GITHUB_REPOSITORY,
    pullRequestNumber: 35,
    pullRequestUrl: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/pulls/35`,
    pullHeadSha,
    pullHeadRef: STACK_B_BRANCH,
    pullHeadRepositoryId: GITHUB_REPOSITORY_ID,
    pullHeadRepository: GITHUB_REPOSITORY,
    pullBaseSha,
    pullBaseRef: "main",
    pullBaseRepositoryId: GITHUB_REPOSITORY_ID,
    pullBaseRepository: GITHUB_REPOSITORY
  };
}

function parseWorkflowRuns(value: unknown, expectedSha: string, expectedWorkflow: (typeof EXPECTED_GITHUB_WORKFLOWS)[number]): PublicWorkflowRun {
  if (!isRecord(value) || !Number.isSafeInteger(value.total_count) || Number(value.total_count) < 0 || !Array.isArray(value.workflow_runs) || value.workflow_runs.length > MAX_GITHUB_WORKFLOW_RUNS) throw new Error("GITHUB_MALFORMED_WORKFLOW_RUNS");
  if (Number(value.total_count) > MAX_GITHUB_WORKFLOW_RUNS) throw new Error("GITHUB_WORKFLOW_RUNS_CEILING_EXCEEDED");
  if (Number(value.total_count) !== value.workflow_runs.length) throw new Error("GITHUB_WORKFLOW_RUNS_PAGE_MISSING");
  if (value.workflow_runs.length === 0) throw new Error(`GITHUB_WORKFLOW_RUN_MISSING:${expectedWorkflow.id}`);
  const parsed = value.workflow_runs.map((candidate) => parseWorkflowRun(candidate, expectedSha, expectedWorkflow));
  const byId = new Map<number, PublicWorkflowRun>();
  for (const run of parsed) {
    const prior = byId.get(run.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(run)) throw new Error(`GITHUB_SOURCE_CONTRADICTION:duplicate-workflow-run-${expectedWorkflow.id}`);
    byId.set(run.id, run);
  }
  return [...byId.values()].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
    || left.runAttempt - right.runAttempt
    || left.runStartedAt.localeCompare(right.runStartedAt)
    || left.id - right.id
  ).at(-1) as PublicWorkflowRun;
}

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
    const app = candidate.app === null ? null : isRecord(candidate.app) ? candidate.app : null;
    const appId = app && Number.isSafeInteger(app.id) && Number(app.id) > 0 ? Number(app.id) : null;
    const appSlug = app && typeof app.slug === "string" && app.slug.length > 0 ? app.slug : null;
    const detailsUrl = candidate.details_url === null ? null : typeof candidate.details_url === "string" && candidate.details_url.length > 0 ? candidate.details_url : null;
    return {
      id: Number(candidate.id),
      name: requiredString(candidate, "name", "CHECK_RUN"),
      status,
      conclusion,
      startedAt,
      completedAt,
      appId,
      appSlug,
      detailsUrl
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

function projectCheckRuns(parsed: PublicCheckRun[], expectedSha: string, workflowRuns: PublicWorkflowRun[]): PublicGitHubChecks {
  const latestByName = new Map<string, PublicCheckRun>();
  const sorted = [...parsed].sort(checkRunRecency);
  for (const check of sorted) {
    if (workflowForCheck(check.name) === null) latestByName.set(check.name, check);
  }
  for (const name of REQUIRED_EXACT_HEAD_CHECKS) {
    const expectedWorkflow = workflowForCheck(name);
    const selectedRun = workflowRuns.find(({ workflowId }) => workflowId === expectedWorkflow?.id);
    if (!selectedRun) throw new Error("GITHUB_SOURCE_CONTRADICTION:required-check-workflow-missing");
    const sameName = sorted.filter((check) => check.name === name);
    const exactRun = sameName.filter((check) => checkDetailsRunId(check.detailsUrl) === selectedRun.id);
    if (exactRun.length === 0) {
      if (sameName.length > 0) throw new Error("GITHUB_SOURCE_SUBSTITUTION:required-check-run");
      continue;
    }
    const selectedCheck = exactRun.at(-1) as PublicCheckRun;
    if (selectedCheck.appId !== EXPECTED_GITHUB_ACTIONS_APP_ID || selectedCheck.appSlug !== EXPECTED_GITHUB_ACTIONS_APP_SLUG) throw new Error("GITHUB_SOURCE_SUBSTITUTION:required-check-issuer");
    latestByName.set(name, selectedCheck);
  }
  const checks = [...latestByName.values()].sort((left, right) => left.name.localeCompare(right.name, "en"));
  const required = REQUIRED_EXACT_HEAD_CHECKS.map((name) => checks.find((check) => check.name === name) ?? null);
  const trustedIssuer = (check: PublicCheckRun | null) => check?.appId === EXPECTED_GITHUB_ACTIONS_APP_ID && check.appSlug === EXPECTED_GITHUB_ACTIONS_APP_SLUG;
  for (const check of required) {
    if (!check) continue;
    const workflow = workflowForCheck(check.name);
    const selectedRun = workflowRuns.find(({ workflowId }) => workflowId === workflow?.id);
    if (!selectedRun || check.startedAt < selectedRun.runStartedAt || check.completedAt !== null && check.completedAt > selectedRun.updatedAt) throw new Error("GITHUB_SOURCE_CONTRADICTION:workflow-check-chronology");
  }
  const hasFailure = workflowRuns.some((run) => run.status === "completed" && run.conclusion !== "success") || required.some((check) => check !== null && (!trustedIssuer(check) || check.status === "completed" && check.conclusion !== "success"));
  const allSuccessful = workflowRuns.every((run) => run.status === "completed" && run.conclusion === "success") && required.every((check) => trustedIssuer(check) && check?.status === "completed" && check.conclusion === "success");
  return { sha: expectedSha, state: allSuccessful ? "success" : hasFailure ? "failure" : "pending", requiredNames: [...REQUIRED_EXACT_HEAD_CHECKS], workflowRuns, checks };
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

function workflowRunsEndpoint(candidateCommit: string, workflowId: number): string {
  if (!workflowById(workflowId)) throw new Error("GITHUB_WORKFLOW_ID_REJECTED");
  return `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/actions/workflows/${workflowId}/runs?head_sha=${candidateCommit}&event=pull_request&per_page=${MAX_GITHUB_WORKFLOW_RUNS}&page=1`;
}

function parseWorkflowRunsEndpoint(endpoint: string, expectedSha: string, workflowId: number): void {
  let candidate: URL;
  try { candidate = parseGithubEndpoint(endpoint); } catch { throw new Error("GITHUB_SOURCE_SUBSTITUTION:workflow-runs-origin"); }
  if (!workflowById(workflowId) || candidate.pathname !== `/repos/${GITHUB_REPOSITORY}/actions/workflows/${workflowId}/runs`) throw new Error("GITHUB_SOURCE_SUBSTITUTION:workflow-runs-path");
  const keys = [...candidate.searchParams.keys()];
  if (
    keys.length !== 4 || new Set(keys).size !== 4 ||
    candidate.searchParams.getAll("head_sha").length !== 1 || candidate.searchParams.get("head_sha") !== expectedSha ||
    candidate.searchParams.getAll("event").length !== 1 || candidate.searchParams.get("event") !== "pull_request" ||
    candidate.searchParams.getAll("per_page").length !== 1 || candidate.searchParams.get("per_page") !== String(MAX_GITHUB_WORKFLOW_RUNS) ||
    candidate.searchParams.getAll("page").length !== 1 || candidate.searchParams.get("page") !== "1"
  ) throw new Error("GITHUB_SOURCE_SUBSTITUTION:workflow-runs-query");
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

type GithubRequestBoundary = {
  signal: AbortSignal;
  deadlineAt: number;
  clock: () => number;
  firstAbortCause: "caller" | "deadline" | null;
};

function boundaryFailure(boundary: GithubRequestBoundary): string {
  if (boundary.firstAbortCause === "caller") return "GITHUB_CALLER_ABORTED";
  if (boundary.firstAbortCause === "deadline") return "GITHUB_DEADLINE_EXCEEDED";
  return boundary.clock() >= boundary.deadlineAt ? "GITHUB_DEADLINE_EXCEEDED" : "GITHUB_CALLER_ABORTED";
}

async function abortableRetryDelay(boundary: GithubRequestBoundary, timeoutMs: number): Promise<void> {
  if (boundary.signal.aborted) throw new Error(boundaryFailure(boundary));
  const remaining = boundary.deadlineAt - boundary.clock();
  if (remaining < GITHUB_RETRY_BACKOFF_MS + timeoutMs) throw new Error("GITHUB_DEADLINE_EXCEEDED");
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error(boundaryFailure(boundary)));
    };
    const timer = setTimeout(() => {
      boundary.signal.removeEventListener("abort", onAbort);
      resolve();
    }, GITHUB_RETRY_BACKOFF_MS);
    boundary.signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isExactGithubJsonContentType(value: string | null): boolean {
  if (value === null) return false;
  const parts = value.split(";").map((part) => part.trim().toLowerCase());
  if (parts[0] !== "application/json" && parts[0] !== "application/vnd.github+json") return false;
  return parts.length === 1 || parts.length === 2 && parts[1] === "charset=utf-8";
}

async function readBoundedGithubResponse(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  const body = response.body;
  if (body === null) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  let cancelRequested = false;
  const cancel = () => {
    if (cancelRequested) return;
    cancelRequested = true;
    void reader.cancel().catch(() => undefined);
  };
  const onAbort = () => cancel();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal.aborted) throw new Error("GITHUB_REQUEST_ABORTED");
    for (;;) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw new Error("GITHUB_REQUEST_ABORTED");
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_GITHUB_RESPONSE_BYTES) {
        cancel();
        throw new Error("GITHUB_RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal.removeEventListener("abort", onAbort);
    try { reader.releaseLock(); } catch { /* A cancelled body may already be detached. */ }
  }
}

function cancelRejectedGithubResponse(response: Response): void {
  if (response.body === null) return;
  try { void response.body.cancel().catch(() => undefined); } catch { /* A source adapter may already have locked the body. */ }
}

function rejectGithubResponse(response: Response, message: string): never {
  cancelRejectedGithubResponse(response);
  throw new Error(message);
}

async function readFixedGithubJson(endpoint: string, {
  fetchImpl,
  timeoutMs,
  retries,
  boundary
}: {
  fetchImpl: FixedFetch;
  timeoutMs: number;
  retries: number;
  boundary: GithubRequestBoundary;
}): Promise<{ value: unknown; observedAt: string | null; link: string | null }> {
  parseGithubEndpoint(endpoint);
  let lastFailure = "GITHUB_UNAVAILABLE";
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (boundary.signal.aborted) throw new Error(boundaryFailure(boundary));
    const remaining = boundary.deadlineAt - boundary.clock();
    if (remaining <= 0) throw new Error("GITHUB_DEADLINE_EXCEEDED");
    if (attempt > 0 && remaining < timeoutMs) throw new Error("GITHUB_DEADLINE_EXCEEDED");
    const controller = new AbortController();
    let perRequestTimedOut = false;
    const onBoundaryAbort = () => controller.abort();
    boundary.signal.addEventListener("abort", onBoundaryAbort, { once: true });
    const timer = setTimeout(() => {
      perRequestTimedOut = true;
      controller.abort();
    }, Math.min(timeoutMs, remaining));
    try {
      const response = await fetchImpl(endpoint, {
        method: "GET",
        redirect: "error",
        credentials: "omit",
        cache: "force-cache",
        next: { revalidate: GITHUB_CACHE_REVALIDATE_SECONDS },
        signal: controller.signal,
        headers: { Accept: "application/vnd.github+json", "User-Agent": "clover-tree-live-truth-0.2", "X-GitHub-Api-Version": "2022-11-28" }
      });
      if (response.redirected || response.url !== endpoint) rejectGithubResponse(response, "GITHUB_SOURCE_SUBSTITUTION:url");
      if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") rejectGithubResponse(response, "GITHUB_RATE_LIMITED");
      if (!response.ok) {
        lastFailure = `GITHUB_HTTP_${response.status}`;
        rejectGithubResponse(response, lastFailure);
      }
      if (!isExactGithubJsonContentType(response.headers.get("content-type"))) rejectGithubResponse(response, "GITHUB_MALFORMED_MEDIA_TYPE");
      const declaredLength = response.headers.get("content-length");
      if (declaredLength !== null) {
        const contentLength = Number(declaredLength);
        if (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > MAX_GITHUB_RESPONSE_BYTES) rejectGithubResponse(response, "GITHUB_RESPONSE_TOO_LARGE");
      }
      const bytes = await readBoundedGithubResponse(response, controller.signal);
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new Error("GITHUB_MALFORMED_UTF8"); }
      let value: unknown;
      try { value = parseJsonWithoutDuplicateKeys(text); } catch { throw new Error("GITHUB_MALFORMED_JSON"); }
      return { value, observedAt: validSourceDate(response.headers.get("date")), link: response.headers.get("link") };
    } catch (error) {
      const message = error instanceof Error ? error.message : "GITHUB_UNAVAILABLE";
      if (boundary.signal.aborted) throw new Error(boundaryFailure(boundary));
      const httpStatus = /^GITHUB_HTTP_(\d{3})$/u.exec(message);
      if (message === "GITHUB_RATE_LIMITED" || message.includes("SOURCE_SUBSTITUTION") || message.includes("TOO_LARGE") || message.includes("MALFORMED") || httpStatus && Number(httpStatus[1]) < 500) throw error;
      lastFailure = perRequestTimedOut ? (boundary.clock() >= boundary.deadlineAt ? "GITHUB_DEADLINE_EXCEEDED" : "GITHUB_TIMEOUT") : message.startsWith("GITHUB_") ? message : "GITHUB_UNAVAILABLE";
      if (attempt === retries) throw new Error(lastFailure);
    } finally {
      clearTimeout(timer);
      boundary.signal.removeEventListener("abort", onBoundaryAbort);
    }
    await abortableRetryDelay(boundary, timeoutMs);
  }
  throw new Error(lastFailure);
}

async function readPaginatedCheckRuns({
  candidateCommit,
  fetchImpl,
  timeoutMs,
  retries,
  boundary,
  endpoints,
  observedTimes,
  checkPageObservedTimes
}: {
  candidateCommit: string;
  fetchImpl: FixedFetch;
  timeoutMs: number;
  retries: number;
  boundary: GithubRequestBoundary;
  endpoints: string[];
  observedTimes: string[];
  checkPageObservedTimes: string[];
}): Promise<PublicGitHubChecks> {
  const byId = new Map<number, PublicCheckRun>();
  let expectedTotal: number | null = null;
  const workflowOutcomesPromise = Promise.all(EXPECTED_GITHUB_WORKFLOWS.map(async (workflow) => {
    const endpoint = workflowRunsEndpoint(candidateCommit, workflow.id);
    parseWorkflowRunsEndpoint(endpoint, candidateCommit, workflow.id);
    endpoints.push(endpoint);
    try {
      const result = await readFixedGithubJson(endpoint, { fetchImpl, timeoutMs, retries, boundary });
      return { workflow, result, error: null as Error | null };
    } catch (error) {
      return { workflow, result: null, error: error instanceof Error ? error : new Error("GITHUB_UNAVAILABLE") };
    }
  }));
  const checksPromise = (async () => {
    let endpoint = checkRunsPageEndpoint(candidateCommit, 1);
    for (let page = 1; page <= MAX_GITHUB_CHECK_RUN_PAGES; page += 1) {
      if (parseCheckRunsPageNumber(endpoint, candidateCommit) !== page) throw new Error("GITHUB_SOURCE_SUBSTITUTION:check-runs-page");
      endpoints.push(endpoint);
      const result = await readFixedGithubJson(endpoint, { fetchImpl, timeoutMs, retries, boundary });
      if (!result.observedAt) throw new Error("GITHUB_SOURCE_TIME_UNAVAILABLE");
      observedTimes.push(result.observedAt);
      checkPageObservedTimes.push(result.observedAt);
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
        return [...byId.values()];
      }
      if (next === null) throw new Error("GITHUB_CHECK_RUNS_PAGE_MISSING");
      if (page === MAX_GITHUB_CHECK_RUN_PAGES) throw new Error("GITHUB_CHECK_RUNS_CEILING_EXCEEDED");
      endpoint = next;
    }
    throw new Error("GITHUB_CHECK_RUNS_CEILING_EXCEEDED");
  })().then(
    (checks) => ({ checks, error: null as Error | null }),
    (error: unknown) => ({ checks: null, error: error instanceof Error ? error : new Error("GITHUB_UNAVAILABLE") })
  );
  const [workflowOutcomes, checksOutcome] = await Promise.all([workflowOutcomesPromise, checksPromise]);
  const workflowRuns: PublicWorkflowRun[] = [];
  for (const outcome of workflowOutcomes) {
    if (outcome.result?.observedAt) observedTimes.push(outcome.result.observedAt);
    if (outcome.error || !outcome.result) continue;
    if (!outcome.result.observedAt) outcome.error = new Error("GITHUB_SOURCE_TIME_UNAVAILABLE");
    else if (outcome.result.link !== null) outcome.error = new Error("GITHUB_WORKFLOW_RUNS_PAGE_MISSING");
  }
  if (checksOutcome.error || !checksOutcome.checks) throw checksOutcome.error ?? new Error("GITHUB_UNAVAILABLE");
  const workflowFailure = workflowOutcomes.find(({ error }) => error !== null)?.error;
  if (workflowFailure) throw workflowFailure;
  for (const outcome of workflowOutcomes) {
    if (!outcome.result) throw new Error("GITHUB_UNAVAILABLE");
    workflowRuns.push(parseWorkflowRuns(outcome.result.value, candidateCommit, outcome.workflow));
  }
  if (workflowRuns.length !== EXPECTED_GITHUB_WORKFLOWS.length) throw new Error("GITHUB_WORKFLOW_RUN_MISSING");
  if (new Set(workflowRuns.map(({ id }) => id)).size !== workflowRuns.length) throw new Error("GITHUB_SOURCE_CONTRADICTION:duplicate-selected-workflow-run");
  return projectCheckRuns(checksOutcome.checks, candidateCommit, workflowRuns);
}

function githubEndpoints(candidateCommit: string) {
  if (!HEX_40.test(candidateCommit)) throw new Error("GITHUB_CANDIDATE_IDENTITY_REJECTED");
  return Object.freeze({
    repository: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}`,
    main: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/branches/main`,
    pull34: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/pulls/34`,
    pull35: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/pulls/35`,
    ruleset: `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/rulesets/${EXPECTED_MAIN_RULESET_ID}`,
    exactHeadChecks: checkRunsPageEndpoint(candidateCommit, 1)
  });
}

async function observeGitHubTruthWithinBoundary({
  candidateCommit,
  fetchImpl,
  timeoutMs,
  retries,
  now,
  boundary
}: {
  candidateCommit: string;
  fetchImpl: FixedFetch;
  timeoutMs: number;
  retries: number;
  now: () => number;
  boundary: GithubRequestBoundary;
}): Promise<GitHubLiveObservation> {
  const endpoints = githubEndpoints(candidateCommit);
  const requestedEndpoints: string[] = [];
  const checkObservedTimes: string[] = [];
  const checkPageObservedTimes: string[] = [];
  const fixedOutcomes = await Promise.all((Object.entries(endpoints) as Array<[GithubProjectionKey, string]>)
    .filter(([key]) => key !== "exactHeadChecks")
    .map(async ([key, endpoint]) => {
    requestedEndpoints.push(endpoint);
    try {
      const result = await readFixedGithubJson(endpoint, { fetchImpl, timeoutMs, retries, boundary });
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
      boundary,
      endpoints: requestedEndpoints,
      observedTimes: checkObservedTimes,
      checkPageObservedTimes
    });
    checkOutcome = {
      key: "exactHeadChecks",
      value,
      observedAt: [...checkObservedTimes].sort()[0] ?? null,
      failure: null
    };
  } catch (error) {
    checkOutcome = {
      key: "exactHeadChecks",
      value: null,
      observedAt: [...checkObservedTimes].sort()[0] ?? null,
      failure: `exactHeadChecks:${error instanceof Error ? error.message : "GITHUB_UNAVAILABLE"}`
    };
  }
  const outcomes = [...fixedOutcomes, checkOutcome];
  const failures: string[] = [];
  const values = new Map<GithubProjectionKey, unknown>();
  const observedTimes: string[] = [...checkObservedTimes];
  for (const outcome of outcomes) {
    if (outcome.value !== null) values.set(outcome.key, outcome.value);
    if (outcome.key !== "exactHeadChecks" && outcome.observedAt) observedTimes.push(outcome.observedAt);
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
  const main = parseProjection("main", (value) => parseBranch(value, "main"));
  const pull34 = parseProjection("pull34", (value) => parsePull(value, 34));
  const pull35 = parseProjection("pull35", (value) => parsePull(value, 35));
  const ruleset = parseProjection("ruleset", parseRuleset);
  const exactHeadChecks = parseProjection("exactHeadChecks", (value) => value as PublicGitHubChecks);
  if (boundary.signal.aborted) failures.push(`observation:${boundaryFailure(boundary)}`);
  const successfulProjectionCount = [repository, main, pull34, pull35, ruleset, exactHeadChecks].filter(Boolean).length;
  const allProjectionValuesPresent = successfulProjectionCount === 6;
  const structurallyComplete = allProjectionValuesPresent && failures.length === 0;
  const sortedObservedTimes = [...observedTimes].sort();
  const oldestObservedAt = sortedObservedTimes[0] ?? null;
  const newestObservedAt = sortedObservedTimes.at(-1) ?? null;
  let freshness: ObservationFreshness = oldestObservedAt && newestObservedAt ? "current" : "unavailable";
  if (oldestObservedAt && newestObservedAt) {
    const completedAt = now();
    if (!Number.isFinite(completedAt)) throw new Error("GITHUB_OBSERVATION_BOUNDARY_REJECTED");
    const sourceAgeMs = completedAt - Date.parse(oldestObservedAt);
    const newestSourceLeadMs = Date.parse(newestObservedAt) - completedAt;
    if (newestSourceLeadMs > 5_000) {
      failures.push("sourceTime:GITHUB_SOURCE_CONTRADICTION:FUTURE");
      freshness = "unavailable";
    } else if (sourceAgeMs >= GITHUB_REVALIDATE_SECONDS * 1_000) {
      failures.push("sourceTime:GITHUB_SOURCE_STALE");
      freshness = "stale";
    }
  }
  const complete = structurallyComplete && failures.length === 0 && freshness === "current";
  const contradictory = failures.some((failure) => failure.includes("SOURCE_SUBSTITUTION") || failure.includes("SOURCE_CONTRADICTION") || failure.includes("MALFORMED"));
  const status = complete ? "current" : contradictory ? "contradictory" : successfulProjectionCount > 0 || checkObservedTimes.length > 0 ? "partial" : "unavailable";
  const missingEvidence = [
    !repository ? "repository" : null,
    !main ? "main" : null,
    !pull34 ? "pull34" : null,
    !pull35 ? "pull35" : null,
    !ruleset ? "ruleset" : null,
    !exactHeadChecks ? "exactHeadChecks" : null
  ].filter((entry): entry is string => entry !== null);
  const evidenceCompleteness = status === "contradictory" ? "invalid" : allProjectionValuesPresent ? "complete" : status === "partial" ? "partial" : "none";
  const checkPagesObserved = checkPageObservedTimes.length;
  const exactHeadCheckStatus = exactHeadChecks?.state ?? (evidenceCompleteness === "invalid" ? "invalid" : checkPagesObserved > 0 ? "partial" : "unavailable");
  const failurePriority = [
    "GITHUB_CALLER_ABORTED",
    "GITHUB_DEADLINE_EXCEEDED",
    "GITHUB_RATE_LIMITED",
    "GITHUB_TIMEOUT",
    "GITHUB_CHECK_RUNS_CEILING_EXCEEDED",
    "GITHUB_SOURCE_STALE",
    "GITHUB_SOURCE_CONTRADICTION:FUTURE"
  ];
  const explicitBoundaryFailure = failurePriority.find((candidate) => failures.some((failure) => failure.includes(candidate)));
  const firstFailure = failures[0]?.split(":").slice(1).join(":") || null;
  return {
    sourceId: "github-public-api",
    sourceIdentity: "github:chrisdortch/first",
    evidenceClass: "public-unauthenticated-github-api",
    status,
    candidateSha: candidateCommit,
    evidenceCompleteness,
    exactHeadCheckStatus,
    checkPagesObserved,
    missingEvidence,
    freshness,
    observedAt: oldestObservedAt,
    errorCode: complete ? null : explicitBoundaryFailure ?? firstFailure ?? "GITHUB_PARTIAL_FAILURE",
    endpoints: requestedEndpoints,
    repository,
    main,
    pull34,
    pull35,
    ruleset,
    exactHeadChecks,
    failures,
    unauthenticated: true,
    retriesMaximum: retries,
    revalidateSeconds: GITHUB_REVALIDATE_SECONDS
  };
}

export async function observeGitHubTruth({
  candidateCommit,
  fetchImpl = fetch as FixedFetch,
  timeoutMs = DEFAULT_GITHUB_TIMEOUT_MS,
  retries = DEFAULT_GITHUB_RETRIES,
  now = Date.now,
  signal,
  deadlineMs = GITHUB_LIVE_OBSERVATION_DEADLINE_MS,
  clock = Date.now
}: {
  candidateCommit: string;
  fetchImpl?: FixedFetch;
  timeoutMs?: number;
  retries?: number;
  now?: () => number;
  signal?: AbortSignal;
  deadlineMs?: number;
  clock?: () => number;
}): Promise<GitHubLiveObservation> {
  if (
    !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > GITHUB_LIVE_OBSERVATION_DEADLINE_MS ||
    !Number.isSafeInteger(retries) || retries < 0 || retries > 1 ||
    !Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 14_000 ||
    !Number.isFinite(clock())
  ) throw new Error("GITHUB_OBSERVATION_BOUNDARY_REJECTED");
  const controller = new AbortController();
  const startedAt = clock();
  const boundary: GithubRequestBoundary = { signal: controller.signal, deadlineAt: startedAt + deadlineMs, clock, firstAbortCause: null };
  const abortBoundary = (cause: "caller" | "deadline") => {
    if (boundary.firstAbortCause === null) boundary.firstAbortCause = cause;
    controller.abort();
  };
  const onCallerAbort = () => abortBoundary("caller");
  if (signal?.aborted) abortBoundary("caller");
  else signal?.addEventListener("abort", onCallerAbort, { once: true });
  const deadlineTimer = setTimeout(() => abortBoundary("deadline"), deadlineMs);
  try {
    return await observeGitHubTruthWithinBoundary({ candidateCommit, fetchImpl, timeoutMs, retries, now, boundary });
  } finally {
    clearTimeout(deadlineTimer);
    signal?.removeEventListener("abort", onCallerAbort);
    controller.abort();
  }
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
    sourceBindingMode: gitCommitSha ? "vercel-git-commit-sha-and-build-provenance" : "build-provenance-and-build-payload-attestation",
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

function exactMainRuleset(ruleset: PublicGitHubRuleset | null): boolean {
  if (!ruleset) return false;
  const expectedStatusChecks = [
    { context: "Clover required main gate (Node 22)", integrationId: EXPECTED_GITHUB_ACTIONS_APP_ID },
    { context: "Clover required main gate (Node 24)", integrationId: EXPECTED_GITHUB_ACTIONS_APP_ID }
  ].sort((left, right) => left.context.localeCompare(right.context, "en") || left.integrationId - right.integrationId);
  return ruleset.id === EXPECTED_MAIN_RULESET_ID &&
    ruleset.name === "Clover Required Main Protection" &&
    ruleset.target === "branch" &&
    ruleset.sourceType === "Repository" &&
    ruleset.source === GITHUB_REPOSITORY &&
    ruleset.enforcement === "active" &&
    JSON.stringify(ruleset.include) === JSON.stringify(["refs/heads/main"]) &&
    ruleset.exclude.length === 0 &&
    (ruleset.bypassActorsStatus === "verified" && ruleset.bypassActorCount === 0 || ruleset.bypassActorsStatus === "external-verification-required" && ruleset.bypassActorCount === null) &&
    ruleset.deletionProtected &&
    ruleset.nonFastForwardProtected &&
    ruleset.requiredApprovingReviewCount === 0 &&
    ruleset.dismissStaleReviewsOnPush &&
    ruleset.requiredReviewerCount === 0 &&
    !ruleset.requireCodeOwnerReview &&
    !ruleset.requireLastPushApproval &&
    ruleset.requiredReviewThreadResolution &&
    !ruleset.requireExtraApprovalForUnattributedChanges &&
    JSON.stringify([...ruleset.allowedMergeMethods].sort((left, right) => left.localeCompare(right, "en"))) === JSON.stringify(["merge", "rebase", "squash"]) &&
    ruleset.requiredStatusChecksStrict &&
    ruleset.requiredStatusChecksOnCreate &&
    JSON.stringify([...ruleset.requiredStatusChecks].sort((left, right) => left.context.localeCompare(right.context, "en") || left.integrationId - right.integrationId)) === JSON.stringify(expectedStatusChecks);
}

function exactRequiredChecks(checks: PublicGitHubChecks | null, expectedSha: string): boolean {
  if (
    !checks || checks.sha !== expectedSha || checks.state !== "success" || JSON.stringify(checks.requiredNames) !== JSON.stringify(REQUIRED_EXACT_HEAD_CHECKS) ||
    checks.workflowRuns.length !== EXPECTED_GITHUB_WORKFLOWS.length || new Set(checks.workflowRuns.map(({ id }) => id)).size !== checks.workflowRuns.length
  ) return false;
  if (EXPECTED_GITHUB_WORKFLOWS.some((workflow, index) => {
    const run = checks.workflowRuns[index];
    return !run || run.workflowId !== workflow.id || run.name !== workflow.name || run.path !== workflow.path || run.event !== "pull_request" ||
      run.headSha !== expectedSha || run.headBranch !== STACK_B_BRANCH || run.status !== "completed" || run.conclusion !== "success" ||
      run.apiUrl !== `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/actions/runs/${run.id}` ||
      run.htmlUrl !== `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${run.id}` ||
      run.workflowUrl !== `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/actions/workflows/${workflow.id}` ||
      run.repositoryId !== GITHUB_REPOSITORY_ID || run.repository !== GITHUB_REPOSITORY || run.headRepositoryId !== GITHUB_REPOSITORY_ID || run.headRepository !== GITHUB_REPOSITORY ||
      run.pullRequestNumber !== 35 || run.pullRequestUrl !== `${GITHUB_ORIGIN}/repos/${GITHUB_REPOSITORY}/pulls/35` ||
      run.pullHeadSha !== expectedSha || run.pullHeadRef !== STACK_B_BRANCH || run.pullHeadRepositoryId !== GITHUB_REPOSITORY_ID || run.pullHeadRepository !== GITHUB_REPOSITORY ||
      run.pullBaseSha !== EXPECTED_MAIN_COMMIT || run.pullBaseRef !== "main" || run.pullBaseRepositoryId !== GITHUB_REPOSITORY_ID || run.pullBaseRepository !== GITHUB_REPOSITORY;
  })) return false;
  return REQUIRED_EXACT_HEAD_CHECKS.every((name) => {
    const check = checks.checks.find((candidate) => candidate.name === name);
    const workflow = workflowForCheck(name);
    const run = checks.workflowRuns.find(({ workflowId }) => workflowId === workflow?.id);
    return check?.status === "completed" && check.conclusion === "success" && check.appId === EXPECTED_GITHUB_ACTIONS_APP_ID && check.appSlug === EXPECTED_GITHUB_ACTIONS_APP_SLUG && run !== undefined && checkDetailsRunId(check.detailsUrl) === run.id;
  });
}

function githubContradictions(github: GitHubLiveObservation, build: BuildProvenance): string[] {
  const contradictions: string[] = [];
  if (github.status !== "current") contradictions.push("github-live-observation-unavailable");
  if (github.repository && (github.repository.id !== GITHUB_REPOSITORY_ID || github.repository.fullName !== GITHUB_REPOSITORY || github.repository.defaultBranch !== "main")) contradictions.push("repository-identity");
  if (github.main && (github.main.sha !== EXPECTED_MAIN_COMMIT || github.main.tree !== EXPECTED_MAIN_TREE || github.main.protected !== true || github.main.defaultBranch !== "main")) contradictions.push("protected-main-identity");
  if (github.ruleset && !exactMainRuleset(github.ruleset)) contradictions.push("protected-main-ruleset");
  if (github.pull34 && (github.pull34.headSha !== EXPECTED_STACK_A_HEAD || github.pull34.headRef !== STACK_A_BRANCH || github.pull34.baseSha !== EXPECTED_STACK_A_BASE_COMMIT || github.pull34.baseRef !== "main" || github.pull34.headRepository !== GITHUB_REPOSITORY || github.pull34.baseRepository !== GITHUB_REPOSITORY || github.pull34.state !== "closed" || github.pull34.draft || !github.pull34.merged)) contradictions.push("stack-a-pull-request");
  if (github.pull35 && (github.pull35.headSha !== build.commit || github.pull35.headRef !== STACK_B_BRANCH || github.pull35.baseSha !== EXPECTED_MAIN_COMMIT || github.pull35.baseRef !== "main" || github.pull35.headRepository !== GITHUB_REPOSITORY || github.pull35.baseRepository !== GITHUB_REPOSITORY || github.pull35.state !== "open" || github.pull35.merged || !github.pull35.mergeable)) contradictions.push("stack-b-pull-request");
  if (build.stackABase !== EXPECTED_MAIN_COMMIT || build.changedPathCount !== EXPECTED_STACK_B_CHANGED_PATH_COUNT || build.pathListSha256 !== EXPECTED_STACK_B_PATH_LIST_SHA256) contradictions.push("stack-b-source-provenance");
  if (github.exactHeadChecks && !exactRequiredChecks(github.exactHeadChecks, build.commit)) contradictions.push("exact-head-checks");
  return contradictions;
}

function deploymentContradictions(deployment: DeploymentSelfObservation, build: BuildProvenance): string[] {
  if (
    deployment.status === "current" &&
    deployment.runtimeDeploymentKey === build.runtimeDeploymentKey &&
    deployment.projectId === EXPECTED_VERCEL_PROJECT_ID &&
    deployment.hostname !== null && deployment.runtimeHostname === deployment.hostname && deployment.requestHostname === deployment.hostname &&
    (deployment.gitCommitSha === null || deployment.gitCommitSha === build.commit) &&
    deployment.sourceBindingMode === (deployment.gitCommitSha === null ? "build-provenance-and-build-payload-attestation" : "vercel-git-commit-sha-and-build-provenance") &&
    (deployment.observationMethod === "vercel-functions-get-env-and-request-host" || deployment.observationMethod === "request-bound-runtime-host")
  ) return [];
  return deployment.failures.length ? deployment.failures : ["deployment-self-unavailable"];
}

export function computeTruthReadiness({ github, deployment, attestation }: { github: GitHubLiveObservation; deployment: DeploymentSelfObservation; attestation: AttestationComparison }, _build: BuildProvenance): TruthReadiness {
  return {
    applicationSourceValidated: _build.cleanWorktree,
    treeProgramBaselineLoaded: true,
    treePreviewRuntimeObserved: deployment.status === "current",
    runtimeDeploymentIdentityStatus: deployment.status === "current" && deployment.runtimeDeploymentKey === _build.runtimeDeploymentKey ? "verified" : deployment.status === "contradictory" ? "invalid" : "unavailable",
    liveGithubOverlayStatus: github.status === "current" ? "current" : "unavailable",
    buildPayloadAttestationStatus: attestation.status,
    finalDeploymentInputVerificationStatus: "external-provider-receipt-required",
    ownerConsoleGroundingRequired: true,
    privateOwnerAuthenticationConfigured: false,
    durablePrivateStorageConfigured: false,
    realParticipantRuntimeConfigured: false,
    realProviderExecutionConfigured: false,
    productionAuthorized: false
  };
}

function readinessAllowsAcceptance(readiness: TruthReadiness, contradictions: string[]): boolean {
  return readiness.applicationSourceValidated && readiness.treeProgramBaselineLoaded && readiness.treePreviewRuntimeObserved && readiness.runtimeDeploymentIdentityStatus === "verified" && readiness.liveGithubOverlayStatus === "current" && readiness.buildPayloadAttestationStatus === "verified" && contradictions.length === 0;
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
