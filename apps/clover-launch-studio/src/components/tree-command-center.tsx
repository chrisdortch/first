"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ActionPacketPanel } from "./action-packet-panel";
import { CollaborationCenter } from "./collaboration-center";
import { DecisionRail } from "./decision-rail";
import { OwnerInputPanel } from "./owner-input-panel";
import { PersonalLaunchPod } from "./personal-launch-pod";
import { PreviewPane } from "./preview-pane";
import { ProgressTimeline } from "./progress-timeline";
import { TranscriptEditor } from "./transcript-editor";
import { TreeMap } from "./tree-map";
import { GITHUB_CACHE_REVALIDATE_SECONDS, GITHUB_FAILURE_RETRY_SECONDS, GITHUB_REVALIDATE_SECONDS, baselineObservationTime, parseDeploymentSelfObservation, parseGitHubLiveObservation, parseJsonWithoutDuplicateKeys, reconcileTreeTruth, type CurrentActionCard, type DeploymentSelfObservation, type GitHubLiveObservation, type ObservationFreshness, type TruthReadiness } from "@/lib/live-truth";
import { compareDeploymentAttestation, parseBuildProvenance, type AttestationComparison } from "@/lib/provenance";
import type { TreeBranch, TreeProgramSnapshot, TreeRecord, TreeStatus } from "@/lib/tree-program";

const views = [
  "Today",
  "Tree",
  "Master Plan",
  "Branches",
  "Roots and Source Coverage",
  "Captain's Log",
  "Fruit Ledger",
  "Collaboration and JV Center",
  "Action Center",
  "System Health",
  "Launch Studio session"
] as const;
type View = (typeof views)[number];

const heldReadiness: TruthReadiness = {
  applicationSourceValidated: true,
  treeProgramBaselineLoaded: true,
  treePreviewRuntimeObserved: false,
  liveGithubOverlayStatus: "unavailable",
  buildPayloadAttestationStatus: "unavailable",
  finalDeploymentInputVerificationStatus: "external-provider-receipt-required",
  ownerConsoleGroundingRequired: true,
  privateOwnerAuthenticationConfigured: false,
  durablePrivateStorageConfigured: false,
  realParticipantRuntimeConfigured: false,
  realProviderExecutionConfigured: false,
  productionAuthorized: false
};

const unavailableDeployment: DeploymentSelfObservation = {
  sourceId: "vercel-deployment-self",
  sourceIdentity: "vercel-system-environment",
  evidenceClass: "deployment-self-observation",
  status: "unavailable",
  freshness: "unavailable",
  observedAt: null,
  errorCode: "deployment-self-unavailable",
  environment: null,
  hostname: null,
  projectId: null,
  deploymentId: null,
  region: null,
  gitCommitSha: null,
  failures: ["deployment-self-unavailable"],
  environmentKeysRead: []
};

const heldAction: CurrentActionCard = {
  action: "HOLD",
  status: "hold",
  reason: "source-refresh-required",
  source: "runtime-live-truth-reconciliation",
  observedAt: null,
  bindings: { protectedMain: null, pull34: null, pull35: null, deployment: unavailableDeployment, sourceFreshness: "unavailable", githubObservedAt: null, deploymentObservedAt: null, contradictions: ["live-readback-loading"] },
  requiredOwnerDecision: "HOLD",
  authority: { mergeAuthorized: false, productionAuthorized: false, privateDataAuthorized: false, externalMessagingAuthorized: false, paymentAuthorized: false, purchaseAuthorized: false },
  rollback: "retain-unmerged-pr35-and-delete-target-null-preview-in-separate-authorized-gate"
};

type LiveTruthState = {
  phase: "loading" | "refreshing" | "observed" | "stale" | "unavailable";
  action: CurrentActionCard;
  readiness: TruthReadiness;
  github: GitHubLiveObservation | null;
  deployment: DeploymentSelfObservation | null;
  attestation: AttestationComparison | null;
  requestObservedAt: string | null;
  contradictions: string[];
  error: string | null;
};

const initialLiveTruth: LiveTruthState = {
  phase: "loading",
  action: heldAction,
  readiness: heldReadiness,
  github: null,
  deployment: null,
  attestation: null,
  requestObservedAt: null,
  contradictions: ["live-readback-loading"],
  error: null
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function exactIsoTimestamp(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(Date.parse(value)).toISOString() !== value) throw new Error("live-readback-time-invalid");
  return value;
}

function assertReadOnlyAuthority(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, ["publicMetadataObserved", "sourceMutationAuthorized", "mergeAuthorized", "productionAuthorized", "privateDataAuthorized", "externalMessagingAuthorized", "paymentAuthorized", "purchaseAuthorized"])) throw new Error("live-readback-authority-structure");
  if (value.publicMetadataObserved !== true || value.sourceMutationAuthorized !== false || value.mergeAuthorized !== false || value.productionAuthorized !== false || value.privateDataAuthorized !== false || value.externalMessagingAuthorized !== false || value.paymentAuthorized !== false || value.purchaseAuthorized !== false) throw new Error("live-readback-authority-widening");
}

function asLiveReadback(value: unknown, snapshot: TreeProgramSnapshot, receivedAt: number, expectedCandidateCommit: string) {
  if (!isRecord(value) || !isRecord(value.baseline) || !isRecord(value.observations) || !isRecord(value.reconciled) || !isRecord(value.authority)) {
    throw new Error("live-readback-structure");
  }
  if (!hasExactKeys(value, ["schemaVersion", "baseline", "observations", "reconciled", "requestObservedAt", "authority"]) || value.schemaVersion !== "clover-tree-live-readback-v0.2") throw new Error("live-readback-schema");
  if (!hasExactKeys(value.baseline, ["baselineObservedAt", "indexId", "indexHash", "classification", "immutableRecords"]) || value.baseline.indexId !== snapshot.index.indexId || value.baseline.indexHash !== snapshot.index.indexHash || value.baseline.classification !== "historical-source-bound-baseline" || !isRecord(value.baseline.immutableRecords)) {
    throw new Error("live-readback-baseline-substitution");
  }
  exactIsoTimestamp(value.baseline.baselineObservedAt);
  assertReadOnlyAuthority(value.authority);
  if (!isRecord(value.observations.github) || !isRecord(value.observations.deploymentSelf) || !isRecord(value.observations.clover) || typeof value.requestObservedAt !== "string") {
    throw new Error("live-readback-observation-structure");
  }
  if (!hasExactKeys(value.observations, ["github", "deploymentSelf", "clover"]) || !hasExactKeys(value.observations.clover, ["sourceId", "sourceIdentity", "evidenceClass", "status", "freshness", "observedAt", "errorCode", "webRuntimeConnectorInvoked", "statement"])) throw new Error("clover-observation-structure");
  if (value.observations.clover.sourceId !== "clover-context-gateway" || value.observations.clover.sourceIdentity !== "external-owner-console" || value.observations.clover.evidenceClass !== "external-owner-console-required" || value.observations.clover.status !== "external-owner-console-required" || value.observations.clover.freshness !== "unknown" || value.observations.clover.observedAt !== null || value.observations.clover.errorCode !== null || value.observations.clover.webRuntimeConnectorInvoked !== false || value.observations.clover.statement !== "no Clover connector was invoked by the web runtime") throw new Error("clover-observation-substitution");
  const parsedGithub = parseGitHubLiveObservation(value.observations.github);
  if (parsedGithub.candidateSha !== expectedCandidateCommit) throw new Error("live-readback-candidate-substitution");
  const parsedDeployment = parseDeploymentSelfObservation(value.observations.deploymentSelf);
  const requestObservedAt = exactIsoTimestamp(value.requestObservedAt);
  const requestTime = Date.parse(requestObservedAt);
  const sourceTime = parsedGithub.observedAt === null ? null : Date.parse(parsedGithub.observedAt);
  if (requestTime > receivedAt + 5_000 || sourceTime !== null && sourceTime > receivedAt + 5_000) throw new Error("live-readback-source-time-contradiction");
  const requestExpired = receivedAt - requestTime >= GITHUB_REVALIDATE_SECONDS * 1_000;
  const sourceExpired = sourceTime !== null && receivedAt - sourceTime >= GITHUB_REVALIDATE_SECONDS * 1_000;
  const locallyExpired = parsedGithub.freshness === "current" && sourceTime !== null && (requestExpired || sourceExpired);
  const github: GitHubLiveObservation = locallyExpired
    ? {
        ...parsedGithub,
        status: parsedGithub.status === "current" ? "partial" : parsedGithub.status,
        freshness: "stale",
        errorCode: parsedGithub.errorCode ?? "CLIENT_OBSERVATION_EXPIRED",
        failures: [...new Set([...parsedGithub.failures, "client:CLIENT_OBSERVATION_EXPIRED"])]
      }
    : parsedGithub;
  const deployment = requestExpired
    ? { ...parsedDeployment, freshness: parsedDeployment.freshness === "current" || parsedDeployment.freshness === "stale" ? "stale" as const : "unavailable" as const }
    : parsedDeployment;
  return {
    github,
    deployment,
    requestObservedAt
  };
}

const CLIENT_READBACK_TIMEOUT_MS = 15_000;
const MAX_CLIENT_READBACK_BYTES = 2 * 1024 * 1024;
const CLIENT_REFRESH_INTERVAL_MS = GITHUB_CACHE_REVALIDATE_SECONDS * 1_000;
const CLIENT_FAILURE_RETRY_MS = GITHUB_FAILURE_RETRY_SECONDS * 1_000;

function isExactJsonContentType(value: string | null): boolean {
  if (value === null) return false;
  const parts = value.split(";").map((part) => part.trim().toLowerCase());
  return parts[0] === "application/json" && (parts.length === 1 || parts.length === 2 && parts[1] === "charset=utf-8");
}

async function readBoundedClientResponse(response: Response, signal: AbortSignal): Promise<Uint8Array> {
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
    if (signal.aborted) throw new Error("live-readback-aborted");
    for (;;) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw new Error("live-readback-aborted");
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_CLIENT_READBACK_BYTES) {
        cancel();
        throw new Error("live-readback-too-large");
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

function rejectClientResponse(response: Response, message: string): never {
  if (response.body !== null) {
    try { void response.body.cancel().catch(() => undefined); } catch { /* The body may already be locked by a substituted adapter. */ }
  }
  throw new Error(message);
}

async function responseJson(response: Response, expectedPath: string, signal: AbortSignal): Promise<unknown> {
  let finalUrl: URL;
  try { finalUrl = new URL(response.url); } catch { return rejectClientResponse(response, "live-readback-source-substitution"); }
  if (
    response.redirected || finalUrl.origin !== window.location.origin || finalUrl.pathname !== expectedPath ||
    finalUrl.search !== "" || finalUrl.hash !== "" || finalUrl.username !== "" || finalUrl.password !== ""
  ) return rejectClientResponse(response, "live-readback-source-substitution");
  const declaredLength = response.headers.get("content-length");
  if (!response.ok || !isExactJsonContentType(response.headers.get("content-type"))) return rejectClientResponse(response, "live-readback-unavailable");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_CLIENT_READBACK_BYTES) return rejectClientResponse(response, "live-readback-too-large");
  }
  const bytes = await readBoundedClientResponse(response, signal);
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new Error("live-readback-malformed-utf8"); }
  try { return parseJsonWithoutDuplicateKeys(text); } catch { throw new Error("live-readback-malformed-json"); }
}

function staleLiveTruth(previous: LiveTruthState, phase: "loading" | "refreshing" | "stale" | "unavailable", error: string | null): LiveTruthState {
  const staleEvidenceFreshness = (freshness: ObservationFreshness) => freshness === "current" || freshness === "stale" ? "stale" as const : "unavailable" as const;
  const priorGithub = previous.github ? { ...previous.github, freshness: staleEvidenceFreshness(previous.github.freshness) } : null;
  const priorDeployment = previous.deployment ? { ...previous.deployment, freshness: staleEvidenceFreshness(previous.deployment.freshness) } : null;
  const sourceFreshness = priorGithub?.freshness ?? "unavailable";
  const contradiction = phase === "refreshing" || phase === "loading" ? "live-readback-refresh-pending" : error ?? "live-readback-unavailable";
  const contradictions = [...new Set([...previous.contradictions.filter((item) => item !== "live-readback-loading"), contradiction])];
  return {
    phase,
    action: {
      ...heldAction,
      observedAt: priorGithub?.observedAt ?? null,
      bindings: {
        protectedMain: priorGithub?.main ?? null,
        pull34: priorGithub?.pull34 ?? null,
        pull35: priorGithub?.pull35 ?? null,
        deployment: priorDeployment ?? unavailableDeployment,
        sourceFreshness,
        githubObservedAt: priorGithub?.observedAt ?? null,
        deploymentObservedAt: null,
        contradictions
      }
    },
    readiness: { ...heldReadiness, liveGithubOverlayStatus: sourceFreshness },
    github: priorGithub,
    deployment: priorDeployment,
    attestation: null,
    requestObservedAt: previous.requestObservedAt,
    contradictions,
    error
  };
}

const statusLabel = (status: TreeStatus) => status.replace("provider-degraded", "provider degraded");
function StatusBadge({ status }: { status: TreeStatus }) {
  return <span className="status-badge" data-status={status}><span aria-hidden="true" />{statusLabel(status)}</span>;
}

function RecordCards({ records, empty = "No current canonical record." }: { records: TreeRecord[]; empty?: string }) {
  if (records.length === 0) return <p className="empty-state">{empty}</p>;
  return (
    <div className="record-grid">
      {records.map((record) => (
        <article className="record-card" key={record.recordId}>
          <div className="record-heading"><h3>{record.title}</h3><StatusBadge status={record.status} /></div>
          <p>{record.summary}</p>
          <dl>
            {record.details.map((item) => <div key={item.key}><dt>{item.key.replace(/([A-Z])/gu, " $1")}</dt><dd>{item.value}</dd></div>)}
          </dl>
          <p className="source-footnote">{record.sourceRefs.length} source anchor{record.sourceRefs.length === 1 ? "" : "s"} · {record.sourceRefs.some(({ freshness }) => freshness !== "current") ? "freshness qualified" : "current at observation"}</p>
        </article>
      ))}
    </div>
  );
}

function readinessIsReady(key: string, value: unknown): boolean {
  if (["applicationSourceValidated", "treeProgramBaselineLoaded", "treePreviewRuntimeObserved"].includes(key)) return value === true;
  if (["runtimeDeploymentIdentityStatus", "buildPayloadAttestationStatus"].includes(key)) return value === "verified";
  if (key === "liveGithubOverlayStatus") return value === "current";
  if (key === "ownerConsoleGroundingRequired") return value === true;
  if (["privateOwnerAuthenticationConfigured", "durablePrivateStorageConfigured", "realParticipantRuntimeConfigured", "realProviderExecutionConfigured", "productionAuthorized"].includes(key)) return value === false;
  return false;
}

function BranchTable({ branches }: { branches: TreeBranch[] }) {
  const regionRef = useRef<HTMLDivElement>(null);
  const [isScrollable, setIsScrollable] = useState(false);

  useEffect(() => {
    const region = regionRef.current;
    if (!region) return;
    const updateScrollableState = () => {
      const next = region.scrollWidth > region.clientWidth;
      setIsScrollable((current) => current === next ? current : next);
    };
    updateScrollableState();
    const observer = new ResizeObserver(updateScrollableState);
    observer.observe(region);
    const table = region.querySelector("table");
    if (table) observer.observe(table);
    return () => observer.disconnect();
  }, [branches]);

  return (
    <div ref={regionRef} className="branch-table-wrap" role="region" aria-label="Canonical public-sanitized branch table" tabIndex={isScrollable ? 0 : undefined}>
      <table className="branch-table">
        <caption>Canonical public-sanitized branch readback</caption>
        <thead><tr><th>Branch</th><th>Home</th><th>Health</th><th>Trajectory</th><th>Freshness</th><th>Next gate</th></tr></thead>
        <tbody>
          {branches.map((branch) => (
            <tr key={branch.branchId}>
              <th scope="row"><strong>{branch.title}</strong><span>{branch.family}</span></th>
              <td><code>{branch.canonicalHome}</code></td>
              <td><StatusBadge status={branch.currentHealth} /></td>
              <td>{branch.trajectory}</td>
              <td>{branch.sourceFreshness}</td>
              <td>{branch.nextGate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LaunchSessionView() {
  const [transcript, setTranscript] = useState("");
  const progress = [
    { id: "source", label: "Source candidate", state: "current" as const, detail: "Original Action 006 identity and Stack B integration identity remain separate." },
    { id: "understanding", label: "Understanding Check", state: "proposed" as const, detail: "Synthetic owner input is editable and hash-visible." },
    { id: "context", label: "Context Pack", state: "proposed" as const, detail: "Public-sanitized Tree Program records only." },
    { id: "impact", label: "Impact Scan", state: "hold" as const, detail: "Merge, production, private data and spending remain outside this campaign." },
    { id: "preview", label: "Target-null preview", state: "proposed" as const, detail: "One preview only after exact source and browser gates." }
  ];
  return (
    <div className="session-grid">
      <section className="command-panel"><div className="section-heading"><div><p className="card-kicker">Launch Studio session</p><h2>Exact reviewed transcript</h2></div><span className="safety-label">Synthetic persistence</span></div><TranscriptEditor value={transcript} onChange={setTranscript} /></section>
      <section className="command-panel"><div className="section-heading"><div><p className="card-kicker">Evidence timeline</p><h2>Separate gates stay separate</h2></div></div><ProgressTimeline items={progress} /></section>
      <section className="command-panel"><div className="section-heading"><div><p className="card-kicker">Decision rails</p><h2>Authority never inherits</h2></div></div><div className="rails"><DecisionRail title="Preview acceptance" description="Requires exact browser evidence." state="pending" /><DecisionRail title="Merge approval" description="Not authorized in this campaign." state="unavailable" /><DecisionRail title="Production approval" description="Independently reviewed gate required." state="hold" /></div></section>
      <section className="command-panel"><div className="section-heading"><div><p className="card-kicker">Preview boundary</p><h2>Target null only</h2></div></div><PreviewPane /></section>
    </div>
  );
}

export function TreeCommandCenter({ snapshot }: { snapshot: TreeProgramSnapshot }) {
  const [activeView, setActiveView] = useState<View>("Today");
  const [liveTruth, setLiveTruth] = useState<LiveTruthState>(initialLiveTruth);
  const heldBranches = useMemo(() => snapshot.branches.filter(({ currentHealth }) => currentHealth === "hold" || currentHealth === "blocked"), [snapshot.branches]);
  const advancingBranches = useMemo(() => snapshot.branches.filter(({ trajectory }) => trajectory === "advancing"), [snapshot.branches]);
  const immutableBaselineObservedAt = baselineObservationTime(snapshot);
  const immutableBaselineLabel = `immutable baseline / observed ${immutableBaselineObservedAt.replace(".000Z", "Z")}`;
  const reconciliationCause = liveTruth.contradictions.length === 0
    ? "none"
    : `contradictions ${[...liveTruth.contradictions].sort().join(",")}`;
  const currentEvidenceAnnouncement = liveTruth.github
    ? `phase ${liveTruth.phase} / ${liveTruth.github.status} / ${liveTruth.github.evidenceCompleteness} / ${liveTruth.github.freshness} / cause ${liveTruth.error ?? liveTruth.github.errorCode ?? reconciliationCause}`
    : `phase ${liveTruth.phase} / unavailable / none / unavailable / cause ${liveTruth.error ?? "live-readback-loading"}`;

  useEffect(() => {
    let active = true;
    let generation = 0;
    let settledGeneration = 0;
    let controller: AbortController | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let backgrounded = document.visibilityState === "hidden";

    const clearRefreshTimer = () => {
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      refreshTimer = null;
    };

    const scheduleRefresh = (currentObservation: { sourceObservedAt: string; requestObservedAt: string } | null) => {
      clearRefreshTimer();
      if (!active) return;
      const now = Date.now();
      const controllingObservedAt = currentObservation === null
        ? null
        : Math.min(Date.parse(currentObservation.sourceObservedAt), Date.parse(currentObservation.requestObservedAt));
      const nextRefresh = controllingObservedAt === null
        ? now + CLIENT_FAILURE_RETRY_MS
        : Math.min(now + CLIENT_REFRESH_INTERVAL_MS, controllingObservedAt + GITHUB_REVALIDATE_SECONDS * 1_000);
      const delay = Math.max(1, nextRefresh - now);
      refreshTimer = setTimeout(() => requestRefresh(), delay);
    };

    async function loadLiveTruth(requestGeneration: number, signal: AbortSignal): Promise<{
      currentObservation: { sourceObservedAt: string; requestObservedAt: string } | null;
      abortPendingRequests: boolean;
    }> {
      let networkReadsPending = false;
      try {
        const requestOptions = { cache: "no-store" as const, credentials: "same-origin" as const, redirect: "error" as const, headers: { Accept: "application/json" }, signal };
        networkReadsPending = true;
        const [treeResponse, provenanceResponse] = await Promise.all([
          fetch("/api/tree", requestOptions),
          fetch("/api/provenance", requestOptions)
        ]);
        const [treePayload, provenancePayload] = await Promise.all([
          responseJson(treeResponse, "/api/tree", signal),
          responseJson(provenanceResponse, "/api/provenance", signal)
        ]);
        networkReadsPending = false;
        if (!isRecord(provenancePayload) || !hasExactKeys(provenancePayload, ["schemaVersion", "provenance", "authority"]) || provenancePayload.schemaVersion !== "clover-tree-provenance-readback-v0.2" || !isRecord(provenancePayload.provenance)) throw new Error("provenance-readback-structure");
        assertReadOnlyAuthority(provenancePayload.authority);
        const build = parseBuildProvenance(provenancePayload.provenance);
        const readback = asLiveReadback(treePayload, snapshot, Date.now(), build.commit);

        let attestationCandidate: unknown = null;
        networkReadsPending = true;
        try {
          const attestationResponse = await fetch("/__clover/deployment-attestation.json", requestOptions);
          if (attestationResponse.ok) attestationCandidate = await responseJson(attestationResponse, "/__clover/deployment-attestation.json", signal);
        } catch {
          attestationCandidate = null;
        } finally {
          networkReadsPending = false;
        }
        const attestation = await compareDeploymentAttestation(build, attestationCandidate);
        const reconciliation = reconcileTreeTruth({ baseline: snapshot, build, github: readback.github, deployment: readback.deployment, attestation });
        const currentSourceObservedAt = readback.github.status === "current" && readback.github.freshness === "current" ? readback.github.observedAt : null;
        const finalObservationTime = Date.now();
        if (currentSourceObservedAt !== null && (
          finalObservationTime - Date.parse(currentSourceObservedAt) >= GITHUB_REVALIDATE_SECONDS * 1_000 ||
          finalObservationTime - Date.parse(readback.requestObservedAt) >= GITHUB_REVALIDATE_SECONDS * 1_000
        )) throw new Error("live-readback-source-expired");
        if (active && requestGeneration === generation && !signal.aborted) {
          settledGeneration = requestGeneration;
          setLiveTruth({
            phase: "observed",
            action: reconciliation.currentActionCard,
            readiness: reconciliation.readiness,
            github: readback.github,
            deployment: readback.deployment,
            attestation,
            requestObservedAt: readback.requestObservedAt,
            contradictions: reconciliation.contradictions.value,
            error: null
          });
          return {
            currentObservation: currentSourceObservedAt === null || reconciliation.currentActionCard.status !== "available"
              ? null
              : { sourceObservedAt: currentSourceObservedAt, requestObservedAt: readback.requestObservedAt },
            abortPendingRequests: false
          };
        }
      } catch (error) {
        if (active && requestGeneration === generation && !signal.aborted) {
          if (!networkReadsPending) settledGeneration = requestGeneration;
          const message = error instanceof Error ? error.message : "live-readback-unavailable";
          setLiveTruth((current) => staleLiveTruth(current, "unavailable", message));
        }
      }
      return { currentObservation: null, abortPendingRequests: networkReadsPending && !signal.aborted };
    }

    function requestRefresh() {
      if (!active) return;
      clearRefreshTimer();
      if (timeout !== null) clearTimeout(timeout);
      timeout = null;
      if (controller !== null && settledGeneration !== generation) controller.abort();
      const requestGeneration = generation + 1;
      generation = requestGeneration;
      const requestController = new AbortController();
      controller = requestController;
      timeout = setTimeout(() => {
        requestController.abort();
        if (active && generation === requestGeneration && controller === requestController) {
          timeout = null;
          controller = null;
          setLiveTruth((current) => staleLiveTruth(current, "unavailable", "live-readback-timeout"));
          scheduleRefresh(null);
        }
      }, CLIENT_READBACK_TIMEOUT_MS);
      setLiveTruth((current) => staleLiveTruth(current, current.github ? "refreshing" : "loading", null));
      void loadLiveTruth(requestGeneration, requestController.signal).then(({ currentObservation, abortPendingRequests }) => {
        if (!active || generation !== requestGeneration || controller !== requestController) return;
        if (timeout !== null) clearTimeout(timeout);
        timeout = null;
        if (abortPendingRequests) requestController.abort();
        controller = null;
        scheduleRefresh(currentObservation);
      });
    }

    const markBackgrounded = () => { backgrounded = true; };
    const refreshAfterBackground = () => {
      if (!backgrounded || document.visibilityState === "hidden") return;
      backgrounded = false;
      requestRefresh();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") markBackgrounded();
      else refreshAfterBackground();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", markBackgrounded);
    window.addEventListener("focus", refreshAfterBackground);
    requestRefresh();
    return () => {
      active = false;
      const cleanupGeneration = generation;
      generation += 1;
      clearRefreshTimer();
      if (timeout !== null) clearTimeout(timeout);
      if (controller !== null && settledGeneration !== cleanupGeneration) controller.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", markBackgrounded);
      window.removeEventListener("focus", refreshAfterBackground);
    };
  }, [snapshot]);

  let content;
  if (activeView === "Today") {
    content = (
      <div className="dashboard-grid">
        <section className="command-panel hero-panel">
          <p className="card-kicker">Today · one owner decision</p>
          <h2>{liveTruth.action.action}</h2><p>{liveTruth.action.reason}</p>
          <div className="hero-actions"><button type="button" onClick={() => setActiveView("Action Center")}>Open Action Center</button><button className="secondary-button" type="button" onClick={() => setActiveView("Tree")}>See the whole Tree</button></div>
          <p className="authority-note">This current Action Card grants no merge, production, private-data, messaging, payment, purchase or spending authority.</p>
          <dl className="observation-grid today-observations"><div><dt>Immutable baseline</dt><dd>{immutableBaselineLabel}</dd></div><div><dt>GitHub observation time</dt><dd>{liveTruth.github?.observedAt ?? "unavailable"}</dd></div><div><dt>Request time</dt><dd>{liveTruth.requestObservedAt ?? "unavailable"}</dd></div><div><dt>Source freshness</dt><dd>{liveTruth.github?.freshness ?? "unavailable"}</dd></div><div><dt>Contradictions</dt><dd>{liveTruth.contradictions.length ? liveTruth.contradictions.join(", ") : "none"}</dd></div><div><dt>Owner Console / Clover</dt><dd>external refresh required</dd></div><div><dt>GitHub evidence</dt><dd>{liveTruth.github ? `${liveTruth.github.status} / ${liveTruth.github.evidenceCompleteness} / missing ${liveTruth.github.missingEvidence.join(", ") || "none"}` : "unavailable"}</dd></div></dl>
        </section>
        <section className="command-panel pulse-panel">
          <div className="section-heading"><div><p className="card-kicker">Tree pulse</p><h2>Source-bound, not scored</h2></div></div>
          <div className="pulse-grid"><div><strong>{snapshot.branches.length}</strong><span>branches represented</span></div><div><strong>{advancingBranches.length}</strong><span>advancing</span></div><div><strong>{heldBranches.length}</strong><span>held / blocked</span></div><div><strong>{snapshot.relationships.length}</strong><span>typed relationships</span></div></div>
        </section>
        <section className="command-panel span-two"><div className="section-heading"><div><p className="card-kicker">{immutableBaselineLabel}</p><h2>Dated historical milestone evidence</h2></div></div><RecordCards records={snapshot.milestones} /></section>
      </div>
    );
  } else if (activeView === "Tree") {
    content = <section className="command-panel full-bleed-panel"><div className="section-heading"><div><p className="card-kicker">Program graph</p><h2>The Clover Tree</h2><p>Roots feed the trunk; bark protects it; branches carry governed work; fruit separates forecasts from observations.</p></div></div><TreeMap branches={snapshot.branches} relationships={snapshot.relationships} /></section>;
  } else if (activeView === "Master Plan") {
    content = <section className="command-panel"><div className="section-heading"><div><p className="card-kicker">Master Plan</p><h2>Converge without collapsing boundaries</h2></div></div><RecordCards records={snapshot.masterPlan} /></section>;
  } else if (activeView === "Branches") {
    content = <section className="command-panel full-bleed-panel"><div className="section-heading"><div><p className="card-kicker">Branches</p><h2>Exact homes, health and next gates</h2></div></div><BranchTable branches={snapshot.branches} /></section>;
  } else if (activeView === "Roots and Source Coverage") {
    const roots = snapshot.branches.filter(({ family }) => family === "root" || family === "trunk");
    content = <div className="dashboard-grid"><section className="command-panel"><div className="section-heading"><div><p className="card-kicker">Roots</p><h2>What the Tree can know</h2></div></div>{roots.map((branch) => <article className="root-card" key={branch.branchId}><h3>{branch.title}</h3><p>{branch.purpose}</p><StatusBadge status={branch.currentHealth} /></article>)}</section><section className="command-panel span-two"><div className="section-heading"><div><p className="card-kicker">Source coverage</p><h2>Unavailable never becomes complete</h2></div></div><RecordCards records={snapshot.sourceCoverage} /></section></div>;
  } else if (activeView === "Captain's Log") {
    content = <section className="command-panel"><div className="section-heading"><div><p className="card-kicker">Captain&apos;s Log</p><h2>Append-only owner observation references</h2><p>Public references only; raw private text stays out of Core.</p></div></div><RecordCards records={[...snapshot.captainLog, ...snapshot.progress]} /></section>;
  } else if (activeView === "Fruit Ledger") {
    content = <div className="fruit-columns"><section className="command-panel forecast-panel"><div className="section-heading"><div><p className="card-kicker">Predicted fruit</p><h2>Forecasts</h2></div></div><RecordCards records={snapshot.fruitForecasts} /></section><section className="command-panel observation-panel"><div className="section-heading"><div><p className="card-kicker">Observed fruit</p><h2>Actual readback</h2></div></div><RecordCards records={snapshot.fruitObservations} /></section></div>;
  } else if (activeView === "Collaboration and JV Center") {
    content = <div className="prototype-grid"><CollaborationCenter /><PersonalLaunchPod /></div>;
  } else if (activeView === "Action Center") {
    content = <div className="action-center"><OwnerInputPanel branches={snapshot.branches} /><section className="command-panel"><div className="section-heading"><div><p className="card-kicker">All supported targets</p><h2>Launch packets, never hidden authority</h2></div></div><ActionPacketPanel /></section></div>;
  } else if (activeView === "System Health") {
    content = <div className="dashboard-grid"><section className="command-panel span-two live-truth-panel"><div className="section-heading"><div><p className="card-kicker">Reconciled current status</p><h2>Readiness stays multidimensional</h2><p>Request time is displayed separately and never upgrades source freshness.</p><p>Partial facts remain visible but always hold. Build payload attestation excludes its static attestation file; final deployed-byte verification requires the external provider receipt.</p></div><StatusBadge status={liveTruth.action.status === "available" ? "current" : "hold"} /></div><div className="readiness-grid">{Object.entries(liveTruth.readiness).map(([key, value]) => <div key={key}><span>{key.replace(/([A-Z])/gu, " $1")}</span><strong data-readiness={readinessIsReady(key, value) ? "ready" : "hold"}>{String(value)}</strong></div>)}</div><dl className="observation-grid"><div><dt>Immutable baseline</dt><dd>{immutableBaselineLabel}</dd></div><div><dt>GitHub observation time</dt><dd>{liveTruth.github?.observedAt ?? "unavailable"}</dd></div><div><dt>Source freshness</dt><dd>{liveTruth.github?.freshness ?? "unavailable"}</dd></div><div><dt>Deployment self</dt><dd>{liveTruth.deployment?.status ?? "unavailable"} / {liveTruth.deployment?.freshness ?? "unavailable"}</dd></div><div><dt>Build payload attestation</dt><dd>{liveTruth.attestation?.status ?? "unavailable"}</dd></div><div><dt>Request observed</dt><dd>{liveTruth.requestObservedAt ?? "unavailable"}</dd></div><div><dt>Contradictions</dt><dd>{liveTruth.contradictions.length ? liveTruth.contradictions.join(", ") : "none"}</dd></div><div><dt>Owner Console / Clover</dt><dd>external-owner-console-required · no Clover connector was invoked by the web runtime</dd></div><div><dt>Readback phase</dt><dd>{liveTruth.phase}{liveTruth.error ? ` · ${liveTruth.error}` : ""}</dd></div><div><dt>GitHub evidence</dt><dd>{liveTruth.github?.status ?? "unavailable"} / {liveTruth.github?.evidenceCompleteness ?? "none"}</dd></div><div><dt>Candidate SHA</dt><dd>{liveTruth.github?.candidateSha ?? "unavailable"}</dd></div><div><dt>Exact-head checks</dt><dd>{liveTruth.github?.exactHeadCheckStatus ?? "unavailable"} / pages {liveTruth.github?.checkPagesObserved ?? 0}</dd></div><div><dt>Observation cause</dt><dd>{liveTruth.github?.errorCode ?? "none"}</dd></div><div><dt>Observation failures</dt><dd>{liveTruth.github?.failures.length ? liveTruth.github.failures.join(", ") : "none"}</dd></div><div><dt>Missing evidence</dt><dd>{liveTruth.github?.missingEvidence.length ? liveTruth.github.missingEvidence.join(", ") : "none"}</dd></div><div><dt>Verified repository</dt><dd>{liveTruth.github?.repository ? `${liveTruth.github.repository.fullName} / ${liveTruth.github.repository.defaultBranch}` : "unavailable"}</dd></div><div><dt>Verified protected main</dt><dd>{liveTruth.github?.main ? `${liveTruth.github.main.sha} / ${liveTruth.github.main.tree ?? "tree-unavailable"} / protected=${String(liveTruth.github.main.protected)}` : "unavailable"}</dd></div><div><dt>Verified PR #35</dt><dd>{liveTruth.github?.pull35 ? `${liveTruth.github.pull35.headSha} → ${liveTruth.github.pull35.baseSha} / ${liveTruth.github.pull35.state}` : "unavailable"}</dd></div><div><dt>Verified ruleset</dt><dd>{liveTruth.github?.ruleset ? `${liveTruth.github.ruleset.id} / ${liveTruth.github.ruleset.bypassActorsStatus}` : "unavailable"}</dd></div><div><dt>Final deployment-input bytes</dt><dd>external provider receipt required · unavailable to runtime</dd></div></dl></section><section className="command-panel"><div className="section-heading"><div><p className="card-kicker">{immutableBaselineLabel}</p><h2>Historical canonical status</h2></div></div><RecordCards records={snapshot.status} /></section><section className="command-panel span-two"><div className="section-heading"><div><p className="card-kicker">Provider evidence</p><h2>Degraded is not failed</h2></div></div><RecordCards records={snapshot.providerStatus} /></section></div>;
  } else {
    content = <LaunchSessionView />;
  }

  return (
    <div className="tree-command-center">
      <aside className="command-sidebar">
        <div className="tree-mark"><span className="tree-mark-leaf" aria-hidden="true">⌁</span><div><strong>Clover</strong><span>Tree Command Center</span></div></div>
        <nav aria-label="Command Center views"><ul>{views.map((view) => <li key={view}><button type="button" aria-current={activeView === view ? "page" : undefined} onClick={() => setActiveView(view)}><span aria-hidden="true">{String(views.indexOf(view) + 1).padStart(2, "0")}</span>{view}</button></li>)}</ul></nav>
        <div className="sidebar-boundary"><span className="status-dot" />Preview 0.1<p>Public-sanitized synthetic data. Target null. No production authority.</p></div>
      </aside>
      <main className="command-main" id="main-content">
        <header className="command-header">
          <div><p className="eyebrow">Owner command center · preview-only candidate</p><h1>{activeView}</h1></div>
          <div className="source-readback" role="group" aria-label="Source readback">
            <div><span>Canonical source</span><strong>{snapshot.index.indexId}</strong></div>
            <div><span>Immutable baseline</span><strong>{immutableBaselineLabel}</strong></div>
            <div><span>GitHub observed</span><strong>{liveTruth.github?.observedAt ?? "unavailable"}</strong></div>
            <div><span>Deployment self</span><strong>{liveTruth.deployment?.status ?? "unavailable"}</strong></div>
            <div role="status" aria-live="polite" aria-atomic="true" style={{ gridColumn: "1 / -1" }}><span>Current Action Card</span><strong>{liveTruth.action.action}</strong><span>{liveTruth.action.reason} · evidence {currentEvidenceAnnouncement}</span></div>
          </div>
        </header>
        <div className="command-content">{content}</div>
        <footer className="command-footer"><span>Index {snapshot.index.indexHash.slice(0, 12)}…</span><span>Private data accessed: {String(snapshot.index.privateDataAccessed)}</span><span>Durable private storage: not claimed</span></footer>
      </main>
    </div>
  );
}
